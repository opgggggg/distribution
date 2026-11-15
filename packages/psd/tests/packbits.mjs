import test from "node:test";
import assert from "node:assert/strict";
import { loadPsd } from "./helpers.mjs";

const psd = await loadPsd();

function roundTrip(row) {
	const encoded = psd.encodePackBitsRow(Uint8Array.from(row));
	const decoded = new Uint8Array(row.length);
	psd.decodePackBitsRow(encoded, decoded, 0, row.length);
	return { encoded, decoded: [...decoded] };
}

test("encodes runs and literals reversibly", () => {
	const cases = [
		[0, 0, 0, 0, 0, 0],
		[1, 2, 3, 4, 5],
		[7],
		[1, 1, 2, 2, 3, 3, 3, 3, 4],
		Array.from({ length: 300 }, (_, i) => i % 7),
		Array.from({ length: 300 }, () => 42),
		[5, 5, 9, 9, 9, 1, 2, 2, 2, 2, 8],
	];
	for (const row of cases) {
		const { decoded } = roundTrip(row);
		assert.deepEqual(decoded, row);
	}
});

test("long runs split at the 128 limit", () => {
	const row = new Array(400).fill(9);
	const { encoded, decoded } = roundTrip(row);
	assert.deepEqual(decoded, row);
	// 400 = 128 + 128 + 128 + 16 → four run headers of two bytes each.
	assert.equal(encoded.length, 8);
});

test("runs beat literals in the output size", () => {
	const { encoded } = roundTrip(new Array(100).fill(3));
	assert.ok(encoded.length <= 2);
});

test("plane encoding records per-row lengths", () => {
	const width = 16;
	const height = 4;
	const plane = new Uint8Array(width * height).fill(1);
	plane.set([9, 8, 7, 6, 5, 4, 3, 2], 16); // second row is literal-ish
	const { rowLengths, data } = psd.encodePackBitsPlane(plane, width, height);
	assert.equal(rowLengths.length, height);
	assert.equal(
		rowLengths.reduce((a, b) => a + b, 0),
		data.length,
	);
	// Decode each row back.
	const decoded = new Uint8Array(width * height);
	let offset = 0;
	for (let y = 0; y < height; y++) {
		psd.decodePackBitsRow(
			data.subarray(offset, offset + rowLengths[y]),
			decoded,
			y * width,
			width,
		);
		offset += rowLengths[y];
	}
	assert.deepEqual([...decoded], [...plane]);
});

test("malformed rows cannot silently manufacture pixels or overrun a row", () => {
	for (const encoded of [[0], [255], [2, 1], [254, 7], [0, 1]]) {
		assert.throws(
			() => psd.decodePackBitsRow(Uint8Array.from(encoded), new Uint8Array(2), 0, 2),
			/Invalid PackBits/,
		);
	}
	const decoded = new Uint8Array(2);
	psd.decodePackBitsRow(Uint8Array.from([128, 255, 7, 128]), decoded, 0, 2);
	assert.deepEqual([...decoded], [7, 7]);
});
