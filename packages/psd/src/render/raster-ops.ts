/**
 * Deterministic pixel operations shared by the interactive tools and the AI
 * `stroke.apply` / `fill.apply` / `adjustment.apply` actions. All operations
 * take and return immutable bitmaps; callers swap the layer's bitmap.
 */

import { clonePsdBitmap, createPsdBitmap, type PsdBitmap } from "../codec/document";

export interface PsdRgbColor {
	r: number;
	g: number;
	b: number;
}

export interface PsdStrokePoint {
	/** Bitmap-local coordinates (already offset by the layer position). */
	x: number;
	y: number;
}

export type PsdStrokeTool = "brush" | "eraser" | "dodge" | "burn" | "clone";

export interface PsdStrokeOptions {
	tool: PsdStrokeTool;
	points: readonly PsdStrokePoint[];
	/** Diameter in pixels. */
	size: number;
	/** 0..1; 1 = hard edge, lower values feather the rim. */
	hardness: number;
	/** 0..1 stroke opacity (dodge/burn: exposure strength). */
	opacity: number;
	color: PsdRgbColor;
	/** clone only: bitmap-local offset from the stroke to the sampled source. */
	sourceOffset?: { dx: number; dy: number };
	/** Optional immutable source in its own coordinate space. */
	sourceBitmap?: PsdBitmap;
	sourceOrigin?: { x: number; y: number };
	/** dodge/burn only: preferential tonal band. */
	tonalRange?: "shadows" | "midtones" | "highlights";
	/** Optional bitmap-local selection mask (255 = fully affected). */
	mask?: Uint8Array | null;
}

function stampAt(
	data: Uint8ClampedArray,
	width: number,
	height: number,
	cx: number,
	cy: number,
	options: PsdStrokeOptions,
	coverage: Float32Array,
): void {
	const radius = Math.max(0.5, options.size / 2);
	const hardRadius = radius * Math.max(0, Math.min(1, options.hardness));
	const minX = Math.max(0, Math.floor(cx - radius));
	const maxX = Math.min(width - 1, Math.ceil(cx + radius));
	const minY = Math.max(0, Math.floor(cy - radius));
	const maxY = Math.min(height - 1, Math.ceil(cy + radius));
	void data;

	for (let y = minY; y <= maxY; y++) {
		for (let x = minX; x <= maxX; x++) {
			const distance = Math.hypot(x - cx, y - cy);
			if (distance > radius) continue;
			let strength: number;
			if (distance <= hardRadius || radius === hardRadius) {
				strength = 1;
			} else {
				strength = 1 - (distance - hardRadius) / (radius - hardRadius);
			}
			const index = y * width + x;
			if (strength > coverage[index]) coverage[index] = strength;
		}
	}
}

/**
 * Applies a brush or eraser stroke. Coverage accumulates per-stroke (max per
 * pixel), so overlapping stamps within one stroke do not double-apply — one
 * stroke equals one uniform coat, matching brush behavior users expect.
 */
