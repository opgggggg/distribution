import { psdBytesToBase64, psdBase64ToBytes, type PsdBitmap } from "@cubexp/psd";
import { exportPsdBitmap } from "./psd-bitmap-export";
export interface PsdBackgroundSettings {
	advanced: boolean;
	refineEdges: number;
	shiftEdge: number;
	contrast: number;
}
export interface PsdImageServices {
	decodeImage?(bytes: Uint8Array, mimeType: string): Promise<PsdBitmap>;
	foregroundMask?(bitmap: PsdBitmap, settings: PsdBackgroundSettings): Promise<Uint8Array>;
}
export async function bitmapFromPng(bytes: Uint8Array): Promise<PsdBitmap> {
	const image = await createImageBitmap(new Blob([bytes.slice().buffer], { type: "image/png" }));
	try {
		if (image.width * image.height > 80_000_000) throw Error("Image is too large");
		const canvas = document.createElement("canvas");
		canvas.width = image.width;
		canvas.height = image.height;
		const context = canvas.getContext("2d")!;
		context.drawImage(image, 0, 0);
		return {
			width: image.width,
			height: image.height,
			data: context.getImageData(0, 0, image.width, image.height).data,
		};
	} finally {
		image.close();
	}
}
/** Connect to an explicitly configured same-origin native image bridge. */
export function createPsdNativeImageServices(endpoint = "/__psd/native"): PsdImageServices {
	async function send(operation: string, bytes: Uint8Array, settings?: PsdBackgroundSettings) {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ operation, data: psdBytesToBase64(bytes), ...settings }),
		});
		const result = await response.json();
		if (!response.ok || result.error)
			throw Error(result.error || "Native image service failed");
		return psdBase64ToBytes(result.data);
	}
	return createPsdImageServicesFromTransport(send);
}
export function createPsdImageServicesFromTransport(transport: (operation: "decode" | "foreground", bytes: Uint8Array, settings?: PsdBackgroundSettings) => Promise<Uint8Array>): PsdImageServices {
	const send = async (operation: "decode" | "foreground", bytes: Uint8Array, settings?: PsdBackgroundSettings) => bitmapFromPng(await transport(operation, bytes, settings));
	return {
		decodeImage: (bytes) => send("decode", bytes),
		foregroundMask: async (bitmap, settings) => {
			const png = await exportPsdBitmap(bitmap, {
				format: "png",
				width: bitmap.width,
				height: bitmap.height,
			});
			const mask = await send(
				"foreground",
				new Uint8Array(await png.arrayBuffer()),
				settings,
			);
			if (mask.width !== bitmap.width || mask.height !== bitmap.height)
				throw Error("Foreground mask dimensions do not match");
			const data = new Uint8Array(mask.width * mask.height);
			for (let i = 0; i < data.length; i++) data[i] = mask.data[i * 4];
			return data;
		},
	};
}
