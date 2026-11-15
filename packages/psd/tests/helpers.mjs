import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function loadPsd() {
	return import(path.join(here, "../dist/psd.mjs"));
}

export function solidBitmap(psd, width, height, r, g, b, a = 255) {
	const bitmap = psd.createPsdBitmap(width, height);
	for (let p = 0; p < bitmap.data.length; p += 4) {
		bitmap.data[p] = r;
		bitmap.data[p + 1] = g;
		bitmap.data[p + 2] = b;
		bitmap.data[p + 3] = a;
	}
	return bitmap;
}

export function emptyLocks() {
	return { transparency: false, composite: false, position: false, all: false };
}

export function rasterLayer(psd, id, name, options = {}) {
	return {
		kind: "raster",
		id,
		name,
		visible: options.visible ?? true,
		opacity: options.opacity ?? 1,
		blendMode: options.blendMode ?? "normal",
		clipping: false,
		locks: options.locks ?? emptyLocks(),
		preservedBlocks: options.preservedBlocks ?? [],
		top: options.top ?? 0,
		left: options.left ?? 0,
		bitmap: options.bitmap,
		...(options.mask ? { mask: options.mask } : {}),
	};
}

export function makeDocument(psd, layers, options = {}) {
	return {
		width: options.width ?? 64,
		height: options.height ?? 48,
		colorMode: options.colorMode ?? "rgb",
		bitsPerChannel: 8,
		resolutionPpi: options.resolutionPpi,
		editable: true,
		composite: null,
		openWarnings: [],
		colorModeData: new Uint8Array(0),
		preservedResources: options.preservedResources ?? [],
		globalLayerMaskInfo: options.globalLayerMaskInfo ?? new Uint8Array(0),
		preservedGlobalBlocks: options.preservedGlobalBlocks ?? [],
		layers,
	};
}

/** Builds a minimal valid 'TySh' block carrying the given text. */
export function makeTySh(psd, text) {
	const writer = new psd.PsdByteWriter();
	writer.i16(1); // version
	for (const value of [1, 0, 0, 1, 0, 0]) writer.f64(value); // transform
	writer.i16(50); // text descriptor version
	writer.u32(16); // descriptor version
	writer.u32(1); // empty unicode name (terminator only)
	writer.u16(0);
	writer.u32(0);
	writer.signature("TxLr");
	writer.u32(1); // item count
	writer.u32(0);
	writer.signature("Txt ");
	writer.signature("TEXT");
	writer.u32(text.length + 1);
	for (let i = 0; i < text.length; i++) writer.u16(text.charCodeAt(i));
	writer.u16(0);
	writer.i16(1); // warp version
	writer.u32(16); // descriptor version
	writer.u32(1);
	writer.u16(0);
	writer.u32(0);
	writer.signature("warp");
	writer.u32(0); // no items
	writer.u32(0); // 4×f32 bounds
	writer.u32(0);
	writer.u32(0);
	writer.u32(0);
	return writer.toBytes();
}

export function pixelAt(bitmap, x, y) {
	const p = (y * bitmap.width + x) * 4;
	return [bitmap.data[p], bitmap.data[p + 1], bitmap.data[p + 2], bitmap.data[p + 3]];
}
