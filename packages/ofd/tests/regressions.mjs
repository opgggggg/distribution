import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { readOfdDocument, exportDocument, convertDocument, writeImageOfd } from "../dist/index.js";
import { readSource } from "../dist/source.js";
import { rasterSize } from "../dist/convert.js";
import { archive, ofd } from "./fixtures.mjs";

const ns = 'xmlns:ofd="http://www.ofdspec.org/2016"';
const png = Uint8Array.from(
	Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
		"base64",
	),
);
function page(content, resource = "") {
	return `<ofd:Page ${ns}>${resource}<ofd:Content><ofd:Layer ID="10">${content}</ofd:Layer></ofd:Content></ofd:Page>`;
}
const textObject = (text, attrs = "") =>
	`<ofd:TextObject ID="11" Boundary="0 0 20 20" Size="4" ${attrs}><ofd:TextCode X="0" Y="4">${text}</ofd:TextCode></ofd:TextObject>`;

test("all text and markup exports select one page and reject invalid indices", async () => {
	const source = ofd();
	const doc = await readOfdDocument(source);
	for (const format of ["txt", "md", "html", "docx", "svg"]) {
		const result = await convertDocument(source, "ofd", format, { page: 1 });
		const file = result.files[0].blob;
		const content =
			format === "docx"
				? strFromU8(
						unzipSync(new Uint8Array(await file.arrayBuffer()))["word/document.xml"],
					)
				: await file.text();
		assert.match(content, /你好 OFD 2/);
		assert.doesNotMatch(content, /你好 OFD 1/);
		for (const page of [-1, 2, 0.5, NaN])
			await assert.rejects(exportDocument(doc, format, { page }), /index/);
	}
});

test("page resources resolve relative paths and remain isolated between pages", async () => {
	const doc = await readOfdDocument(
		ofd("test", {
			"Doc/Pages/1.xml": page(
				'<ofd:ImageObject ID="12" ResourceID="99" Boundary="0 0 20 20"/>',
				"<ofd:PageRes>Local/Res.xml</ofd:PageRes>",
			),
			"Doc/Pages/2.xml": page(
				'<ofd:ImageObject ID="13" ResourceID="99" Boundary="0 0 20 20"/>',
			),
			"Doc/Pages/Local/Res.xml": `<ofd:Res ${ns} BaseLoc="Images"><ofd:MultiMedias><ofd:MultiMedia ID="99" Type="Image"><ofd:MediaFile>pixel.png</ofd:MediaFile></ofd:MultiMedia></ofd:MultiMedias></ofd:Res>`,
			"Doc/Pages/Local/Images/pixel.png": png,
		}),
	);
	assert.match(doc.pages[0].svg, /data:image\/png/);
	assert.doesNotMatch(doc.pages[1].svg, /data:image\/png/);
	assert.ok(doc.diagnostics.some((d) => d.code === "ofd-image" && d.page === 1));
});

