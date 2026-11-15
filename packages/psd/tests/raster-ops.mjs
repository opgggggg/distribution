import test from "node:test";
import assert from "node:assert/strict";
import { loadPsd, solidBitmap, pixelAt } from "./helpers.mjs";

const psd = await loadPsd();

test("brush stroke paints a solid dab and leaves originals untouched", () => {
	const original = solidBitmap(psd, 20, 20, 0, 0, 0, 0);
	const painted = psd.applyStroke(original, {
		tool: "brush",
		points: [{ x: 10, y: 10 }],
		size: 8,
		hardness: 1,
		opacity: 1,
		color: { r: 255, g: 0, b: 0 },
	});
	assert.deepEqual(pixelAt(painted, 10, 10), [255, 0, 0, 255]);
	assert.equal(pixelAt(painted, 0, 0)[3], 0); // far corner untouched
	assert.equal(pixelAt(original, 10, 10)[3], 0); // input is immutable
});

test("a stroke is one uniform coat despite overlapping stamps", () => {
	const bitmap = solidBitmap(psd, 40, 10, 0, 0, 0, 0);
	const painted = psd.applyStroke(bitmap, {
		tool: "brush",
		points: [
			{ x: 5, y: 5 },
			{ x: 30, y: 5 },
		],
		size: 6,
		hardness: 1,
		opacity: 0.5,
		color: { r: 0, g: 0, b: 255 },
	});
	// Every covered pixel gets exactly 50% alpha, never 75% from double hits.
	for (const x of [5, 12, 20, 28]) {
		const alpha = pixelAt(painted, x, 5)[3];
		assert.ok(Math.abs(alpha - 128) <= 2, `x=${x} alpha=${alpha}`);
	}
});

test("soft brushes feather toward the rim", () => {
	const painted = psd.applyStroke(solidBitmap(psd, 21, 21, 0, 0, 0, 0), {
		tool: "brush",
		points: [{ x: 10, y: 10 }],
		size: 16,
		hardness: 0.2,
		opacity: 1,
		color: { r: 255, g: 255, b: 255 },
	});
	const center = pixelAt(painted, 10, 10)[3];
	const rim = pixelAt(painted, 16, 10)[3];
	assert.equal(center, 255);
	assert.ok(rim > 0 && rim < 128, `rim alpha ${rim}`);
});

test("eraser reduces alpha", () => {
	const erased = psd.applyStroke(solidBitmap(psd, 10, 10, 50, 50, 50, 255), {
		tool: "eraser",
		points: [{ x: 5, y: 5 }],
		size: 4,
		hardness: 1,
		opacity: 1,
		color: { r: 0, g: 0, b: 0 },
	});
	assert.equal(pixelAt(erased, 5, 5)[3], 0);
	assert.equal(pixelAt(erased, 0, 0)[3], 255);
});

test("rect fill composites with opacity", () => {
	const filled = psd.applyFill(
		solidBitmap(psd, 8, 8, 0, 0, 0, 255),
		{ r: 255, g: 255, b: 255 },
		0.5,
		{ x: 0, y: 0, width: 4, height: 8 },
	);
	assert.ok(Math.abs(pixelAt(filled, 1, 1)[0] - 128) <= 1);
	assert.equal(pixelAt(filled, 6, 6)[0], 0);
});

test("bucket fill respects tolerance boundaries", () => {
	const bitmap = solidBitmap(psd, 8, 8, 10, 10, 10, 255);
	// A vertical wall of very different color at x=4.
	for (let y = 0; y < 8; y++) {
		const p = (y * 8 + 4) * 4;
		bitmap.data[p] = 200;
	}
	const filled = psd.applyBucketFill(bitmap, 0, 0, { r: 0, g: 255, b: 0 }, 16);
	assert.deepEqual(pixelAt(filled, 2, 3).slice(0, 3), [0, 255, 0]);
	assert.equal(pixelAt(filled, 4, 3)[0], 200); // the wall survives
	assert.equal(pixelAt(filled, 6, 3)[0], 10); // beyond the wall unreachable
});

test("bucket fill supports opacity and non-contiguous matching", () => {
	const bitmap = solidBitmap(psd, 5, 1, 0, 0, 0, 255);
	bitmap.data.set([255, 255, 255, 255], 2 * 4);
	const filled = psd.applyBucketFill(bitmap, 0, 0, { r: 200, g: 0, b: 0 }, 0, null, 0.5, false);
	assert.ok(Math.abs(pixelAt(filled, 0, 0)[0] - 100) <= 1);
	assert.equal(pixelAt(filled, 2, 0)[0], 255, "non-matching separator survives");
	assert.ok(Math.abs(pixelAt(filled, 4, 0)[0] - 100) <= 1, "disconnected match fills");
});

test("dodge and burn tonal ranges prefer their target band", () => {
	const bitmap = solidBitmap(psd, 2, 1, 32, 32, 32, 255);
	bitmap.data.set([224, 224, 224, 255], 4);
	const dodged = psd.applyStroke(bitmap, {
		tool: "dodge",
		points: [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
		],
		size: 2,
		hardness: 1,
		opacity: 1,
		color: { r: 0, g: 0, b: 0 },
		tonalRange: "shadows",
	});
	assert.ok(
		pixelAt(dodged, 0, 0)[0] - 32 > pixelAt(dodged, 1, 0)[0] - 224,
		"shadow-range dodge changes the dark pixel more",
	);
});

test("adjustments are deterministic", () => {
	const base = solidBitmap(psd, 2, 2, 100, 150, 200, 255);
	const inverted = psd.applyAdjustment(base, "invert");
	assert.deepEqual(pixelAt(inverted, 0, 0).slice(0, 3), [155, 105, 55]);

	const gray = psd.applyAdjustment(base, "grayscale");
	const expected = Math.round(0.3 * 100 + 0.59 * 150 + 0.11 * 200);
	assert.ok(Math.abs(pixelAt(gray, 0, 0)[0] - expected) <= 1);

	const brighter = psd.applyAdjustment(base, "brightness-contrast", { brightness: 50 });
	assert.ok(pixelAt(brighter, 0, 0)[0] > 150);

	const saturated = psd.applyAdjustment(base, "hue-saturation", { saturation: -100 });
	const [r, g, b] = pixelAt(saturated, 0, 0);
	assert.ok(Math.abs(r - g) <= 1 && Math.abs(g - b) <= 1, "fully desaturated is neutral");
});

test("scale and crop", () => {
	const bitmap = solidBitmap(psd, 4, 4, 40, 40, 40, 255);
	const scaled = psd.scaleBitmap(bitmap, 8, 2);
	assert.equal(scaled.width, 8);
	assert.equal(scaled.height, 2);
	assert.deepEqual(pixelAt(scaled, 7, 1).slice(0, 3), [40, 40, 40]);

	const cropped = psd.cropBitmap(bitmap, 2, 2, 4, 4);
	assert.equal(cropped.width, 4);
	assert.deepEqual(pixelAt(cropped, 0, 0).slice(0, 3), [40, 40, 40]);
	assert.equal(pixelAt(cropped, 3, 3)[3], 0); // out-of-source area transparent
});

test("eyedropper samples in bounds only", () => {
	const bitmap = solidBitmap(psd, 4, 4, 1, 2, 3, 4);
	assert.deepEqual(psd.samplePixel(bitmap, 1, 1), { r: 1, g: 2, b: 3, a: 4 });
	assert.equal(psd.samplePixel(bitmap, 9, 0), null);
});
