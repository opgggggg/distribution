import { clonePsdBitmap, type PsdBitmap } from "../codec/document";
export interface PsdGrain {
	kind: "grain";
	amount: number;
	size: number;
	roughness: number;
	seed: number;
}
/** Coordinate-seeded monochrome grain. Stable across previews and tiled evaluation. */
export function applyGrain(bitmap: PsdBitmap, a: PsdGrain, originX = 0, originY = 0): PsdBitmap {
	if (a.amount === 0) return clonePsdBitmap(bitmap);
	const out = clonePsdBitmap(bitmap);
	// Compositor AdjustPixels.c (MIT): identical coordinate hash and triangular lattice.
	const mix32 = (x: number) => {
		x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15;
		x = Math.imul(x, 0x846ca68b); return (x ^ (x >>> 16)) >>> 0;
	};
	const hash = (x: number, y: number, seed: number) => {
		const h = mix32(Math.imul(x, 0x9e3779b1) ^ mix32(Math.imul(y, 0x85ebca77) ^ seed));
		return (h & 65535) / 65535 + (h >>> 16) / 65535 - 1;
	};
	const smooth = (v: number) => v * v * (3 - 2 * v),
		mix = (a: number, b: number, t: number) => a + (b - a) * t;
	for (let y = 0; y < bitmap.height; y++)
		for (let x = 0; x < bitmap.width; x++) {
			const p = (y * bitmap.width + x) * 4;
			if (!out.data[p + 3]) continue;
			const u = x + originX + 0.5,
				v = y + originY + 0.5,
				gx = Math.floor(u / a.size),
				gy = Math.floor(v / a.size),
				tx = smooth(u / a.size - gx),
				ty = smooth(v / a.size - gy);
			const coarse = mix(
				mix(hash(gx, gy, a.seed), hash(gx + 1, gy, a.seed), tx),
				mix(hash(gx, gy + 1, a.seed), hash(gx + 1, gy + 1, a.seed), tx),
				ty,
			);
			const noise = mix(
					coarse * 1.6,
					hash(Math.floor(u), Math.floor(v), mix32(a.seed ^ 0xa511e9b3)),
					a.roughness / 100,
				),
				l =
					(0.2126 * out.data[p] + 0.7152 * out.data[p + 1] + 0.0722 * out.data[p + 2]) /
					255;
			const delta = noise * (a.amount / 100) * 89.25 * (0.4 + 2.4 * l * (1 - l));
			for (let c = 0; c < 3; c++) out.data[p + c] += delta;
		}
	return out;
}