export function applyStroke(bitmap: PsdBitmap, options: PsdStrokeOptions): PsdBitmap {
	if (!options.points.length || !bitmap.width || !bitmap.height) return bitmap;
	const result = clonePsdBitmap(bitmap);
	const { width, height, data } = result;
	const coverage = new Float32Array(width * height);

	const spacing = Math.max(1, options.size / 8);
	let previous = options.points[0];
	stampAt(data, width, height, previous.x, previous.y, options, coverage);
	for (let i = 1; i < options.points.length; i++) {
		const point = options.points[i];
		const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
		const steps = Math.max(1, Math.ceil(distance / spacing));
		for (let step = 1; step <= steps; step++) {
			const t = step / steps;
			stampAt(
				data,
				width,
				height,
				previous.x + (point.x - previous.x) * t,
				previous.y + (point.y - previous.y) * t,
				options,
				coverage,
			);
		}
		previous = point;
	}

	const strokeOpacity = Math.max(0, Math.min(1, options.opacity));
	// Clone samples the pre-stroke pixels so overlapping stamps stay stable.
	const sourceBitmap = options.sourceBitmap ?? bitmap;
	const source = options.tool === "clone" ? sourceBitmap.data : null;
	const offsetX = Math.round(options.sourceOffset?.dx ?? 0);
	const offsetY = Math.round(options.sourceOffset?.dy ?? 0);
	const tonalStrength = (pixel: number): number => {
		const luminance =
			(0.2126 * data[pixel] + 0.7152 * data[pixel + 1] + 0.0722 * data[pixel + 2]) / 255;
		const preference =
			options.tonalRange === "shadows"
				? (1 - luminance) ** 1.5
				: options.tonalRange === "highlights"
					? luminance ** 1.5
					: 1 - Math.abs(luminance * 2 - 1);
		return 0.15 + preference * 0.85;
	};

	for (let index = 0; index < coverage.length; index++) {
		let alpha = coverage[index] * strokeOpacity;
		if (options.mask) alpha = (alpha * options.mask[index]) / 255;
		if (alpha <= 0) continue;
		const p = index * 4;
		switch (options.tool) {
			case "eraser":
				data[p + 3] = data[p + 3] * (1 - alpha);
				continue;
			case "dodge": {
				const lift = alpha * 0.6 * tonalStrength(p);
				data[p] = data[p] + (255 - data[p]) * lift;
				data[p + 1] = data[p + 1] + (255 - data[p + 1]) * lift;
				data[p + 2] = data[p + 2] + (255 - data[p + 2]) * lift;
				continue;
			}
			case "burn": {
				const drop = 1 - alpha * 0.6 * tonalStrength(p);
				data[p] = data[p] * drop;
				data[p + 1] = data[p + 1] * drop;
				data[p + 2] = data[p + 2] * drop;
				continue;
			}
			case "clone": {
				const x = index % width;
				const y = (index / width) | 0;
				const sx = x + offsetX + (options.sourceOrigin?.x ?? 0);
				const sy = y + offsetY + (options.sourceOrigin?.y ?? 0);
				if (
					sx < 0 ||
					sy < 0 ||
					sx >= sourceBitmap.width ||
					sy >= sourceBitmap.height ||
					!source
				)
					continue;
				const s = (sy * sourceBitmap.width + sx) * 4;
				const sampleAlpha = (source[s + 3] / 255) * alpha;
				const existing = data[p + 3] / 255;
				const outAlpha = sampleAlpha + existing * (1 - sampleAlpha);
				if (outAlpha <= 0) continue;
				data[p] =
					(source[s] * sampleAlpha + data[p] * existing * (1 - sampleAlpha)) / outAlpha;
				data[p + 1] =
					(source[s + 1] * sampleAlpha + data[p + 1] * existing * (1 - sampleAlpha)) /
					outAlpha;
				data[p + 2] =
					(source[s + 2] * sampleAlpha + data[p + 2] * existing * (1 - sampleAlpha)) /
					outAlpha;
				data[p + 3] = outAlpha * 255;
				continue;
			}
			default: {
				const existingAlpha = data[p + 3] / 255;
				const outAlpha = alpha + existingAlpha * (1 - alpha);
				if (outAlpha <= 0) continue;
				data[p] =
					(options.color.r * alpha + data[p] * existingAlpha * (1 - alpha)) / outAlpha;
				data[p + 1] =
					(options.color.g * alpha + data[p + 1] * existingAlpha * (1 - alpha)) /
					outAlpha;
				data[p + 2] =
					(options.color.b * alpha + data[p + 2] * existingAlpha * (1 - alpha)) /
					outAlpha;
				data[p + 3] = outAlpha * 255;
			}
		}
	}
	return result;
}

export interface PsdFillRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Fills a rectangle (or the whole bitmap) with a solid color. */
export function applyFill(
	bitmap: PsdBitmap,
	color: PsdRgbColor,
	opacity: number,
	rect?: PsdFillRect,
	mask?: Uint8Array | null,
): PsdBitmap {
	const result = clonePsdBitmap(bitmap);
	const { width, height, data } = result;
	const minX = Math.max(0, Math.floor(rect?.x ?? 0));
	const minY = Math.max(0, Math.floor(rect?.y ?? 0));
	const maxX = Math.min(width, Math.ceil((rect?.x ?? 0) + (rect?.width ?? width)));
	const maxY = Math.min(height, Math.ceil((rect?.y ?? 0) + (rect?.height ?? height)));
	const baseAlpha = Math.max(0, Math.min(1, opacity));

	for (let y = minY; y < maxY; y++) {
		for (let x = minX; x < maxX; x++) {
			const index = y * width + x;
			const alpha = mask ? (baseAlpha * mask[index]) / 255 : baseAlpha;
			if (alpha <= 0) continue;
			const p = index * 4;
			const existingAlpha = data[p + 3] / 255;
			const outAlpha = alpha + existingAlpha * (1 - alpha);
			if (outAlpha <= 0) continue;
			data[p] = (color.r * alpha + data[p] * existingAlpha * (1 - alpha)) / outAlpha;
			data[p + 1] = (color.g * alpha + data[p + 1] * existingAlpha * (1 - alpha)) / outAlpha;
			data[p + 2] = (color.b * alpha + data[p + 2] * existingAlpha * (1 - alpha)) / outAlpha;
			data[p + 3] = outAlpha * 255;
		}
	}
	return result;
}

