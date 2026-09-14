import hljs from "highlight.js/lib/common";
export { TEXT_EXTENSIONS, TEXT_FORMAT_MANIFEST } from "./formats.js";
export { createTextBuffer, TextBuffer, type TextSaveOptions } from "./buffer.js";

/** Strings are literal text, never URLs. Fetch remote files explicitly in the host. */
export type TextSource = string | Blob | ArrayBuffer | Uint8Array;
export interface TextOptions {
	fileName?: string;
	/** TextDecoder label, e.g. utf-8, gb18030 or windows-1252. BOM wins. */
	encoding?: string;
	/** highlight.js language/alias; plaintext disables highlighting. */
	language?: string;
	maxBytes?: number;
	maxHighlightLength?: number;
	signal?: AbortSignal;
}
export interface TextDocument {
	fileName: string;
	text: string;
	/** Escaped HTML with highlight.js spans; safe to render as code innerHTML. */
	html: string;
	language: string;
	encoding: string;
	lineCount: number;
	highlighted: boolean;
}

const extensions: Record<string, string> = {
	js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
	ts: "typescript", mts: "typescript", cts: "typescript", tsx: "typescript",
	json: "json", css: "css", html: "xml", htm: "xml", xml: "xml", svg: "xml", vue: "xml",
	md: "markdown", markdown: "markdown", py: "python", rb: "ruby", sh: "bash",
	bash: "bash", zsh: "bash", yml: "yaml", yaml: "yaml", toml: "ini", ini: "ini",
	java: "java", c: "c", h: "c", cpp: "cpp", hpp: "cpp", cc: "cpp", cs: "csharp",
	go: "go", rs: "rust", sql: "sql", php: "php", swift: "swift", kt: "kotlin",
	less: "less", scss: "scss", diff: "diff", patch: "diff", txt: "plaintext", log: "plaintext",
	jsonl: "json", jsonc: "json", pyw: "python", cxx: "cpp", kts: "kotlin",
	properties: "ini", conf: "ini", cfg: "ini", env: "ini", gradle: "groovy", groovy: "groovy",
};

export function detectTextLanguage(fileName = ""): string {
	const name = fileName.split(/[\\/]/).pop()!.toLowerCase();
	const language = name === "dockerfile" ? "dockerfile"
		: name === "makefile" ? "makefile"
		: extensions[name.split(".").pop()!] ?? "plaintext";
	return hljs.getLanguage(language) ? language : "plaintext";
}

function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (char) => ({
		"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;",
	})[char]!);
}

function budget(value: number, name: string): number {
	if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer.`);
	return value;
}

export function highlightText(text: string, options: Pick<TextOptions, "fileName" | "language" | "maxHighlightLength"> = {}) {
	const limit = budget(options.maxHighlightLength ?? 200_000, "maxHighlightLength");
	const requested = options.language?.toLowerCase() ?? detectTextLanguage(options.fileName);
	const language = hljs.getLanguage(requested) ? requested : "plaintext";
	if (language === "plaintext" || text.length > limit) {
		return { html: escapeHtml(text), language, highlighted: false };
	}
	try {
		return { html: hljs.highlight(text, { language, ignoreIllegals: true }).value, language, highlighted: true };
	} catch {
		return { html: escapeHtml(text), language, highlighted: false };
	}
}

export async function readTextDocument(source: TextSource, options: TextOptions = {}): Promise<TextDocument> {
	options.signal?.throwIfAborted();
	const maxBytes = budget(options.maxBytes ?? 8 * 1024 * 1024, "maxBytes");
	const fileName = options.fileName ?? (typeof File !== "undefined" && source instanceof File ? source.name : "document.txt");
	let text: string;
	let encoding = "unicode";
	if (typeof source === "string") {
		if (source.length > maxBytes || new TextEncoder().encode(source).byteLength > maxBytes) {
			throw new RangeError(`Text file exceeds ${maxBytes} bytes.`);
		}
		text = source;
	} else {
		const size = source instanceof Blob ? source.size : source.byteLength;
		if (size > maxBytes) throw new RangeError(`Text file exceeds ${maxBytes} bytes.`);
		const bytes = source instanceof Uint8Array ? source
			: new Uint8Array(source instanceof Blob ? await source.arrayBuffer() : source);
		options.signal?.throwIfAborted();
		const label = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? "utf-8"
			: bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le"
			: bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : options.encoding ?? "utf-8";
		const decoder = new TextDecoder(label, { fatal: true });
		encoding = decoder.encoding;
		text = decoder.decode(bytes);
		if (text.includes("\0")) throw new TypeError("The file contains binary data and cannot be displayed as text.");
	}
	options.signal?.throwIfAborted();
	return {
		fileName, text, encoding,
		lineCount: text.split(/\r\n|\r|\n/).length,
		...highlightText(text, { ...options, fileName }),
	};
}
