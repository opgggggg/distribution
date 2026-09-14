import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import {
	readOfdDocument,
	openOfdPackage,
	signOfdDocument,
	verifyOfdSignatures,
} from "../dist/index.js";
import { convertDocumentNode } from "../dist/node.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ofd, archive } from "./fixtures.mjs";
const ns = 'xmlns:ofd="http://www.ofdspec.org/2016"';
function page(content, resources = "") {
	return `<ofd:Page ${ns}>${resources}<ofd:Area><ofd:PhysicalBox>0 0 30 20</ofd:PhysicalBox></ofd:Area><ofd:Content><ofd:Layer ID="10">${content}</ofd:Layer></ofd:Content></ofd:Page>`;
}
const square = (paint, extra = "") =>
	`<ofd:PathObject ID="11" Boundary="0 0 30 20" Fill="true" Stroke="false" ${extra}><ofd:FillColor>${paint}</ofd:FillColor><ofd:AbbreviatedData>M 0 0 L 30 0 L 30 20 L 0 20 C</ofd:AbbreviatedData></ofd:PathObject>`;
async function pixels(content, extra = {}) {
	const source = ofd("test", { "Doc/Pages/1.xml": page(content), ...extra });
	const result = await convertDocumentNode(source, "ofd", "png", { page: 0, scale: 1 });
	const image = await loadImage(Buffer.from(await result.files[0].blob.arrayBuffer())),
		canvas = createCanvas(image.width, image.height),
		ctx = canvas.getContext("2d");
	ctx.drawImage(image, 0, 0);
	return (x, y) => [
		...ctx.getImageData(Math.floor((x * 96) / 25.4), Math.floor((y * 96) / 25.4), 1, 1).data,
	];
}
const close = (actual, expected, tolerance = 12) =>
	actual.forEach((v, i) =>
		assert.ok(Math.abs(v - expected[i]) <= tolerance, `${actual} differs from ${expected}`),
	);