/** Paint-bucket flood fill from a seed point with a 0..255 tolerance. */
export function applyBucketFill(
	bitmap: PsdBitmap,
	seedX: number,
	seedY: number,
	color: PsdRgbColor,
	tolerance: number,
	mask?: Uint8Array | null,
	opacity = 1,
	contiguous = true,
): PsdBitmap {
	const { width, height } = bitmap;
	if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) return bitmap;
	if (mask && mask[seedY * width + seedX] === 0) return bitmap;
	const result = clonePsdBitmap(bitmap);
	const data = result.data;
	const seed = (seedY * width + seedX) * 4;
	const target = [data[seed], data[seed + 1], data[seed + 2], data[seed + 3]];

	const matches = (p: number): boolean =>
		Math.abs(data[p] - target[0]) <= tolerance &&
		Math.abs(data[p + 1] - target[1]) <= tolerance &&
		Math.abs(data[p + 2] - target[2]) <= tolerance &&
		Math.abs(data[p + 3] - target[3]) <= tolerance;

	const blendPixel = (index: number): void => {
		const p = index * 4;
		const alpha = Math.max(0, Math.min(1, opacity)) * (mask ? mask[index] / 255 : 1);
		if (alpha <= 0) return;
		const existingAlpha = data[p + 3] / 255;
		const outAlpha = alpha + existingAlpha * (1 - alpha);
		if (outAlpha <= 0) return;
		data[p] = (color.r * alpha + data[p] * existingAlpha * (1 - alpha)) / outAlpha;
		data[p + 1] = (color.g * alpha + data[p + 1] * existingAlpha * (1 - alpha)) / outAlpha;
		data[p + 2] = (color.b * alpha + data[p + 2] * existingAlpha * (1 - alpha)) / outAlpha;
		data[p + 3] = outAlpha * 255;
	};

	if (!contiguous) {
		for (let index = 0; index < width * height; index++) {
			if ((!mask || mask[index] > 0) && matches(index * 4)) blendPixel(index);
		}
		return result;
	}

	const visited = new Uint8Array(width * height);
	const queue: number[] = [seedY * width + seedX];
	visited[queue[0]] = 1;

	while (queue.length) {
		const index = queue.pop()!;
		blendPixel(index);

		const x = index % width;
		const y = (index / width) | 0;
		const neighbors = [
			x > 0 ? index - 1 : -1,
			x < width - 1 ? index + 1 : -1,
			y > 0 ? index - width : -1,
			y < height - 1 ? index + width : -1,
		];
		for (const neighbor of neighbors) {
			if (neighbor < 0 || visited[neighbor]) continue;
			visited[neighbor] = 1;
			if (mask && mask[neighbor] === 0) continue;
			if (matches(neighbor * 4)) queue.push(neighbor);
		}
	}
	return result;
}

/**
 * Flood-select: the region a bucket fill would touch, as a coverage mask.
 * Backs the magic wand tool and `selection.magicWand`.
 */
export function floodSelectMask(
	bitmap: PsdBitmap,
	seedX: number,
	seedY: number,
	tolerance: number,
	contiguous = true,
): Uint8Array {
	const { width, height, data } = bitmap;
	const mask = new Uint8Array(width * height);
	if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) return mask;
	const seed = (seedY * width + seedX) * 4;
	const target = [data[seed], data[seed + 1], data[seed + 2], data[seed + 3]];
	const matches = (p: number): boolean =>
		Math.abs(data[p] - target[0]) <= tolerance &&
		Math.abs(data[p + 1] - target[1]) <= tolerance &&
		Math.abs(data[p + 2] - target[2]) <= tolerance &&
		Math.abs(data[p + 3] - target[3]) <= tolerance;

	if (!contiguous) {
		for (let index = 0; index < width * height; index++) {
			if (matches(index * 4)) mask[index] = 255;
		}
		return mask;
	}

	const visited = new Uint8Array(width * height);
	const queue: number[] = [seedY * width + seedX];
	visited[queue[0]] = 1;
	while (queue.length) {
		const index = queue.pop()!;
		mask[index] = 255;
		const x = index % width;
		const y = (index / width) | 0;
		const neighbors = [
			x > 0 ? index - 1 : -1,
			x < width - 1 ? index + 1 : -1,
			y > 0 ? index - width : -1,
			y < height - 1 ? index + width : -1,
		];
		for (const neighbor of neighbors) {
			if (neighbor < 0 || visited[neighbor]) continue;
			visited[neighbor] = 1;
			if (matches(neighbor * 4)) queue.push(neighbor);
		}
	}
	return mask;
}

