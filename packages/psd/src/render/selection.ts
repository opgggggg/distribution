/**
 * Document selections. A selection is a serializable descriptor (rectangle,
 * ellipse, polygon, or pixel mask from a magic-wand pick) that rasterizes to
 * a canvas-sized coverage mask on demand. Descriptors live on the document —
 * undo restores them, and the AI surface can set them — while masks are
 * derived and cached per canvas size.
 */

export interface PsdSelectionRect {
	kind: "rectangle";
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PsdSelectionEllipse {
	kind: "ellipse";
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PsdSelectionPolygon {
	kind: "polygon";
	points: Array<{ x: number; y: number }>;
}

export interface PsdSelectionPixels {
	kind: "pixels";
	/** Canvas-sized coverage mask, one byte per pixel. */
	mask: Uint8Array;
	width: number;
	height: number;
}

export type PsdSelectionShape =
	| PsdSelectionRect
	| PsdSelectionEllipse
	| PsdSelectionPolygon
	| PsdSelectionPixels;

/** Returns a translated copy of a selection shape, clipping pixel masks to the canvas. */
export function translateSelectionShape(
	shape: PsdSelectionShape,
	dx: number,
	dy: number,
	canvasWidth: number,
	canvasHeight: number,
): PsdSelectionShape {
	const offsetX = Math.round(dx);
	const offsetY = Math.round(dy);
	switch (shape.kind) {
		case "rectangle":
		case "ellipse":
			return { ...shape, x: shape.x + offsetX, y: shape.y + offsetY };
		case "polygon":
			return {
				kind: "polygon",
				points: shape.points.map((point) => ({
					x: point.x + offsetX,
					y: point.y + offsetY,
				})),
			};
		case "pixels": {
			const width = Math.max(0, canvasWidth);
			const height = Math.max(0, canvasHeight);
			const mask = new Uint8Array(width * height);
			for (let y = 0; y < shape.height; y++) {
				const targetY = y + offsetY;
				if (targetY < 0 || targetY >= height) continue;
				for (let x = 0; x < shape.width; x++) {
					const targetX = x + offsetX;
					if (targetX < 0 || targetX >= width) continue;
					mask[targetY * width + targetX] = shape.mask[y * shape.width + x];
				}
			}
			return { kind: "pixels", mask, width, height };
		}
	}
}

export interface PsdSelectionState {
	shape: PsdSelectionShape;
	inverted: boolean;
	/** Soft-edge radius in canvas pixels. Zero or omitted keeps a hard edge. */
	feather?: number;
}

const MAX_SELECTION_FEATHER = 250;
const selectionMaskCache = new WeakMap<
	PsdSelectionState,
	{ canvasWidth: number; canvasHeight: number; mask: Uint8Array }
>();

/** Normalizes public/action input to the range supported by the editor UI. */
export function normalizeSelectionFeather(radius: number | undefined): number {
	if (!Number.isFinite(radius)) return 0;
	return Math.min(MAX_SELECTION_FEATHER, Math.max(0, radius ?? 0));
}

function blurMaskAxis(
	source: ArrayLike<number>,
	target: Float32Array,
	width: number,
	height: number,
	radius: number,
	horizontal: boolean,
): void {
	const window = radius * 2 + 1;
	const lines = horizontal ? height : width;
	const length = horizontal ? width : height;
	for (let line = 0; line < lines; line++) {
		const indexAt = (offset: number) =>
			horizontal ? line * width + offset : offset * width + line;
		let sum = 0;
		for (let offset = -radius; offset <= radius; offset++) {
			sum += source[indexAt(Math.min(length - 1, Math.max(0, offset)))];
		}
		for (let offset = 0; offset < length; offset++) {
			target[indexAt(offset)] = sum / window;
			const remove = Math.min(length - 1, Math.max(0, offset - radius));
			const add = Math.min(length - 1, Math.max(0, offset + radius + 1));
			sum += source[indexAt(add)] - source[indexAt(remove)];
		}
	}
}

/**
 * Softens a canvas-sized selection coverage mask. Three box passes approximate
 * a Gaussian while staying O(width x height), which matters for large PSDs.
 * Samples clamp at document edges so a selection touching the canvas boundary
 * does not fade merely because pixels outside the document do not exist.
 */
export function featherSelectionMask(
	mask: Uint8Array,
	width: number,
	height: number,
	radius: number,
): Uint8Array {
	const normalized = normalizeSelectionFeather(radius);
	if (normalized <= 0 || width <= 0 || height <= 0) return new Uint8Array(mask);
	if (mask.length !== width * height) {
		throw new RangeError("Selection mask dimensions do not match its data length");
	}

	const passRadius = Math.max(1, Math.round(normalized / Math.sqrt(3)));
	const horizontal = new Float32Array(mask.length);
	const blurred = new Float32Array(mask.length);
	let source: ArrayLike<number> = mask;
	for (let pass = 0; pass < 3; pass++) {
		blurMaskAxis(source, horizontal, width, height, passRadius, true);
		blurMaskAxis(horizontal, blurred, width, height, passRadius, false);
		source = blurred;
	}

	const result = new Uint8Array(mask.length);
	for (let index = 0; index < result.length; index++) {
		result[index] = Math.round(Math.min(255, Math.max(0, source[index])));
	}
	return result;
}

/** Canvas-space bounds of a selection (before inversion). */
export function selectionBounds(shape: PsdSelectionShape): {
	x: number;
	y: number;
	width: number;
	height: number;
} {
	switch (shape.kind) {
		case "rectangle":
		case "ellipse":
			return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
		case "polygon": {
			const xs = shape.points.map((point) => point.x);
			const ys = shape.points.map((point) => point.y);
			const minX = Math.min(...xs);
			const minY = Math.min(...ys);
			return {
				x: minX,
				y: minY,
				width: Math.max(...xs) - minX,
				height: Math.max(...ys) - minY,
			};
		}
		case "pixels": {
			let minX = shape.width;
			let minY = shape.height;
			let maxX = -1;
			let maxY = -1;
			for (let y = 0; y < shape.height; y++) {
				for (let x = 0; x < shape.width; x++) {
					if (shape.mask[y * shape.width + x] > 0) {
						if (x < minX) minX = x;
						if (x > maxX) maxX = x;
						if (y < minY) minY = y;
						if (y > maxY) maxY = y;
					}
				}
			}
			if (maxX < 0) return { x: 0, y: 0, width: 0, height: 0 };
			return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
		}
	}
}

function pointInPolygon(
	x: number,
	y: number,
	points: ReadonlyArray<{ x: number; y: number }>,
): boolean {
	let inside = false;
	for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
		const a = points[i];
		const b = points[j];
		if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
			inside = !inside;
		}
	}
	return inside;
}

