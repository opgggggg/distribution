import test from "node:test";
import assert from "node:assert/strict";
import { loadPsd, makeDocument, rasterLayer, solidBitmap, pixelAt } from "./helpers.mjs";
const p = await loadPsd();
function fixture() {
	const base = solidBitmap(p, 32, 16, 20, 50, 90);
	for (let y = 0; y < 16; y++)
		for (let x = 0; x < 16; x++) base.data.set([200, 80, 40, 255], (y * 32 + x) * 4);
	return new p.PsdEditorSession(
		makeDocument(
			p,
			[
				rasterLayer(p, "base", "Base", { bitmap: base }),
				rasterLayer(p, "target", "Target", {
					left: 20,
					top: 4,
					bitmap: solidBitmap(p, 2, 2, 0, 0, 0, 0),
				}),
			],
			{ width: 32, height: 16 },
		),
	);
}
const stroke = {
	type: "stroke.apply",
	layerId: "target",
	tool: "clone",
	points: [{ x: 24, y: 8 }],
	size: 4,
	sourceOffset: { dx: -20, dy: 0 },
	sampleAllLayers: true,
};
function docPixel(s, x, y) {
	const l = s.peekDocument().layers[1];
	return pixelAt(l.bitmap, x - l.left, y - l.top);
}
test("clone samples merged canvas outside target bounds and saves/undoes without touching source", () => {
	const s = fixture(),
		original = s.peekDocument().layers[0].bitmap.data.slice();
	s.apply([stroke]);
	assert.deepEqual(docPixel(s, 24, 8), [200, 80, 40, 255]);
	assert.deepEqual(s.peekDocument().layers[0].bitmap.data, original);
	const saved = p.readPsd(p.writePsd(s.peekDocument()));
	assert.deepEqual(saved.layers[1].bitmap.data, s.peekDocument().layers[1].bitmap.data);
	s.undo();
	assert.equal(s.peekDocument().layers[1].bitmap.width, 2);
	s.redo();
	assert.deepEqual(docPixel(s, 24, 8), [200, 80, 40, 255]);
});
test("clone current-layer sampling excludes other layers and merged sampling honors hidden layers", () => {
	const s = fixture();
	s.apply([{ ...stroke, sampleAllLayers: false }]);
	assert.equal(docPixel(s, 24, 8)[3], 0);
	const t = fixture();
	t.apply([{ type: "layer.setVisible", layerId: "base", visible: false }, stroke]);
	assert.equal(docPixel(t, 24, 8)[3], 0);
});
test("clone merged source remains immutable across overlapping dabs and selection constrains writes", () => {
	const bitmap = p.createPsdBitmap(16, 4);
	for (let y = 0; y < 4; y++)
		for (let x = 0; x < 16; x++) bitmap.data.set([x * 10, 0, 0, 255], (y * 16 + x) * 4);
	const s = new p.PsdEditorSession(
		makeDocument(p, [rasterLayer(p, "target", "Target", { bitmap })], { width: 16, height: 4 }),
	);
	s.apply([
		{ type: "selection.set", shape: "rectangle", x: 6, y: 0, width: 3, height: 4 },
		{
			...stroke,
			points: [
				{ x: 4, y: 2 },
				{ x: 12, y: 2 },
			],
			sourceOffset: { dx: -2, dy: 0 },
			size: 4,
		},
	]);
	const out = s.peekDocument().layers[0].bitmap;
	assert.equal(pixelAt(out, 7, 2)[0], 50);
	assert.equal(pixelAt(out, 10, 2)[0], 100);
	assert.equal(pixelAt(bitmap, 7, 2)[0], 70);
});
test("clone merged sampling rejects locked targets and non-clone sampling options atomically", () => {
	const s = fixture();
	s.apply([{ type: "layer.setLocked", layerId: "target", locked: true }]);
	assert.throws(() => s.apply([stroke]), /locked/);
	assert.throws(
		() => s.apply([{ ...stroke, tool: "brush", color: { r: 0, g: 0, b: 0 } }]),
		/only supported for clone/,
	);
});
