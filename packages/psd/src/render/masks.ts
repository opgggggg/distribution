import { createPsdBitmap, type PsdBitmap, type PsdLayerMask } from "../codec/document";
import { renderAffine, multiplyAffine, type PsdAffine } from "./affine";
export function maskBitmap(mask: PsdLayerMask): PsdBitmap {
	const bitmap = createPsdBitmap(mask.right - mask.left, mask.bottom - mask.top);
	for (let p = 0; p < mask.data.length; p++)
		bitmap.data.set([mask.data[p], mask.data[p], mask.data[p], 255], p * 4);
	return bitmap;
}
export function replaceMaskBitmap(mask: PsdLayerMask, bitmap: PsdBitmap): PsdLayerMask {
	const data = new Uint8Array(bitmap.width * bitmap.height);
	for (let p = 0; p < data.length; p++)
		data[p] = Math.round(
			(bitmap.data[p * 4] * bitmap.data[p * 4 + 3]) / 255 +
				mask.defaultColor * (1 - bitmap.data[p * 4 + 3] / 255),
		);
	return { ...mask, right: mask.left + bitmap.width, bottom: mask.top + bitmap.height, data };
}
export function transformMask(mask: PsdLayerMask, matrix: PsdAffine): PsdLayerMask {
	const rendered = renderAffine(
		maskBitmap(mask),
		multiplyAffine(matrix, [1, 0, 0, 1, mask.left, mask.top]),
	);
	const next = replaceMaskBitmap(mask, rendered.bitmap);
	return {
		...next,
		left: rendered.left,
		top: rendered.top,
		right: rendered.left + rendered.bitmap.width,
		bottom: rendered.top + rendered.bitmap.height,
	};
}

/** Editing an imported cropped mask must also cover the visible canvas. */
export function expandMaskToCanvas(
	mask: PsdLayerMask,
	width: number,
	height: number,
): PsdLayerMask {
	const left = Math.min(0, mask.left),
		top = Math.min(0, mask.top),
		right = Math.max(width, mask.right),
		bottom = Math.max(height, mask.bottom),
		w = right - left,
		h = bottom - top;
	if (left === mask.left && top === mask.top && right === mask.right && bottom === mask.bottom)
		return mask;
	if (w * h > 80_000_000) throw new Error("Mask exceeds the 80 megapixel budget");
	const data = new Uint8Array(w * h).fill(mask.defaultColor),
		oldWidth = mask.right - mask.left;
	for (let y = mask.top; y < mask.bottom; y++)
		data.set(
			mask.data.subarray((y - mask.top) * oldWidth, (y - mask.top + 1) * oldWidth),
			(y - top) * w + mask.left - left,
		);
	return { ...mask, left, top, right, bottom, data };
}
