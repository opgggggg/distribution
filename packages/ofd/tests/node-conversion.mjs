import { OFD_ARTIFACT_PLUGINS } from "../dist/office.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readOfdDocument, convertDocument, exportDocument, writeImageOfd } from "../dist/index.js";
import { convertDocumentNode } from "../dist/node.js";
import { ofd } from "./fixtures.mjs";
import { PDFDocument } from "pdf-lib";
test("OFD to PNG/JPEG/PDF uses actual rendered pages", async () => {
	for (const format of ["png", "jpeg", "pdf"]) {
		const result = await convertDocumentNode(ofd(), "ofd", format, { scale: 0.5 });
		assert.equal(result.files.length, format === "pdf" ? 1 : 2);
		const bytes = new Uint8Array(await result.files[0].blob.arrayBuffer());
		if (format === "pdf") {
			const pdf = await PDFDocument.load(bytes);
			assert.equal(pdf.getPageCount(), 2);
		} else assert.equal(bytes[0], format === "png" ? 137 : 255);
	}
});
test("PDF → OFD page selection and dimensions", async () => {
	const pdf = await PDFDocument.create();
	pdf.addPage([300, 200]);
	pdf.addPage([400, 500]);
	const result = await convertDocumentNode(new Blob([await pdf.save()]), "pdf", "ofd", {
		page: 1,
		scale: 0.5,
	});
	const doc = await readOfdDocument(result.files[0].blob);
	assert.equal(doc.pages.length, 1);
	assert.ok(Math.abs(doc.pages[0].width - (400 * 96) / 72) < 0.01);
});
test("native registry accepts JPEG extension aliases and MIME-only inputs", async () => {
	const { createOfdNodeConverters } = await import("../dist/office-node.js");
	const { ArtifactConversionRegistry } = await import("@yaochn/als-office-editor-core");
	const registry = new ArtifactConversionRegistry(createOfdNodeConverters(), {
		environment: "headless",
	});
	const jpeg = (await convertDocumentNode(ofd(), "ofd", "jpeg", { page: 0, scale: 0.5 })).files[0]
		.blob;
	for (const metadata of [{ fileName: "image.jpeg" }, { mimeType: "image/jpeg" }]) {
		const result = await registry.convert({ kind: "bytes", blob: jpeg, ...metadata }, "ofd");
		assert.equal((await readOfdDocument(result)).pages.length, 1);
	}
});

test("rendered pixels preserve inherited fill, clipping and composite placement", async () => {
	const { createCanvas, loadImage } = await import("@napi-rs/canvas");
	const ns = 'xmlns:ofd="http://www.ofdspec.org/2016"';
	const source = ofd("test", {
		"Doc/Pages/1.xml": `<ofd:Page ${ns}><ofd:Area><ofd:PhysicalBox>0 0 30 20</ofd:PhysicalBox></ofd:Area><ofd:PageRes>Res.xml</ofd:PageRes><ofd:Content><ofd:Layer ID="1" DrawParam="7"><ofd:PathObject ID="2" Boundary="0 0 20 20" Fill="true" Stroke="false"><ofd:AbbreviatedData>M 0 0 L 20 0 L 20 20 L 0 20 C</ofd:AbbreviatedData><ofd:Clips><ofd:Clip><ofd:Area><ofd:Path Fill="true" Stroke="false"><ofd:AbbreviatedData>M 0 0 L 10 0 L 10 20 L 0 20 C</ofd:AbbreviatedData></ofd:Path></ofd:Area></ofd:Clip></ofd:Clips></ofd:PathObject><ofd:CompositeObject ID="3" ResourceID="8" Boundary="20 0 10 10"/></ofd:Layer></ofd:Content></ofd:Page>`,
		"Doc/Pages/Res.xml": `<ofd:Res ${ns}><ofd:DrawParams><ofd:DrawParam ID="7"><ofd:FillColor Value="255 0 0"/></ofd:DrawParam></ofd:DrawParams><ofd:CompositeGraphicUnits><ofd:CompositeGraphicUnit ID="8" Width="10" Height="10"><ofd:Content><ofd:PathObject ID="4" Boundary="0 0 10 10" Fill="true" Stroke="false"><ofd:FillColor Value="0 0 255"/><ofd:AbbreviatedData>M 0 0 L 10 0 L 10 10 L 0 10 C</ofd:AbbreviatedData></ofd:PathObject></ofd:Content></ofd:CompositeGraphicUnit></ofd:CompositeGraphicUnits></ofd:Res>`,
	});
	const result = await convertDocumentNode(source, "ofd", "png", { page: 0, scale: 1 });
	const image = await loadImage(Buffer.from(await result.files[0].blob.arrayBuffer()));
	const canvas = createCanvas(image.width, image.height),
		ctx = canvas.getContext("2d");
	ctx.drawImage(image, 0, 0);
	const pixel = (x, y) => [
		...ctx.getImageData(Math.round((x * 96) / 25.4), Math.round((y * 96) / 25.4), 1, 1).data,
	];
	assert.deepEqual(pixel(5, 5), [255, 0, 0, 255]);
	assert.deepEqual(pixel(15, 5), [255, 255, 255, 255]);
	assert.deepEqual(pixel(25, 5), [0, 0, 255, 255]);
});

