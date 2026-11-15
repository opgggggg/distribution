import { hasGrain, grainCompatibilityDocument } from "./embedded-editable";
/**
 * PSD writer. Rebuilds the full file from the document model: parsed state is
 * re-encoded (RLE), and every preserved byte range — color mode data, image
 * resources, unknown additional-info blocks, global mask info — is emitted
 * verbatim so unedited source content survives the round trip.
 */

import { LIVE_ADJUSTMENT_KEYS } from "./adjustment-blocks";
import { layerExtensionBlocks } from "./layer-extensions";
import { PsdByteWriter } from "./binary";
import { encodePackBitsPlane } from "./packbits";
import { composePsdDocument } from "../render/compose";
import {
	PSD_BLEND_MODE_KEYS,
	PSD_COLOR_MODE_CODES,
	walkPsdLayers,
	type PsdBitmap,
	type PsdDocument,
	type PsdGroupLayer,
	type PsdLayerNode,
	type PsdPreservedBlock,
} from "./document";
import { encodePsdTextStyle, PSD_TEXT_STYLE_BLOCK_KEY } from "./text-style";

const RESOLUTION_RESOURCE_ID = 1005;

interface FlatRecord {
	kind: "layer" | "folder" | "bounding";
	layer: PsdLayerNode | null;
	group?: PsdGroupLayer;
}

export class PsdWriteError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PsdWriteError";
	}
}

export function writePsd(document: PsdDocument): Uint8Array {
	return writePsdInternal(document, true);
}
function writePsdInternal(document: PsdDocument, compatibility: boolean): Uint8Array {
	if (!document.editable) {
		throw new PsdWriteError("This document opened read-only and cannot be rewritten.");
	}
	if (document.colorMode !== "rgb" && document.colorMode !== "grayscale") {
		throw new PsdWriteError(`Writing ${document.colorMode} documents is not supported.`);
	}
	if (document.bitsPerChannel !== 8) {
		throw new PsdWriteError(
			`Writing ${document.bitsPerChannel}-bit documents is not supported.`,
		);
	}

	if (compatibility && hasGrain(document))
		return writePsdInternal(
			grainCompatibilityDocument(document, (doc) => writePsdInternal(doc, false)),
			false,
		);
	const writer = new PsdByteWriter();
	const composite = composePsdDocument(document);
	const grayscale = document.colorMode === "grayscale";

	// --- header --- the source color mode is kept; an alpha channel is always
	// written so layer transparency survives in the composite too.
	writer.signature("8BPS");
	writer.u16(1);
	writer.zeros(6);
	writer.u16(grayscale ? 2 : 4);
	writer.u32(document.height);
	writer.u32(document.width);
	writer.u16(8);
	writer.u16(PSD_COLOR_MODE_CODES[document.colorMode]);

	// --- color mode data ---
	writer.section(1, () => writer.bytes(document.colorModeData));

	// --- image resources ---
	writer.section(1, () => {
		let wroteResolution = false;
		for (const resource of document.preservedResources) {
			writer.signature("8BIM");
			writer.u16(resource.id);
			writer.pascalString(resource.name, 2);
			writer.section(2, () => writer.bytes(resource.data));
			if (resource.id === RESOLUTION_RESOURCE_ID) wroteResolution = true;
		}
		if (!wroteResolution && document.resolutionPpi) {
			writer.signature("8BIM");
			writer.u16(RESOLUTION_RESOURCE_ID);
			writer.pascalString("", 2);
			writer.section(2, () => {
				const fixed = Math.round(document.resolutionPpi! * 0x10000);
				writer.u32(fixed); // horizontal ppi (16.16)
				writer.u16(1); // display unit: ppi
				writer.u16(2); // height unit: cm (unused by this codec)
				writer.u32(fixed); // vertical ppi
				writer.u16(1);
				writer.u16(2);
			});
		}
	});

	// --- layer and mask info ---
	writer.section(2, () => {
		writeLayerInfo(writer, document, grayscale);
		// Global layer mask info, verbatim.
		writer.section(1, () => writer.bytes(document.globalLayerMaskInfo));
		for (const block of document.preservedGlobalBlocks) {
			writeAdditionalBlock(writer, block);
		}
	});

	// --- composite image data (RLE) ---
	writeCompositePlanes(writer, composite, grayscale);

	return writer.toBytes();
}

