import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPsd } from "./helpers.mjs";

/**
 * A full editing session against the checked-in fixture: select, adjust,
 * filter, gradient, shape, layer style, rotate, save, reopen, undo. This is
 * the scenario a user actually performs, so it catches wiring regressions the
 * unit tests miss.
 */

const psd = await loadPsd();
const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(path.join(here, "fixtures/sample-layers.psd"));

function layerIndex(document) {
	const ids = [];
	psd.walkPsdLayers(document.layers, (layer) =>
		ids.push({ id: layer.id, kind: layer.kind, name: layer.name }),
	);
	return ids;
}

test("a full edit session saves and reopens with an identical composite", () => {
	const session = new psd.PsdEditorSession(psd.readPsd(fixture));
	const ids = layerIndex(session.peekDocument());
	const raster = ids.find((layer) => layer.kind === "raster");
	const text = ids.find((layer) => layer.kind === "text");
	assert.ok(raster && text, "fixture has a raster and a text layer");

	const steps = [
		[{ type: "selection.set", shape: "ellipse", x: 100, y: 60, width: 200, height: 180 }],
		[
			{
				type: "adjustment.apply",
				layerId: raster.id,
				kind: "vibrance",
				params: { vibrance: 60 },
			},
		],
		[
			{
				type: "filter.apply",
				layerId: raster.id,
				kind: "gaussian-blur",
				params: { radius: 3 },
			},
		],
		[{ type: "selection.clear" }],
		[
			{
				type: "gradient.apply",
				layerId: raster.id,
				gradientType: "radial",
				from: { x: 240, y: 160 },
				to: { x: 440, y: 300 },
				stops: [
					{ at: 0, color: { r: 255, g: 255, b: 255 }, alpha: 0.5 },
					{ at: 1, color: { r: 0, g: 0, b: 0 }, alpha: 0 },
				],
			},
		],
		[
			{
				type: "shape.apply",
				layerId: raster.id,
				shape: "ellipse",
				x: 30,
				y: 200,
				width: 90,
				height: 60,
				fill: { r: 20, g: 200, b: 120 },
				stroke: { r: 255, g: 255, b: 255 },
				strokeWidth: 3,
			},
		],
		[{ type: "effect.apply", layerId: text.id, kind: "outer-glow", params: { size: 6 } }],
		[{ type: "image.rotate", operation: "rotate-90" }],
		[{ type: "image.rotate", operation: "rotate-270" }],
	];
	for (const batch of steps) session.apply(batch);

	const edited = session.peekDocument();
	const bytes = psd.writePsd(edited);
	const reopened = psd.readPsd(bytes);

	assert.equal(reopened.width, edited.width);
	assert.equal(reopened.height, edited.height);
	assert.equal(reopened.editable, true);
	assert.equal(layerIndex(reopened).length, ids.length, "layer count survives the round trip");

	const before = psd.composePsdDocument(edited);
	const after = psd.composePsdDocument(reopened);
	let maxDelta = 0;
	for (let index = 0; index < before.data.length; index++) {
		maxDelta = Math.max(maxDelta, Math.abs(before.data[index] - after.data[index]));
	}
	assert.equal(maxDelta, 0, "the reopened composite matches what the editor showed");

	let undone = 0;
	while (session.canUndo() && undone < 50) {
		session.undo();
		undone++;
	}
	assert.equal(undone, steps.length, "every edit is one undo step");
	const restored = session.peekDocument();
	assert.equal(restored.width, 480);
	assert.equal(restored.height, 320);
	assert.equal(restored.selection ?? null, null);
});

test("the AI surface drives the same session end to end", async () => {
	const session = new psd.PsdEditorSession(psd.readPsd(fixture));
	const api = psd.createPsdAiApi({ session, document: () => session.peekDocument() });
	const ids = layerIndex(session.peekDocument());
	const raster = ids.find((layer) => layer.kind === "raster");

	const result = await api.execute([
		{ type: "selection.magicWand", x: 5, y: 5, tolerance: 40 },
		{ type: "layer.fromSelection", sourceLayerId: raster.id, name: "Cut" },
		{ type: "filter.apply", layerId: raster.id, kind: "posterize", params: { levels: 5 } },
		{ type: "selection.clear" },
		{ type: "layers.list", limit: 3 },
	]);

	assert.equal(result.success, true);
	assert.equal(result.createdIds.length, 1);
	assert.ok(result.affectedIds.includes(raster.id));
	const page = result.values[4];
	assert.equal(page.returned, 3);
	assert.ok(page.total > 3);
	assert.equal(psd.writePsd(session.peekDocument()).length > 0, true, "the result still saves");
});
