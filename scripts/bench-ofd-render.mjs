/** Manual desktop-host comparison. These are not physical Pencil/device measurements. */
import { originalOfdRenderer } from "./ofd-render-oracle.mjs";
import { readOfdDocument } from "../packages/ofd/dist/read.js";
import { loadFormatsKernel } from "@cubexp/kernels";
import { zipSync, strToU8 } from "fflate";
const original = await originalOfdRenderer();
await loadFormatsKernel();
const ns = 'xmlns:o="http://www.ofdspec.org/2016"';
function source(content, size = 200) {
	return zipSync(
		{
			"OFD.xml": strToU8(
				`<o:OFD ${ns}><o:DocBody><o:DocRoot>Document.xml</o:DocRoot></o:DocBody></o:OFD>`,
			),
			"Document.xml": strToU8(
				`<o:Document ${ns}><o:Pages><o:Page ID="1" BaseLoc="Page.xml"/></o:Pages></o:Document>`,
			),
			"Page.xml": strToU8(
				`<o:Page ${ns}><o:Area><o:PhysicalBox>0 0 ${size} ${size}</o:PhysicalBox></o:Area><o:Content><o:Layer ID="1">${content}</o:Layer></o:Content></o:Page>`,
			),
		},
		{ level: 0 },
	);
}
const paths = source(
	Array.from(
		{ length: 5000 },
		(_, i) =>
			`<o:PathObject ID="${i + 2}" Boundary="${(i % 50) * 3 + 0.5} ${Math.floor(i / 50) * 1.5 + 0.5} 2 1" Fill="true" Stroke="false"><o:FillColor Value="20 100 220"/><o:AbbreviatedData>M 0 0 L 2 0 L 1 1 C</o:AbbreviatedData></o:PathObject>`,
	).join(""),
);
const radial = source(
	'<o:PathObject ID="2" Boundary="0 0 200 200" Fill="true" Stroke="false"><o:FillColor><o:RadialShd StartPoint="10 10" EndPoint="100 100" StartRadius="0" EndRadius="100" Eccentricity=".5" Angle="30" Extend="3"><o:Segment><o:Color Value="255 0 0"/></o:Segment><o:Segment><o:Color Value="0 0 255"/></o:Segment></o:RadialShd></o:FillColor><o:AbbreviatedData>M 0 0 L 200 0 L 200 200 L 0 200 C</o:AbbreviatedData></o:PathObject>',
);
for (const [name, input] of [
	["5000 visible paths", paths],
	["2.28 million radial samples", radial],
]) {
	for (const render of [original.readOfdDocument, readOfdDocument]) await render(input);
	const timings = { original: [], rust: [] };
	for (let i = 0; i < 5; i++)
		for (const [key, render] of [
			["original", original.readOfdDocument],
			["rust", readOfdDocument],
		]) {
			globalThis.gc?.();
			const start = performance.now();
			const result = await render(input);
			timings[key].push(performance.now() - start);
			if (result.pages.length !== 1) throw Error("Invalid benchmark output");
		}
	const median = (a) => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
	console.log(
		JSON.stringify({
			workload: name,
			unit: "ms",
			environment: `${process.platform}/${process.arch} Node ${process.versions.node}`,
			medianOriginal: median(timings.original),
			medianRust: median(timings.rust),
			samples: timings,
		}),
	);
}
