import { writeOfdImages, writeOfdDocx } from "@cubexp/kernels/sync";
import { OFD_MIME_TYPES, blob, type ConversionFormat, type DocumentPage } from "./types.js";
/** Public synchronous contracts are retained; XML and ZIP generation run in Rust. */
export function writeDocx(pages: DocumentPage[]): Blob {
	return blob(
		writeOfdDocx(pages.map((page) => page.text)),
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	);
}
export interface OfdImagePage {
	bytes: Uint8Array;
	width: number;
	height: number;
}
export function writeImageOfd(pages: OfdImagePage[]): Blob {
	return blob(writeOfdImages(pages, crypto.randomUUID().replace(/-/g, "")), OFD_MIME_TYPES.ofd);
}
export function extension(format: ConversionFormat): string {
	return format === "jpeg" ? "jpg" : format;
}