test("layer styles, relative DrawParam, stroke styles and color alpha are inherited", async () => {
	const doc = await readOfdDocument(
		ofd("test", {
			"Doc/Pages/1.xml": `<ofd:Page ${ns}><ofd:PageRes>Res.xml</ofd:PageRes><ofd:Content><ofd:Layer ID="10" DrawParam="2"><ofd:PathObject ID="11" Boundary="0 0 10 10" Fill="true"><ofd:AbbreviatedData>M 0 0 L 10 0 L 10 10 C</ofd:AbbreviatedData></ofd:PathObject></ofd:Layer></ofd:Content></ofd:Page>`,
			"Doc/Pages/Res.xml": `<ofd:Res ${ns}><ofd:DrawParams><ofd:DrawParam ID="1" LineWidth="2" Cap="Round" Join="Bevel" DashPattern="2 1"><ofd:FillColor Value="255 0 0" Alpha="128"/></ofd:DrawParam><ofd:DrawParam ID="2" Relative="1"><ofd:StrokeColor Value="0 0 255"/></ofd:DrawParam></ofd:DrawParams></ofd:Res>`,
		}),
	);
	assert.match(doc.pages[0].svg, /fill="rgb\(255,0,0\)"/);
	assert.match(doc.pages[0].svg, /stroke="rgb\(0,0,255\)"/);
	assert.match(doc.pages[0].svg, /stroke-width="2"/);
	assert.match(doc.pages[0].svg, /stroke-linecap="round"/);
	assert.match(doc.pages[0].svg, /stroke-dasharray="2 1"/);
	assert.match(doc.pages[0].svg, /fill-opacity="0\.5019/);
});

test("indexed color spaces and composite graphics render with resource styles", async () => {
	const doc = await readOfdDocument(
		ofd("test", {
			"Doc/Pages/1.xml": page(
				'<ofd:CompositeObject ID="11" ResourceID="3" Boundary="5 6 10 10"/>',
				"<ofd:PageRes>Res.xml</ofd:PageRes>",
			),
			"Doc/Pages/Res.xml": `<ofd:Res ${ns}><ofd:ColorSpaces><ofd:ColorSpace ID="1" Type="RGB" BitsPerComponent="8"><ofd:Palette><ofd:CV>0 255 0</ofd:CV></ofd:Palette></ofd:ColorSpace></ofd:ColorSpaces><ofd:CompositeGraphicUnits><ofd:CompositeGraphicUnit ID="3" Width="10" Height="10"><ofd:Content>${textObject("复合", 'Font="5"').replace("<ofd:TextCode", '<ofd:FillColor ColorSpace="1" Index="0"/><ofd:TextCode')}</ofd:Content></ofd:CompositeGraphicUnit></ofd:CompositeGraphicUnits></ofd:Res>`,
		}),
	);
	assert.match(doc.pages[0].text, /复合/);
	assert.match(doc.pages[0].svg, /fill="rgb\(0,255,0\)"/);
});

test("path clipping renders geometry without extracting clip metadata as visible text", async () => {
	const object = textObject("visible").replace(
		"</ofd:TextObject>",
		'<ofd:Clips><ofd:Clip><ofd:Area CTM="1 0 0 1 2 3"><ofd:Path Rule="Even-Odd" Fill="true" Stroke="false"><ofd:AbbreviatedData>M 0 0 L 5 0 L 5 5 C</ofd:AbbreviatedData></ofd:Path></ofd:Area></ofd:Clip></ofd:Clips></ofd:TextObject>',
	);
	const doc = await readOfdDocument(ofd("test", { "Doc/Pages/1.xml": page(object) }));
	assert.match(doc.pages[0].svg, /<mask/);
	assert.match(doc.pages[0].svg, /mask="url\(#ofd-clip-0\)"/);
	assert.match(doc.pages[0].svg, /fill-rule="evenodd"/);
	assert.equal(doc.pages[0].text, "visible");
});

test("successive TextCode runs reuse their origin and hidden objects stay hidden", async () => {
	const doc = await readOfdDocument(
		ofd("test", {
			"Doc/Pages/1.xml": page(
				'<ofd:TextObject ID="11" Boundary="0 0 20 20" Size="4"><ofd:TextCode X="3" Y="7" DeltaX="4">AB</ofd:TextCode><ofd:TextCode>CD</ofd:TextCode></ofd:TextObject>' +
					textObject("hidden", 'Visible="false"'),
			),
		}),
	);
	assert.match(doc.pages[0].svg, /x="3 3" y="7 7"/);
	assert.doesNotMatch(doc.pages[0].text, /hidden/);
});

test("annotation appearances and template page resources are drawn", async () => {
	const doc = await readOfdDocument(
		ofd("test", {
			"Doc/Document.xml": `<ofd:Document ${ns}><ofd:CommonData><ofd:TemplatePage ID="9" BaseLoc="Template/Page.xml"/></ofd:CommonData><ofd:Pages><ofd:Page ID="1" BaseLoc="Pages/1.xml"/></ofd:Pages><ofd:Annotations>Annots/Annotations.xml</ofd:Annotations></ofd:Document>`,
			"Doc/Pages/1.xml": page(textObject("body")).replace(
				"<ofd:Content>",
				'<ofd:Template TemplateID="9"/><ofd:Content>',
			),
			"Doc/Template/Page.xml": page(
				'<ofd:ImageObject ID="12" ResourceID="99" Boundary="0 0 20 20"/>',
				"<ofd:PageRes>Res.xml</ofd:PageRes>",
			),
			"Doc/Template/Res.xml": `<ofd:Res ${ns}><ofd:MultiMedias><ofd:MultiMedia ID="99"><ofd:MediaFile>pixel.png</ofd:MediaFile></ofd:MultiMedia></ofd:MultiMedias></ofd:Res>`,
			"Doc/Template/pixel.png": png,
			"Doc/Annots/Annotations.xml": `<ofd:Annotations ${ns}><ofd:Page PageID="1"><ofd:FileLoc>Page.xml</ofd:FileLoc></ofd:Page></ofd:Annotations>`,
			"Doc/Annots/Page.xml": `<ofd:PageAnnot ${ns}><ofd:Annot ID="100"><ofd:Appearance Boundary="20 30 10 10">${textObject("批注")}</ofd:Appearance></ofd:Annot><ofd:Annot ID="101" Visible="false"><ofd:Appearance>${textObject("hidden")}</ofd:Appearance></ofd:Annot></ofd:PageAnnot>`,
		}),
	);
	assert.match(doc.pages[0].svg, /data:image\/png/);
	assert.match(doc.pages[0].svg, /translate\(20 30\)/);
	assert.match(doc.text, /批注/);
	assert.doesNotMatch(doc.text, /hidden/);
});

test("cycles in templates, composites and DrawParam terminate with errors", async () => {
	await assert.rejects(
		readOfdDocument(
			ofd("test", {
				"Doc/Document.xml": `<ofd:Document ${ns}><ofd:CommonData><ofd:TemplatePage ID="9" BaseLoc="Pages/1.xml"/></ofd:CommonData><ofd:Pages><ofd:Page ID="1" BaseLoc="Pages/1.xml"/></ofd:Pages></ofd:Document>`,
				"Doc/Pages/1.xml": `<ofd:Page ${ns}><ofd:Template TemplateID="9"/></ofd:Page>`,
			}),
		),
		/Cyclic/,
	);
	for (const [object, resource, message] of [
		[
			textObject("cycle", 'DrawParam="1"'),
			'<ofd:DrawParams><ofd:DrawParam ID="1" Relative="2"/><ofd:DrawParam ID="2" Relative="1"/></ofd:DrawParams>',
			/Cyclic/,
		],
		[
			'<ofd:CompositeObject ResourceID="1"/>',
			'<ofd:CompositeGraphicUnits><ofd:CompositeGraphicUnit ID="1"><ofd:Content><ofd:CompositeObject ResourceID="1"/></ofd:Content></ofd:CompositeGraphicUnit></ofd:CompositeGraphicUnits>',
			/nesting/,
		],
	])
		await assert.rejects(
			readOfdDocument(
				ofd("test", {
					"Doc/Pages/1.xml": page(object, "<ofd:PageRes>Res.xml</ofd:PageRes>"),
					"Doc/Pages/Res.xml": `<ofd:Res ${ns}>${resource}</ofd:Res>`,
				}),
			),
			message,
		);
});

test("UTF-16 XML is supported and malformed budgets, dimensions and paths are rejected", async () => {
	const xml = `<ofd:Page ${ns}><ofd:Content><ofd:Layer>${textObject("中文")}</ofd:Layer></ofd:Content></ofd:Page>`;
	const doc = await readOfdDocument(
		ofd("test", {
			"Doc/Pages/1.xml": Buffer.concat([
				Buffer.from([0xff, 0xfe]),
				Buffer.from(xml, "utf16le"),
			]),
		}),
	);
	assert.match(doc.text, /中文/);
	for (const key of [
		"maxPages",
		"maxEntries",
		"maxObjects",
		"maxSvgBytes",
		"maxExpandedBytes",
		"maxSourceBytes",
	]) {
		for (const value of [0, -1, NaN, Infinity, 1.5])
			await assert.rejects(readOfdDocument(ofd(), { [key]: value }), /positive/);
	}
	await assert.rejects(readOfdDocument(ofd(), { maxObjects: 1 }), /objects/);
	await assert.rejects(readOfdDocument(ofd(), { maxSvgBytes: 10 }), /SVG/);
	for (const value of [-1, 0, NaN, Infinity])
		assert.throws(() => rasterSize(value, 10, {}), /dimensions/);
	await assert.rejects(
		readOfdDocument(
			ofd("test", {
				"Doc/Pages/1.xml": page(
					"<ofd:PathObject><ofd:AbbreviatedData>M 0 0 B 1 2</ofd:AbbreviatedData></ofd:PathObject>",
				),
			}),
		),
		/coordinates/,
	);
	assert.throws(() => writeImageOfd([{ bytes: png, width: 39000, height: 10 }]), /dimensions/);
});

test("URL loader enforces streaming byte budgets and cancels discarded responses", async (t) => {
	let cancelled = false;
	t.mock.method(
		globalThis,
		"fetch",
		async () =>
			new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new Uint8Array(8));
						controller.enqueue(new Uint8Array(8));
					},
					cancel() {
						cancelled = true;
					},
				}),
			),
	);
	await assert.rejects(
		readSource("https://example.invalid/file.ofd", { maxSourceBytes: 10 }),
		/budget/,
	);
	assert.equal(cancelled, true);
	await assert.rejects(
		readSource(new Blob([new Uint8Array(20)]), { maxSourceBytes: 10 }),
		/budget/,
	);
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(
		readSource("https://example.invalid/file.ofd", { signal: controller.signal }),
		{ name: "AbortError" },
	);
});

