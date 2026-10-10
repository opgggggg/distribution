import { isExternalHref, OPS_NS, resolvePath, splitFragment, type EpubBook, type EpubSpineItem } from "./book.js";
import { EpubResources, findOccurrence, prepareChapter, resolvePoint, resolveRange, serializePoint, serializeRange, textNodes } from "./content.js";

export type EpubFlow = "paginated" | "scrolled";
export type EpubSpread = "auto" | "single" | "double";

export interface EpubViewTheme {
	background: string;
	color: string;
	link: string;
	dark: boolean;
}

export interface EpubViewSettings {
	flow: EpubFlow;
	spread: EpubSpread;
	fontSize: number;
	lineHeight: number;
	/** CSS font stack, or "" to keep the publisher's fonts. */
	fontFamily: string;
	/** Side margin as a fraction of the page width. */
	margin: number;
	justify: boolean;
	/** When false, colours, fonts and spacing of the book's own CSS yield to the reader. */
	publisherStyles: boolean;
	theme: EpubViewTheme;
	animate: boolean;
	/** Space reserved above and below the text for the running header and footer. */
	insetTop: number;
	insetBottom: number;
}

export const DEFAULT_VIEW_SETTINGS: EpubViewSettings = {
	flow: "paginated", spread: "auto", fontSize: 18, lineHeight: 1.7, fontFamily: "", margin: 0.07,
	justify: true, publisherStyles: true, animate: true, insetTop: 44, insetBottom: 44,
	theme: { background: "#ffffff", color: "#1f1f1f", link: "#2563eb", dark: false },
};

export interface EpubViewTarget {
	index: number;
	/** Saved anchor from `EpubViewLocation.point`. */
	point?: string;
	/** Chapter fraction, the fallback when an anchor no longer resolves. */
	fraction?: number;
	fragment?: string;
	search?: { query: string; occurrence: number };
	range?: { start: string; end: string };
	atEnd?: boolean;
}

export interface EpubViewLocation {
	index: number;
	page: number;
	pages: number;
	/** 0–1 progress inside the chapter, counting the page on screen as read. */
	chapterFraction: number;
	/** 0–1 progress through the book, weighted by chapter size. */
	totalFraction: number;
	point?: string;
	atStart: boolean;
	atEnd: boolean;
	fixed: boolean;
}

export interface EpubViewAnnotation {
	id: string;
	index: number;
	start: string;
	end: string;
	color: string;
	note?: string;
}

export interface EpubViewSelection {
	index: number;
	text: string;
	start: string;
	end: string;
	/** Selection bounds relative to the host element. */
	rect: { left: number; top: number; right: number; bottom: number };
}

export interface EpubViewEvents {
	relocate?(location: EpubViewLocation): void;
	tap?(zone: "prev" | "next" | "menu"): void;
	selection?(selection: EpubViewSelection | null): void;
	annotation?(id: string, rect: EpubViewSelection["rect"]): void;
	footnote?(note: { text: string; rect: EpubViewSelection["rect"]; target: EpubViewTarget }): void;
	external?(href: string): void;
	key?(event: KeyboardEvent): void;
	loading?(loading: boolean): void;
	error?(reason: unknown): void;
}

export const HIGHLIGHT_COLORS: Record<string, string> = {
	yellow: "rgba(255, 213, 0, 0.38)",
	green: "rgba(74, 200, 110, 0.32)",
	blue: "rgba(80, 160, 255, 0.32)",
	pink: "rgba(255, 92, 160, 0.30)",
	underline: "transparent",
};

interface ChapterFrame {
	frame: HTMLIFrameElement;
	index: number;
	document: Document;
	window: Window;
	cleanup: Array<() => void>;
	ranges: Map<string, Range>;
}

const STYLE_ID = "cubexp-epub-reader-style";
const linearIndexes = (book: EpubBook) => book.spine.filter(item => item.linear).map(item => item.index);

/**
 * Renders one spine document at a time into an iframe. Reflowable chapters are
 * laid out as CSS columns that are exactly one page wide; the iframe is widened
 * to hold every column and translated to show the current page, which keeps
 * the book's layout untouched by page turns.
 */
export class EpubView {
	readonly book: EpubBook;
	private readonly host: HTMLElement;
	private readonly viewport: HTMLDivElement;
	private readonly resources: EpubResources;
	private readonly events: EpubViewEvents;
	private settings: EpubViewSettings;
	private current: ChapterFrame[] = [];
	private page = 0;
	private pages = 1;
	private width = 0;
	private height = 0;
	private columns = 1;
	private annotations: EpubViewAnnotation[] = [];
	private searchRange: Range | undefined;
	private observer: ResizeObserver | undefined;
	private resizeTimer: ReturnType<typeof setTimeout> | undefined;
	private selectionTimer: ReturnType<typeof setTimeout> | undefined;
	private generation = 0;
	private destroyed = false;
	private readonly prefix: number[];
	private readonly total: number;
	private readonly linear: number[];
	private wheelAccumulator = 0;
	private wheelLock = 0;

