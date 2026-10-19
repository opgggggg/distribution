import test from "node:test";
import assert from "node:assert/strict";
import {
	createNotebook,
	uid,
	validateNotebook,
	writeNotebook,
	readNotebookState,
	writeXopp,
	NoteHistory,
	translate,
	hitStroke,
} from "../dist/index.js";
import { PathEraser } from "../dist/eraser.js";
import { resizeElements } from "../dist/manipulation.js";
import { brushPasses, pageSvg } from "../dist/render.js";
const ink = (style = "ballpoint") => ({
	id: uid(),
	kind: "stroke",
	tool: "pen",
	penStyle: style,
	brushVersion: 1,
	brushSeed: 123,
	color: "#2563eb",
	width: 12,
	opacity: 1,
	pressure: false,
	points: [
		{ x: 100, y: 100, pressure: 0.5 },
		{ x: 300, y: 100, pressure: 0.5 },
	],
});

test("path erasing crosses sparse strokes, preserves all brush geometry, and never mutates source pigment", () => {
	for (const style of ["ballpoint", "brush", "watercolor", "pencil", "spray", "oil"]) {
		const source = ink(style),
			before = structuredClone(source),
			eraser = new PathEraser([source], 20);
		eraser.add({ x: 200, y: 50 }, { x: 200, y: 150 });
		const result = eraser.updates.get(source.id);
		assert.ok(result, style);
		assert.deepEqual(source, before);
		assert.deepEqual(result.points, before.points);
		assert.deepEqual(
			brushPasses(result),
			brushPasses(before),
			`${style} retains original appearance outside the cut`,
		);
		assert.equal(result.erasures[0].width, 20);
		assert.equal(hitStroke(result, { x: 200, y: 100 }, 1), false);
		assert.equal(hitStroke(result, { x: 120, y: 100 }, 1), true);
	}
});
test("straight sweeps remain compact, repeated covered sweeps are no-ops, and images are protected", () => {
	const source = ink(),
		image = {
			id: uid(),
			kind: "image",
			src: "data:image/png;base64,AA==",
			x: 0,
			y: 0,
			width: 400,
			height: 400,
			opacity: 1,
		};
	const eraser = new PathEraser([source, image], 20);
	eraser.add({ x: 200, y: 80 });
	for (let y = 81; y <= 120; y++) eraser.add({ x: 200, y: y - 1 }, { x: 200, y });
	const result = eraser.updates.get(source.id);
	assert.equal(result.erasures.length, 1);
	assert.equal(result.erasures[0].points.length, 2);
	assert.equal(eraser.updates.has(image.id), false);
	const repeated = new PathEraser([result], 20);
	repeated.add({ x: 200, y: 80 }, { x: 200, y: 120 });
	assert.equal(repeated.updates.size, 0);
	const miss = new PathEraser([source], 20);
	miss.add({ x: 450, y: 500 }, { x: 470, y: 500 });
	assert.equal(miss.updates.size, 0);
});
test("a fully covered small mark is removed instead of leaving an invisible object", () => {
	const dot = { ...ink(), width: 2, points: [{ x: 100, y: 100, pressure: 0.5 }] };
	const eraser = new PathEraser([dot], 40);
	eraser.add({ x: 100, y: 100 });
	assert.equal(eraser.removed.has(dot.id), true);
	assert.equal(eraser.updates.size, 0);
	assert.equal(dot.erasures, undefined);
});
test("partial erasures survive native history, reopening, translation, and nonuniform resizing", async () => {
	const book = createNotebook(),
		stroke = ink();
	book.pages[0].layers[0].elements = [stroke];
	const history = new NoteHistory(book),
		eraser = new PathEraser([stroke], 20);
	eraser.add({ x: 200, y: 80 }, { x: 200, y: 120 });
	history.commitPage(book.pages[0].id, (p) => {
		p.layers[0].elements = [structuredClone(eraser.updates.get(stroke.id))];
	});
	assert.equal(history.document.pages[0].layers[0].elements[0].erasures.length, 1);
	const state = readNotebookState(
		new Uint8Array(await writeNotebook(history.document, history.capture()).arrayBuffer()),
	);
	const reopened = new NoteHistory(state.document, false, state.history);
	reopened.undo();
	assert.equal(reopened.document.pages[0].layers[0].elements[0].erasures, undefined);
	reopened.redo();
	const restored = reopened.document.pages[0].layers[0].elements[0];
	assert.match(pageSvg(reopened.document.pages[0]), /stroke-linecap="round"/);
	assert.throws(() => writeXopp(reopened.document), /cannot preserve path erasing/);
	const moved = structuredClone(restored);
	translate(moved, 12, -7);
	assert.deepEqual(moved.erasures[0].points[0], { x: 212, y: 77 });
	const scaled = structuredClone(restored);
	resizeElements(
		[scaled],
		{ x: 0, y: 0, width: 400, height: 400 },
		{ x: 0, y: 0, width: 800, height: 200 },
	);
	assert.equal(scaled.erasures[0].width, 40);
	assert.equal(scaled.erasures[0].height, 10);
	assert.deepEqual(scaled.erasures[0].points[0], { x: 400, y: 42 });
	book.pages[0].layers[0].elements = [scaled];
	assert.doesNotThrow(() => validateNotebook(book));
});
test("malformed eraser paths are rejected by native validation", () => {
	for (const erasure of [
		{ width: NaN, points: [{ x: 1, y: 1 }] },
		{ width: 20, height: -1, points: [{ x: 1, y: 1 }] },
		{ width: 20, points: [] },
		{ width: 20, points: [{ x: NaN, y: 1 }] },
		{ width: 0, points: [{ x: 1, y: 1 }] },
	]) {
		const book = createNotebook();
		book.pages[0].layers[0].elements = [{ ...ink(), erasures: [erasure] }];
		assert.throws(() => validateNotebook(book), /Invalid or unsupported/);
	}
});
