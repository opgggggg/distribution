import type { PsdSourceTransform } from "../render/affine";
/**
 * In-memory PSD document model. Pixel data lives in immutable `PsdBitmap`
 * values so undo snapshots can share unedited layers structurally; every
 * section the codec does not interpret travels through the model as opaque
 * bytes and is written back verbatim (source preservation).
 */

export type PsdColorMode =
	| "bitmap"
	| "grayscale"
	| "indexed"
	| "rgb"
	| "cmyk"
	| "multichannel"
	| "duotone"
	| "lab";

export const PSD_COLOR_MODES: readonly PsdColorMode[] = [
	"bitmap",
	"grayscale",
	"indexed",
	"rgb",
	"cmyk",
	"multichannel",
	"duotone",
	"lab",
];

/** PSD color-mode codes are not contiguous (5 and 6 are reserved). */
export const PSD_COLOR_MODE_CODES: Readonly<Record<PsdColorMode, number>> = {
	bitmap: 0,
	grayscale: 1,
	indexed: 2,
	rgb: 3,
	cmyk: 4,
	multichannel: 7,
	duotone: 8,
	lab: 9,
};

/**
 * Blend modes the compositor implements. PSD blend-mode keys without an entry
 * here render as `normal` and are flagged in `PsdLayerBase.blendModeFallback`.
 */
export type PsdBlendMode =
	| "normal"
	| "dissolve"
	| "darken"
	| "multiply"
	| "color-burn"
	| "linear-burn"
	| "lighten"
	| "screen"
	| "color-dodge"
	| "linear-dodge"
	| "overlay"
	| "soft-light"
	| "hard-light"
	| "difference"
	| "exclusion"
	| "hue"
	| "saturation"
	| "color"
	| "luminosity";

/** PSD 4-character blend keys for the modes the compositor implements. */
export const PSD_BLEND_MODE_KEYS: Record<PsdBlendMode, string> = {
	normal: "norm",
	dissolve: "diss",
	darken: "dark",
	multiply: "mul ",
	"color-burn": "idiv",
	"linear-burn": "lbrn",
	lighten: "lite",
	screen: "scrn",
	"color-dodge": "div ",
	"linear-dodge": "lddg",
	overlay: "over",
	"soft-light": "sLit",
	"hard-light": "hLit",
	difference: "diff",
	exclusion: "smud",
	hue: "hue ",
	saturation: "sat ",
	color: "colr",
	luminosity: "lum ",
};

const KEY_TO_BLEND_MODE = new Map<string, PsdBlendMode>(
	(Object.entries(PSD_BLEND_MODE_KEYS) as Array<[PsdBlendMode, string]>).map(([mode, key]) => [
		key,
		mode,
	]),
);

export function psdBlendModeFromKey(key: string): PsdBlendMode | undefined {
	return KEY_TO_BLEND_MODE.get(key);
}

export const PSD_BLEND_MODES: readonly PsdBlendMode[] = Object.keys(
	PSD_BLEND_MODE_KEYS,
) as PsdBlendMode[];

export function isPsdBlendMode(value: unknown): value is PsdBlendMode {
	return typeof value === "string" && value in PSD_BLEND_MODE_KEYS;
}

/** Straight (non-premultiplied) RGBA pixels. Treated as immutable once built. */
export interface PsdBitmap {
	readonly width: number;
	readonly height: number;
	/** RGBA, row-major, `width * height * 4` bytes. */
	readonly data: Uint8ClampedArray;
}

export function createPsdBitmap(width: number, height: number): PsdBitmap {
	return { width, height, data: new Uint8ClampedArray(Math.max(0, width * height * 4)) };
}

export function clonePsdBitmap(bitmap: PsdBitmap): PsdBitmap {
	return { width: bitmap.width, height: bitmap.height, data: bitmap.data.slice() };
}

/** A grayscale layer mask positioned on the canvas. */
export interface PsdLayerMask {
	/** False lets the image move independently of this mask. */
	linked?: boolean;
	readonly top: number;
	readonly left: number;
	readonly bottom: number;
	readonly right: number;
	/** Value used outside the mask rectangle: 0 hides, 255 shows. */
	readonly defaultColor: number;
	readonly disabled: boolean;
	/** One byte per pixel, `(right-left) * (bottom-top)` bytes. */
	readonly data: Uint8Array;
}

/** An additional-layer-info block preserved byte-for-byte. */
export interface PsdPreservedBlock {
	/** '8BIM' or '8B64'. */
	readonly signature: string;
	/** Four-character block key, e.g. 'lfx2'. */
	readonly key: string;
	readonly data: Uint8Array;
}

/** An image-resource block (8BIM id + body) preserved byte-for-byte. */
export interface PsdPreservedResource {
	readonly id: number;
	readonly name: string;
	readonly data: Uint8Array;
}

export interface PsdLayerLocks {
	transparency: boolean;
	composite: boolean;
	position: boolean;
	/** Convenience: every lock bit set. */
	all: boolean;
}

/** Editable, single-run formatting used by the browser text renderer. */
export interface PsdTextStyle {
	fontFamily: string;
	/** Font size in canvas pixels. */
	fontSize: number;
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strikethrough: boolean;
	color: { r: number; g: number; b: number };
}

