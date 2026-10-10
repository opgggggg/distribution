import { isExternalHref, parseXml, resolvePath, XLINK_NS, type EpubBook, type EpubSpineItem } from "./book.js";

/**
 * Turns archive resources into object URLs. Stylesheets are inlined instead:
 * hosts run with a strict CSP (`style-src 'self' 'unsafe-inline'`) that a
 * `blob:` stylesheet link would violate, while images and fonts may use blobs.
 */
export class EpubResources {
	private readonly urls = new Map<string, string>();
	private readonly css = new Map<string, string>();
	constructor(private readonly book: EpubBook) {}

	url(path: string): string | undefined {
		const name = this.book.archive.resolve(path);
		if (!name) return undefined;
		let url = this.urls.get(name);
		if (!url) {
			const bytes = this.book.read(name);
			if (!bytes) return undefined;
			url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: this.book.mediaType(name) }));
			this.urls.set(name, url);
		}
		return url;
	}

	stylesheet(path: string, seen = new Set<string>()): string {
		const name = this.book.archive.resolve(path) ?? path;
		const cached = this.css.get(name);
		if (cached !== undefined) return cached;
		if (seen.has(name)) return "";
		seen.add(name);
		const source = this.book.readText(name);
		const result = source === undefined ? "" : this.rewriteCss(source, name, seen);
		this.css.set(name, result);
		return result;
	}

	rewriteCss(css: string, base: string, seen = new Set<string>()): string {
		return css
			.replace(/@import\s+(?:url\(\s*)?(['"]?)([^'")\s;]+)\1\s*\)?([^;]*);/gi, (_, __, href: string) =>
				isExternalHref(href) ? "" : this.stylesheet(resolvePath(base, href), seen))
			.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, _quote: string, href: string) => {
				if (isExternalHref(href) || href.startsWith("#")) return /^(data|blob):/i.test(href) ? match : "none";
				const url = this.url(resolvePath(base, href));
				return url ? `url("${url}")` : "none";
			});
	}

	dispose(): void {
		for (const url of this.urls.values()) URL.revokeObjectURL(url);
		this.urls.clear();
		this.css.clear();
	}
}

const URL_ATTRIBUTES: ReadonlyArray<[selector: string, attribute: string]> = [
	["img", "src"], ["video", "src"], ["video", "poster"], ["audio", "src"], ["source", "src"], ["track", "src"],
	["input", "src"], ["object", "data"], ["embed", "src"], ["iframe", "src"],
];

/** Parse a spine document, strip active content, and point every resource at `resources`. */
export function prepareChapter(book: EpubBook, item: EpubSpineItem, resources?: EpubResources): Document {
	const source = book.readText(item.href) ?? "";
	let document: Document;
	if (/svg/.test(item.mediaType)) {
		document = parseXml(`<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body></body></html>`, "application/xhtml+xml");
		const svg = parseXml(source, "image/svg+xml").documentElement;
		document.body.append(document.importNode(svg, true));
	} else {
		document = parseXml(source, /x?html\+xml|xml/.test(item.mediaType) ? "application/xhtml+xml" : "text/html");
	}
	if (!document.body) {
		const body = document.createElementNS("http://www.w3.org/1999/xhtml", "body");
		document.documentElement.append(body);
	}
	sanitize(document);
	if (resources) resolveResources(document, item.href, resources);
	return document;
}

function sanitize(document: Document): void {
	for (const element of Array.from(document.querySelectorAll("script, base, meta[http-equiv], form button[type=submit]"))) element.remove();
	const walker = document.createTreeWalker(document.documentElement, 1 /* SHOW_ELEMENT */);
	for (let node = walker.currentNode as Element | null; node; node = walker.nextNode() as Element | null) {
		for (const attribute of Array.from(node.attributes)) {
			const name = attribute.name.toLowerCase();
			if (name.startsWith("on")) node.removeAttribute(attribute.name);
			else if (/^\s*javascript:/i.test(attribute.value)) node.removeAttribute(attribute.name);
		}
	}
}

