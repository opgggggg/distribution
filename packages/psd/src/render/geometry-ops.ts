/**
 * Geometric pixel operations: flips, rotations, gradients, and shape
 * rasterization. Deterministic and DOM-free like the rest of the render
 * layer.
 */

import { clonePsdBitmap, createPsdBitmap, type PsdBitmap } from "../codec/document";
import type { PsdRgbColor } from "./raster-ops";

export type PsdFlipRotateOperation =
	| "flip-horizontal"
	| "flip-vertical"
	| "rotate-90"
	| "rotate-180"
	| "rotate-270";

export function flipRotateBitmap(bitmap: PsdBitmap, operation: PsdFlipRotateOperation): PsdBitmap {
	const { width, height, data } = bitmap;
	const swap = operation === "rotate-90" || operation === "rotate-270";
	const out = createPsdBitmap(swap ? height : width, swap ? width : height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let targetX: number;
			let targetY: number;
			switch (operation) {
				case "flip-horizontal":
					targetX = width - 1 - x;
					targetY = y;
					break;
				case "flip-vertical":
					targetX = x;
					targetY = height - 1 - y;
					break;
				case "rotate-90":
					targetX = height - 1 - y;
					targetY = x;
					break;
				case "rotate-180":
					targetX = width - 1 - x;
					targetY = height - 1 - y;
					break;
				case "rotate-270":
					targetX = y;
					targetY = width - 1 - x;
					break;
			}
			const s = (y * width + x) * 4;
			const d = (targetY * out.width + targetX) * 4;
			out.data[d] = data[s];
			out.data[d + 1] = data[s + 1];
			out.data[d + 2] = data[s + 2];
			out.data[d + 3] = data[s + 3];
		}
	}
	return out;
}

/**
 * Arbitrary rotation with bilinear sampling. The result grows to the rotated
 * bounding box; `offset` reports how the top-left corner moved so callers can
 * keep the visual center fixed.
 */
export function rotateBitmap(
	bitmap: PsdBitmap,
	degrees: number,
): { bitmap: PsdBitmap; offsetX: number; offsetY: number } {
	const radians = (degrees * Math.PI) / 180;
	const sin = Math.sin(radians);
	const cos = Math.cos(radians);
	const { width, height, data } = bitmap;
	const outWidth = Math.max(1, Math.ceil(Math.abs(width * cos) + Math.abs(height * sin)));
	const outHeight = Math.max(1, Math.ceil(Math.abs(width * sin) + Math.abs(height * cos)));
	const out = createPsdBitmap(outWidth, outHeight);
	const cx = width / 2;
	const cy = height / 2;
	const ocx = outWidth / 2;
	const ocy = outHeight / 2;

	for (let y = 0; y < outHeight; y++) {
		for (let x = 0; x < outWidth; x++) {
			// Inverse-map the target pixel back into the source.
			const dx = x + 0.5 - ocx;
			const dy = y + 0.5 - ocy;
			const sx = dx * cos + dy * sin + cx - 0.5;
			const sy = -dx * sin + dy * cos + cy - 0.5;
			if (sx < -1 || sy < -1 || sx > width || sy > height) continue;
			const x0 = Math.floor(sx);
			const y0 = Math.floor(sy);
			const fx = sx - x0;
			const fy = sy - y0;
			const d = (y * outWidth + x) * 4;
			for (let c = 0; c < 4; c++) {
				const sample = (px: number, py: number): number => {
					if (px < 0 || py < 0 || px >= width || py >= height) return 0;
					return data[(py * width + px) * 4 + c];
				};
				out.data[d + c] =
					sample(x0, y0) * (1 - fx) * (1 - fy) +
					sample(x0 + 1, y0) * fx * (1 - fy) +
					sample(x0, y0 + 1) * (1 - fx) * fy +
					sample(x0 + 1, y0 + 1) * fx * fy;
			}
		}
	}
	return {
		bitmap: out,
		offsetX: Math.round((width - outWidth) / 2),
		offsetY: Math.round((height - outHeight) / 2),
	};
}

// ---------------------------------------------------------------------------
// Gradients
// ---------------------------------------------------------------------------

export interface PsdGradientStop {
	/** 0..1 position along the gradient. */
	at: number;
	color: PsdRgbColor;
	/** 0..1, default 1. */
	alpha?: number;
}

