import test from "node:test";
import assert from "node:assert/strict";
import { loadPsd, makeDocument, rasterLayer, solidBitmap, pixelAt } from "./helpers.mjs";
const p = await loadPsd();
function session(bitmap = solidBitmap(p, 16, 16, 80, 120, 160)) {
	return new p.PsdEditorSession(
		makeDocument(p, [rasterLayer(p, "L1", "Pixels", { bitmap })], {
			width: bitmap.width,
			height: bitmap.height,
		}),
	);
}
function settings(kind) {
	const a = p.defaultLiveAdjustment(kind);
	if (kind === "levels") {
		a.channels.rgb.inBlack = 10;
		a.channels.green.gamma = 1.4;
	}
	if (kind === "exposure") {
		a.exposure = 1.25;
		a.offset = 0.02;
		a.gamma = 1.2;
	}
	if (kind === "hue-saturation") {
		a.hue = 30;
		a.ranges[0].saturation = -50;
	}
	if (kind === "gradient-map") {
		a.stops[0].color = { r: 40, g: 10, b: 90 };
		a.stops[1].color = { r: 240, g: 180, b: 60 };
	}
	return a;
}
for (const kind of p.LIVE_ADJUSTMENT_KINDS)
	test(`${kind} live layer preserves source, supports masks/undo, and survives PSD save`, () => {
		const s = session(),
			source = s.peekDocument().layers[0].bitmap,
			a = settings(kind),
			original = source.data.slice();
		const id = s.apply([{ type: "adjustment.set", adjustment: a, aboveLayerId: "L1" }])
			.createdIds[0];
		const composed = p.composePsdDocument(s.peekDocument()).data.slice();
		assert.notDeepEqual(composed, original);
		assert.deepEqual(source.data, original);
		const restored = p.readPsd(p.writePsd(s.peekDocument()));
		assert.ok(restored.editable, restored.openWarnings.join(";"));
		assert.equal(restored.layers[1].adjustment.kind, kind);
		assert.deepEqual(p.composePsdDocument(restored).data, composed);
		s.apply([{ type: "layer.mask", layerId: id, operation: "hide-all" }]);
		assert.deepEqual(p.composePsdDocument(s.peekDocument()).data, original);
		s.undo();
		assert.deepEqual(p.composePsdDocument(s.peekDocument()).data, composed);
		s.undo();
		assert.equal(s.peekDocument().layers.length, 1);
		s.redo();
		assert.equal(s.peekDocument().layers.length, 2);
	});
