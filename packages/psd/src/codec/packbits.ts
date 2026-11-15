import { decodeGraphicsPackBits, encodeGraphicsPackBits } from "@cubexp/graphics";

/**
 * PackBits (RLE) row codec, the compression PSD uses for 8-bit channel data.
 * Each scanline is encoded independently; the layer/composite writers prefix
 * the encoded rows with a table of per-row byte counts.
 */

/** Decodes one PackBits-encoded row into `dest` (must hold `expected` bytes). */
export function decodePackBitsRow(
	source: Uint8Array,
	dest: Uint8Array,
	destOffset: number,
	expected: number,
): void {
	if (
		!Number.isInteger(destOffset) ||
		!Number.isInteger(expected) ||
		destOffset < 0 ||
		expected < 0 ||
		destOffset + expected > dest.length
	) {
		throw new RangeError("Invalid PackBits destination range");
	}
	decodeGraphicsPackBits(source, dest.subarray(destOffset, destOffset + expected));
}

/** Encodes one row with PackBits. Returns a fresh array sized to the output. */
export function encodePackBitsRow(row: Uint8Array): Uint8Array {
	return encodeGraphicsPackBits(row);
}

export interface PackBitsPlane {
	/** Per-row encoded byte lengths, in row order. */
	rowLengths: number[];
	/** All encoded rows, concatenated. */
	data: Uint8Array;
}

/**
 * Encodes a single channel plane (one byte per pixel, `width * height` bytes).
 */
export function encodePackBitsPlane(
	plane: Uint8Array,
	width: number,
	height: number,
): PackBitsPlane {
	const rows: Uint8Array[] = [];
	let total = 0;
	for (let y = 0; y < height; y++) {
		const encoded = encodePackBitsRow(plane.subarray(y * width, (y + 1) * width));
		rows.push(encoded);
		total += encoded.length;
	}
	const data = new Uint8Array(total);
	const rowLengths: number[] = [];
	let offset = 0;
	for (const row of rows) {
		data.set(row, offset);
		offset += row.length;
		rowLengths.push(row.length);
	}
	return { rowLengths, data };
}
