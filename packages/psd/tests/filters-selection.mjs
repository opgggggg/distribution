import test from "node:test";
import assert from "node:assert/strict";
import { loadPsd, makeDocument, rasterLayer, solidBitmap, pixelAt, makeTySh } from "./helpers.mjs";

const psd = await loadPsd();

function newSession(layers, options) {
	return new psd.PsdEditorSession(makeDocument(psd, layers, options));
}

// --- filters ---

test("gaussian blur softens edges and keeps flat areas", () => {
	const bitmap = solidBitmap(psd, 20, 20, 0, 0, 0, 255);
	// White square in the middle.
	for (let y = 5; y < 15; y++) {
		for (let x = 5; x < 15; x++) {
			const p = (y * 20 + x) * 4;
			bitmap.data[p] = bitmap.data[p + 1] = bitmap.data[p + 2] = 255;
		}
	}
	const blurred = psd.applyGaussianBlur(bitmap, 3);
	const edge = pixelAt(blurred, 5, 10)[0];
	assert.ok(edge > 20 && edge < 235, `edge value ${edge} should be between extremes`);
	const center = pixelAt(blurred, 10, 10)[0];
	assert.ok(center > 200, `center stays bright (${center})`);
});

test("sharpen increases local contrast", () => {
	const bitmap = solidBitmap(psd, 10, 10, 100, 100, 100, 255);
	for (let x = 5; x < 10; x++) {
		for (let y = 0; y < 10; y++) {
			const p = (y * 10 + x) * 4;
			bitmap.data[p] = bitmap.data[p + 1] = bitmap.data[p + 2] = 160;
		}
	}
	const sharp = psd.applySharpen(bitmap, 2, 200);
	assert.ok(pixelAt(sharp, 4, 5)[0] < 100, "dark side darkens at the edge");
	assert.ok(pixelAt(sharp, 6, 5)[0] > 160, "bright side brightens at the edge");
});

test("threshold, posterize, pixelate, noise are deterministic", () => {
	const bitmap = solidBitmap(psd, 8, 8, 100, 150, 200, 255);
	assert.equal(pixelAt(psd.applyThreshold(bitmap, 128), 0, 0)[0], 255);
	assert.equal(pixelAt(psd.applyThreshold(bitmap, 200), 0, 0)[0], 0);
	const posterized = psd.applyPosterize(bitmap, 2);
	assert.deepEqual(pixelAt(posterized, 0, 0).slice(0, 3), [0, 255, 255]);
	const noisyA = psd.applyNoise(bitmap, 50, 7);
	const noisyB = psd.applyNoise(bitmap, 50, 7);
	assert.deepEqual([...noisyA.data], [...noisyB.data], "same seed, same noise");
	const cells = psd.applyPixelate(bitmap, 4);
	assert.deepEqual(pixelAt(cells, 0, 0), pixelAt(cells, 3, 3), "cell shares one color");
});

test("levels remaps the tonal range", () => {
	const bitmap = solidBitmap(psd, 2, 2, 128, 128, 128, 255);
	const lifted = psd.applyLevels(bitmap, { inBlack: 100, inWhite: 156 });
	assert.equal(pixelAt(lifted, 0, 0)[0], 128);
	const crushed = psd.applyLevels(bitmap, { inBlack: 128 });
	assert.equal(pixelAt(crushed, 0, 0)[0], 0);
	const gamma = psd.applyLevels(bitmap, { gamma: 2 });
	assert.ok(pixelAt(gamma, 0, 0)[0] > 170, "gamma > 1 brightens midtones");
});

test("exposure, vibrance, black-white, color balance behave directionally", () => {
	const bitmap = solidBitmap(psd, 2, 2, 100, 120, 140, 255);
	assert.ok(pixelAt(psd.applyExposure(bitmap, { exposure: 1 }), 0, 0)[0] > 150);
	const vibrant = psd.applyVibrance(bitmap, { vibrance: 100 });
	const [vr, , vb] = pixelAt(vibrant, 0, 0);
	assert.ok(vb - vr > 40, "vibrance spreads channels apart");
	const bw = psd.applyBlackWhite(bitmap, {});
	const [br, bg, bb] = pixelAt(bw, 0, 0);
	assert.ok(Math.abs(br - bg) <= 1 && Math.abs(bg - bb) <= 1);
	const warm = psd.applyColorBalance(bitmap, { cyanRed: 100 });
	assert.ok(pixelAt(warm, 0, 0)[0] > 100, "red shift raises the red channel");
});