export type PsdAdjustmentKind = "brightness-contrast" | "hue-saturation" | "invert" | "grayscale";

export interface PsdAdjustmentParams {
	/** -100..100, brightness-contrast only. */
	brightness?: number;
	/** -100..100, brightness-contrast only. */
	contrast?: number;
	/** -180..180 degrees, hue-saturation only. */
	hue?: number;
	/** -100..100, hue-saturation only. */
	saturation?: number;
	/** -100..100, hue-saturation only. */
	lightness?: number;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const lightness = (max + min) / 2;
	if (max === min) return [0, 0, lightness];
	const delta = max - min;
	const sat = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
	let hue: number;
	if (max === rn) hue = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6;
	else if (max === gn) hue = ((bn - rn) / delta + 2) / 6;
	else hue = ((rn - gn) / delta + 4) / 6;
	return [hue, sat, lightness];
}

function hueToRgb(p: number, q: number, t: number): number {
	let tn = t;
	if (tn < 0) tn += 1;
	if (tn > 1) tn -= 1;
	if (tn < 1 / 6) return p + (q - p) * 6 * tn;
	if (tn < 1 / 2) return q;
	if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
	return p;
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	if (s === 0) {
		const v = l * 255;
		return [v, v, v];
	}
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	return [
		hueToRgb(p, q, h + 1 / 3) * 255,
		hueToRgb(p, q, h) * 255,
		hueToRgb(p, q, h - 1 / 3) * 255,
	];
}

/** Applies a destructive color adjustment (optionally through a mask). */
export function applyAdjustment(
	bitmap: PsdBitmap,
	kind: PsdAdjustmentKind,
	params: PsdAdjustmentParams = {},
	mask?: Uint8Array | null,
): PsdBitmap {
	const processed = applyAdjustmentAll(bitmap, kind, params);
	if (!mask) return processed;
	const result = clonePsdBitmap(bitmap);
	for (let index = 0; index < mask.length; index++) {
		const coverage = mask[index] / 255;
		if (coverage <= 0) continue;
		const p = index * 4;
		for (let c = 0; c < 4; c++) {
			result.data[p + c] =
				result.data[p + c] * (1 - coverage) + processed.data[p + c] * coverage;
		}
	}
	return result;
}

function applyAdjustmentAll(
	bitmap: PsdBitmap,
	kind: PsdAdjustmentKind,
	params: PsdAdjustmentParams = {},
): PsdBitmap {
	const result = clonePsdBitmap(bitmap);
	const data = result.data;

	if (kind === "brightness-contrast") {
		const brightness = ((params.brightness ?? 0) / 100) * 127;
		const contrastAmount = (params.contrast ?? 0) / 100;
		const factor = contrastAmount >= 0 ? 1 + contrastAmount * 3 : 1 + contrastAmount;
		for (let p = 0; p < data.length; p += 4) {
			for (let c = 0; c < 3; c++) {
				data[p + c] = (data[p + c] - 127.5) * factor + 127.5 + brightness;
			}
		}
		return result;
	}

	if (kind === "invert") {
		for (let p = 0; p < data.length; p += 4) {
			data[p] = 255 - data[p];
			data[p + 1] = 255 - data[p + 1];
			data[p + 2] = 255 - data[p + 2];
		}
		return result;
	}

	if (kind === "grayscale") {
		for (let p = 0; p < data.length; p += 4) {
			const value = 0.3 * data[p] + 0.59 * data[p + 1] + 0.11 * data[p + 2];
			data[p] = value;
			data[p + 1] = value;
			data[p + 2] = value;
		}
		return result;
	}

	// hue-saturation
	const hueShift = (params.hue ?? 0) / 360;
	const saturationScale = 1 + (params.saturation ?? 0) / 100;
	const lightnessShift = (params.lightness ?? 0) / 200;
	for (let p = 0; p < data.length; p += 4) {
		const [h, s, l] = rgbToHsl(data[p], data[p + 1], data[p + 2]);
		const [r, g, b] = hslToRgb(
			(h + hueShift + 1) % 1,
			Math.max(0, Math.min(1, s * saturationScale)),
			Math.max(0, Math.min(1, l + lightnessShift)),
		);
		data[p] = r;
		data[p + 1] = g;
		data[p + 2] = b;
	}
	return result;
}