function resolveResources(document: Document, base: string, resources: EpubResources): void {
	for (const [tag, attribute] of URL_ATTRIBUTES) {
		for (const element of Array.from(document.getElementsByTagNameNS("*", tag))) {
			const value = element.getAttribute(attribute);
			if (!value || /^(data|blob):/i.test(value)) continue;
			const url = isExternalHref(value) ? undefined : resources.url(resolvePath(base, value));
			if (url) element.setAttribute(attribute, url);
			else element.removeAttribute(attribute);
		}
	}
	for (const element of Array.from(document.getElementsByTagNameNS("*", "image"))) {
		const value = element.getAttributeNS(XLINK_NS, "href") ?? element.getAttribute("href");
		if (!value || isExternalHref(value)) continue;
		const url = resources.url(resolvePath(base, value));
		if (!url) continue;
		if (element.hasAttributeNS(XLINK_NS, "href")) element.setAttributeNS(XLINK_NS, "xlink:href", url);
		else element.setAttribute("href", url);
	}
	for (const link of Array.from(document.getElementsByTagNameNS("*", "link"))) {
		const rel = (link.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
		const href = link.getAttribute("href");
		if (rel.includes("stylesheet") && href && !isExternalHref(href) && !rel.includes("alternate")) {
			const style = document.createElementNS("http://www.w3.org/1999/xhtml", "style");
			style.textContent = resources.stylesheet(resolvePath(base, href));
			const media = link.getAttribute("media");
			if (media) style.setAttribute("media", media);
			link.replaceWith(style);
		} else link.remove();
	}
	for (const style of Array.from(document.getElementsByTagNameNS("*", "style"))) {
		if (style.textContent) style.textContent = resources.rewriteCss(style.textContent, base);
	}
	for (const element of Array.from(document.querySelectorAll("[style]"))) {
		const value = element.getAttribute("style")!;
		if (/url\(/i.test(value)) element.setAttribute("style", resources.rewriteCss(value, base));
	}
}

/* ------------------------------------------------------------------ search */

export interface EpubSearchResult {
	index: number;
	/** n-th match of the query inside the chapter's text, used to locate it again. */
	occurrence: number;
	before: string;
	match: string;
	after: string;
}

export interface EpubSearchOptions {
	signal?: AbortSignal;
	limit?: number;
	onProgress?(done: number, total: number): void;
}

/** Text nodes in document order: the shared coordinate space for search and anchors. */
export function textNodes(root: Node): Text[] {
	const nodes: Text[] = [];
	const walker = (root.ownerDocument ?? (root as Document)).createTreeWalker(root, 4 /* SHOW_TEXT */);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const parent = node.parentElement?.localName;
		if (parent !== "style" && parent !== "title") nodes.push(node as Text);
	}
	return nodes;
}

export function normalizeForSearch(value: string): string {
	return value.toLocaleLowerCase();
}

export async function* searchBook(book: EpubBook, query: string, options: EpubSearchOptions = {}): AsyncGenerator<EpubSearchResult> {
	const needle = normalizeForSearch(query.trim());
	if (!needle) return;
	const limit = options.limit ?? 500;
	let found = 0;
	for (const item of book.spine) {
		options.signal?.throwIfAborted();
		const body = prepareChapter(book, item).body;
		const content = textNodes(body).map(node => node.data).join("");
		const haystack = normalizeForSearch(content);
		let occurrence = 0;
		for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + needle.length)) {
			yield {
				index: item.index, occurrence: occurrence++,
				before: content.slice(Math.max(0, at - 32), at).replace(/\s+/g, " ").trimStart(),
				match: content.slice(at, at + needle.length),
				after: content.slice(at + needle.length, at + needle.length + 48).replace(/\s+/g, " ").trimEnd(),
			};
			if (++found >= limit) return;
		}
		options.onProgress?.(item.index + 1, book.spine.length);
		// Yield to the event loop so typing and page turns stay responsive.
		await new Promise(resolve => setTimeout(resolve, 0));
	}
}

/** Locate the `occurrence`-th match of `query` in a rendered chapter. */
export function findOccurrence(root: Node, query: string, occurrence: number): Range | undefined {
	const nodes = textNodes(root);
	const needle = normalizeForSearch(query.trim());
	if (!needle) return undefined;
	const haystack = normalizeForSearch(nodes.map(node => node.data).join(""));
	let at = -1;
	for (let count = 0; count <= occurrence; count++) {
		at = haystack.indexOf(needle, at < 0 ? 0 : at + needle.length);
		if (at < 0) return undefined;
	}
	return rangeFromOffsets(nodes, at, at + needle.length);
}

function rangeFromOffsets(nodes: Text[], start: number, end: number): Range | undefined {
	let position = 0;
	let range: Range | undefined;
	for (const node of nodes) {
		const next = position + node.data.length;
		if (!range && start < next) {
			range = node.ownerDocument.createRange();
			range.setStart(node, start - position);
		}
		if (range && end <= next) {
			range.setEnd(node, end - position);
			return range;
		}
		position = next;
	}
	return undefined;
}

/* ----------------------------------------------------------------- anchors */

/** "3/0/2:17" — child indexes from <body> to a text node, then a character offset. */
export function serializePoint(root: Node, node: Node, offset: number): string | undefined {
	const path: number[] = [];
	for (let current: Node | null = node; current && current !== root; current = current.parentNode) {
		const parent: Node | null = current.parentNode;
		if (!parent) return undefined;
		path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
	}
	return `${path.join("/")}:${offset}`;
}

export function resolvePoint(root: Node, point: string): { node: Node; offset: number } | undefined {
	const [path, offsetText] = point.split(":");
	let node: Node | undefined = root;
	for (const step of (path ?? "").split("/").filter(Boolean)) {
		node = node?.childNodes[Number(step)];
		if (!node) return undefined;
	}
	const length = node.nodeType === 3 ? (node as Text).data.length : node.childNodes.length;
	return { node, offset: Math.min(Number(offsetText) || 0, length) };
}

export function serializeRange(root: Node, range: Range): { start: string; end: string } | undefined {
	const start = serializePoint(root, range.startContainer, range.startOffset);
	const end = serializePoint(root, range.endContainer, range.endOffset);
	return start && end ? { start, end } : undefined;
}

export function resolveRange(root: Node, start: string, end: string): Range | undefined {
	const from = resolvePoint(root, start), to = resolvePoint(root, end);
	if (!from || !to) return undefined;
	try {
		const range = (root.ownerDocument ?? (root as Document)).createRange();
		range.setStart(from.node, from.offset);
		range.setEnd(to.node, to.offset);
		return range;
	} catch {
		return undefined;
	}
}
