import test from "node:test";
import assert from "node:assert/strict";
import {
	IPAD_GRID_COLORS,
	spectrumColor,
	normalizeHex,
	loadColorSamples,
	saveColorSamples,
	loadColorMode,
	saveColorMode,
} from "../dist/vue/color-picker-model.js";
test("iPad grid matches the 12 by 10 native sRGB reference", () => {
	assert.equal(IPAD_GRID_COLORS.length, 120);
	assert.equal(new Set(IPAD_GRID_COLORS).size, 120);
	assert.deepEqual(IPAD_GRID_COLORS.slice(0, 12), [
		"#ffffff",
		"#ebebeb",
		"#d6d6d6",
		"#c2c2c2",
		"#adadad",
		"#999999",
		"#858585",
		"#707070",
		"#5c5c5c",
		"#474747",
		"#333333",
		"#000000",
	]);
	assert.equal(IPAD_GRID_COLORS[12], "#00374a");
	assert.equal(IPAD_GRID_COLORS[65], "#ff4015");
	assert.equal(IPAD_GRID_COLORS[119], "#dfeed4");
});
test("spectrum bounds, color values and native hex entry remain valid", () => {
	for (const y of [0, 0.25, 0.5, 0.75, 1]) {
		assert.equal(spectrumColor(0, y), "#ffffff");
		assert.equal(spectrumColor(1, y), "#000000");
		assert.match(spectrumColor(0.5, y), /^#[\da-f]{6}$/);
	}
	assert.equal(normalizeHex("abc"), "#aabbcc");
	assert.equal(normalizeHex(" #7329BD "), "#7329bd");
	assert.equal(normalizeHex("xyz"), undefined);
	assert.equal(normalizeHex("#ffffff80"), undefined);
});
test("color samples persist RGB and opacity and survive unavailable storage", () => {
	const values = new Map();
	globalThis.localStorage = {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, value),
	};
	const sample = [{ color: "#742abc", opacity: 0.4 }];
	saveColorSamples(sample);
	assert.deepEqual(loadColorSamples(), sample);
	values.set(
		"cubeoffice.notes.colorSamples.v1",
		'[{"color":"bad","opacity":1},{"color":"#123456","opacity":2}]',
	);
	assert.deepEqual(loadColorSamples(), []);
	globalThis.localStorage = {
		getItem() {
			throw Error("unavailable");
		},
		setItem() {
			throw Error("quota");
		},
	};
	assert.equal(loadColorSamples().length, 5);
	assert.doesNotThrow(() => saveColorSamples(sample));
	delete globalThis.localStorage;
});

test("picker tab preference persists and rejects unsupported values", () => {
	const values = new Map();
	globalThis.localStorage = {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, value),
	};
	assert.equal(loadColorMode(), "grid");
	saveColorMode("sliders");
	assert.equal(loadColorMode(), "sliders");
	saveColorMode("invalid");
	assert.equal(loadColorMode(), "grid");
	delete globalThis.localStorage;
});

test("canvas palette deduplicates visible paint colors across brush styles and opacity", async () => {
	const { canvasColors } = await import("../dist/vue/color-picker-model.js");
	const { createPage } = await import("../dist/model.js");
	const page = createPage();
	page.layers[0].elements = [
		{ kind: "stroke", color: "#FF0011", points: [{}], opacity: 1 },
		{ kind: "stroke", color: "#ff0011", points: [{}], opacity: 0.2 },
		{ kind: "text", color: "#123456", text: "Label" },
		{ kind: "text", color: "#abcdef", text: "  " },
		{ kind: "stroke", color: "#abcdef", points: [], opacity: 1 },
		{ kind: "stroke", color: "#abcdef", points: [{}], opacity: 0 },
		{ kind: "image", src: "data:image/png;base64,..." },
	];
	page.layers.push({
		visible: false,
		elements: [{ kind: "text", text: "Hidden", color: "#abcdef" }],
	});
	assert.deepEqual(canvasColors(page), ["#ff0011", "#123456"]);
	page.layers[0].elements.shift();
	assert.deepEqual(canvasColors(page), ["#ff0011", "#123456"]);
	page.layers[0].elements.shift();
	assert.deepEqual(canvasColors(page), ["#123456"]);
	assert.deepEqual(canvasColors(undefined), []);
});
