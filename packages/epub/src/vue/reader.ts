import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, type PropType, type VNode, type VNodeChild } from "vue";
import { openEpub, type EpubBook, type EpubTocItem } from "../book.js";
import type { EpubSource } from "../archive.js";
import { searchBook, type EpubSearchResult } from "../content.js";
import { EPUB_MIME_TYPE } from "../formats.js";
import { registerEpubPreview } from "../thumbnail.js";
import { registerEpubBackHandler } from "../host.js";
import { EpubView, HIGHLIGHT_COLORS, type EpubViewLocation, type EpubViewSelection, type EpubViewSettings, type EpubViewTarget } from "../view.js";
import { format, readerMessages, type ReaderMessages } from "./i18n.js";
import { icon, type ReaderIconName } from "./icons.js";
import {
	createId, FONT_SIZES, LINE_HEIGHTS, loadBookState, loadPreferences, READER_FONTS, READER_MARGINS, READER_THEMES,
	saveBookState, savePreferences, type ReaderBookState, type ReaderFont, type ReaderHighlight, type ReaderMargin,
	type ReaderPreferences, type ReaderThemeName,
} from "./preferences.js";

type Rect = EpubViewSelection["rect"];
type Panel = "" | "navigator" | "appearance" | "search";
type NavigatorTab = "contents" | "bookmarks" | "notes";

interface TocRow { item: EpubTocItem; depth: number }

function flatten(items: readonly EpubTocItem[], depth = 0, rows: TocRow[] = []): TocRow[] {
	for (const item of items) { rows.push({ item, depth }); flatten(item.children, depth + 1, rows); }
	return rows;
}

function percent(value: number): string {
	return `${Math.min(100, Math.max(0, Math.floor(value * 1000) / 10)).toFixed(value >= 0.999 || value === 0 ? 0 : 1)}%`;
}

async function copyText(text: string): Promise<boolean> {
	try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
	try {
		const area = document.createElement("textarea");
		area.value = text;
		area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
		document.body.append(area);
		area.select();
		const ok = document.execCommand("copy");
		area.remove();
		return ok;
	} catch { return false; }
}