test("adjustments are inserted in the chosen group and edits are atomic and locked", () => {
	const s = session(),
		group = s.apply([{ type: "layer.group", layerIds: ["L1"] }]).createdIds[0];
	const id = s.apply([
		{ type: "adjustment.set", aboveLayerId: "L1", adjustment: settings("levels") },
	]).createdIds[0];
	assert.equal(s.peekDocument().layers[0].children[1].id, id);
	const bad = settings("levels");
	bad.channels.rgb.inBlack = 255;
	assert.throws(
		() => s.apply([{ type: "adjustment.set", layerId: id, adjustment: bad }]),
		/black/,
	);
	assert.equal(s.peekDocument().layers[0].children[1].adjustment.channels.rgb.inBlack, 10);
	s.apply([{ type: "layer.setLocked", layerId: id, locked: true }]);
	assert.throws(
		() => s.apply([{ type: "adjustment.set", layerId: id, adjustment: settings("levels") }]),
		/locked/,
	);
	assert.throws(
		() =>
			s.apply([
				{
					type: "stroke.apply",
					layerId: id,
					tool: "eraser",
					points: [{ x: 0, y: 0 }],
					size: 1,
				},
			]),
		/locked|pixel layer/,
	);
});
test("auto levels ignores transparent pixels and constant channels stay valid", () => {
	const b = solidBitmap(p, 8, 8, 90, 120, 180);
	b.data.set([0, 0, 0, 0], 0);
	b.data.set([255, 255, 255, 0], 4);
	const a = p.autoLevels(b);
	p.validateLiveAdjustment(a);
	assert.equal(a.channels.red.inBlack, 0);
	assert.equal(a.channels.red.inWhite, 255);
	assert.deepEqual(p.applyLiveAdjustment(b, a).data, b.data);
	const blank = p.autoLevels(solidBitmap(p, 4, 4, 0, 0, 0, 0));
	assert.equal(blank.channels.rgb.inBlack, 0);
});
test("exposure uses linear light and range-aware hue leaves other hues untouched", () => {
	const b = solidBitmap(p, 1, 1, 128, 128, 128, 123),
		a = p.defaultLiveAdjustment("exposure");
	a.exposure = 1;
	const out = p.applyLiveAdjustment(b, a);
	assert.ok(out.data[0] > 170 && out.data[0] < 180);
	assert.equal(out.data[3], 123);
	const hsv = p.defaultLiveAdjustment("hue-saturation");
	hsv.ranges[0].saturation = -100;
	assert.deepEqual(
		pixelAt(p.applyLiveAdjustment(solidBitmap(p, 1, 1, 0, 255, 0), hsv), 0, 0),
		[0, 255, 0, 255],
	);
	const red = p.applyLiveAdjustment(solidBitmap(p, 1, 1, 255, 0, 0), hsv);
	assert.equal(red.data[0], red.data[1]);
});
test("healing removes a blemish without sampling it and is deterministic and undoable", () => {
	const bitmap = solidBitmap(p, 16, 16, 100, 130, 170);
	for (let y = 6; y < 10; y++)
		for (let x = 6; x < 10; x++) bitmap.data.set([250, 0, 0, 255], (y * 16 + x) * 4);
	const s = session(bitmap),
		old = bitmap.data.slice(),
		a = {
			type: "retouch.apply",
			layerId: "L1",
			tool: "heal",
			points: [{ x: 8, y: 8 }],
			size: 8,
			hardness: 1,
			opacity: 1,
		};
	s.apply([a]);
	const result = s.peekDocument().layers[0].bitmap;
	assert.deepEqual(pixelAt(result, 8, 8), [100, 130, 170, 255]);
	assert.deepEqual(pixelAt(result, 0, 0), [100, 130, 170, 255]);
	s.undo();
	assert.deepEqual(s.peekDocument().layers[0].bitmap.data, old);
	s.apply([a]);
	assert.deepEqual(s.peekDocument().layers[0].bitmap.data, result.data);
	assert.deepEqual(p.readPsd(p.writePsd(s.peekDocument())).layers[0].bitmap.data, result.data);
});
test("local blur is limited by stroke and selection and can edit only a mask", () => {
	const bitmap = solidBitmap(p, 16, 16, 0, 0, 0);
	bitmap.data.set([255, 255, 255, 255], (8 * 16 + 8) * 4);
	const s = session(bitmap);
	s.apply([
		{ type: "selection.set", shape: "rectangle", x: 7, y: 7, width: 3, height: 3 },
		{
			type: "retouch.apply",
			layerId: "L1",
			tool: "blur",
			points: [{ x: 8, y: 8 }],
			size: 12,
			hardness: 1,
			radius: 2,
		},
	]);
	assert.ok(pixelAt(s.peekDocument().layers[0].bitmap, 8, 8)[0] < 255);
	assert.deepEqual(pixelAt(s.peekDocument().layers[0].bitmap, 6, 8), [0, 0, 0, 255]);
	s.apply([
		{ type: "selection.clear" },
		{ type: "layer.mask", layerId: "L1", operation: "reveal-all" },
		{
			type: "stroke.apply",
			layerId: "L1",
			target: "mask",
			tool: "brush",
			points: [{ x: 8, y: 8 }],
			size: 3,
			color: { r: 0, g: 0, b: 0 },
		},
	]);
	const image = s.peekDocument().layers[0].bitmap;
	s.apply([
		{
			type: "retouch.apply",
			layerId: "L1",
			target: "mask",
			tool: "blur",
			points: [{ x: 8, y: 8 }],
			size: 10,
			radius: 3,
		},
	]);
	assert.equal(s.peekDocument().layers[0].bitmap, image);
	assert.ok(s.peekDocument().layers[0].mask.data.some((v) => v > 0 && v < 255));
});
test("content-aware fill extends a layer into a selected transparent edge and rejects invalid source atomically", () => {
	const bitmap = solidBitmap(p, 8, 8, 30, 100, 160),
		doc = makeDocument(p, [rasterLayer(p, "L1", "Small", { bitmap })], {
			width: 12,
			height: 8,
		}),
		s = new p.PsdEditorSession(doc);
	s.apply([
		{ type: "selection.set", shape: "rectangle", x: 8, y: 0, width: 4, height: 8 },
		{ type: "contentAware.fill", layerId: "L1" },
	]);
	assert.equal(s.peekDocument().layers[0].bitmap.width, 12);
	assert.deepEqual(pixelAt(s.peekDocument().layers[0].bitmap, 11, 4), [30, 100, 160, 255]);
	s.undo();
	assert.equal(s.peekDocument().layers[0].bitmap.width, 8);
	assert.throws(() => s.apply([{ type: "contentAware.fill", layerId: "L1" }]), /Select an area/);
	s.apply([{ type: "selection.all" }]);
	const before = s.peekDocument().layers[0].bitmap;
	assert.throws(() => s.apply([{ type: "contentAware.fill", layerId: "L1" }]), /No unselected/);
	assert.equal(s.peekDocument().layers[0].bitmap, before);
});
test("repair honors soft coverage, source-all-layers, and the work limit", () => {
	const b = solidBitmap(p, 8, 8, 100, 100, 100);
	b.data.set([200, 0, 0, 255], (4 * 8 + 4) * 4);
	const mask = new Uint8Array(64);
	mask[36] = 128;
	const result = p.contentAwareFill(b, mask);
	assert.deepEqual(pixelAt(result, 4, 4), [150, 50, 50, 255]);
	assert.throws(
		() =>
			p.contentAwareFill(
				solidBitmap(p, 257, 257, 0, 0, 0),
				new Uint8Array(257 * 257).fill(255),
			),
		/65,536/,
	);
	const doc = makeDocument(
			p,
			[
				rasterLayer(p, "L1", "Base", { bitmap: solidBitmap(p, 8, 8, 12, 34, 56) }),
				rasterLayer(p, "L2", "Retouch", { bitmap: solidBitmap(p, 8, 8, 0, 0, 0, 0) }),
			],
			{ width: 8, height: 8 },
		),
		s = new p.PsdEditorSession(doc);
	s.apply([
		{ type: "selection.set", shape: "rectangle", x: 3, y: 3, width: 2, height: 2 },
		{ type: "contentAware.fill", layerId: "L2", sampleAllLayers: true },
	]);
	assert.deepEqual(pixelAt(s.peekDocument().layers[1].bitmap, 3, 3), [12, 34, 56, 255]);
	assert.equal(pixelAt(s.peekDocument().layers[1].bitmap, 0, 0)[3], 0);
});