	constructor(host: HTMLElement, book: EpubBook, events: EpubViewEvents = {}, settings: Partial<EpubViewSettings> = {}) {
		this.host = host;
		this.book = book;
		this.events = events;
		this.settings = { ...DEFAULT_VIEW_SETTINGS, ...settings, theme: { ...DEFAULT_VIEW_SETTINGS.theme, ...settings.theme } };
		this.resources = new EpubResources(book);
		this.viewport = host.ownerDocument.createElement("div");
		this.viewport.className = "cubexp-epub-viewport";
		this.viewport.dataset.flow = this.settings.flow;
		host.append(this.viewport);
		this.prefix = [];
		let sum = 0;
		for (const item of book.spine) { this.prefix.push(sum); sum += item.linear ? item.size : 0; }
		this.total = Math.max(1, sum);
		this.linear = linearIndexes(book);
		if (!this.linear.length) this.linear = book.spine.map(item => item.index);
		const ResizeObserverImpl = host.ownerDocument.defaultView?.ResizeObserver;
		if (ResizeObserverImpl) {
			this.observer = new ResizeObserverImpl(() => {
				clearTimeout(this.resizeTimer);
				this.resizeTimer = setTimeout(() => void this.refresh(), 120);
			});
			this.observer.observe(host);
		}
		this.viewport.addEventListener("scroll", this.onScroll, { passive: true });
		this.viewport.addEventListener("wheel", this.onWheel, { passive: false });
	}

	get fixed(): boolean { return this.book.layout === "pre-paginated"; }

	get index(): number { return this.current[0]?.index ?? -1; }

	/** Frames on screen, for hosts that need to reach into the rendered chapter. */
	get documents(): Document[] { return this.current.map(chapter => chapter.document); }

	location(): EpubViewLocation | undefined {
		const chapter = this.current[0];
		if (!chapter) return undefined;
		const item = this.book.spine[chapter.index]!;
		const last = this.current.at(-1)!.index;
		let chapterFraction: number;
		if (this.fixed) chapterFraction = 1;
		else if (this.settings.flow === "scrolled") {
			const range = Math.max(1, this.viewport.scrollHeight - this.viewport.clientHeight);
			chapterFraction = this.viewport.scrollHeight <= this.viewport.clientHeight + 1 ? 1 : Math.min(1, this.viewport.scrollTop / range);
		} else chapterFraction = (this.page + 1) / this.pages;
		const lastItem = this.book.spine[last]!;
		const totalFraction = this.fixed
			? (this.linear.indexOf(last) + 1) / this.linear.length
			: Math.min(1, ((this.prefix[item.index] ?? 0) + (item.linear ? item.size : 0) * chapterFraction) / this.total);
		const position = this.linear.indexOf(chapter.index);
		return {
			index: chapter.index,
			page: this.fixed ? 0 : this.page,
			pages: this.fixed ? 1 : this.pages,
			chapterFraction, totalFraction,
			point: this.fixed ? undefined : this.capturePoint(),
			atStart: position <= 0 && (this.fixed || this.settings.flow === "scrolled" ? this.viewport.scrollTop <= 1 : this.page === 0),
			atEnd: this.linear.indexOf(lastItem.index) >= this.linear.length - 1 && chapterFraction >= 0.999,
			fixed: this.fixed,
		};
	}

	/** Book fraction (0–1) → chapter and chapter fraction, for the progress slider. */
	targetForFraction(fraction: number): EpubViewTarget {
		if (this.fixed) {
			const position = Math.min(this.linear.length - 1, Math.max(0, Math.round(fraction * (this.linear.length - 1))));
			return { index: this.linear[position]! };
		}
		const goal = Math.min(1, Math.max(0, fraction)) * this.total;
		for (const index of this.linear) {
			const item = this.book.spine[index]!;
			const start = this.prefix[index]!;
			if (goal <= start + item.size || index === this.linear.at(-1)) {
				return { index, fraction: Math.min(0.999, Math.max(0, (goal - start) / item.size)) };
			}
		}
		return { index: this.linear[0]! };
	}

	/** Book fraction at which each chapter starts, for ticks on the slider. */
	chapterStart(index: number): number {
		return this.fixed ? Math.max(0, this.linear.indexOf(index)) / Math.max(1, this.linear.length - 1) : (this.prefix[index] ?? 0) / this.total;
	}

	async display(target: EpubViewTarget): Promise<void> {
		const index = Math.min(this.book.spine.length - 1, Math.max(0, target.index));
		const id = ++this.generation;
		this.events.loading?.(true);
		try {
			const needsLoad = this.fixed
				? !this.spreadFor(index).every((value, position) => this.current[position]?.index === value) || this.current.length !== this.spreadFor(index).length
				: this.current[0]?.index !== index;
			if (needsLoad) {
				const frames = await this.load(this.fixed ? this.spreadFor(index) : [index], id);
				if (!frames) return;
			}
			if (id !== this.generation) return;
			if (!this.fixed) this.go(target);
			this.applyAnnotations();
			this.emitRelocate();
		} catch (reason) {
			if (id === this.generation) this.events.error?.(reason);
		} finally {
			if (id === this.generation) this.events.loading?.(false);
		}
	}

	async next(): Promise<void> {
		if (!this.current.length) return;
		if (this.fixed) return this.stepSpine(1);
		if (this.settings.flow === "scrolled") {
			const { scrollTop, scrollHeight, clientHeight } = this.viewport;
			if (scrollTop + clientHeight < scrollHeight - 2) {
				this.viewport.scrollBy({ top: clientHeight * 0.9, behavior: this.settings.animate ? "smooth" : "auto" });
				return;
			}
			return this.stepSpine(1);
		}
		if (this.page < this.pages - 1) { this.turnTo(this.page + 1); return; }
		return this.stepSpine(1);
	}

	async prev(): Promise<void> {
		if (!this.current.length) return;
		if (this.fixed) return this.stepSpine(-1);
		if (this.settings.flow === "scrolled") {
			if (this.viewport.scrollTop > 1) {
				this.viewport.scrollBy({ top: -this.viewport.clientHeight * 0.9, behavior: this.settings.animate ? "smooth" : "auto" });
				return;
			}
			return this.stepSpine(-1, true);
		}
		if (this.page > 0) { this.turnTo(this.page - 1); return; }
		return this.stepSpine(-1, true);
	}

