import type { OfdAction, OfdPackageDocument } from "./package.js";
import type { Matrix } from "./geometry.js";
export type OfdFormat = "ofd";
export type ConversionFormat =
	OfdFormat | "docx" | "pdf" | "png" | "jpeg" | "svg" | "html" | "txt" | "md";
export interface Diagnostic {
	code: string;
	message: string;
	page?: number;
}
export interface ReadOptions {
	signal?: AbortSignal;
	/** Matching OpenType bytes indexed by OFD font ID or family name. */
	fonts?: Readonly<Record<string, Uint8Array>>;
	maxSourceBytes?: number;
	maxExpandedBytes?: number;
	maxEntries?: number;
	maxPages?: number;
	/** Maximum rendered objects across the document, including template instances. */
	maxObjects?: number;
	/** Raster samples per millimetre for non-vector color paints. Default: 192 DPI. */
	paintScale?: number;
	useImageSubstitutions?: boolean;
	/** Additional image formats must return PNG or JPEG bytes. */
	colorConverter?: (
		components: readonly number[],
		space: { type: string; bitsPerComponent: number; profile?: Uint8Array },
	) => [number, number, number];
	decodeImage?: (
		bytes: Uint8Array,
		format: string,
		path: string,
	) => Promise<Uint8Array> | Uint8Array;
	/** Maximum UTF-8 bytes of generated SVG across all pages. */
	maxSvgBytes?: number;
	/** @deprecated Reserved for compatibility; OFD has no cells. */
	maxCells?: number;
	documentIndex?: number;
	version?: string;
	intent?: "screen" | "print";
}
export interface OfdHotspot {
	objectId: string;
	actions: OfdAction[];
	region: string;
	transform: Matrix;
}
export interface DocumentPage {
	documentIndex?: number;
	id?: string;
	origin?: [number, number];
	actions?: OfdAction[];
	hotspots?: OfdHotspot[];
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
	documents?: OfdPackageDocument[];
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
