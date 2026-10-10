import type { EpubFlow, EpubSpread, EpubViewTheme } from "../view.js";

export type ReaderThemeName = "auto" | "light" | "sepia" | "green" | "dark" | "black";
export type ReaderFont = "publisher" | "serif" | "sans" | "kai";
export type ReaderMargin = "narrow" | "normal" | "wide";

export interface ReaderPreferences {
	theme: ReaderThemeName;
	fontSize: number;
	lineHeight: number;
	font: ReaderFont;
	margin: ReaderMargin;
	flow: EpubFlow;
	spread: EpubSpread;
	justify: boolean;
	publisherStyles: boolean;
	animate: boolean;
}

export interface ReaderTheme extends EpubViewTheme {
	/** Translucent bar background over the page. */
	chrome: string;
	panel: string;
	muted: string;
	line: string;
	accent: string;
}

export const READER_THEMES: Record<Exclude<ReaderThemeName, "auto">, ReaderTheme> = {
	light: { background: "#ffffff", color: "#1f1f1f", link: "#1d4ed8", dark: false, chrome: "rgba(255, 255, 255, 0.92)", panel: "#ffffff", muted: "#6b7280", line: "rgba(15, 23, 42, 0.1)", accent: "#2563eb" },
	sepia: { background: "#f5ecd7", color: "#4a3a2a", link: "#8a4b14", dark: false, chrome: "rgba(245, 236, 215, 0.93)", panel: "#fbf5e6", muted: "#8b7660", line: "rgba(74, 58, 42, 0.16)", accent: "#a0522d" },
	green: { background: "#cde5cd", color: "#1f3322", link: "#1f6b3a", dark: false, chrome: "rgba(205, 229, 205, 0.93)", panel: "#e1f0e1", muted: "#4f6b52", line: "rgba(31, 51, 34, 0.16)", accent: "#2f7d46" },
	dark: { background: "#1c1c1e", color: "#d6d3cd", link: "#8ab4ff", dark: true, chrome: "rgba(38, 38, 40, 0.94)", panel: "#2a2a2c", muted: "#8e8e93", line: "rgba(255, 255, 255, 0.1)", accent: "#7aa7ff" },
	black: { background: "#000000", color: "#b9b4ab", link: "#7aa7ff", dark: true, chrome: "rgba(20, 20, 20, 0.95)", panel: "#161616", muted: "#7c7c80", line: "rgba(255, 255, 255, 0.1)", accent: "#7aa7ff" },
};

export const READER_FONTS: Record<ReaderFont, string> = {
	publisher: "",
	serif: `"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "Noto Serif SC", Georgia, "Times New Roman", serif`,
	sans: `-apple-system, BlinkMacSystemFont, "PingFang SC", "HarmonyOS Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", "Segoe UI", Roboto, sans-serif`,
	kai: `"Kaiti SC", "STKaiti", "KaiTi", "Noto Serif CJK SC", serif`,
};

export const READER_MARGINS: Record<ReaderMargin, number> = { narrow: 0.04, normal: 0.07, wide: 0.11 };

export const FONT_SIZES = [12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 30, 32, 36];
export const LINE_HEIGHTS = [1.4, 1.6, 1.8, 2.0];

export const DEFAULT_PREFERENCES: ReaderPreferences = {
	theme: "auto", fontSize: 18, lineHeight: 1.8, font: "publisher", margin: "normal",
	flow: "paginated", spread: "auto", justify: true, publisherStyles: true, animate: true,
};

const PREFERENCES_KEY = "cubexp.epub.preferences.v1";
const BOOK_KEY = "cubexp.epub.book.v1:";

function storage(): Storage | undefined {
	try { return globalThis.localStorage; } catch { return undefined; }
}

function readJson<T>(key: string): T | undefined {
	try {
		const value = storage()?.getItem(key);
		return value ? JSON.parse(value) as T : undefined;
	} catch { return undefined; }
}

function writeJson(key: string, value: unknown): void {
	try { storage()?.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked: reading still works */ }
}

export function loadPreferences(): ReaderPreferences {
	const saved = readJson<Partial<ReaderPreferences>>(PREFERENCES_KEY) ?? {};
	const merged = { ...DEFAULT_PREFERENCES, ...saved };
	if (!FONT_SIZES.includes(merged.fontSize)) merged.fontSize = DEFAULT_PREFERENCES.fontSize;
	if (!(merged.theme in READER_THEMES) && merged.theme !== "auto") merged.theme = "auto";
	return merged;
}

export function savePreferences(preferences: ReaderPreferences): void { writeJson(PREFERENCES_KEY, preferences); }

export interface ReaderBookmark {
	id: string;
	index: number;
	point?: string;
	fraction: number;
	excerpt: string;
	createdAt: number;
}

export interface ReaderHighlight {
	id: string;
	index: number;
	start: string;
	end: string;
	text: string;
	color: string;
	note?: string;
	createdAt: number;
}

export interface ReaderBookState {
	position?: { index: number; point?: string; fraction: number; totalFraction: number };
	bookmarks: ReaderBookmark[];
	highlights: ReaderHighlight[];
	updatedAt?: number;
}

export function loadBookState(key: string): ReaderBookState {
	const saved = readJson<Partial<ReaderBookState>>(BOOK_KEY + key);
	return { position: saved?.position, bookmarks: saved?.bookmarks ?? [], highlights: saved?.highlights ?? [], updatedAt: saved?.updatedAt };
}

export function saveBookState(key: string, state: ReaderBookState): void {
	writeJson(BOOK_KEY + key, { ...state, updatedAt: Date.now() });
}

export function createId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
