/**
 * Destructive filters and extended color adjustments. Everything here is
 * deterministic pure-pixel math on RGBA arrays, shared by the interactive UI
 * and the AI `filter.apply` / `adjustment.apply` actions. Operations accept an
 * optional selection mask (one byte per bitmap pixel, 255 = fully affected).
 */

import { clonePsdBitmap, type PsdBitmap } from "../codec/document";

export interface PsdLevelsParams {
	/** 0..254 input black point. */
	inBlack?: number;
	/** 1..255 input white point. */
	inWhite?: number;
	/** 0.1..10 midtone gamma. */
	gamma?: number;
	/** 0..255 output black point. */
	outBlack?: number;
	/** 0..255 output white point. */
	outWhite?: number;
}

export interface PsdColorBalanceParams {
	/** -100..100 cyan ↔ red. */
	cyanRed?: number;
	/** -100..100 magenta ↔ green. */
	magentaGreen?: number;
	/** -100..100 yellow ↔ blue. */
	yellowBlue?: number;
}

export interface PsdExposureParams {
	/** -5..5 stops. */
	exposure?: number;
	/** -0.5..0.5 linear offset. */
	offset?: number;
}

export interface PsdVibranceParams {
	/** -100..100; boosts muted colors more than saturated ones. */
	vibrance?: number;
}

export interface PsdBlackWhiteParams {
	/** Per-hue luminance weights, -100..100 above the defaults. */
	reds?: number;
	greens?: number;
	blues?: number;
}

import { motionBlur, lensCorrection } from "./spatial-filters";
export type PsdFilterKind =
	| "motion-blur"
	| "lens-correction"
	| "gaussian-blur"
	| "sharpen"
	| "noise"
	| "pixelate"
	| "threshold"
	| "posterize";

export interface PsdFilterParams {
	distance?: number;
	angle?: number;
	distortion?: number;
	/** gaussian-blur / sharpen: radius in pixels (0.5..100). */
	radius?: number;
	/** sharpen: 1..500 percent. */
	amount?: number;
	/** noise: 1..100 strength. */
	strength?: number;
	/** noise: deterministic seed so replays match. */
	seed?: number;
	/** pixelate: cell size 2..200. */
	cellSize?: number;
	/** threshold: 1..254 cutoff. */
	level?: number;
	/** posterize: 2..32 levels per channel. */
	levels?: number;
}

type Mask = Uint8Array | null | undefined;

