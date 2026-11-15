/**
 * Layer styles, applied destructively: the effect renders into an expanded
 * bitmap and replaces the layer's pixels. Simpler than live effects, and the
 * result is exactly what every other PSD consumer will see.
 */

import { createPsdBitmap, type PsdBitmap } from "../codec/document";
import { applyGaussianBlur } from "./filters";
import type { PsdRgbColor } from "./raster-ops";

export type PsdEffectKind = "drop-shadow" | "stroke" | "outer-glow";

export interface PsdEffectParams {
	color?: PsdRgbColor;
	/** 0..1, default 0.75. */
	opacity?: number;
	/** drop-shadow: offset in pixels. */
	offsetX?: number;
	offsetY?: number;
	/** drop-shadow / outer-glow: blur radius. stroke: outline width. */
	size?: number;
}

export interface PsdEffectResult {
	bitmap: PsdBitmap;
	/** How far the bitmap's top-left moved (≤ 0) to make room for the effect. */
	offsetX: number;
	offsetY: number;
}

function padBitmap(bitmap: PsdBitmap, pad: number): PsdBitmap {
	const out = createPsdBitmap(bitmap.width + pad * 2, bitmap.height + pad * 2);
	for (let y = 0; y < bitmap.height; y++) {
		const source = y * bitmap.width * 4;
		const target = ((y + pad) * out.width + pad) * 4;
		out.data.set(bitmap.data.subarray(source, source + bitmap.width * 4), target);
	}
	return out;
}

/** A colored silhouette of the bitmap's alpha, shifted by (dx, dy). */
function silhouette(
	bitmap: PsdBitmap,
	color: PsdRgbColor,
	opacity: number,
	dx: number,
	dy: number,
): PsdBitmap {
	const out = createPsdBitmap(bitmap.width, bitmap.height);
	for (let y = 0; y < bitmap.height; y++) {
		for (let x = 0; x < bitmap.width; x++) {
			const sx = x - dx;
			const sy = y - dy;
			if (sx < 0 || sy < 0 || sx >= bitmap.width || sy >= bitmap.height) continue;
			const alpha = bitmap.data[(sy * bitmap.width + sx) * 4 + 3];
			if (!alpha) continue;
			const p = (y * out.width + x) * 4;
			out.data[p] = color.r;
			out.data[p + 1] = color.g;
			out.data[p + 2] = color.b;
			out.data[p + 3] = alpha * opacity;
		}
	}
	return out;
}

/** Composites `top` (same size) over `bottom` in place, straight alpha. */
function over(bottom: PsdBitmap, top: PsdBitmap): void {
	for (let p = 0; p < bottom.data.length; p += 4) {
		const alpha = top.data[p + 3] / 255;
		if (alpha <= 0) continue;
		const existing = bottom.data[p + 3] / 255;
		const outAlpha = alpha + existing * (1 - alpha);
		if (outAlpha <= 0) continue;
		for (let c = 0; c < 3; c++) {
			bottom.data[p + c] =
				(top.data[p + c] * alpha + bottom.data[p + c] * existing * (1 - alpha)) / outAlpha;
		}
		bottom.data[p + 3] = outAlpha * 255;
	}
}

/** Maximum alpha within `radius` — a cheap dilation for strokes. */
function dilateAlpha(bitmap: PsdBitmap, radius: number): Uint8ClampedArray {
	const { width, height, data } = bitmap;
	const out = new Uint8ClampedArray(width * height);
	const r = Math.max(1, Math.round(radius));
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let best = 0;
			for (let oy = -r; oy <= r && best < 255; oy++) {
				for (let ox = -r; ox <= r && best < 255; ox++) {
					if (ox * ox + oy * oy > r * r) continue;
					const sx = x + ox;
					const sy = y + oy;
					if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
					const alpha = data[(sy * width + sx) * 4 + 3];
					if (alpha > best) best = alpha;
				}
			}
			out[y * width + x] = best;
		}
	}
	return out;
}

export function applyLayerEffect(
	bitmap: PsdBitmap,
	kind: PsdEffectKind,
	params: PsdEffectParams = {},
): PsdEffectResult {
	const size = Math.max(1, Math.round(params.size ?? (kind === "stroke" ? 3 : 8)));
	const offsetX = Math.round(params.offsetX ?? (kind === "drop-shadow" ? 4 : 0));
	const offsetY = Math.round(params.offsetY ?? (kind === "drop-shadow" ? 4 : 0));
	const opacity = params.opacity ?? 0.75;
	const color: PsdRgbColor =
		params.color ?? (kind === "outer-glow" ? { r: 255, g: 255, b: 190 } : { r: 0, g: 0, b: 0 });

	const pad = size + Math.max(Math.abs(offsetX), Math.abs(offsetY)) + 2;
	const padded = padBitmap(bitmap, pad);

	let backdrop: PsdBitmap;
	if (kind === "stroke") {
		const dilated = dilateAlpha(padded, size);
		backdrop = createPsdBitmap(padded.width, padded.height);
		for (let index = 0; index < dilated.length; index++) {
			if (!dilated[index]) continue;
			const p = index * 4;
			backdrop.data[p] = color.r;
			backdrop.data[p + 1] = color.g;
			backdrop.data[p + 2] = color.b;
			backdrop.data[p + 3] = dilated[index] * opacity;
		}
	} else {
		const shadow = silhouette(padded, color, opacity, offsetX, offsetY);
		backdrop = applyGaussianBlur(shadow, kind === "outer-glow" ? size / 2 : size / 2);
	}

	over(backdrop, padded);
	return { bitmap: backdrop, offsetX: -pad, offsetY: -pad };
}
