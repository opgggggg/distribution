import test from "node:test";
import assert from "node:assert/strict";
import {
	createNotebook,
	uid,
	tapePolygon,
	validateNotebook,
	writeNotebook,
	readNotebookState,
	writeXopp,
	NoteHistory,
	translate,
	getBrushPlugin,
} from "../dist/index.js";
import { resizeElements } from "../dist/manipulation.js";
import { brushPasses, pageSvg } from "../dist/render.js";
const ink = (style = "oil") => ({
	id: uid(),
	kind: "stroke",
	tool: "pen",
	penStyle: style,
	color: "#b45309",
	width: 24,
	opacity: 1,
	pressure: true,
	points: [
		{ x: 80, y: 180, pressure: 0.2 },
		{ x: 220, y: 220, pressure: 0.9 },
	],
});
test("spray is deterministic, bounded and covers the whole path; oil has pigment ridges; Chinese ink has dry texture", () => {
	const spray = ink("spray");
	spray.points[1].x = 4000;
	assert.deepEqual(brushPasses(spray), brushPasses(spray));
	const path = brushPasses(spray)[0].path;
	assert.ok((path.match(/Z/g) ?? []).length <= 5000);
	assert.match(path, /M39[89]\d/, "long spray strokes reach the end");
	assert.ok(brushPasses(ink()).some((p) => p.color && p.color !== "#b45309"));
	const brush = { ...ink("brush"), brushSettings: { dryness: 80 } };
	assert.ok(brushPasses(brush).some((p) => p.grain));
	assert.equal(getBrushPlugin("spray").parameters[0].id, "density");
});
test("tape footprints survive peeling, undo/redo, native history and transforms", async () => {
	const book = createNotebook(),
		history = new NoteHistory(book);
	const tape = { id: uid(), x: 150, y: 200, width: 100, height: 20, angle: 35 };
	history.commit((doc) => (doc.pages[0].tapes = [tape]));
	const stroke = { ...ink(), cutouts: [tapePolygon(tape)] };
	history.commit((doc) => doc.pages[0].layers[0].elements.push(stroke));
	history.commit((doc) => (doc.pages[0].tapes = []));
	assert.deepEqual(history.document.pages[0].layers[0].elements[0].cutouts, stroke.cutouts);
	history.undo();
	assert.equal(history.document.pages[0].tapes.length, 1);
	history.redo();
	const state = readNotebookState(
		new Uint8Array(await writeNotebook(history.document, history.capture()).arrayBuffer()),
	);
	const restored = new NoteHistory(state.document, false, state.history);
	restored.undo();
	assert.equal(restored.document.pages[0].tapes.length, 1);
	const moved = structuredClone(stroke),
		before = { ...moved.cutouts[0][0] };
	translate(moved, 12, -7);
	assert.equal(moved.cutouts[0][0].x, before.x + 12);
	assert.equal(moved.cutouts[0][0].y, before.y - 7);
	const scaled = structuredClone(stroke);
	resizeElements(
		[scaled],
		{ x: 0, y: 0, width: 300, height: 300 },
		{ x: 0, y: 0, width: 600, height: 150 },
	);
	assert.equal(scaled.cutouts[0][0].x, stroke.cutouts[0][0].x * 2);
	assert.equal(scaled.cutouts[0][0].y, stroke.cutouts[0][0].y / 2);
	assert.match(pageSvg(history.document.pages[0]), /<mask/);
	assert.throws(() => writeXopp(history.document), /cannot preserve masking tape/);
});
test("invalid tape geometry and mask payloads cannot enter native notes", () => {
	for (const tape of [{ x: NaN }, { width: -1 }, { angle: 999 }]) {
		const book = createNotebook();
		book.pages[0].tapes = [
			{ id: uid(), x: 150, y: 200, width: 100, height: 20, angle: 0, ...tape },
		];
		assert.throws(() => validateNotebook(book), /Invalid or unsupported/);
	}
	const book = createNotebook();
	book.pages[0].layers[0].elements = [{ ...ink(), cutouts: [[{ x: 0, y: 0 }]] }];
	assert.throws(() => validateNotebook(book), /Invalid or unsupported/);
});
