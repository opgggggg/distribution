import type { UiArtifactFormatContribution } from "@yaochn/als-office-editor-ui/vue";
import { IMAGE_FORMAT_MANIFEST } from "@yaochn/als-office-image";
import UTIF from "utif";

import { decodeImageWithHost } from "./harmony-host";

type ArtifactConverter = NonNullable<UiArtifactFormatContribution["converters"]>[number];

/**
 * Raster imports the image editor does not read itself. Each one decodes to a PNG, the
 * same way upstream turns EMF/WMF into an editable image, so the document reopens as
 * `.png`. Loaded with the image engine chunk, never eagerly.
 *
 * GIF, BMP and SVG decode in every WebView; TIFF has no WebView support outside
 * Safari, so it goes through UTIF; HEIC decodes in WKWebView from iOS 17 and otherwise
 * through the native host's system decoder.
 */

const MAX_SOURCE_BYTES = 128 * 1024 * 1024;
// Below the 16.7 MP canvas ceiling older iOS WebViews enforce.
const MAX_OUTPUT_PIXELS = 16_000_000;
const MAX_OUTPUT_SIDE = 8192;
// Vector art has no pixel size of its own worth keeping; icons come out legible.
const MIN_VECTOR_SIDE = 1024;

const IMAGE_TARGET = {
	format: IMAGE_FORMAT_MANIFEST.id,
	extensions: IMAGE_FORMAT_MANIFEST.extensions,
	mimeTypes: IMAGE_FORMAT_MANIFEST.mimeTypes,
};

function imageConverter(
	format: string,
	extensions: readonly string[],
	mimeTypes: readonly string[],
	label: string,
	sniff: (head: Uint8Array) => boolean,
	decode: (source: Blob, signal?: AbortSignal) => Promise<Blob>,
): ArtifactConverter {
	return {
		manifest: {
			id: `${format}-to-image`,
			label,
			source: { format, extensions, mimeTypes },
			target: IMAGE_TARGET,
			accepts: "bytes",
			environment: "dom",
			lossiness: "lossy",
		},
		// Only consulted when the name and MIME type say nothing, so it must recognise
		// the format by content rather than accept any bytes.
		async canConvert(input) {
			if (input.kind !== "bytes" || input.blob.size > MAX_SOURCE_BYTES) return false;
			return sniff(new Uint8Array(await input.blob.slice(0, SNIFF_BYTES).arrayBuffer()));
		},
		async convert(input, context) {
			if (input.kind !== "bytes") throw new TypeError(`${format}-to-image converts raw bytes.`);
			if (input.blob.size > MAX_SOURCE_BYTES) {
				throw new RangeError("图片超过 128 MB，无法打开。");
			}
			throwIfAborted(context?.signal);
			const png = await decode(input.blob, context?.signal);
			throwIfAborted(context?.signal);
			return png;
		},
	};
}

export const IMAGE_IMPORT_CONVERTERS: readonly ArtifactConverter[] = [
	// Only the first frame of an animated GIF survives; the editor holds one bitmap.
	imageConverter(
		"gif",
		["gif"],
		["image/gif"],
		"GIF as editable PNG image",
		(head) => startsWith(head, "GIF87a") || startsWith(head, "GIF89a"),
		(source) => decodeWithWebView(source, "image/gif"),
	),
	imageConverter(
		"bmp",
		["bmp", "dib"],
		["image/bmp", "image/x-bmp", "image/x-ms-bmp"],
		"BMP as editable PNG image",
		(head) => startsWith(head, "BM") && head.length >= 26,
		(source) => decodeWithWebView(source, "image/bmp"),
	),
	imageConverter(
		"svg",
		["svg"],
		["image/svg+xml"],
		"SVG as editable PNG image",
		looksLikeSvg,
		(source) => decodeWithWebView(source, "image/svg+xml", { vector: true }),
	),
	imageConverter(
		"tiff",
		["tif", "tiff"],
		["image/tiff", "image/tiff-fx"],
		"TIFF as editable PNG image",
		(head) => startsWith(head, "II*\0") || startsWith(head, "MM\0*"),
		async (source) => decodeTiff(await source.arrayBuffer()),
	),
	imageConverter(
		"heic",
		["heic", "heif", "hif"],
		["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"],
		"HEIC photo as editable PNG image",
		looksLikeHeif,
		decodeHeic,
	),
];

const SNIFF_BYTES = 4096;
// ISO-BMFF major brands of HEIF stills and sequences; AVIF ("avif") is not one of them.
const HEIF_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"]);

function startsWith(head: Uint8Array, signature: string): boolean {
	if (head.length < signature.length) return false;
	for (let index = 0; index < signature.length; index += 1) {
		if (head[index] !== signature.charCodeAt(index)) return false;
	}
	return true;
}

function looksLikeHeif(head: Uint8Array): boolean {
	if (head.length < 12) return false;
	const box = String.fromCharCode(...head.subarray(4, 12));
	return box.startsWith("ftyp") && HEIF_BRANDS.has(box.slice(4));
}

