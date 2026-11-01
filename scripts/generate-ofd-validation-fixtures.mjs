import { originalOfdModule, OFD_ORACLE_COMMIT } from "./ofd-render-oracle.mjs";
import { writeFile } from "node:fs/promises";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
const { validateOfdPackage } = await originalOfdModule("validate");
const { writeImageOfd } = await originalOfdModule("write");
const ns = 'xmlns:o="http://www.ofdspec.org/2016"';
const binary = { "pixel.png": Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64") };
const valid = unzipSync(
	new Uint8Array(
		await writeImageOfd([
			{ bytes: Buffer.from(binary["pixel.png"], "base64"), width: 100, height: 80 },
		]).arrayBuffer(),
	),
);
const validParts = Object.fromEntries(
	Object.entries(valid)
		.filter(([p]) => p.endsWith(".xml"))
		.map(([p, b]) => [p, strFromU8(b)]),
);
validParts["OFD.xml"] = validParts["OFD.xml"].replace(
	/<ofd:DocID>[^<]*<\/ofd:DocID>/,
	"<ofd:DocID>00000000000040008000000000000001</ofd:DocID>",
);
const validBinary = Object.fromEntries(
	Object.entries(valid)
		.filter(([p]) => !p.endsWith(".xml"))
		.map(([p, b]) => [p, Buffer.from(b).toString("base64")]),
);
const cases = [
	{ name: "original-image-writer", parts: validParts, binaryParts: validBinary },
	{
		name: "missing-image-reference-schema-result",
		parts: {
			...validParts,
			"Doc_0/Pages/Page_0/Content.xml": validParts["Doc_0/Pages/Page_0/Content.xml"].replace(
				/ ResourceID="[^"]*"/,
				"",
			),
		},
		binaryParts: validBinary,
	},
	{
		name: "scoped-ids-boundary-matrix-and-resource-type",
		parts: {
			"OFD.xml": `<o:OFD ${ns} Version="1.0" DocType="OFD"><o:DocBody><o:DocInfo><o:DocID>test</o:DocID></o:DocInfo><o:DocRoot>Doc.xml</o:DocRoot></o:DocBody></o:OFD>`,
			"Doc.xml": `<o:Document ${ns}><o:CommonData><o:MaxUnitID>2</o:MaxUnitID><o:PageArea><o:PhysicalBox>0 0 100 100</o:PhysicalBox></o:PageArea><o:DocumentRes>Res.xml</o:DocumentRes></o:CommonData><o:Pages><o:Page ID="1" BaseLoc="Page.xml"/></o:Pages></o:Document>`,
			"Res.xml": `<o:Res ${ns}><o:Fonts><o:Font ID="3" FontName="Test"><o:FontFile>missing.ttf</o:FontFile></o:Font></o:Fonts></o:Res>`,
			"Page.xml": `<o:Page ${ns}><o:Content><o:Layer ID="2"><o:ImageObject ID="2" ResourceID="3" Boundary="0 0 -1 10" CTM="1 0 0"/><o:TextObject ID="4" Font="99" Size="4" Boundary="0 0 10 10"><o:TextCode X="0" Y="4">Test</o:TextCode></o:TextObject></o:Layer></o:Content></o:Page>`,
		},
	},
	{
		name: "escaping-container-reference",
		parts: {
			"OFD.xml": `<o:OFD ${ns}><o:DocBody><o:DocRoot>../../escape.xml</o:DocRoot></o:DocBody></o:OFD>`,
		},
	},
	{
		name: "shared-parts-across-independent-documents",
		parts: {
			"OFD.xml": `<o:OFD ${ns}><o:DocBody><o:DocRoot>A.xml</o:DocRoot></o:DocBody><o:DocBody><o:DocRoot>B.xml</o:DocRoot></o:DocBody></o:OFD>`,
			"A.xml": `<o:Document ${ns}><o:CommonData><o:MaxUnitID>4</o:MaxUnitID></o:CommonData><o:Pages><o:Page ID="1" BaseLoc="Shared.xml"/></o:Pages></o:Document>`,
			"B.xml": `<o:Document ${ns}><o:CommonData><o:MaxUnitID>2</o:MaxUnitID></o:CommonData><o:Pages><o:Page ID="1" BaseLoc="Shared.xml"/></o:Pages></o:Document>`,
			"Shared.xml": `<o:Page ${ns}><o:Content><o:Layer ID="3"><o:PathObject ID="4" Boundary="0 0 10 10"><o:AbbreviatedData>M 0 0 L 1 1</o:AbbreviatedData></o:PathObject></o:Layer></o:Content></o:Page>`,
		},
	},
];
for (const item of cases) {
	const source = zipSync(
		{
			...Object.fromEntries(Object.entries(item.parts).map(([p, s]) => [p, strToU8(s)])),
			...Object.fromEntries(
				Object.entries(item.binaryParts ?? {}).map(([p, b]) => [
					p,
					Buffer.from(b, "base64"),
				]),
			),
		},
		{ level: 0 },
	);
	item.expected = await validateOfdPackage(source);
}
await writeFile(
	new URL("../packages/ofd/tests/fixtures/rust-validation.json", import.meta.url),
	JSON.stringify(
		{
			sourceCommit: OFD_ORACLE_COMMIT,
			oracle: "original complete OFD validator including the same Annex-A XSD engine",
			cases,
		},
		null,
		2,
	) + "\n",
);
console.log(`Generated ${cases.length} independent OFD validation results`);
