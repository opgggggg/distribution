import UTIF from "utif";
import { decodeImageWithHost } from "../harmony-host";
import { rasterizeMetafileBlobToPng } from "@yaochn/als-office-image";

export const IMAGE_MIME: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	svg: "image/svg+xml",
	bmp: "image/bmp",
	dib: "image/bmp",
	tif: "image/tiff",
	tiff: "image/tiff",
	heic: "image/heic",
	heif: "image/heif",
	hif: "image/heif",
	emf: "image/emf",
	wmf: "image/wmf",
};
export function imageExtension(name: string): string {
	return name.split(".").pop()?.toLowerCase() ?? "";
}
export function canvasBlob(
	canvas: HTMLCanvasElement,
	type = "image/png",
	quality = 0.9,
): Promise<Blob> {
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error("图片导出失败。"))),
			type,
			quality,
		),
	);
}
export function imageCanvas(width: number, height: number): HTMLCanvasElement {
	if (!width || !height || width * height > 16_000_000 || width > 8192 || height > 8192)
		throw new Error("图片处理尺寸超过设备预算，请先缩小图片。");
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(width);
	canvas.height = Math.round(height);
	return canvas;
}
export async function decodeImage(blob: Blob): Promise<HTMLImageElement> {
	const url = URL.createObjectURL(blob);
	try {
		const img = new Image();
		img.src = url;
		await img.decode();
		return img;
	} finally {
		URL.revokeObjectURL(url);
	}
}
/** All TIFF pages are retained. Only the selected page is decoded, with a bounded canvas. */
export async function readImagePreview(
	source: Blob,
	name: string,
	page = 0,
): Promise<{ blob: Blob; pages: number }> {
	const extension = imageExtension(name);
	const typed = source.slice(0, source.size, IMAGE_MIME[extension] ?? source.type);
	if (extension === "tif" || extension === "tiff") {
		const data = await source.arrayBuffer();
		const pages = UTIF.decode(data);
		const item = pages[page];
		if (!item) throw new Error("TIFF 页面不存在。");
		if (
			!(item.t256?.[0] ?? item.width) ||
			!(item.t257?.[0] ?? item.height) ||
			(item.t256?.[0] ?? item.width) * (item.t257?.[0] ?? item.height) > 40_000_000
		)
			throw new Error("TIFF 页面尺寸过大。");
		UTIF.decodeImage(data, item);
		const raw = document.createElement("canvas");
		raw.width = item.width;
		raw.height = item.height;
		raw.getContext("2d")!.putImageData(
			new ImageData(new Uint8ClampedArray(UTIF.toRGBA8(item)), item.width, item.height),
			0,
			0,
		);
		const orientation = item.t274?.[0] ?? 1;
		const swapped = orientation >= 5 && orientation <= 8;
		const width = swapped ? item.height : item.width,
			height = swapped ? item.width : item.height;
		const factor = Math.min(
			1,
			Math.sqrt(16_000_000 / (width * height)),
			8192 / Math.max(width, height),
		);
		const output = imageCanvas(
			Math.max(1, Math.floor(width * factor)),
			Math.max(1, Math.floor(height * factor)),
		);
		const context = output.getContext("2d")!;
		context.scale(factor, factor);
		const transforms: Record<number, number[]> = {
			2: [-1, 0, 0, 1, item.width, 0],
			3: [-1, 0, 0, -1, item.width, item.height],
			4: [1, 0, 0, -1, 0, item.height],
			5: [0, 1, 1, 0, 0, 0],
			6: [0, 1, -1, 0, item.height, 0],
			7: [0, -1, -1, 0, item.height, item.width],
			8: [0, -1, 1, 0, 0, item.width],
		};
		const transform = transforms[orientation];
		if (transform)
			context.transform(...(transform as [number, number, number, number, number, number]));
		context.drawImage(raw, 0, 0);
		raw.width = raw.height = 0;
		return { blob: await canvasBlob(output), pages: pages.length };
	}
	if (["emf", "wmf"].includes(extension)) {
		const blob = await rasterizeMetafileBlobToPng(typed);
		if (!blob) throw new Error("矢量图片无法读取。");
		return { blob, pages: 1 };
	}
	if (["heic", "heif", "hif"].includes(extension)) {
		try {
			await decodeImage(typed);
			return { blob: typed, pages: 1 };
		} catch {
			const decoded = await decodeImageWithHost(typed);
			if (!decoded) throw new Error("此设备无法读取 HEIC 照片。");
			return { blob: decoded, pages: 1 };
		}
	}
	return { blob: typed, pages: 1 };
}
