import { photoCenter, photoLocal } from "./photo-geometry.js";
import type { Point } from "./geometry.js";
import type { InkImage, NotePage } from "./model.js";

export interface PreparedPhoto {
	src: string;
	width: number;
	height: number;
}
/** Embedded raster-only images keep notes portable and the canvas origin clean. */
export function validPhotoSource(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length <= 6 * 1024 * 1024 &&
		/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
	);
}
export function loadPhoto(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () =>
			image.naturalWidth && image.naturalHeight
				? resolve(image)
				: reject(new Error("图片为空。"));
		image.onerror = () =>
			reject(new Error("无法读取图片，请选择 JPEG、PNG 或设备支持的照片格式。"));
		image.src = src;
	});
}
export async function preparePhoto(
	file: Blob,
	decoder?: (source: Blob) => Promise<Blob | null>,
): Promise<PreparedPhoto> {
	if (file.size > 32 * 1024 * 1024) throw new Error("图片超过 32 MB，请选择较小的图片。");
	const url = URL.createObjectURL(file);
	let canvas: HTMLCanvasElement | undefined;
	try {
		let image: HTMLImageElement;
		try {
			image = await loadPhoto(url);
		} catch (reason) {
			const decoded = await decoder?.(file);
			if (!decoded) throw reason;
			const replacement = URL.createObjectURL(decoded);
			try {
				image = await loadPhoto(replacement);
			} finally {
				URL.revokeObjectURL(replacement);
			}
		}
		const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
		canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
		canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("无法处理图片。");
		const png = file.type === "image/png";
		if (!png) {
			ctx.fillStyle = "#fff";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}
		ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
		const src = canvas.toDataURL(png ? "image/png" : "image/jpeg", 0.86);
		if (!validPhotoSource(src)) throw new Error("图片内容过大，请选择较小的图片。");
		return { src, width: canvas.width, height: canvas.height };
	} finally {
		URL.revokeObjectURL(url);
		if (canvas) canvas.width = canvas.height = 0;
	}
}
export function pagePhotos(page: NotePage): InkImage[] {
	return [
		...(page.background ? [page.background] : []),
		...page.layers
			.filter((l) => l.visible)
			.flatMap((l) => l.elements)
			.filter((e): e is InkImage => e.kind === "image"),
	];
}
export async function loadPagePhotos(page: NotePage): Promise<Map<string, HTMLImageElement>> {
	const result = new Map<string, HTMLImageElement>();
	for (const photo of pagePhotos(page))
		if (!result.has(photo.src)) result.set(photo.src, await loadPhoto(photo.src));
	return result;
}
export function paintPhoto(
	ctx: CanvasRenderingContext2D,
	photo: InkImage,
	image: HTMLImageElement,
) {
	ctx.save();
	ctx.globalAlpha = photo.opacity;
	const center = photoCenter(photo);
	ctx.translate(center.x, center.y);
	ctx.rotate(((photo.angle ?? 0) * Math.PI) / 180);
	ctx.drawImage(image, -photo.width / 2, -photo.height / 2, photo.width, photo.height);
	ctx.restore();
}
export function photoSvg(photo: InkImage) {
	const c = photoCenter(photo);
	return `<image transform="rotate(${photo.angle ?? 0} ${c.x} ${c.y})" x="${photo.x}" y="${photo.y}" width="${photo.width}" height="${photo.height}" opacity="${photo.opacity}" href="${photo.src}" preserveAspectRatio="none"/>`;
}

/** Sample the embedded raster, independently of paper, ink and tracing opacity. */
export function samplePhotoColor(
	photo: InkImage,
	image: HTMLImageElement,
	point: Point,
	canvas: HTMLCanvasElement,
): string | undefined {
	const p = photoLocal(photo, point);
	if (p.x < 0 || p.y < 0 || p.x >= photo.width || p.y >= photo.height) return;
	const x = Math.min(
			image.naturalWidth - 1,
			Math.floor((p.x / photo.width) * image.naturalWidth),
		),
		y = Math.min(
			image.naturalHeight - 1,
			Math.floor((p.y / photo.height) * image.naturalHeight),
		);
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) return;
	ctx.clearRect(0, 0, 1, 1);
	ctx.drawImage(image, x, y, 1, 1, 0, 0, 1, 1);
	const pixel = ctx.getImageData(0, 0, 1, 1).data;
	if (!pixel[3]) return;
	return (
		"#" +
		Array.from(pixel.slice(0, 3))
			.map((n) => n.toString(16).padStart(2, "0"))
			.join("")
	);
}
