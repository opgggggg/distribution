import { createPsdBitmap, type PsdDocument } from "./codec/document";
import type { PsdRgbColor } from "./render/raster-ops";

export interface CreateBlankPsdDocumentOptions {
	width?: number;
	height?: number;
	resolutionPpi?: number;
	/** Null creates a transparent canvas. */
	background?: PsdRgbColor | null;
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
	const resolved = value ?? fallback;
	if (!Number.isInteger(resolved) || resolved <= 0 || resolved > 30_000) {
		throw new RangeError(`${name} must be an integer between 1 and 30000.`);
	}
	return resolved;
}

/** Create the native blank model used by headless and Vue PSD sessions. */
export function createBlankPsdDocument(options: CreateBlankPsdDocumentOptions = {}): PsdDocument {
	const width = positiveInteger(options.width, 800, "width");
	const height = positiveInteger(options.height, 600, "height");
	if (width * height > 80_000_000)
		throw new RangeError("Canvas exceeds the 80 million pixel limit.");
	const resolutionPpi = positiveInteger(options.resolutionPpi, 72, "resolutionPpi");
	const background = options.background ?? { r: 255, g: 255, b: 255 };
	const bitmap = createPsdBitmap(width, height);
	for (let index = 0; index < bitmap.data.length; index += 4) {
		bitmap.data[index] = background.r;
		bitmap.data[index + 1] = background.g;
		bitmap.data[index + 2] = background.b;
		bitmap.data[index + 3] = options.background === null ? 0 : 255;
	}
	return {
		width,
		height,
		colorMode: "rgb",
		bitsPerChannel: 8,
		resolutionPpi,
		layers: [
			{
				kind: "raster",
				id: "L1",
				name: "Background",
				visible: true,
				opacity: 1,
				blendMode: "normal",
				clipping: false,
				locks: { transparency: false, composite: false, position: false, all: false },
				preservedBlocks: [],
				top: 0,
				left: 0,
				bitmap,
			},
		],
		editable: true,
		composite: null,
		openWarnings: [],
		colorModeData: new Uint8Array(0),
		preservedResources: [],
		globalLayerMaskInfo: new Uint8Array(0),
		preservedGlobalBlocks: [],
	};
}
