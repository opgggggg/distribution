import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listBrushPlugins } from "../dist/brushes.js";
import { brushPasses } from "../dist/render.js";
import { NotesRustKernel } from "../dist/kernel/runtime.js";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const target = process.env.CARGO_TARGET_DIR || path.join(root, "target");
const cli = path.join(
	target,
	"debug",
	`cubeoffice-notes${process.platform === "win32" ? ".exe" : ""}`,
);
const module = await WebAssembly.compile(
	readFileSync(path.join(root, "packages/notes/src/kernel/notes-kernel.wasm")),
);
const kernel = new NotesRustKernel(module);
const shapes = [
	[{ x: 10, y: 20, pressure: 0.01 }],
	[
		{ x: 10, y: 20, pressure: 0.2 },
		{ x: 10, y: 20, pressure: 0.9 },
	],
	[
		{ x: 10, y: 20, pressure: 0.1 },
		{ x: 400, y: 320, pressure: 0.95 },
	],
	[
		{ x: 10, y: 10, pressure: 0 },
		{ x: 150, y: 10, pressure: 0.8 },
		{ x: 20, y: 10, pressure: 0.4 },
		{ x: 20, y: 100, pressure: 1 },
		{ x: 10, y: 20, pressure: 0.1 },
	],
	Array.from({ length: 61 }, (_, i) => ({
		x: -50 + i * 9,
		y: 100 + Math.sin(i * 0.31) * 40,
		pressure: 0.1 + (i % 17) / 20,
	})),
];
const strokes = [];
for (const plugin of listBrushPlugins())
	for (const version of new Set([1, plugin.version ?? 1]))
		for (const points of shapes)
			for (const pressure of [false, true]) {
				strokes.push({
					id: `画🎨-${plugin.id}-${strokes.length}`,
					kind: "stroke",
					tool: "pen",
					penStyle: plugin.id,
					brushVersion: version,
					brushSeed: 4294967295,
					color: "#abcD21",
					width: plugin.defaults.width,
					opacity: 0.63,
					pressure,
					points,
					brushSettings: Object.fromEntries(
						(plugin.parameters ?? []).map((p) => [p.id, p.default]),
					),
				});
			}
// Stable spray must retain old pigment even when its travel-based spacing increases.
strokes.push({
	...strokes.find((s) => s.penStyle === "spray" && s.brushVersion === 2),
	points: [
		{ x: 0, y: 0, pressure: 0.3 },
		{ x: 15000, y: 2, pressure: 0.8 },
	],
});
strokes.push({
	...strokes.find((s) => s.penStyle === "oil" && s.brushVersion === 2),
	points: shapes[4].map((p, i) => ({ ...p, width: 1 + i / 2 })),
	brushSettings: { bristles: 100 },
});
strokes.push({
	...strokes.find((s) => s.penStyle === "brush" && s.brushVersion === 2),
	brushSettings: { dryness: 0 },
	brushSeed: 0,
});
strokes.push({
	...strokes.find((s) => s.penStyle === "spray" && s.brushVersion === 2),
	brushSeed: undefined,
});
const native = execFileSync(cli, ["serve"], {
	input: strokes.map((stroke) => JSON.stringify({ op: "brushPasses", stroke })).join("\n") + "\n",
	maxBuffer: 128 * 1024 * 1024,
	encoding: "utf8",
})
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line));
function comparePaths(actual, expected, label) {
	assert.equal(
		actual.replace(/-?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi, "#"),
		expected.replace(/-?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi, "#"),
		`${label} commands`,
	);
	const numbers = (s) => s.match(/-?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi)?.map(Number) ?? [];
	const a = numbers(actual),
		b = numbers(expected);
	assert.equal(a.length, b.length, label);
	for (let i = 0; i < a.length; i++)
		assert.ok(Math.abs(a[i] - b[i]) < 0.010001, `${label} coordinate ${i}: ${a[i]} vs ${b[i]}`);
}
for (const [index, stroke] of strokes.entries()) {
	const expected = brushPasses(stroke),
		wasm = kernel.request({ op: "brushPasses", stroke }).passes;
	assert.ok(!native[index].error, JSON.stringify(native[index]));
	for (const [host, actual] of [
		["native", native[index].ok.passes],
		["wasm", wasm],
	]) {
		const label = `${host} ${stroke.penStyle} v${stroke.brushVersion} case ${index}`;
		assert.equal(actual.length, expected.length, label);
		for (let i = 0; i < actual.length; i++) {
			const { path: a, clip: ac, opacity: ao, ...am } = actual[i],
				{ path: b, clip: bc, opacity: bo, ...bm } = expected[i];
			assert.deepEqual(am, bm, label);
			assert.ok(Math.abs(ao - bo) < 1e-12, label);
			comparePaths(a, b, label);
			assert.equal(typeof ac, typeof bc, label);
			if (ac) comparePaths(ac, bc, label);
		}
	}
}
kernel.close();
console.log(
	`PASS ${strokes.length} brush fixtures: native and WASM match legacy/current geometry, pigment, pressure, dots, corners and seeded spray`,
);
