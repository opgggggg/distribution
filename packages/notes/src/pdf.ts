import { paintPage } from "./render.js";
import type { Notebook } from "./model.js";

/** Appearance export: raster pages retain handwriting, paper and CJK system fonts. */
export async function exportNotesPdf(book: Notebook, signal?: AbortSignal): Promise<Blob> {
	const { PDFDocument } = await import("pdf-lib");
	const pdf = await PDFDocument.create();
	pdf.setTitle(book.title);
	pdf.setCreator("CubeOffice");
	await document.fonts?.ready;
	for (const page of book.pages) {
		signal?.throwIfAborted();
		const scale = Math.min(2, 2400 / Math.max(page.width, page.height));
		const canvas = document.createElement("canvas");
		canvas.width = Math.ceil(page.width * scale);
		canvas.height = Math.ceil(page.height * scale);
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Canvas rendering is unavailable.");
		ctx.scale(scale, scale);
		paintPage(ctx, page);
		const blob = await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(b) => (b ? resolve(b) : reject(new Error("Could not render notebook page."))),
				"image/png",
			),
		);
		const image = await pdf.embedPng(await blob.arrayBuffer());
		pdf.addPage([page.width, page.height]).drawImage(image, {
			x: 0,
			y: 0,
			width: page.width,
			height: page.height,
		});
		canvas.width = canvas.height = 0;
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	signal?.throwIfAborted();
	return new Blob([(await pdf.save()) as BlobPart], { type: "application/pdf" });
}
