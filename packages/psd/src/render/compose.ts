/**
 * Pure-pixel layer compositor. No canvas dependency: blend modes are
 * implemented directly on RGBA arrays so node tests and the browser render
 * identically, and so read-only environments can flatten without a DOM.
 *
 * Blending follows the standard separable/non-separable formulas (the same
 * ones the W3C compositing spec and Photoshop share); results are composited
 * with source-over alpha.
 */

import { blendGraphicsNormal } from "@cubexp/graphics";
import { applyLiveAdjustment } from "./adjustment-layers";
import { applyCurves } from "./curves";
import {
	createPsdBitmap,
	type PsdBitmap,
	type PsdBlendMode,
	type PsdDocument,
	type PsdLayerMask,
	type PsdLayerNode,
} from "../codec/document";

type BlendChannelFn = (backdrop: number, source: number) => number;

const separableBlends: Partial<Record<PsdBlendMode, BlendChannelFn>> = {
	darken: (b, s) => Math.min(b, s),
	multiply: (b, s) => (b * s) / 255,
	"color-burn": (b, s) => (s === 0 ? 0 : 255 - Math.min(255, ((255 - b) * 255) / s)),
	"linear-burn": (b, s) => Math.max(0, b + s - 255),
	lighten: (b, s) => Math.max(b, s),
	screen: (b, s) => 255 - ((255 - b) * (255 - s)) / 255,
	"color-dodge": (b, s) => (s === 255 ? 255 : Math.min(255, (b * 255) / (255 - s))),
	"linear-dodge": (b, s) => Math.min(255, b + s),
	overlay: (b, s) => (b <= 127.5 ? (2 * b * s) / 255 : 255 - (2 * (255 - b) * (255 - s)) / 255),
	"hard-light": (b, s) =>
		s <= 127.5 ? (2 * b * s) / 255 : 255 - (2 * (255 - b) * (255 - s)) / 255,
	"soft-light": (b, s) => {
		const bn = b / 255;
		const sn = s / 255;
		let result: number;
		if (sn <= 0.5) {
			result = bn - (1 - 2 * sn) * bn * (1 - bn);
		} else {
			const d = bn <= 0.25 ? ((16 * bn - 12) * bn + 4) * bn : Math.sqrt(bn);
			result = bn + (2 * sn - 1) * (d - bn);
		}
		return result * 255;
	},
	difference: (b, s) => Math.abs(b - s),
	exclusion: (b, s) => b + s - (2 * b * s) / 255,
};

function luminosity(r: number, g: number, b: number): number {
	return 0.3 * r + 0.59 * g + 0.11 * b;
}

function clipColor(rgb: [number, number, number]): [number, number, number] {
	const lum = luminosity(rgb[0], rgb[1], rgb[2]);
	const min = Math.min(rgb[0], rgb[1], rgb[2]);
	const max = Math.max(rgb[0], rgb[1], rgb[2]);
	let [r, g, b] = rgb;
	if (min < 0) {
		r = lum + ((r - lum) * lum) / (lum - min);
		g = lum + ((g - lum) * lum) / (lum - min);
		b = lum + ((b - lum) * lum) / (lum - min);
	}
	if (max > 255) {
		r = lum + ((r - lum) * (255 - lum)) / (max - lum);
		g = lum + ((g - lum) * (255 - lum)) / (max - lum);
		b = lum + ((b - lum) * (255 - lum)) / (max - lum);
	}
	return [r, g, b];
}

function setLuminosity(rgb: [number, number, number], lum: number): [number, number, number] {
	const delta = lum - luminosity(rgb[0], rgb[1], rgb[2]);
	return clipColor([rgb[0] + delta, rgb[1] + delta, rgb[2] + delta]);
}

function saturation(rgb: [number, number, number]): number {
	return Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]);
}

function setSaturation(rgb: [number, number, number], sat: number): [number, number, number] {
	const sorted: Array<{ value: number; index: number }> = rgb
		.map((value, index) => ({ value, index }))
		.sort((a, b) => a.value - b.value);
	const result: [number, number, number] = [0, 0, 0];
	const [min, mid, max] = sorted;
	if (max.value > min.value) {
		result[mid.index] = ((mid.value - min.value) * sat) / (max.value - min.value);
		result[max.index] = sat;
	}
	return result;
}

function blendNonSeparable(
	mode: PsdBlendMode,
	backdrop: [number, number, number],
	source: [number, number, number],
): [number, number, number] {
	switch (mode) {
		case "hue":
			return setLuminosity(
				setSaturation(source, saturation(backdrop)),
				luminosity(backdrop[0], backdrop[1], backdrop[2]),
			);
		case "saturation":
			return setLuminosity(
				setSaturation(backdrop, saturation(source)),
				luminosity(backdrop[0], backdrop[1], backdrop[2]),
			);
		case "color":
			return setLuminosity(source, luminosity(backdrop[0], backdrop[1], backdrop[2]));
		case "luminosity":
			return setLuminosity(backdrop, luminosity(source[0], source[1], source[2]));
		default:
			return source;
	}
}

