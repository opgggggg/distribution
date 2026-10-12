import test from "node:test";
import assert from "node:assert/strict";
import {
	createNotebook,
	clone,
	validateNotebook,
	writeNotebook,
	readNotebook,
} from "../dist/index.js";
import { shapePoints, bounds } from "../dist/geometry.js";
import {
	anchorPoint,
	connectorPoints,
	refreshConnections,
	resizeElements,
	snapMove,
} from "../dist/manipulation.js";
const rectangle = (id, x, y, w = 80, h = 60) => ({
	id,
	kind: "stroke",
	tool: "pen",
	shape: "rectangle",
	width: 2,
	color: "#222b40",
	opacity: 1,
	pressure: false,
	points: shapePoints("rectangle", { x, y }, { x: x + w, y: y + h }),
});
const setup = () => {
	const book = createNotebook();
	const p = book.pages[0];
	p.layers[0].elements = [rectangle("a", 40, 100), rectangle("b", 240, 100)];
	return book;
};
test("connected shapes and named views retain editable metadata in native files", async () => {
	const book = setup(),
		p = book.pages[0],
		[a, b] = p.layers[0].elements;
	p.layers[0].elements.push({
		id: "edge",
		kind: "stroke",
		tool: "pen",
		color: "#2563eb",
		width: 2,
		pressure: false,
		opacity: 1,
		points: connectorPoints(anchorPoint(a, "right"), anchorPoint(b, "left")),
		connector: {
			from: { elementId: "a", side: "right" },
			to: { elementId: "b", side: "left" },
		},
	});
	p.scenes = [{ id: "scene", name: "Plan", x: 20, y: 60, width: 320, height: 180 }];
	assert.deepEqual(
		readNotebook(new Uint8Array(await (await writeNotebook(book)).arrayBuffer())),
		book,
	);
	const old = p.layers[0].elements[2].points[0].x;
	resizeElements([a], bounds(a), { x: 80, y: 160, width: 120, height: 80 });
	refreshConnections(p);
	assert.notEqual(p.layers[0].elements[2].points[0].x, old);
	p.layers[0].elements = p.layers[0].elements.filter((e) => e.id !== "a");
	refreshConnections(p);
	assert.equal(p.layers[0].elements.length, 1);
	assert.doesNotThrow(() => validateNotebook(book));
});
test("invalid relationships, anchors and named views are rejected", () => {
	for (const mutate of [
		(p) => (p.scenes = [{ id: "scene", name: "", x: 0, y: 0, width: 20, height: 20 }]),
		(p) => (p.scenes = [{ id: "scene", name: "bad", x: 0, y: 0, width: Infinity, height: 20 }]),
		(p) =>
			(p.layers[0].elements[0].connector = {
				from: { elementId: "missing", side: "right" },
				to: { elementId: "b", side: "left" },
			}),
		(p) => (p.layers[0].elements[0].shape = "triangle"),
	]) {
		const b = setup();
		mutate(b.pages[0]);
		assert.throws(() => validateNotebook(b));
	}
});
test("object alignment, optional grid and equal spacing snap within predictable thresholds", () => {
	const p = setup().pages[0];
	const snapped = snapMove(p, ["a"], 30, 3, 6, false, true);
	assert.equal(snapped.dy, 0);
	assert.ok(snapped.guides.some((g) => g.axis === "y"));
	const raw = snapMove(p, ["a"], 7, 9, 6, false, false);
	assert.deepEqual(raw, { dx: 7, dy: 9, guides: [] });
	const grid = snapMove(p, ["a"], 7, 9, 6, true, false);
	assert.equal((bounds(p.layers[0].elements[0]).x + grid.dx) % 20, 0);
	p.layers[0].elements = [
		rectangle("a", 202, 100, 40),
		rectangle("left", 40, 100, 80),
		rectangle("right", 320, 100, 80),
	];
	const gaps = snapMove(p, ["a"], 0, 0, 6, false, true);
	assert.ok(gaps.guides.some((g) => g.label));
});