// --- geometry ---

test("flips and quarter rotations move pixels exactly", () => {
	const bitmap = solidBitmap(psd, 4, 2, 0, 0, 0, 255);
	bitmap.data[0] = 250; // (0,0) red-ish marker
	const flipped = psd.flipRotateBitmap(bitmap, "flip-horizontal");
	assert.equal(pixelAt(flipped, 3, 0)[0], 250);
	const rotated = psd.flipRotateBitmap(bitmap, "rotate-90");
	assert.equal(rotated.width, 2);
	assert.equal(rotated.height, 4);
	assert.equal(pixelAt(rotated, 1, 0)[0], 250);
});

test("arbitrary rotation grows the bitmap and reports the offset", () => {
	const bitmap = solidBitmap(psd, 10, 10, 50, 50, 50, 255);
	const { bitmap: rotated, offsetX, offsetY } = psd.rotateBitmap(bitmap, 45);
	assert.ok(rotated.width > 10 && rotated.height > 10);
	assert.ok(offsetX < 0 && offsetY < 0);
	const center = pixelAt(rotated, Math.floor(rotated.width / 2), Math.floor(rotated.height / 2));
	assert.equal(center[3], 255);
	assert.equal(pixelAt(rotated, 0, 0)[3], 0, "corners are empty after rotation");
});

test("gradients interpolate stops; shapes rasterize with fill and stroke", () => {
	const base = solidBitmap(psd, 10, 1, 0, 0, 0, 255);
	const gradient = psd.applyGradient(base, {
		type: "linear",
		from: { x: 0, y: 0 },
		to: { x: 9, y: 0 },
		stops: [
			{ at: 0, color: { r: 0, g: 0, b: 0 } },
			{ at: 1, color: { r: 255, g: 255, b: 255 } },
		],
	});
	assert.ok(pixelAt(gradient, 9, 0)[0] > 220);
	assert.ok(Math.abs(pixelAt(gradient, 5, 0)[0] - 141) < 30, "midpoint interpolates");

	const shapeTarget = solidBitmap(psd, 20, 20, 0, 0, 0, 0);
	const withRect = psd.applyShape(shapeTarget, {
		shape: "rectangle",
		x: 4,
		y: 4,
		width: 12,
		height: 12,
		fill: { r: 0, g: 255, b: 0 },
		stroke: { r: 255, g: 0, b: 0 },
		strokeWidth: 2,
	});
	assert.deepEqual(pixelAt(withRect, 10, 10).slice(0, 3), [0, 255, 0], "interior filled");
	assert.equal(pixelAt(withRect, 5, 10)[0], 255, "border stroked");
	assert.equal(pixelAt(withRect, 0, 0)[3], 0, "outside untouched");
});

// --- strokes: dodge / burn / clone ---

test("dodge lightens, burn darkens, clone copies from the source offset", () => {
	const base = solidBitmap(psd, 20, 10, 100, 100, 100, 255);
	const dodged = psd.applyStroke(base, {
		tool: "dodge",
		points: [{ x: 5, y: 5 }],
		size: 4,
		hardness: 1,
		opacity: 1,
		color: { r: 0, g: 0, b: 0 },
	});
	assert.ok(pixelAt(dodged, 5, 5)[0] > 130);
	const burned = psd.applyStroke(base, {
		tool: "burn",
		points: [{ x: 5, y: 5 }],
		size: 4,
		hardness: 1,
		opacity: 1,
		color: { r: 0, g: 0, b: 0 },
	});
	assert.ok(pixelAt(burned, 5, 5)[0] < 70);

	const source = solidBitmap(psd, 20, 10, 10, 10, 10, 255);
	// Bright patch at x=15 to clone from.
	for (let y = 3; y < 8; y++) {
		for (let x = 13; x < 18; x++) {
			const p = (y * 20 + x) * 4;
			source.data[p] = 240;
		}
	}
	const cloned = psd.applyStroke(source, {
		tool: "clone",
		points: [{ x: 5, y: 5 }],
		size: 4,
		hardness: 1,
		opacity: 1,
		color: { r: 0, g: 0, b: 0 },
		sourceOffset: { dx: 10, dy: 0 },
	});
	assert.equal(pixelAt(cloned, 5, 5)[0], 240, "clone stamps the offset source");
});

