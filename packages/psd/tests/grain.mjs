import test from "node:test";
import assert from "node:assert/strict";
import { loadPsd, makeDocument, rasterLayer, solidBitmap } from "./helpers.mjs";
const p = await loadPsd();
function doc() {
	const s = new p.PsdEditorSession(
		makeDocument(
			p,
			[rasterLayer(p, "base", "Base", { bitmap: solidBitmap(p, 24, 16, 100, 120, 140) })],
			{ width: 24, height: 16 },
		),
	);
	s.apply([{ type: "adjustment.set", adjustment: p.defaultLiveAdjustment("grain") }]);
	return s.peekDocument();
}
function block(bytes, key) {
	for (let i = 0; i < bytes.length - 12; i++)
		if (
			String.fromCharCode(...bytes.subarray(i, i + 4)) === "8BIM" &&
			String.fromCharCode(...bytes.subarray(i + 4, i + 8)) === key
		)
			return i;
	throw Error("Missing " + key);
}
// Replace the outer custom key so the standard PSD fallback is opened alone.
function external(bytes) {
	const b = bytes.slice(),
		i = block(b, "cEdt");
	b.set(new TextEncoder().encode("test"), i + 4);
	return p.readPsd(b);
}
test("grain is seeded, monochrome, alpha-preserving and invariant to tile origin", () => {
	const b = solidBitmap(p, 20, 12, 128, 128, 128, 129),
		a = p.defaultLiveAdjustment("grain");
	const out = p.applyGrain(b, a);
	assert.deepEqual(p.applyGrain(b, a), out);
	assert.notDeepEqual(p.applyGrain(b, { ...a, seed: 2 }).data, out.data);
	for (let i = 0; i < out.data.length; i += 4) {
		assert.equal(out.data[i], out.data[i + 1]);
		assert.equal(out.data[i + 3], 129);
	}
	const tile = p.applyGrain(solidBitmap(p, 6, 4, 128, 128, 128, 129), a, 7, 3);
	for (let y = 0; y < 4; y++)
		for (let x = 0; x < 6; x++)
			assert.equal(tile.data[(y * 6 + x) * 4], out.data[((y + 3) * 20 + x + 7) * 4]);
	assert.deepEqual(p.applyGrain(b, { ...a, amount: 0 }).data, b.data);
	assert.deepEqual(b.data, solidBitmap(p, 20, 12, 128, 128, 128, 129).data);
});
test("grain PSD has an identical standard fallback and restores editable layers repeatedly", () => {
	const d = doc(),
		bytes = p.writePsd(d),
		flat = external(bytes);
	assert.equal(flat.layers.length, 1);
	assert.deepEqual(p.composePsdDocument(flat).data, p.composePsdDocument(d).data);
	let saved = bytes;
	for (let i = 0; i < 3; i++) {
		const r = p.readPsd(saved);
		assert.equal(r.layers.length, 2);
		assert.equal(r.layers[1].adjustment.kind, "grain");
		assert.deepEqual(r.openWarnings, []);
		saved = p.writePsd(r);
	}
	assert.ok(saved.length < bytes.length + 100);
	// Non-byte opacity values are normalized by ordinary PSD layer storage, not mistaken for external edits.
	d.layers[0].opacity = 0.9;
	assert.equal(p.readPsd(p.writePsd(d)).layers.length, 2);
});
test("external pixel edits invalidate the embedded source and are retained on later saves", () => {
	const bytes = p.writePsd(doc()),
		flat = external(bytes),
		at = block(bytes, "cEdt"),
		length = new DataView(bytes.buffer, bytes.byteOffset + at + 8, 4).getUint32(0);
	flat.layers[0].preservedBlocks = [
		{ signature: "8BIM", key: "cEdt", data: bytes.slice(at + 12, at + 12 + length) },
	];
	flat.layers[0].bitmap.data[0] ^= 255;
	const changed = p.readPsd(p.writePsd(flat));
	assert.equal(changed.layers.length, 1);
	assert.match(changed.openWarnings.join(" "), /modified outside/);
	assert.equal(changed.layers[0].bitmap.data[0], flat.layers[0].bitmap.data[0]);
	assert.equal(p.readPsd(p.writePsd(changed)).layers.length, 1);
});
test("malformed embedded data falls back safely and grain parameters are validated", () => {
	const bytes = p.writePsd(doc()),
		i = block(bytes, "cEdt");
	bytes[i + 13] = 99;
	const r = p.readPsd(bytes);
	assert.equal(r.layers.length, 1);
	assert.ok(r.editable);
	assert.match(r.openWarnings.join(" "), /version/);
	for (const a of [{ size: 0 }, { amount: 101 }, { seed: -1 }, { roughness: NaN }])
		assert.throws(() =>
			p.validateLiveAdjustment({ ...p.defaultLiveAdjustment("grain"), ...a }),
		);
});

test("grain save restores grouped, masked and grayscale documents", () => {
	const d = doc(),
		s = new p.PsdEditorSession(d),
		id = d.layers[1].id;
	s.apply([
		{ type: "layer.mask", layerId: id, operation: "hide-all" },
		{ type: "layer.group", layerIds: ["base", id] },
	]);
	const r = p.readPsd(p.writePsd(s.peekDocument()));
	assert.equal(r.layers[0].kind, "group");
	assert.equal(r.layers[0].children[1].adjustment.kind, "grain");
	assert.ok(r.layers[0].children[1].mask);
	assert.deepEqual(p.composePsdDocument(r).data, p.composePsdDocument(s.peekDocument()).data);
	const gray = doc();
	gray.colorMode = "grayscale";
	gray.layers[0].bitmap = solidBitmap(p, 24, 16, 128, 128, 128, 100);
	const g = p.readPsd(p.writePsd(gray));
	assert.equal(g.layers.length, 2);
	assert.equal(g.colorMode, "grayscale");
	assert.deepEqual(g.openWarnings, []);
});
test("nested editable payload cannot recurse into another document", () => {
	const inner = p.writePsd(doc()),
		flat = external(inner),
		data = new Uint8Array(inner.length + 6),
		v = new DataView(data.buffer);
	v.setUint16(0, 1);
	v.setUint32(2, inner.length);
	data.set(inner, 6);
	flat.layers[0].preservedBlocks = [{ signature: "8BIM", key: "cEdt", data }];
	const r = p.readPsd(p.writePsd(flat));
	assert.equal(r.layers.length, 1);
	assert.match(r.openWarnings.join(" "), /Nested/);
});
