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
	let read = 0;
	let written = 0;
	while (read < source.length) {
		const header = source[read++];
		if (header === 128) continue;
		const count = header > 128 ? 257 - header : header + 1;
		const inputCount = header > 128 ? 1 : count;
		if (read + inputCount > source.length || written + count > expected) {
			throw new Error("Invalid PackBits row: truncated or exceeds the expected width");
		}
		if (header > 128) {
			dest.fill(source[read++], destOffset + written, destOffset + written + count);
		} else {
			dest.set(source.subarray(read, read + count), destOffset + written);
			read += count;
		}
		written += count;
	}
	if (written !== expected) throw new Error("Invalid PackBits row: incomplete pixel data");
}

/** Encodes one row with PackBits. Returns a fresh array sized to the output. */
export function encodePackBitsRow(row: Uint8Array): Uint8Array {
	// Worst case grows by one header byte per 127 literals plus one.
	const out = new Uint8Array(row.length + Math.ceil(row.length / 127) + 1);
	let written = 0;
	let index = 0;

	while (index < row.length) {
		// Measure the run starting here.
		let runLength = 1;
		while (
			runLength < 128 &&
			index + runLength < row.length &&
			row[index + runLength] === row[index]
		) {
			runLength++;
		}

		if (runLength >= 2) {
			out[written++] = 257 - runLength;
			out[written++] = row[index];
			index += runLength;
			continue;
		}

		// Collect literals until the next run of 3+ (2-byte runs are cheaper to
		// keep literal than to break the literal block).
		let literalEnd = index + 1;
		while (literalEnd < row.length && literalEnd - index < 128) {
			let nextRun = 1;
			while (
				nextRun < 3 &&
				literalEnd + nextRun < row.length &&
				row[literalEnd + nextRun] === row[literalEnd]
			) {
				nextRun++;
			}
			if (nextRun >= 3) break;
			literalEnd++;
		}

		const count = literalEnd - index;
		out[written++] = count - 1;
		out.set(row.subarray(index, literalEnd), written);
		written += count;
		index = literalEnd;
	}

	return out.slice(0, written);
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