function looksLikeSvg(head: Uint8Array): boolean {
	let text: string;
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(head);
	} catch {
		// The sniff window can cut a multi-byte character in half.
		text = new TextDecoder("utf-8").decode(head);
	}
	// Past the XML declaration, comments and doctype, the root element must be <svg>.
	const body = text
		.replace(/^\uFEFF/u, "")
		.replace(/<\?xml[\s\S]*?\?>/u, "")
		.replace(/<!--[\s\S]*?-->/gu, "")
		.replace(/<!DOCTYPE[^>]*>/iu, "")
		.trimStart();
	return /^<svg[\s>]/u.test(body);
}

async function decodeHeic(source: Blob, signal?: AbortSignal): Promise<Blob> {
	try {
		return await decodeWithWebView(source, "image/heic");
	} catch {
		throwIfAborted(signal);
	}
	const decoded = await decodeImageWithHost(source);
	if (!decoded) throw new Error("这台设备无法解码 HEIC 照片。");
	throwIfAborted(signal);
	// The host hands back a JPEG; the image editor stores PNG.
	return decodeWithWebView(decoded, "image/jpeg");
}

/** Decodes through an <img>, which never runs SVG script, and re-encodes as PNG. */
async function decodeWithWebView(
	source: Blob,
	type: string,
	options: { vector?: boolean } = {},
): Promise<Blob> {
	const url = URL.createObjectURL(source.type === type ? source : source.slice(0, source.size, type));
	try {
		const image = new Image();
		image.decoding = "async";
		image.src = url;
		await image.decode();
		let width = image.naturalWidth;
		let height = image.naturalHeight;
		if (options.vector) [width, height] = vectorSize(width, height, await source.text());
		if (!width || !height) throw new Error("图片没有可用的尺寸。");
		const size = fitOutput(width, height, options.vector ? MIN_VECTOR_SIDE : 0);
		const canvas = createCanvas(size.width, size.height);
		canvas.getContext("2d")!.drawImage(image, 0, 0, size.width, size.height);
		return await canvasToPng(canvas);
	} finally {
		URL.revokeObjectURL(url);
	}
}

/** An SVG without width/height reports 0 or 150×150; its viewBox carries the shape. */
function vectorSize(width: number, height: number, markup: string): [number, number] {
	const root = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
	const box = root
		.getAttribute("viewBox")
		?.trim()
		.split(/[\s,]+/u)
		.map(Number);
	const explicit = root.hasAttribute("width") && root.hasAttribute("height");
	if (!explicit && box?.length === 4 && box[2] > 0 && box[3] > 0) return [box[2], box[3]];
	return [width, height];
}

function decodeTiff(buffer: ArrayBuffer): Promise<Blob> {
	const pages = UTIF.decode(buffer);
	// A multi-page TIFF (a fax or a scanned stack) opens at its first page.
	const page = pages[0];
	if (!page) throw new Error("TIFF 文件里没有图片。");
	UTIF.decodeImage(buffer, page);
	const { width, height } = page;
	if (!width || !height || width * height > 40_000_000) {
		throw new RangeError("TIFF 图片尺寸超出可打开的范围。");
	}
	const pixels = new Uint8ClampedArray(width * height * 4);
	pixels.set(UTIF.toRGBA8(page));
	const raw = createCanvas(width, height);
	raw.getContext("2d")!.putImageData(new ImageData(pixels, width, height), 0, 0);
	const orientation = page.t274?.[0] ?? 1;
	const turned = orientation >= 5 && orientation <= 8;
	const size = fitOutput(turned ? height : width, turned ? width : height, 0);
	const canvas = createCanvas(size.width, size.height);
	const context = canvas.getContext("2d")!;
	context.scale(size.width / (turned ? height : width), size.height / (turned ? width : height));
	applyExifOrientation(context, orientation, width, height);
	context.drawImage(raw, 0, 0);
	return canvasToPng(canvas);
}

/** Maps stored pixels onto the displayed frame for EXIF/TIFF orientations 1–8. */
function applyExifOrientation(
	context: CanvasRenderingContext2D,
	orientation: number,
	width: number,
	height: number,
): void {
	switch (orientation) {
		case 2:
			return context.transform(-1, 0, 0, 1, width, 0);
		case 3:
			return context.transform(-1, 0, 0, -1, width, height);
		case 4:
			return context.transform(1, 0, 0, -1, 0, height);
		case 5:
			return context.transform(0, 1, 1, 0, 0, 0);
		case 6:
			return context.transform(0, 1, -1, 0, height, 0);
		case 7:
			return context.transform(0, -1, -1, 0, height, width);
		case 8:
			return context.transform(0, -1, 1, 0, 0, width);
		default:
			return;
	}
}

function fitOutput(width: number, height: number, minSide: number) {
	let scale = Math.min(
		MAX_OUTPUT_SIDE / Math.max(width, height),
		Math.sqrt(MAX_OUTPUT_PIXELS / (width * height)),
	);
	if (minSide > 0) scale = Math.min(scale, Math.max(1, minSide / Math.max(width, height)));
	else scale = Math.min(scale, 1);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error("图片转换失败。"))),
			"image/png",
		),
	);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw new DOMException("Import aborted", "AbortError");
}
