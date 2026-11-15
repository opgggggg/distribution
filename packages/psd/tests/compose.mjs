import test from "node:test";
import assert from "node:assert/strict";
import {
	loadPsd,
	makeDocument,
	rasterLayer,
	solidBitmap,
	emptyLocks,
	pixelAt,
} from "./helpers.mjs";

const psd = await loadPsd();

function composeTwo(baseColor, topColor, blendMode, opacity = 1) {
	const document = makeDocument(
		psd,
		[
			rasterLayer(psd, "L1", "base", { bitmap: solidBitmap(psd, 4, 4, ...baseColor) }),
			rasterLayer(psd, "L2", "top", {
				bitmap: solidBitmap(psd, 4, 4, ...topColor),
				blendMode,
				opacity,
			}),
		],
		{ width: 4, height: 4 },
	);
	return psd.composePsdDocument(document);
}

test("normal blending is source-over", () => {
	const out = composeTwo([100, 100, 100], [200, 50, 0], "normal");
	assert.deepEqual(pixelAt(out, 0, 0), [200, 50, 0, 255]);
});

test("multiply darkens", () => {
	const out = composeTwo([100, 200, 255], [128, 128, 128], "multiply");
	const [r, g, b] = pixelAt(out, 1, 1);
	assert.ok(Math.abs(r - Math.round((100 * 128) / 255)) <= 1);
	assert.ok(Math.abs(g - Math.round((200 * 128) / 255)) <= 1);
	assert.ok(Math.abs(b - 128) <= 1);
});

test("screen lightens", () => {
	const out = composeTwo([100, 100, 100], [100, 100, 100], "screen");
	const [r] = pixelAt(out, 0, 0);
	assert.ok(Math.abs(r - (255 - ((255 - 100) * (255 - 100)) / 255)) <= 1);
});

test("difference and invert-like symmetry", () => {
	const out = composeTwo([200, 30, 90], [70, 30, 250], "difference");
	assert.deepEqual(pixelAt(out, 2, 2).slice(0, 3), [130, 0, 160]);
});

test("opacity scales the source contribution", () => {
	const out = composeTwo([0, 0, 0], [255, 255, 255], "normal", 0.5);
	const [r] = pixelAt(out, 0, 0);
	assert.ok(Math.abs(r - 128) <= 1);
});

test("hidden layers are skipped", () => {
	const document = makeDocument(
		psd,
		[
			rasterLayer(psd, "L1", "base", { bitmap: solidBitmap(psd, 4, 4, 10, 20, 30) }),
			rasterLayer(psd, "L2", "top", {
				bitmap: solidBitmap(psd, 4, 4, 250, 250, 250),
				visible: false,
			}),
		],
		{ width: 4, height: 4 },
	);
	assert.deepEqual(pixelAt(psd.composePsdDocument(document), 0, 0), [10, 20, 30, 255]);
});

test("group opacity applies to the merged result", () => {
	const document = makeDocument(
		psd,
		[
			rasterLayer(psd, "L1", "base", { bitmap: solidBitmap(psd, 4, 4, 0, 0, 0) }),
			{
				kind: "group",
				id: "G1",
				name: "g",
				visible: true,
				opacity: 0.5,
				blendMode: "normal",
				clipping: false,
				locks: emptyLocks(),
				preservedBlocks: [],
				open: true,
				children: [
					rasterLayer(psd, "L2", "a", { bitmap: solidBitmap(psd, 4, 4, 255, 255, 255) }),
					rasterLayer(psd, "L3", "b", { bitmap: solidBitmap(psd, 4, 4, 255, 255, 255) }),
				],
			},
		],
		{ width: 4, height: 4 },
	);
	// Two stacked opaque whites inside the group must still read as one 50%
	// white coat — group opacity applies once to the merged result.
	const [r] = pixelAt(psd.composePsdDocument(document), 1, 1);
	assert.ok(Math.abs(r - 128) <= 1, `expected ~128, got ${r}`);
});

test("layer masks gate coverage", () => {
	const mask = {
		top: 0,
		left: 0,
		bottom: 4,
		right: 2,
		defaultColor: 0,
		disabled: false,
		data: new Uint8Array(2 * 4).fill(255),
	};
	const document = makeDocument(
		psd,
		[
			rasterLayer(psd, "L1", "base", { bitmap: solidBitmap(psd, 4, 4, 0, 0, 0) }),
			rasterLayer(psd, "L2", "masked", {
				bitmap: solidBitmap(psd, 4, 4, 255, 0, 0),
				mask,
			}),
		],
		{ width: 4, height: 4 },
	);
	const out = psd.composePsdDocument(document);
	assert.deepEqual(pixelAt(out, 0, 0).slice(0, 3), [255, 0, 0]); // inside mask
	assert.deepEqual(pixelAt(out, 3, 0).slice(0, 3), [0, 0, 0]); // defaultColor 0 hides
});

test("layers partially off-canvas clip cleanly", () => {
	const document = makeDocument(
		psd,
		[
			rasterLayer(psd, "L1", "off", {
				top: -2,
				left: -2,
				bitmap: solidBitmap(psd, 4, 4, 9, 9, 9),
			}),
		],
		{ width: 4, height: 4 },
	);
	const out = psd.composePsdDocument(document);
	assert.deepEqual(pixelAt(out, 0, 0).slice(0, 3), [9, 9, 9]);
	assert.equal(pixelAt(out, 3, 3)[3], 0);
});