	async nextChapter(): Promise<void> { return this.stepSpine(1); }
	async prevChapter(): Promise<void> { return this.stepSpine(-1); }

	private async stepSpine(direction: 1 | -1, atEnd = false): Promise<void> {
		const indexes = this.current.map(chapter => chapter.index);
		const edge = direction > 0 ? Math.max(...indexes) : Math.min(...indexes);
		const position = this.linear.indexOf(edge);
		let target = position < 0 ? this.linear.find(index => direction > 0 ? index > edge : index < edge) : this.linear[position + direction];
		if (position < 0 && direction < 0) target = [...this.linear].reverse().find(index => index < edge);
		if (target === undefined) { this.bounce(direction); return; }
		await this.display({ index: target, atEnd });
	}

	private bounce(direction: 1 | -1): void {
		const frame = this.current[0]?.frame;
		if (!frame || this.fixed || !this.settings.animate) return;
		const base = -this.page * this.width;
		frame.style.transition = "transform 120ms ease-out";
		frame.style.transform = `translate3d(${base - direction * 24}px,0,0)`;
		setTimeout(() => { frame.style.transform = `translate3d(${base}px,0,0)`; }, 120);
	}

	updateSettings(settings: Partial<EpubViewSettings>): void {
		const previous = this.settings;
		this.settings = { ...previous, ...settings, theme: { ...previous.theme, ...settings.theme } };
		this.viewport.dataset.flow = this.settings.flow;
		if (!this.current.length || this.fixed) {
			for (const chapter of this.current) this.injectStyle(chapter);
			if (this.fixed) this.layoutFixed();
			return;
		}
		const point = this.capturePoint();
		const fraction = this.location()?.chapterFraction;
		for (const chapter of this.current) this.injectStyle(chapter);
		this.layout();
		this.go({ index: this.index, point, fraction: fraction !== undefined ? Math.max(0, fraction - 1 / Math.max(1, this.pages)) : 0 }, false);
		this.applyAnnotations();
		this.emitRelocate();
	}

	setAnnotations(annotations: readonly EpubViewAnnotation[]): void {
		this.annotations = [...annotations];
		this.applyAnnotations();
	}

	/** Mark the active search hit, or clear it. */
	setSearchHit(range: Range | undefined): void {
		this.searchRange = range;
		this.applyAnnotations();
	}

	clearSelection(): void {
		for (const chapter of this.current) chapter.window.getSelection()?.removeAllRanges();
	}

	focus(): void { this.current[0]?.window.focus(); }

	/** Whether a saved anchor of the loaded chapter is on the page currently shown. */
	isVisible(index: number, point: string | undefined): boolean {
		const chapter = this.current.find(candidate => candidate.index === index);
		if (!chapter) return false;
		if (this.fixed || !point) return true;
		const resolved = resolvePoint(chapter.document.body, point);
		if (!resolved) return false;
		const rect = firstRect(rangeAt(chapter.document, resolved.node, resolved.offset));
		return rect ? this.onScreen(rect) : false;
	}

	/** A short run of text starting at `point` (or at the top of the current page). */
	excerpt(point = this.capturePoint(), length = 60): string {
		const chapter = this.current[0];
		if (!chapter) return "";
		const nodes = textNodes(chapter.document.body);
		const resolved = point ? resolvePoint(chapter.document.body, point) : undefined;
		let start = resolved ? nodes.indexOf(resolved.node as Text) : 0;
		if (start < 0) start = 0;
		let text = resolved && resolved.node.nodeType === 3 ? (resolved.node as Text).data.slice(resolved.offset) : "";
		for (let index = start + (text ? 1 : 0); index < nodes.length && text.replace(/\s+/g, " ").trim().length < length; index++) text += nodes[index]!.data;
		const clean = text.replace(/\s+/g, " ").trim();
		return clean.length > length ? `${clean.slice(0, length)}…` : clean;
	}

	async refresh(): Promise<void> {
		if (!this.current.length || this.destroyed) return;
		const { width, height } = this.measureHost();
		if (width === this.width && height === this.height) return;
		if (this.fixed) { this.layoutFixed(); this.emitRelocate(); return; }
		const point = this.capturePoint();
		const fraction = this.location()?.chapterFraction;
		for (const chapter of this.current) this.injectStyle(chapter);
		this.layout();
		this.go({ index: this.index, point, fraction: fraction !== undefined ? Math.max(0, fraction - 1 / Math.max(1, this.pages)) : 0 }, false);
		this.emitRelocate();
	}

	destroy(): void {
		this.destroyed = true;
		this.generation++;
		clearTimeout(this.resizeTimer);
		clearTimeout(this.selectionTimer);
		this.observer?.disconnect();
		this.viewport.removeEventListener("scroll", this.onScroll);
		this.viewport.removeEventListener("wheel", this.onWheel);
		for (const chapter of this.current) this.disposeChapter(chapter);
		this.current = [];
		this.viewport.remove();
		this.resources.dispose();
	}

	/* ------------------------------------------------------------- loading */

	private spreadFor(index: number): number[] {
		if (!this.fixed || !this.useSpread()) return [index];
		// Covers stand alone; then pages pair up as facing spreads.
		const position = this.linear.indexOf(index);
		if (position <= 0) return [index];
		const first = position % 2 === 1 ? position : position - 1;
		return [this.linear[first], this.linear[first + 1]].filter((value): value is number => value !== undefined);
	}

