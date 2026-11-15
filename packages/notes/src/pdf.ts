import { writePdfImages, type PdfImagePage } from "@cubexp/kernels";
import { pageContentBounds } from "./board.js";
import { exportNotesPagePng } from "./image.js";
import type { Notebook } from "./model.js";

/** Appearance export: raster pages retain handwriting, paper and CJK system fonts. */
export async function exportNotesPdf(book: Notebook, signal?: AbortSignal): Promise<Blob> {
	const pages: PdfImagePage[] = [];
	let bytes = 0;
	for (const page of book.pages) {
		const blob = await exportNotesPagePng(page, signal);
		bytes += blob.size;
		if (bytes > 120 * 1024 * 1024)
			throw new Error("Notebook pages exceed the PDF export limit.");
		const area = pageContentBounds(page);
		const scale = Math.min(1, 14400 / Math.max(area.width, area.height));
		pages.push({
			bytes: new Uint8Array(await blob.arrayBuffer()),
			width: area.width * scale,
			height: area.height * scale,
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	signal?.throwIfAborted();
	const pdf = await writePdfImages(pages, { title: book.title, creator: "CubeOffice" });
	signal?.throwIfAborted();
	return new Blob([pdf], { type: "application/pdf" });
}
