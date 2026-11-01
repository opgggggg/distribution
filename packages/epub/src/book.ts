import { EpubArchive, type EpubSource } from "./archive.js";

export interface EpubMetadata {
	title: string;
	creators: string[];
	language?: string;
	publisher?: string;
	description?: string;
	identifier?: string;
	published?: string;
}

export interface EpubManifestItem {
	id: string;
	/** Absolute, decoded path inside the archive. */
	href: string;
	mediaType: string;
	properties: string[];
	fallback?: string;
}

export interface EpubSpineItem {
	index: number;
	id: string;
	href: string;
	mediaType: string;
	linear: boolean;
	properties: string[];
	/** Uncompressed bytes; the book-wide progress scale weights chapters by it. */
	size: number;
}

export interface EpubTocItem {
	id: string;
	label: string;
	/** Archive path of the target document, or undefined for a heading without a link. */
	href?: string;
	fragment?: string;
	/** Spine index of `href`, when the target is in the reading order. */
	index?: number;
	depth: number;
	children: EpubTocItem[];
}

export type EpubLayout = "reflowable" | "pre-paginated";
export type EpubDirection = "ltr" | "rtl";

export interface EpubBook {
	readonly archive: EpubArchive;
	readonly metadata: EpubMetadata;
	readonly manifest: ReadonlyMap<string, EpubManifestItem>;
	readonly spine: readonly EpubSpineItem[];
	readonly toc: readonly EpubTocItem[];
	readonly layout: EpubLayout;
	readonly direction: EpubDirection;
	readonly coverHref?: string;
	readonly packagePath: string;
	/** Resource bytes with font obfuscation removed. */
	read(path: string): Uint8Array | undefined;
	readText(path: string): string | undefined;
	mediaType(path: string): string;
	spineIndex(path: string): number;
}

export interface OpenEpubOptions {
	signal?: AbortSignal;
}

const OPS_NS = "http://www.idpf.org/2007/ops";
const XLINK_NS = "http://www.w3.org/1999/xlink";

const MEDIA_TYPES: Record<string, string> = {
	xhtml: "application/xhtml+xml",
	xht: "application/xhtml+xml",
	html: "text/html",
	htm: "text/html",
	css: "text/css",
	svg: "image/svg+xml",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	bmp: "image/bmp",
	ttf: "font/ttf",
	otf: "font/otf",
	woff: "font/woff",
	woff2: "font/woff2",
	mp3: "audio/mpeg",
	m4a: "audio/mp4",
	mp4: "video/mp4",
	webm: "video/webm",
	ogg: "audio/ogg",
	ncx: "application/x-dtbncx+xml",
	js: "text/javascript",
	xml: "application/xml",
};

/** Resolve `href` against the archive path of the document that contains it. */
export function resolvePath(base: string, href: string): string {
	const clean = href.split("#")[0]!.split("?")[0]!;
	if (!clean) return base;
	try {
		const url = new URL(
			clean,
			`https://epub.invalid/${base.split("/").map(encodeURIComponent).join("/")}`,
		);
		return decodeURIComponent(url.pathname.slice(1));
	} catch {
		return clean;
	}
}

export function splitFragment(href: string): [path: string, fragment: string | undefined] {
	const index = href.indexOf("#");
	return index < 0
		? [href, undefined]
		: [href.slice(0, index), decodeURIComponentSafe(href.slice(index + 1))];
}

export function isExternalHref(href: string): boolean {
	return /^[a-z][a-z\d+.-]*:/i.test(href);
}

function decodeURIComponentSafe(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

export function mediaTypeForPath(path: string): string {
	return MEDIA_TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

export function parseXml(text: string, type: DOMParserSupportedType = "application/xml"): Document {
	const Parser = globalThis.DOMParser;
	if (!Parser) throw new Error("DOMParser is not available in this environment.");
	const document = new Parser().parseFromString(text.replace(/^﻿/, ""), type);
	if (type !== "text/html" && document.getElementsByTagName("parsererror").length) {
		// Many books ship HTML entities (&nbsp;) or unclosed tags in "XHTML" files.
		if (type === "application/xhtml+xml")
			return new Parser().parseFromString(text, "text/html");
		throw new Error("The EPUB package document is not well-formed XML.");
	}
	return document;
}

/** Package interpretation and font deobfuscation are performed by the Rust authority. */
export async function openEpub(
	source: EpubSource | EpubArchive,
	options: OpenEpubOptions = {},
): Promise<EpubBook> {
	options.signal?.throwIfAborted();
	const archive = source instanceof EpubArchive ? source : await EpubArchive.from(source);
	options.signal?.throwIfAborted();
	const p = JSON.parse(
		JSON.stringify(archive.bookProjection, (_key, value) =>
			value === null ? undefined : value,
		),
	) as {
		metadata: EpubMetadata;
		manifest: EpubManifestItem[];
		spine: EpubSpineItem[];
		toc: EpubTocItem[];
		layout: EpubLayout;
		direction: EpubDirection;
		coverHref?: string;
		packagePath: string;
	};
	const manifest = new Map(p.manifest.map((item) => [item.id, item]));
	const byPath = new Map(p.manifest.map((item) => [item.href, item]));
	const indexes = new Map(p.spine.map((item) => [item.href, item.index]));
	return {
		archive,
		...p,
		manifest,
		read: (path) => archive.read(path, true),
		readText: (path) => archive.readText(path, true),
		mediaType: (path) =>
			byPath.get(archive.resolve(path) ?? path)?.mediaType ?? mediaTypeForPath(path),
		spineIndex: (path) => indexes.get(archive.resolve(path) ?? path) ?? -1,
	};
}
export { XLINK_NS, OPS_NS };
