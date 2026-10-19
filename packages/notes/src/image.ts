import { pageContentBounds } from "./board.js";
import { zip } from "fflate";
import { LIMITS, type Notebook, type NotePage } from "./model.js";
import { loadPagePhotos } from "./photo.js";
import { createPagePainter } from "./render.js";

/** Render the complete page, independently of the editor's zoom, scroll or selection. */
export async function exportNotesPagePng(page: NotePage, signal?: AbortSignal): Promise<Blob> {
	signal?.throwIfAborted();
	await document.fonts?.ready;
	signal?.throwIfAborted();
	const area = pageContentBounds(page);
	const scale = Math.min(2, 2400 / Math.max(area.width, area.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.ceil(area.width * scale));
	canvas.height = Math.max(1, Math.ceil(area.height * scale));
	try {
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Canvas rendering is unavailable.");
		ctx.scale(scale, scale);
		ctx.translate(-area.x, -area.y);
		const photos = await loadPagePhotos(page);
		signal?.throwIfAborted();
		createPagePainter(undefined, photos)(ctx, page, new Set(), area, scale);
		photos.clear();
		const blob = await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(value) =>
					value ? resolve(value) : reject(new Error("Could not render notebook page.")),
				"image/png",
			),
		);
		signal?.throwIfAborted();
		return blob;
	} finally {
		canvas.width = canvas.height = 0;
	}
}

/** One numbered PNG per page; existing PNG compression avoids recompressing images. */
export async function exportNotesImages(book: Notebook, signal?: AbortSignal): Promise<Blob> {
	const files: Record<string, Uint8Array> = {};
	let bytes = 0;
	for (const [index, page] of book.pages.entries()) {
		const image = await exportNotesPagePng(page, signal);
		bytes += image.size;
		if (bytes > LIMITS.bytes)
			throw new Error("Image export exceeds 64 MiB. Export individual pages instead.");
		files[`page-${String(index + 1).padStart(3, "0")}.png`] = new Uint8Array(
			await image.arrayBuffer(),
		);
	}
	signal?.throwIfAborted();
	const data = await new Promise<Uint8Array>((resolve, reject) => {
		const abort = () => {
			terminate();
			reject(signal!.reason);
		};
		const terminate = zip(files, { level: 0 }, (error, result) => {
			signal?.removeEventListener("abort", abort);
			if (error) reject(error);
			else resolve(result);
		});
		signal?.addEventListener("abort", abort, { once: true });
	});
	signal?.throwIfAborted();
	return new Blob([data as BlobPart], { type: "application/zip" });
}
