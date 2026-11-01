import { originalOfdModule, OFD_ORACLE_COMMIT } from "./ofd-render-oracle.mjs";
import { writeFile } from "node:fs/promises";
const original = await originalOfdModule("strokes");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><!-- keep > &lt; -->
<g data-note="中文 &amp; &quot; >"><path data-ofd-line-width="0" data-ofd-stroke-scale="1" data-ofd-miter-length="3.528" stroke-width='1' d="M 0 0 L 40 40"/>
<path data-ofd-line-width=".001" data-ofd-stroke-scale=".05" data-ofd-miter-length="1" stroke-width=".5" stroke-miterlimit="10" d="M 0 40 L 40 0"/>
<path data-ofd-line-width="2" data-ofd-stroke-scale="1" data-ofd-miter-length="10" d="M 10 0 L 10 40"/></g></svg>`;
const cases = [0.1, 0.5, 1, 2, 8].map((scale) => ({
	scale,
	svg,
	expected: original.svgAtDeviceScale(svg, scale),
}));
const matrices = [
	[1, 0, 0, 1, 0, 0],
	[1000, 0, 0, 1, 0, 0],
	[2, 0.3, -0.2, 3, 5, 8],
	[0, 0, 0, 0, 0, 0],
	[0.01, 10, 7, 0.04, 0, 0],
].map((matrix) => ({ matrix, expected: original.strokeScale(matrix) }));
const widths = [0, 0.001, 0.5, 5].flatMap((width) =>
	[0.02, 1, 100].flatMap((transformScale) =>
		[0.1, 1, 8].map((deviceScale) => ({
			width,
			transformScale,
			deviceScale,
			expected: original.deviceLineWidth(width, transformScale, deviceScale),
		})),
	),
);
await writeFile(
	new URL("../packages/ofd/tests/fixtures/rust-strokes.json", import.meta.url),
	JSON.stringify({ sourceCommit: OFD_ORACLE_COMMIT, cases, matrices, widths }, null, 2) + "\n",
);
console.log(
	`Recorded ${cases.length} original device-scale pages and ${matrices.length + widths.length} geometry projections`,
);