export interface PsdTextContent {
	/** Plain text content with '\n' line breaks. */
	text: string;
	/** Browser-editable formatting; absent on PSDs that predate ALS text-style metadata. */
	style?: PsdTextStyle;
	/**
	 * The original 'TySh' block bytes. Rewritten only when the text content
	 * changes; otherwise emitted verbatim.
	 */
	raw: Uint8Array;
}

interface PsdLayerCommon {
	/** Stable in-session id ('lyid' when present, else assigned on load). */
	readonly id: string;
	name: string;
	visible: boolean;
	/** 0..1 */
	opacity: number;
	blendMode: PsdBlendMode;
	/** True when the file used a blend mode the compositor cannot reproduce. */
	blendModeFallback?: string;
	clipping: boolean;
	locks: PsdLayerLocks;
	mask?: PsdLayerMask;
	/** Unparsed additional-info blocks carried through saves. */
	preservedBlocks: readonly PsdPreservedBlock[];
}

export interface PsdRasterLayer extends PsdLayerCommon {
	readonly kind: "raster";
	/** Canvas-space position of the bitmap's top-left corner. */
	top: number;
	left: number;
	bitmap: PsdBitmap;
	sourceTransform?: PsdSourceTransform;
	adjustment?: import("../render/adjustment-layers").PsdLiveAdjustment;
	curves?: import("../render/curves").PsdCurves;
}

export interface PsdTextLayer extends PsdLayerCommon {
	readonly kind: "text";
	top: number;
	left: number;
	/** Rasterized glyphs as stored in the file (or re-rendered after edits). */
	bitmap: PsdBitmap;
	sourceTransform?: PsdSourceTransform;
	adjustment?: import("../render/adjustment-layers").PsdLiveAdjustment;
	curves?: import("../render/curves").PsdCurves;
	text: PsdTextContent;
}

export interface PsdGroupLayer extends PsdLayerCommon {
	readonly kind: "group";
	open: boolean;
	children: PsdLayerNode[];
}

export type PsdLayerNode = PsdRasterLayer | PsdTextLayer | PsdGroupLayer;

/**
 * Transient document selection. Declared structurally here to keep the codec
 * DOM- and render-free; the shape type lives in `render/selection.ts`.
 * Selections are session state — undo restores them — but never serialize
 * into the PSD file.
 */
export interface PsdDocumentSelection {
	shape:
		| { kind: "rectangle"; x: number; y: number; width: number; height: number }
		| { kind: "ellipse"; x: number; y: number; width: number; height: number }
		| { kind: "polygon"; points: Array<{ x: number; y: number }> }
		| { kind: "pixels"; mask: Uint8Array; width: number; height: number };
	inverted: boolean;
	/** Soft-edge radius in canvas pixels; omitted and zero both mean a hard edge. */
	feather?: number;
}

/** Named, session-local selection, analogous to a Photoshop saved selection. */
export interface PsdSavedSelection {
	name: string;
	selection: PsdDocumentSelection;
}

export interface PsdDocument {
	width: number;
	height: number;
	colorMode: PsdColorMode;
	bitsPerChannel: number;
	/** Horizontal resolution in pixels per inch, when resource 1005 is present. */
	resolutionPpi?: number;
	/** Bottom-most first, matching PSD storage order of the root list. */
	layers: PsdLayerNode[];
	/** Active selection constraining pixel edits; not saved into the file. */
	selection?: PsdDocumentSelection | null;
	/** Named selections available to restore during this editing session. */
	savedSelections?: PsdSavedSelection[];
	/**
	 * False for documents the editor cannot safely rewrite (unsupported color
	 * mode or bit depth). Read-only documents render from `composite`.
	 */
	editable: boolean;
	/** Flattened composite when the file carried one (always for read-only docs). */
	composite: PsdBitmap | null;
	/** Non-fatal fidelity notes gathered while opening. */
	openWarnings: string[];

	// --- preserved source sections ---
	/** Color Mode Data section body. */
	colorModeData: Uint8Array;
	/** Image resources except the ones the codec owns (currently 1005). */
	preservedResources: readonly PsdPreservedResource[];
	/** Global layer mask info section body (empty = absent). */
	globalLayerMaskInfo: Uint8Array;
	/** Additional layer info blocks trailing the layer records. */
	preservedGlobalBlocks: readonly PsdPreservedBlock[];
}

export function createEmptyLocks(): PsdLayerLocks {
	return { transparency: false, composite: false, position: false, all: false };
}

/** Depth-first walk, bottom-most root layer first. */
export function walkPsdLayers(
	layers: readonly PsdLayerNode[],
	visit: (layer: PsdLayerNode, parent: PsdGroupLayer | null) => void,
	parent: PsdGroupLayer | null = null,
): void {
	for (const layer of layers) {
		visit(layer, parent);
		if (layer.kind === "group") walkPsdLayers(layer.children, visit, layer);
	}
}

export function findPsdLayer(
	layers: readonly PsdLayerNode[],
	id: string,
): { layer: PsdLayerNode; parent: PsdGroupLayer | null } | undefined {
	let found: { layer: PsdLayerNode; parent: PsdGroupLayer | null } | undefined;
	walkPsdLayers(layers, (layer, parent) => {
		if (!found && layer.id === id) found = { layer, parent };
	});
	return found;
}

export function countPsdLayers(layers: readonly PsdLayerNode[]): number {
	let count = 0;
	walkPsdLayers(layers, () => count++);
	return count;
}
