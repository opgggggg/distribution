import test from "node:test";
import assert from "node:assert/strict";
import { photoBounds, photoLocal, photoCenter, transformPhoto } from "../dist/photo-geometry.js";
import { createNotebook, validateNotebook } from "../dist/model.js";
import { NoteHistory } from "../dist/history.js";
import { writeNotebook, readNotebook } from "../dist/codec.js";
import { pageSvg } from "../dist/render.js";
const src =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const image = () => ({
	id: "background",
	kind: "image",
	src,
	x: 20,
	y: 30,
	width: 200,
	height: 100,
	opacity: 0.35,
});
test("rotated background bounds, inverse picking and gesture pivot stay consistent", () => {
	const p = { ...image(), angle: 90 };
	const b = photoBounds(p);
	assert.ok(
		Math.abs(b.x - 70) < 1e-8 &&
			Math.abs(b.y + 20) < 1e-8 &&
			Math.abs(b.width - 100) < 1e-8 &&
			Math.abs(b.height - 200) < 1e-8,
	);
	assert.deepEqual(photoLocal(p, { x: 120, y: 80 }), { x: 100, y: 50 });
	const moved = transformPhoto(image(), { x: 20, y: 30 }, 2, 90, { x: 5, y: 8 });
	assert.ok(Math.abs(moved.x + 275) < 1e-8 && Math.abs(moved.y - 138) < 1e-8);
	assert.equal(moved.width, 400);
	assert.equal(moved.height, 200);
	assert.equal(moved.angle, 90);
	const local = photoLocal(moved, { x: 25, y: 38 });
	assert.ok(
		Math.abs(local.x) < 1e-8 && Math.abs(local.y) < 1e-8,
		"image corner remains at translated gesture pivot",
	);
});
test("background rotation survives native archive, history, undo/redo and SVG export", async () => {
	const book = createNotebook("Background", true);
	book.pages[0].background = image();
	const h = new NoteHistory(book);
	h.commitPage(book.pages[0].id, (p) => (p.background = { ...p.background, angle: 37 }));
	assert.equal(h.document.pages[0].background.angle, 37);
	h.undo();
	assert.equal(h.document.pages[0].background.angle, undefined);
	h.redo();
	const restored = await readNotebook(
		new Uint8Array(await writeNotebook(h.document).arrayBuffer()),
	);
	assert.equal(restored.pages[0].background.angle, 37);
	assert.match(pageSvg(restored.pages[0]), /transform="rotate\(37 120 80\)"/);
	h.commitPage(book.pages[0].id, (p) => (p.layers[0].name = "drawing"));
	assert.equal(h.document.pages[0].background.angle, 37);
	assert.throws(() =>
		validateNotebook({
			...book,
			pages: [{ ...book.pages[0], background: { ...image(), angle: NaN } }],
		}),
	);
});
