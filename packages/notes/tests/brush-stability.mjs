import { preservePigmentIdentity } from "../dist/brushes/pigment.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
	createNotebook,
	writeNotebook,
	readNotebook,
	getBrushPlugin,
	validateNotebook,
} from "../dist/index.js";
import { brushPasses, pageSvg } from "../dist/render.js";
const stroke = (style, version = 2) => ({
	id: `stable-${style}`,
	kind: "stroke",
	tool: "pen",
	penStyle: style,
	brushVersion: version,
	color: "#265d74",
	width: 24,
	opacity: 1,
	pressure: true,
	brushSettings: style === "brush" ? { dryness: 40 } : {},
	points: [
		{ x: 30, y: 60, pressure: 0.5 },
		{ x: 430, y: 60, pressure: 0.7 },
	],
});
test("extended spray retains every earlier particle, even across long-stroke density limits", async () => {
	const spray = { ...stroke("spray"), brushSeed: 987654321 },
		before = brushPasses(spray).map((p) => p.path);
	// Extending this line crosses the old global 5000-particle threshold.
	spray.points.push({ x: 4000, y: 180, pressure: 0.6 });
	const after = brushPasses(spray);
	after.forEach((pass, i) => assert.ok(pass.path.startsWith(before[i])));
	assert.deepEqual(
		after,
		brushPasses(structuredClone(spray)),
		"incremental cache and cold render agree",
	);
	const book = createNotebook();
	book.pages[0].layers[0].elements = [spray];
	const reopened = readNotebook(new Uint8Array(await writeNotebook(book).arrayBuffer()));
	assert.deepEqual(brushPasses(reopened.pages[0].layers[0].elements[0]), after);
	const duplicate = structuredClone(spray);
	duplicate.id = "copied-spray";
	assert.deepEqual(brushPasses(duplicate), after, "copying ink preserves its pigment pattern");
	const savedSvg = pageSvg(book.pages[0]);
	const second = stroke("spray");
	second.id = "another-spray";
	second.points[0].y = 300;
	second.points[1].y = 400;
	book.pages[0].layers[0].elements.push(second);
	brushPasses(second);
	book.pages[0].layers[0].elements.pop();
	assert.equal(pageSvg(book.pages[0]), savedSvg, "another stroke cannot alter existing spray");
});
test("new materials have distinct geometry and pigment; legacy ink retains its renderer", () => {
	const styles = [
		"ballpoint",
		"fountain",
		"brush",
		"pencil",
		"watercolor",
		"marker",
		"crayon",
		"reed",
		"oil",
		"spray",
	];
	const signatures = styles.map((style) => {
		const s = stroke(style, getBrushPlugin(style).version ?? 1);
		if (style === "ballpoint") s.pressure = false;
		return JSON.stringify(brushPasses(s));
	});
	assert.equal(new Set(signatures).size, styles.length);
	assert.ok(brushPasses(stroke("oil")).length >= 20);
	assert.ok(brushPasses(stroke("crayon")).some((p) => p.texture === "wax"));
	assert.ok(brushPasses(stroke("watercolor")).some((p) => p.texture === "paper"));
	assert.ok(brushPasses(stroke("brush")).some((p) => p.clip));
	for (const style of ["oil", "spray", "pencil", "crayon", "watercolor", "marker", "brush"]) {
		const old = stroke(style, 1),
			implicit = structuredClone(old);
		delete implicit.brushVersion;
		assert.deepEqual(brushPasses(old), brushPasses(implicit));
		assert.notDeepEqual(
			brushPasses(old),
			brushPasses(stroke(style)),
			`${style} revision is visible`,
		);
	}
});
test("unsupported rendering revisions are rejected instead of silently changing old ink", () => {
	const book = createNotebook();
	book.pages[0].layers[0].elements = [stroke("oil", 999)];
	assert.throws(() => validateNotebook(book), /Invalid/);
});

test("copying legacy spray binds its original pigment before the element ID changes", () => {
	const old = stroke("spray", 1),
		copy = structuredClone(old);
	const before = brushPasses(old);
	preservePigmentIdentity(copy);
	copy.id = "legacy-copy";
	assert.deepEqual(brushPasses(copy), before);
});
