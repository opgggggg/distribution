export type Matrix3 = readonly [
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
];
export type Point = { x: number; y: number };
export function mapPoint(m: Matrix3, x: number, y: number): Point {
	const w = m[6] * x + m[7] * y + m[8];
	if (Math.abs(w) < 1e-10) throw new Error("Transform crosses infinity");
	return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
}
export function inverse3(m: Matrix3): Matrix3 {
	const [a, b, c, d, e, f, g, h, i] = m,
		A = e * i - f * h,
		B = c * h - b * i,
		C = b * f - c * e,
		D = f * g - d * i,
		E = a * i - c * g,
		F = c * d - a * f,
		G = d * h - e * g,
		H = b * g - a * h,
		I = a * e - b * d,
		det = a * A + b * D + c * G;
	if (!Number.isFinite(det) || Math.abs(det) < 1e-10)
		throw new Error("Transform must have non-zero area");
	return [A / det, B / det, C / det, D / det, E / det, F / det, G / det, H / det, I / det];
}
/** Four corresponding points, clockwise from top-left. Reject folded/degenerate quads. */
export function quadTransform(from: readonly Point[], to: readonly Point[]): Matrix3 {
	if (from.length !== 4 || to.length !== 4) throw new Error("Four corners are required");
	for (const points of [from, to]) {
		let sign = 0;
		for (let i = 0; i < 4; i++) {
			const a = points[i],
				b = points[(i + 1) % 4],
				c = points[(i + 2) % 4],
				cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
			if (
				!Number.isFinite(cross) ||
				Math.abs(cross) < 1e-6 ||
				(sign && Math.sign(cross) !== sign)
			)
				throw new Error("Corners must form a convex quadrilateral");
			sign = Math.sign(cross);
		}
	}
	const rows: number[][] = [];
	for (let i = 0; i < 4; i++) {
		const { x, y } = from[i],
			{ x: u, y: v } = to[i];
		rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]);
	}
	for (let c = 0; c < 8; c++) {
		let pivot = c;
		for (let r = c + 1; r < 8; r++)
			if (Math.abs(rows[r][c]) > Math.abs(rows[pivot][c])) pivot = r;
		[rows[c], rows[pivot]] = [rows[pivot], rows[c]];
		const n = rows[c][c];
		if (Math.abs(n) < 1e-12) throw new Error("Degenerate transform");
		for (let k = c; k < 9; k++) rows[c][k] /= n;
		for (let r = 0; r < 8; r++)
			if (r !== c) {
				const n = rows[r][c];
				for (let k = c; k < 9; k++) rows[r][k] -= n * rows[c][k];
			}
	}
	return [...rows.map((r) => r[8]), 1] as unknown as Matrix3;
}