// --- selection system through the session ---

test("selection constrains fills and adjustments", () => {
	const session = newSession(
		[rasterLayer(psd, "L1", "base", { bitmap: solidBitmap(psd, 16, 16, 0, 0, 0, 255) })],
		{ width: 16, height: 16 },
	);
	session.apply([
		{ type: "selection.set", shape: "rectangle", x: 0, y: 0, width: 8, height: 16 },
	]);
	session.apply([{ type: "fill.apply", layerId: "L1", color: { r: 255, g: 0, b: 0 } }]);
	let layer = session.peekDocument().layers[0];
	assert.equal(layer.bitmap.data[(8 * 16 + 2) * 4], 255, "inside selection filled");
	assert.equal(layer.bitmap.data[(8 * 16 + 12) * 4], 0, "outside selection untouched");

	session.apply([{ type: "selection.invert" }]);
	session.apply([{ type: "adjustment.apply", layerId: "L1", kind: "invert" }]);
	layer = session.peekDocument().layers[0];
	assert.equal(layer.bitmap.data[(8 * 16 + 12) * 4], 255, "inverted selection now affected");
	assert.equal(layer.bitmap.data[(8 * 16 + 2) * 4], 255, "left half unchanged by invert");
});

test("feathered selections produce soft coverage and invert as a complement", () => {
	const selection = {
		shape: { kind: "rectangle", x: 8, y: 4, width: 16, height: 16 },
		inverted: false,
		feather: 2,
	};
	const mask = psd.rasterizeSelection(selection, 32, 24);
	const at = (values, x, y) => values[y * 32 + x];
	assert.equal(at(mask, 16, 12), 255, "the interior remains fully selected");
	assert.ok(at(mask, 8, 12) > 0 && at(mask, 8, 12) < 255, "the boundary is softened");
	assert.ok(at(mask, 7, 12) > 0 && at(mask, 7, 12) < 255, "feather extends outside");
	assert.equal(at(mask, 1, 12), 0, "pixels beyond the feather remain unselected");

	const inverse = psd.rasterizeSelection({ ...selection, inverted: true }, 32, 24);
	for (let index = 0; index < mask.length; index++) {
		assert.equal(mask[index] + inverse[index], 255, "inverse preserves soft coverage");
	}
	mask.fill(0);
	const cachedCopy = psd.rasterizeSelection(selection, 32, 24);
	assert.equal(at(cachedCopy, 16, 12), 255, "cached masks are isolated from caller mutation");
});

test("selection borders translate without moving layer pixels", () => {
	const bitmap = solidBitmap(psd, 12, 10, 20, 40, 60, 255);
	const session = newSession([rasterLayer(psd, "L1", "base", { bitmap })], {
		width: 12,
		height: 10,
	});
	session.apply([{ type: "selection.set", shape: "rectangle", x: 1, y: 2, width: 4, height: 3 }]);
	const pixelsBefore = [...session.peekDocument().layers[0].bitmap.data];
	session.apply([{ type: "selection.translate", dx: 3, dy: -1 }]);
	assert.deepEqual(session.peekDocument().selection.shape, {
		kind: "rectangle",
		x: 4,
		y: 1,
		width: 4,
		height: 3,
	});
	assert.deepEqual([...session.peekDocument().layers[0].bitmap.data], pixelsBefore);
	assert.equal(session.undo(), true);
	assert.equal(session.peekDocument().selection.shape.x, 1);
});

