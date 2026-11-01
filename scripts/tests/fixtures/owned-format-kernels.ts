import { verifyMobilePdf } from "./mobile-pdf-kernels";
import { createTextBuffer } from "@cubexp/text";
import { openEpub } from "@cubexp/epub";
import { FormatsKernel, loadFormatsKernel, searchText } from "@cubexp/kernels";
import { writeOfdImages, writeOfdDocx } from "@cubexp/kernels/sync";
import { signOfdDocument, verifyOfdSignatures } from "../../../packages/ofd/dist/signatures.js";
import { zipSync, strToU8, unzipSync, strFromU8, unzlibSync } from "fflate";
import { readOfdDocument } from "../../../packages/ofd/dist/read.js";
import { openOfdPackage } from "../../../packages/ofd/dist/package.js";
import { decodeBmp, decodeTiff } from "../../../packages/ofd/dist/codecs.js";
import codecFixtures from "../../../packages/ofd/tests/fixtures/rust-codecs.json";
import tiffDocuments from "../../../packages/ofd/tests/fixtures/rust-tiff-pages.json";
import { readImagePreview, decodeImage } from "../../../apps/harmony/web/src/mobile/image-document";
export async function verifyOwnedFormats() {
	// Exercise the synchronous public contract before the asynchronous formats module loads.
	const coldImage = writeOfdImages(
		[{ bytes: new Uint8Array([137, 80, 78, 71]), width: 320, height: 240 }],
		"fixed-id",
	);
	const coldWord = unzipSync(writeOfdDocx(["中文<&\n😀", "page two"]));
	if (!strFromU8(coldWord["word/document.xml"]).includes("中文&lt;&amp;"))
		throw Error("Rust DOCX writer mismatch");
	await loadFormatsKernel();
	const core = new FormatsKernel("text");
	if (core.open<{ kernel: string }>(new TextEncoder().encode("native")).kernel !== "rust")
		throw Error("Missing Rust authority");
	core.close();
	const text = await createTextBuffer("😀中\r\n");
	text.setText("😀水\r\n");
	let release!: () => void;
	let snapshot = "";
	const save = text.saveFile({
		deliver: async (blob) => {
			snapshot = await blob.text();
			await new Promise<void>((resolve) => {
				release = resolve;
			});
		},
	});
	while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
	text.setText("new edit");
	release();
	await save;
	if (snapshot !== "😀水\r\n" || !text.isDirty() || text.getText() !== "new edit")
		throw Error("Concurrent save lost edits");
	text.undo();
	if (text.getText() !== "😀水\r\n" || text.isDirty())
		throw Error("Rust history/save acknowledgement mismatch");
	text.redo();
	text.close();
	const bytes = zipSync({
		"META-INF/container.xml": strToU8(
			'<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>',
		),
		"OEBPS/book.opf": strToU8(
			'<package><metadata><title>中文 EPUB</title></metadata><manifest><item id="one" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/></spine></package>',
		),
		"OEBPS/chapter.xhtml": strToU8("<html><body>😀İ BIRD</body></html>"),
	});
	const book = await openEpub(bytes);
	if (
		book.metadata.title !== "中文 EPUB" ||
		book.spine.length !== 1 ||
		!book.readText(book.spine[0].href)?.includes("BIRD")
	)
		throw Error("Rust EPUB package/resource mismatch");
	if (JSON.stringify(searchText("😀İ BIRD", "bird")) !== JSON.stringify([{ from: 4, to: 8 }]))
		throw Error("Search coordinates changed");
	if (book.archive.source().length !== bytes.length) throw Error("Original EPUB bytes changed");
	book.archive.close();
	const imagePackage = await openOfdPackage(coldImage);
	if (imagePackage.read("Doc_0/Res/image_0.png").length !== 4)
		throw Error("Cold image writer mismatch");
	const ofdBytes = zipSync({
		"OFD.xml": strToU8("<OFD><DocBody><DocRoot>Doc/Document.xml</DocRoot></DocBody></OFD>"),
		"Doc/Document.xml": strToU8(
			'<Document><Pages><Page ID="1" BaseLoc="Page.xml"/></Pages></Document>',
		),
		"Doc/Page.xml": strToU8(
			'<Page><Content><Layer ID="1"><TextObject ID="2" Size="4" Boundary="0 0 30 10"><TextCode X="0" Y="4" DeltaX="g 4 4">Rust水</TextCode></TextObject><PathObject ID="3" Boundary="2 12 10 10" Fill="true" Stroke="false"><FillColor Value="255 0 0"/><AbbreviatedData>M 0 0 L 10 0 L 10 10 L 0 10 C</AbbreviatedData></PathObject></Layer></Content></Page>',
		),
	});
	const ofd = await openOfdPackage(ofdBytes);
	if (ofd.documents[0].pages[0].path !== "Doc/Page.xml")
		throw Error("Rust OFD metadata mismatch");
	const original = new Uint8Array(await ofd.write().arrayBuffer());
	if (original.length !== ofdBytes.length || original.some((v, i) => v !== ofdBytes[i]))
		throw Error("Untouched OFD bytes changed");
	ofd.set("Doc/extra.bin", new Uint8Array([0, 255, 3]));
	const reopened = await openOfdPackage(ofd.write());
	if (reopened.read("Doc/extra.bin").join(",") !== "0,255,3")
		throw Error("Rust binary OFD edit failed");
	const drawing = new FormatsKernel("ofd");
	try {
		drawing.open(ofdBytes);
		drawing.request({ op: "renderBegin" });
		drawing.setColorProvider(() => {
			throw Error("provider test failure");
		});
		let failed = false;
		try {
			drawing.request({ op: "render", options: { colorConverter: true } });
		} catch (error) {
			failed = String(error).includes("provider test failure");
		}
		if (!failed) throw Error("Missing provider error");
		drawing.setColorProvider(
			() =>
				new Proxy([0, 0, 0], {
					get(target, key) {
						if (key === "0") drawing.request({ op: "state" });
						return Reflect.get(target, key);
					},
				}),
		);
		let guarded = false;
		try {
			drawing.request({ op: "render", options: { colorConverter: true } });
		} catch (error) {
			guarded = String(error).includes("cannot re-enter");
		}
		if (!guarded) throw Error("Provider result accessors bypassed the reentry guard");
		drawing.setColorProvider(() => [255, 0, 128]);
		const document = drawing.request<{ pages: { svg: string }[]; text: string }>({
			op: "render",
			options: { colorConverter: true },
		});
		if (!document.text.includes("Rust水") || !document.pages[0].svg.includes("rgb(255,0,128)"))
			throw Error("Rust renderer/provider recovery mismatch");
		drawing.request({ op: "renderEnd" });
	} finally {
		drawing.close();
	}
	const rendered = await readOfdDocument(ofdBytes, { colorConverter: () => [255, 0, 128] });
	const url = URL.createObjectURL(new Blob([rendered.pages[0].svg], { type: "image/svg+xml" }));
	try {
		const image = new Image();
		image.src = url;
		await image.decode();
		const canvas = document.createElement("canvas");
		canvas.width = 160;
		canvas.height = 226;
		const context = canvas.getContext("2d")!;
		context.drawImage(image, 0, 0, 160, 226);
		if (Array.from(context.getImageData(5, 12, 1, 1).data).join(",") !== "255,0,128,255")
			throw Error("Browser SVG pixels changed");
	} finally {
		URL.revokeObjectURL(url);
	}
	for (const sample of codecFixtures.cases) {
		const input = Uint8Array.from(atob(sample.bytes), (c) => c.charCodeAt(0));
		const decode = sample.format === "BMP" ? decodeBmp : decodeTiff;
		let png: Uint8Array;
		try {
			png = await decode(input);
		} catch (error) {
			if ("error" in sample) continue;
			throw error;
		}
		if (!("expected" in sample)) throw Error(`Invalid raster accepted: ${sample.name}`);
		const view = new DataView(png.buffer, png.byteOffset, png.byteLength),
			parts: Uint8Array[] = [];
		for (let p = 8; p < png.length; ) {
			const length = view.getUint32(p);
			if (String.fromCharCode(...png.subarray(p + 4, p + 8)) === "IDAT")
				parts.push(png.subarray(p + 8, p + 8 + length));
			p += 12 + length;
		}
		const zipped = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
		let offset = 0;
		for (const part of parts) {
			zipped.set(part, offset);
			offset += part.length;
		}
		const raw = unzlibSync(zipped),
			expected = Uint8Array.from(atob(sample.expected.rgba), (c) => c.charCodeAt(0));
		const stride = sample.expected.width * 4;
		if (
			view.getUint32(16) !== sample.expected.width ||
			view.getUint32(20) !== sample.expected.height
		)
			throw Error(`Raster dimensions changed: ${sample.name}`);
		for (let y = 0; y < sample.expected.height; y++) {
			if (raw[y * (stride + 1)] !== 0) throw Error("Unexpected PNG row filter");
			for (let x = 0; x < stride; x++)
				if (
					Math.abs(raw[y * (stride + 1) + x + 1] - expected[y * stride + x]) >
					(sample.lossy ? 3 : 0)
				)
					throw Error(`Raster pixels changed: ${sample.name}`);
		}
	}
	for (const sample of tiffDocuments.cases) {
		const source = Uint8Array.from(atob(sample.bytes), (c) => c.charCodeAt(0));
		for (const page of [2, 0, 1, 2]) {
			const result = await readImagePreview(new Blob([source]), "sample.tiff", page);
			if (result.pages !== sample.pages.length) throw Error("TIFF pages were lost");
			const image = await decodeImage(result.blob),
				expected = sample.pages[page];
			if (image.naturalWidth !== expected.width || image.naturalHeight !== expected.height)
				throw Error("TIFF preview dimensions changed");
			const canvas = document.createElement("canvas");
			canvas.width = expected.width;
			canvas.height = expected.height;
			const context = canvas.getContext("2d")!;
			context.putImageData(
				new ImageData(
					Uint8ClampedArray.from(atob(expected.rgba), (c) => c.charCodeAt(0)),
					expected.width,
					expected.height,
				),
				0,
				0,
			);
			const pixels = context.getImageData(0, 0, expected.width, expected.height).data;
			context.clearRect(0, 0, expected.width, expected.height);
			context.drawImage(image, 0, 0);
			const actual = context.getImageData(0, 0, expected.width, expected.height).data;
			if (actual.some((value, i) => Math.abs(value - pixels[i]) > 1))
				throw Error("TIFF preview pixels changed");
		}
	}
	const signed = await signOfdDocument(ofdBytes, {
		signatureMethod: "test-SHA256",
		provider: { name: "Browser test" },
		signedAt: "2026-10-25T00:00:00Z",
		sign: async (descriptor) =>
			new Uint8Array(
				await crypto.subtle.digest("SHA-256", descriptor.slice().buffer as ArrayBuffer),
			),
	});
	const signatures = await verifyOfdSignatures(signed, {
		verifySignedValue: async (context) => ({
			valid: new Uint8Array(
				await crypto.subtle.digest(
					"SHA-256",
					context.descriptor.slice().buffer as ArrayBuffer,
				),
			).every((v, i) => v === context.signedValue[i]),
		}),
	});
	if (
		signatures.length !== 1 ||
		signatures[0].integrity !== "valid" ||
		signatures[0].cryptographicValidity !== "valid" ||
		signatures[0].trust !== "unknown"
	)
		throw Error("Rust signature/provider boundary mismatch");
	await verifyMobilePdf();
	return {
		kernel: "rust",
		text: true,
		epub: true,
		search: true,
		ofd: true,
		writers: true,
		signatures: true,
		render: true,
		codecs: true,
		tiffPages: true,
		mobilePdf: true,
	};
}