export const EpubReader = defineComponent({
	name: "EpubReader",
	props: {
		source: { type: [Blob, ArrayBuffer, Uint8Array, String] as PropType<EpubSource | string>, required: true },
		fileName: { type: String, default: "book.epub" },
		locale: { type: String, default: undefined },
		/** Shows a back button in the touch top bar; the host handles `exit`. */
		exitable: { type: Boolean, default: false },
		/** "auto" picks the touch layout for coarse pointers and narrow hosts. */
		form: { type: String as PropType<"auto" | "touch" | "desktop">, default: "auto" },
	},
	emits: ["loaded", "error", "exit"],
	setup(props, { emit, expose }) {
		const t = computed<ReaderMessages>(() => readerMessages(props.locale));
		const root = ref<HTMLElement>();
		const stageHost = ref<HTMLElement>();
		const book = shallowRef<EpubBook>();
		const location = shallowRef<EpubViewLocation>();
		const opening = ref(true);
		const busy = ref(false);
		const error = ref("");
		const chrome = ref(false);
		const panel = ref<Panel>("");
		const navigatorTab = ref<NavigatorTab>("contents");
		const sidebar = ref(true);
		const preferences = ref<ReaderPreferences>(loadPreferences());
		const state = ref<ReaderBookState>({ bookmarks: [], highlights: [] });
		const selection = shallowRef<EpubViewSelection | null>(null);
		const annotationMenu = shallowRef<{ id: string; rect: Rect } | null>(null);
		const footnote = shallowRef<{ text: string; rect: Rect; target: EpubViewTarget } | null>(null);
		const noteEditor = ref<{ id: string; text: string; quote: string } | null>(null);
		const jumpBack = shallowRef<{ target: EpubViewTarget; label: string } | null>(null);
		const seek = ref<number | null>(null);
		const toast = ref("");
		const width = ref(1024);
		const coarse = ref(false);
		const systemDark = ref(false);
		const reduceMotion = ref(false);
		const safe = ref({ top: 0, bottom: 0 });
		const coverUrl = ref("");
		let coverBlob: Blob | undefined;
		let view: EpubView | undefined;
		let bookKey = "";
		let generation = 0;
		let saveTimer: ReturnType<typeof setTimeout> | undefined;
		let toastTimer: ReturnType<typeof setTimeout> | undefined;
		let jumpTimer: ReturnType<typeof setTimeout> | undefined;
		const cleanups: Array<() => void> = [];

		const search = ref({ query: "", results: [] as EpubSearchResult[], running: false, done: 0, total: 0, limited: false, active: -1, ran: "" });
		let searchController: AbortController | undefined;
		let searchTimer: ReturnType<typeof setTimeout> | undefined;

		const touch = computed(() => props.form === "touch" || (props.form === "auto" && (coarse.value || width.value < 720)));
		const themeName = computed<Exclude<ReaderThemeName, "auto">>(() =>
			preferences.value.theme === "auto" ? (systemDark.value ? "dark" : "light") : preferences.value.theme);
		const theme = computed(() => READER_THEMES[themeName.value]);
		const fixed = computed(() => book.value?.layout === "pre-paginated");
		const tocRows = computed(() => flatten(book.value?.toc ?? []));

		const viewSettings = computed<EpubViewSettings>(() => {
			const p = preferences.value;
			return {
				flow: fixed.value ? "paginated" : p.flow,
				spread: p.spread,
				fontSize: p.fontSize,
				lineHeight: p.lineHeight,
				fontFamily: READER_FONTS[p.font],
				margin: READER_MARGINS[p.margin],
				justify: p.justify,
				publisherStyles: p.publisherStyles,
				animate: p.animate && !reduceMotion.value,
				theme: { background: theme.value.background, color: theme.value.color, link: theme.value.link, dark: theme.value.dark },
				insetTop: touch.value ? 34 + safe.value.top : 38,
				insetBottom: touch.value ? 34 + safe.value.bottom : 36,
			};
		});

		watch(viewSettings, value => view?.updateSettings(value));
		// Side panels must not squeeze the page into a sliver on a narrow window.
		watch(width, (value, previous) => { if (value < 900 && previous >= 900) sidebar.value = false; });
		watch(panel, value => { if (value === "search" && !touch.value && width.value < 1100) sidebar.value = false; });
		watch(preferences, value => savePreferences(value), { deep: true });

		/* --------------------------------------------------------- labels */

		function tocForIndex(index: number): EpubTocItem | undefined {
			let previous: EpubTocItem | undefined;
			for (const { item } of tocRows.value) {
				if (item.index === index) return item;
				if (item.index !== undefined && item.index < index && (!previous || item.index >= previous.index!)) previous = item;
			}
			return previous;
		}

		function chapterLabel(index: number | undefined): string {
			if (index === undefined) return "";
			return tocForIndex(index)?.label ?? book.value?.metadata.title ?? "";
		}

		const currentToc = computed(() => location.value ? tocForIndex(location.value.index) : undefined);
		const currentChapter = computed(() => currentToc.value?.label ?? (book.value ? book.value.metadata.title : ""));
		const authors = computed(() => book.value?.metadata.creators.join(" / ") ?? "");

		const currentBookmark = computed(() => {
			const loc = location.value;
			if (!loc || !view) return undefined;
			return state.value.bookmarks.find(bookmark => bookmark.index === loc.index && view!.isVisible(bookmark.index, bookmark.point));
		});

		/* ---------------------------------------------------------- opening */

		function teardown() {
			view?.destroy();
			view = undefined;
			location.value = undefined;
			if (coverUrl.value) URL.revokeObjectURL(coverUrl.value);
			coverUrl.value = "";
			coverBlob = undefined;
			searchController?.abort();
		}

		async function open(input: EpubSource | string) {
			const id = ++generation;
			teardown();
			opening.value = true;
			error.value = "";
			selection.value = null;
			annotationMenu.value = null;
			footnote.value = null;
			search.value = { query: "", results: [], running: false, done: 0, total: 0, limited: false, active: -1, ran: "" };
			try {
				// A string source is a URL, as ArtifactSource allows.
				const source = typeof input === "string" ? new Uint8Array(await (await fetch(input)).arrayBuffer()) : input;
				if (id !== generation) return;
				const opened = await openEpub(source);
				if (id !== generation) return;
				book.value = opened;
				const size = source instanceof Blob ? source.size : source.byteLength;
				bookKey = `${opened.metadata.identifier ?? opened.metadata.title}|${size}`;
				state.value = loadBookState(bookKey);
				if (opened.coverHref) {
					const bytes = opened.read(opened.coverHref);
					if (bytes) {
						coverBlob = new Blob([bytes as BlobPart], { type: opened.mediaType(opened.coverHref) });
						coverUrl.value = URL.createObjectURL(coverBlob);
					}
				}
				await nextTick();
				if (id !== generation || !stageHost.value) return;
				view = new EpubView(stageHost.value, opened, {
					relocate: onRelocate,
					tap: onTap,
					selection: value => { selection.value = value; if (value) { annotationMenu.value = null; footnote.value = null; } },
					annotation: (annotationId, rect) => { selection.value = null; footnote.value = null; annotationMenu.value = { id: annotationId, rect }; },
					footnote: value => { selection.value = null; annotationMenu.value = null; footnote.value = value; },
					external: href => { try { window.open(href, "_blank", "noopener,noreferrer"); } catch { /* host blocks popups */ } },
					key: onKey,
					loading: value => { busy.value = value; },
					error: reason => showToast(reason instanceof Error ? reason.message : String(reason)),
				}, viewSettings.value);
				view.setAnnotations(state.value.highlights);
				const position = state.value.position;
				const first = opened.spine.find(item => item.linear)?.index ?? 0;
				await view.display(position && position.index < opened.spine.length
					? { index: position.index, point: position.point, fraction: position.fraction }
					: { index: first });
				if (id !== generation) return;
				emit("loaded");
				if (touch.value && !position) flashChrome();
			} catch (reason) {
				if (id !== generation) return;
				error.value = reason instanceof Error ? reason.message : String(reason);
				emit("error", reason);
			} finally {
				if (id === generation) opening.value = false;
			}
		}

		watch(() => props.source, source => { void open(source); });

		function flashChrome() {
			chrome.value = true;
			setTimeout(() => { if (!panel.value && chrome.value && touch.value) chrome.value = false; }, 2200);
		}

		/* ----------------------------------------------------------- events */

		function onRelocate(value: EpubViewLocation) {
			location.value = value;
			selection.value = null;
			annotationMenu.value = null;
			footnote.value = null;
			clearTimeout(saveTimer);
			saveTimer = setTimeout(() => {
				state.value.position = { index: value.index, point: value.point, fraction: value.page / Math.max(1, value.pages), totalFraction: value.totalFraction };
				persist();
			}, 300);
		}

		function persist() { if (bookKey) saveBookState(bookKey, state.value); }

		function closeTransient(): boolean {
			if (selection.value || annotationMenu.value || footnote.value) {
				selection.value = null;
				annotationMenu.value = null;
				footnote.value = null;
				view?.clearSelection();
				return true;
			}
			return false;
		}

		function onTap(zone: "prev" | "next" | "menu") {
			if (closeTransient()) return;
			if (panel.value && (touch.value || panel.value === "appearance")) { panel.value = ""; return; }
			if (zone === "prev") { if (touch.value) chrome.value = false; void view?.prev(); return; }
			if (zone === "next") { if (touch.value) chrome.value = false; void view?.next(); return; }
			if (touch.value) chrome.value = !chrome.value;
		}

		function onKey(event: KeyboardEvent) {
			const target = event.target as HTMLElement | null;
			if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) {
				if (event.key === "Escape") { (target as HTMLElement).blur(); handleBack(); }
				return;
			}
			const mod = event.metaKey || event.ctrlKey;
			const rtl = book.value?.direction === "rtl";
			const handled = () => { event.preventDefault(); event.stopPropagation(); };
			if (mod && event.key.toLowerCase() === "f") { handled(); openPanel("search", undefined, true); return; }
			if (mod && (event.key === "=" || event.key === "+")) { handled(); stepFont(1); return; }
			if (mod && event.key === "-") { handled(); stepFont(-1); return; }
			if (mod && event.key.toLowerCase() === "d") { handled(); toggleBookmark(); return; }
			if (mod || event.altKey) return;
			switch (event.key) {
				case "ArrowRight": handled(); void (rtl ? view?.prev() : view?.next()); break;
				case "ArrowLeft": handled(); void (rtl ? view?.next() : view?.prev()); break;
				case "ArrowDown": if (preferences.value.flow === "paginated" || fixed.value) { handled(); void view?.next(); } break;
				case "ArrowUp": if (preferences.value.flow === "paginated" || fixed.value) { handled(); void view?.prev(); } break;
				case "PageDown": handled(); void view?.next(); break;
				case "PageUp": handled(); void view?.prev(); break;
				case " ": handled(); void (event.shiftKey ? view?.prev() : view?.next()); break;
				case "Home": handled(); if (location.value) void view?.display({ index: location.value.index, fraction: 0 }); break;
				case "End": handled(); if (location.value) void view?.display({ index: location.value.index, atEnd: true }); break;
				case "Escape": if (handleBack()) handled(); break;
				default: break;
			}
		}

		function handleBack(): boolean {
			if (noteEditor.value) { noteEditor.value = null; return true; }
			if (closeTransient()) return true;
			if (panel.value) { closePanel(); return true; }
			if (touch.value && chrome.value) { chrome.value = false; return true; }
			return false;
		}

		function openPanel(value: Panel, tab?: NavigatorTab, force = false) {
			if (tab) navigatorTab.value = tab;
			closeTransient();
			if (!touch.value && value === "navigator") { sidebar.value = true; panel.value = ""; scrollCurrentIntoView(); return; }
			panel.value = panel.value === value && !force ? "" : value;
			if (value === "navigator") scrollCurrentIntoView();
			if (value === "search") void nextTick(() => root.value?.querySelector<HTMLInputElement>(".cubexp-epub-search__input")?.focus({ preventScroll: true }));
		}

		function closePanel() {
			panel.value = "";
			root.value?.focus({ preventScroll: true });
		}

		function scrollCurrentIntoView() {
			void nextTick(() => root.value?.querySelector('.cubexp-epub-toc [aria-current="true"]')?.scrollIntoView({ block: "center" }));
		}

		function showToast(message: string) {
			toast.value = message;
			clearTimeout(toastTimer);
			toastTimer = setTimeout(() => { toast.value = ""; }, 2200);
		}

		async function jump(target: EpubViewTarget) {
			const loc = location.value;
			if (loc && view) {
				jumpBack.value = {
					target: { index: loc.index, point: loc.point, fraction: loc.page / Math.max(1, loc.pages) },
					label: loc.fixed ? chapterLabel(loc.index) : `${chapterLabel(loc.index)} · ${percent(loc.totalFraction)}`,
				};
				clearTimeout(jumpTimer);
				jumpTimer = setTimeout(() => { jumpBack.value = null; }, 12000);
			}
			if (touch.value) { panel.value = ""; chrome.value = false; }
			await view?.display(target);
		}

		async function returnBack() {
			const back = jumpBack.value;
			jumpBack.value = null;
			if (back) await view?.display(back.target);
		}

		/* ------------------------------------------------ bookmarks & notes */

		function toggleBookmark() {
			const loc = location.value;
			if (!loc || !view) return;
			const existing = currentBookmark.value;
			if (existing) state.value.bookmarks = state.value.bookmarks.filter(bookmark => bookmark.id !== existing.id);
			else state.value.bookmarks = [...state.value.bookmarks, {
				id: createId(), index: loc.index, point: loc.point, fraction: loc.page / Math.max(1, loc.pages),
				excerpt: view.excerpt(loc.point), createdAt: Date.now(),
			}].sort((a, b) => a.index - b.index || a.fraction - b.fraction);
			persist();
			location.value = { ...loc };
		}

		function syncHighlights() {
			view?.setAnnotations(state.value.highlights);
			persist();
		}

		function addHighlight(color: string, withNote = false) {
			const current = selection.value;
			if (!current) return;
			const highlight: ReaderHighlight = { id: createId(), index: current.index, start: current.start, end: current.end, text: current.text, color, createdAt: Date.now() };
			state.value.highlights = [...state.value.highlights, highlight].sort((a, b) => a.index - b.index || a.createdAt - b.createdAt);
			selection.value = null;
			view?.clearSelection();
			syncHighlights();
			if (withNote) noteEditor.value = { id: highlight.id, text: "", quote: highlight.text };
		}

		function updateHighlight(id: string, patch: Partial<ReaderHighlight>) {
			state.value.highlights = state.value.highlights.map(item => item.id === id ? { ...item, ...patch } : item);
			syncHighlights();
		}

		function removeHighlight(id: string) {
			state.value.highlights = state.value.highlights.filter(item => item.id !== id);
			annotationMenu.value = null;
			syncHighlights();
		}

		async function copy(text: string) {
			showToast(await copyText(text) ? t.value.copied : text);
			closeTransient();
		}

		/* ----------------------------------------------------------- search */

		function scheduleSearch(query: string, immediate = false) {
			search.value.query = query;
			clearTimeout(searchTimer);
			if (immediate) void runSearch(query);
			else searchTimer = setTimeout(() => void runSearch(query), 380);
		}

		async function runSearch(query: string) {
			const current = book.value;
			if (!current) return;
			searchController?.abort();
			const trimmed = query.trim();
			const s = search.value;
			s.results = []; s.active = -1; s.limited = false; s.ran = trimmed;
			view?.setSearchHit(undefined);
			if (!trimmed) { s.running = false; return; }
			const controller = new AbortController();
			searchController = controller;
			s.running = true; s.done = 0; s.total = current.spine.length;
			const limit = 300;
			try {
				let pending: EpubSearchResult[] = [];
				for await (const result of searchBook(current, trimmed, {
					signal: controller.signal, limit,
					onProgress: (done, total) => { s.done = done; s.total = total; if (pending.length) { s.results.push(...pending); pending = []; } },
				})) {
					pending.push(result);
				}
				if (!controller.signal.aborted) {
					s.results.push(...pending);
					s.limited = s.results.length >= limit;
				}
			} catch (reason) {
				if (!(reason instanceof DOMException && reason.name === "AbortError")) showToast(String(reason));
			} finally {
				if (searchController === controller) s.running = false;
			}
		}

		function openSearchResult(position: number) {
			const result = search.value.results[position];
			if (!result) return;
			search.value.active = position;
			void jump({ index: result.index, search: { query: search.value.ran, occurrence: result.occurrence } });
		}

		watch(panel, (value, previous) => {
			if (previous === "search" && value !== "search" && !touch.value) view?.setSearchHit(undefined);
		});

		/* -------------------------------------------------------- appearance */

		function setPreference<K extends keyof ReaderPreferences>(key: K, value: ReaderPreferences[K]) {
			preferences.value = { ...preferences.value, [key]: value };
		}

		function stepFont(direction: 1 | -1) {
			const index = FONT_SIZES.indexOf(preferences.value.fontSize);
			const next = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, (index < 0 ? 6 : index) + direction))]!;
			setPreference("fontSize", next);
		}

		function toggleNight() {
			setPreference("theme", theme.value.dark ? (preferences.value.theme === "black" ? "light" : "light") : "dark");
		}

		/* -------------------------------------------------------- lifecycle */

		onMounted(() => {
			const element = root.value!;
			cleanups.push(registerEpubBackHandler(element, handleBack));
			cleanups.push(registerEpubPreview(element, () => book.value ? { cover: coverBlob, title: book.value.metadata.title, author: authors.value } : undefined));
			const observer = new ResizeObserver(entries => { width.value = entries[0]?.contentRect.width ?? width.value; });
			observer.observe(element);
			cleanups.push(() => observer.disconnect());
			width.value = element.clientWidth;
			sidebar.value = element.clientWidth >= 1100;
			const media = (query: string, apply: (matches: boolean) => void) => {
				const list = window.matchMedia?.(query);
				if (!list) return;
				apply(list.matches);
				const listener = (event: MediaQueryListEvent) => apply(event.matches);
				list.addEventListener("change", listener);
				cleanups.push(() => list.removeEventListener("change", listener));
			};
			// Arrow keys should turn pages before anything has been clicked, but only
			// when focus is nowhere in particular and this reader is the visible tab.
			const onDocumentKey = (event: KeyboardEvent) => {
				if (event.target === document.body && element.getClientRects().length) onKey(event);
			};
			document.addEventListener("keydown", onDocumentKey);
			cleanups.push(() => document.removeEventListener("keydown", onDocumentKey));
			media("(pointer: coarse)", value => { coarse.value = value; });
			media("(prefers-color-scheme: dark)", value => { systemDark.value = value; });
			media("(prefers-reduced-motion: reduce)", value => { reduceMotion.value = value; });
			const probe = document.createElement("div");
			probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
			element.append(probe);
			const style = getComputedStyle(probe);
			safe.value = { top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0 };
			probe.remove();
			void open(props.source);
		});

		onBeforeUnmount(() => {
			generation++;
			clearTimeout(saveTimer);
			clearTimeout(toastTimer);
			clearTimeout(jumpTimer);
			clearTimeout(searchTimer);
			if (state.value.position) persist();
			teardown();
			for (const cleanup of cleanups) cleanup();
		});

		expose({
			isDirty: () => false,
			getRevision: () => 0,
			subscribe: () => () => undefined,
			exportFile: async () => {
				const source = props.source;
				if (source instanceof Blob) return source;
				const bytes = typeof source === "string" ? await (await fetch(source)).arrayBuffer() : source;
				return new Blob([bytes as BlobPart], { type: EPUB_MIME_TYPE });
			},
			handleBack,
			focus: () => view?.focus(),
		});

		/* ========================================================== render */

		const button = (options: {
			icon?: ReaderIconName; label: string; text?: string; onClick: () => void; active?: boolean; filled?: boolean;
			disabled?: boolean; class?: string; pressed?: boolean; showLabel?: boolean;
		}): VNode => h("button", {
			type: "button", class: ["cubexp-epub-button", options.class, { "is-active": options.active }],
			"aria-label": options.label, title: options.label, disabled: options.disabled,
			"aria-pressed": options.pressed === undefined ? undefined : String(options.pressed),
			onClick: (event: MouseEvent) => { event.stopPropagation(); options.onClick(); },
		}, [options.icon ? icon(options.icon, { filled: options.filled }) : null, options.text ? h("span", options.text) : null]);

		const segmented = <T extends string | number>(label: string, value: T, options: Array<{ value: T; label: string; content?: VNodeChild; style?: string }>, onSelect: (value: T) => void) =>
			h("div", { class: "cubexp-epub-segmented", role: "radiogroup", "aria-label": label },
				options.map(option => h("button", {
					type: "button", role: "radio", "aria-checked": String(option.value === value), "aria-label": option.label,
					class: { "is-selected": option.value === value }, style: option.style,
					onClick: () => onSelect(option.value),
				}, option.content ?? option.label)));

		const toggle = (label: string, value: boolean, onChange: (value: boolean) => void) =>
			h("label", { class: "cubexp-epub-switch" }, [
				h("span", label),
				h("input", { type: "checkbox", role: "switch", checked: value, onChange: (event: Event) => onChange((event.target as HTMLInputElement).checked) }),
				h("i", { "aria-hidden": "true" }),
			]);

		const field = (label: string, control: VNodeChild) => h("div", { class: "cubexp-epub-field" }, [h("div", { class: "cubexp-epub-field__label" }, label), control]);

		function renderAppearance(): VNode {
			const p = preferences.value, m = t.value;
			const themes: Array<{ value: ReaderThemeName; label: string }> = [
				{ value: "auto", label: m.themeAuto }, { value: "light", label: m.themeLight }, { value: "sepia", label: m.themeSepia },
				{ value: "green", label: m.themeGreen }, { value: "dark", label: m.themeDark }, { value: "black", label: m.themeBlack },
			];
			const fontIndex = FONT_SIZES.indexOf(p.fontSize);
			return h("div", { class: "cubexp-epub-appearance" }, [
				h("div", { class: "cubexp-epub-themes", role: "radiogroup", "aria-label": m.theme }, themes.map(option => {
					const swatch = option.value === "auto" ? undefined : READER_THEMES[option.value];
					return h("button", {
						type: "button", role: "radio", "aria-checked": String(p.theme === option.value), "aria-label": option.label,
						class: ["cubexp-epub-theme", { "is-selected": p.theme === option.value }], onClick: () => setPreference("theme", option.value),
					}, [
						h("span", {
							class: "cubexp-epub-theme__swatch", "data-theme": option.value,
							style: swatch ? { background: swatch.background, color: swatch.color } : undefined,
						}, option.value === "auto" ? "" : "Aa"),
						h("small", option.label),
					]);
				})),
				fixed.value ? h("p", { class: "cubexp-epub-hint" }, m.fixedLayoutHint) : [
					h("div", { class: "cubexp-epub-stepper", role: "group", "aria-label": m.fontSize }, [
						h("button", { type: "button", class: "cubexp-epub-stepper__small", "aria-label": m.smaller, disabled: fontIndex <= 0, onClick: () => stepFont(-1) }, "A"),
						h("div", { class: "cubexp-epub-stepper__track", "aria-hidden": "true" },
							FONT_SIZES.map((size, index) => h("i", { class: { "is-on": index <= fontIndex }, key: size }))),
						h("output", { class: "cubexp-epub-stepper__value", "aria-live": "polite" }, String(p.fontSize)),
						h("button", { type: "button", class: "cubexp-epub-stepper__large", "aria-label": m.larger, disabled: fontIndex >= FONT_SIZES.length - 1, onClick: () => stepFont(1) }, "A"),
					]),
					field(m.font, segmented<ReaderFont>(m.font, p.font, [
						{ value: "publisher", label: m.fontPublisher },
						{ value: "serif", label: m.fontSerif, style: `font-family:${READER_FONTS.serif}` },
						{ value: "sans", label: m.fontSans, style: `font-family:${READER_FONTS.sans}` },
						{ value: "kai", label: m.fontKai, style: `font-family:${READER_FONTS.kai}` },
					], value => setPreference("font", value))),
					field(m.lineHeight, segmented<number>(m.lineHeight, p.lineHeight, LINE_HEIGHTS.map(value => ({
						value, label: String(value),
						content: h("svg", { viewBox: "0 0 24 24", width: 22, height: 22, "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round" },
							[0, 1, 2].map(line => h("path", { d: `M5 ${12 + (line - 1) * (value - 0.8) * 5.5}h14` }))),
					})), value => setPreference("lineHeight", value))),
					field(m.margins, segmented<ReaderMargin>(m.margins, p.margin, [
						{ value: "narrow", label: m.marginNarrow }, { value: "normal", label: m.marginNormal }, { value: "wide", label: m.marginWide },
					], value => setPreference("margin", value))),
					field(m.layout, segmented(m.layout, p.flow, [
						{ value: "paginated", label: m.paginated }, { value: "scrolled", label: m.scrolled },
					], value => setPreference("flow", value))),
				],
				width.value >= 560 && (fixed.value || p.flow === "paginated") ? field(m.columns, segmented(m.columns, p.spread, [
					{ value: "auto", label: m.columnsAuto }, { value: "single", label: m.columnsSingle }, { value: "double", label: m.columnsDouble },
				], value => setPreference("spread", value))) : null,
				fixed.value ? null : h("div", { class: "cubexp-epub-switches" }, [
					toggle(m.justify, p.justify, value => setPreference("justify", value)),
					toggle(m.publisherStyles, p.publisherStyles, value => setPreference("publisherStyles", value)),
					p.flow === "paginated" ? toggle(m.pageAnimation, p.animate, value => setPreference("animate", value)) : null,
				]),
			]);
		}

		function renderBookHeader(): VNode | null {
			const current = book.value;
			if (!current) return null;
			return h("div", { class: "cubexp-epub-bookcard" }, [
				coverUrl.value ? h("img", { class: "cubexp-epub-bookcard__cover", src: coverUrl.value, alt: "" })
					: h("div", { class: "cubexp-epub-bookcard__cover is-placeholder", "aria-hidden": "true" }, icon("book")),
				h("div", { class: "cubexp-epub-bookcard__text" }, [
					h("strong", current.metadata.title),
					authors.value ? h("span", authors.value) : null,
					location.value ? h("small", `${t.value.progress} ${percent(location.value.totalFraction)}`) : null,
				]),
			]);
		}

		function emptyState(title: string, hint: string, name: ReaderIconName): VNode {
			return h("div", { class: "cubexp-epub-empty" }, [icon(name, { size: 32 }), h("strong", title), h("p", hint)]);
		}

		function formatDate(value: number): string {
			try { return new Intl.DateTimeFormat(props.locale ?? undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(value); }
			catch { return new Date(value).toLocaleString(); }
		}

		function renderNavigator(): VNode {
			const m = t.value;
			const tabs: Array<{ id: NavigatorTab; label: string; count?: number }> = [
				{ id: "contents", label: m.contents },
				{ id: "bookmarks", label: m.bookmarks, count: state.value.bookmarks.length },
				{ id: "notes", label: m.notes, count: state.value.highlights.length },
			];
			let body: VNode;
			if (navigatorTab.value === "contents") {
				const currentId = currentToc.value?.id;
				body = h("ol", { class: "cubexp-epub-toc" }, tocRows.value.map(({ item, depth }) => h("li", { key: item.id }, [
					h("button", {
						type: "button", disabled: !item.href, "aria-current": item.id === currentId ? "true" : undefined,
						style: { paddingInlineStart: `${16 + depth * 16}px` }, class: { "is-top": depth === 0 },
						onClick: () => item.href && item.index !== undefined && void jump({ index: item.index, fragment: item.fragment }),
					}, [h("span", item.label), item.index !== undefined && !item.fragment && view && !fixed.value
						? h("small", percent(view.chapterStart(item.index))) : null]),
				])));
			} else if (navigatorTab.value === "bookmarks") {
				body = state.value.bookmarks.length ? h("ul", { class: "cubexp-epub-list" }, state.value.bookmarks.map(bookmark => h("li", { key: bookmark.id }, [
					h("button", { type: "button", class: "cubexp-epub-list__main", onClick: () => void jump({ index: bookmark.index, point: bookmark.point, fraction: bookmark.fraction }) }, [
						h("span", { class: "cubexp-epub-list__title" }, chapterLabel(bookmark.index)),
						bookmark.excerpt ? h("span", { class: "cubexp-epub-list__excerpt" }, bookmark.excerpt) : null,
						h("small", formatDate(bookmark.createdAt)),
					]),
					button({ icon: "trash", label: m.delete, class: "cubexp-epub-list__action", onClick: () => {
						state.value.bookmarks = state.value.bookmarks.filter(item => item.id !== bookmark.id); persist(); location.value = location.value && { ...location.value };
					} }),
				]))) : emptyState(m.noBookmarks, m.noBookmarksHint, "bookmark");
			} else {
				body = state.value.highlights.length ? h("ul", { class: "cubexp-epub-list" }, state.value.highlights.map(highlight => h("li", { key: highlight.id }, [
					h("button", { type: "button", class: "cubexp-epub-list__main", onClick: () => void jump({ index: highlight.index, range: { start: highlight.start, end: highlight.end } }) }, [
						h("span", { class: "cubexp-epub-list__title" }, chapterLabel(highlight.index)),
						h("blockquote", { class: "cubexp-epub-list__quote", "data-color": highlight.color }, highlight.text),
						highlight.note ? h("span", { class: "cubexp-epub-list__note" }, highlight.note) : null,
						h("small", formatDate(highlight.createdAt)),
					]),
					h("div", { class: "cubexp-epub-list__actions" }, [
						button({ icon: "note", label: highlight.note ? m.editNote : m.note, class: "cubexp-epub-list__action", onClick: () => { noteEditor.value = { id: highlight.id, text: highlight.note ?? "", quote: highlight.text }; } }),
						button({ icon: "trash", label: m.delete, class: "cubexp-epub-list__action", onClick: () => removeHighlight(highlight.id) }),
					]),
				]))) : emptyState(m.noNotes, m.noNotesHint, "notes");
			}
			return h("div", { class: "cubexp-epub-navigator" }, [
				renderBookHeader(),
				h("div", { class: "cubexp-epub-tabs", role: "tablist" }, tabs.map(tab => h("button", {
					type: "button", role: "tab", "aria-selected": String(navigatorTab.value === tab.id),
					class: { "is-selected": navigatorTab.value === tab.id },
					onClick: () => { navigatorTab.value = tab.id; if (tab.id === "contents") scrollCurrentIntoView(); },
				}, [tab.label, tab.count ? h("small", String(tab.count)) : null]))),
				h("div", { class: "cubexp-epub-navigator__body", role: "tabpanel" }, [body]),
			]);
		}

		function renderSearch(): VNode {
			const m = t.value, s = search.value;
			const groups: Array<{ index: number; items: Array<{ result: EpubSearchResult; position: number }> }> = [];
			s.results.forEach((result, position) => {
				const last = groups.at(-1);
				if (last?.index === result.index) last.items.push({ result, position });
				else groups.push({ index: result.index, items: [{ result, position }] });
			});
			const status = s.running ? format(m.searching, { done: s.done, total: s.total })
				: s.ran ? (s.results.length ? format(s.limited ? m.resultsLimited : m.results, { count: s.results.length }) : m.noResults) : "";
			return h("div", { class: "cubexp-epub-search" }, [
				h("form", { class: "cubexp-epub-search__form", role: "search", onSubmit: (event: Event) => { event.preventDefault(); scheduleSearch(s.query, true); } }, [
					icon("search", { size: 18 }),
					h("input", {
						class: "cubexp-epub-search__input", type: "search", value: s.query, placeholder: m.searchPlaceholder, "aria-label": m.searchPlaceholder,
						enterkeyhint: "search", autocomplete: "off",
						onInput: (event: Event) => scheduleSearch((event.target as HTMLInputElement).value),
						onKeydown: (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); closePanel(); } },
					}),
					s.query ? button({ icon: "close", label: m.close, class: "cubexp-epub-search__clear", onClick: () => scheduleSearch("", true) }) : null,
				]),
				status ? h("p", { class: "cubexp-epub-search__status", role: "status" }, [s.running ? h("i", { class: "cubexp-epub-spinner is-small", "aria-hidden": "true" }) : null, status]) : null,
				s.ran || s.running ? h("div", { class: "cubexp-epub-search__results" }, groups.map(group => h("section", { key: group.index }, [
					h("h3", chapterLabel(group.index)),
					h("ul", group.items.map(({ result, position }) => h("li", { key: position }, h("button", {
						type: "button", class: { "is-active": s.active === position }, onClick: () => openSearchResult(position),
					}, [result.before ? `…${result.before}` : "", h("mark", result.match), result.after ? `${result.after}…` : ""])))),
				]))) : emptyState(m.search, m.searchHint, "search"),
			]);
		}

		function popoverStyle(rect: Rect, height = 48, widthHint = 300) {
			const host = stageHost.value;
			const hostWidth = host?.clientWidth ?? 600, hostHeight = host?.clientHeight ?? 600;
			const center = (rect.left + rect.right) / 2;
			const left = Math.min(hostWidth - widthHint / 2 - 8, Math.max(widthHint / 2 + 8, center));
			const above = rect.top - height - 12;
			const top = above > 8 ? above : Math.min(hostHeight - height - 8, rect.bottom + 12);
			return { left: `${left}px`, top: `${top}px` };
		}

		const colorDots = (selected: string | undefined, onPick: (color: string) => void) => Object.keys(HIGHLIGHT_COLORS).map(color => h("button", {
			type: "button", class: ["cubexp-epub-color", { "is-selected": selected === color }], "data-color": color,
			"aria-label": `${t.value.highlight} ${color}`, title: t.value.highlight,
			onClick: (event: MouseEvent) => { event.stopPropagation(); onPick(color); },
		}));

		function renderPopovers(): VNodeChild[] {
			const m = t.value, nodes: VNodeChild[] = [];
			if (selection.value) {
				const current = selection.value;
				nodes.push(h("div", { class: "cubexp-epub-popover cubexp-epub-menu", role: "toolbar", "aria-label": m.highlight, style: popoverStyle(current.rect), onPointerdown: (event: Event) => event.preventDefault() }, [
					...colorDots(undefined, color => addHighlight(color)),
					h("span", { class: "cubexp-epub-menu__divider" }),
					button({ icon: "note", label: m.note, onClick: () => addHighlight("yellow", true) }),
					button({ icon: "copy", label: m.copy, onClick: () => void copy(current.text) }),
					button({ icon: "search", label: m.searchSelection, onClick: () => { const text = current.text.slice(0, 80); view?.clearSelection(); openPanel("search", undefined, true); scheduleSearch(text, true); } }),
				]));
			}
			if (annotationMenu.value) {
				const highlight = state.value.highlights.find(item => item.id === annotationMenu.value!.id);
				if (highlight) nodes.push(h("div", { class: "cubexp-epub-popover cubexp-epub-menu", role: "toolbar", style: popoverStyle(annotationMenu.value.rect) }, [
					...colorDots(highlight.color, color => { updateHighlight(highlight.id, { color }); annotationMenu.value = null; }),
					h("span", { class: "cubexp-epub-menu__divider" }),
					button({ icon: "note", label: highlight.note ? m.editNote : m.note, onClick: () => { annotationMenu.value = null; noteEditor.value = { id: highlight.id, text: highlight.note ?? "", quote: highlight.text }; } }),
					button({ icon: "copy", label: m.copy, onClick: () => void copy(highlight.text) }),
					button({ icon: "trash", label: m.delete, onClick: () => removeHighlight(highlight.id) }),
				]));
			}
			if (footnote.value) {
				const note = footnote.value;
				nodes.push(h("div", { class: "cubexp-epub-popover cubexp-epub-footnote", role: "dialog", "aria-label": m.footnote, style: popoverStyle(note.rect, 160, 340) }, [
					h("div", { class: "cubexp-epub-footnote__head" }, [h("strong", m.footnote), button({ icon: "close", label: m.close, onClick: () => { footnote.value = null; } })]),
					h("p", note.text),
					h("button", { type: "button", class: "cubexp-epub-link", onClick: () => { footnote.value = null; void jump(note.target); } }, m.goToNote),
				]));
			}
			return nodes;
		}

		function renderNoteEditor(): VNode | null {
			const editor = noteEditor.value;
			if (!editor) return null;
			const m = t.value;
			const existing = state.value.highlights.find(item => item.id === editor.id)?.note;
			return h("div", { class: "cubexp-epub-modal", role: "presentation", onClick: (event: MouseEvent) => { if (event.target === event.currentTarget) noteEditor.value = null; } }, [
				h("form", { class: "cubexp-epub-modal__card", role: "dialog", "aria-modal": "true", "aria-label": m.note, onSubmit: (event: Event) => {
					event.preventDefault();
					updateHighlight(editor.id, { note: editor.text.trim() || undefined });
					noteEditor.value = null;
				} }, [
					h("blockquote", editor.quote),
					h("textarea", {
						value: editor.text, placeholder: m.notePlaceholder, rows: 5, "aria-label": m.note,
						onInput: (event: Event) => { editor.text = (event.target as HTMLTextAreaElement).value; },
						onVnodeMounted: (vnode: VNode) => (vnode.el as HTMLTextAreaElement | null)?.focus({ preventScroll: true }),
						onKeydown: (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); noteEditor.value = null; } },
					}),
					h("div", { class: "cubexp-epub-modal__actions" }, [
						existing ? h("button", { type: "button", class: "is-danger", onClick: () => { updateHighlight(editor.id, { note: undefined }); noteEditor.value = null; } }, m.delete) : h("span"),
						h("span", { class: "cubexp-epub-spacer" }),
						h("button", { type: "button", onClick: () => { noteEditor.value = null; } }, m.cancel),
						h("button", { type: "submit", class: "is-primary" }, m.save),
					]),
				]),
			]);
		}

		function pageLabel(loc: EpubViewLocation): string {
			if (loc.fixed) return `${(book.value?.spine.filter(item => item.linear).findIndex(item => item.index === loc.index) ?? 0) + 1} / ${book.value?.spine.filter(item => item.linear).length ?? 1}`;
			if (preferences.value.flow === "scrolled") return "";
			return format(t.value.pageOf, { page: loc.page + 1, pages: loc.pages });
		}

		function renderSlider(): VNode {
			const loc = location.value;
			const value = seek.value ?? Math.round((loc?.totalFraction ?? 0) * 1000);
			const preview = seek.value !== null && view ? view.targetForFraction(seek.value / 1000) : undefined;
			return h("div", { class: "cubexp-epub-slider" }, [
				preview ? h("div", { class: "cubexp-epub-slider__preview", style: { left: `${value / 10}%` } }, [h("strong", chapterLabel(preview.index)), h("span", percent(seek.value! / 1000))]) : null,
				h("input", {
					type: "range", min: 0, max: 1000, step: 1, value, "aria-label": t.value.progress, "aria-valuetext": percent(value / 1000),
					style: { "--epub-fill": `${value / 10}%` },
					onInput: (event: Event) => { seek.value = Number((event.target as HTMLInputElement).value); },
					onChange: (event: Event) => {
						const fraction = Number((event.target as HTMLInputElement).value) / 1000;
						seek.value = null;
						if (view) void jump(view.targetForFraction(fraction));
					},
					onPointerdown: (event: Event) => event.stopPropagation(),
				}),
			]);
		}

		function renderRunning(): VNodeChild[] {
			const loc = location.value;
			if (!loc || fixed.value) return [];
			const m = t.value;
			const pagesLeft = loc.pages - loc.page - 1;
			const right = preferences.value.flow === "scrolled" ? percent(loc.totalFraction)
				: `${pagesLeft > 0 ? format(m.pagesLeft, { count: pagesLeft }) : m.lastPage} · ${percent(loc.totalFraction)}`;
			return [
				h("div", { class: "cubexp-epub-running is-top", "aria-hidden": "true" }, h("span", currentChapter.value)),
				h("div", { class: "cubexp-epub-running is-bottom", "aria-hidden": "true" }, [h("span", pageLabel(loc)), h("span", right)]),
			];
		}

		/** Scrolling has no page to turn at a chapter's end, so offer the next one. */
		function renderChapterEnd(): VNode | null {
			const loc = location.value, current = book.value;
			if (!loc || !current || fixed.value || preferences.value.flow !== "scrolled" || loc.chapterFraction < 0.999 || loc.atEnd) return null;
			const next = current.spine.find(item => item.linear && item.index > loc.index);
			if (!next) return null;
			return h("button", { type: "button", class: "cubexp-epub-next-chapter", onClick: () => void view?.nextChapter() }, [
				h("small", t.value.nextChapter), h("span", chapterLabel(next.index)), icon("chevron-right", { size: 18 }),
			]);
		}

		function renderStage(): VNode {
			const m = t.value;
			return h("div", { class: "cubexp-epub-stage" }, [
				h("div", { ref: stageHost, class: "cubexp-epub-host", "aria-label": book.value?.metadata.title ?? props.fileName, role: "document" }),
				...renderRunning(),
				currentBookmark.value ? h("div", { class: "cubexp-epub-ribbon", "aria-hidden": "true" }) : null,
				!touch.value && location.value ? [
					h("button", { type: "button", class: "cubexp-epub-edge is-prev", "aria-label": m.previousPage, disabled: location.value.atStart, onClick: () => void view?.prev() }, icon("chevron-left", { size: 28 })),
					h("button", { type: "button", class: "cubexp-epub-edge is-next", "aria-label": m.nextPage, disabled: location.value.atEnd, onClick: () => void view?.next() }, icon("chevron-right", { size: 28 })),
				] : null,
				...renderPopovers(),
				renderChapterEnd(),
				jumpBack.value ? h("button", { type: "button", class: "cubexp-epub-chip", onClick: () => void returnBack() }, [icon("undo", { size: 18 }), h("span", format(m.returnTo, { label: jumpBack.value.label }))]) : null,
				busy.value && !opening.value ? h("div", { class: "cubexp-epub-busy", "aria-hidden": "true" }, h("i", { class: "cubexp-epub-spinner is-small" })) : null,
			]);
		}

		function renderOpening(): VNode | null {
			if (!opening.value && !error.value) return null;
			const m = t.value;
			return h("div", { class: "cubexp-epub-cover-screen", role: error.value ? "alert" : "status" }, error.value ? [
				icon("book", { size: 40 }), h("strong", m.openFailed), h("p", m.openFailedHint), h("code", error.value),
			] : [
				coverUrl.value ? h("img", { src: coverUrl.value, alt: "" }) : h("i", { class: "cubexp-epub-spinner" }),
				h("span", book.value?.metadata.title || m.opening),
			]);
		}

		function renderTouchChrome(): VNodeChild[] {
			const m = t.value, loc = location.value;
			return [
				h("header", { class: "cubexp-epub-bar is-top", "aria-hidden": String(!chrome.value), inert: !chrome.value || undefined }, [
					props.exitable ? button({ icon: "back", label: m.back, onClick: () => emit("exit") }) : null,
					h("div", { class: "cubexp-epub-bar__title" }, [h("strong", book.value?.metadata.title ?? props.fileName), h("small", currentChapter.value)]),
					button({ icon: "search", label: m.search, onClick: () => openPanel("search") }),
					button({ icon: "bookmark", label: currentBookmark.value ? m.removeBookmark : m.addBookmark, filled: Boolean(currentBookmark.value), active: Boolean(currentBookmark.value), onClick: toggleBookmark }),
				]),
				h("footer", { class: "cubexp-epub-bar is-bottom", "aria-hidden": String(!chrome.value), inert: !chrome.value || undefined }, [
					h("div", { class: "cubexp-epub-bar__progress" }, [
						button({ icon: "chevron-left", label: m.previousChapter, onClick: () => void view?.prevChapter(), disabled: !loc || loc.atStart }),
						renderSlider(),
						button({ icon: "chevron-right", label: m.nextChapter, onClick: () => void view?.nextChapter(), disabled: !loc || loc.atEnd }),
					]),
					h("nav", { class: "cubexp-epub-bar__tabs" }, [
						button({ icon: "contents", label: m.contents, text: m.contents, onClick: () => openPanel("navigator", "contents") }),
						button({ icon: "notes", label: m.notes, text: m.notes, onClick: () => openPanel("navigator", "notes") }),
						button({ icon: "type", label: m.appearance, text: m.appearance, onClick: () => openPanel("appearance") }),
						button({ icon: theme.value.dark ? "sun" : "moon", label: theme.value.dark ? m.dayMode : m.nightMode, text: theme.value.dark ? m.dayMode : m.nightMode, onClick: toggleNight }),
					]),
				]),
				panel.value ? h("div", { class: "cubexp-epub-scrim", onClick: () => closePanel() }) : null,
				panel.value ? h("section", {
					class: ["cubexp-epub-sheet", `is-${panel.value}`], role: "dialog", "aria-modal": "true",
					"aria-label": panel.value === "navigator" ? m.contents : panel.value === "search" ? m.search : m.appearance,
				}, [
					h("div", { class: "cubexp-epub-sheet__grabber", "aria-hidden": "true" }),
					h("header", { class: "cubexp-epub-sheet__head" }, [
						h("strong", panel.value === "navigator" ? book.value?.metadata.title : panel.value === "search" ? m.search : m.appearance),
						button({ icon: "close", label: m.close, onClick: () => closePanel() }),
					]),
					h("div", { class: "cubexp-epub-sheet__body" }, [panel.value === "navigator" ? renderNavigator() : panel.value === "search" ? renderSearch() : renderAppearance()]),
				]) : null,
			];
		}

		function renderToolbar(): VNode {
			const m = t.value;
			return h("header", { class: "cubexp-epub-toolbar" }, [
				button({ icon: "sidebar", label: m.toggleSidebar, active: sidebar.value, pressed: sidebar.value, onClick: () => { sidebar.value = !sidebar.value; if (sidebar.value) scrollCurrentIntoView(); } }),
				h("div", { class: "cubexp-epub-toolbar__title" }, [h("strong", book.value?.metadata.title ?? props.fileName), currentChapter.value && currentChapter.value !== book.value?.metadata.title ? h("span", currentChapter.value) : null]),
				button({ icon: "search", label: `${m.search} (Ctrl+F)`, active: panel.value === "search", pressed: panel.value === "search", onClick: () => openPanel("search") }),
				button({ icon: "bookmark", label: currentBookmark.value ? m.removeBookmark : m.addBookmark, filled: Boolean(currentBookmark.value), active: Boolean(currentBookmark.value), onClick: toggleBookmark }),
				h("div", { class: "cubexp-epub-anchor" }, [
					button({ icon: "type", label: m.appearance, active: panel.value === "appearance", pressed: panel.value === "appearance", onClick: () => openPanel("appearance") }),
					panel.value === "appearance" ? h("div", { class: "cubexp-epub-dropdown", role: "dialog", "aria-label": m.appearance }, renderAppearance()) : null,
				]),
			]);
		}

		function renderStatusbar(): VNode {
			const m = t.value, loc = location.value;
			return h("footer", { class: "cubexp-epub-statusbar" }, [
				button({ icon: "chevron-left", label: m.previousChapter, onClick: () => void view?.prevChapter(), disabled: !loc || loc.atStart }),
				h("span", { class: "cubexp-epub-statusbar__page" }, loc ? pageLabel(loc) : ""),
				renderSlider(),
				h("span", { class: "cubexp-epub-statusbar__percent" }, loc ? percent(loc.totalFraction) : ""),
				button({ icon: "chevron-right", label: m.nextChapter, onClick: () => void view?.nextChapter(), disabled: !loc || loc.atEnd }),
			]);
		}

		/** The stage keeps one vnode slot in both layouts so the rendered book survives a layout switch. */
		function renderMain(): VNode {
			const m = t.value, desktop = !touch.value;
			return h("div", { class: "cubexp-epub-main" }, [
				desktop && sidebar.value ? h("aside", { class: "cubexp-epub-sidebar", "aria-label": m.contents }, renderNavigator()) : null,
				renderStage(),
				desktop && panel.value === "search" ? h("aside", { class: "cubexp-epub-sidepanel", "aria-label": m.search }, [
					h("header", [h("strong", m.search), button({ icon: "close", label: m.close, onClick: () => closePanel() })]),
					renderSearch(),
				]) : null,
			]);
		}

		return () => {
			const current = theme.value;
			return h("section", {
				ref: root, class: "cubexp-epub", tabindex: -1,
				"data-form": touch.value ? "touch" : "desktop",
				"data-chrome": touch.value ? (chrome.value ? "on" : "off") : "on",
				"data-dark": current.dark ? "true" : undefined,
				"data-flow": preferences.value.flow,
				"aria-label": t.value.reader,
				style: {
					"--epub-bg": current.background, "--epub-fg": current.color, "--epub-chrome": current.chrome, "--epub-panel": current.panel,
					"--epub-muted": current.muted, "--epub-line": current.line, "--epub-accent": current.accent,
					"--epub-safe-top": `${safe.value.top}px`, "--epub-safe-bottom": `${safe.value.bottom}px`,
				},
				onKeydown: onKey,
			}, [
				touch.value ? null : renderToolbar(),
				renderMain(),
				touch.value ? null : renderStatusbar(),
				touch.value ? renderTouchChrome() : null,
				renderOpening(),
				renderNoteEditor(),
				toast.value ? h("div", { class: "cubexp-epub-toast", role: "status" }, toast.value) : null,
			]);
		};
	},
});