	private useSpread(): boolean {
		const { width, height } = this.measureHost();
		if (this.settings.spread === "single") return false;
		if (this.settings.spread === "double") return width >= 560;
		return width >= 900 && width / Math.max(1, height) >= 1.15;
	}

	private measureHost() {
		return { width: Math.floor(this.host.clientWidth), height: Math.floor(this.host.clientHeight) };
	}

	private async load(indexes: number[], id: number): Promise<ChapterFrame[] | undefined> {
		const chapters = await Promise.all(indexes.map(index => this.createChapter(this.book.spine[index]!)));
		if (id !== this.generation || this.destroyed) { chapters.forEach(chapter => this.disposeChapter(chapter)); return undefined; }
		const previous = this.current;
		this.current = chapters;
		this.page = 0;
		this.viewport.scrollTop = 0;
		if (this.fixed) this.layoutFixed(); else this.layout();
		for (const chapter of chapters) {
			chapter.frame.style.visibility = "";
			if (this.settings.animate && previous.length) chapter.frame.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
		}
		previous.forEach(chapter => this.disposeChapter(chapter));
		return chapters;
	}

	private async createChapter(item: EpubSpineItem): Promise<ChapterFrame> {
		const prepared = prepareChapter(this.book, item, this.resources);
		const frame = this.host.ownerDocument.createElement("iframe");
		frame.className = "cubexp-epub-frame";
		// Book scripts are stripped in prepareChapter. allow-scripts is still needed:
		// WebKit does not deliver the host's event listeners into a frame without it.
		frame.setAttribute("sandbox", "allow-same-origin allow-scripts");
		frame.setAttribute("title", this.book.metadata.title);
		frame.setAttribute("scrolling", "no");
		frame.style.visibility = "hidden";
		// Fill the frame only after its own navigation: content written into the
		// initial about:blank document is replaced when that navigation commits.
		await new Promise<void>(resolve => {
			frame.addEventListener("load", () => resolve(), { once: true });
			frame.srcdoc = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body></body></html>";
			this.viewport.append(frame);
		});
		const document = frame.contentDocument!;
		const window = frame.contentWindow!;
		const root = prepared.documentElement;
		for (const attribute of ["lang", "dir", "class"]) {
			const value = root.getAttribute(attribute);
			if (value) document.documentElement.setAttribute(attribute, value);
		}
		const lang = root.getAttribute("xml:lang") ?? root.getAttributeNS("http://www.w3.org/XML/1998/namespace", "lang");
		if (lang && !document.documentElement.lang) document.documentElement.lang = lang;
		if (!document.documentElement.lang && this.book.metadata.language) document.documentElement.lang = this.book.metadata.language;
		for (const node of Array.from(prepared.head?.children ?? [])) {
			if (node.localName === "style" || (node.localName === "meta" && node.getAttribute("name") === "viewport")) {
				document.head.append(document.importNode(node, true));
			}
		}
		document.body.replaceWith(document.importNode(prepared.body, true));
		const chapter: ChapterFrame = { frame, index: item.index, document, window, cleanup: [], ranges: new Map() };
		this.injectStyle(chapter);
		this.attach(chapter);
		await this.settle(chapter);
		return chapter;
	}

	/** Wait for images and web fonts, which change the page count once they arrive. */
	private async settle(chapter: ChapterFrame): Promise<void> {
		const images = Array.from(chapter.document.images).filter(image => !image.complete);
		const timeout = new Promise(resolve => setTimeout(resolve, 2500));
		await Promise.race([
			Promise.all([
				...images.map(image => image.decode().catch(() => undefined)),
				chapter.document.fonts?.ready.catch(() => undefined),
			]),
			timeout,
		]);
	}

	private disposeChapter(chapter: ChapterFrame): void {
		for (const cleanup of chapter.cleanup) cleanup();
		chapter.frame.remove();
	}

	/* -------------------------------------------------------------- layout */

	private injectStyle(chapter: ChapterFrame): void {
		let style = chapter.document.getElementById(STYLE_ID) as HTMLStyleElement | null;
		if (!style) {
			style = chapter.document.createElement("style");
			style.id = STYLE_ID;
		}
		// Last in <head>, so its !important rules win over the book's own.
		chapter.document.head.append(style);
		style.textContent = this.fixed ? this.fixedCss() : this.reflowCss();
	}

	private metrics() {
		const { width, height } = this.measureHost();
		const columns = this.settings.flow === "paginated" ? this.columnCount(width, height) : 1;
		const pageWidth = width / columns;
		let side = Math.round(Math.min(96, Math.max(16, pageWidth * this.settings.margin)));
		const maxLine = this.settings.fontSize * 38;
		if (columns === 1 && width - side * 2 > maxLine) side = Math.round((width - maxLine) / 2);
		const top = this.settings.insetTop, bottom = this.settings.insetBottom;
		return { width, height, columns, side, gap: side * 2, top, bottom, contentHeight: Math.max(120, height - top - bottom) };
	}

	private columnCount(width: number, height: number): number {
		if (this.settings.spread === "single") return 1;
		if (this.settings.spread === "double") return width >= 560 ? 2 : 1;
		return width >= 900 && width / Math.max(1, height) >= 1.15 ? 2 : 1;
	}

