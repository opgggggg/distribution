import assert from "node:assert/strict";

import {
	createBlankPsd,
	decodePsdComposite,
	parsePsd,
	PSD_ARTIFACT_PLUGIN,
	PsdEditorModel,
} from "../dist/psd.mjs";

function layeredPixelPsd() {
	const bytes = new Uint8Array(135);
	const view = new DataView(bytes.buffer);
	bytes.set([0x38, 0x42, 0x50, 0x53], 0);
	view.setUint16(4, 1, false);
	view.setUint16(12, 3, false);
	view.setUint32(14, 1, false);
	view.setUint32(18, 1, false);
	view.setUint16(22, 8, false);
	view.setUint16(24, 3, false);
	let position = 26;
	for (let index = 0; index < 2; index++) {
		view.setUint32(position, 0, false);
		position += 4;
	}
	view.setUint32(position, 92, false);
	position += 4;
	view.setUint32(position, 88, false);
	position += 4;
	view.setInt16(position, 1, false);
	position += 2;
	for (const value of [0, 0, 1, 1]) {
		view.setInt32(position, value, false);
		position += 4;
	}
	view.setUint16(position, 4, false);
	position += 2;
	for (const id of [0, 1, 2, -1]) {
		view.setInt16(position, id, false);
		view.setUint32(position + 2, 3, false);
		position += 6;
	}
	bytes.set(new TextEncoder().encode("8BIMnorm"), position);
	position += 8;
	bytes[position++] = 204;
	bytes[position++] = 0;
	bytes[position++] = 0;
	bytes[position++] = 0;
	view.setUint32(position, 16, false);
	position += 4;
	view.setUint32(position, 0, false);
	position += 4;
	view.setUint32(position, 0, false);
	position += 4;
	bytes[position++] = 5;
	bytes.set(new TextEncoder().encode("Layer"), position);
	position += 5;
	position += 2;
	for (const value of [255, 0, 0, 255]) {
		view.setUint16(position, 0, false);
		bytes[position + 2] = value;
		position += 3;
	}
	assert.equal(position, 130);
	view.setUint16(position, 0, false);
	bytes[position + 2] = 255;
	bytes[position + 3] = 0;
	bytes[position + 4] = 0;
	return bytes;
}

const blank = createBlankPsd(3, 2);
const blankDocument = parsePsd(blank);
assert.equal(blankDocument.width, 3);
assert.equal(blankDocument.height, 2);
assert.equal(blankDocument.colorMode, "rgb");
assert.equal(blankDocument.layers.length, 0);
assert.deepEqual([...decodePsdComposite(blankDocument).pixels.slice(0, 4)], [255, 255, 255, 255]);

const source = layeredPixelPsd();
const parsed = parsePsd(source);
assert.equal(parsed.layers.length, 1);
assert.equal(parsed.layers[0].name, "Layer");
assert.equal(parsed.layers[0].opacity, 204);
assert.equal(parsed.layers[0].visible, true);

const editor = new PsdEditorModel({ source });
assert.equal(editor.dirty, false);
assert.equal(editor.setLayerVisibility("layer-1", false), true);
assert.equal(editor.document.layers[0].visible, false);
assert.equal(editor.dirty, true);
assert.equal(editor.undo(), true);
assert.equal(editor.document.layers[0].visible, true);
assert.equal(editor.redo(), true);
editor.setLayerOpacity("layer-1", 128);
const exported = new Uint8Array(await editor.exportPsd().arrayBuffer());
const reparsed = parsePsd(exported);
assert.equal(reparsed.layers[0].visible, false);
assert.equal(reparsed.layers[0].opacity, 128);

const read = editor.executeCommands([{ type: "layers.list" }]);
assert.equal(read.wrote, false);
assert.equal(read.results[0][0].name, "Layer");
assert.throws(
	() => editor.executeCommands([{ type: "context.get" }], { baseRevision: 99 }),
	/revision conflict/u,
);

assert.equal(await PSD_ARTIFACT_PLUGIN.canOpen({ source: new Blob([source]) }), true);
const session = await PSD_ARTIFACT_PLUGIN.open({ source, artifactId: "sample.psd" });
assert.equal(session.format, "psd");
assert.equal(session.getState().readonly, false);
assert.equal((await session.export()).type, "image/vnd.adobe.photoshop");
await session.close();

const readonlySession = await PSD_ARTIFACT_PLUGIN.open({ source, access: "read" });
assert.equal(readonlySession.capabilities.edit, undefined);
assert.equal(readonlySession.capabilities["ai-write"], undefined);
await assert.rejects(
	readonlySession.execute({
		commands: [{ type: "layer.setVisibility", layerId: "layer-1", visible: false }],
	}),
	/read-only/u,
);
await readonlySession.close();

console.log("PSD parser, source-preserving edits, and artifact plugin: ok");
