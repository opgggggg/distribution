import type { UiArtifactSurfaceHandle } from "@yaochn/als-office-editor-ui/vue";
import { writePdfImages } from "@cubexp/kernels";

// Canonical surface IDs. Legacy Office inputs resolve to these same editors.
const pdfSurfaces = new Set([
	"docx",
	"xlsx",
	"jmp",
	"pptx",
	"vsdx",
	"markdown",
	"pdf",
	"ai",
	"image",
	"psd",
	"notes",
	"ofd",
	"text",
]);

export function graphicsExportLabel(format: "pdf" | "png", chinese: boolean): string {
	if (format === "pdf") return chinese ? "导出 PDF…" : "Export PDF…";
	return chinese ? "导出首页 PNG…" : "Export First Page as PNG…";
}

export function canOutputDocument(editor: UiArtifactSurfaceHandle | null | undefined): boolean {
	if (!editor || !pdfSurfaces.has(editor.format)) return false;
	if (editor.format !== "text") return true;
	return typeof (editor.exposed as { getText?: unknown } | undefined)?.getText === "function";
}

export async function pngAsPdf(png: Blob, signal?: AbortSignal): Promise<Blob> {
	const bytes = new Uint8Array(await png.arrayBuffer());
	signal?.throwIfAborted();
	if (
		bytes.length < 24 ||
		bytes[0] !== 137 ||
		bytes[1] !== 80 ||
		bytes[2] !== 78 ||
		bytes[3] !== 71
	) {
		throw new Error("The artwork did not produce a PNG.");
	}
	const header = new DataView(bytes.buffer, bytes.byteOffset);
	const width = header.getUint32(16);
	const height = header.getUint32(20);
	if (!width || !height) throw new Error("The artwork has no printable area.");
	const scale = Math.min(0.75, 14_400 / Math.max(width, height));
	const pdf = await writePdfImages([{ bytes, width: width * scale, height: height * scale }]);
	signal?.throwIfAborted();
	return new Blob([pdf], { type: "application/pdf" });
}

export async function rasterizePdfFirstPage(
	pdf: Blob,
	signal?: AbortSignal,
	dpi = 144,
): Promise<Blob> {
	if (pdf.size > 128 * 1024 * 1024) throw new Error("PDF raster input exceeds 128 MiB.");
	const { compilePdfKernel, PdfKernelDocument } = await import("@yaochn/als-office-pdf");
	signal?.throwIfAborted();
	const kernel = await compilePdfKernel();
	const document = await PdfKernelDocument.open(kernel, new Uint8Array(await pdf.arrayBuffer()), {
		signal,
	});
	try {
		signal?.throwIfAborted();
		const { png } = document.capture({ type: "page.capture", page: 1, dpi, format: "png" });
		signal?.throwIfAborted();
		return new Blob([new Uint8Array(png)], { type: "image/png" });
	} finally {
		document.dispose();
	}
}

async function exportPlainTextPdf(text: string, signal: AbortSignal): Promise<Blob> {
	if (text.length > 120_000) throw new Error("Text printing is limited to 120,000 characters.");
	const canvas = window.document.createElement("canvas");
	canvas.width = 1190;
	canvas.height = 1684;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Text printing requires a 2D canvas.");

	const margin = 81;
	const lineHeight = 24;
	const linesPerPage = 60;
	const pages: Array<Parameters<typeof writePdfImages>[0][number]> = [];
	let lineCount = 0;
	let pageBytes = 0;
	context.font = "18px monospace";
	context.textBaseline = "top";

	const startPage = () => {
		context.fillStyle = "#fff";
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.fillStyle = "#1a1a1a";
	};
	const finishPage = async () => {
		const png = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob((blob) => {
				if (blob) resolve(blob);
				else reject(new Error("Could not render a printable text page."));
			}, "image/png");
		});
		signal.throwIfAborted();
		pageBytes += png.size;
		if (pageBytes > 120 * 1024 * 1024) throw new Error("The rendered text exceeds 120 MiB.");
		pages.push({ bytes: new Uint8Array(await png.arrayBuffer()), width: 595, height: 842 });
	};

	startPage();
	try {
		const sourceLines = text.replace(/\r\n?/g, "\n").split("\n");
		for (const sourceLine of sourceLines) {
			const characters = [...sourceLine.replaceAll("\t", "    ")];
			// Leave room for wide glyphs from browser fallback fonts.
			for (let offset = 0; offset < Math.max(characters.length, 1); offset += 56) {
				signal.throwIfAborted();
				if (lineCount === linesPerPage) {
					if (pages.length === 99)
						throw new Error("Text printing is limited to 100 pages.");
					await finishPage();
					startPage();
					lineCount = 0;
				}
				const line = characters.slice(offset, offset + 56).join("");
				context.fillText(
					line,
					margin,
					margin + lineCount * lineHeight,
					canvas.width - margin * 2,
				);
				lineCount++;
			}
		}
		await finishPage();
		const pdf = await writePdfImages(pages);
		signal.throwIfAborted();
		return new Blob([pdf], { type: "application/pdf" });
	} finally {
		canvas.width = 0;
		canvas.height = 0;
	}
}

export async function capturePdfOutputPreview(
	editor: UiArtifactSurfaceHandle,
): Promise<string | undefined> {
	try {
		const pdf = await editor.export({ format: "pdf" });
		const png = await rasterizePdfFirstPage(pdf, undefined, 36);
		if (png.size > 512 * 1024) return;
		return await new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () =>
				resolve(typeof reader.result === "string" ? reader.result : undefined);
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(png);
		});
	} catch {
		// The standard preview pipeline can reuse the open viewer's painted page.
		return undefined;
	}
}

export function exportTextSurfacePdf(
	editor: UiArtifactSurfaceHandle,
	signal: AbortSignal,
): Promise<Blob> {
	const surface = editor.exposed as { getText?: () => string } | undefined;
	if (!surface?.getText) throw new Error("Large files in ranged viewing mode cannot be printed.");
	return exportPlainTextPdf(surface.getText(), signal);
}