/** Rasterizes a selection into a canvas-sized coverage mask. */
export function rasterizeSelection(
	state: PsdSelectionState,
	canvasWidth: number,
	canvasHeight: number,
): Uint8Array {
	const cached = selectionMaskCache.get(state);
	if (cached?.canvasWidth === canvasWidth && cached.canvasHeight === canvasHeight) {
		return new Uint8Array(cached.mask);
	}
	let mask: Uint8Array = new Uint8Array(canvasWidth * canvasHeight);
	const { shape } = state;
	switch (shape.kind) {
		case "rectangle": {
			const minX = Math.max(0, Math.floor(shape.x));
			const minY = Math.max(0, Math.floor(shape.y));
			const maxX = Math.min(canvasWidth, Math.ceil(shape.x + shape.width));
			const maxY = Math.min(canvasHeight, Math.ceil(shape.y + shape.height));
			for (let y = minY; y < maxY; y++) {
				mask.fill(255, y * canvasWidth + minX, y * canvasWidth + maxX);
			}
			break;
		}
		case "ellipse": {
			const rx = shape.width / 2;
			const ry = shape.height / 2;
			if (!rx || !ry) break;
			const cx = shape.x + rx;
			const cy = shape.y + ry;
			const minX = Math.max(0, Math.floor(shape.x));
			const minY = Math.max(0, Math.floor(shape.y));
			const maxX = Math.min(canvasWidth, Math.ceil(shape.x + shape.width));
			const maxY = Math.min(canvasHeight, Math.ceil(shape.y + shape.height));
			for (let y = minY; y < maxY; y++) {
				for (let x = minX; x < maxX; x++) {
					const norm = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
					if (norm <= 1) mask[y * canvasWidth + x] = 255;
				}
			}
			break;
		}
		case "polygon": {
			if (shape.points.length < 3) break;
			const bounds = selectionBounds(shape);
			const minX = Math.max(0, Math.floor(bounds.x));
			const minY = Math.max(0, Math.floor(bounds.y));
			const maxX = Math.min(canvasWidth, Math.ceil(bounds.x + bounds.width));
			const maxY = Math.min(canvasHeight, Math.ceil(bounds.y + bounds.height));
			for (let y = minY; y < maxY; y++) {
				for (let x = minX; x < maxX; x++) {
					if (pointInPolygon(x + 0.5, y + 0.5, shape.points)) {
						mask[y * canvasWidth + x] = 255;
					}
				}
			}
			break;
		}
		case "pixels": {
			const copyWidth = Math.min(canvasWidth, shape.width);
			const copyHeight = Math.min(canvasHeight, shape.height);
			for (let y = 0; y < copyHeight; y++) {
				for (let x = 0; x < copyWidth; x++) {
					mask[y * canvasWidth + x] = shape.mask[y * shape.width + x];
				}
			}
			break;
		}
	}
	const feather = normalizeSelectionFeather(state.feather);
	if (feather > 0) mask = featherSelectionMask(mask, canvasWidth, canvasHeight, feather);
	if (state.inverted) {
		for (let index = 0; index < mask.length; index++) mask[index] = 255 - mask[index];
	}
	selectionMaskCache.set(state, { canvasWidth, canvasHeight, mask });
	// Callers such as selection-combine are allowed to mutate their returned
	// mask; keep the cached canonical coverage isolated from those mutations.
	return new Uint8Array(mask);
}

