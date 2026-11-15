import test from "node:test";
import assert from "node:assert/strict";
import { loadPsd } from "./helpers.mjs";

const psd = await loadPsd();

/** One valid sample per action type; the gate deletes fields one by one. */
const VALID_SAMPLES = {
 "mask.set":{type:"mask.set",layerId:"L1",width:1,height:1,dataBase64:"/w=="},
	"retouch.apply": {
		type: "retouch.apply",
		layerId: "L1",
		tool: "blur",
		points: [{ x: 2, y: 2 }],
		size: 10,
	},
	"contentAware.fill": { type: "contentAware.fill", layerId: "L1" },
	"adjustment.set": { type: "adjustment.set", adjustment: psd.defaultLiveAdjustment("exposure") },
	"mask.edit": { type: "mask.edit", layerId: "L1", operation: "fill", value: 0 },
	"curves.set": { type: "curves.set", curves: psd.identityCurves() },
	"layer.rename": { type: "layer.rename", layerId: "L1", name: "x" },
	"layer.setVisible": { type: "layer.setVisible", layerId: "L1", visible: true },
	"layer.setLocked": { type: "layer.setLocked", layerId: "L1", locked: true },
	"layer.setOpacity": { type: "layer.setOpacity", layerId: "L1", opacity: 0.5 },
	"layer.setBlendMode": { type: "layer.setBlendMode", layerId: "L1", blendMode: "multiply" },
	"layer.reorder": { type: "layer.reorder", layerId: "L1", index: 0 },
	"layer.delete": { type: "layer.delete", layerIds: ["L1"] },
	"layer.clearSelected": { type: "layer.clearSelected", layerId: "L1" },
	"layer.duplicate": { type: "layer.duplicate", layerId: "L1" },
	"layer.import": { type: "layer.import", psdBase64: "AAAA" },
	"layer.add": { type: "layer.add" },
	"layer.group": { type: "layer.group", layerIds: ["L1"] },
	"layer.ungroup": { type: "layer.ungroup", groupId: "L1" },
	"layer.mergeDown": { type: "layer.mergeDown", layerId: "L1" },
	"layer.merge": { type: "layer.merge", layerIds: ["L1", "L2"] },
	"layer.move": { type: "layer.move", layerId: "L1", dx: 1, dy: -2 },
	"layer.scale": { type: "layer.scale", layerId: "L1", width: 10, height: 10 },
	"text.setContent": { type: "text.setContent", layerId: "L1", text: "hello" },
	"text.setStyle": {
		type: "text.setStyle",
		layerId: "L1",
		style: {
			fontFamily: "Arial",
			fontSize: 24,
			bold: true,
			italic: false,
			underline: false,
			strikethrough: false,
			color: { r: 1, g: 2, b: 3 },
		},
	},
	"adjustment.apply": { type: "adjustment.apply", layerId: "L1", kind: "invert" },
	"fill.apply": { type: "fill.apply", layerId: "L1", color: { r: 1, g: 2, b: 3 } },
	"stroke.apply": {
		type: "stroke.apply",
		layerId: "L1",
		tool: "brush",
		points: [{ x: 1, y: 2 }],
		size: 4,
		color: { r: 0, g: 0, b: 0 },
	},
	"bucket.apply": {
		type: "bucket.apply",
		layerId: "L1",
		x: 1,
		y: 1,
		color: { r: 9, g: 9, b: 9 },
	},
	"layer.mask": { type: "layer.mask", layerId: "L1", operation: "reveal-all" },
	"layer.setClipping": { type: "layer.setClipping", layerId: "L1", clipping: true },
	"layer.mergeVisible": { type: "layer.mergeVisible" },
	"image.flatten": { type: "image.flatten" },
	"layer.rasterize": { type: "layer.rasterize", layerId: "L1" },
	"layer.fromSelection": { type: "layer.fromSelection", sourceLayerId: "L1" },
	"transform.selection":{type:"transform.selection",layerIds:["L1"],scaleX:1},
 "transform.apply": { type: "transform.apply", layerId: "L1", operation: "flip-horizontal" },
	"text.addLayer": { type: "text.addLayer", text: "hi", x: 4, y: 4 },
	"filter.apply": { type: "filter.apply", layerId: "L1", kind: "gaussian-blur" },
	"effect.apply": { type: "effect.apply", layerId: "L1", kind: "drop-shadow" },
	"gradient.apply": {
		type: "gradient.apply",
		layerId: "L1",
		gradientType: "linear",
		from: { x: 0, y: 0 },
		to: { x: 10, y: 10 },
		stops: [{ at: 0, color: { r: 0, g: 0, b: 0 } }],
	},
	"shape.apply": {
		type: "shape.apply",
		layerId: "L1",
		shape: "rectangle",
		x: 1,
		y: 1,
		width: 5,
		height: 5,
		fill: { r: 1, g: 2, b: 3 },
	},
	"selection.fromLayer": { type: "selection.fromLayer", layerId: "L1", source: "pixels" },
	"selection.set": { type: "selection.set", shape: "rectangle", x: 0, y: 0, width: 4, height: 4 },
	"selection.setPolygon": {
		type: "selection.setPolygon",
		points: [
			{ x: 0, y: 0 },
			{ x: 4, y: 0 },
			{ x: 2, y: 4 },
		],
	},
	"selection.magicWand": { type: "selection.magicWand", x: 1, y: 1 },
	"selection.all": { type: "selection.all" },
	"selection.clear": { type: "selection.clear" },
	"selection.invert": { type: "selection.invert" },
	"selection.feather": { type: "selection.feather", radius: 8 },
	"selection.translate": { type: "selection.translate", dx: 2, dy: -1 },
	"selection.save": { type: "selection.save", name: "Subject" },
	"selection.load": { type: "selection.load", name: "Subject" },
	"image.resize": { type: "image.resize", width: 32, height: 32 },
	"image.flip": { type: "image.flip", operation: "flip-horizontal" },
	"image.rotate": { type: "image.rotate", operation: "rotate-90" },
	"canvas.resize": { type: "canvas.resize", width: 100, height: 100 },
	"canvas.crop": { type: "canvas.crop", x: 0, y: 0, width: 10, height: 10 },
};