test("nested page blocks, hexadecimal colors and redundant advances stay compatible", async () => {
	const doc = await readOfdDocument(
		ofd("test", {
			"Doc/Pages/1.xml": page(
				`<ofd:PageBlock><ofd:PageBlock><ofd:TextObject ID="11" Boundary="0 0 20 20" Size="4"><ofd:FillColor Value="#FF #00 #80"/><ofd:TextCode X="0" Y="4" DeltaX="4 4 4 4 4 4 4 4 4 4 4">AB</ofd:TextCode></ofd:TextObject></ofd:PageBlock></ofd:PageBlock>`,
			),
		}),
	);
	assert.equal(doc.pages[0].text, "AB");
	assert.match(doc.pages[0].svg, /fill="rgb\(255,0,128\)"/);
	assert.match(doc.pages[0].svg, /x="0 4"/);
});

test("missing optional dictionaries and annotation indexes produce diagnostics", async () => {
	const doc = await readOfdDocument(
		ofd("test", {
			"Doc/Document.xml": `<ofd:Document ${ns}><ofd:CommonData><ofd:PublicRes>missing.xml</ofd:PublicRes></ofd:CommonData><ofd:Pages><ofd:Page ID="1" BaseLoc="Pages/1.xml"/></ofd:Pages><ofd:Annotations>missing-annotations.xml</ofd:Annotations></ofd:Document>`,
		}),
	);
	assert.equal(doc.pages.length, 1);
	assert.ok(doc.diagnostics.some((d) => d.code === "ofd-resource"));
	assert.ok(doc.diagnostics.some((d) => d.code === "ofd-annotation"));
	await assert.rejects(
		readOfdDocument(
			ofd("test", {
				"Doc/Pages/1.xml": page("", "<ofd:PageRes>../../../escape.xml</ofd:PageRes>"),
			}),
		),
		/escapes/,
	);
});

