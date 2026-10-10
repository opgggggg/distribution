export interface EpubPreviewSource {
	cover?: Blob;
	title: string;
	author?: string;
}

const previewSources = new WeakMap<Element, () => EpubPreviewSource | undefined>();

/** Lets the host's recent-files pipeline ask a mounted reader for its cover. */
export function registerEpubPreview(element: Element, source: () => EpubPreviewSource | undefined): () => void {
	previewSources.set(element, source);
	return () => { previewSources.delete(element); };
}

export function isEpubSurface(surface: Element): boolean {
	return surface.matches(".cubexp-epub") || Boolean(surface.querySelector(".cubexp-epub"));
}

/** 480 × 360 preview: the cover centred on a soft backdrop, or a typeset title card. */
export async function captureEpubPreview(surface: Element, options: { width?: number; height?: number } = {}): Promise<string | undefined> {
	const host = surface.matches(".cubexp-epub") ? surface : surface.querySelector(".cubexp-epub");
	const source = host ? previewSources.get(host)?.() : undefined;
	if (!source) return undefined;
	const width = options.width ?? 480, height = options.height ?? 360;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) return undefined;
	context.fillStyle = "#f3efe6";
	context.fillRect(0, 0, width, height);
	let drawn = false;
	if (source.cover) {
		try {
			const bitmap = await createImageBitmap(source.cover);
			const scale = Math.min((height - 40) / bitmap.height, (width - 40) / bitmap.width);
			const w = bitmap.width * scale, h = bitmap.height * scale;
			const x = (width - w) / 2, y = (height - h) / 2;
			context.shadowColor = "rgba(0, 0, 0, 0.25)";
			context.shadowBlur = 18;
			context.shadowOffsetY = 6;
			context.drawImage(bitmap, x, y, w, h);
			bitmap.close?.();
			drawn = true;
		} catch { /* unsupported image type: fall back to the title card */ }
	}
	if (!drawn) {
		const w = 190, h = 270, x = (width - w) / 2, y = (height - h) / 2;
		context.shadowColor = "rgba(0, 0, 0, 0.2)";
		context.shadowBlur = 16;
		context.shadowOffsetY = 6;
		context.fillStyle = "#3d5a80";
		context.fillRect(x, y, w, h);
		context.shadowColor = "transparent";
		context.fillStyle = "rgba(255, 255, 255, 0.18)";
		context.fillRect(x + 10, y, 4, h);
		context.fillStyle = "#ffffff";
		context.textAlign = "center";
		context.font = "600 20px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
		wrap(context, source.title, x + w / 2, y + 90, w - 36, 26, 4);
		if (source.author) {
			context.font = "14px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
			context.fillStyle = "rgba(255, 255, 255, 0.8)";
			wrap(context, source.author, x + w / 2, y + h - 40, w - 36, 18, 1);
		}
	}
	return canvas.toDataURL("image/png");
}

function wrap(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number): void {
	const lines: string[] = [];
	let line = "";
	for (const char of Array.from(text)) {
		if (context.measureText(line + char).width > maxWidth && line) { lines.push(line); line = char; }
		else line += char;
	}
	if (line) lines.push(line);
	lines.slice(0, maxLines).forEach((value, index) => {
		const last = index === maxLines - 1 && lines.length > maxLines;
		context.fillText(last ? `${value.slice(0, -1)}…` : value, x, y + index * lineHeight);
	});
}