test("named selections save an isolated copy and load with combine modes", () => {
	const session = newSession([], { width: 10, height: 8 });
	session.apply([
		{ type: "selection.set", shape: "rectangle", x: 1, y: 1, width: 3, height: 3 },
		{ type: "selection.save", name: "Subject" },
	]);
	session.apply([{ type: "selection.translate", dx: 5, dy: 0 }]);
	assert.equal(session.peekDocument().savedSelections[0].selection.shape.x, 1);
	session.apply([{ type: "selection.load", name: "subject", combine: "replace" }]);
	assert.equal(session.peekDocument().selection.shape.x, 1, "names are case-insensitive");

	session.apply([
		{ type: "selection.set", shape: "rectangle", x: 6, y: 1, width: 2, height: 2 },
		{ type: "selection.load", name: "Subject", combine: "add" },
	]);
	const mask = psd.rasterizeSelection(session.peekDocument().selection, 10, 8);
	assert.equal(mask[2 * 10 + 2], 255, "loaded area is added");
	assert.equal(mask[2 * 10 + 6], 255, "existing area is retained");
});

test("selection feather is undoable and makes Delete partially affect edge pixels", () => {
	const session = newSession(
		[rasterLayer(psd, "L1", "base", { bitmap: solidBitmap(psd, 32, 24, 40, 80, 120, 255) })],
		{ width: 32, height: 24 },
	);
	session.apply([
		{ type: "selection.set", shape: "rectangle", x: 8, y: 4, width: 16, height: 16 },
	]);
	session.apply([{ type: "selection.feather", radius: 2 }]);
	assert.equal(session.peekDocument().selection.feather, 2);
	assert.equal(psd.describeSelection(session.peekDocument().selection, 32, 24).feather, 2);
	assert.equal(session.undo(), true);
	assert.equal(session.peekDocument().selection.feather, 0);
	assert.equal(session.redo(), true);

	session.apply([{ type: "layer.clearSelected", layerId: "L1" }]);
	const layer = session.peekDocument().layers[0];
	const alphaAt = (x, y) => layer.bitmap.data[(y * layer.bitmap.width + x) * 4 + 3];
	assert.equal(alphaAt(16, 12), 0, "Delete fully clears the feathered selection interior");
	assert.ok(alphaAt(8, 12) > 0 && alphaAt(8, 12) < 255, "Delete blends at the boundary");
	assert.ok(alphaAt(7, 12) > 0 && alphaAt(7, 12) < 255, "Delete blends outside the hard edge");
	assert.equal(alphaAt(1, 12), 255, "Delete preserves pixels beyond the feather");
});

test("clearing and erasing pixels stay inside the active selection", () => {
	const session = newSession(
		[
			rasterLayer(psd, "L1", "base", {
				bitmap: solidBitmap(psd, 8, 6, 120, 80, 40, 255),
				left: 2,
				top: 1,
			}),
		],
		{ width: 12, height: 8 },
	);
	const alphaAtCanvas = (layer, x, y) =>
		layer.bitmap.data[((y - layer.top) * layer.bitmap.width + x - layer.left) * 4 + 3];

	session.apply([{ type: "selection.set", shape: "rectangle", x: 2, y: 1, width: 4, height: 6 }]);
	session.apply([{ type: "layer.clearSelected", layerId: "L1" }]);
	let layer = session.peekDocument().layers[0];
	assert.equal(alphaAtCanvas(layer, 4, 4), 0, "Delete clears selected pixels");
	assert.equal(alphaAtCanvas(layer, 8, 4), 255, "Delete preserves pixels outside selection");
	assert.equal(session.peekDocument().layers.length, 1, "Delete keeps the layer itself");

	assert.equal(session.undo(), true);
	session.apply([
		{
			type: "stroke.apply",
			layerId: "L1",
			tool: "eraser",
			points: [{ x: 6, y: 4 }],
			size: 8,
			hardness: 1,
			opacity: 1,
		},
	]);
	layer = session.peekDocument().layers[0];
	assert.equal(alphaAtCanvas(layer, 4, 4), 0, "eraser affects selected pixels");
	assert.equal(alphaAtCanvas(layer, 8, 4), 255, "eraser preserves pixels outside selection");
});