/** Samples the color at a point; returns null outside the bitmap. */
export function samplePixel(
	bitmap: PsdBitmap,
	x: number,
	y: number,
): (PsdRgbColor & { a: number }) | null {
	if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height) return null;
	const p = (y * bitmap.width + x) * 4;
	return {
		r: bitmap.data[p],
		g: bitmap.data[p + 1],
		b: bitmap.data[p + 2],
		a: bitmap.data[p + 3],
	};
}

/** Bilinear rescale. */
export function scaleBitmap(bitmap: PsdBitmap, width: number, height: number): PsdBitmap {
	const targetWidth = Math.max(1, Math.round(width));
	const targetHeight = Math.max(1, Math.round(height));
	if (targetWidth === bitmap.width && targetHeight === bitmap.height) {
		return clonePsdBitmap(bitmap);
	}
	const result = createPsdBitmap(targetWidth, targetHeight);
	const src = bitmap.data;
	const dst = result.data;
	if (!bitmap.width || !bitmap.height) return result;
	const x0s = new Int32Array(targetWidth);
	const x1s = new Int32Array(targetWidth);
	const fxs = new Float64Array(targetWidth);
	for (let x = 0; x < targetWidth; x++) {
		const sx = ((x + 0.5) * bitmap.width) / targetWidth - 0.5;
		const x0 = Math.max(0, Math.floor(sx));
		x0s[x] = x0;
		x1s[x] = Math.min(bitmap.width - 1, x0 + 1);
		fxs[x] = sx - x0;
	}

	for (let y = 0; y < targetHeight; y++) {
		const sy = ((y + 0.5) * bitmap.height) / targetHeight - 0.5;
		const y0 = Math.max(0, Math.floor(sy));
		const y1 = Math.min(bitmap.height - 1, y0 + 1);
		const fy = sy - y0;
		const row0 = y0 * bitmap.width * 4;
		const row1 = y1 * bitmap.width * 4;
		const inverseY = 1 - fy;
		for (let x = 0; x < targetWidth; x++) {
			const x0 = x0s[x] * 4;
			const x1 = x1s[x] * 4;
			const fx = fxs[x];
			const inverseX = 1 - fx;
			const w00 = inverseX * inverseY;
			const w10 = fx * inverseY;
			const w01 = inverseX * fy;
			const w11 = fx * fy;
			const p00 = row0 + x0;
			const p10 = row0 + x1;
			const p01 = row1 + x0;
			const p11 = row1 + x1;
			const d = (y * targetWidth + x) * 4;
			dst[d] = src[p00] * w00 + src[p10] * w10 + src[p01] * w01 + src[p11] * w11;
			dst[d + 1] =
				src[p00 + 1] * w00 + src[p10 + 1] * w10 + src[p01 + 1] * w01 + src[p11 + 1] * w11;
			dst[d + 2] =
				src[p00 + 2] * w00 + src[p10 + 2] * w10 + src[p01 + 2] * w01 + src[p11 + 2] * w11;
			dst[d + 3] =
				src[p00 + 3] * w00 + src[p10 + 3] * w10 + src[p01 + 3] * w01 + src[p11 + 3] * w11;
		}
	}
	return result;
}

/** Copies a sub-rectangle (canvas-space crop helper for layers). */
export function cropBitmap(
	bitmap: PsdBitmap,
	x: number,
	y: number,
	width: number,
	height: number,
): PsdBitmap {
	const result = createPsdBitmap(Math.max(0, width), Math.max(0, height));
	const src = bitmap.data;
	const dst = result.data;
	for (let row = 0; row < result.height; row++) {
		const sourceY = y + row;
		if (sourceY < 0 || sourceY >= bitmap.height) continue;
		for (let col = 0; col < result.width; col++) {
			const sourceX = x + col;
			if (sourceX < 0 || sourceX >= bitmap.width) continue;
			const s = (sourceY * bitmap.width + sourceX) * 4;
			const d = (row * result.width + col) * 4;
			dst[d] = src[s];
			dst[d + 1] = src[s + 1];
			dst[d + 2] = src[s + 2];
			dst[d + 3] = src[s + 3];
		}
	}
	return result;
}
