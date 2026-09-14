import { readTextPrefix, TEXT_THUMBNAIL_BYTES } from "./large-file.js";
import { highlightText, detectTextLanguage, type TextSource, type TextOptions } from "./index.js";

export interface TextThumbnailOptions {
	fileName?: string;
	language?: string;
	/** Pixels; defaults to a 480 × 360 landscape preview. */
	width?: number;
	height?: number;
	quality?: number;
}

const tokenColors: Record<string, string> = {
	"hljs-keyword": "#cf222e", "hljs-type": "#cf222e", "hljs-literal": "#0550ae",
	"hljs-string": "#0a3069", "hljs-number": "#0550ae", "hljs-title": "#8250df",
	"hljs-comment": "#6e7781", "hljs-meta": "#953800", "hljs-attr": "#0550ae",
	"hljs-built_in": "#953800", "hljs-variable": "#953800",
};

/** Render from the beginning of the model, independent of scrolling and folding. Browser-only. */
export function renderTextThumbnail(text: string, options: TextThumbnailOptions = {}): string {
	const width = options.width ?? 480, height = options.height ?? 360, quality = options.quality ?? 0.8;
	if (![width, height].every(value => Number.isInteger(value) && value >= 160 && value <= 2048)) throw new RangeError("Thumbnail dimensions must be integers between 160 and 2048.");
	if (!Number.isFinite(quality) || quality < 0 || quality > 1) throw new RangeError("Thumbnail quality must be between 0 and 1.");
	const canvas = document.createElement("canvas");
	canvas.width = width; canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas is unavailable for text thumbnails.");
	// Layout uses a fixed logical width so higher-resolution previews preserve composition.
	const scale = width / 480, logicalHeight = height / scale;
	context.scale(scale, scale);
	context.fillStyle = "#ffffff"; context.fillRect(0, 0, 480, logicalHeight);
	context.fillStyle = "#f6f8fa"; context.fillRect(0, 0, 480, 40);
	context.fillStyle = "#1f6feb"; context.fillRect(0, 0, 4, 40);
	context.font = "600 13px system-ui, sans-serif"; context.fillStyle = "#24292f";
	context.save(); context.beginPath(); context.rect(14, 0, 352, 40); context.clip();
	const fileName = (options.fileName ?? "document.txt").split(/[\\/]/).pop()!;
	context.fillText(fileName.slice(0, 160), 14, 25); context.restore();
	context.font = "10px system-ui, sans-serif"; context.fillStyle = "#57606a";
	context.textAlign = "right";
	context.fillText((options.language ?? detectTextLanguage(fileName)).toUpperCase().slice(0, 18), 466, 25);
	context.textAlign = "left";
	const maxLines = Math.max(1, Math.floor((logicalHeight - 66) / 17));
	// Bound work even for a multi-megabyte minified single line.
	const prefix = text.slice(0, 24_000);
	const sourceLines = prefix.split(/\r\n|\r|\n/, maxLines + 1);
	const hasMore = sourceLines.length > maxLines || prefix.length < text.length;
	const code = sourceLines.slice(0, maxLines).map(line => line.slice(0, 180).replace(/\t/g, "    ")).join("\n");
	const template = document.createElement("template");
	// Only highlight.js-generated markup is parsed; source HTML remains escaped.
	const highlighted = highlightText(code, { fileName, language: options.language });
	if (highlighted.highlighted) template.innerHTML = highlighted.html;
	else template.content.append(document.createTextNode(code));
	context.fillStyle = "#f6f8fa"; context.fillRect(0, 40, 37, logicalHeight - 40);
	context.font = '11px Menlo, Consolas, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", monospace';
	context.textAlign = "right"; context.fillStyle = "#8c959f";
	for (let line = 0; line < Math.min(sourceLines.length, maxLines); line++) context.fillText(String(line + 1), 29, 59 + line * 17);
	context.textAlign = "left";
	context.save(); context.beginPath(); context.rect(43, 42, 424, logicalHeight - 58); context.clip();
	let x = 45, y = 59;
	function paint(node: Node, color: string) {
		if (node.nodeType === 3) {
			const parts = (node.textContent ?? "").split("\n");
			parts.forEach((part, index) => {
				if (index) { x = 45; y += 17; }
				context!.fillStyle = color;
				context!.fillText(part, x, y);
				x += context!.measureText(part).width;
			});
			return;
		}
		const nextColor = node instanceof Element
			? Array.from(node.classList).map(name => tokenColors[name]).find(Boolean) ?? color : color;
		for (const child of node.childNodes) paint(child, nextColor);
	}
	paint(template.content, "#24292f"); context.restore();
	if (!text) { context.fillStyle = "#8c959f"; context.fillText("Empty file", 45, 59); }
	if (hasMore) { context.fillStyle = "#6e7781"; context.fillText("…", 45, logicalHeight - 5); }
	return canvas.toDataURL("image/jpeg", quality);
}

/** Read a File/Blob, buffer or literal text and produce a cache-compatible JPEG data URL. */
export async function generateTextThumbnail(source: TextSource, options: TextThumbnailOptions & Pick<TextOptions, "encoding" | "maxBytes" | "signal"> = {}): Promise<string> {
	options.signal?.throwIfAborted();
	const size = typeof source === "string" ? source.length : source instanceof Blob ? source.size : source.byteLength;
	if (options.maxBytes !== undefined && (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0 || size > options.maxBytes)) throw new RangeError("Thumbnail source exceeds maxBytes.");
	const fileName = options.fileName ?? (typeof File !== "undefined" && source instanceof File ? source.name : "document.txt");
	if (typeof source === "string") return renderTextThumbnail(source.slice(0, 24_000), { ...options, fileName });
	const bytes = source instanceof Uint8Array ? source : source instanceof ArrayBuffer ? new Uint8Array(source) : undefined;
	const blob = source instanceof Blob ? source : new Blob([bytes!.subarray(0, TEXT_THUMBNAIL_BYTES + 4).slice().buffer as ArrayBuffer]);
	const text = await readTextPrefix(blob, options);
	return renderTextThumbnail(text, { ...options, fileName });
}

type PreviewSource = { text: string; fileName: string };
const previewSources = new WeakMap<HTMLElement, () => PreviewSource | undefined | Promise<PreviewSource | undefined>>();

/** Internal host bridge; providers are released when their editor unmounts. */
export function registerTextPreview(element: HTMLElement, source: () => PreviewSource | undefined | Promise<PreviewSource | undefined>): () => void {
	previewSources.set(element, source);
	return () => { previewSources.delete(element); };
}

/** Wait briefly for a mounted editor's asynchronous file read; never open another file. */
export async function captureTextPreview(surface: HTMLElement): Promise<string | undefined> {
	for (let attempt = 0; attempt < 60 && surface.isConnected; attempt++) {
		const host = surface.matches(".cubexp-text-editor__host, .cubexp-text-large") ? surface : surface.querySelector<HTMLElement>(".cubexp-text-editor__host, .cubexp-text-large");
		const source = host ? await previewSources.get(host)?.() : undefined;
		if (source) return renderTextThumbnail(source.text, { fileName: source.fileName });
		if (surface.querySelector('[role="alert"]')) return;
		await new Promise(resolve => setTimeout(resolve, 50));
	}
}