test("template definition foreground order is respected and SignedValue seals are found", async () => {
	// Minimal DER OCTET STRING containing the known PNG fixture.
	const seal = new Uint8Array([4, png.length, ...png]);
	const doc = await readOfdDocument(
		ofd("test", {
			"OFD.xml": `<ofd:OFD ${ns}><ofd:DocBody><ofd:DocRoot>Doc/Document.xml</ofd:DocRoot><ofd:Signatures>Doc/Signatures.xml</ofd:Signatures></ofd:DocBody></ofd:OFD>`,
			"Doc/Document.xml": `<ofd:Document ${ns}><ofd:CommonData><ofd:TemplatePage ID="9" BaseLoc="Template.xml" ZOrder="Foreground"/></ofd:CommonData><ofd:Pages><ofd:Page ID="1" BaseLoc="Pages/1.xml"/></ofd:Pages></ofd:Document>`,
			"Doc/Pages/1.xml": page(textObject("BODY")).replace(
				"<ofd:Content>",
				'<ofd:Template TemplateID="9"/><ofd:Content>',
			),
			"Doc/Template.xml": page(textObject("FRONT")),
			"Doc/Signatures.xml": `<ofd:Signatures ${ns}><ofd:Signature BaseLoc="Signature.xml"/></ofd:Signatures>`,
			"Doc/Signature.xml": `<ofd:Signature ${ns}><ofd:SignedInfo><ofd:StampAnnot PageRef="1" Boundary="1 2 3 4"/></ofd:SignedInfo><ofd:SignedValue>SignedValue.dat</ofd:SignedValue></ofd:Signature>`,
			"Doc/SignedValue.dat": seal,
		}),
	);
	assert.ok(doc.pages[0].svg.indexOf(">FRONT<") > doc.pages[0].svg.indexOf(">BODY<"));
	assert.match(doc.pages[0].svg, /data:image\/png/);
	assert.ok(doc.diagnostics.some((d) => d.code === "signature-unverified"));
	assert.ok(!doc.diagnostics.some((d) => d.code === "ofd-seal"));
});