	private reflowCss(): string {
		const s = this.settings, m = this.metrics();
		const paginated = s.flow === "paginated";
		const override = !s.publisherStyles;
		const recolor = override || s.theme.dark || s.theme.background.toLowerCase() !== "#ffffff";
		const font = s.fontFamily ? `font-family: ${s.fontFamily} !important;` : "";
		return `
html {
	color-scheme: ${s.theme.dark ? "dark" : "light"};
	-webkit-text-size-adjust: 100%; text-size-adjust: 100%;
	font-size: ${s.fontSize}px !important;
	color: ${s.theme.color} !important;
	background: transparent !important;
	margin: 0 !important;
	box-sizing: border-box !important;
	width: ${m.width}px !important; max-width: none !important; min-width: 0 !important;
	padding: ${m.top}px ${m.side}px ${paginated ? m.bottom : m.bottom + 88}px !important;
	-webkit-tap-highlight-color: transparent;
	${paginated ? `
	height: ${m.height}px !important; max-height: none !important; min-height: 0 !important;
	column-count: ${m.columns} !important; column-gap: ${m.gap}px !important; column-fill: auto !important;
	overflow: hidden !important;` : `
	height: auto !important; min-height: 0 !important; columns: auto !important; overflow: hidden !important;`}
}
body {
	margin: 0 !important; padding: 0 !important; border: 0 !important;
	width: auto !important; max-width: none !important; height: auto !important; min-height: 0 !important;
	columns: auto !important; background: transparent !important;
	color: inherit; overflow: visible !important;
	${override ? `font-size: 1rem !important; line-height: ${s.lineHeight} !important;` : `line-height: ${s.lineHeight};`}
	${font}
	overflow-wrap: break-word;
}
p, li, blockquote, dd, dt, div, td, th, figcaption, aside { line-height: ${s.lineHeight} !important; }
h1, h2, h3, h4, h5, h6 { line-height: 1.35 !important; break-after: avoid; }
${font ? `body :not(code):not(pre):not(kbd):not(samp):not(tt):not(svg):not(svg *) { ${font} }` : ""}
${/* Plain specificity: beats the book's bare \`p\` rules (this sheet comes last) but not its
	   classes or inline styles, so centred captions and right-aligned signatures survive. */ ""}
${s.justify ? `p, li, blockquote, dd { text-align: justify; hyphens: auto; -webkit-hyphens: auto; }` : ""}
${recolor ? `
body *:not(a):not(svg):not(svg *):not(img) { color: inherit !important; background-color: transparent !important; }
body *:not(svg *) { border-color: color-mix(in srgb, currentColor 30%, transparent) !important; }` : ""}
a, a * { color: ${s.theme.link} !important; text-decoration-color: color-mix(in srgb, currentColor 40%, transparent); }
img, video, object, canvas {
	max-width: 100% !important; max-height: ${paginated ? `${m.contentHeight}px` : "none"} !important;
	height: auto; object-fit: contain; box-sizing: border-box !important;
	break-inside: avoid; page-break-inside: avoid;
}
svg { max-width: 100% !important; ${paginated ? `max-height: ${m.contentHeight}px !important;` : ""} break-inside: avoid; }
${s.theme.dark ? "img { filter: brightness(0.88); }" : ""}
pre, code { white-space: pre-wrap !important; overflow-wrap: anywhere; }
table { max-width: 100% !important; }
::selection { background: ${s.theme.dark ? "rgba(120, 170, 255, 0.4)" : "rgba(37, 99, 235, 0.22)"}; }
${Object.entries(HIGHLIGHT_COLORS).map(([name, color]) => name === "underline"
		? `::highlight(cubexp-hl-${name}) { text-decoration: underline 2px ${s.theme.dark ? "#f97316" : "#ea580c"}; text-underline-offset: 3px; }`
		: `::highlight(cubexp-hl-${name}) { background-color: ${color}; }`).join("\n")}
::highlight(cubexp-note) { text-decoration: underline dotted 1.5px currentColor; text-underline-offset: 4px; }
::highlight(cubexp-search) { background-color: rgba(255, 140, 0, 0.55); color: inherit; }
`;
	}

	private fixedCss(): string {
		return `
html, body { margin: 0 !important; padding: 0 !important; overflow: hidden !important; -webkit-tap-highlight-color: transparent; }
${Object.entries(HIGHLIGHT_COLORS).map(([name, color]) => `::highlight(cubexp-hl-${name}) { background-color: ${color === "transparent" ? "rgba(234,88,12,0.25)" : color}; }`).join("\n")}
::highlight(cubexp-search) { background-color: rgba(255, 140, 0, 0.55); }
`;
	}

	private layout(): void {
		const chapter = this.current[0];
		if (!chapter) return;
		const m = this.metrics();
		this.width = m.width;
		this.height = m.height;
		this.columns = m.columns;
		const { frame, document } = chapter;
		frame.style.width = `${m.width}px`;
		if (this.settings.flow === "paginated") {
			frame.style.height = `${m.height}px`;
			const scrollWidth = document.documentElement.scrollWidth;
			this.pages = Math.max(1, Math.ceil((scrollWidth - 2) / Math.max(1, m.width)));
			frame.style.width = `${this.pages * m.width}px`;
			this.page = Math.min(this.page, this.pages - 1);
			this.translate(false);
		} else {
			frame.style.transform = "";
			this.pages = 1;
			this.page = 0;
			frame.style.height = "0px";
			frame.style.height = `${Math.max(m.height, document.documentElement.scrollHeight)}px`;
		}
	}

