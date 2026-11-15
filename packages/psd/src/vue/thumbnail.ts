import type { PsdBitmap } from "@cubexp/psd";
import { exportPsdBitmap } from "./psd-bitmap-export";

const previews = new WeakMap<Element, () => PsdBitmap | null>();

export function registerPsdPreview(element: Element, bitmap: () => PsdBitmap | null): () => void {
	previews.set(element, bitmap);
	return () => previews.delete(element);
}

export async function capturePsdPreview(surface: Element): Promise<string | undefined> {
	const preview = surface.matches(".als-ofs-psd-editor")
		? surface
		: surface.querySelector(".als-ofs-psd-editor");
	const bitmap = preview ? previews.get(preview)?.() : null;
	if (!bitmap) return;
	const scale = Math.min(480 / bitmap.width, 672 / bitmap.height, 1);
	const png = await exportPsdBitmap(bitmap, {
		format: "png",
		width: Math.max(1, Math.round(bitmap.width * scale)),
		height: Math.max(1, Math.round(bitmap.height * scale)),
	});
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () =>
			resolve(typeof reader.result === "string" ? reader.result : undefined);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(png);
	});
}
