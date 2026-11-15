import { createEmptyLocks, walkPsdLayers, type PsdDocument } from "./document";
import { composePsdDocument } from "../render/compose";
import { PsdByteReader, PsdByteWriter } from "./binary";
const KEY = "cEdt",
	MAX_BYTES = 128 * 1024 * 1024;
export function hasGrain(document: PsdDocument): boolean {
	let found = false;
	walkPsdLayers(document.layers, (l) => {
		if (l.kind !== "group" && l.adjustment?.kind === "grain") found = true;
	});
	return found;
}
/** A standard flattened PSD for other editors, with one bounded embedded editable PSD.
 * No recursive payloads. The visible pixels must still match before restoring source layers.
 */
export function grainCompatibilityDocument(
	document: PsdDocument,
	encode: (doc: PsdDocument) => Uint8Array,
): PsdDocument {
	const bytes = encode(document);
	if (bytes.length > MAX_BYTES)
		throw new Error(
			"Editable grain payload exceeds 128 MiB. Flatten a copy before PSD export.",
		);
	const w = new PsdByteWriter();
	w.u16(1);
	w.u32(bytes.length);
	w.bytes(bytes);
	return {
		...document,
		layers: [
			{
				kind: "raster",
				id: "L1",
				name: "Composite (editable layers embedded)",
				visible: true,
				opacity: 1,
				blendMode: "normal",
				clipping: false,
				locks: createEmptyLocks(),
				preservedBlocks: [{ signature: "8BIM", key: KEY, data: w.toBytes() }],
				left: 0,
				top: 0,
				bitmap: composePsdDocument(document),
			},
		],
	};
}
export function restoreEmbeddedEditable(
	document: PsdDocument,
	decode: (bytes: Uint8Array) => PsdDocument,
	allow: boolean,
): PsdDocument {
	const blocks: Array<{ layer: (typeof document.layers)[number]; data: Uint8Array }> = [];
	walkPsdLayers(document.layers, (layer) => {
		for (const b of layer.preservedBlocks)
			if (b.key === KEY) blocks.push({ layer, data: b.data });
	});
	if (!blocks.length) return document;
	if (!allow) throw new Error("Nested editable PSD payloads are not supported");
	// Strip stale recovery metadata from a fallback document, preventing later accidental restoration.
	for (const { layer } of blocks)
		layer.preservedBlocks = layer.preservedBlocks.filter((b) => b.key !== KEY);
	try {
		if (blocks.length !== 1 || document.layers.length !== 1 || !document.editable)
			throw new Error("The visible layer structure changed");
		const { layer, data } = blocks[0];
		if (
			layer.kind !== "raster" ||
			!layer.visible ||
			layer.opacity !== 1 ||
			layer.blendMode !== "normal" ||
			layer.clipping ||
			layer.mask ||
			layer.left !== 0 ||
			layer.top !== 0 ||
			layer.adjustment ||
			layer.curves ||
			layer.bitmap.width !== document.width ||
			layer.bitmap.height !== document.height
		)
			throw new Error("The visible layer changed");
		if (data.length > MAX_BYTES + 6) throw new Error("Editable payload is too large");
		const r = new PsdByteReader(data);
		if (r.u16() !== 1) throw new Error("Unsupported editable payload version");
		const size = r.u32();
		if (size !== r.remaining()) throw new Error("Truncated editable payload");
		const inner = decode(r.bytesView(size));
		if (
			!inner.editable ||
			inner.width !== document.width ||
			inner.height !== document.height ||
			inner.colorMode !== document.colorMode ||
			!hasGrain(inner)
		)
			throw new Error("Editable payload does not match");
		const expected = (inner.composite ?? composePsdDocument(inner)).data,
			actual = layer.bitmap.data;
		if (expected.length !== actual.length || expected.some((v, i) => v !== actual[i]))
			throw new Error("Visible pixels were modified outside this editor");
		// Keep updated document-level information from the outer file.
		inner.resolutionPpi = document.resolutionPpi;
		inner.preservedResources = document.preservedResources;
		return inner;
	} catch (error) {
		document.openWarnings.push(
			`Embedded editable layers were not restored: ${String(error)}. The visible PSD is retained.`,
		);
		return document;
	}
}