test("ellipse and polygon selections rasterize; magic wand picks regions", () => {
	const rect = psd.rasterizeSelection(
		{ shape: { kind: "ellipse", x: 0, y: 0, width: 10, height: 10 }, inverted: false },
		10,
		10,
	);
	assert.equal(rect[5 * 10 + 5], 255, "ellipse center selected");
	assert.equal(rect[0], 0, "ellipse corner unselected");

	const polygon = psd.rasterizeSelection(
		{
			shape: {
				kind: "polygon",
				points: [
					{ x: 0, y: 0 },
					{ x: 10, y: 0 },
					{ x: 0, y: 10 },
				],
			},
			inverted: false,
		},
		10,
		10,
	);
	assert.equal(polygon[1 * 10 + 1], 255, "inside the triangle");
	assert.equal(polygon[9 * 10 + 9], 0, "outside the triangle");

	const session = newSession(
		[rasterLayer(psd, "L1", "base", { bitmap: solidBitmap(psd, 16, 16, 0, 0, 0, 255) })],
		{ width: 16, height: 16 },
	);
	// Paint a distinct region then wand it.
	session.apply([
		{
			type: "fill.apply",
			layerId: "L1",
			color: { r: 250, g: 0, b: 0 },
			rect: { x: 0, y: 0, width: 8, height: 8 },
		},
	]);
	session.apply([{ type: "selection.magicWand", x: 2, y: 2, tolerance: 10 }]);
	const selection = session.peekDocument().selection;
	assert.equal(selection.shape.kind, "pixels");
	const mask = psd.rasterizeSelection(selection, 16, 16);
	assert.equal(mask[2 * 16 + 2], 255);
	assert.equal(mask[12 * 16 + 12], 0);
});

test("selection actions add, subtract, intersect, and select non-contiguous colors", () => {
	const bitmap = solidBitmap(psd, 8, 2, 0, 0, 0, 255);
	for (const x of [1, 6]) bitmap.data[x * 4] = 200;
	const session = newSession([rasterLayer(psd, "L1", "base", { bitmap })], {
		width: 8,
		height: 2,
	});
	session.apply([{ type: "selection.set", shape: "rectangle", x: 0, y: 0, width: 4, height: 2 }]);
	session.apply([
		{
			type: "selection.set",
			shape: "rectangle",
			x: 3,
			y: 0,
			width: 4,
			height: 2,
			combine: "add",
		},
	]);
	let mask = psd.rasterizeSelection(session.peekDocument().selection, 8, 2);
	assert.equal(mask[6], 255, "add keeps the union");
	session.apply([
		{
			type: "selection.set",
			shape: "rectangle",
			x: 0,
			y: 0,
			width: 2,
			height: 2,
			combine: "subtract",
		},
	]);
	mask = psd.rasterizeSelection(session.peekDocument().selection, 8, 2);
	assert.equal(mask[0], 0, "subtract removes covered pixels");
	session.apply([
		{
			type: "selection.set",
			shape: "rectangle",
			x: 4,
			y: 0,
			width: 4,
			height: 2,
			combine: "intersect",
		},
	]);
	mask = psd.rasterizeSelection(session.peekDocument().selection, 8, 2);
	assert.equal(mask[3], 0);
	assert.equal(mask[6], 255, "intersection keeps overlap only");

	session.apply([
		{
			type: "selection.magicWand",
			x: 1,
			y: 0,
			tolerance: 0,
			contiguous: false,
		},
	]);
	mask = psd.rasterizeSelection(session.peekDocument().selection, 8, 2);
	assert.equal(mask[1], 255);
	assert.equal(mask[6], 255, "non-contiguous wand includes disconnected match");
});

