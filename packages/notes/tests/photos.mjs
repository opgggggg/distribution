import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createNotebook,
	uid,
	validateNotebook,
	writeNotebook,
	readNotebookState,
	NoteHistory,
	writeXopp,
	bounds,
	translate,
	lassoSelect,
} from "../dist/index.js";
import { resizeElements } from "../dist/manipulation.js";
import { pageContentBounds } from "../dist/board.js";
import { pageSvg } from "../dist/render.js";
import { unzipSync, strFromU8 } from "fflate";
const png =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhYQAAAAASUVORK5CYII=";
const image = (src = png) => ({
	id: uid(),
	kind: "image",
	src,
	x: 100,
	y: 100,
	width: 200,
	height: 100,
	opacity: 1,
});
test("embedded content and tracing backgrounds round-trip and export as images", async () => {
	const book = createNotebook("Photos", true),
		p = book.pages[0];
	p.background = { ...image(), x: -300, opacity: 0.35 };
	p.layers[0].elements.push(image());
	assert.equal(validateNotebook(book), book);
	const blob = writeNotebook(book);
	assert.deepEqual(readNotebookState(new Uint8Array(await blob.arrayBuffer())).document, book);
	assert.ok(pageContentBounds(p).x < -300);
	assert.match(pageSvg(p), /<image[^>]*opacity="0.35"/);
	assert.equal((pageSvg(p).match(/<image/g) || []).length, 2);
	assert.throws(() => writeXopp(book), /embedded photos/);
});
test("content photos are selectable, moveable and resizable", () => {
	const e = image();
	assert.deepEqual(bounds(e), { x: 100, y: 100, width: 200, height: 100 });
	assert.deepEqual(
		lassoSelect(
			[e],
			[
				{ x: 0, y: 0 },
				{ x: 500, y: 0 },
				{ x: 500, y: 500 },
				{ x: 0, y: 500 },
			],
		),
		[e.id],
	);
	translate(e, 20, 30);
	resizeElements([e], bounds(e), { x: 10, y: 20, width: 400, height: 200 });
	assert.deepEqual(bounds(e), { x: 10, y: 20, width: 400, height: 200 });
});
test("image validation rejects external sources, SVG and invalid geometry", () => {
	for (const change of [
		{ src: "https://example.com/image.png" },
		{ src: "data:image/svg+xml;base64,AAAA" },
		{ opacity: 2 },
		{ width: 0 },
		{ x: Infinity },
	]) {
		const book = createNotebook();
		book.pages[0].layers[0].elements.push({ ...image(), ...change });
		assert.throws(() => validateNotebook(book));
	}
});
test("200 drawing steps share the background and deduplicate saved history photos", async () => {
	const photo = image("data:image/jpeg;base64," + "A".repeat(400_000));
	const book = createNotebook("Tracing", true);
	book.pages[0].background = photo;
	const h = new NoteHistory(book);
	for (let i = 0; i < 200; i++)
		h.commitPage(book.pages[0].id, (p) =>
			p.layers[0].elements.push({
				id: uid(),
				kind: "text",
				x: i,
				y: 0,
				text: "a",
				color: "#000000",
				size: 12,
			}),
		);
	assert.equal(h.capture().past.length, 200);
	assert.equal(h.document.pages[0].background, photo);
	const archive = new Uint8Array(await writeNotebook(h.document, h.capture()).arrayBuffer());
	const history = strFromU8(unzipSync(archive)["history.json"]);
	assert.equal(
		history.includes(photo.src),
		false,
		"current photo is referenced from the document, never repeated in history",
	);
	const restored = readNotebookState(archive);
	assert.equal(restored.history.past.length, 200);
	const resumed = new NoteHistory(restored.document, false, restored.history);
	for (let i = 0; i < 200; i++) resumed.undo();
	assert.equal(resumed.document.pages[0].layers[0].elements.length, 0);
	assert.equal(resumed.document.pages[0].background.src, photo.src);
	resumed.redo();
	assert.equal(resumed.document.pages[0].layers[0].elements.length, 1);
});
test("history retains removed/replaced images without the current page source", async () => {
	const book = createNotebook();
	const e = image();
	book.pages[0].layers[0].elements.push(e);
	const h = new NoteHistory(book);
	h.commitPage(book.pages[0].id, (p) => {
		p.layers[0].elements = [];
	});
	const restored = readNotebookState(
		new Uint8Array(await writeNotebook(h.document, h.capture()).arrayBuffer()),
	);
	const resumed = new NoteHistory(restored.document, false, restored.history);
	resumed.undo();
	assert.equal(resumed.document.pages[0].layers[0].elements[0].src, png);
});