/**
 * Extracts the bitmap-local slice of a canvas-space selection mask, or null
 * when the selection fully covers the slice (no constraint needed).
 */
export function sliceSelectionMask(
	canvasMask: Uint8Array,
	canvasWidth: number,
	canvasHeight: number,
	layerLeft: number,
	layerTop: number,
	layerWidth: number,
	layerHeight: number,
): Uint8Array {
	const slice = new Uint8Array(layerWidth * layerHeight);
	for (let y = 0; y < layerHeight; y++) {
		const canvasY = layerTop + y;
		if (canvasY < 0 || canvasY >= canvasHeight) continue;
		for (let x = 0; x < layerWidth; x++) {
			const canvasX = layerLeft + x;
			if (canvasX < 0 || canvasX >= canvasWidth) continue;
			slice[y * layerWidth + x] = canvasMask[canvasY * canvasWidth + canvasX];
		}
	}
	return slice;
}

/** Serializable summary for AI reads (never the raw mask). */
export function describeSelection(
	state: PsdSelectionState | null | undefined,
	canvasWidth: number,
	canvasHeight: number,
): Record<string, unknown> | null {
	if (!state) return null;
	const bounds = selectionBounds(state.shape);
	let coveredPixels: number | undefined;
	if (state.shape.kind === "pixels" || state.inverted) {
		const mask = rasterizeSelection(state, canvasWidth, canvasHeight);
		coveredPixels = 0;
		for (const value of mask) if (value > 0) coveredPixels++;
	}
	return {
		kind: state.shape.kind,
		inverted: state.inverted,
		feather: normalizeSelectionFeather(state.feather),
		bounds,
		...(state.shape.kind === "polygon" ? { pointCount: state.shape.points.length } : {}),
		...(coveredPixels !== undefined ? { coveredPixels } : {}),
	};
}
