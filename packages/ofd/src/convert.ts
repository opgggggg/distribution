import { PDFDocument } from "pdf-lib";
import { readOfdDocument } from "./read.js";
import {
	blob,
	abort,
	type ConversionFormat,
	type ConversionResult,
	type ConvertOptions,
	type OfdDocument,
} from "./types.js";
import { writeDocx, extension } from "./write.js";
export const conversionTargets: Readonly<
	Partial<Record<ConversionFormat, readonly ConversionFormat[]>>
> = {
	ofd: ["pdf", "png", "jpeg", "txt", "docx"],
	pdf: ["ofd"],
	png: ["ofd"],
	jpeg: ["ofd"],
};
export function baseName(options: ConvertOptions): string {
	return (
		(options.fileName || "document")
			.split(/[\\/]/)
			.at(-1)!
			.replace(/\.[^.]*$/, "")
			.replace(/[\u0000-\u001f<>:"|?*]/g, "_") || "document"
	);
}
export function selected<T>(items: T[], page?: number): T[] {
	if (page === undefined) return items;
	if (!Number.isInteger(page) || page < 0 || page >= items.length)
		throw new RangeError("Page/sheet index is outside the document.");
	return [items[page]];
}
export async function convertDocument(
	source: Blob,
	from: ConversionFormat,
	to: ConversionFormat,
	options: ConvertOptions = {},
): Promise<ConversionResult> {
	abort(options.signal);
	if (source.size > (options.maxSourceBytes ?? 64 * 1024 * 1024))
		throw new RangeError("Source size budget exceeded.");
	if (!conversionTargets[from]?.includes(to))
		throw new Error(`Unsupported conversion: ${from} → ${to}.`);
	if (from === "ofd") {
		const document = await readOfdDocument(source, options);
		if (document.format !== from)
			throw new Error("Source format does not match its document content.");
		return exportDocument(document, to, options);
	}
	throw new Error(`The ${from} → ${to} conversion requires the package's Node entry point.`);
}
export async function exportDocument(
	document: OfdDocument,
	to: ConversionFormat,
	options: ConvertOptions = {},
): Promise<ConversionResult> {
	abort(options.signal);
	const name = baseName(options),
		diagnostics = [...document.diagnostics];
	const one = (data: Blob): ConversionResult => ({
		files: [{ name: `${name}.${extension(to)}`, blob: data }],
		diagnostics,
	});
	if (to === "txt") return one(new Blob([document.text], { type: "text/plain;charset=utf-8" }));
	if (to === "md")
		return one(new Blob([document.markdown], { type: "text/markdown;charset=utf-8" }));
	if (to === "html")
		return one(
			new Blob(
				[
					`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><title>Document</title></head><body>${document.html}</body></html>`,
				],
				{ type: "text/html;charset=utf-8" },
			),
		);
	if (to === "docx" && document.format === "ofd") {
		diagnostics.push({
			code: "ofd-editable-text",
			message:
				"DOCX export reconstructs editable text with page breaks; source graphics and exact placement are not preserved.",
		});
		return one(writeDocx(document.pages));
	}
	const pages = selected(document.pages, options.page);
	if (to === "svg")
		return {
			diagnostics,
			files: pages.map((p, i) => ({
				name: `${name}-${options.page === undefined ? i + 1 : options.page + 1}.svg`,
				blob: new Blob([p.svg], { type: "image/svg+xml" }),
			})),
		};
	if (to === "png" || to === "jpeg" || to === "pdf") {
		if (typeof window === "undefined")
			throw new Error(
				"Raster/PDF export requires a browser canvas or the package's Node entry point.",
			);
		const images = [];
		for (const page of pages) {
			abort(options.signal);
			images.push(
				await rasterizeBrowser(
					page.svg,
					page.width,
					page.height,
					to === "jpeg" ? "jpeg" : "png",
					options,
				),
			);
		}
		if (to === "pdf") {
			const pdf = await PDFDocument.create();
			for (let i = 0; i < pages.length; i++) {
				const image = await pdf.embedPng(await images[i].arrayBuffer());
				const page = pdf.addPage([pages[i].width * 0.75, pages[i].height * 0.75]);
				page.drawImage(image, {
					x: 0,
					y: 0,
					width: page.getWidth(),
					height: page.getHeight(),
				});
			}
			diagnostics.push({
				code: "raster-pdf",
				message:
					"PDF pages are rasterized; use the source document for selectable text and electronic signatures.",
			});
			return one(blob(await pdf.save(), "application/pdf"));
		}
		return {
			diagnostics,
			files: images.map((image, i) => ({
				name: `${name}-${options.page === undefined ? i + 1 : options.page + 1}.${extension(to)}`,
				blob: image,
			})),
		};
	}
	throw new Error(
		`The ${document.format} → ${to} conversion requires the package's Node entry point.`,
	);
}
export function rasterSize(
	width: number,
	height: number,
	options: ConvertOptions,
): { width: number; height: number } {
	const scale = options.scale ?? 1.5;
	if (!Number.isFinite(scale) || scale <= 0 || scale > 8)
		throw new RangeError("Raster scale must be greater than zero and at most 8.");
	const w = Math.ceil(width * scale),
		h = Math.ceil(height * scale);
	if (w * h > 40000000 || w > 20000 || h > 20000)
		throw new RangeError("Raster page exceeds the pixel budget.");
	if (
		options.quality !== undefined &&
		(!Number.isFinite(options.quality) || options.quality < 0 || options.quality > 1)
	)
		throw new RangeError("Image quality must be between 0 and 1.");
	return { width: w, height: h };
}
async function rasterizeBrowser(
	svg: string,
	width: number,
	height: number,
	format: "png" | "jpeg",
	options: ConvertOptions,
): Promise<Blob> {
	const size = rasterSize(width, height, options),
		canvas = document.createElement("canvas");
	canvas.width = size.width;
	canvas.height = size.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas 2D is unavailable.");
	const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
	try {
		const image = new Image();
		image.src = url;
		await image.decode();
		abort(options.signal);
		ctx.fillStyle = "white";
		ctx.fillRect(0, 0, size.width, size.height);
		ctx.drawImage(image, 0, 0, size.width, size.height);
		return await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(b) => (b ? resolve(b) : reject(new Error("Image export failed."))),
				`image/${format}`,
				options.quality ?? 0.92,
			),
		);
	} finally {
		URL.revokeObjectURL(url);
		canvas.width = 0;
		canvas.height = 0;
	}
}