test("§8.3 axial gradients interpolate segments and honor extension bounds", async () => {
	const pixel = await pixels(
		square(
			'<ofd:AxialShd StartPoint="5 0" EndPoint="15 0"><ofd:Segment><ofd:Color Value="255 0 0"/></ofd:Segment><ofd:Segment><ofd:Color Value="0 0 255"/></ofd:Segment></ofd:AxialShd>',
		),
	);
	close(pixel(2, 5), [255, 255, 255, 255]);
	close(pixel(10, 5), [128, 0, 128, 255]);
	close(pixel(20, 5), [255, 255, 255, 255]);
});
test("§8.3 radial gradients interpolate concentric circles", async () => {
	const pixel = await pixels(
		square(
			'<ofd:RadialShd StartPoint="10 10" EndPoint="10 10" StartRadius="0" EndRadius="8" Extend="2"><ofd:Segment><ofd:Color Value="255 0 0"/></ofd:Segment><ofd:Segment><ofd:Color Value="0 0 255"/></ofd:Segment></ofd:RadialShd>',
		),
	);
	close(pixel(10, 10), [255, 0, 0, 255], 20);
	close(pixel(14, 10), [128, 0, 128, 255], 20);
	close(pixel(25, 10), [0, 0, 255, 255]);
});
test("§8.3 Gouraud interpolation uses triangle barycentric weights", async () => {
	const pixel = await pixels(
		square(
			'<ofd:GouraudShd><ofd:Point X="0" Y="0"><ofd:Color Value="255 0 0"/></ofd:Point><ofd:Point X="24" Y="0"><ofd:Color Value="0 255 0"/></ofd:Point><ofd:Point X="0" Y="18"><ofd:Color Value="0 0 255"/></ofd:Point></ofd:GouraudShd>',
		),
	);
	close(pixel(8, 6), [85, 85, 85, 255]);
	close(pixel(25, 15), [255, 255, 255, 255]);
});
test("§8.3 pattern cells repeat with their declared spacing", async () => {
	const paint =
		'<ofd:Pattern Width="4" Height="4" XStep="8" YStep="8"><ofd:CellContent><ofd:PathObject ID="12" Boundary="0 0 4 4" Fill="true" Stroke="false"><ofd:FillColor Value="255 0 0"/><ofd:AbbreviatedData>M 0 0 L 4 0 L 4 4 L 0 4 C</ofd:AbbreviatedData></ofd:PathObject></ofd:CellContent></ofd:Pattern>';
	const pixel = await pixels(square(paint));
	close(pixel(2, 2), [255, 0, 0, 255]);
	close(pixel(6, 2), [255, 255, 255, 255]);
	close(pixel(10, 10), [255, 0, 0, 255]);
});
test("§8.5 Boundary clips the transformed object", async () => {
	const pixel = await pixels(
		'<ofd:PathObject ID="11" Boundary="5 5 5 5" CTM="3 0 0 3 0 0" Fill="true" Stroke="false"><ofd:FillColor Value="255 0 0"/><ofd:AbbreviatedData>M 0 0 L 5 0 L 5 5 L 0 5 C</ofd:AbbreviatedData></ofd:PathObject>',
	);
	close(pixel(7, 7), [255, 0, 0, 255]);
	close(pixel(12, 7), [255, 255, 255, 255]);
});
test("§11 escaped text, character direction and explicit glyph IDs", async () => {
	const bytes = await readFile(
		new URL(
			"../../standard_fonts/LiberationSans-Regular.ttf",
			import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"),
		),
	);
	const content =
		'<ofd:TextObject ID="11" Font="2" Size="4" Boundary="0 0 20 20" CharDirection="90" HScale="0.5"><ofd:CGTransform CodePosition="0" CodeCount="2" GlyphCount="1"><ofd:Glyphs>36</ofd:Glyphs></ofd:CGTransform><ofd:TextCode X="4" Y="4" DeltaX="4 4">A\\0020B</ofd:TextCode></ofd:TextObject>';
	const doc = await readOfdDocument(
		ofd("test", {
			"Doc/Pages/1.xml": page(content, "<ofd:PageRes>Res.xml</ofd:PageRes>"),
			"Doc/Pages/Res.xml": `<ofd:Res ${ns}><ofd:Fonts><ofd:Font ID="2" FontName="Test"/></ofd:Fonts></ofd:Res>`,
		}),
		{ fonts: { 2: bytes } },
	);
	assert.equal(doc.pages[0].text, "A B");
	assert.match(doc.pages[0].svg, /rotate\(90\) scale\(0.5 1\)/);
	assert.match(doc.pages[0].svg, /<path [^>]*d="M/);
	assert.ok(!doc.diagnostics.some((d) => d.code === "ofd-glyphs"));
});
test("§14 action regions use XML path primitives", async () => {
	const action =
		'<ofd:Actions><ofd:Action Event="CLICK"><ofd:Region><ofd:Area Start="0 0"><ofd:Line Point1="5 0"/><ofd:QuadraticBezier Point1="6 2" Point2="5 5"/><ofd:Close/></ofd:Area></ofd:Region><ofd:Goto><ofd:Dest Type="XYZ" PageID="2" Left="0" Top="0" Zoom="1"/></ofd:Goto></ofd:Action></ofd:Actions>';
	const doc = await readOfdDocument(
		ofd("test", {
			"Doc/Pages/1.xml": page(
				square("").replace("</ofd:PathObject>", action + "</ofd:PathObject>"),
			),
		}),
	);
	assert.equal(doc.pages[0].hotspots[0].actions[0].type, "Goto");
	assert.match(doc.pages[0].hotspots[0].region, /Q 6 2 5 5/);
});
test("§6/16/17/20 untouched package parts and attachments survive editing", async () => {
	const source = ofd("original", {
		"Doc/extra.bin": new Uint8Array([0, 1, 2, 255]),
		"Doc/unknown.xml": `<extension:Custom xmlns:extension="urn:test">keep me</extension:Custom>`,
	});
	const pkg = await openOfdPackage(source);
	assert.deepEqual(await pkg.write().arrayBuffer(), await source.arrayBuffer());
	pkg.set("Doc/new.bin", new Uint8Array([42]));
	const edited = await openOfdPackage(pkg.write());
	assert.deepEqual(edited.read("Doc/extra.bin"), new Uint8Array([0, 1, 2, 255]));
	assert.equal(edited.readXml("Doc/unknown.xml").namespace, "urn:test");
	assert.deepEqual(edited.read("Doc/new.bin"), new Uint8Array([42]));
});
test("§18 digital signatures distinguish file integrity, cryptographic validity and trust", async () => {
	const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
	const signed = await signOfdDocument(ofd(), {
		signatureMethod: "1.2.840.113549.1.1.11",
		provider: { name: "Test" },
		signedAt: "2026-09-14T00:00:00Z",
		sign: async (bytes) => new Uint8Array(sign("sha256", bytes, privateKey)),
	});
	const options = {
		verifySignedValue: async (context) => ({
			valid: verify("sha256", context.descriptor, publicKey, context.signedValue),
			trusted: false,
		}),
	};
	const verified = (await verifyOfdSignatures(signed, options))[0];
	assert.equal(verified.integrity, "valid");
	assert.equal(verified.cryptographicValidity, "valid");
	assert.equal(verified.trust, "untrusted");
	const withoutProvider = (await verifyOfdSignatures(signed))[0];
	assert.equal(withoutProvider.cryptographicValidity, "unverified");
	const pkg = await openOfdPackage(signed);
	pkg.set("Doc/Pages/1.xml", page(""));
	assert.throws(() => pkg.write(), /signed|re-signing/);
	const tampered = (
		await verifyOfdSignatures(pkg.write({ allowInvalidSignatures: true }), options)
	)[0];
	assert.equal(tampered.integrity, "invalid");
});
test("§19 Current version and explicit version selections", async () => {
	const source = ofd("original", {
		"OFD.xml": `<ofd:OFD ${ns}><ofd:DocBody><ofd:DocRoot>Doc/Document.xml</ofd:DocRoot><ofd:Versions><ofd:Version ID="v1" Index="1" Current="true" BaseLoc="Versions/v1.xml"/><ofd:Version ID="v2" Index="2" BaseLoc="Versions/v2.xml"/></ofd:Versions></ofd:DocBody></ofd:OFD>`,
		"Versions/v1.xml": `<ofd:DocVersion ${ns} ID="v1"><ofd:FileList/><ofd:DocRoot>../Doc/Document.xml</ofd:DocRoot></ofd:DocVersion>`,
		"Versions/v2.xml": `<ofd:DocVersion ${ns} ID="v2"><ofd:FileList/><ofd:DocRoot>../Doc/Other.xml</ofd:DocRoot></ofd:DocVersion>`,
		"Doc/Other.xml": `<ofd:Document ${ns}><ofd:Pages><ofd:Page ID="2" BaseLoc="Pages/2.xml"/></ofd:Pages></ofd:Document>`,
	});
	assert.equal((await readOfdDocument(source)).pages.length, 2);
	assert.equal((await readOfdDocument(source, { version: "v2" })).pages.length, 1);
	await assert.rejects(readOfdDocument(source, { version: "missing" }), /version/);
});

test("§10 BMP and single-page TIFF decode to actual pixels", async () => {
	const { decodeBmp, decodeTiff } = await import("../dist/codecs.js");
	const { default: UTIF } = await import("utif");
	const bmp = new Uint8Array(58),
		view = new DataView(bmp.buffer);
	bmp.set([66, 77]);
	view.setUint32(2, 58, true);
	view.setUint32(10, 54, true);
	view.setUint32(14, 40, true);
	view.setInt32(18, 1, true);
	view.setInt32(22, 1, true);
	view.setUint16(26, 1, true);
	view.setUint16(28, 24, true);
	bmp.set([0, 0, 255, 0], 54);
	const tiff = new Uint8Array(UTIF.encodeImage(new Uint8Array([0, 255, 0, 255]).buffer, 1, 1));
	for (const [source, decode, expected] of [
		[bmp, decodeBmp, [255, 0, 0, 255]],
		[tiff, decodeTiff, [0, 255, 0, 255]],
	]) {
		const image = await loadImage(Buffer.from(decode(source))),
			canvas = createCanvas(1, 1);
		canvas.getContext("2d").drawImage(image, 0, 0);
		assert.deepEqual([...canvas.getContext("2d").getImageData(0, 0, 1, 1).data], expected);
	}
});
test("§11 one-to-many glyph positioning consumes glyph advances", async () => {
	const bytes = await readFile(
		new URL(
			"../../standard_fonts/LiberationSans-Regular.ttf",
			import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"),
		),
	);
	const content =
		'<ofd:TextObject ID="11" Font="2" Size="4" Boundary="0 0 20 20"><ofd:CGTransform CodePosition="0" GlyphCount="2"><ofd:Glyphs>36 37</ofd:Glyphs></ofd:CGTransform><ofd:TextCode X="1" Y="4" DeltaX="7">A</ofd:TextCode></ofd:TextObject>';
	const doc = await readOfdDocument(
		ofd("test", {
			"Doc/Pages/1.xml": page(content, "<ofd:PageRes>Res.xml</ofd:PageRes>"),
			"Doc/Pages/Res.xml": `<ofd:Res ${ns}><ofd:Fonts><ofd:Font ID="2" FontName="Test"/></ofd:Fonts></ofd:Res>`,
		}),
		{ fonts: { 2: bytes } },
	);
	assert.match(doc.pages[0].svg, /translate\(1 4\) rotate/);
	assert.match(doc.pages[0].svg, /translate\(8 4\) rotate/);
	assert.equal(doc.pages[0].text, "A");
});
test("§14 all action types dispatch in order with playback options", async () => {
	const { executeOfdActions } = await import("../dist/index.js");
	const seen = [];
	const action = (type, attributes, children = []) => ({
		event: "CLICK",
		type,
		parameters: {
			name: "ofd:" + type,
			namespace: "http://www.ofdspec.org/2016",
			attributes,
			children,
		},
	});
	await executeOfdActions(
		[
			action("GotoA", { AttachID: "a", NewWindow: "1" }),
			action("URI", { URI: "doc", Base: "https://example.com/" }),
			action("Sound", { ResourceID: "s", Volume: "30", Repeat: "true", Synchronous: "true" }),
			action("Movie", { ResourceID: "m", Operator: "Pause" }),
		],
		{
			openAttachment: (id, newWindow) => seen.push([id, newWindow]),
			openUri: (uri) => seen.push(uri),
			playSound: (id, options) => seen.push([id, options]),
			playMovie: (id, operator) => seen.push([id, operator]),
		},
	);
	assert.deepEqual(seen, [
		["a", true],
		"https://example.com/doc",
		["s", { volume: 30, repeat: true, synchronous: false }],
		["m", "Pause"],
	]);
});
test("Annex A validates writer output and catches missing resources and required attributes", async () => {
	const { writeImageOfd } = await import("../dist/index.js");
	const { validateOfdPackage } = await import("../dist/validate.js");
	const png = Uint8Array.from(
		Buffer.from(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
			"base64",
		),
	);
	const source = writeImageOfd([{ bytes: png, width: 100, height: 80 }]);
	const valid = await validateOfdPackage(source);
	assert.equal(valid.valid, true, JSON.stringify(valid.issues));
	assert.equal(valid.checkedParts.length, 4);
	const pkg = await openOfdPackage(source);
	pkg.remove("Doc_0/Res/image_0.png");
	const missing = await validateOfdPackage(pkg.write());
	assert.ok(missing.issues.some((issue) => issue.code === "missing-part"));
	const original = new TextDecoder().decode(pkg.read("Doc_0/Pages/Page_0/Content.xml"));
	pkg.set("Doc_0/Pages/Page_0/Content.xml", original.replace(/ ResourceID="[^"]*"/, ""));
	const invalid = await validateOfdPackage(pkg.write());
	assert.ok(invalid.issues.some((issue) => issue.code === "xsd"));
});

test("§8.3 embedded ICC profiles use a local color-management engine", async () => {
	const { srgbProfile } = await import("./profiles.mjs");
	const { createIccConverter } = await import("../dist/icc.js");
	const context = await createIccConverter();
	try {
		close(
			context.convert([1, 0, 0], { type: "RGB", bitsPerComponent: 8, profile: srgbProfile }),
			[255, 0, 0],
		);
		close(
			context.convert([0.5, 0.5, 0.5], {
				type: "RGB",
				bitsPerComponent: 8,
				profile: srgbProfile,
			}),
			[128, 128, 128],
		);
	} finally {
		context.dispose();
	}
	const content =
		'<ofd:PathObject ID="11" Boundary="0 0 10 10" Fill="true" Stroke="false"><ofd:FillColor Value="255 0 0" ColorSpace="8"/><ofd:AbbreviatedData>M 0 0 L 10 0 L 10 10 C</ofd:AbbreviatedData></ofd:PathObject>';
	const doc = await readOfdDocument(
		ofd("test", {
			"Doc/Pages/1.xml": page(content, "<ofd:PageRes>Res.xml</ofd:PageRes>"),
			"Doc/Pages/Res.xml": `<ofd:Res ${ns} BaseLoc="."><ofd:ColorSpaces><ofd:ColorSpace ID="8" Type="RGB" Profile="sRGB.icc"/></ofd:ColorSpaces></ofd:Res>`,
			"Doc/Pages/sRGB.icc": srgbProfile,
		}),
	);
	assert.match(doc.pages[0].svg, /fill="rgb\(255,0,0\)"/);
	assert.ok(!doc.diagnostics.some((d) => d.code === "ofd-icc"));
});
test("§7 permissions expose print quotas and validity periods", async () => {
	const { assertOfdPermission } = await import("../dist/index.js");
	const source = ofd("test", {
		"Doc/Document.xml": `<ofd:Document ${ns}><ofd:CommonData/><ofd:Pages><ofd:Page ID="1" BaseLoc="Pages/1.xml"/></ofd:Pages><ofd:Permissions><ofd:Export>false</ofd:Export><ofd:Print Printable="true" Copies="0"/><ofd:ValidPeriod StartDate="2026-01-01T00:00:00Z" EndDate="2026-12-31T23:59:59Z"/></ofd:Permissions><ofd:VPreferences><ofd:HideToolbar>true</ofd:HideToolbar><ofd:Zoom>1.5</ofd:Zoom></ofd:VPreferences></ofd:Document>`,
	});
	const doc = await readOfdDocument(source),
		policy = doc.documents[0].policy;
	assert.equal(policy.print.allowed, false);
	assert.equal(policy.export, false);
	assert.equal(doc.documents[0].view.zoom, 1.5);
	assert.throws(
		() => assertOfdPermission(policy, "export", Date.parse("2026-09-14")),
		/permit export/,
	);
	assert.throws(() => assertOfdPermission(policy, "read", Date.parse("2027-01-01")), /validity/);
});
test("out-of-page objects do not reach the native renderer", async () => {
	const content =
		'<ofd:TextObject ID="11" Boundary="1 200 20 5" Size="3"><ofd:TextCode X="0" Y="3" DeltaX="3">outside</ofd:TextCode></ofd:TextObject>';
	const doc = await readOfdDocument(ofd("test", { "Doc/Pages/1.xml": page(content) }));
	assert.doesNotMatch(doc.pages[0].svg, /outside/);
});

test("§8.2 zero-width hairlines and minimum strokes follow device scale", async () => {
	const { deviceLineWidth, strokeScale, svgAtDeviceScale } = await import("../dist/strokes.js");
	assert.ok(Math.abs((deviceLineWidth(0, 1) * 96) / 25.4 - 1) < 1e-8);
	assert.ok(Math.abs(((deviceLineWidth(0.001, 1, 2) * 96) / 25.4) * 2 - 2) < 1e-8);
	assert.equal(strokeScale([1000, 0, 0, 1, 0, 0]), 1);
	const svg =
		'<svg xmlns="http://www.w3.org/2000/svg"><path data-ofd-line-width="0" data-ofd-stroke-scale="1" data-ofd-miter-length="3.528" stroke-width="0" d="M 0 0 L 10 0"/></svg>';
	assert.match(svgAtDeviceScale(svg, 2), /stroke-width="0.132291/);
});
test("native rendering cancellation terminates only the isolated worker", async () => {
	const { renderNativeSvg } = await import("../dist/render-node.js");
	const controller = new AbortController();
	const work = renderNativeSvg(
		'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>',
		100,
		"sans-serif",
		controller.signal,
	);
	controller.abort();
	await assert.rejects(work, { name: "AbortError" });
	const png = await renderNativeSvg(
		'<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>',
		2,
		"sans-serif",
	);
	assert.equal(png[0], 137);
});

test("§11 requested bold and italic styling survives glyph outlining", async () => {
	const bytes = await readFile(
		new URL(
			"../../standard_fonts/LiberationSans-Regular.ttf",
			import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"),
		),
	);
	const doc = await readOfdDocument(
		ofd("test", {
			"Doc/Pages/1.xml": page(
				'<ofd:TextObject ID="11" Font="2" Size="4" Boundary="0 0 10 10" Weight="700" Italic="true"><ofd:TextCode X="1" Y="4">A</ofd:TextCode></ofd:TextObject>',
				"<ofd:PageRes>Res.xml</ofd:PageRes>",
			),
			"Doc/Pages/Res.xml": `<ofd:Res ${ns}><ofd:Fonts><ofd:Font ID="2" FontName="Test"/></ofd:Fonts></ofd:Res>`,
		}),
		{ fonts: { 2: bytes } },
	);
	const { renderNativeSvg } = await import("../dist/render-node.js");
	const measure = async (svg) => {
		const png = await renderNativeSvg(svg, 114, "sans-serif"),
			image = await loadImage(Buffer.from(png)),
			canvas = createCanvas(image.width, image.height),
			ctx = canvas.getContext("2d");
		ctx.drawImage(image, 0, 0);
		const data = ctx.getImageData(0, 0, image.width, image.height).data;
		let ink = 0;
		for (let i = 0; i < data.length; i += 4) ink += 255 - data[i];
		return ink;
	};
	const regular = doc.pages[0].svg.replace(/<path data-ofd-synthetic-bold="true"[^>]*\/>/g, "");
	assert.ok((await measure(doc.pages[0].svg)) > (await measure(regular)));
	assert.match(doc.pages[0].svg, /skewX\(-12\)/);
});

test("subset fonts without a naming table retain drawable glyphs", async () => {
	const bytes = new Uint8Array(
			await readFile(
				new URL(
					"../../standard_fonts/LiberationSans-Regular.ttf",
					import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"),
				),
			),
		),
		view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	for (let i = 0; i < view.getUint16(4); i++) {
		const offset = 12 + i * 16;
		if (new TextDecoder().decode(bytes.subarray(offset, offset + 4)) === "name")
			bytes.set(new TextEncoder().encode("Xame"), offset);
	}
	const doc = await readOfdDocument(
		ofd("test", {
			"Doc/Pages/1.xml": page(
				'<ofd:TextObject ID="11" Font="2" Size="4" Boundary="0 0 10 10"><ofd:TextCode X="1" Y="4">A</ofd:TextCode></ofd:TextObject>',
				"<ofd:PageRes>Res.xml</ofd:PageRes>",
			),
			"Doc/Pages/Res.xml": `<ofd:Res ${ns}><ofd:Fonts><ofd:Font ID="2" FontName="Subset"/></ofd:Fonts></ofd:Res>`,
		}),
		{ fonts: { 2: bytes } },
	);
	assert.match(doc.pages[0].svg, /<path /);
	assert.equal(doc.pages[0].text, "A");
});

test("§8.3.4.5 lattice shading follows figure 42's top-right/bottom-left diagonal", async () => {
	const pixel = await pixels(
		square(
			'<ofd:LaGouraudShd VerticesPerRow="2"><ofd:Point X="0" Y="0"><ofd:Color Value="255 0 0"/></ofd:Point><ofd:Point X="20" Y="0"><ofd:Color Value="0 255 0"/></ofd:Point><ofd:Point X="0" Y="20"><ofd:Color Value="0 0 255"/></ofd:Point><ofd:Point X="20" Y="20"><ofd:Color Value="255 255 255"/></ofd:Point></ofd:LaGouraudShd>',
		),
	);
	close(pixel(10, 10), [0, 128, 128, 255]);
});
test("§8.4 text clipping uses mapped glyphs without exposing the Unicode fallback shape", async () => {
	const bytes = await readFile(
		new URL(
			"../../standard_fonts/LiberationSans-Regular.ttf",
			import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"),
		),
	);
	const source = (text, cg = "") =>
		ofd("test", {
			"Doc/Pages/1.xml": page(
				`<ofd:PathObject ID="11" Boundary="0 0 10 10" Fill="true" Stroke="false"><ofd:Clips><ofd:Clip><ofd:Area><ofd:Text Font="99" Size="8" Boundary="0 0 10 10">${cg}<ofd:TextCode X="1" Y="8">${text}</ofd:TextCode></ofd:Text></ofd:Area></ofd:Clip></ofd:Clips><ofd:FillColor Value="255 0 0"/><ofd:AbbreviatedData>M 0 0 L 10 0 L 10 10 L 0 10 C</ofd:AbbreviatedData></ofd:PathObject>`,
				"<ofd:PageRes>Res.xml</ofd:PageRes>",
			),
			"Doc/Pages/Res.xml": `<ofd:Res ${ns}><ofd:Fonts><ofd:Font ID="99" FontName="Test"/></ofd:Fonts></ofd:Res>`,
		});
	const mapped = await convertDocumentNode(
		source(
			"A",
			'<ofd:CGTransform CodePosition="0"><ofd:Glyphs>37</ofd:Glyphs></ofd:CGTransform>',
		),
		"ofd",
		"png",
		{ page: 0, scale: 1, fonts: { 99: bytes } },
	);
	const expected = await convertDocumentNode(source("B"), "ofd", "png", {
		page: 0,
		scale: 1,
		fonts: { 99: bytes },
	});
	assert.deepEqual(
		new Uint8Array(await mapped.files[0].blob.arrayBuffer()),
		new Uint8Array(await expected.files[0].blob.arrayBuffer()),
	);
});

test("structural validation reports escaping paths instead of throwing midway", async () => {
	const { validateOfdPackage } = await import("../dist/validate.js");
	const report = await validateOfdPackage(
		archive({
			"OFD.xml": `<ofd:OFD ${ns} Version="1.0" DocType="OFD"><ofd:DocBody><ofd:DocInfo><ofd:DocID>test</ofd:DocID></ofd:DocInfo><ofd:DocRoot>../escape.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>`,
		}),
	);
	assert.equal(report.valid, false);
	assert.ok(report.issues.some((issue) => issue.code === "path"));
});