export interface PsdGradientSpec {
	type: "linear" | "radial";
	/** Bitmap-local start point (linear start / radial center). */
	from: { x: number; y: number };
	/** Bitmap-local end point (linear end / radial edge). */
	to: { x: number; y: number };
	stops: PsdGradientStop[];
	/** 0..1 overall opacity, default 1. */
	opacity?: number;
}

function gradientColorAt(stops: PsdGradientStop[], t: number): [number, number, number, number] {
	const sorted = [...stops].sort((a, b) => a.at - b.at);
	if (t <= sorted[0].at) {
		const stop = sorted[0];
		return [stop.color.r, stop.color.g, stop.color.b, (stop.alpha ?? 1) * 255];
	}
	for (let i = 0; i < sorted.length - 1; i++) {
		const a = sorted[i];
		const b = sorted[i + 1];
		if (t <= b.at) {
			const f = b.at === a.at ? 0 : (t - a.at) / (b.at - a.at);
			return [
				a.color.r + (b.color.r - a.color.r) * f,
				a.color.g + (b.color.g - a.color.g) * f,
				a.color.b + (b.color.b - a.color.b) * f,
				((a.alpha ?? 1) + ((b.alpha ?? 1) - (a.alpha ?? 1)) * f) * 255,
			];
		}
	}
	const last = sorted[sorted.length - 1];
	return [last.color.r, last.color.g, last.color.b, (last.alpha ?? 1) * 255];
}

