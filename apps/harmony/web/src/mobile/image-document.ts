import { decodeTiffPage } from "../image-codec";
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
		const decoded = await decodeTiffPage(await source.arrayBuffer(), page);
		const { width, height } = decoded;
		const factor = Math.min(1, Math.sqrt(16_000_000 / (width * height)), 8192 / Math.max(width, height));
		const output = imageCanvas(Math.max(1, Math.floor(width * factor)), Math.max(1, Math.floor(height * factor)));
		const context = output.getContext("2d")!;
		context.scale(factor, factor);
		context.drawImage(await decodeImage(decoded.blob), 0, 0);
		return { blob: await canvasBlob(output), pages: decoded.pages };
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