test("selection is undoable and cleared by canvas operations", () => {
	const session = newSession(
		[rasterLayer(psd, "L1", "base", { bitmap: solidBitmap(psd, 8, 8, 0, 0, 0, 255) })],
		{ width: 8, height: 8 },
	);
	session.apply([{ type: "selection.all" }]);
	assert.ok(session.peekDocument().selection);
	session.undo();
	assert.ok(!session.peekDocument().selection, "undo removes the selection");
	session.redo();
	assert.ok(session.peekDocument().selection);
	session.apply([{ type: "canvas.resize", width: 10, height: 10 }]);
	assert.ok(!session.peekDocument().selection, "canvas changes deselect");
});

test("canvas.resize honors every Photoshop-style anchor", () => {
	const expectedOffsets = {
		"top-left": [0, 0],
		"top-center": [3, 0],
		"top-right": [6, 0],
		"middle-left": [0, 4],
		center: [3, 4],
		"middle-right": [6, 4],
		"bottom-left": [0, 8],
		"bottom-center": [3, 8],
		"bottom-right": [6, 8],
	};
	for (const [anchor, [dx, dy]] of Object.entries(expectedOffsets)) {
		const session = newSession(
			[
				rasterLayer(psd, "L1", "base", {
					bitmap: solidBitmap(psd, 4, 4, 0, 0, 0, 255),
					left: 1,
					top: 2,
				}),
			],
			{ width: 4, height: 4 },
		);
		session.apply([{ type: "canvas.resize", width: 10, height: 12, anchor }]);
		const layer = session.peekDocument().layers[0];
		assert.equal(layer.left, 1 + dx, `${anchor} x offset`);
		assert.equal(layer.top, 2 + dy, `${anchor} y offset`);
	}
});

// --- new layer operations ---

test("mergeVisible keeps hidden layers; flatten replaces everything", () => {
	const session = newSession([
		rasterLayer(psd, "L1", "a", { bitmap: solidBitmap(psd, 8, 8, 10, 0, 0, 255) }),
		rasterLayer(psd, "L2", "hidden", {
			bitmap: solidBitmap(psd, 8, 8, 0, 10, 0, 255),
			visible: false,
		}),
		rasterLayer(psd, "L3", "b", { bitmap: solidBitmap(psd, 8, 8, 0, 0, 10, 128) }),
	]);
	const merged = session.apply([{ type: "layer.mergeVisible" }]);
	assert.equal(merged.createdIds.length, 1);
	const document = session.peekDocument();
	assert.equal(document.layers.length, 2);
	assert.ok(document.layers.some((layer) => layer.name === "hidden"));

	const flattened = session.apply([{ type: "image.flatten" }]);
	assert.equal(flattened.createdIds.length, 1);
	assert.equal(session.peekDocument().layers.length, 1);
	assert.equal(session.peekDocument().layers[0].name, "Background");
});

test("rasterize converts text layers; text.addLayer creates them", () => {
	const session = newSession([
		{
			kind: "text",
			id: "T1",
			name: "Title",
			visible: true,
			opacity: 1,
			blendMode: "normal",
			clipping: false,
			locks: { transparency: false, composite: false, position: false, all: false },
			preservedBlocks: [],
			top: 0,
			left: 0,
			bitmap: solidBitmap(psd, 10, 10, 255, 255, 255, 255),
			text: { text: "T", raw: makeTySh(psd, "T") },
		},
	]);
	session.apply([{ type: "layer.rasterize", layerId: "T1" }]);
	assert.equal(session.peekDocument().layers[0].kind, "raster");

	const added = session.apply([{ type: "text.addLayer", text: "NEW", x: 5, y: 6, size: 20 }]);
	assert.equal(added.createdIds.length, 1);
	const layer = session.peekDocument().layers[1];
	assert.equal(layer.kind, "text");
	assert.equal(layer.text.text, "NEW");
	assert.equal(psd.extractTyShText(layer.text.raw), "NEW");
	assert.equal(layer.left, 5);
});