	private layoutFixed(): void {
		const m = this.measureHost();
		this.width = m.width;
		this.height = m.height;
		const sizes = this.current.map(chapter => fixedViewport(chapter.document));
		const totalWidth = sizes.reduce((sum, size) => sum + size.width, 0);
		const maxHeight = Math.max(...sizes.map(size => size.height));
		const pad = 12;
		const scale = Math.min((m.width - pad * 2) / Math.max(1, totalWidth), (m.height - pad * 2) / Math.max(1, maxHeight));
		let left = (m.width - totalWidth * scale) / 2;
		const ordered = this.book.direction === "rtl" ? [...this.current].reverse() : this.current;
		for (const chapter of ordered) {
			const size = sizes[this.current.indexOf(chapter)]!;
			const { frame } = chapter;
			frame.style.width = `${size.width}px`;
			frame.style.height = `${size.height}px`;
			frame.style.transformOrigin = "0 0";
			frame.style.transform = `translate(${left}px, ${(m.height - size.height * scale) / 2}px) scale(${scale})`;
			frame.style.transition = "none";
			left += size.width * scale;
		}
	}

	private translate(animate: boolean): void {
		const frame = this.current[0]?.frame;
		if (!frame || this.settings.flow !== "paginated") return;
		frame.style.transition = animate && this.settings.animate ? "transform 300ms cubic-bezier(0.22, 0.8, 0.24, 1)" : "none";
		frame.style.transform = `translate3d(${-this.page * this.width}px, 0, 0)`;
	}

	private turnTo(page: number): void {
		this.page = Math.min(this.pages - 1, Math.max(0, page));
		this.translate(true);
		this.clearSelection();
		this.events.selection?.(null);
		this.emitRelocate();
	}

	/** Position the loaded chapter at `target`; returns false if nothing resolved. */
	private go(target: EpubViewTarget, emit = true): void {
		const chapter = this.current[0];
		if (!chapter) return;
		const { document } = chapter;
		let range: Range | undefined;
		let element: Element | null = null;
		if (target.search) range = findOccurrence(document.body, target.search.query, target.search.occurrence);
		if (!range && target.range) range = resolveRange(document.body, target.range.start, target.range.end);
		if (!range && target.point) {
			const point = resolvePoint(document.body, target.point);
			if (point) {
				range = document.createRange();
				range.setStart(point.node, point.offset);
				if (point.node.nodeType === 3 && point.offset < (point.node as Text).data.length) range.setEnd(point.node, point.offset + 1);
			}
		}
		if (!range && target.fragment) element = document.getElementById(target.fragment) ?? document.getElementsByName(target.fragment)[0] ?? null;
		if (target.search) this.searchRange = range;
		const rect = range ? firstRect(range) : element?.getBoundingClientRect();
		if (this.settings.flow === "scrolled") {
			const height = this.viewport.scrollHeight - this.viewport.clientHeight;
			let top = 0;
			if (rect) top = rect.top - this.settings.insetTop;
			else if (target.atEnd) top = height;
			else if (target.fraction !== undefined) top = target.fraction * height;
			this.viewport.scrollTop = Math.max(0, top);
		} else {
			let page = 0;
			if (rect) page = Math.floor((rect.left + 1) / Math.max(1, this.width));
			else if (target.atEnd) page = this.pages - 1;
			else if (target.fraction !== undefined) page = Math.floor(target.fraction * this.pages + 1e-6);
			this.page = Math.min(this.pages - 1, Math.max(0, page));
			this.translate(false);
		}
		if (emit) this.emitRelocate();
	}

	private capturePoint(): string | undefined {
		const chapter = this.current[0];
		if (!chapter || this.fixed) return undefined;
		const { document } = chapter;
		const m = this.metrics();
		const left = this.settings.flow === "paginated" ? this.page * this.width + m.side : m.side;
		const top = this.settings.flow === "scrolled" ? this.viewport.scrollTop + m.top : m.top;
		for (let dy = 2; dy < m.contentHeight; dy += 18) {
			for (const dx of [2, 24, 80]) {
				const caret = caretFromPoint(document, left + dx, top + dy);
				if (caret && caret.node.nodeType === 3 && document.body.contains(caret.node)) {
					const rect = firstRect(rangeAt(document, caret.node, caret.offset));
					if (!rect || this.onScreen(rect)) return serializePoint(document.body, caret.node, caret.offset);
				}
			}
		}
		for (const node of textNodes(document.body)) {
			if (!node.data.trim()) continue;
			const rect = firstRect(rangeAt(document, node, 0, node.data.length));
			if (rect && this.onScreen(rect)) return serializePoint(document.body, node, 0);
		}
		return undefined;
	}

	private onScreen(rect: DOMRect): boolean {
		if (this.settings.flow === "scrolled") {
			const top = this.viewport.scrollTop;
			return rect.bottom > top && rect.top < top + this.height;
		}
		const left = this.page * this.width;
		return rect.right > left && rect.left < left + this.width;
	}

	private emitRelocate(): void {
		const location = this.location();
		if (location) this.events.relocate?.(location);
	}

	/* --------------------------------------------------------- annotations */

