import test from "node:test";
import assert from "node:assert/strict";
import { loadPsd, makeDocument, rasterLayer, solidBitmap } from "./helpers.mjs";

const psd = await loadPsd();

function newSession() {
	const document = makeDocument(psd, [
		rasterLayer(psd, "L1", "bottom", { bitmap: solidBitmap(psd, 16, 16, 10, 10, 10) }),
		rasterLayer(psd, "L2", "top", { bitmap: solidBitmap(psd, 8, 8, 200, 0, 0) }),
	]);
	return new psd.PsdEditorSession(document);
}

test("apply advances the revision and reports truthful ids", () => {
	const session = newSession();
	const result = session.apply([{ type: "layer.rename", layerId: "L2", name: "renamed" }]);
	assert.equal(result.revision, 1);
	assert.deepEqual(result.affectedIds, ["L2"]);
	assert.equal(result.noop, false);
	assert.equal(session.peekDocument().layers[1].name, "renamed");
});

test("a no-effect write reports noop without a new revision", () => {
	const session = newSession();
	const result = session.apply([{ type: "layer.setVisible", layerId: "L2", visible: true }]);
	assert.equal(result.noop, true);
	assert.equal(result.revision, 0);
	assert.equal(session.canUndo(), false);
});

test("batches are atomic: a failing action rolls the whole batch back", () => {
	const session = newSession();
	assert.throws(
		() =>
			session.apply([
				{ type: "layer.rename", layerId: "L1", name: "changed" },
				{ type: "layer.delete", layerIds: ["missing-id"] },
			]),
		/missing-id/,
	);
	assert.equal(session.peekDocument().layers[0].name, "bottom");
	assert.equal(session.getRevision(), 0);
});

test("revision conflicts refuse before any work", () => {
	const session = newSession();
	session.apply([{ type: "layer.rename", layerId: "L1", name: "first" }]);
	assert.throws(
		() =>
			session.apply([{ type: "layer.rename", layerId: "L1", name: "second" }], {
				baseRevision: 0,
			}),
		/conflict/i,
	);
	assert.equal(session.peekDocument().layers[0].name, "first");
});

test("undo and redo restore prior states and stateIds", () => {
	const session = newSession();
	const initialState = session.getStateId();
	session.apply([{ type: "layer.rename", layerId: "L1", name: "one" }]);
	session.apply([{ type: "layer.setOpacity", layerId: "L1", opacity: 0.25 }]);
	assert.equal(session.peekDocument().layers[0].opacity, 0.25);

	assert.ok(session.undo());
	assert.equal(session.peekDocument().layers[0].opacity, 1);
	assert.equal(session.peekDocument().layers[0].name, "one");

	assert.ok(session.undo());
	assert.equal(session.peekDocument().layers[0].name, "bottom");
	assert.equal(session.getStateId(), initialState);

	assert.ok(session.redo());
	assert.equal(session.peekDocument().layers[0].name, "one");
	assert.equal(session.canRedo(), true);
});

test("a new edit truncates the redo branch", () => {
	const session = newSession();
	session.apply([{ type: "layer.rename", layerId: "L1", name: "one" }]);
	session.undo();
	session.apply([{ type: "layer.rename", layerId: "L1", name: "two" }]);
	assert.equal(session.canRedo(), false);
});

test("history entries expose labels and goToState jumps", () => {
	const session = newSession();
	session.apply([{ type: "layer.rename", layerId: "L1", name: "one" }], { label: "Rename" });
	session.apply([{ type: "layer.setOpacity", layerId: "L1", opacity: 0.5 }], {
		label: "Opacity",
	});
	const history = session.historyEntries();
	assert.equal(history.past.length, 2);
	assert.equal(history.current.label, "Opacity");
	assert.ok(session.goToState(history.past[0].stateId));
	assert.equal(session.peekDocument().layers[0].name, "bottom");
	assert.ok(session.goToState(history.current.stateId));
	assert.equal(session.peekDocument().layers[0].opacity, 0.5);
});

test("undo shares unedited bitmaps structurally", () => {
	const session = newSession();
	const before = session.peekDocument().layers[0].bitmap;
	session.apply([
		{
			type: "stroke.apply",
			layerId: "L2",
			tool: "brush",
			points: [{ x: 2, y: 2 }],
			size: 2,
			color: { r: 1, g: 2, b: 3 },
		},
	]);
	const after = session.peekDocument().layers[0].bitmap;
	assert.equal(after, before, "untouched layer bitmap is the same object");
});

test("transactions carry source and actor attribution", () => {
	const session = newSession();
	let seen;
	session.subscribe((_snapshot, result) => {
		if (result) seen = result;
	});
	session.apply([{ type: "layer.rename", layerId: "L1", name: "x" }], {
		source: "ai",
		actorId: "assistant-7",
	});
	assert.equal(seen.source, "ai");
	assert.equal(seen.actorId, "assistant-7");
});

