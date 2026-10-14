import { pageContentBounds } from "./board.js";
import { exportNotesPagePng } from "./image.js";
import type { Notebook } from "./model.js";

/** Appearance export: raster pages retain handwriting, paper and CJK system fonts. */
export async function exportNotesPdf(book: Notebook, signal?: AbortSignal): Promise<Blob> {
	const { PDFDocument } = await import("pdf-lib");
	const pdf = await PDFDocument.create();
	pdf.setTitle(book.title);
	pdf.setCreator("CubeOffice");
	for (const page of book.pages) {
		const blob = await exportNotesPagePng(page, signal);
		const image = await pdf.embedPng(await blob.arrayBuffer());
		const area = pageContentBounds(page),
			scale = Math.min(1, 14400 / Math.max(area.width, area.height));
		pdf.addPage([area.width * scale, area.height * scale]).drawImage(image, {
			x: 0,
			y: 0,
			width: area.width * scale,
			height: area.height * scale,
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	signal?.throwIfAborted();
	return new Blob([(await pdf.save()) as BlobPart], { type: "application/pdf" });
}