const NON_SEPARABLE = new Set<PsdBlendMode>(["hue", "saturation", "color", "luminosity"]);

export interface ComposeLayerInput {
	/** Straight RGBA source pixels positioned at (left, top) on the target. */
	bitmap: PsdBitmap;
	left: number;
	top: number;
	opacity: number;
	blendMode: PsdBlendMode;
	mask?: PsdLayerMask;
}

/**
 * Blends `layer` over `target` in place. `target` covers the full canvas at
 * (0,0); out-of-canvas source pixels are clipped.
 */
export function blendOver(target: PsdBitmap, layer: ComposeLayerInput): void {
	const { bitmap, mask } = layer;
	// Quantize to the 1/255 steps the file format stores, so composing a
	// just-written document reproduces the same bytes (round-trip stability).
	const layerOpacity = Math.round(Math.min(1, Math.max(0, layer.opacity)) * 255) / 255;
	if (!bitmap.width || !bitmap.height || layerOpacity <= 0) return;
	const blend = separableBlends[layer.blendMode];
	const nonSeparable = NON_SEPARABLE.has(layer.blendMode);

	const startX = Math.max(0, -layer.left);
	const startY = Math.max(0, -layer.top);
	const endX = Math.min(bitmap.width, target.width - layer.left);
	const endY = Math.min(bitmap.height, target.height - layer.top);

	const src = bitmap.data;
	const dst = target.data;

	if (
		!mask &&
		!blend &&
		!nonSeparable &&
		Number.isInteger(layer.left) &&
		Number.isInteger(layer.top)
	) {
		const count = (endX - startX) * 4;
		if (count <= 0) return;
		for (let y = startY; y < endY; y++) {
			const s = (y * bitmap.width + startX) * 4;
			const d = ((layer.top + y) * target.width + (layer.left + startX)) * 4;
			blendGraphicsNormal(
				src.subarray(s, s + count),
				dst.subarray(d, d + count),
				layerOpacity,
			);
		}
		return;
	}

	for (let y = startY; y < endY; y++) {
		for (let x = startX; x < endX; x++) {
			const s = (y * bitmap.width + x) * 4;
			let alpha = (src[s + 3] / 255) * layerOpacity;
			if (mask) {
				const canvasX = layer.left + x;
				const canvasY = layer.top + y;
				alpha = (alpha * maskValueAt(mask, canvasX, canvasY)) / 255;
			}
			if (alpha <= 0) continue;

			const d = ((layer.top + y) * target.width + (layer.left + x)) * 4;
			const backdropAlpha = dst[d + 3] / 255;

			let sr = src[s];
			let sg = src[s + 1];
			let sb = src[s + 2];
			if (blend || nonSeparable) {
				// The blend result applies where the backdrop is opaque and the
				// plain source color where it is transparent.
				let br: number;
				let bg: number;
				let bb: number;
				if (nonSeparable) {
					[br, bg, bb] = blendNonSeparable(
						layer.blendMode,
						[dst[d], dst[d + 1], dst[d + 2]],
						[sr, sg, sb],
					);
				} else {
					br = blend!(dst[d], sr);
					bg = blend!(dst[d + 1], sg);
					bb = blend!(dst[d + 2], sb);
				}
				sr = sr * (1 - backdropAlpha) + br * backdropAlpha;
				sg = sg * (1 - backdropAlpha) + bg * backdropAlpha;
				sb = sb * (1 - backdropAlpha) + bb * backdropAlpha;
			}

			const outAlpha = alpha + backdropAlpha * (1 - alpha);
			if (outAlpha <= 0) {
				dst[d] = 0;
				dst[d + 1] = 0;
				dst[d + 2] = 0;
				dst[d + 3] = 0;
				continue;
			}
			dst[d] = (sr * alpha + dst[d] * backdropAlpha * (1 - alpha)) / outAlpha;
			dst[d + 1] = (sg * alpha + dst[d + 1] * backdropAlpha * (1 - alpha)) / outAlpha;
			dst[d + 2] = (sb * alpha + dst[d + 2] * backdropAlpha * (1 - alpha)) / outAlpha;
			dst[d + 3] = outAlpha * 255;
		}
	}
}

function maskValueAt(mask: PsdLayerMask, canvasX: number, canvasY: number): number {
	const width = mask.right - mask.left;
	const height = mask.bottom - mask.top;
	if (mask.disabled || width <= 0 || height <= 0) return 255;
	const x = canvasX - mask.left;
	const y = canvasY - mask.top;
	if (x < 0 || y < 0 || x >= width || y >= height) return mask.defaultColor;
	return mask.data[y * width + x];
}