function flattenLayers(document: PsdDocument): FlatRecord[] {
	// File order is bottom-most first: a group is stored as its bounding
	// divider, then its children, then the folder record itself.
	const records: FlatRecord[] = [];
	const emit = (layers: readonly PsdLayerNode[]): void => {
		for (const layer of layers) {
			if (layer.kind === "group") {
				records.push({ kind: "bounding", layer: null, group: layer });
				emit(layer.children);
				records.push({ kind: "folder", layer, group: layer });
			} else {
				records.push({ kind: "layer", layer });
			}
		}
	};
	emit(document.layers);
	return records;
}

interface EncodedChannel {
	id: number;
	/** Channel data including the leading compression u16. */
	bytes: Uint8Array;
}

function encodeBitmapChannels(bitmap: PsdBitmap, grayscale: boolean): EncodedChannel[] {
	const { width, height, data } = bitmap;
	const ids = grayscale ? [-1, 0] : [-1, 0, 1, 2];
	if (!width || !height) {
		return ids.map((id) => {
			const empty = new PsdByteWriter();
			empty.u16(0);
			return { id, bytes: empty.toBytes() };
		});
	}
	const planeOffsets = grayscale ? [3, 0] : [3, 0, 1, 2];
	return ids.map((id, index) => {
		const plane = new Uint8Array(width * height);
		const offset = planeOffsets[index];
		for (let p = 0, q = offset; p < plane.length; p++, q += 4) plane[p] = data[q];
		return { id, bytes: encodeRlePlane(plane, width, height) };
	});
}

function encodeRlePlane(plane: Uint8Array, width: number, height: number): Uint8Array {
	const encoded = encodePackBitsPlane(plane, width, height);
	const out = new PsdByteWriter();
	out.u16(1); // RLE
	for (const length of encoded.rowLengths) out.u16(length);
	out.bytes(encoded.data);
	return out.toBytes();
}

function writeLayerInfo(writer: PsdByteWriter, document: PsdDocument, grayscale: boolean): void {
	writer.section(
		4,
		() => {
			const records = flattenLayers(document);
			// Negative count: first alpha channel is layer transparency.
			writer.i16(-Math.max(records.length, 0));
			if (!records.length) return;

			const encoded = records.map((record) => encodeRecordChannels(record, grayscale));

			for (let i = 0; i < records.length; i++) {
				writeLayerRecord(writer, records[i], encoded[i]);
			}
			for (const channels of encoded) {
				for (const channel of channels) writer.bytes(channel.bytes);
			}
		},
		true,
	);
}

function encodeRecordChannels(record: FlatRecord, grayscale: boolean): EncodedChannel[] {
	const layer = record.kind === "folder" ? record.group : record.layer;
	const channels = encodeBitmapChannels(
		layer && layer.kind !== "group"
			? layer.bitmap
			: { width: 0, height: 0, data: new Uint8ClampedArray(0) },
		grayscale,
	);
	if (!layer) return channels;
	if (layer.mask?.data.length) {
		const maskWidth = Math.max(0, layer.mask.right - layer.mask.left);
		const maskHeight = Math.max(0, layer.mask.bottom - layer.mask.top);
		if (maskWidth && maskHeight) {
			channels.push({
				id: -2,
				bytes: encodeRlePlane(layer.mask.data, maskWidth, maskHeight),
			});
		}
	}
	return channels;
}