test("image conversion validates page selection and raster settings", async () => {
	const png = (await convertDocumentNode(ofd(), "ofd", "png", { page: 0, scale: 0.2 })).files[0]
		.blob;
	await assert.rejects(convertDocumentNode(png, "png", "ofd", { page: 1 }), /index/);
	await assert.rejects(convertDocumentNode(ofd(), "ofd", "jpeg", { quality: 2 }), /quality/);
	const { createOfdNodeConverters } = await import("../dist/office-node.js");
	const converter = createOfdNodeConverters().find((entry) => entry.manifest.id === "ofd-to-png");
	await assert.rejects(
		converter.convert({ kind: "bytes", blob: ofd() }, { options: { scale: 0 } }),
		/scale/,
	);
});

test("embedded font outlines render concurrently without global font state", async () => {
	const { readFile } = await import("node:fs/promises");
	const { GlobalFonts } = await import("@napi-rs/canvas");
	const font = await readFile(
		new URL(
			"../../standard_fonts/LiberationSans-Regular.ttf",
			import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"),
		),
	);
	const ns = 'xmlns:ofd="http://www.ofdspec.org/2016"';
	const source = ofd("FONT", {
		"Doc/Pages/1.xml": `<ofd:Page ${ns}><ofd:PageRes>Res.xml</ofd:PageRes><ofd:Content><ofd:Layer><ofd:TextObject ID="1" Font="99" Boundary="0 0 40 20" Size="4"><ofd:TextCode X="0" Y="4" DeltaX="4 4 4">FONT</ofd:TextCode></ofd:TextObject></ofd:Layer></ofd:Content></ofd:Page>`,
		"Doc/Pages/Res.xml": `<ofd:Res ${ns}><ofd:Fonts><ofd:Font ID="99" FontName="EmbeddedTest"><ofd:FontFile>Font.ttf</ofd:FontFile></ofd:Font></ofd:Fonts></ofd:Res>`,
		"Doc/Pages/Font.ttf": font,
	});
	const before = GlobalFonts.families
		.filter((entry) => entry.family.startsWith("ofd-font-"))
		.map((entry) => entry.family);
	const results = await Promise.all(
		[0, 1].map(() => convertDocumentNode(source, "ofd", "png", { page: 0, scale: 0.5 })),
	);
	for (const result of results) {
		assert.ok(result.files[0].blob.size > 100);
		assert.ok(
			!result.diagnostics.some(
				(entry) => entry.code === "ofd-font" || entry.code === "ofd-font-fallback",
			),
		);
	}
	assert.deepEqual(
		GlobalFonts.families
			.filter((entry) => entry.family.startsWith("ofd-font-"))
			.map((entry) => entry.family),
		before,
	);
});