/** Blends filtered pixels back through the selection mask. */
function commitMasked(original: PsdBitmap, processed: PsdBitmap, mask: Mask): PsdBitmap {
	if (!mask) return processed;
	const out = clonePsdBitmap(original);
	const source = processed.data;
	const target = out.data;
	for (let index = 0; index < mask.length; index++) {
		const coverage = mask[index] / 255;
		if (coverage <= 0) continue;
		const p = index * 4;
		for (let c = 0; c < 4; c++) {
			target[p + c] = target[p + c] * (1 - coverage) + source[p + c] * coverage;
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// Blur / sharpen
// ---------------------------------------------------------------------------

/**
 * Three-pass box blur approximating a Gaussian; alpha-weighted so transparent
 * neighborhoods do not darken edges.
 */
function boxBlurPass(bitmap: PsdBitmap, radius: number): PsdBitmap {
	const { width, height, data } = bitmap;
	const out = clonePsdBitmap(bitmap);
	const target = out.data;
	const r = Math.max(1, Math.round(radius));

	// Horizontal, then vertical, premultiplying by alpha for correct edges.
	const premul = new Float32Array(width * height * 4);
	for (let p = 0, q = 0; p < data.length; p += 4, q += 4) {
		const a = data[p + 3] / 255;
		premul[q] = data[p] * a;
		premul[q + 1] = data[p + 1] * a;
		premul[q + 2] = data[p + 2] * a;
		premul[q + 3] = data[p + 3];
	}
	const horizontal = new Float32Array(premul.length);
	const window = 2 * r + 1;
	for (let y = 0; y < height; y++) {
		let sums = [0, 0, 0, 0];
		for (let x = -r; x <= r; x++) {
			if (x < 0 || x >= width) continue;
			const cx = x;
			const p = (y * width + cx) * 4;
			for (let c = 0; c < 4; c++) sums[c] += premul[p + c];
		}
		for (let x = 0; x < width; x++) {
			const p = (y * width + x) * 4;
			for (let c = 0; c < 4; c++) horizontal[p + c] = sums[c] / window;
			const removeX = x - r;
			const addX = x + r + 1;
			const removeP = (y * width + removeX) * 4;
			const addP = (y * width + addX) * 4;
			for (let c = 0; c < 4; c++) sums[c] += (addX < width ? premul[addP + c] : 0) - (removeX >= 0 ? premul[removeP + c] : 0);
		}
	}
	for (let x = 0; x < width; x++) {
		let sums = [0, 0, 0, 0];
		for (let y = -r; y <= r; y++) {
			if (y < 0 || y >= height) continue;
			const cy = y;
			const p = (cy * width + x) * 4;
			for (let c = 0; c < 4; c++) sums[c] += horizontal[p + c];
		}
		for (let y = 0; y < height; y++) {
			const p = (y * width + x) * 4;
			const alpha = sums[3] / window;
			if (alpha > 0.001) {
				target[p] = sums[0] / window / (alpha / 255);
				target[p + 1] = sums[1] / window / (alpha / 255);
				target[p + 2] = sums[2] / window / (alpha / 255);
			}
			target[p + 3] = alpha;
			const removeY = y - r;
			const addY = y + r + 1;
			const removeP = (removeY * width + x) * 4;
			const addP = (addY * width + x) * 4;
			for (let c = 0; c < 4; c++) sums[c] += (addY < height ? horizontal[addP + c] : 0) - (removeY >= 0 ? horizontal[removeP + c] : 0);
		}
	}
	return out;
}

export function applyGaussianBlur(bitmap: PsdBitmap, radius: number, mask?: Mask): PsdBitmap {
	if (!bitmap.width || !bitmap.height || radius <= 0) return clonePsdBitmap(bitmap);
	// Exact separable Gaussian for ordinary radii; retain linear-time box passes for very large kernels.
	if(radius>16){
		const ideal=Math.sqrt(4*radius*radius+1),lower=Math.floor(ideal)%2===0?Math.floor(ideal)-1:Math.floor(ideal),upper=lower+2;
		const lowerCount=Math.round((12*radius*radius-3*lower*lower-12*lower-9)/(-4*lower-4));
		let blurred=bitmap;for(let i=0;i<3;i++)blurred=boxBlurPass(blurred,((i<lowerCount?lower:upper)-1)/2);
		return commitMasked(bitmap,blurred,mask);
	}
	const {width,height,data}=bitmap,reach=Math.max(1,Math.ceil(radius*3));
	const kernel=Array.from({length:2*reach+1},(_,i)=>Math.exp(-((i-reach)**2)/(2*radius*radius)));
	const sum=kernel.reduce((a,b)=>a+b,0);for(let i=0;i<kernel.length;i++)kernel[i]/=sum;
	const horizontal=new Float32Array(data.length),out=clonePsdBitmap(bitmap);
	for(let y=0;y<height;y++)for(let x=0;x<width;x++){
		const at=(y*width+x)*4;
		for(let k=-reach;k<=reach;k++){if(x+k<0||x+k>=width)continue;const p=(y*width+x+k)*4,w=kernel[k+reach],a=data[p+3]/255;
			for(let c=0;c<3;c++)horizontal[at+c]+=data[p+c]*a*w;horizontal[at+3]+=data[p+3]*w;
		}
	}
	for(let y=0;y<height;y++)for(let x=0;x<width;x++){
		const at=(y*width+x)*4,sums=[0,0,0,0];
		for(let k=-reach;k<=reach;k++){if(y+k<0||y+k>=height)continue;const p=((y+k)*width+x)*4,w=kernel[k+reach];for(let c=0;c<4;c++)sums[c]+=horizontal[p+c]*w;}
		out.data[at+3]=sums[3];for(let c=0;c<3;c++)out.data[at+c]=sums[3]>0?sums[c]*255/sums[3]:0;
	}
	return commitMasked(bitmap,out,mask);
}

/** Unsharp mask: original + amount × (original − blurred). */
export function applySharpen(
	bitmap: PsdBitmap,
	radius: number,
	amountPercent: number,
	mask?: Mask,
): PsdBitmap {
	if (!bitmap.width || !bitmap.height) return clonePsdBitmap(bitmap);
	const blurred = applyGaussianBlur(bitmap, Math.max(0.5, radius));
	const out = clonePsdBitmap(bitmap);
	const amount = amountPercent / 100;
	for (let p = 0; p < out.data.length; p += 4) {
		for (let c = 0; c < 3; c++) {
			out.data[p + c] =
				bitmap.data[p + c] + (bitmap.data[p + c] - blurred.data[p + c]) * amount;
		}
	}
	return commitMasked(bitmap, out, mask);
}

// ---------------------------------------------------------------------------
// Stylize
// ---------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32) so noise replays identically. */
function prng(seed: number): () => number {
	let state = seed >>> 0 || 1;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function applyNoise(bitmap: PsdBitmap, strength: number, seed = 1, mask?: Mask): PsdBitmap {
	const out = clonePsdBitmap(bitmap);
	const hash = (x:number) => {x ^= x >>> 16;x = Math.imul(x,0x7feb352d);x ^= x >>> 15;x = Math.imul(x,0x846ca68b);return (x ^ (x >>> 16)) >>> 0;};
	const scale = (strength / 100) * 127.5;
	for (let p = 0; p < out.data.length; p += 4) {
		if (!out.data[p+3]) continue;
		const base=hash(seed ^ hash(p/4));
		const delta=((hash(base) >>> 8)/16777216*2-1)*scale;
		for(let c=0;c<3;c++)out.data[p+c]+=delta;
	}
	return commitMasked(bitmap, out, mask);
}

export function applyPixelate(bitmap: PsdBitmap, cellSize: number, mask?: Mask): PsdBitmap {
	const { width, height, data } = bitmap;
	const out = clonePsdBitmap(bitmap);
	const cell = Math.max(2, Math.round(cellSize));
	for (let cy = 0; cy < height; cy += cell) {
		for (let cx = 0; cx < width; cx += cell) {
			const endX = Math.min(width, cx + cell);
			const endY = Math.min(height, cy + cell);
			let sums = [0, 0, 0, 0];
			let count = 0;
			for (let y = cy; y < endY; y++) {
				for (let x = cx; x < endX; x++) {
					const p = (y * width + x) * 4;
					for (let c = 0; c < 4; c++) sums[c] += data[p + c];
					count++;
				}
			}
			for (let y = cy; y < endY; y++) {
				for (let x = cx; x < endX; x++) {
					const p = (y * width + x) * 4;
					for (let c = 0; c < 4; c++) out.data[p + c] = sums[c] / count;
				}
			}
		}
	}
	return commitMasked(bitmap, out, mask);
}

export function applyThreshold(bitmap: PsdBitmap, level: number, mask?: Mask): PsdBitmap {
	const out = clonePsdBitmap(bitmap);
	for (let p = 0; p < out.data.length; p += 4) {
		const luma = 0.3 * out.data[p] + 0.59 * out.data[p + 1] + 0.11 * out.data[p + 2];
		const value = luma >= level ? 255 : 0;
		out.data[p] = value;
		out.data[p + 1] = value;
		out.data[p + 2] = value;
	}
	return commitMasked(bitmap, out, mask);
}

export function applyPosterize(bitmap: PsdBitmap, levels: number, mask?: Mask): PsdBitmap {
	const out = clonePsdBitmap(bitmap);
	const steps = Math.max(2, Math.round(levels));
	const scale = 255 / (steps - 1);
	for (let p = 0; p < out.data.length; p += 4) {
		for (let c = 0; c < 3; c++) {
			out.data[p + c] = Math.round(Math.round(out.data[p + c] / scale) * scale);
		}
	}
	return commitMasked(bitmap, out, mask);
}

export function applyFilter(
	bitmap: PsdBitmap,
	kind: PsdFilterKind,
	params: PsdFilterParams = {},
	mask?: Mask,
): PsdBitmap {
	switch (kind) {
		case "motion-blur":
			return commitMasked(
				bitmap,
				motionBlur(bitmap, params.distance ?? 20, params.angle ?? 0),
				mask,
			);
		case "lens-correction":
			return commitMasked(bitmap, lensCorrection(bitmap, params.distortion ?? 0), mask);
		case "gaussian-blur":
			return applyGaussianBlur(bitmap, params.radius ?? 4, mask);
		case "sharpen":
			return applySharpen(bitmap, params.radius ?? 2, params.amount ?? 100, mask);
		case "noise":
			return applyNoise(bitmap, params.strength ?? 10, params.seed ?? 1, mask);
		case "pixelate":
			return applyPixelate(bitmap, params.cellSize ?? 8, mask);
		case "threshold":
			return applyThreshold(bitmap, params.level ?? 128, mask);
		case "posterize":
			return applyPosterize(bitmap, params.levels ?? 4, mask);
	}
}

// ---------------------------------------------------------------------------
// Extended adjustments
// ---------------------------------------------------------------------------

export function applyLevels(bitmap: PsdBitmap, params: PsdLevelsParams, mask?: Mask): PsdBitmap {
	const out = clonePsdBitmap(bitmap);
	const inBlack = params.inBlack ?? 0;
	const inWhite = params.inWhite ?? 255;
	const gamma = params.gamma ?? 1;
	const outBlack = params.outBlack ?? 0;
	const outWhite = params.outWhite ?? 255;
	const table = new Uint8ClampedArray(256);
	for (let value = 0; value < 256; value++) {
		let normalized = (value - inBlack) / Math.max(1, inWhite - inBlack);
		normalized = Math.min(1, Math.max(0, normalized));
		normalized = Math.pow(normalized, 1 / gamma);
		table[value] = outBlack + normalized * (outWhite - outBlack);
	}
	for (let p = 0; p < out.data.length; p += 4) {
		out.data[p] = table[out.data[p]];
		out.data[p + 1] = table[out.data[p + 1]];
		out.data[p + 2] = table[out.data[p + 2]];
	}
	return commitMasked(bitmap, out, mask);
}

export function applyColorBalance(
	bitmap: PsdBitmap,
	params: PsdColorBalanceParams,
	mask?: Mask,
): PsdBitmap {
	const out = clonePsdBitmap(bitmap);
	const red = ((params.cyanRed ?? 0) / 100) * 60;
	const green = ((params.magentaGreen ?? 0) / 100) * 60;
	const blue = ((params.yellowBlue ?? 0) / 100) * 60;
	for (let p = 0; p < out.data.length; p += 4) {
		// Midtone-weighted so shadows and highlights shift less.
		const luma = (0.3 * out.data[p] + 0.59 * out.data[p + 1] + 0.11 * out.data[p + 2]) / 255;
		const weight = 1 - Math.abs(luma - 0.5) * 2;
		out.data[p] += red * weight;
		out.data[p + 1] += green * weight;
		out.data[p + 2] += blue * weight;
	}
	return commitMasked(bitmap, out, mask);
}

export function applyExposure(
	bitmap: PsdBitmap,
	params: PsdExposureParams,
	mask?: Mask,
): PsdBitmap {
	const out = clonePsdBitmap(bitmap);
	const gain = Math.pow(2, params.exposure ?? 0);
	const offset = (params.offset ?? 0) * 255;
	for (let p = 0; p < out.data.length; p += 4) {
		out.data[p] = out.data[p] * gain + offset;
		out.data[p + 1] = out.data[p + 1] * gain + offset;
		out.data[p + 2] = out.data[p + 2] * gain + offset;
	}
	return commitMasked(bitmap, out, mask);
}

export function applyVibrance(
	bitmap: PsdBitmap,
	params: PsdVibranceParams,
	mask?: Mask,
): PsdBitmap {
	const out = clonePsdBitmap(bitmap);
	const vibrance = (params.vibrance ?? 0) / 100;
	for (let p = 0; p < out.data.length; p += 4) {
		const r = out.data[p];
		const g = out.data[p + 1];
		const b = out.data[p + 2];
		const max = Math.max(r, g, b);
		const average = (r + g + b) / 3;
		// Muted colors (small max-average spread) get the strongest boost.
		const saturationNow = (max - average) / 255;
		const boost = vibrance * (1 - saturationNow) * 2;
		out.data[p] = r + (r - average) * boost;
		out.data[p + 1] = g + (g - average) * boost;
		out.data[p + 2] = b + (b - average) * boost;
	}
	return commitMasked(bitmap, out, mask);
}

export function applyBlackWhite(
	bitmap: PsdBitmap,
	params: PsdBlackWhiteParams,
	mask?: Mask,
): PsdBitmap {
	const out = clonePsdBitmap(bitmap);
	const redWeight = 0.3 + (params.reds ?? 0) / 300;
	const greenWeight = 0.59 + (params.greens ?? 0) / 300;
	const blueWeight = 0.11 + (params.blues ?? 0) / 300;
	for (let p = 0; p < out.data.length; p += 4) {
		const value =
			out.data[p] * redWeight + out.data[p + 1] * greenWeight + out.data[p + 2] * blueWeight;
		out.data[p] = value;
		out.data[p + 1] = value;
		out.data[p + 2] = value;
	}
	return commitMasked(bitmap, out, mask);
}
