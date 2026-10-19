import test from "node:test";
import assert from "node:assert/strict";
import { rotateLocal, unrotateLocal, rotateVector, rotatedSize } from "../dist/view-rotation.js";

test("quarter-turn camera projections preserve coordinates and dimensions", () => {
	const expected = [
		{ x: 30, y: 70 },
		{ x: 130, y: 30 },
		{ x: 270, y: 130 },
		{ x: 70, y: 270 },
	];
	for (let turn = 0; turn < 4; turn++) {
		assert.deepEqual(rotateLocal({ x: 30, y: 70 }, 300, 200, turn), expected[turn]);
		assert.deepEqual(unrotateLocal(expected[turn], 300, 200, turn), { x: 30, y: 70 });
		assert.deepEqual(
			rotatedSize(300, 200, turn),
			turn % 2 ? { width: 200, height: 300 } : { width: 300, height: 200 },
		);
		const p = { x: -999999.25, y: 735.125 };
		assert.deepEqual(rotateVector(rotateVector(p, turn), -turn), p);
	}
	assert.deepEqual(rotateVector({ x: 50, y: 0 }, -1), { x: 0, y: -50 });
});