/** Composites a gradient over the bitmap (optionally through a mask). */
export function applyGradient(
	bitmap: PsdBitmap,
	spec: PsdGradientSpec,
	mask?: Uint8Array | null,
): PsdBitmap {
	const out = clonePsdBitmap(bitmap);
	const { width, height, data } = out;
	const dx = spec.to.x - spec.from.x;
	const dy = spec.to.y - spec.from.y;
	const lengthSquared = dx * dx + dy * dy;
	const radius = Math.sqrt(lengthSquared);
	const overall = spec.opacity ?? 1;
	if (!spec.stops.length || (!lengthSquared && spec.type === "linear")) return out;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = y * width + x;
			const coverage = mask ? mask[index] / 255 : 1;
			if (coverage <= 0) continue;
			let t: number;
			if (spec.type === "linear") {
				t = ((x - spec.from.x) * dx + (y - spec.from.y) * dy) / lengthSquared;
			} else {
				t = radius ? Math.hypot(x - spec.from.x, y - spec.from.y) / radius : 1;
			}
			t = Math.min(1, Math.max(0, t));
			const [r, g, b, a] = gradientColorAt(spec.stops, t);
			const alpha = (a / 255) * overall * coverage;
			if (alpha <= 0) continue;
			const p = index * 4;
			const existing = data[p + 3] / 255;
			const outAlpha = alpha + existing * (1 - alpha);
			if (outAlpha <= 0) continue;
			data[p] = (r * alpha + data[p] * existing * (1 - alpha)) / outAlpha;
			data[p + 1] = (g * alpha + data[p + 1] * existing * (1 - alpha)) / outAlpha;
			data[p + 2] = (b * alpha + data[p + 2] * existing * (1 - alpha)) / outAlpha;
			data[p + 3] = outAlpha * 255;
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface PsdShapeSpec {
	shape: "rectangle" | "rounded-rectangle" | "ellipse" | "line";
	/** Bitmap-local geometry: rect for rectangle/ellipse, endpoints for line. */
	x: number;
	y: number;
	width: number;
	height: number;
	fill?: PsdRgbColor | null;
	stroke?: PsdRgbColor | null;
	strokeWidth?: number;
	cornerRadius?: number;
	/** 0..1, default 1. */
	opacity?: number;
}

function blendPixel(data: Uint8ClampedArray, p: number, color: PsdRgbColor, alpha: number): void {
	if (alpha <= 0) return;
	const existing = data[p + 3] / 255;
	const outAlpha = alpha + existing * (1 - alpha);
	if (outAlpha <= 0) return;
	data[p] = (color.r * alpha + data[p] * existing * (1 - alpha)) / outAlpha;
	data[p + 1] = (color.g * alpha + data[p + 1] * existing * (1 - alpha)) / outAlpha;
	data[p + 2] = (color.b * alpha + data[p + 2] * existing * (1 - alpha)) / outAlpha;
	data[p + 3] = outAlpha * 255;
}

/** Rasterizes a shape onto the bitmap with 2×2 supersampled edges. */
export function applyShape(
	bitmap: PsdBitmap,
	spec: PsdShapeSpec,
	mask?: Uint8Array | null,
): PsdBitmap {
	const out = clonePsdBitmap(bitmap);
	const { width, height, data } = out;
	const opacity = spec.opacity ?? 1;
	const strokeWidth = spec.strokeWidth ?? 2;

	const coverageAt = (x: number, y: number): { fill: number; stroke: number } => {
		// 2x2 supersampling for smooth edges.
		let fillHits = 0;
		let strokeHits = 0;
		for (const [ox, oy] of [
			[0.25, 0.25],
			[0.75, 0.25],
			[0.25, 0.75],
			[0.75, 0.75],
		]) {
			const px = x + ox;
			const py = y + oy;
			if (spec.shape === "rectangle") {
				const inside =
					px >= spec.x &&
					px <= spec.x + spec.width &&
					py >= spec.y &&
					py <= spec.y + spec.height;
				const insideInner =
					px >= spec.x + strokeWidth &&
					px <= spec.x + spec.width - strokeWidth &&
					py >= spec.y + strokeWidth &&
					py <= spec.y + spec.height - strokeWidth;
				if (inside) fillHits++;
				if (inside && !insideInner) strokeHits++;
			} else if (spec.shape === "rounded-rectangle") {
				const inside = (inset: number) => {
					const w = spec.width - 2 * inset,
						h = spec.height - 2 * inset;
					if (w <= 0 || h <= 0) return false;
					const r = Math.max(
							0,
							Math.min(spec.cornerRadius ?? 12, spec.width / 2, spec.height / 2) -
								inset,
						),
						cx = spec.x + spec.width / 2,
						cy = spec.y + spec.height / 2,
						qx = Math.abs(px - cx) - (w / 2 - r),
						qy = Math.abs(py - cy) - (h / 2 - r);
					return (
						Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
							Math.min(Math.max(qx, qy), 0) <=
						r
					);
				};
				const outer = inside(0);
				if (outer) fillHits++;
				if (outer && !inside(strokeWidth)) strokeHits++;
			} else if (spec.shape === "ellipse") {
				const rx = spec.width / 2;
				const ry = spec.height / 2;
				const cx = spec.x + rx;
				const cy = spec.y + ry;
				if (!rx || !ry) continue;
				const norm = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2;
				const innerRx = Math.max(0.001, rx - strokeWidth);
				const innerRy = Math.max(0.001, ry - strokeWidth);
				const normInner = ((px - cx) / innerRx) ** 2 + ((py - cy) / innerRy) ** 2;
				if (norm <= 1) fillHits++;
				if (norm <= 1 && normInner > 1) strokeHits++;
			} else {
				// line: distance from segment (x,y)-(x+width,y+height)
				const x1 = spec.x;
				const y1 = spec.y;
				const x2 = spec.x + spec.width;
				const y2 = spec.y + spec.height;
				const lengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1;
				const t = Math.min(
					1,
					Math.max(0, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lengthSquared),
				);
				const distance = Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
				if (distance <= strokeWidth / 2) strokeHits++;
			}
		}
		return { fill: fillHits / 4, stroke: strokeHits / 4 };
	};

	const minX = Math.max(0, Math.floor(Math.min(spec.x, spec.x + spec.width) - strokeWidth));
	const maxX = Math.min(width, Math.ceil(Math.max(spec.x, spec.x + spec.width) + strokeWidth));
	const minY = Math.max(0, Math.floor(Math.min(spec.y, spec.y + spec.height) - strokeWidth));
	const maxY = Math.min(height, Math.ceil(Math.max(spec.y, spec.y + spec.height) + strokeWidth));

	for (let y = minY; y < maxY; y++) {
		for (let x = minX; x < maxX; x++) {
			const index = y * width + x;
			const selection = mask ? mask[index] / 255 : 1;
			if (selection <= 0) continue;
			const { fill, stroke } = coverageAt(x, y);
			const p = index * 4;
			if (spec.fill && fill > 0) {
				blendPixel(data, p, spec.fill, fill * opacity * selection);
			}
			if (spec.stroke && stroke > 0) {
				blendPixel(data, p, spec.stroke, stroke * opacity * selection);
			}
		}
	}
	return out;
}
