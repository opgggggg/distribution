import { EpubArchive, decodeText, type EpubSource } from "./archive.js";

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

export interface OpenEpubOptions { signal?: AbortSignal }

const OPS_NS = "http://www.idpf.org/2007/ops";
const XLINK_NS = "http://www.w3.org/1999/xlink";

const MEDIA_TYPES: Record<string, string> = {
	xhtml: "application/xhtml+xml", xht: "application/xhtml+xml", html: "text/html", htm: "text/html",
	css: "text/css", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
	gif: "image/gif", webp: "image/webp", avif: "image/avif", bmp: "image/bmp", ttf: "font/ttf", otf: "font/otf",
	woff: "font/woff", woff2: "font/woff2", mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "video/mp4",
	webm: "video/webm", ogg: "audio/ogg", ncx: "application/x-dtbncx+xml", js: "text/javascript", xml: "application/xml",
};

/** Resolve `href` against the archive path of the document that contains it. */
export function resolvePath(base: string, href: string): string {
	const clean = href.split("#")[0]!.split("?")[0]!;
	if (!clean) return base;
	try {
		const url = new URL(clean, `https://epub.invalid/${base.split("/").map(encodeURIComponent).join("/")}`);
		return decodeURIComponent(url.pathname.slice(1));
	} catch {
		return clean;
	}
}

export function splitFragment(href: string): [path: string, fragment: string | undefined] {
	const index = href.indexOf("#");
	return index < 0 ? [href, undefined] : [href.slice(0, index), decodeURIComponentSafe(href.slice(index + 1))];
}

export function isExternalHref(href: string): boolean {
	return /^[a-z][a-z\d+.-]*:/i.test(href);
}

function decodeURIComponentSafe(value: string): string {
	try { return decodeURIComponent(value); } catch { return value; }
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
		if (type === "application/xhtml+xml") return new Parser().parseFromString(text, "text/html");
		throw new Error("The EPUB package document is not well-formed XML.");
	}
	return document;
}

function children(parent: ParentNode, localName: string): Element[] {
	return Array.from(parent.children ?? []).filter(element => element.localName === localName);
}

function descendants(parent: Document | Element, localName: string): Element[] {
	return Array.from(parent.getElementsByTagNameNS("*", localName));
}

function text(element: Element | undefined): string | undefined {
	const value = element?.textContent?.replace(/\s+/g, " ").trim();
	return value || undefined;
}