test("layer.fromSelection copies only selected pixels", () => {
	const session = newSession(
		[rasterLayer(psd, "L1", "base", { bitmap: solidBitmap(psd, 8, 8, 200, 0, 0, 255) })],
		{ width: 8, height: 8 },
	);
	session.apply([{ type: "selection.set", shape: "rectangle", x: 0, y: 0, width: 4, height: 8 }]);
	const result = session.apply([{ type: "layer.fromSelection", sourceLayerId: "L1" }]);
	const copy = session.peekDocument().layers[1];
	assert.equal(result.createdIds[0], copy.id);
	assert.equal(copy.bitmap.data[(2 * 8 + 2) * 4 + 3], 255, "selected pixels kept");
	assert.equal(copy.bitmap.data[(2 * 8 + 6) * 4 + 3], 0, "unselected pixels transparent");
});

test("transform.apply flips layers; image.rotate swaps canvas dimensions", () => {
	const bitmap = solidBitmap(psd, 4, 2, 0, 0, 0, 255);
	bitmap.data[0] = 250;
	const session = newSession([rasterLayer(psd, "L1", "a", { bitmap, top: 1, left: 2 })], {
		width: 10,
		height: 6,
	});
	session.apply([{ type: "transform.apply", layerId: "L1", operation: "flip-horizontal" }]);
	assert.equal(session.peekDocument().layers[0].bitmap.data[3 * 4], 250);

	session.apply([{ type: "image.rotate", operation: "rotate-90" }]);
	const document = session.peekDocument();
	assert.equal(document.width, 6);
	assert.equal(document.height, 10);
});

test("image.resize resamples layers proportionally", () => {
	const session = newSession(
		[
			rasterLayer(psd, "L1", "a", {
				bitmap: solidBitmap(psd, 8, 8, 9, 9, 9, 255),
				top: 4,
				left: 4,
			}),
		],
		{ width: 16, height: 16 },
	);
	session.apply([{ type: "image.resize", width: 32, height: 32 }]);
	const layer = session.peekDocument().layers[0];
	assert.equal(layer.bitmap.width, 16);
	assert.equal(layer.left, 8);
	assert.equal(session.peekDocument().width, 32);
});

test("clipping masks confine pixels to the base layer's coverage", () => {
	const base = solidBitmap(psd, 8, 8, 0, 0, 0, 0);
	// Base covers the left half only.
	for (let y = 0; y < 8; y++) {
		for (let x = 0; x < 4; x++) {
			const p = (y * 8 + x) * 4;
			base.data[p] = 40;
			base.data[p + 3] = 255;
		}
	}
	const document = makeDocument(
		psd,
		[
			rasterLayer(psd, "L1", "base", { bitmap: base }),
			rasterLayer(psd, "L2", "clipped", {
				bitmap: solidBitmap(psd, 8, 8, 255, 0, 0, 255),
			}),
		],
		{ width: 8, height: 8 },
	);
	document.layers[1].clipping = true;
	const out = psd.composePsdDocument(document);
	assert.equal(pixelAt(out, 1, 1)[0], 255, "clipped pixels show over the base");
	assert.equal(pixelAt(out, 6, 6)[3], 0, "outside the base coverage nothing shows");
});

test("effect.apply grows the bitmap and keeps content anchored", () => {
	const session = newSession([
		rasterLayer(psd, "L1", "chip", {
			bitmap: solidBitmap(psd, 6, 6, 200, 200, 0, 255),
			top: 10,
			left: 10,
		}),
	]);
	session.apply([
		{
			type: "effect.apply",
			layerId: "L1",
			kind: "drop-shadow",
			params: { offsetX: 3, offsetY: 3, size: 4 },
		},
	]);
	const layer = session.peekDocument().layers[0];
	assert.ok(layer.bitmap.width > 6);
	assert.ok(layer.left < 10, "top-left moved to make room");
	// The chip's own pixels are still opaque yellow somewhere.
	const localX = 10 - layer.left + 2;
	const localY = 10 - layer.top + 2;
	const p = (localY * layer.bitmap.width + localX) * 4;
	assert.equal(layer.bitmap.data[p], 200);
});
