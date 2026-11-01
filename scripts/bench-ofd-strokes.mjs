/** Desktop comparison only; not a physical-device frame-rate measurement. */
import { originalOfdModule } from "./ofd-render-oracle.mjs";
import { svgAtDeviceScale } from "../packages/ofd/dist/strokes.js";
const original = await originalOfdModule("strokes");
const svg =
	'<svg xmlns="http://www.w3.org/2000/svg">' +
	Array.from(
		{ length: 10000 },
		(_, i) =>
			`<path data-ofd-line-width="${i % 2 ? ".001" : "0"}" data-ofd-stroke-scale=".5" data-ofd-miter-length="3.528" stroke-width="1" stroke-miterlimit="3" d="M 0 0 L 10 10"/>`,
	).join("") +
	"</svg>";
const timings = { original: [], rust: [] };
for (const rewrite of [original.svgAtDeviceScale, svgAtDeviceScale]) rewrite(svg, 2);
for (let i = 0; i < 5; i++)
	for (const [key, rewrite] of [
		["original", original.svgAtDeviceScale],
		["rust", svgAtDeviceScale],
	]) {
		globalThis.gc?.();
		const start = performance.now(),
			output = rewrite(svg, 2);
		timings[key].push(performance.now() - start);
		const widths = [...output.matchAll(/stroke-width="([^" ]+)"/g)].map((m) => Number(m[1]));
		if (
			widths.length !== 10000 ||
			widths.some((value, i) => Math.abs(value - (i % 2 ? 2 : 1) / (96 / 25.4)) > 1e-12)
		)
			throw Error("Benchmark geometry mismatch");
	}
const median = (a) => [...a].sort((a, b) => a - b)[2];
console.log(
	JSON.stringify({
		workload: "10000 device-scale stroke attributes",
		unit: "ms",
		environment: `${process.platform}/${process.arch} Node ${process.versions.node}`,
		medianOriginal: median(timings.original),
		medianRust: median(timings.rust),
		samples: timings,
	}),
);