test("every action type has a sample and every sample validates", () => {
	assert.deepEqual(Object.keys(VALID_SAMPLES).sort(), [...psd.PSD_ACTION_TYPES].sort());
	for (const sample of Object.values(VALID_SAMPLES)) {
		psd.validatePsdAction(sample);
	}
});

test("deleting any required field fails validation", () => {
	for (const type of psd.PSD_ACTION_TYPES) {
		const descriptor = psd.psdActionDescriptor(type);
		for (const field of descriptor.required) {
			const broken = { ...VALID_SAMPLES[type] };
			delete broken[field];
			assert.throws(
				() => psd.validatePsdAction(broken),
				new RegExp(field),
				`${type} without ${field} must fail`,
			);
		}
	}
});

test("unknown top-level fields are rejected", () => {
	for (const type of psd.PSD_ACTION_TYPES) {
		const broken = { ...VALID_SAMPLES[type], extraneous: 1 };
		assert.throws(() => psd.validatePsdAction(broken), /extraneous/);
	}
});

test("unknown nested fields are rejected", () => {
	assert.throws(
		() =>
			psd.validatePsdAction({
				type: "fill.apply",
				layerId: "L1",
				color: { r: 1, g: 2, b: 3, alpha: 1 },
			}),
		/alpha/,
	);
	assert.throws(
		() =>
			psd.validatePsdAction({
				type: "stroke.apply",
				layerId: "L1",
				tool: "brush",
				points: [{ x: 1, y: 2, pressure: 1 }],
				size: 4,
				color: { r: 0, g: 0, b: 0 },
			}),
		/pressure/,
	);
});

test("out-of-range values are rejected", () => {
	assert.throws(
		() => psd.validatePsdAction({ type: "layer.setOpacity", layerId: "L1", opacity: 1.5 }),
		/between 0 and 1/,
	);
	assert.throws(
		() =>
			psd.validatePsdAction({ type: "layer.setBlendMode", layerId: "L1", blendMode: "glow" }),
		/must be one of/,
	);
	assert.throws(
		() => psd.validatePsdAction({ type: "canvas.resize", width: 0, height: 10 }),
		/width/,
	);
});

test("descriptor metadata matches the validator's contract", () => {
	for (const descriptor of psd.psdActionDescriptors()) {
		assert.ok(descriptor.title.length > 0);
		assert.ok(descriptor.description.length > 0);
		for (const field of descriptor.required) {
			assert.ok(
				!descriptor.optional.includes(field),
				`${descriptor.type}: ${field} is both required and optional`,
			);
		}
	}
});
