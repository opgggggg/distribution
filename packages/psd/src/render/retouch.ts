import { clonePsdBitmap, createPsdBitmap, type PsdBitmap } from "../codec/document";
import { applyStroke, type PsdStrokePoint } from "./raster-ops";
import { applyGaussianBlur } from "./filters";
export interface PsdRetouchOptions {
	points: readonly PsdStrokePoint[];
	size: number;
	hardness: number;
	opacity: number;
	radius?: number;
}
/** A single coverage mask for a whole gesture: overlapping dabs do not compound opacity. */
export function strokeCoverage(
	bitmap: PsdBitmap,
	options: PsdRetouchOptions,
	selection?: Uint8Array | null,
): Uint8Array {
	const painted = applyStroke(createPsdBitmap(bitmap.width, bitmap.height), {
		tool: "brush",
		...options,
		color: { r: 255, g: 255, b: 255 },
		mask: selection,
	});
	return Uint8Array.from(
		{ length: bitmap.width * bitmap.height },
		(_, i) => painted.data[i * 4 + 3],
	);
}
export function applyBlurStroke(
	bitmap: PsdBitmap,
	options: PsdRetouchOptions,
	selection?: Uint8Array | null,
): PsdBitmap {
	const mask = strokeCoverage(bitmap, options, selection);
	return applyGaussianBlur(bitmap, options.radius ?? 3, mask);
}
/** Deterministic exemplar inpainting. Sources are immutable and exclude every selected pixel.
 * A frontier propagates source-patch offsets; candidates are scored against known neighbors.
 * Work is bounded so an accidental full-canvas selection cannot lock up the UI.
 */
export function contentAwareFill(
	bitmap: PsdBitmap,
	coverage: Uint8Array,
	source: PsdBitmap = bitmap,
	searchRadius = 64,
): PsdBitmap {
	const { width: w, height: h } = bitmap,
		n = w * h;
	if (coverage.length !== n || source.width !== w || source.height !== h)
		throw new Error("Repair mask and source dimensions must match");
	let count = 0;
	for (let i = 0; i < n; i++) if (coverage[i] > 0) count++;
	if (!count) return bitmap;
	if (count > 65536)
		throw new Error(
			"Repair up to 65,536 pixels at a time. Use a smaller selection or brush stroke.",
		);
	const holes = new Uint8Array(n),
		known = new Uint8Array(n),
		queued = new Uint8Array(n),
		mapping = new Int32Array(n).fill(-1),
		queue = new Int32Array(n),
		donors: number[] = [];
	for (let i = 0; i < n; i++) {
		if (coverage[i] > 0) {
			holes[i] = 1;
		} else if (source.data[i * 4 + 3] > 0) known[i] = 1;
	}

	// Reservoir distributed over all valid source pixels; local and propagated candidates preserve texture.
	const stride = Math.max(1, Math.floor(n / 4096));
	for (let i = 0; i < n; i++)
		if (known[i] && (i % stride === 0 || donors.length === 0)) donors.push(i);
	if (!donors.length) throw new Error("No unselected visible pixels are available for repair");
	const work = clonePsdBitmap(source),
		out = clonePsdBitmap(bitmap);
	let head = 0,
		tail = 0;
	const neighbors = (i: number) => {
		const x = i % w,
			y = Math.floor(i / w);
		return [
			x > 0 ? i - 1 : -1,
			x < w - 1 ? i + 1 : -1,
			y > 0 ? i - w : -1,
			y < h - 1 ? i + w : -1,
		].filter((j) => j >= 0);
	};
	for (let i = 0; i < n; i++)
		if (holes[i] && neighbors(i).some((j) => known[j])) {
			queue[tail++] = i;
			queued[i] = 1;
		}
	// Disconnected transparent islands have no frontier: seed them from the immutable donor set.
	const enqueueDisconnected = () => {
		for (let i = 0; i < n; i++)
			if (holes[i] && !queued[i]) {
				queue[tail++] = i;
				queued[i] = 1;
				return true;
			}
		return false;
	};
	let seed = 0x51f15e;
	const random = () => {
		seed ^= seed << 13;
		seed ^= seed >>> 17;
		seed ^= seed << 5;
		return (seed >>> 0) / 4294967296;
	};
	while (head < tail || enqueueDisconnected()) {
		const i = queue[head++],
			x = i % w,
			y = Math.floor(i / w);
		let best = -1,
			bestScore = Infinity;
		const score = (j: number) => {
			if (j < 0 || j >= n || holes[j] || source.data[j * 4 + 3] === 0) return;
			const sx = j % w,
				sy = Math.floor(j / w);
			let error = 0,
				weight = 0;
			for (let dy = -1; dy <= 1; dy++)
				for (let dx = -1; dx <= 1; dx++) {
					const tx = x + dx,
						ty = y + dy,
						xx = sx + dx,
						yy = sy + dy;
					if (
						tx < 0 ||
						ty < 0 ||
						tx >= w ||
						ty >= h ||
						xx < 0 ||
						yy < 0 ||
						xx >= w ||
						yy >= h
					)
						continue;
					const t = ty * w + tx,
						s = yy * w + xx;
					if (!known[t] || holes[s] || !source.data[s * 4 + 3]) continue;
					for (let c = 0; c < 3; c++) {
						const d = work.data[t * 4 + c] - source.data[s * 4 + c];
						error += d * d;
					}
					weight++;
				}
			const cost =
				(weight ? error / weight : 1e6) + (Math.abs(sx - x) + Math.abs(sy - y)) * 0.01;
			if (cost < bestScore) {
				bestScore = cost;
				best = j;
			}
		};
		for (const j of neighbors(i)) {
			if (mapping[j] >= 0) score(mapping[j] + i - j);
			if (!holes[j]) score(j);
		}
		for (let k = 0; k < 20; k++) {
			const xx = x + Math.round((random() * 2 - 1) * searchRadius),
				yy = y + Math.round((random() * 2 - 1) * searchRadius);
			if (xx >= 0 && yy >= 0 && xx < w && yy < h) score(yy * w + xx);
		}
		for (let k = 0; k < 12; k++) score(donors[Math.floor(random() * donors.length)]);
		if (best < 0) best = donors[0];
		mapping[i] = best;
		work.data.set(source.data.subarray(best * 4, best * 4 + 4), i * 4);
		known[i] = 1;
		for (const j of neighbors(i))
			if (holes[j] && !queued[j]) {
				queue[tail++] = j;
				queued[j] = 1;
			}
	}
	for (let i = 0; i < n; i++)
		if (coverage[i]) {
			const t = coverage[i] / 255;
			for (let c = 0; c < 4; c++)
				out.data[i * 4 + c] = bitmap.data[i * 4 + c] * (1 - t) + work.data[i * 4 + c] * t;
		}
	return out;
}
export function applyHealingStroke(
	bitmap: PsdBitmap,
	options: PsdRetouchOptions,
	selection?: Uint8Array | null,
	source?: PsdBitmap,
): PsdBitmap {
	return contentAwareFill(
		bitmap,
		strokeCoverage(bitmap, options, selection),
		source,
		Math.max(16, Math.min(256, options.size * 3)),
	);
}
