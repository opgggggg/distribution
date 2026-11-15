import test from "node:test";
import assert from "node:assert/strict";
import { loadPsd, makeDocument, rasterLayer, solidBitmap, pixelAt } from "./helpers.mjs";
const p = await loadPsd();
function session() {
	const bitmap = solidBitmap(p, 8, 8, 80, 120, 160);
	for (let i = 0; i < 64; i++) bitmap.data[i * 4] = (i % 2) * 255;
	return new p.PsdEditorSession(
		makeDocument(p, [rasterLayer(p, "L1", "Pixels", { bitmap })], { width: 8, height: 8 }),
	);
}
const mask = (operation) => ({ type: "layer.mask", layerId: "L1", operation });
const stroke = (color, extra = {}) => ({
	type: "stroke.apply",
	layerId: "L1",
	target: "mask",
	tool: "brush",
	points: [{ x: 4, y: 4 }],
	size: 4,
	hardness: 1,
	opacity: 1,
	color: { r: color, g: color, b: color },
	...extra,
});
test("mask brush and eraser modify only coverage, selection and undo are respected", () => {
	const s = session(),
		original = s.peekDocument().layers[0].bitmap;
	s.apply([mask("reveal-all")]);
	const initial = s.peekDocument().layers[0].mask;
	s.apply([stroke(0)]);
	const painted = s.peekDocument().layers[0].mask;
	assert.equal(painted.data[4 * 8 + 4], 0);
	assert.equal(initial.data[4 * 8 + 4], 255);
	assert.equal(s.peekDocument().layers[0].bitmap, original);
	assert.equal(p.composePsdDocument(s.peekDocument()).data[(4 * 8 + 4) * 4 + 3], 0);
	s.undo();
	assert.equal(s.peekDocument().layers[0].mask.data[36], 255);
	s.redo();
	s.apply([stroke(0, { tool: "eraser" })]);
	assert.equal(s.peekDocument().layers[0].mask.data[36], 255);
	s.apply([
		{ type: "selection.set", shape: "rectangle", x: 0, y: 0, width: 2, height: 2 },
		stroke(0),
	]);
	assert.equal(s.peekDocument().layers[0].mask.data[36], 255);
	const restored = p.readPsd(p.writePsd(s.peekDocument()));
	assert.deepEqual(restored.layers[0].mask.data, s.peekDocument().layers[0].mask.data);
});
test("mask feather, independent transform and linkage survive save and undo", () => {
	const s = session();
	s.apply([mask("hide-all"), stroke(255)]);
	const before = s.peekDocument().layers[0].mask.data;
	s.apply([{ type: "mask.edit", layerId: "L1", operation: "feather", radius: 2 }]);
	assert.ok(s.peekDocument().layers[0].mask.data.some((v) => v > 0 && v < 255));
	assert.notDeepEqual(s.peekDocument().layers[0].mask.data, before);
	s.apply([mask("unlink"), { type: "layer.move", layerId: "L1", dx: 2, dy: 1 }]);
	assert.equal(s.peekDocument().layers[0].mask.left, 0);
	assert.equal(s.peekDocument().layers[0].left, 2);
	s.apply([
		{ type: "mask.edit", layerId: "L1", operation: "transform", matrix: [1, 0, 0, 1, 3, 4] },
	]);
	assert.equal(s.peekDocument().layers[0].mask.left, 3);
	assert.equal(s.peekDocument().layers[0].left, 2);
	const doc = p.readPsd(p.writePsd(s.peekDocument()));
	assert.equal(doc.layers[0].mask.linked, false);
	assert.equal(doc.layers[0].mask.top, 4);
	s.undo();
	assert.equal(s.peekDocument().layers[0].mask.left, 0);
	assert.throws(
		() => s.apply([{ type: "mask.edit", layerId: "L1", operation: "fill" }]),
		/requires value/,
	);
	assert.throws(
		() =>
			s.apply([
				{
					type: "mask.edit",
					layerId: "L1",
					operation: "transform",
					matrix: [0, 0, 0, 0, 0, 0],
				},
			]),
		/non-zero area/,
	);
});
test("scale down, save/reopen, scale up recovers exact original pixels", () => {
	let s = session();
	const original = s.peekDocument().layers[0].bitmap.data.slice();
	s.apply([{ type: "layer.scale", layerId: "L1", width: 2, height: 2 }]);
	assert.equal(s.peekDocument().layers[0].sourceTransform.source.width, 8);
	const doc = p.readPsd(p.writePsd(s.peekDocument()));
	assert.ok(doc.editable);
	assert.equal(doc.layers[0].sourceTransform.source.width, 8);
	s = new p.PsdEditorSession(doc);
	s.apply([{ type: "layer.scale", layerId: doc.layers[0].id, width: 8, height: 8 }]);
	assert.deepEqual(s.peekDocument().layers[0].bitmap.data, original);
	s.undo();
	assert.equal(s.peekDocument().layers[0].bitmap.width, 2);
	s.redo();
	assert.deepEqual(s.peekDocument().layers[0].bitmap.data, original);
});
test("inverse transforms and image edits invalidate stale source correctly", () => {
	const s = session(),
		original = s.peekDocument().layers[0].bitmap.data.slice();
	s.apply([
		{ type: "transform.apply", layerId: "L1", operation: "rotate-90" },
		{ type: "transform.apply", layerId: "L1", operation: "rotate-270" },
	]);
	assert.deepEqual(s.peekDocument().layers[0].bitmap.data, original);
	s.apply([
		{ type: "layer.scale", layerId: "L1", width: 4, height: 4 },
		{ type: "fill.apply", layerId: "L1", color: { r: 23, g: 44, b: 66 } },
	]);
	let doc = p.readPsd(p.writePsd(s.peekDocument()));
	assert.equal(doc.layers[0].sourceTransform, undefined);
	s.apply([{ type: "layer.scale", layerId: "L1", width: 8, height: 8 }]);
	assert.deepEqual(pixelAt(s.peekDocument().layers[0].bitmap, 4, 4), [23, 44, 66, 255]);
});
test("curves are live independent adjustment layers with opacity, mask, undo and native PSD block", () => {
	const s = session(),
		original = s.peekDocument().layers[0].bitmap.data.slice(),
		curves = p.identityCurves();
	curves.rgb = [
		{ x: 0, y: 255 },
		{ x: 255, y: 0 },
	];
	const result = s.apply([{ type: "curves.set", curves }]);
	const id = result.createdIds[0];
	assert.equal(s.peekDocument().layers[1].bitmap.width, 0);
	assert.deepEqual(s.peekDocument().layers[0].bitmap.data, original);
	assert.equal(pixelAt(p.composePsdDocument(s.peekDocument()), 0, 0)[0], 255);
	s.apply([{ type: "layer.setOpacity", layerId: id, opacity: 0.5 }]);
	assert.equal(pixelAt(p.composePsdDocument(s.peekDocument()), 0, 0)[0], 128);
	s.apply([{ type: "layer.mask", layerId: id, operation: "hide-all" }]);
	assert.equal(pixelAt(p.composePsdDocument(s.peekDocument()), 0, 0)[0], 0);
	s.undo();
	const bytes = p.writePsd(s.peekDocument());
	assert.ok(Buffer.from(bytes).includes(Buffer.from("curv")));
	const doc = p.readPsd(bytes);
	assert.ok(doc.editable, doc.openWarnings.join(";"));
	assert.deepEqual(doc.layers[1].curves, curves);
	assert.deepEqual(p.composePsdDocument(doc).data, p.composePsdDocument(s.peekDocument()).data);
	s.undo();
	s.undo();
	assert.equal(s.peekDocument().layers.length, 1);
	s.redo();
	assert.equal(s.peekDocument().layers.length, 2);
});
test("curve channel validation is atomic and clipped curves affect only the base", () => {
	const s = session(),
		curves = p.identityCurves();
	curves.red = [
		{ x: 0, y: 255 },
		{ x: 255, y: 0 },
	];
	let id = s.apply([{ type: "curves.set", curves }]).createdIds[0];
	s.apply([{ type: "layer.setClipping", layerId: id, clipping: true }]);
	assert.deepEqual(pixelAt(p.composePsdDocument(s.peekDocument()), 0, 0), [255, 120, 160, 255]);
	assert.throws(
		() => s.apply([{ type: "fill.apply", layerId: id, color: { r: 0, g: 0, b: 0 } }]),
		/pixel layer/,
	);
	const invalid = p.identityCurves();
	invalid.rgb = [
		{ x: 100, y: 0 },
		{ x: 10, y: 20 },
	];
	assert.throws(
		() => s.apply([{ type: "curves.set", layerId: id, curves: invalid }]),
		/increasing/,
	);
	assert.deepEqual(s.peekDocument().layers[1].curves, curves);
});
test("whole-canvas transforms preserve group masks and live adjustments; merge keeps curves", () => {
	const s = session();
	s.apply([mask("reveal-all"), stroke(0)]);
	const id = s.apply([{ type: "curves.set", curves: p.identityCurves() }]).createdIds[0];
	const group = s.apply([{ type: "layer.group", layerIds: ["L1", id] }]).createdIds[0];
	s.apply([{ type: "layer.mask", layerId: group, operation: "reveal-all" }]);
	const before = p.composePsdDocument(s.peekDocument()).data.slice();
	s.apply([
		{ type: "image.rotate", operation: "rotate-90" },
		{ type: "image.rotate", operation: "rotate-270" },
	]);
	assert.deepEqual(p.composePsdDocument(s.peekDocument()).data, before);
	assert.ok(s.peekDocument().layers[0].mask);
	assert.ok(s.peekDocument().layers[0].children[0].mask);
	s.apply([{ type: "image.resize", width: 16, height: 16 }]);
	assert.equal(s.peekDocument().layers[0].mask.right, 16);
	assert.ok(s.peekDocument().layers[0].children[1].curves);
	const composed = p.composePsdDocument(s.peekDocument()).data.slice();
	s.apply([{ type: "layer.mergeVisible" }]);
	assert.deepEqual(p.composePsdDocument(s.peekDocument()).data, composed);
});
test("curves blend modes preserve alpha and merge-selected matches the compositor", () => {
	const s = session(),
		curves = p.identityCurves();
	curves.rgb = [
		{ x: 0, y: 100 },
		{ x: 255, y: 200 },
	];
	const id = s.apply([{ type: "curves.set", curves }]).createdIds[0];
	s.apply([{ type: "layer.setBlendMode", layerId: id, blendMode: "multiply" }]);
	const before = p.composePsdDocument(s.peekDocument()).data.slice();
	assert.equal(before[0], 0);
	assert.equal(before[3], 255);
	s.apply([{ type: "layer.merge", layerIds: ["L1", id] }]);
	assert.deepEqual(p.composePsdDocument(s.peekDocument()).data, before);
});
test("duplicating a transformed layer retains its source while later edits stay independent", () => {
	const s = session(),
		original = s.peekDocument().layers[0].bitmap.data.slice();
	s.apply([{ type: "layer.scale", layerId: "L1", width: 2, height: 2 }]);
	const id = s.apply([{ type: "layer.duplicate", layerId: "L1" }]).createdIds[0];
	s.apply([{ type: "layer.scale", layerId: id, width: 8, height: 8 }]);
	assert.deepEqual(s.peekDocument().layers.find((l) => l.id === id).bitmap.data, original);
	assert.equal(s.peekDocument().layers.find((l) => l.id === "L1").bitmap.width, 2);
});
