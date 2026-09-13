export type OfdFormat = "ofd";
export type ConversionFormat =
	| OfdFormat
	| "docx"
	| "pdf"
	| "png"
	| "jpeg"
	| "svg"
	| "html"
	| "txt"
	| "md";
export interface Diagnostic {
	code: string;
	message: string;
	page?: number;
}
export interface ReadOptions {
	signal?: AbortSignal;
	maxSourceBytes?: number;
	maxExpandedBytes?: number;
	maxEntries?: number;
	maxPages?: number;
	maxCells?: number;
}
export interface DocumentPage {
	name: string;
	/** CSS pixels, 96 DPI. */
	width: number;
	height: number;
	/** Self-contained SVG with selectable text and embedded raster resources. */
	svg: string;
	text: string;
}
export interface DocumentSheet {
	name: string;
	rows: string[][];
	formulas: Record<string, string>;
}
export interface OfdDocument {
	format: OfdFormat;
	pages: DocumentPage[];
	sheets: DocumentSheet[];
	text: string;
	html: string;
	markdown: string;
	diagnostics: Diagnostic[];
}
export interface ConversionFile {
	name: string;
	blob: Blob;
}
export interface ConversionResult {
	files: ConversionFile[];
	diagnostics: Diagnostic[];
}
export interface ConvertOptions extends ReadOptions {
	fileName?: string;
	/** Zero-based sheet/page selection. Omit to export all sheets/pages. */
	page?: number;
	scale?: number;
	quality?: number;
}
export const OFD_MIME_TYPES: Readonly<Record<OfdFormat, string>> = {
	ofd: "application/ofd",
};
export function abort(signal?: AbortSignal): void {
	signal?.throwIfAborted();
}
export function blob(bytes: Uint8Array, type: string): Blob {
	return new Blob([bytes.slice().buffer as ArrayBuffer], { type });
}
