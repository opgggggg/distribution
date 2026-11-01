import { originalOfdRenderer, OFD_ORACLE_COMMIT } from "./ofd-render-oracle.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
const ns = 'xmlns:o="http://www.ofdspec.org/2016"';
const wrap = (content, extra = "", area = "0 0 40 40") =>
	`<o:Page ${ns}><o:Area><o:PhysicalBox>${area}</o:PhysicalBox></o:Area>${extra}<o:Content><o:Layer ID="10">${content}</o:Layer></o:Content></o:Page>`;
const path = (id, paint, extra = "", data = "M 0 0 L 18 0 L 18 18 L 0 18 C") =>
	`<o:PathObject ID="${id}" Boundary="1 1 20 20" Fill="true" Stroke="false" ${extra}>${paint}<o:AbbreviatedData>${data}</o:AbbreviatedData></o:PathObject>`;
const parts = (page, extra = {}) => ({
	"OFD.xml": `<o:OFD ${ns}><o:DocBody><o:DocRoot>Doc/Document.xml</o:DocRoot></o:DocBody></o:OFD>`,
	"Doc/Document.xml": `<o:Document ${ns}><o:CommonData><o:PageArea><o:PhysicalBox>0 0 40 40</o:PhysicalBox></o:PageArea></o:CommonData><o:Pages><o:Page ID="1" BaseLoc="Page.xml"/></o:Pages></o:Document>`,
	"Doc/Page.xml": page,
	...extra,
});
const cases = [
	{
		name: "affine-paths-hairlines-inheritance-actions",
		parts: parts(
			wrap(
				`<o:PageBlock><o:PathObject ID="1" Boundary="2 3 25 20" CTM="1 .1 -.2 1 0 0" DrawParam="2" Fill="true"><o:Actions><o:Action Event="CLICK"><o:URI URI="https://example.invalid/"/><o:Region><o:Area Start="0 0"><o:QuadraticBezier Point1="10 2" Point2="20 10"/><o:Close/></o:Area></o:Region></o:Action></o:Actions><o:AbbreviatedData>S 0 0 L 10 2 Q 20 0 20 8 B 20 15 10 16 5 10 A 3 4 15 0 1 0 0 C</o:AbbreviatedData></o:PathObject></o:PageBlock>`,
				"<o:PageRes>Res.xml</o:PageRes>",
			),
			{
				"Doc/Res.xml": `<o:Res ${ns}><o:DrawParams><o:DrawParam ID="1" LineWidth="0" Cap="Round" Join="Bevel"><o:StrokeColor Value="0 0 255"/></o:DrawParam><o:DrawParam ID="2" Relative="1" DashPattern="2 1" Alpha="192"><o:FillColor Value="255 100 0" Alpha="180"/></o:DrawParam></o:DrawParams></o:Res>`,
			},
		),
	},
	{
		name: "axial-repeat-and-radial-shading",
		parts: parts(
			wrap(
				path(
					1,
					'<o:FillColor><o:AxialShd StartPoint="0 0" EndPoint="18 18" Extend="3" MapType="Reflect" MapUnit="8"><o:Segment><o:Color Value="255 0 0"/></o:Segment><o:Segment Position=".3"><o:Color Value="0 255 0" Alpha="180"/></o:Segment><o:Segment><o:Color Value="0 0 255"/></o:Segment></o:AxialShd></o:FillColor>',
				) +
					path(
						2,
						'<o:FillColor><o:RadialShd StartPoint="4 4" EndPoint="10 10" StartRadius="0" EndRadius="10" Eccentricity=".5" Angle="20" Extend="3"><o:Segment><o:Color Value="255 255 255"/></o:Segment><o:Segment><o:Color Value="0 20 200"/></o:Segment></o:RadialShd></o:FillColor>',
						'CTM=".6 0 0 .6 15 15"',
					),
			),
		),
	},
	{
		name: "Gouraud-lattice-and-continuations",
		parts: parts(
			wrap(
				path(
					1,
					'<o:FillColor><o:LaGouraudShd VerticesPerRow="2"><o:Point X="0" Y="0"><o:Color Value="255 0 0"/></o:Point><o:Point X="18" Y="0"><o:Color Value="0 255 0"/></o:Point><o:Point X="0" Y="18"><o:Color Value="0 0 255"/></o:Point><o:Point X="18" Y="18"><o:Color Value="255 255 255"/></o:Point></o:LaGouraudShd></o:FillColor>',
				) +
					path(
						2,
						'<o:FillColor><o:GouraudShd Extend="1"><o:BackColor Value="20 20 20"/><o:Point X="0" Y="0" EdgeFlag="0"><o:Color Value="0 0 255"/></o:Point><o:Point X="18" Y="0"><o:Color Value="255 255 0"/></o:Point><o:Point X="0" Y="18"><o:Color Value="255 0 0"/></o:Point><o:Point X="18" Y="18" EdgeFlag="1"><o:Color Value="0 255 0"/></o:Point></o:GouraudShd></o:FillColor>',
						'CTM=".5 0 0 .5 19 19"',
					),
			),
		),
	},
	{
		name: "reflected-pattern-clipping-and-page-relative-paint",
		parts: parts(
			wrap(
				path(
					1,
					'<o:FillColor><o:Pattern Width="4" Height="4" XStep="5" YStep="5" ReflectMethod="RowAndColumn" RelativeTo="Page" CTM="1 0 0 1 2 3"><o:CellContent><o:PathObject ID="99" Boundary="0 0 4 4" Fill="true" Stroke="false"><o:FillColor Value="0 120 240"/><o:AbbreviatedData>M 0 0 L 4 0 L 0 4 C</o:AbbreviatedData></o:PathObject></o:CellContent></o:Pattern></o:FillColor><o:Clips><o:Clip><o:Area CTM="1 0 0 1 0 0"><o:Path Boundary="0 0 18 18" Fill="true" Stroke="false"><o:AbbreviatedData>M 0 0 L 18 0 L 9 18 C</o:AbbreviatedData></o:Path></o:Area></o:Clip></o:Clips>',
					'CTM="1 .2 -.1 1 3 3"',
				),
			),
		),
	},
	{
		name: "font-outlines-CGTransform-bold-italic-direction",
		fontOverrides: { 2: "LiberationSans" },
		parts: parts(
			wrap(
				`<o:TextObject ID="1" Font="2" Size="6" HScale=".8" CharDirection="90" Weight="700" Italic="true" Boundary="2 2 30 30"><o:FillColor Value="10 20 150"/><o:CGTransform CodePosition="0" CodeCount="2" GlyphCount="1"><o:Glyphs>37</o:Glyphs></o:CGTransform><o:CGTransform CodePosition="2" CodeCount="1" GlyphCount="2"><o:Glyphs>36 38</o:Glyphs></o:CGTransform><o:TextCode X="8" Y="8" DeltaX="g 4 7">ABC😀</o:TextCode><o:TextCode X="15" Y="8" DeltaY="6">D</o:TextCode></o:TextObject>`,
				"<o:PageRes>Res.xml</o:PageRes>",
			),
			{
				"Doc/Res.xml": `<o:Res ${ns}><o:Fonts><o:Font ID="2" FontName="Test"/></o:Fonts></o:Res>`,
			},
		),
	},
	{
		name: "templates-composites-annotations-origin-and-images",
		binaryParts: {
			"Doc/pixel.png":
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
		},
		parts: parts(
			wrap(
				`<o:CompositeObject ID="1" ResourceID="7" Boundary="2 2 18 18"/><o:ImageObject ID="2" ResourceID="8" Boundary="20 5 10 10" CTM="10 0 0 10 0 0"><o:Border LineWidth=".3" HorizonalCornerRadius="1" VerticalCornerRadius="1"><o:BorderColor Value="0 0 255"/></o:Border></o:ImageObject>`,
				'<o:Template TemplateID="9" ZOrder="Foreground"/>',
				"2 3 40 40",
			),
			{
				"Doc/Document.xml": `<o:Document ${ns}><o:CommonData><o:DocumentRes>Res.xml</o:DocumentRes><o:TemplatePage ID="9" BaseLoc="Template.xml"/></o:CommonData><o:Pages><o:Page ID="1" BaseLoc="Page.xml"/></o:Pages><o:Annotations>Annotations.xml</o:Annotations></o:Document>`,
				"Doc/Res.xml": `<o:Res ${ns}><o:CompositeGraphicUnits><o:CompositeGraphicUnit ID="7" Width="18" Height="18">${path(88, '<o:FillColor Value="255 120 0"/>')}</o:CompositeGraphicUnit></o:CompositeGraphicUnits><o:MultiMedias><o:MultiMedia ID="8" Type="Image"><o:MediaFile>pixel.png</o:MediaFile></o:MultiMedia></o:MultiMedias></o:Res>`,
				"Doc/Template.xml": wrap(
					'<o:TextObject ID="22" Size="3" Boundary="2 25 30 6"><o:TextCode X="0" Y="3" DeltaX="g 5 2">FRONT</o:TextCode></o:TextObject>',
				),
				"Doc/Annotations.xml": `<o:Annotations ${ns}><o:Page PageID="1"><o:FileLoc>Annot.xml</o:FileLoc></o:Page></o:Annotations>`,
				"Doc/Annot.xml": `<o:PageAnnot ${ns}><o:Annot ID="30" Visible="true"><o:Appearance Boundary="25 20 10 10">${path(31, '<o:FillColor Value="0 170 0"/>')}</o:Appearance></o:Annot></o:PageAnnot>`,
			},
		),
	},
	{
		name: "custom-color-provider-profile-and-palette",
		colorProvider: "profile-marker",
		binaryParts: { "Doc/Res/marker.icc": "AQIDBA==" },
		parts: parts(
			wrap(
				path(1, '<o:FillColor ColorSpace="1" Index="0" Alpha="128"/>'),
				"<o:PageRes>Res.xml</o:PageRes>",
			),
			{
				"Doc/Res.xml": `<o:Res ${ns} BaseLoc="Res"><o:ColorSpaces><o:ColorSpace ID="1" Type="RGB" BitsPerComponent="8" Profile="marker.icc"><o:Palette><o:CV>255 0 0</o:CV></o:Palette></o:ColorSpace></o:ColorSpaces></o:Res>`,
			},
		),
	},
	{
		name: "fallback-Unicode-text-and-direction",
		parts: parts(
			wrap(
				'<o:TextObject ID="1" Size="4" Boundary="2 2 30 12"><o:TextCode X="1" Y="4" DeltaX="g 5 5">A\\0042 中😀</o:TextCode></o:TextObject><o:TextObject ID="2" Size="3" HScale=".7" CharDirection="270" Boundary="20 20 10 10"><o:TextCode X="3" Y="5" DeltaY="g 2 3">XY</o:TextCode></o:TextObject>',
			),
		),
	},
];
export function caseParts(item) {
	return {
		...Object.fromEntries(Object.entries(item.parts).map(([p, s]) => [p, strToU8(s)])),
		...Object.fromEntries(
			Object.entries(item.binaryParts ?? {}).map(([p, b]) => [
				p,
				Uint8Array.from(Buffer.from(b, "base64")),
			]),
		),
	};
}
const renderer = await originalOfdRenderer();
const font = await readFile(
	new URL(
		"../../standard_fonts/LiberationSans-Regular.ttf",
		import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"),
	),
);
for (const item of cases) {
	const files = caseParts(item);
	const options = {};
	if (item.fontOverrides)
		options.fonts = Object.fromEntries(
			Object.keys(item.fontOverrides).map((key) => [key, font]),
		);
	if (item.colorProvider)
		options.colorConverter = (_values, space) =>
			space.profile?.[0] === 1 ? [12, 100, 200] : [0, 0, 0];
	item.expected = await renderer.readOfdDocument(zipSync(files, { level: 0 }), options);
}
await writeFile(
	new URL("../packages/ofd/tests/fixtures/rust-render.json", import.meta.url),
	JSON.stringify(
		{
			sourceCommit: OFD_ORACLE_COMMIT,
			oracle: "complete original TypeScript OFD renderer",
			cases,
		},
		null,
		2,
	) + "\n",
);
console.log(`Generated ${cases.length} independent complete OFD render fixtures`);