	private applyAnnotations(): void {
		for (const chapter of this.current) {
			chapter.ranges.clear();
			const registry = (chapter.window as Window & { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights;
			const Highlight = (chapter.window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
			const groups = new Map<string, Range[]>();
			for (const annotation of this.annotations) {
				if (annotation.index !== chapter.index) continue;
				const range = resolveRange(chapter.document.body, annotation.start, annotation.end);
				if (!range) continue;
				chapter.ranges.set(annotation.id, range);
				const name = `cubexp-hl-${annotation.color in HIGHLIGHT_COLORS ? annotation.color : "yellow"}`;
				groups.set(name, [...(groups.get(name) ?? []), range]);
				if (annotation.note) groups.set("cubexp-note", [...(groups.get("cubexp-note") ?? []), range]);
			}
			if (!registry || !Highlight) continue;
			for (const name of [...Object.keys(HIGHLIGHT_COLORS).map(color => `cubexp-hl-${color}`), "cubexp-note", "cubexp-search"]) registry.delete(name);
			for (const [name, ranges] of groups) registry.set(name, new Highlight(...ranges));
			if (this.searchRange && this.searchRange.startContainer.ownerDocument === chapter.document) {
				registry.set("cubexp-search", new Highlight(this.searchRange));
			}
		}
	}

	/* -------------------------------------------------------------- events */

	private toHost(chapter: ChapterFrame, rect: { left: number; top: number; right: number; bottom: number }) {
		const frameRect = chapter.frame.getBoundingClientRect();
		const hostRect = this.host.getBoundingClientRect();
		const scale = frameRect.width / Math.max(1, chapter.frame.offsetWidth);
		return {
			left: frameRect.left - hostRect.left + rect.left * scale,
			top: frameRect.top - hostRect.top + rect.top * scale,
			right: frameRect.left - hostRect.left + rect.right * scale,
			bottom: frameRect.top - hostRect.top + rect.bottom * scale,
		};
	}

	private attach(chapter: ChapterFrame): void {
		const { document, window } = chapter;
		const listen = <K extends keyof DocumentEventMap>(type: K, handler: (event: DocumentEventMap[K]) => void, options?: AddEventListenerOptions) => {
			document.addEventListener(type, handler as EventListener, options);
			chapter.cleanup.push(() => document.removeEventListener(type, handler as EventListener, options));
		};
		let touch: { x: number; y: number; time: number; horizontal?: boolean; moved: boolean } | undefined;
		let suppressClick = false;

		listen("click", event => {
			if (suppressClick) { suppressClick = false; return; }
			const target = event.target as Element | null;
			const link = target?.closest?.("a[href]");
			if (link) {
				event.preventDefault();
				this.activateLink(chapter, link, event);
				return;
			}
			const selection = window.getSelection();
			if (selection && !selection.isCollapsed && selection.toString().trim()) return;
			for (const [id, range] of chapter.ranges) {
				for (const rect of Array.from(range.getClientRects())) {
					if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
						const bounds = range.getBoundingClientRect();
						this.events.annotation?.(id, this.toHost(chapter, bounds));
						return;
					}
				}
			}
			const point = this.toHost(chapter, { left: event.clientX, top: event.clientY, right: event.clientX, bottom: event.clientY });
			const ratio = point.left / Math.max(1, this.host.clientWidth);
			if (this.settings.flow === "scrolled" && !this.fixed) { this.events.tap?.("menu"); return; }
			const rtl = this.book.direction === "rtl";
			if (ratio < 0.28) this.events.tap?.(rtl ? "next" : "prev");
			else if (ratio > 0.72) this.events.tap?.(rtl ? "prev" : "next");
			else this.events.tap?.("menu");
		});

		listen("keydown", event => this.events.key?.(event));

		listen("wheel", event => this.onWheel(event), { passive: false });

		listen("touchstart", event => {
			if (event.touches.length !== 1) { touch = undefined; return; }
			const point = event.touches[0]!;
			touch = { x: point.clientX, y: point.clientY, time: Date.now(), moved: false };
		}, { passive: true });

		listen("touchmove", event => {
			if (!touch || event.touches.length !== 1 || this.settings.flow !== "paginated") return;
			const selection = window.getSelection();
			if (selection && !selection.isCollapsed) { touch = undefined; return; }
			const point = event.touches[0]!;
			const dx = point.clientX - touch.x, dy = point.clientY - touch.y;
			if (touch.horizontal === undefined && Math.hypot(dx, dy) > 8) touch.horizontal = Math.abs(dx) > Math.abs(dy);
			if (!touch.horizontal) return;
			event.preventDefault();
			touch.moved = true;
			if (this.fixed) return;
			const atEdge = (dx > 0 && this.page === 0) || (dx < 0 && this.page === this.pages - 1);
			chapter.frame.style.transition = "none";
			chapter.frame.style.transform = `translate3d(${-this.page * this.width + (atEdge ? dx * 0.35 : dx)}px, 0, 0)`;
		}, { passive: false });

		listen("touchend", event => {
			const start = touch;
			touch = undefined;
			if (!start?.moved) return;
			suppressClick = true;
			setTimeout(() => { suppressClick = false; }, 400);
			const point = event.changedTouches[0]!;
			const dx = point.clientX - start.x;
			const fast = Math.abs(dx) > 24 && Date.now() - start.time < 250;
			const rtl = this.book.direction === "rtl";
			if (Math.abs(dx) > Math.min(80, this.width * 0.18) || fast) {
				const forward = rtl ? dx > 0 : dx < 0;
				void (forward ? this.next() : this.prev());
			} else this.translate(true);
		});

		listen("selectionchange", () => {
			clearTimeout(this.selectionTimer);
			this.selectionTimer = setTimeout(() => this.reportSelection(chapter), 280);
		});

		const relayout = () => {
			if (this.fixed || chapter !== this.current[0]) return;
			const pages = this.pages;
			const height = chapter.frame.style.height;
			const point = this.capturePoint();
			this.layout();
			if (pages !== this.pages || height !== chapter.frame.style.height) { this.go({ index: chapter.index, point }, false); this.emitRelocate(); }
		};
		const onLoad = (event: Event) => { if ((event.target as Element)?.localName === "img") relayout(); };
		document.addEventListener("load", onLoad, true);
		chapter.cleanup.push(() => document.removeEventListener("load", onLoad, true));
		document.fonts?.addEventListener?.("loadingdone", relayout);
		chapter.cleanup.push(() => document.fonts?.removeEventListener?.("loadingdone", relayout));
	}

	private reportSelection(chapter: ChapterFrame): void {
		if (!this.current.includes(chapter)) return;
		const selection = chapter.window.getSelection();
		const text = selection?.toString() ?? "";
		if (!selection || selection.isCollapsed || !text.trim() || !selection.rangeCount) {
			this.events.selection?.(null);
			return;
		}
		const range = selection.getRangeAt(0);
		if (!chapter.document.body.contains(range.commonAncestorContainer)) return;
		const anchor = serializeRange(chapter.document.body, range);
		if (!anchor) return;
		const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
		const visible = rects.filter(rect => this.fixed || this.onScreen(rect));
		const bounds = (visible.length ? visible : rects).reduce((acc, rect) => ({
			left: Math.min(acc.left, rect.left), top: Math.min(acc.top, rect.top),
			right: Math.max(acc.right, rect.right), bottom: Math.max(acc.bottom, rect.bottom),
		}), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
		if (!Number.isFinite(bounds.left)) return;
		this.events.selection?.({ index: chapter.index, text: text.trim(), ...anchor, rect: this.toHost(chapter, bounds) });
	}

	private activateLink(chapter: ChapterFrame, link: Element, event: MouseEvent): void {
		const href = link.getAttribute("href") ?? "";
		if (isExternalHref(href)) {
			if (/^(https?|mailto):/i.test(href)) this.events.external?.(href);
			return;
		}
		const item = this.book.spine[chapter.index]!;
		const [file, fragment] = splitFragment(href);
		const path = file ? resolvePath(item.href, file) : item.href;
		const index = this.book.spineIndex(path);
		const target: EpubViewTarget = { index: index >= 0 ? index : chapter.index, fragment };
		const type = `${link.getAttributeNS(OPS_NS, "type") ?? link.getAttribute("epub:type") ?? ""} ${link.getAttribute("role") ?? ""}`;
		if (fragment && /noteref|doc-noteref/.test(type)) {
			const note = this.footnoteText(chapter, index, fragment);
			if (note) {
				const rect = link.getBoundingClientRect();
				this.events.footnote?.({ text: note, rect: this.toHost(chapter, rect), target });
				return;
			}
		}
		if (index < 0) return;
		void event;
		void this.display(target);
	}

	private footnoteText(chapter: ChapterFrame, index: number, fragment: string): string | undefined {
		const local = index < 0 || index === chapter.index;
		const document = local ? chapter.document : prepareChapter(this.book, this.book.spine[index]!).documentElement.ownerDocument;
		const element = document.getElementById(fragment);
		if (!element) return undefined;
		// A backlink inside an <a id> often marks only the number; take its block.
		const block = element.closest("aside, li, p, div, section, dd") ?? element;
		const clone = block.cloneNode(true) as Element;
		for (const backlink of Array.from(clone.querySelectorAll("a[href]"))) {
			if (/^\s*[\[(]?\d+[\])]?\s*$|↩/.test(backlink.textContent ?? "")) backlink.remove();
		}
		const text = clone.textContent?.replace(/\s+/g, " ").trim();
		return text || undefined;
	}

	private readonly onScroll = () => {
		if (this.settings.flow !== "scrolled" || this.fixed) return;
		this.emitRelocate();
	};

	private readonly onWheel = (event: WheelEvent) => {
		if (this.settings.flow === "scrolled" && !this.fixed) return;
		if (event.ctrlKey) return;
		event.preventDefault();
		const now = Date.now();
		if (now < this.wheelLock) return;
		this.wheelAccumulator += Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
		if (Math.abs(this.wheelAccumulator) < 40) return;
		const forward = this.wheelAccumulator > 0;
		this.wheelAccumulator = 0;
		this.wheelLock = now + 280;
		void (forward ? this.next() : this.prev());
	};
}

function caretFromPoint(document: Document, x: number, y: number): { node: Node; offset: number } | undefined {
	const doc = document as Document & {
		caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
		caretRangeFromPoint?(x: number, y: number): Range | null;
	};
	if (doc.caretPositionFromPoint) {
		const position = doc.caretPositionFromPoint(x, y);
		return position ? { node: position.offsetNode, offset: position.offset } : undefined;
	}
	const range = doc.caretRangeFromPoint?.(x, y);
	return range ? { node: range.startContainer, offset: range.startOffset } : undefined;
}

function rangeAt(document: Document, node: Node, start: number, end = start): Range {
	const range = document.createRange();
	const length = node.nodeType === 3 ? (node as Text).data.length : node.childNodes.length;
	range.setStart(node, Math.min(start, length));
	range.setEnd(node, Math.min(Math.max(end, start + (node.nodeType === 3 && start < length ? 1 : 0)), length));
	return range;
}

function firstRect(range: Range): DOMRect | undefined {
	const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 || rect.height > 0);
	return rects[0] ?? (range.getBoundingClientRect().height ? range.getBoundingClientRect() : undefined);
}

/** Page box of a pre-paginated document: viewport meta, then SVG viewBox, then the lone image. */
function fixedViewport(document: Document): { width: number; height: number } {
	const meta = document.querySelector("meta[name=viewport]")?.getAttribute("content") ?? "";
	const width = Number(/width\s*=\s*([\d.]+)/i.exec(meta)?.[1]);
	const height = Number(/height\s*=\s*([\d.]+)/i.exec(meta)?.[1]);
	if (width > 0 && height > 0) return { width, height };
	const svg = document.body.querySelector("svg");
	const box = svg?.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
	if (box && box[2]! > 0 && box[3]! > 0) return { width: box[2]!, height: box[3]! };
	const image = document.images[0];
	if (image?.naturalWidth) return { width: image.naturalWidth, height: image.naturalHeight };
	return { width: 1000, height: 1414 };
}
