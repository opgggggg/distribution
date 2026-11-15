import test from "node:test";
import assert from "node:assert/strict";
import { loadPsd, makeDocument, rasterLayer, solidBitmap, pixelAt } from "./helpers.mjs";
const psd = await loadPsd();
function session() {
	return new psd.PsdEditorSession(
		makeDocument(
			psd,
			[rasterLayer(psd, "L1", "Paint", { bitmap: solidBitmap(psd, 8, 8, 220, 60, 30) })],
			{ width: 8, height: 8 },
		),
	);
}
const action = (operation) => ({ type: "layer.mask", layerId: "L1", operation });
test("mask edits preserve image pixels, support undo/redo and survive PSD save", () => {
	const s = session();
	const bitmap = s.peekDocument().layers[0].bitmap;
	s.apply([action("hide-all")]);
	assert.equal(psd.composePsdDocument(s.peekDocument()).data[3], 0);
	const hidden = s.peekDocument().layers[0].mask;
	s.apply([action("invert")]);
	assert.equal(psd.composePsdDocument(s.peekDocument()).data[3], 255);
	assert.equal(hidden.data[0], 0);
	assert.equal(s.peekDocument().layers[0].bitmap, bitmap);
	assert.ok(s.undo());
	assert.equal(psd.composePsdDocument(s.peekDocument()).data[3], 0);
	assert.ok(s.redo());
	s.apply([action("disable")]);
	const restored = psd.readPsd(psd.writePsd(s.peekDocument()));
	assert.equal(restored.layers[0].mask.disabled, true);
	assert.equal(restored.layers[0].mask.data[0], 255);
	s.apply([action("delete")]);
	assert.equal(s.peekDocument().layers[0].mask, undefined);
	assert.ok(s.undo());
	assert.equal(s.peekDocument().layers[0].mask.disabled, true);
});
test("selection masks retain coverage and leave the selection available", () => {
	const s = session();
	s.apply([
		{ type: "selection.set", shape: "rectangle", x: 2, y: 2, width: 3, height: 3 },
		action("from-selection"),
	]);
	const doc = s.peekDocument();
	const bitmap = psd.composePsdDocument(doc);
	assert.equal(pixelAt(bitmap, 0, 0)[3], 0);
	assert.equal(pixelAt(bitmap, 3, 3)[3], 255);
	assert.ok(doc.selection);
	s.apply([action("disable")]);
	assert.equal(psd.composePsdDocument(s.peekDocument()).data[3], 255);
	assert.equal(s.apply([action("disable")]).noop, true);
	s.apply([action("enable")]);
	assert.equal(psd.composePsdDocument(s.peekDocument()).data[3], 0);
});
test("group masks affect descendants and round-trip without losing their mask channel", () => {
	const s = session();
	const result = s.apply([{ type: "layer.group", layerIds: ["L1"], name: "Folder" }]);
	const groupId = result.createdIds[0];
	s.apply([{ type: "layer.mask", layerId: groupId, operation: "hide-all" }]);
	const restored = psd.readPsd(psd.writePsd(s.peekDocument()));
	assert.equal(restored.layers[0].kind, "group");
	assert.equal(restored.layers[0].mask.data[0], 0);
	assert.equal(psd.composePsdDocument(restored).data[3], 0);
});
test("invalid mask edits are atomic and respect locks and read-only access", () => {
	const s = session();
	assert.throws(() => s.apply([action("from-selection")]), /Select an area/);
	assert.throws(() => s.apply([action("invert")]), /no mask/);
	assert.throws(() => s.apply([action("reveal-all"), action("hide-all")]), /existing mask/);
	assert.equal(s.peekDocument().layers[0].mask, undefined);
	s.apply([{ type: "layer.setLocked", layerId: "L1", locked: true }]);
	assert.throws(() => s.apply([action("reveal-all")]), /locked/);
	const doc = makeDocument(psd, []);
	doc.editable = false;
	assert.throws(() => new psd.PsdEditorSession(doc).apply([action("reveal-all")]), /read.only/i);
});
