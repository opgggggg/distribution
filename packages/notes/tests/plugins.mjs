import test from "node:test";
import assert from "node:assert/strict";
import {
	createNotebook,
	uid,
	inkWidth,
	validateNotebook,
	listBrushPlugins,
	getBrushPlugin,
	registerBrushPlugin,
	subscribeBrushPlugins,
	brushDefaults,
	writeNotebook,
	readNotebook,
	readNotebookState,
	writeXopp,
	NoteHistory,
} from "../dist/index.js";
import { brushPasses, pageSvg } from "../dist/render.js";

const stroke = (penStyle, extra = {}) => ({
	id: uid(),
	kind: "stroke",
	tool: "pen",
	color: "#dc3658",
	width: 12,
	opacity: 0.7,
	pressure: true,
	penStyle,
	points: [
		{ x: 80, y: 100, pressure: 0.2 },
		{ x: 180, y: 100, pressure: 0.8 },
	],
	...extra,
});
test("new built-in brushes retain distinct pigment, pressure and angled nib geometry", () => {
	assert.equal(listBrushPlugins().length, 10);
	const marker = stroke("marker"),
		crayon = stroke("crayon"),
		reed = stroke("reed", { brushSettings: { angle: 0 } });
	assert.equal(brushPasses(marker).length, 1);
	assert.ok(brushPasses(crayon).some((p) => p.grain));
	assert.notDeepEqual(brushPasses(crayon), brushPasses(stroke("pencil")));
	assert.ok(
		inkWidth(crayon, crayon.points[1]) / inkWidth(crayon, crayon.points[0]) >
			inkWidth(marker, marker.points[1]) / inkWidth(marker, marker.points[0]),
	);
	const span = (path) => {
		const ys = [...path.matchAll(/[-\d.]+,([-\d.]+)/g)].map((m) => Number(m[1]));
		return Math.max(...ys) - Math.min(...ys);
	};
	assert.ok(
		span(brushPasses({ ...reed, brushSettings: { angle: 90 } })[0].path) >
			span(brushPasses(reed)[0].path) * 4,
	);
	const book = createNotebook();
	book.pages[0].layers[0].elements = [marker, crayon, reed];
	assert.match(pageSvg(book.pages[0]), /pattern/);
	assert.throws(() => writeXopp(book), /cannot preserve/);
});
test("brush parameter data and history survive a native round trip; invalid parameters cannot enter a notebook", async () => {
	const book = createNotebook();
	const history = new NoteHistory(book);
	history.commit((doc) =>
		doc.pages[0].layers[0].elements.push(stroke("reed", { brushSettings: { angle: 75 } })),
	);
	history.commit((doc) => doc.pages[0].layers[0].elements.push(stroke("crayon")));
	history.undo();
	const blob = writeNotebook(history.document, history.capture());
	const state = readNotebookState(new Uint8Array(await blob.arrayBuffer()));
	const reopened = state.document;
	const restored = new NoteHistory(reopened, false, state.history);
	assert.equal(restored.canRedo(), true);
	restored.redo();
	assert.equal(restored.document.pages[0].layers[0].elements[1].penStyle, "crayon");
	restored.undo();
	assert.deepEqual(reopened, history.document);
	assert.equal(reopened.pages[0].layers[0].elements[0].brushSettings.angle, 75);
	for (const settings of [{ angle: 181 }, { angle: NaN }, { unknown: 45 }]) {
		const invalid = structuredClone(book);
		invalid.pages[0].layers[0].elements = [stroke("reed", { brushSettings: settings })];
		assert.throws(() => validateNotebook(invalid), /Invalid or unsupported/);
	}
});
test("a namespaced application plugin participates in validation, rendering and native files without core changes", async () => {
	let updates = 0;
	const unsubscribe = subscribeBrushPlugins(() => updates++);
	const plugin = {
		...getBrushPlugin("pencil"),
		id: "test:charcoal",
		label: "测试炭笔",
		labelEn: "Test charcoal",
		parameters: [
			{
				id: "softness",
				label: "柔软度",
				labelEn: "Softness",
				min: 0,
				max: 100,
				step: 5,
				default: 50,
			},
		],
		render: (s, g) => [
			{
				path: g.path(0.8),
				opacity: s.opacity * (s.brushSettings.softness / 100),
				grain: true,
			},
		],
	};
	registerBrushPlugin(plugin);
	unsubscribe();
	assert.equal(updates, 1);
	assert.deepEqual(brushDefaults(plugin.id), { softness: 50 });
	assert.throws(() => registerBrushPlugin(plugin), /duplicate/);
	assert.throws(() => registerBrushPlugin({ ...plugin, id: "charcoal" }), /Invalid/);
	const book = createNotebook();
	const ink = stroke(plugin.id, { brushSettings: { softness: 70 } });
	book.pages[0].layers[0].elements = [ink];
	assert.ok(Math.abs(brushPasses(ink)[0].opacity - 0.49) < 1e-10);
	assert.match(pageSvg(book.pages[0]), /ink-dc3658-grain/);
	assert.deepEqual(readNotebook(new Uint8Array(await writeNotebook(book).arrayBuffer())), book);
	assert.throws(() => writeXopp(book), /cannot preserve/);
	const unavailable = structuredClone(book);
	unavailable.pages[0].layers[0].elements[0].penStyle = "uninstalled:brush";
	assert.throws(() => validateNotebook(unavailable), /Invalid or unsupported/);
});
