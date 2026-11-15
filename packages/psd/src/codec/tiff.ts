/// <reference path="../vendor.d.ts" />
import UTIF from "utif";
import type { PsdBitmap } from "./document";
/** Decode the first full image of a TIFF, applying all eight EXIF orientations. */
export function decodePsdTiff(bytes: Uint8Array): PsdBitmap {
	const buffer = bytes.slice().buffer,
		images = UTIF.decode(buffer),
		image = images[0];
	if (!image) throw new Error("TIFF contains no image");
	const sw = image.t256?.[0] ?? 0,
		sh = image.t257?.[0] ?? 0,
		orientation = image.t274?.[0] ?? 1;
	if (
		!Number.isInteger(sw) ||
		!Number.isInteger(sh) ||
		sw < 1 ||
		sh < 1 ||
		sw > 30000 ||
		sh > 30000 ||
		sw * sh > 80_000_000
	)
		throw new Error("TIFF dimensions exceed the supported pixel budget");
	if (!Number.isInteger(orientation) || orientation < 1 || orientation > 8)
		throw new Error("Invalid TIFF orientation");
	UTIF.decodeImage(buffer, image);
	const rgba = UTIF.toRGBA8(image);
	if (rgba.length !== sw * sh * 4) throw new Error("TIFF pixel data is incomplete");
	const width = orientation >= 5 ? sh : sw,
		height = orientation >= 5 ? sw : sh,
		data = new Uint8ClampedArray(rgba.length);
	for (let y = 0; y < sh; y++)
		for (let x = 0; x < sw; x++) {
			const [dx, dy] =
				orientation === 1
					? [x, y]
					: orientation === 2
						? [sw - 1 - x, y]
						: orientation === 3
							? [sw - 1 - x, sh - 1 - y]
							: orientation === 4
								? [x, sh - 1 - y]
								: orientation === 5
									? [y, x]
									: orientation === 6
										? [sh - 1 - y, x]
										: orientation === 7
											? [sh - 1 - y, sw - 1 - x]
											: [y, sw - 1 - x];
			data.set(rgba.subarray((y * sw + x) * 4, (y * sw + x + 1) * 4), (dy * width + dx) * 4);
		}
	return { width, height, data };
}