test("locked layers refuse edits", () => {
	const session = newSession();
	session.apply([{ type: "layer.setLocked", layerId: "L2", locked: true }]);
	assert.throws(
		() => session.apply([{ type: "layer.setOpacity", layerId: "L2", opacity: 0.5 }]),
		/locked/i,
	);
});

test("group, ungroup, merge, duplicate, delete lifecycle", () => {
	const session = newSession();
	const grouped = session.apply([{ type: "layer.group", layerIds: ["L1", "L2"], name: "G" }]);
	assert.equal(grouped.createdIds.length, 1);
	const groupId = grouped.createdIds[0];
	assert.equal(session.peekDocument().layers.length, 1);

	const dup = session.apply([{ type: "layer.duplicate", layerId: groupId }]);
	// A duplicated group re-ids itself and every child.
	assert.equal(dup.createdIds.length, 3);
	assert.equal(session.peekDocument().layers.length, 2);

	const merged = session.apply([{ type: "layer.merge", layerIds: [groupId, dup.createdIds[0]] }]);
	assert.equal(merged.createdIds.length, 1);
	assert.equal(merged.deletedIds.length, 2);
	assert.equal(session.peekDocument().layers.length, 1);
	assert.equal(session.peekDocument().layers[0].kind, "raster");

	const deleted = session.apply([{ type: "layer.delete", layerIds: merged.createdIds }]);
	assert.deepEqual(deleted.deletedIds, merged.createdIds);
	assert.equal(session.peekDocument().layers.length, 0);
});

test("text.setContent rewrites the TySh text and reports raster diagnostics", async () => {
	const { makeTySh } = await import("./helpers.mjs");
	const document = makeDocument(psd, [
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
			bitmap: solidBitmap(psd, 10, 10, 255, 255, 255),
			text: { text: "OLD", raw: makeTySh(psd, "OLD") },
		},
	]);
	const session = new psd.PsdEditorSession(document);
	const result = session.apply([{ type: "text.setContent", layerId: "T1", text: "NEW" }]);
	const layer = session.peekDocument().layers[0];
	assert.equal(layer.text.text, "NEW");
	assert.equal(psd.extractTyShText(layer.text.raw), "NEW");
	// No rasterizer in node: the diagnostic says pixels were not re-rendered.
	assert.ok(result.diagnostics.some((entry) => entry.includes("re-render")));
});

test("text.setStyle is undoable and preserves the complete single-run style", async () => {
	const { makeTySh } = await import("./helpers.mjs");
	const document = makeDocument(psd, [
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
			bitmap: solidBitmap(psd, 10, 10, 255, 255, 255),
			text: { text: "Title", raw: makeTySh(psd, "Title") },
		},
	]);
	const session = new psd.PsdEditorSession(document);
	const style = {
		fontFamily: "Georgia",
		fontSize: 36,
		bold: true,
		italic: true,
		underline: true,
		strikethrough: false,
		color: { r: 12, g: 34, b: 56 },
	};
	const result = session.apply([{ type: "text.setStyle", layerId: "T1", style }]);
	assert.deepEqual(session.peekDocument().layers[0].text.style, style);
	assert.ok(result.diagnostics.some((entry) => entry.includes("re-rendered")));
	assert.ok(session.undo());
	assert.equal(session.peekDocument().layers[0].text.style, undefined);
	assert.ok(session.redo());
	assert.deepEqual(session.peekDocument().layers[0].text.style, style);
});

test("canvas crop shifts layers", () => {
	const session = newSession();
	session.apply([{ type: "canvas.crop", x: 4, y: 4, width: 8, height: 8 }]);
	const document = session.peekDocument();
	assert.equal(document.width, 8);
	assert.equal(document.layers[0].top, -4);
	assert.equal(document.layers[0].left, -4);
});

test("stroke on empty area grows the layer bitmap within the canvas", () => {
	const session = newSession();
	// L2 is 8x8 at (0,0); paint at (12,12) — outside its bitmap.
	session.apply([
		{
			type: "stroke.apply",
			layerId: "L2",
			tool: "brush",
			points: [{ x: 12, y: 12 }],
			size: 4,
			color: { r: 0, g: 255, b: 0 },
		},
	]);
	const layer = session.peekDocument().layers[1];
	assert.ok(layer.bitmap.width >= 14, `bitmap grew to ${layer.bitmap.width}`);
	const localX = 12 - layer.left;
	const localY = 12 - layer.top;
	const p = (localY * layer.bitmap.width + localX) * 4;
	assert.equal(layer.bitmap.data[p + 1], 255);
});
