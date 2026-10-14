import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createNotebook,
	readNotebookState,
	writeNotebook,
	writeXopp,
	NoteHistory,
} from "../dist/index.js";
import { pageContentBounds } from "../dist/board.js";
import { pageSvg } from "../dist/render.js";
import { snapMove } from "../dist/manipulation.js";
const ink = (x, y) => ({
	id: crypto.randomUUID(),
	kind: "stroke",
	tool: "pen",
	color: "#2563eb",
	width: 12,
	opacity: 1,
	pressure: false,
	points: [
		{ x, y, pressure: 0.5 },
		{ x: x + 60, y: y + 20, pressure: 0.5 },
	],
});
test("unbounded world coordinates, negative scenes and tape survive native history save/reopen", async () => {
	const book = createNotebook("Infinite", true),
		history = new NoteHistory(book, false);
	history.commit((doc) => {
		const p = doc.pages[0];
		p.layers[0].elements.push(ink(-20000, -40000));
		p.scenes = [
			{
				id: crypto.randomUUID(),
				name: "Outside paper",
				x: -21000,
				y: -41000,
				width: 2000,
				height: 2000,
			},
		];
		p.tapes = [
			{ id: crypto.randomUUID(), x: -20000, y: -40000, width: 200, height: 20, angle: 30 },
		];
	});
	history.commit((doc) => doc.pages[0].layers[0].elements.push(ink(50000, 60000)));
	const blob = writeNotebook(history.document, history.capture()),
		restored = readNotebookState(new Uint8Array(await blob.arrayBuffer()));
	const next = new NoteHistory(restored.document, false, restored.history);
	assert.equal(next.document.pages[0].infinite, true);
	assert.equal(next.document.pages[0].layers[0].elements.length, 2);
	next.undo();
	assert.equal(next.document.pages[0].layers[0].elements.length, 1);
	next.redo();
	assert.deepEqual(next.document, history.document);
	const area = pageContentBounds(next.document.pages[0]);
	assert.ok(
		area.x < -20000 &&
			area.y < -40000 &&
			area.x + area.width > 50060 &&
			area.y + area.height > 60020,
	);
	assert.match(pageSvg(next.document.pages[0]), /viewBox="-200/);
	assert.throws(() => writeXopp(next.document), /too large for Xournal/);
});
test("infinite selection moves beyond all former page edges, bounded imports retain constraints", () => {
	const b = createNotebook("Infinite", true),
		p = b.pages[0],
		e = ink(10, 10);
	p.layers[0].elements.push(e);
	assert.deepEqual(snapMove(p, [e.id], -20000, 30000, 5, false, false), {
		dx: -20000,
		dy: 30000,
		guides: [],
	});
	p.infinite = false;
	const finite = snapMove(p, [e.id], -20000, 30000, 5, false, false);
	assert.ok(finite.dx > -100 && finite.dy < 1000);
});
test("legacy finite export and old native expandable mode retain their coordinates", async () => {
	const b = createNotebook("Old"),
		p = b.pages[0];
	p.layers[0].elements.push(ink(100, 100));
	assert.deepEqual(pageContentBounds(p), { x: 0, y: 0, width: p.width, height: p.height });
	delete p.infinite;
	const copy = readNotebookState(new Uint8Array(await writeNotebook(b).arrayBuffer())).document;
	assert.equal(copy.pages[0].infinite, undefined);
	assert.ok(pageContentBounds(copy.pages[0]).width < 595);
	assert.deepEqual(copy.pages[0].layers[0].elements, p.layers[0].elements);
});
