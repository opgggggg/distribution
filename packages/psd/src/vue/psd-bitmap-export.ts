import { encodePsdPng, scaleBitmap, type PsdBitmap } from "@cubexp/psd";

export type PsdRasterExportFormat = "png" | "jpeg" | "webp";

export interface PsdRasterExportOptions {
	format: PsdRasterExportFormat;
	width: number;
	height: number;
	quality?: number;
	matte?: string;
}

function sourceCanvas(bitmap: PsdBitmap): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas rendering is not available in this browser.");
	context.putImageData(
		new ImageData(new Uint8ClampedArray(bitmap.data), bitmap.width, bitmap.height),
		0,
		0,
	);
	return canvas;
}

export function renderPsdBitmapToCanvas(
	bitmap: PsdBitmap,
	width = bitmap.width,
	height = bitmap.height,
	matte?: string,
): HTMLCanvasElement {
	const targetWidth = Math.max(1, Math.round(width));
	const targetHeight = Math.max(1, Math.round(height));
	const rendered =
		targetWidth === bitmap.width && targetHeight === bitmap.height
			? bitmap
			: scaleBitmap(bitmap, targetWidth, targetHeight);
	const source = sourceCanvas(rendered);
	if (!matte) return source;

	const canvas = document.createElement("canvas");
	canvas.width = targetWidth;
	canvas.height = targetHeight;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas rendering is not available in this browser.");
	context.fillStyle = matte;
	context.fillRect(0, 0, targetWidth, targetHeight);
	context.drawImage(source, 0, 0);
	return canvas;
}

export function psdBitmapPreviewUrl(bitmap: PsdBitmap, maxWidth = 320, maxHeight = 240): string {
	const scale = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height, 1);
	return renderPsdBitmapToCanvas(
		bitmap,
		Math.max(1, Math.round(bitmap.width * scale)),
		Math.max(1, Math.round(bitmap.height * scale)),
	).toDataURL("image/png");
}

export async function exportPsdBitmap(
	bitmap: PsdBitmap,
	options: PsdRasterExportOptions,
): Promise<Blob> {
	const mimeType = `image/${options.format}`;
	if (options.format === "png" && !options.matte && options.width * options.height <= 16_000_000) {
		const resized =
			options.width === bitmap.width && options.height === bitmap.height
				? bitmap
				: scaleBitmap(bitmap, options.width, options.height);
		return new Blob([await encodePsdPng(resized)], { type: mimeType });
	}
	const canvas = renderPsdBitmapToCanvas(bitmap, options.width, options.height, options.matte);
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) resolve(blob);
				else
					reject(
						new Error(`The browser could not encode ${options.format.toUpperCase()}.`),
					);
			},
			mimeType,
			options.quality,
		);
	});
}

export function downloadPsdExport(blob: Blob, fileName: string): void {
	const anchor = document.createElement("a");
	anchor.href = URL.createObjectURL(blob);
	anchor.download = fileName;
	anchor.style.display = "none";
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(anchor.href), 1_000);
}