export async function openEpub(source: EpubSource | EpubArchive, options: OpenEpubOptions = {}): Promise<EpubBook> {
	const archive = source instanceof EpubArchive ? source : await EpubArchive.from(source);
	options.signal?.throwIfAborted();
	const container = archive.readText("META-INF/container.xml");
	let packagePath: string | undefined;
	if (container) {
		const rootfile = descendants(parseXml(container), "rootfile")
			.find(element => (element.getAttribute("media-type") ?? "application/oebps-package+xml") === "application/oebps-package+xml");
		packagePath = rootfile?.getAttribute("full-path") ?? undefined;
	}
	packagePath ??= [...archive.entries.keys()].find(name => name.toLowerCase().endsWith(".opf"));
	const packageText = packagePath ? archive.readText(packagePath) : undefined;
	if (!packagePath || !packageText) throw new Error("This EPUB has no package document (OPF).");
	const opf = parseXml(packageText);
	const root = opf.documentElement;

	const metadataElement = descendants(opf, "metadata")[0];
	const meta = (name: string) => metadataElement ? descendants(metadataElement, name) : [];
	const uniqueId = root.getAttribute("unique-identifier");
	const identifiers = meta("identifier");
	const identifier = text(identifiers.find(element => element.getAttribute("id") === uniqueId) ?? identifiers[0]);
	const metaProperty = (property: string) =>
		text(meta("meta").find(element => element.getAttribute("property") === property));
	const metadata: EpubMetadata = {
		title: text(meta("title")[0]) ?? "",
		creators: meta("creator").map(element => text(element)).filter((value): value is string => Boolean(value)),
		language: text(meta("language")[0]),
		publisher: text(meta("publisher")[0]),
		description: text(meta("description")[0])?.replace(/<[^>]+>/g, ""),
		identifier,
		published: text(meta("date")[0]),
	};

	const manifest = new Map<string, EpubManifestItem>();
	const byPath = new Map<string, EpubManifestItem>();
	const manifestElement = descendants(opf, "manifest")[0];
	for (const element of manifestElement ? children(manifestElement, "item") : []) {
		const id = element.getAttribute("id"), href = element.getAttribute("href");
		if (!id || !href) continue;
		const path = resolvePath(packagePath, href);
		const item: EpubManifestItem = {
			id, href: archive.resolve(path) ?? path,
			mediaType: element.getAttribute("media-type") || mediaTypeForPath(path),
			properties: (element.getAttribute("properties") ?? "").split(/\s+/).filter(Boolean),
			fallback: element.getAttribute("fallback") ?? undefined,
		};
		manifest.set(id, item);
		byPath.set(item.href, item);
	}

	const spineElement = descendants(opf, "spine")[0];
	const renderable = (item: EpubManifestItem | undefined): EpubManifestItem | undefined => {
		const seen = new Set<string>();
		while (item && !seen.has(item.id)) {
			if (/x?html|svg\+xml/.test(item.mediaType)) return item;
			seen.add(item.id);
			item = item.fallback ? manifest.get(item.fallback) : undefined;
		}
		return undefined;
	};
	const spine: EpubSpineItem[] = [];
	for (const element of spineElement ? children(spineElement, "itemref") : []) {
		const item = renderable(manifest.get(element.getAttribute("idref") ?? ""));
		if (!item || !archive.has(item.href)) continue;
		spine.push({
			index: spine.length, id: item.id, href: item.href, mediaType: item.mediaType,
			linear: element.getAttribute("linear") !== "no",
			properties: (element.getAttribute("properties") ?? "").split(/\s+/).filter(Boolean),
			size: Math.max(1, archive.size(item.href)),
		});
	}
	if (!spine.length) throw new Error("This EPUB has no readable chapters.");
	const spineByPath = new Map(spine.map(item => [item.href, item.index]));

	const coverId = meta("meta").find(element => element.getAttribute("name") === "cover")?.getAttribute("content");
	const coverItem = [...manifest.values()].find(item => item.properties.includes("cover-image"))
		?? (coverId ? manifest.get(coverId) : undefined)
		?? [...manifest.values()].find(item => /^image\//.test(item.mediaType) && /cover/i.test(item.id + item.href));
	const coverHref = coverItem && /^image\//.test(coverItem.mediaType) ? coverItem.href : undefined;

	const layout: EpubLayout = metaProperty("rendition:layout") === "pre-paginated" ? "pre-paginated" : "reflowable";
	const direction: EpubDirection = spineElement?.getAttribute("page-progression-direction") === "rtl" ? "rtl" : "ltr";

	const deobfuscate = await fontDeobfuscator(archive, identifier);
	const read = (path: string) => {
		const bytes = archive.read(path);
		return bytes && deobfuscate ? deobfuscate(archive.resolve(path)!, bytes) : bytes;
	};

	let tocId = 0;
	const spineIndex = (path: string) => spineByPath.get(archive.resolve(path) ?? path) ?? -1;
	const tocItem = (label: string, base: string, href: string | null | undefined, depth: number): EpubTocItem => {
		let path: string | undefined, fragment: string | undefined;
		if (href && !isExternalHref(href)) {
			const [file, hash] = splitFragment(href);
			path = file ? resolvePath(base, file) : base;
			path = archive.resolve(path) ?? path;
			fragment = hash || undefined;
		}
		const index = path ? spineIndex(path) : -1;
		return { id: `toc-${tocId++}`, label: label || "—", href: path, fragment, index: index >= 0 ? index : undefined, depth, children: [] };
	};

	let toc: EpubTocItem[] = [];
	const navItem = [...manifest.values()].find(item => item.properties.includes("nav"));
	const navText = navItem ? archive.readText(navItem.href) : undefined;
	if (navItem && navText) {
		const nav = parseXml(navText, "application/xhtml+xml");
		const navs = descendants(nav, "nav");
		const tocNav = navs.find(element => (element.getAttributeNS(OPS_NS, "type") ?? element.getAttribute("epub:type") ?? "").split(/\s+/).includes("toc")) ?? navs[0];
		const list = (ol: Element | undefined, depth: number): EpubTocItem[] => ol ? children(ol, "li").map(li => {
			const link = children(li, "a")[0] ?? children(li, "span")[0];
			const item = tocItem(text(link) ?? "", navItem.href, link?.getAttribute("href"), depth);
			item.children = list(children(li, "ol")[0], depth + 1);
			return item;
		}) : [];
		if (tocNav) toc = list(descendants(tocNav, "ol")[0], 0);
	}
	if (!toc.length) {
		const ncxId = spineElement?.getAttribute("toc");
		const ncxItem = (ncxId ? manifest.get(ncxId) : undefined) ?? [...manifest.values()].find(item => item.mediaType === "application/x-dtbncx+xml");
		const ncxText = ncxItem ? archive.readText(ncxItem.href) : undefined;
		if (ncxItem && ncxText) {
			const ncx = parseXml(ncxText);
			const points = (parent: Element | undefined, depth: number): EpubTocItem[] => parent ? children(parent, "navPoint").map(point => {
				const label = text(children(point, "navLabel")[0]);
				const item = tocItem(label ?? "", ncxItem.href, children(point, "content")[0]?.getAttribute("src"), depth);
				item.children = points(point, depth + 1);
				return item;
			}) : [];
			toc = points(descendants(ncx, "navMap")[0], 0);
		}
	}
	if (!toc.length) toc = spine.filter(item => item.linear).map((item, position) =>
		({ id: `toc-${tocId++}`, label: `${position + 1}`, href: item.href, index: item.index, depth: 0, children: [] }));

	return {
		archive, metadata: { ...metadata, title: metadata.title || packagePath.split("/").pop()!.replace(/\.opf$/i, "") },
		manifest, spine, toc, layout, direction, coverHref, packagePath,
		read,
		readText(path) { const bytes = read(path); return bytes ? decodeText(bytes) : undefined; },
		mediaType(path) { return byPath.get(archive.resolve(path) ?? path)?.mediaType ?? mediaTypeForPath(path); },
		spineIndex,
	};
}

/** IDPF and Adobe font obfuscation (META-INF/encryption.xml), so embedded fonts render. */
async function fontDeobfuscator(archive: EpubArchive, identifier: string | undefined) {
	const encryption = archive.readText("META-INF/encryption.xml");
	if (!encryption || !identifier) return undefined;
	const document = parseXml(encryption);
	const fonts = new Map<string, "idpf" | "adobe">();
	for (const data of descendants(document, "EncryptedData")) {
		const algorithm = descendants(data, "EncryptionMethod")[0]?.getAttribute("Algorithm");
		const uri = descendants(data, "CipherReference")[0]?.getAttribute("URI");
		if (!uri) continue;
		const path = archive.resolve(decodeURIComponentSafe(uri));
		if (!path) continue;
		if (algorithm === "http://www.idpf.org/2008/embedding") fonts.set(path, "idpf");
		else if (algorithm === "http://ns.adobe.com/pdf/enc#RC") fonts.set(path, "adobe");
	}
	if (!fonts.size) return undefined;
	let idpfKey: Uint8Array | undefined;
	if ([...fonts.values()].includes("idpf") && globalThis.crypto?.subtle) {
		const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(identifier.replace(/[ \u0009\u000d\u000a]/g, "")));
		idpfKey = new Uint8Array(digest);
	}
	const hex = identifier.replace(/^urn:uuid:/i, "").replace(/[^0-9a-f]/gi, "");
	const adobeKey = hex.length === 32 ? Uint8Array.from(hex.match(/../g)!.map(byte => parseInt(byte, 16))) : undefined;
	return (path: string, bytes: Uint8Array): Uint8Array => {
		const method = fonts.get(path);
		const key = method === "idpf" ? idpfKey : method === "adobe" ? adobeKey : undefined;
		if (!key) return bytes;
		const output = bytes.slice();
		const length = Math.min(output.length, method === "idpf" ? 1040 : 1024);
		for (let index = 0; index < length; index++) output[index]! ^= key[index % key.length]!;
		return output;
	};
}

export { XLINK_NS, OPS_NS };
