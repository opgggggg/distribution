import { pageContentBounds } from "./board.js";
import { paintPage } from "./render.js";
import type { NotePage } from "./model.js";

export function captureNotesBoardPreview(page: NotePage): string | undefined {
	const area = pageContentBounds(page),
		scale = Math.min(1, 480 / Math.max(area.width, area.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.ceil(area.width * scale));
	canvas.height = Math.max(1, Math.ceil(area.height * scale));
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	ctx.scale(scale, scale);
	ctx.translate(-area.x, -area.y);
	paintPage(ctx, page, new Set(), area, scale);
	return canvas.toDataURL("image/png");
}
/** Existing host recent-files pipeline captures the notebook's active paper canvas. */
export function captureNotesPreview(surface: Element): string | undefined {
	const paper = surface.querySelector<
		HTMLCanvasElement & { boardPreview?: () => string | undefined }
	>(".cube-notes__paper-canvas");
	if (paper?.boardPreview) {
		const preview = paper.boardPreview();
		if (preview) return preview;
	}
	if (!paper?.width || !paper.height) return undefined;
	const canvas = document.createElement("canvas");
	const ratio = Math.min(1, 480 / Math.max(paper.width, paper.height));
	canvas.width = Math.max(1, Math.round(paper.width * ratio));
	canvas.height = Math.max(1, Math.round(paper.height * ratio));
	const ctx = canvas.getContext("2d");
	if (!ctx) return undefined;
	ctx.drawImage(paper, 0, 0, canvas.width, canvas.height);
	return canvas.toDataURL("image/png");
}

/** Remove the paper frame baked into previews generated before edge-to-edge capture. */
export function unframeNotesPreview(image: HTMLImageElement): string | undefined {
	if (image.naturalWidth !== 480 || image.naturalHeight !== 360) return;
	const canvas = document.createElement("canvas");
	canvas.width = 480;
	canvas.height = 360;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) return;
	try {
		ctx.drawImage(image, 0, 0);
		const pixels = ctx.getImageData(0, 0, 480, 360).data;
		if (pixels[0] !== 237 || pixels[1] !== 240 || pixels[2] !== 247 || pixels[3] !== 255)
			return;
		const bounds = new Map<
			number,
			{ count: number; x: number; y: number; right: number; bottom: number }
		>();
		for (let y = 0; y < 360; y++)
			for (let x = 0; x < 480; x++) {
				const i = (y * 480 + x) * 4;
				const color = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
				if (color === 0xedf0f7 || pixels[i + 3] !== 255) continue;
				const box = bounds.get(color);
				if (box) {
					box.count++;
					box.x = Math.min(box.x, x);
					box.y = Math.min(box.y, y);
					box.right = Math.max(box.right, x);
					box.bottom = Math.max(box.bottom, y);
				} else bounds.set(color, { count: 1, x, y, right: x, bottom: y });
			}
		// The flat paper color dominates the page; antialiased shadows do not.
		let paper = bounds.values().next().value;
		for (const box of bounds.values()) if (!paper || box.count > paper.count) paper = box;
		if (
			!paper ||
			paper.count < 3000 ||
			paper.x < 29 ||
			paper.y < 29 ||
			paper.right > 450 ||
			paper.bottom > 330
		)
			return;
		const width = paper.right - paper.x + 1,
			height = paper.bottom - paper.y + 1;
		if (
			width < 40 ||
			height < 40 ||
			Math.abs(paper.x + width / 2 - 240) > 2 ||
			Math.abs(paper.y + height / 2 - 180) > 2
		)
			return;
		canvas.width = width;
		canvas.height = height;
		ctx.drawImage(image, paper.x, paper.y, width, height, 0, 0, width, height);
		return canvas.toDataURL("image/png");
	} catch {
		return;
	}
}