function writeLayerRecord(
	writer: PsdByteWriter,
	record: FlatRecord,
	channels: EncodedChannel[],
): void {
	const layer = record.layer;
	const isDivider = record.kind !== "layer";
	const group = record.group;

	let top = 0;
	let left = 0;
	let bottom = 0;
	let right = 0;
	if (!isDivider && layer && layer.kind !== "group") {
		top = layer.top;
		left = layer.left;
		bottom = layer.top + layer.bitmap.height;
		right = layer.left + layer.bitmap.width;
	}

	writer.i32(top);
	writer.i32(left);
	writer.i32(bottom);
	writer.i32(right);
	writer.u16(channels.length);
	for (const channel of channels) {
		writer.i16(channel.id);
		writer.u32(channel.bytes.length);
	}

	const source = record.kind === "folder" ? group! : record.kind === "layer" ? layer! : null;
	writer.signature("8BIM");
	writer.signature(source ? PSD_BLEND_MODE_KEYS[source.blendMode] : "norm");
	writer.u8(source ? Math.round(Math.min(1, Math.max(0, source.opacity)) * 255) : 255);
	writer.u8(source && record.kind === "layer" && source.clipping ? 1 : 0);

	let flags = 0x08;
	if (source?.locks.transparency || source?.locks.all) flags |= 0x01;
	if (source && !source.visible) flags |= 0x02;
	if (isDivider) flags |= 0x10;
	writer.u8(flags);
	writer.u8(0);

	writer.section(1, () => {
		// Layer mask data.
		writer.section(1, () => {
			const mask = source?.mask;
			if (!mask) return;
			writer.i32(mask.top);
			writer.i32(mask.left);
			writer.i32(mask.bottom);
			writer.i32(mask.right);
			writer.u8(mask.defaultColor);
			writer.u8(mask.disabled ? 0x02 : 0);
			writer.zeros(2);
		});
		// Blending ranges: none recorded; an empty section is valid.
		writer.section(1, () => {});

		const name = record.kind === "bounding" ? "</Layer group>" : (source?.name ?? "");
		writer.pascalString(name, 4);

		// --- additional info blocks ---
		if (record.kind === "bounding") {
			writeSection8BIM(writer, "lsct", () => writer.u32(3));
			return;
		}
		const target = source!;
		writeSection8BIM(writer, "luni", () => writer.unicodeString(target.name));
		writeSection8BIM(writer, "lyid", () => writer.u32(numericLayerId(target.id)));
		if (
			target.locks.transparency ||
			target.locks.composite ||
			target.locks.position ||
			target.locks.all
		) {
			writeSection8BIM(writer, "lspf", () => {
				let lockFlags = 0;
				if (target.locks.transparency) lockFlags |= 0x01;
				if (target.locks.composite) lockFlags |= 0x02;
				if (target.locks.position) lockFlags |= 0x04;
				if (target.locks.all) lockFlags = 0x80000007;
				writer.u32(lockFlags >>> 0);
			});
		}
		if (record.kind === "folder") {
			writeSection8BIM(writer, "lsct", () => {
				writer.u32(group!.open ? 1 : 2);
				writer.signature("8BIM");
				writer.signature(PSD_BLEND_MODE_KEYS[group!.blendMode]);
				writer.u32(0);
			});
		}
		if (layer && layer.kind === "text") {
			writeAdditionalBlock(writer, { signature: "8BIM", key: "TySh", data: layer.text.raw });
			if (layer.text.style) {
				writeAdditionalBlock(writer, {
					signature: "8BIM",
					key: PSD_TEXT_STYLE_BLOCK_KEY,
					data: encodePsdTextStyle(layer.text.style),
				});
			}
		}
		for (const block of [
			...layerExtensionBlocks(target),
			...target.preservedBlocks.filter(
				(b) =>
					!["cXfm", "cMsk"].includes(b.key) &&
					!(target.kind !== "group" && target.curves && b.key === "curv") &&
					!(
						target.kind !== "group" &&
						target.adjustment &&
						LIVE_ADJUSTMENT_KEYS.includes(b.key)
					),
			),
		]) {
			writeAdditionalBlock(writer, block);
		}
	});
}

function writeSection8BIM(writer: PsdByteWriter, key: string, body: () => void): void {
	writer.signature("8BIM");
	writer.signature(key);
	writer.section(2, body);
}

function writeAdditionalBlock(writer: PsdByteWriter, block: PsdPreservedBlock): void {
	writer.signature(block.signature);
	writer.signature(block.key);
	writer.section(2, () => writer.bytes(block.data));
}

let fallbackIdCounter = 1;

function numericLayerId(id: string): number {
	const match = /^L(\d+)/.exec(id);
	if (match) return Number(match[1]);
	return 0x40000000 + fallbackIdCounter++;
}

function writeCompositePlanes(
	writer: PsdByteWriter,
	composite: PsdBitmap,
	grayscale: boolean,
): void {
	const { width, height, data } = composite;
	writer.u16(1); // RLE
	const planes: Array<ReturnType<typeof encodePackBitsPlane>> = [];
	for (const offset of grayscale ? [0, 3] : [0, 1, 2, 3]) {
		const plane = new Uint8Array(width * height);
		for (let p = 0, q = offset; p < plane.length; p++, q += 4) plane[p] = data[q];
		planes.push(encodePackBitsPlane(plane, width, height));
	}
	for (const plane of planes) {
		for (const length of plane.rowLengths) writer.u16(length);
	}
	for (const plane of planes) writer.bytes(plane.data);
}

/** Collects the ids referenced by a document; used by tests and callers. */
export function collectPsdLayerIds(document: PsdDocument): string[] {
	const ids: string[] = [];
	walkPsdLayers(document.layers, (layer) => ids.push(layer.id));
	return ids;
}