/**
 * Flattens a layer subtree onto `target`. Groups composite into an
 * intermediate bitmap so group opacity/masks apply to the merged result.
 */
export function composeLayers(
	target: PsdBitmap,
	layers: readonly PsdLayerNode[],
	options: { ignoreVisibility?: string; originX?: number; originY?: number } = {},
): void {
	for (let index = 0; index < layers.length; index++) {
		const layer = layers[index];
		if (!layer.visible && layer.id !== options.ignoreVisibility) continue;
		if (layer.kind !== "group" && (layer.curves || layer.adjustment)) {
			composeCurves(target, layer, options.originX, options.originY);
			continue;
		}
		if (layer.kind === "group") {
			if (!layer.children.length) continue;
			const groupTarget = createPsdBitmap(target.width, target.height);
			composeLayers(groupTarget, layer.children, options);
			blendOver(target, {
				bitmap: groupTarget,
				left: 0,
				top: 0,
				opacity: layer.opacity,
				blendMode: layer.blendMode,
				mask: layer.mask,
			});
			continue;
		}

		// Clipping masks: a run of clipping layers above a base confines its
		// pixels to the base's coverage. The unit blends with the backdrop
		// using the base's mode and opacity.
		const clipped: PsdLayerNode[] = [];
		let lookahead = index + 1;
		while (lookahead < layers.length) {
			const candidate = layers[lookahead];
			if (candidate.kind === "group" || !candidate.clipping) break;
			clipped.push(candidate);
			lookahead++;
		}

		if (!clipped.length) {
			blendOver(target, {
				bitmap: layer.bitmap,
				left: layer.left,
				top: layer.top,
				opacity: layer.opacity,
				blendMode: layer.blendMode,
				mask: layer.mask,
			});
			continue;
		}

		const unit = createPsdBitmap(target.width, target.height);
		blendOver(unit, {
			bitmap: layer.bitmap,
			left: layer.left,
			top: layer.top,
			opacity: 1,
			blendMode: "normal",
			mask: layer.mask,
		});
		const baseAlpha = new Uint8ClampedArray(unit.width * unit.height);
		for (let p = 0, q = 3; p < baseAlpha.length; p++, q += 4) baseAlpha[p] = unit.data[q];
		for (const member of clipped) {
			if (!member.visible || member.kind === "group") continue;
			if (member.curves || member.adjustment) {
				composeCurves(unit, member, options.originX, options.originY);
				continue;
			}
			blendOver(unit, {
				bitmap: member.bitmap,
				left: member.left,
				top: member.top,
				opacity: member.opacity,
				blendMode: member.blendMode,
				mask: member.mask,
			});
		}
		for (let p = 0, q = 3; p < baseAlpha.length; p++, q += 4) unit.data[q] = baseAlpha[p];
		blendOver(target, {
			bitmap: unit,
			left: 0,
			top: 0,
			opacity: layer.opacity,
			blendMode: layer.blendMode,
		});
		index = lookahead - 1;
	}
}

/** Flattens the whole document to a canvas-sized RGBA bitmap. */
export function composePsdDocument(document: PsdDocument): PsdBitmap {
	const target = createPsdBitmap(document.width, document.height);
	if (!document.editable && document.composite) {
		target.data.set(document.composite.data.subarray(0, target.data.length));
		return target;
	}
	composeLayers(target, document.layers);
	return target;
}

function composeCurves(
	target: PsdBitmap,
	layer: Exclude<PsdLayerNode, { kind: "group" }>,
	originX = 0,
	originY = 0,
): void {
	if (!layer.curves && !layer.adjustment) return;
	if (layer.blendMode === "normal" && layer.curves) {
		applyCurves(target, layer.curves, layer.opacity, layer.mask);
		return;
	}
	const adjusted = layer.adjustment
			? applyLiveAdjustment(target, layer.adjustment, originX, originY)
			: { ...target, data: target.data.slice() },
		alpha = new Uint8Array(target.width * target.height);
	if (layer.curves) applyCurves(adjusted, layer.curves, 1);
	for (let p = 0; p < alpha.length; p++) {
		alpha[p] = target.data[p * 4 + 3];
		target.data[p * 4 + 3] = 255;
		adjusted.data[p * 4 + 3] = 255;
	}
	blendOver(target, {
		bitmap: adjusted,
		left: 0,
		top: 0,
		opacity: layer.opacity,
		blendMode: layer.blendMode,
		mask: layer.mask,
	});
	for (let p = 0; p < alpha.length; p++) target.data[p * 4 + 3] = alpha[p];
}
