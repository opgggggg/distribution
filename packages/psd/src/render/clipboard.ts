import { type PsdDocument, createPsdBitmap, type PsdBitmap, type PsdLayerNode } from "../codec/document";
import { composePsdDocument } from "./compose";
import { rasterizeSelection } from "./selection";
/** Copy the visible composite, cropped to the nonempty selected pixels when a selection exists. */
export function copyPsdMerged(document: PsdDocument): PsdBitmap {
	return cropSelectedPixels(document, composePsdDocument(document));
}
/** Raw active-layer pixels, independent of visibility, opacity, blend mode and mask. */
export function copyPsdLayer(document: PsdDocument, layer: PsdLayerNode, target: "image" | "mask" = "image"): PsdBitmap {
	const bitmap = createPsdBitmap(document.width, document.height);
	if (target === "mask") {
		const mask = layer.mask;
		if (!mask) throw Error("The layer has no mask");
		for (let y = 0; y < bitmap.height; y++) for (let x = 0; x < bitmap.width; x++) {
			const inside = x >= mask.left && x < mask.right && y >= mask.top && y < mask.bottom;
			const gray = inside ? mask.data[(y - mask.top) * (mask.right - mask.left) + x - mask.left] : mask.defaultColor;
			bitmap.data.set([gray, gray, gray, 255], (y * bitmap.width + x) * 4);
		}
	} else {
		if (layer.kind === "group" || layer.adjustment || layer.curves) throw Error("Select a layer with image pixels");
		for (let y = Math.max(0, layer.top); y < Math.min(bitmap.height, layer.top + layer.bitmap.height); y++)
			for (let x = Math.max(0, layer.left); x < Math.min(bitmap.width, layer.left + layer.bitmap.width); x++) {
				const source = ((y - layer.top) * layer.bitmap.width + x - layer.left) * 4;
				bitmap.data.set(layer.bitmap.data.subarray(source, source + 4), (y * bitmap.width + x) * 4);
			}
	}
	return cropSelectedPixels(document, bitmap);
}
function cropSelectedPixels(document: PsdDocument, bitmap: PsdBitmap): PsdBitmap {
	if (!document.selection) return bitmap;
	const mask = rasterizeSelection(document.selection, document.width, document.height);
	const { x: left, y: top, width, height } = psdClipboardRegion(document);
	const right = left + width, bottom = top + height;
	const out = createPsdBitmap(right - left, bottom - top);
	for (let y = top; y < bottom; y++)
		for (let x = left; x < right; x++) {
			const source = (y * document.width + x) * 4,
				target = ((y - top) * out.width + x - left) * 4;
			out.data.set(bitmap.data.subarray(source, source + 4), target);
			out.data[target + 3] = Math.round(
				(out.data[target + 3] * mask[y * document.width + x]) / 255,
			);
		}
	return out;
}

export function psdClipboardRegion(document: PsdDocument): { x: number; y: number; width: number; height: number } {
	if (!document.selection) return { x: 0, y: 0, width: document.width, height: document.height };
	const mask = rasterizeSelection(document.selection, document.width, document.height);
	let left = document.width,
		top = document.height,
		right = 0,
		bottom = 0;
	for (let y = 0; y < document.height; y++)
		for (let x = 0; x < document.width; x++)
			if (mask[y * document.width + x]) {
				left = Math.min(left, x);
				top = Math.min(top, y);
				right = Math.max(right, x + 1);
				bottom = Math.max(bottom, y + 1);
			}
	if (right <= left || bottom <= top) throw new Error("The selection is empty");
	return { x: left, y: top, width: right - left, height: bottom - top };
}
