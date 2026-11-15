/**
 * The PSD editor's typed write actions: the discriminated union, a descriptor
 * table (metadata — what a caller may pass), and a validator that rejects
 * unknown top-level and nested fields. Behavior lives in `reducer.ts`;
 * descriptors only describe.
 */

import { validateLiveAdjustment } from "../render/adjustment-layers";
import { validateCurves, type PsdCurves } from "../render/curves";
import { isPsdBlendMode, PSD_BLEND_MODES, type PsdBlendMode } from "../codec/document";
import type { PsdTextStyle } from "../codec/document";
import type {
	PsdAdjustmentKind,
	PsdAdjustmentParams,
	PsdFillRect,
	PsdRgbColor,
	PsdStrokePoint,
	PsdStrokeTool,
} from "../render/raster-ops";
import type { PsdFilterKind, PsdFilterParams } from "../render/filters";
import type { PsdEffectKind, PsdEffectParams } from "../render/effects";
import type { PsdFlipRotateOperation, PsdGradientStop } from "../render/geometry-ops";

// ---------------------------------------------------------------------------
// Action union
// ---------------------------------------------------------------------------

export interface PsdActionBase {
	type: string;
}

export const PSD_MASK_OPERATIONS = [
	"reveal-all",
	"hide-all",
	"from-selection",
	"invert",
	"enable",
	"disable",
	"delete",
	"link",
	"unlink",
] as const;
export type PsdMaskOperation = (typeof PSD_MASK_OPERATIONS)[number];

export interface PsdRetouchAction extends PsdActionBase {
	type: "retouch.apply";
	layerId: string;
	tool: "blur" | "heal";
	target?: "image" | "mask";
	points: PsdStrokePoint[];
	size: number;
	hardness?: number;
	opacity?: number;
	radius?: number;
	sampleAllLayers?: boolean;
}
export interface PsdContentAwareFillAction extends PsdActionBase {
	type: "contentAware.fill";
	layerId: string;
	sampleAllLayers?: boolean;
	searchRadius?: number;
}
export interface PsdAdjustmentSetAction extends PsdActionBase {
	type: "adjustment.set";
	layerId?: string;
	aboveLayerId?: string;
	name?: string;
	adjustment: import("../render/adjustment-layers").PsdLiveAdjustment;
}

export interface PsdCurvesSetAction extends PsdActionBase {
	type: "curves.set";
	layerId?: string;
	name?: string;
	curves: PsdCurves;
}

export interface PsdMaskEditAction extends PsdActionBase {
	type: "mask.edit";
	layerId: string;
	operation: "fill" | "feather" | "transform";
	value?: number;
	radius?: number;
	matrix?: [number, number, number, number, number, number];
}
export interface PsdMaskSetAction extends PsdActionBase {
	type: "mask.set";
	layerId: string;
	width: number;
	height: number;
	dataBase64: string;
	combine?: boolean;
	respectSelection?: boolean;
}

export interface PsdLayerMaskAction extends PsdActionBase {
	type: "layer.mask";
	layerId: string;
	operation: PsdMaskOperation;
}

export interface PsdLayerRenameAction extends PsdActionBase {
	type: "layer.rename";
	layerId: string;
	name: string;
}

export interface PsdLayerSetVisibleAction extends PsdActionBase {
	type: "layer.setVisible";
	layerId: string;
	visible: boolean;
}

export interface PsdLayerSetLockedAction extends PsdActionBase {
	type: "layer.setLocked";
	layerId: string;
	locked: boolean;
}

export interface PsdLayerSetOpacityAction extends PsdActionBase {
	type: "layer.setOpacity";
	layerId: string;
	/** 0..1 */
	opacity: number;
}

export interface PsdLayerSetBlendModeAction extends PsdActionBase {
	type: "layer.setBlendMode";
	layerId: string;
	blendMode: PsdBlendMode;
}

export interface PsdLayerSetClippingAction extends PsdActionBase {
	type: "layer.setClipping";
	layerId: string;
	/** True clips the layer to the first non-clipping layer below it. */
	clipping: boolean;
}

export interface PsdLayerReorderAction extends PsdActionBase {
	type: "layer.reorder";
	layerId: string;
	/** Destination group id; omitted or null targets the root list. */
	parentId?: string | null;
	/** Insertion index in the destination list, 0 = bottom-most. */
	index: number;
}

export interface PsdLayerDeleteAction extends PsdActionBase {
	type: "layer.delete";
	layerIds: string[];
}

export interface PsdLayerClearSelectedAction extends PsdActionBase {
	type: "layer.clearSelected";
	layerId: string;
}

export interface PsdLayerDuplicateAction extends PsdActionBase {
	type: "layer.duplicate";
	layerId: string;
	name?: string;
}

export interface PsdLayerImportAction extends PsdActionBase {
	type: "layer.import";
	psdBase64: string;
	parentId?: string | null;
	index?: number;
}
export interface PsdLayerAddAction extends PsdActionBase {
	type: "layer.add";
	name?: string;
	/** Optional solid fill for the new layer. */
	color?: PsdRgbColor;
	/** Canvas-space rectangle for the fill; defaults to the whole canvas. */
	rect?: PsdFillRect;
}

export interface PsdLayerGroupAction extends PsdActionBase {
	type: "layer.group";
	layerIds: string[];
	name?: string;
}

export interface PsdLayerUngroupAction extends PsdActionBase {
	type: "layer.ungroup";
	groupId: string;
}

export interface PsdLayerMergeAction extends PsdActionBase {
	type: "layer.merge";
	/** Sibling layer ids, merged into one raster layer at the topmost slot. */
	layerIds: string[];
	name?: string;
}

export interface PsdLayerMergeDownAction extends PsdActionBase {
	type: "layer.mergeDown";
	layerId: string;
}

export interface PsdLayerMergeVisibleAction extends PsdActionBase {
	type: "layer.mergeVisible";
	name?: string;
}

export interface PsdImageFlattenAction extends PsdActionBase {
	type: "image.flatten";
}

export interface PsdLayerRasterizeAction extends PsdActionBase {
	type: "layer.rasterize";
	layerId: string;
}

export interface PsdLayerFromSelectionAction extends PsdActionBase {
	type: "layer.fromSelection";
	/** Layer whose selected pixels become the new layer. */
	sourceLayerId: string;
	dx?: number;
	dy?: number;
	cut?: boolean;
	name?: string;
}

export interface PsdLayerMoveAction extends PsdActionBase {
	type: "layer.move";
	layerId: string;
	dx: number;
	dy: number;
}

export interface PsdLayerScaleAction extends PsdActionBase {
	type: "layer.scale";
	layerId: string;
	width: number;
	height: number;
}

export interface PsdTransformSelectionAction extends PsdActionBase {
	type: "transform.selection";
	layerIds: string[];
	corners?: Array<{ x: number; y: number }>;
	dx?: number;
	dy?: number;
	scaleX?: number;
	scaleY?: number;
	degrees?: number;
}
export interface PsdTransformApplyAction extends PsdActionBase {
	type: "transform.apply";
	layerId: string;
	operation: PsdFlipRotateOperation | "rotate" | "distort";
	/** Destination corners clockwise from top-left, in canvas coordinates. */
	corners?: Array<{ x: number; y: number }>;
	/** Required when operation is "rotate": -360..360 degrees clockwise. */
	degrees?: number;
}

export interface PsdTextSetContentAction extends PsdActionBase {
	type: "text.setContent";
	layerId: string;
	text: string;
}

export interface PsdTextSetStyleAction extends PsdActionBase {
	type: "text.setStyle";
	layerId: string;
	style: PsdTextStyle;
}

export interface PsdTextAddLayerAction extends PsdActionBase {
	type: "text.addLayer";
	text: string;
	/** Canvas-space anchor for the new layer's top-left corner. */
	x: number;
	y: number;
	/** Font size in pixels, default 32. */
	size?: number;
	color?: PsdRgbColor;
	name?: string;
}

export interface PsdAdjustmentApplyAction extends PsdActionBase {
	type: "adjustment.apply";
	layerId: string;
	kind: PsdAdjustmentKind | "levels" | "color-balance" | "exposure" | "vibrance" | "black-white";
	params?: PsdAdjustmentParams & {
		inBlack?: number;
		inWhite?: number;
		gamma?: number;
		outBlack?: number;
		outWhite?: number;
		cyanRed?: number;
		magentaGreen?: number;
		yellowBlue?: number;
		exposure?: number;
		offset?: number;
		vibrance?: number;
		reds?: number;
		greens?: number;
		blues?: number;
	};
}

export interface PsdFilterApplyAction extends PsdActionBase {
	type: "filter.apply";
	layerId: string;
	kind: PsdFilterKind;
	params?: PsdFilterParams;
}

export interface PsdEffectApplyAction extends PsdActionBase {
	type: "effect.apply";
	layerId: string;
	kind: PsdEffectKind;
	params?: PsdEffectParams;
}

export interface PsdFillApplyAction extends PsdActionBase {
	type: "fill.apply";
	layerId: string;
	color: PsdRgbColor;
	/** 0..1, default 1. */
	opacity?: number;
	/** Canvas-space rectangle; defaults to the layer bounds. */
	rect?: PsdFillRect;
}

export interface PsdStrokeApplyAction extends PsdActionBase {
	type: "stroke.apply";
	target?: "image" | "mask";
	layerId: string;
	tool: PsdStrokeTool;
	/** Canvas-space points. */
	points: PsdStrokePoint[];
	/** Diameter in pixels. */
	size: number;
	/** 0..1, default 1. */
	hardness?: number;
	/** 0..1, default 1 (dodge/burn: exposure strength). */
	opacity?: number;
	/** Required for brush strokes. */
	color?: PsdRgbColor;
	/** clone only: canvas-space offset from the stroke to the sampled source. */
	sourceOffset?: { dx: number; dy: number };
	/** Clone only: sample the visible composite before the stroke. */
	sampleAllLayers?: boolean;
	/** dodge/burn only: limits the effect to a tonal band. */
	tonalRange?: "shadows" | "midtones" | "highlights";
}

export interface PsdBucketApplyAction extends PsdActionBase {
	type: "bucket.apply";
	layerId: string;
	/** Canvas-space seed point. */
	x: number;
	y: number;
	color: PsdRgbColor;
	/** 0..255 color distance, default 32. */
	tolerance?: number;
	/** 0..1, default 1. */
	opacity?: number;
	/** When false, fills every matching pixel rather than one connected region. */
	contiguous?: boolean;
}

export interface PsdGradientApplyAction extends PsdActionBase {
	type: "gradient.apply";
	layerId: string;
	gradientType: "linear" | "radial";
	/** Canvas-space start (linear) / center (radial). */
	from: { x: number; y: number };
	/** Canvas-space end (linear) / edge (radial). */
	to: { x: number; y: number };
	stops: PsdGradientStop[];
	/** 0..1, default 1. */
	opacity?: number;
}

export interface PsdShapeApplyAction extends PsdActionBase {
	type: "shape.apply";
	layerId: string;
	shape: "rectangle" | "rounded-rectangle" | "ellipse" | "line";
	/** Canvas-space geometry: rect for rectangle/ellipse, endpoints for line. */
	x: number;
	y: number;
	width: number;
	height: number;
	fill?: PsdRgbColor;
	stroke?: PsdRgbColor;
	strokeWidth?: number;
	cornerRadius?: number;
	/** 0..1, default 1. */
	opacity?: number;
}

export interface PsdSelectionFromLayerAction extends PsdActionBase {
	type: "selection.fromLayer";
	layerId: string;
	source: "pixels" | "mask-black";
	combine?: PsdSelectionCombineMode;
}

export interface PsdSelectionSetAction extends PsdActionBase {
	type: "selection.set";
	shape: "rectangle" | "ellipse";
	x: number;
	y: number;
	width: number;
	height: number;
	/** Soft-edge radius in canvas pixels, 0..250. */
	feather?: number;
	combine?: PsdSelectionCombineMode;
}

export type PsdSelectionCombineMode = "replace" | "add" | "subtract" | "intersect";

export interface PsdSelectionSetPolygonAction extends PsdActionBase {
	type: "selection.setPolygon";
	points: Array<{ x: number; y: number }>;
	/** Soft-edge radius in canvas pixels, 0..250. */
	feather?: number;
	combine?: PsdSelectionCombineMode;
}

export interface PsdSelectionMagicWandAction extends PsdActionBase {
	type: "selection.magicWand";
	/** Canvas-space pick point; selects from the flattened composite. */
	x: number;
	y: number;
	/** 0..255 color distance, default 32. */
	tolerance?: number;
	/** When false, selects every matching pixel rather than one connected region. */
	contiguous?: boolean;
	/** Soft-edge radius in canvas pixels, 0..250. */
	feather?: number;
	combine?: PsdSelectionCombineMode;
}

export interface PsdSelectionAllAction extends PsdActionBase {
	type: "selection.all";
}

export interface PsdSelectionClearAction extends PsdActionBase {
	type: "selection.clear";
}

export interface PsdSelectionInvertAction extends PsdActionBase {
	type: "selection.invert";
}

export interface PsdSelectionFeatherAction extends PsdActionBase {
	type: "selection.feather";
	/** Replaces the active selection's soft-edge radius, 0..250 canvas pixels. */
	radius: number;
}

export interface PsdSelectionTranslateAction extends PsdActionBase {
	type: "selection.translate";
	/** Canvas-space offset in pixels. */
	dx: number;
	dy: number;
}

export interface PsdSelectionSaveAction extends PsdActionBase {
	type: "selection.save";
	/** Case-insensitive name; saving the same name replaces the previous entry. */
	name: string;
}

export interface PsdSelectionLoadAction extends PsdActionBase {
	type: "selection.load";
	name: string;
	combine?: PsdSelectionCombineMode;
	invert?: boolean;
}

export const PSD_CANVAS_ANCHORS = [
	"top-left",
	"top-center",
	"top-right",
	"middle-left",
	"center",
	"middle-right",
	"bottom-left",
	"bottom-center",
	"bottom-right",
] as const;

export type PsdCanvasAnchor = (typeof PSD_CANVAS_ANCHORS)[number];

export interface PsdCanvasResizeAction extends PsdActionBase {
	type: "canvas.resize";
	width: number;
	height: number;
	/** Where existing content anchors, default "top-left". */
	anchor?: PsdCanvasAnchor;
}

export interface PsdCanvasCropAction extends PsdActionBase {
	type: "canvas.crop";
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PsdImageResizeAction extends PsdActionBase {
	type: "image.resize";
	/** Resamples every layer proportionally with the canvas. */
	width: number;
	height: number;
}

export interface PsdImageFlipAction extends PsdActionBase {
	type: "image.flip";
	operation: "flip-horizontal" | "flip-vertical";
}

export interface PsdImageRotateAction extends PsdActionBase {
	type: "image.rotate";
	operation: "rotate-90" | "rotate-180" | "rotate-270";
}

export type PsdEditorAction =
	| PsdRetouchAction
	| PsdContentAwareFillAction
	| PsdAdjustmentSetAction
	| PsdCurvesSetAction
	| PsdMaskEditAction
	| PsdLayerMaskAction
	| PsdMaskSetAction
	| PsdLayerRenameAction
	| PsdLayerSetVisibleAction
	| PsdLayerSetLockedAction
	| PsdLayerSetOpacityAction
	| PsdLayerSetBlendModeAction
	| PsdLayerSetClippingAction
	| PsdLayerReorderAction
	| PsdLayerDeleteAction
	| PsdLayerClearSelectedAction
	| PsdLayerDuplicateAction
	| PsdLayerImportAction
	| PsdLayerAddAction
	| PsdLayerGroupAction
	| PsdLayerUngroupAction
	| PsdLayerMergeDownAction
	| PsdLayerMergeAction
	| PsdLayerMergeVisibleAction
	| PsdImageFlattenAction
	| PsdLayerRasterizeAction
	| PsdLayerFromSelectionAction
	| PsdLayerMoveAction
	| PsdLayerScaleAction
	| PsdTransformSelectionAction
	| PsdTransformApplyAction
	| PsdTextSetContentAction
	| PsdTextSetStyleAction
	| PsdTextAddLayerAction
	| PsdAdjustmentApplyAction
	| PsdFilterApplyAction
	| PsdEffectApplyAction
	| PsdFillApplyAction
	| PsdStrokeApplyAction
	| PsdBucketApplyAction
	| PsdGradientApplyAction
	| PsdShapeApplyAction
	| PsdSelectionFromLayerAction
	| PsdSelectionSetAction
	| PsdSelectionSetPolygonAction
	| PsdSelectionMagicWandAction
	| PsdSelectionAllAction
	| PsdSelectionClearAction
	| PsdSelectionInvertAction
	| PsdSelectionFeatherAction
	| PsdSelectionTranslateAction
	| PsdSelectionSaveAction
	| PsdSelectionLoadAction
	| PsdCanvasResizeAction
	| PsdCanvasCropAction
	| PsdImageResizeAction
	| PsdImageFlipAction
	| PsdImageRotateAction;

export type PsdEditorActionType = PsdEditorAction["type"];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export class PsdActionError extends Error {
	constructor(
		message: string,
		readonly path?: string,
	) {
		super(message);
		this.name = "PsdActionError";
	}
}

type FieldCheck = (value: unknown, path: string) => void;

const isString: FieldCheck = (value, path) => {
	if (typeof value !== "string") throw new PsdActionError(`${path} must be a string`, path);
};
const isNonEmptyString: FieldCheck = (value, path) => {
	isString(value, path);
	if (!(value as string).length) throw new PsdActionError(`${path} must not be empty`, path);
	if ((value as string).length > 20_000) {
		throw new PsdActionError(`${path} exceeds the 20000 character limit`, path);
	}
};
const isBoolean: FieldCheck = (value, path) => {
	if (typeof value !== "boolean") throw new PsdActionError(`${path} must be a boolean`, path);
};
const finiteNumber = (min: number, max: number): FieldCheck => {
	return (value, path) => {
		if (typeof value !== "number" || !Number.isFinite(value)) {
			throw new PsdActionError(`${path} must be a finite number`, path);
		}
		if (value < min || value > max) {
			throw new PsdActionError(`${path} must be between ${min} and ${max}`, path);
		}
	};
};
const oneOf = (allowed: readonly string[]): FieldCheck => {
	return (value, path) => {
		if (typeof value !== "string" || !allowed.includes(value)) {
			throw new PsdActionError(`${path} must be one of: ${allowed.join(", ")}`, path);
		}
	};
};
const isUnitInterval = finiteNumber(0, 1);
const isCoordinate = finiteNumber(-1_000_000, 1_000_000);
const isDimension = finiteNumber(1, 30_000);
const isBlendMode: FieldCheck = (value, path) => {
	if (!isPsdBlendMode(value)) {
		throw new PsdActionError(`${path} must be one of: ${PSD_BLEND_MODES.join(", ")}`, path);
	}
};
const objectWith = (
	fields: Record<string, { check: FieldCheck; required: boolean }>,
): FieldCheck => {
	return (value, path) => {
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			throw new PsdActionError(`${path} must be an object`, path);
		}
		for (const key of Object.keys(value)) {
			if (!(key in fields)) {
				throw new PsdActionError(
					`${path}.${key} is not a recognized field`,
					`${path}.${key}`,
				);
			}
		}
		for (const [key, spec] of Object.entries(fields)) {
			const present = key in (value as Record<string, unknown>);
			if (!present) {
				if (spec.required) {
					throw new PsdActionError(`${path}.${key} is required`, `${path}.${key}`);
				}
				continue;
			}
			spec.check((value as Record<string, unknown>)[key], `${path}.${key}`);
		}
	};
};
const isColor = objectWith({
	r: { check: finiteNumber(0, 255), required: true },
	g: { check: finiteNumber(0, 255), required: true },
	b: { check: finiteNumber(0, 255), required: true },
});
const isTextStyle = objectWith({
	fontFamily: { check: isNonEmptyString, required: true },
	fontSize: { check: finiteNumber(4, 500), required: true },
	bold: { check: isBoolean, required: true },
	italic: { check: isBoolean, required: true },
	underline: { check: isBoolean, required: true },
	strikethrough: { check: isBoolean, required: true },
	color: { check: isColor, required: true },
});
const isRect = objectWith({
	x: { check: isCoordinate, required: true },
	y: { check: isCoordinate, required: true },
	width: { check: finiteNumber(0, 30_000), required: true },
	height: { check: finiteNumber(0, 30_000), required: true },
});
const isPointObject = objectWith({
	x: { check: isCoordinate, required: true },
	y: { check: isCoordinate, required: true },
});
const isOffsetObject = objectWith({
	dx: { check: isCoordinate, required: true },
	dy: { check: isCoordinate, required: true },
});
const ADJUSTMENT_KINDS = [
	"brightness-contrast",
	"hue-saturation",
	"invert",
	"grayscale",
	"levels",
	"color-balance",
	"exposure",
	"vibrance",
	"black-white",
] as const;
const isAdjustmentParams = objectWith({
	brightness: { check: finiteNumber(-100, 100), required: false },
	contrast: { check: finiteNumber(-100, 100), required: false },
	hue: { check: finiteNumber(-180, 180), required: false },
	saturation: { check: finiteNumber(-100, 100), required: false },
	lightness: { check: finiteNumber(-100, 100), required: false },
	inBlack: { check: finiteNumber(0, 254), required: false },
	inWhite: { check: finiteNumber(1, 255), required: false },
	gamma: { check: finiteNumber(0.1, 10), required: false },
	outBlack: { check: finiteNumber(0, 255), required: false },
	outWhite: { check: finiteNumber(0, 255), required: false },
	cyanRed: { check: finiteNumber(-100, 100), required: false },
	magentaGreen: { check: finiteNumber(-100, 100), required: false },
	yellowBlue: { check: finiteNumber(-100, 100), required: false },
	exposure: { check: finiteNumber(-5, 5), required: false },
	offset: { check: finiteNumber(-0.5, 0.5), required: false },
	vibrance: { check: finiteNumber(-100, 100), required: false },
	reds: { check: finiteNumber(-100, 100), required: false },
	greens: { check: finiteNumber(-100, 100), required: false },
	blues: { check: finiteNumber(-100, 100), required: false },
});
const FILTER_KINDS = [
	"motion-blur",
	"lens-correction",
	"gaussian-blur",
	"sharpen",
	"noise",
	"pixelate",
	"threshold",
	"posterize",
] as const;
const isFilterParams = objectWith({
	distance: { check: finiteNumber(0, 500), required: false },
	angle: { check: finiteNumber(-180, 180), required: false },
	distortion: { check: finiteNumber(-100, 100), required: false },
	radius: { check: finiteNumber(0.5, 100), required: false },
	amount: { check: finiteNumber(1, 500), required: false },
	strength: { check: finiteNumber(1, 100), required: false },
	seed: { check: finiteNumber(0, 2_147_483_647), required: false },
	cellSize: { check: finiteNumber(2, 200), required: false },
	level: { check: finiteNumber(1, 254), required: false },
	levels: { check: finiteNumber(2, 32), required: false },
});
const EFFECT_KINDS = ["drop-shadow", "stroke", "outer-glow"] as const;
const isEffectParams = objectWith({
	color: { check: isColor, required: false },
	opacity: { check: isUnitInterval, required: false },
	offsetX: { check: finiteNumber(-500, 500), required: false },
	offsetY: { check: finiteNumber(-500, 500), required: false },
	size: { check: finiteNumber(1, 250), required: false },
});
const STROKE_TOOLS = ["brush", "eraser", "dodge", "burn", "clone"] as const;
const TRANSFORM_OPERATIONS = [
	"distort",
	"flip-horizontal",
	"flip-vertical",
	"rotate-90",
	"rotate-180",
	"rotate-270",
	"rotate",
] as const;
const MAX_STROKE_POINTS = 5_000;
const isPoints: FieldCheck = (value, path) => {
	if (!Array.isArray(value) || !value.length) {
		throw new PsdActionError(`${path} must be a non-empty array`, path);
	}
	if (value.length > MAX_STROKE_POINTS) {
		throw new PsdActionError(`${path} exceeds ${MAX_STROKE_POINTS} points`, path);
	}
	value.forEach((point, index) => isPointObject(point, `${path}[${index}]`));
};
const isPolygonPoints: FieldCheck = (value, path) => {
	if (!Array.isArray(value) || value.length < 3) {
		throw new PsdActionError(`${path} must be an array of at least 3 points`, path);
	}
	if (value.length > 2_000) {
		throw new PsdActionError(`${path} exceeds 2000 points`, path);
	}
	value.forEach((point, index) => isPointObject(point, `${path}[${index}]`));
};
const isGradientStops: FieldCheck = (value, path) => {
	if (!Array.isArray(value) || !value.length || value.length > 8) {
		throw new PsdActionError(`${path} must be an array of 1..8 stops`, path);
	}
	const stopCheck = objectWith({
		at: { check: isUnitInterval, required: true },
		color: { check: isColor, required: true },
		alpha: { check: isUnitInterval, required: false },
	});
	value.forEach((stop, index) => stopCheck(stop, `${path}[${index}]`));
};
const MAX_BATCH_IDS = 500;
const isIdList: FieldCheck = (value, path) => {
	if (!Array.isArray(value) || !value.length) {
		throw new PsdActionError(`${path} must be a non-empty array of layer ids`, path);
	}
	if (value.length > MAX_BATCH_IDS) {
		throw new PsdActionError(`${path} exceeds ${MAX_BATCH_IDS} ids`, path);
	}
	value.forEach((id, index) => isNonEmptyString(id, `${path}[${index}]`));
};
const isNullableString: FieldCheck = (value, path) => {
	if (value === null) return;
	isNonEmptyString(value, path);
};

interface FieldSpec {
	check: FieldCheck;
}

export type PsdActionTarget = "layer" | "text" | "pixels" | "selection" | "canvas";

export interface PsdEditorActionDescriptor {
	type: PsdEditorActionType;
	title: string;
	description: string;
	target: PsdActionTarget;
	required: readonly string[];
	optional: readonly string[];
}

interface ActionSpec {
	title: string;
	description: string;
	target: PsdActionTarget;
	fields: Record<string, FieldSpec>;
	required: readonly string[];
}

const layerIdField: FieldSpec = { check: isNonEmptyString };

const ACTION_SPECS: Record<PsdEditorActionType, ActionSpec> = {
	"retouch.apply": {
		title: "Retouch stroke",
		description:
			"Blur image or mask pixels, or repair image pixels using unselected source patches. The whole gesture is one transaction.",
		target: "layer",
		fields: {
			layerId: layerIdField,
			tool: { check: oneOf(["blur", "heal"]) },
			target: { check: oneOf(["image", "mask"]) },
			points: {
				check: (v, path) => {
					if (!Array.isArray(v) || !v.length || v.length > 10000)
						throw new PsdActionError("Expected 1–10000 stroke points", path);
					for (const p of v) {
						if (!p || Object.keys(p).some((k) => k !== "x" && k !== "y"))
							throw new PsdActionError("Invalid point", path);
						finiteNumber(-30000, 30000)(p.x, path);
						finiteNumber(-30000, 30000)(p.y, path);
					}
				},
			},
			size: { check: finiteNumber(1, 300) },
			hardness: { check: finiteNumber(0, 1) },
			opacity: { check: finiteNumber(0, 1) },
			radius: { check: finiteNumber(0.5, 100) },
			sampleAllLayers: {
				check: (v, path) => {
					if (typeof v !== "boolean") throw new PsdActionError("Expected boolean", path);
				},
			},
		},
		required: ["layerId", "tool", "points", "size"],
	},
	"contentAware.fill": {
		title: "Content-aware fill",
		description:
			"Repair the active selection from surrounding visible pixels, extending the layer inside the canvas when needed. Maximum 65,536 selected pixels per transaction.",
		target: "layer",
		fields: {
			layerId: layerIdField,
			sampleAllLayers: {
				check: (v, path) => {
					if (typeof v !== "boolean") throw new PsdActionError("Expected boolean", path);
				},
			},
			searchRadius: { check: finiteNumber(8, 256) },
		},
		required: ["layerId"],
	},
	"adjustment.set": {
		title: "Edit adjustment layer",
		description:
			"Create a live Levels, Hue/Saturation, Exposure or Gradient Map adjustment, or edit its parameters. Parameters persist as native PSD blocks.",
		target: "layer",
		fields: {
			layerId: layerIdField,
			aboveLayerId: layerIdField,
			name: { check: isNonEmptyString },
			adjustment: {
				check: (v, path) => {
					try {
						validateLiveAdjustment(v);
					} catch (e) {
						throw new PsdActionError(String(e), path);
					}
				},
			},
		},
		required: ["adjustment"],
	},
	"curves.set": {
		title: "Set curves adjustment layer",
		description:
			"Create a curves adjustment layer or edit an existing one without modifying source pixels.",
		target: "layer",
		fields: {
			layerId: layerIdField,
			name: { check: isNonEmptyString },
			curves: {
				check: (v, path) => {
					try {
						validateCurves(v);
					} catch (e) {
						throw new PsdActionError(String(e), path);
					}
				},
			},
		},
		required: ["curves"],
	},
	"mask.edit": {
		title: "Edit mask pixels",
		description: "Fill, feather or transform the mask independently of image pixels.",
		target: "layer",
		fields: {
			layerId: layerIdField,
			operation: { check: oneOf(["fill", "feather", "transform"]) },
			value: { check: finiteNumber(0, 255) },
			radius: { check: finiteNumber(0.5, 100) },
			matrix: {
				check: (value, path) => {
					if (!Array.isArray(value) || value.length !== 6)
						throw new PsdActionError("Expected six affine matrix values", path);
					value.forEach((v) => finiteNumber(-30000, 30000)(v, path));
				},
			},
		},
		required: ["layerId", "operation"],
	},
	"mask.set": {
		title: "Set image mask",
		description: "Apply a layer-sized grayscale mask; optionally multiply the existing mask.",
		target: "layer",
		fields: {
			layerId: layerIdField,
			width: {
				check: (value, path) => {
					finiteNumber(1, 30000)(value, path);
					if (!Number.isInteger(value))
						throw new PsdActionError("Dimensions must be integers", path);
				},
			},
			height: {
				check: (value, path) => {
					finiteNumber(1, 30000)(value, path);
					if (!Number.isInteger(value))
						throw new PsdActionError("Dimensions must be integers", path);
				},
			},
			dataBase64: {
				check: (v, path) => {
					if (typeof v !== "string" || !v.length || v.length > 64 * 1024 * 1024)
						throw new PsdActionError("Expected mask base64 up to 64 MiB", path);
				},
			},
			combine: { check: isBoolean },
			respectSelection: { check: isBoolean },
		},
		required: ["layerId", "width", "height", "dataBase64"],
	},
	"layer.mask": {
		title: "Edit layer mask",
		description:
			"Create a reveal-all, hide-all or selection mask; invert, enable, disable, link, unlink or delete an existing mask without changing image pixels.",
		target: "layer",
		fields: { layerId: layerIdField, operation: { check: oneOf(PSD_MASK_OPERATIONS) } },
		required: ["layerId", "operation"],
	},
	"layer.rename": {
		title: "Rename layer",
		description: "Set a layer's name.",
		target: "layer",
		fields: { layerId: layerIdField, name: { check: isNonEmptyString } },
		required: ["layerId", "name"],
	},
	"layer.setVisible": {
		title: "Set layer visibility",
		description: "Show or hide a layer or group.",
		target: "layer",
		fields: { layerId: layerIdField, visible: { check: isBoolean } },
		required: ["layerId", "visible"],
	},
	"layer.setLocked": {
		title: "Set layer lock",
		description: "Lock or unlock all editing of a layer.",
		target: "layer",
		fields: { layerId: layerIdField, locked: { check: isBoolean } },
		required: ["layerId", "locked"],
	},
	"layer.setOpacity": {
		title: "Set layer opacity",
		description: "Set a layer's opacity between 0 and 1.",
		target: "layer",
		fields: { layerId: layerIdField, opacity: { check: isUnitInterval } },
		required: ["layerId", "opacity"],
	},
	"layer.setBlendMode": {
		title: "Set layer blend mode",
		description: "Set how the layer blends with the layers below it.",
		target: "layer",
		fields: { layerId: layerIdField, blendMode: { check: isBlendMode } },
		required: ["layerId", "blendMode"],
	},
	"layer.setClipping": {
		title: "Set clipping mask",
		description:
			"Clip the layer to the coverage of the first non-clipping layer below it (or release the clip).",
		target: "layer",
		fields: { layerId: layerIdField, clipping: { check: isBoolean } },
		required: ["layerId", "clipping"],
	},
	"layer.reorder": {
		title: "Reorder layer",
		description:
			"Move a layer to an index inside a group (or the root list when parentId is omitted). Index 0 is the bottom-most slot.",
		target: "layer",
		fields: {
			layerId: layerIdField,
			parentId: { check: isNullableString },
			index: { check: finiteNumber(0, 10_000) },
		},
		required: ["layerId", "index"],
	},
	"layer.delete": {
		title: "Delete layers",
		description: "Delete layers or groups by id.",
		target: "layer",
		fields: { layerIds: { check: isIdList } },
		required: ["layerIds"],
	},
	"layer.clearSelected": {
		title: "Clear selected pixels",
		description: "Make only the active selection transparent on a pixel layer.",
		target: "layer",
		fields: { layerId: layerIdField },
		required: ["layerId"],
	},
	"layer.duplicate": {
		title: "Duplicate layer",
		description: "Duplicate a layer or group above the original.",
		target: "layer",
		fields: { layerId: layerIdField, name: { check: isNonEmptyString } },
		required: ["layerId"],
	},
	"layer.import": {
		title: "Import layers",
		description: "Copy editable layers from a base64 PSD into this document.",
		target: "layer",
		fields: {
			psdBase64: {
				check: (v, path) => {
					if (typeof v !== "string" || !v.length || v.length > 64 * 1024 * 1024)
						throw new PsdActionError("Expected a PSD base64 string up to 64 MiB", path);
				},
			},
			parentId: { check: isNullableString },
			index: { check: finiteNumber(0, 100000) },
		},
		required: ["psdBase64"],
	},
	"layer.add": {
		title: "Add layer",
		description: "Add a new raster layer at the top, optionally filled with a color.",
		target: "layer",
		fields: {
			name: { check: isNonEmptyString },
			color: { check: isColor },
			rect: { check: isRect },
		},
		required: [],
	},
	"layer.group": {
		title: "Group layers",
		description: "Move sibling layers into a new group.",
		target: "layer",
		fields: { layerIds: { check: isIdList }, name: { check: isNonEmptyString } },
		required: ["layerIds"],
	},
	"layer.ungroup": {
		title: "Ungroup",
		description: "Dissolve a group, keeping its children in place.",
		target: "layer",
		fields: { groupId: layerIdField },
		required: ["groupId"],
	},
	"layer.merge": {
		title: "Merge layers",
		description: "Merge sibling layers into a single raster layer.",
		target: "layer",
		fields: { layerIds: { check: isIdList }, name: { check: isNonEmptyString } },
		required: ["layerIds"],
	},
	"layer.mergeDown": {
		title: "Merge down",
		description: "Merge a layer with its immediate lower sibling.",
		target: "layer",
		fields: { layerId: layerIdField },
		required: ["layerId"],
	},
	"layer.mergeVisible": {
		title: "Merge visible",
		description: "Merge every visible layer into one raster layer; hidden layers survive.",
		target: "layer",
		fields: { name: { check: isNonEmptyString } },
		required: [],
	},
	"image.flatten": {
		title: "Flatten image",
		description: "Replace all layers with a single background layer of the composite.",
		target: "canvas",
		fields: {},
		required: [],
	},
	"layer.rasterize": {
		title: "Rasterize layer",
		description: "Convert a text layer into a plain raster layer.",
		target: "layer",
		fields: { layerId: layerIdField },
		required: ["layerId"],
	},
	"layer.fromSelection": {
		title: "Layer via copy",
		description:
			"Copy the selected pixels of a layer into a new layer above it. Requires an active selection.",
		target: "layer",
		fields: {
			sourceLayerId: layerIdField,
			name: { check: isNonEmptyString },
			dx: { check: isCoordinate },
			dy: { check: isCoordinate },
			cut: { check: isBoolean },
		},
		required: ["sourceLayerId"],
	},
	"layer.move": {
		title: "Move layer",
		description: "Translate a layer by dx/dy pixels (y grows downward).",
		target: "layer",
		fields: {
			layerId: layerIdField,
			dx: { check: isCoordinate },
			dy: { check: isCoordinate },
		},
		required: ["layerId", "dx", "dy"],
	},
	"layer.scale": {
		title: "Scale layer",
		description: "Resample a raster layer's pixels to a new size.",
		target: "layer",
		fields: {
			layerId: layerIdField,
			width: { check: isDimension },
			height: { check: isDimension },
		},
		required: ["layerId", "width", "height"],
	},
	"transform.selection": {
		title: "Transform selected layers",
		description:
			"Move, scale and rotate selected layers and folders around their shared center.",
		target: "layer",
		fields: {
			layerIds: { check: isIdList },
			corners: {
				check: (v, path) => {
					isPoints(v, path);
					if ((v as unknown[]).length !== 4)
						throw new PsdActionError("Four corners are required", path);
				},
			},
			dx: { check: isCoordinate },
			dy: { check: isCoordinate },
			scaleX: { check: finiteNumber(0.001, 1000) },
			scaleY: { check: finiteNumber(0.001, 1000) },
			degrees: { check: finiteNumber(-360, 360) },
		},
		required: ["layerIds"],
	},
	"transform.apply": {
		title: "Transform layer",
		description:
			'Flip or rotate a layer\'s pixels. Use operation "rotate" with degrees for arbitrary angles (clockwise).',
		target: "layer",
		fields: {
			layerId: layerIdField,
			operation: { check: oneOf(TRANSFORM_OPERATIONS) },
			degrees: { check: finiteNumber(-360, 360) },
			corners: {
				check: (v, path) => {
					isPoints(v, path);
					if (!Array.isArray(v) || v.length !== 4)
						throw new PsdActionError("Four corners are required", path);
				},
			},
		},
		required: ["layerId", "operation"],
	},
	"text.setContent": {
		title: "Set text content",
		description:
			"Replace a text layer's content. Glyphs re-render with canvas fonts, so rendering is approximate.",
		target: "text",
		fields: { layerId: layerIdField, text: { check: isNonEmptyString } },
		required: ["layerId", "text"],
	},
	"text.setStyle": {
		title: "Set text style",
		description: "Set the font family, size, emphasis, decoration, and color of a text layer.",
		target: "text",
		fields: { layerId: layerIdField, style: { check: isTextStyle } },
		required: ["layerId", "style"],
	},
	"text.addLayer": {
		title: "Add text layer",
		description: "Create a new text layer at a canvas position.",
		target: "text",
		fields: {
			text: { check: isNonEmptyString },
			x: { check: isCoordinate },
			y: { check: isCoordinate },
			size: { check: finiteNumber(4, 500) },
			color: { check: isColor },
			name: { check: isNonEmptyString },
		},
		required: ["text", "x", "y"],
	},
	"adjustment.apply": {
		title: "Apply adjustment",
		description:
			"Apply a destructive color adjustment (brightness-contrast, hue-saturation, invert, grayscale, levels, color-balance, exposure, vibrance, black-white) to a raster layer, constrained to the active selection.",
		target: "pixels",
		fields: {
			layerId: layerIdField,
			kind: { check: oneOf(ADJUSTMENT_KINDS) },
			params: { check: isAdjustmentParams },
		},
		required: ["layerId", "kind"],
	},
	"filter.apply": {
		title: "Apply filter",
		description:
			"Apply a destructive filter (gaussian-blur, sharpen, noise, pixelate, threshold, posterize) to a raster layer, constrained to the active selection.",
		target: "pixels",
		fields: {
			layerId: layerIdField,
			kind: { check: oneOf(FILTER_KINDS) },
			params: { check: isFilterParams },
		},
		required: ["layerId", "kind"],
	},
	"effect.apply": {
		title: "Apply layer style",
		description:
			"Render a layer style (drop-shadow, stroke, outer-glow) destructively into the layer's pixels; the bitmap grows to fit.",
		target: "pixels",
		fields: {
			layerId: layerIdField,
			kind: { check: oneOf(EFFECT_KINDS) },
			params: { check: isEffectParams },
		},
		required: ["layerId", "kind"],
	},
	"fill.apply": {
		title: "Fill",
		description:
			"Fill a raster layer (or a canvas-space rectangle of it) with a color, constrained to the active selection.",
		target: "pixels",
		fields: {
			layerId: layerIdField,
			color: { check: isColor },
			opacity: { check: isUnitInterval },
			rect: { check: isRect },
		},
		required: ["layerId", "color"],
	},
	"stroke.apply": {
		title: "Paint stroke",
		description:
			"Paint along canvas-space points with brush, eraser, dodge, burn, or clone (clone needs sourceOffset). Constrained to the active selection.",
		target: "pixels",
		fields: {
			target: { check: oneOf(["image", "mask"]) },
			layerId: layerIdField,
			tool: { check: oneOf(STROKE_TOOLS) },
			points: { check: isPoints },
			size: { check: finiteNumber(1, 2_000) },
			hardness: { check: isUnitInterval },
			opacity: { check: isUnitInterval },
			color: { check: isColor },
			sourceOffset: { check: isOffsetObject },
			sampleAllLayers: { check: isBoolean },
			tonalRange: { check: oneOf(["shadows", "midtones", "highlights"]) },
		},
		required: ["layerId", "tool", "points", "size"],
	},
	"bucket.apply": {
		title: "Paint bucket",
		description:
			"Flood-fill the contiguous color region under a canvas-space point on a raster layer, constrained to the active selection.",
		target: "pixels",
		fields: {
			layerId: layerIdField,
			x: { check: isCoordinate },
			y: { check: isCoordinate },
			color: { check: isColor },
			tolerance: { check: finiteNumber(0, 255) },
			opacity: { check: isUnitInterval },
			contiguous: { check: isBoolean },
		},
		required: ["layerId", "x", "y", "color"],
	},
	"gradient.apply": {
		title: "Gradient",
		description:
			"Composite a linear or radial gradient over a raster layer between two canvas-space points, constrained to the active selection.",
		target: "pixels",
		fields: {
			layerId: layerIdField,
			gradientType: { check: oneOf(["linear", "radial"]) },
			from: { check: isPointObject },
			to: { check: isPointObject },
			stops: { check: isGradientStops },
			opacity: { check: isUnitInterval },
		},
		required: ["layerId", "gradientType", "from", "to", "stops"],
	},
	"shape.apply": {
		title: "Draw shape",
		description:
			"Rasterize a rectangle, ellipse, or line onto a layer with optional fill and stroke, constrained to the active selection.",
		target: "pixels",
		fields: {
			layerId: layerIdField,
			shape: { check: oneOf(["rectangle", "rounded-rectangle", "ellipse", "line"]) },
			x: { check: isCoordinate },
			y: { check: isCoordinate },
			width: { check: finiteNumber(-30_000, 30_000) },
			height: { check: finiteNumber(-30_000, 30_000) },
			fill: { check: isColor },
			stroke: { check: isColor },
			strokeWidth: { check: finiteNumber(1, 200) },
			cornerRadius: { check: finiteNumber(0, 15000) },
			opacity: { check: isUnitInterval },
		},
		required: ["layerId", "shape", "x", "y", "width", "height"],
	},
	"selection.fromLayer": {
		title: "Load layer selection",
		description: "Load opaque image pixels or black mask areas as a canvas selection.",
		target: "selection",
		fields: {
			layerId: layerIdField,
			source: { check: oneOf(["pixels", "mask-black"]) },
			combine: { check: oneOf(["replace", "add", "subtract", "intersect"]) },
		},
		required: ["layerId", "source"],
	},
	"selection.set": {
		title: "Select rectangle or ellipse",
		description: "Set the active selection to a canvas-space rectangle or ellipse.",
		target: "selection",
		fields: {
			shape: { check: oneOf(["rectangle", "ellipse"]) },
			x: { check: isCoordinate },
			y: { check: isCoordinate },
			width: { check: finiteNumber(0, 30_000) },
			height: { check: finiteNumber(0, 30_000) },
			feather: { check: finiteNumber(0, 250) },
			combine: { check: oneOf(["replace", "add", "subtract", "intersect"]) },
		},
		required: ["shape", "x", "y", "width", "height"],
	},
	"selection.setPolygon": {
		title: "Select polygon",
		description: "Set the active selection to a closed polygon (lasso).",
		target: "selection",
		fields: {
			points: { check: isPolygonPoints },
			feather: { check: finiteNumber(0, 250) },
			combine: { check: oneOf(["replace", "add", "subtract", "intersect"]) },
		},
		required: ["points"],
	},
	"selection.magicWand": {
		title: "Magic wand",
		description:
			"Select the contiguous color region under a canvas-space point from the flattened composite.",
		target: "selection",
		fields: {
			x: { check: isCoordinate },
			y: { check: isCoordinate },
			tolerance: { check: finiteNumber(0, 255) },
			contiguous: { check: isBoolean },
			feather: { check: finiteNumber(0, 250) },
			combine: { check: oneOf(["replace", "add", "subtract", "intersect"]) },
		},
		required: ["x", "y"],
	},
	"selection.all": {
		title: "Select all",
		description: "Select the entire canvas.",
		target: "selection",
		fields: {},
		required: [],
	},
	"selection.clear": {
		title: "Deselect",
		description: "Clear the active selection.",
		target: "selection",
		fields: {},
		required: [],
	},
	"selection.invert": {
		title: "Invert selection",
		description: "Invert the active selection.",
		target: "selection",
		fields: {},
		required: [],
	},
	"selection.feather": {
		title: "Feather selection",
		description: "Set the active selection's soft-edge radius in canvas pixels.",
		target: "selection",
		fields: { radius: { check: finiteNumber(0, 250) } },
		required: ["radius"],
	},
	"selection.translate": {
		title: "Move selection",
		description: "Move the active selection border by a canvas-space offset.",
		target: "selection",
		fields: {
			dx: { check: finiteNumber(-30_000, 30_000) },
			dy: { check: finiteNumber(-30_000, 30_000) },
		},
		required: ["dx", "dy"],
	},
	"selection.save": {
		title: "Save selection",
		description: "Save the active selection under a reusable name in the editing session.",
		target: "selection",
		fields: { name: { check: isNonEmptyString } },
		required: ["name"],
	},
	"selection.load": {
		title: "Load selection",
		description: "Restore a named selection, optionally combining or inverting it.",
		target: "selection",
		fields: {
			name: { check: isNonEmptyString },
			combine: { check: oneOf(["replace", "add", "subtract", "intersect"]) },
			invert: { check: isBoolean },
		},
		required: ["name"],
	},
	"canvas.resize": {
		title: "Resize canvas",
		description:
			"Change the canvas size without resampling pixels; anchor controls where existing content stays.",
		target: "canvas",
		fields: {
			width: { check: isDimension },
			height: { check: isDimension },
			anchor: { check: oneOf(PSD_CANVAS_ANCHORS) },
		},
		required: ["width", "height"],
	},
	"canvas.crop": {
		title: "Crop canvas",
		description: "Crop the canvas to a rectangle; layer positions shift accordingly.",
		target: "canvas",
		fields: {
			x: { check: isCoordinate },
			y: { check: isCoordinate },
			width: { check: isDimension },
			height: { check: isDimension },
		},
		required: ["x", "y", "width", "height"],
	},
	"image.resize": {
		title: "Resize image",
		description: "Resample the canvas and every layer to a new size.",
		target: "canvas",
		fields: { width: { check: isDimension }, height: { check: isDimension } },
		required: ["width", "height"],
	},
	"image.flip": {
		title: "Flip canvas",
		description: "Flip the whole image horizontally or vertically.",
		target: "canvas",
		fields: { operation: { check: oneOf(["flip-horizontal", "flip-vertical"]) } },
		required: ["operation"],
	},
	"image.rotate": {
		title: "Rotate canvas",
		description: "Rotate the whole image by 90, 180, or 270 degrees clockwise.",
		target: "canvas",
		fields: { operation: { check: oneOf(["rotate-90", "rotate-180", "rotate-270"]) } },
		required: ["operation"],
	},
};

export const PSD_ACTION_TYPES: readonly PsdEditorActionType[] = Object.keys(
	ACTION_SPECS,
) as PsdEditorActionType[];

export function psdActionDescriptor(type: PsdEditorActionType): PsdEditorActionDescriptor {
	const spec = ACTION_SPECS[type];
	return {
		type,
		title: spec.title,
		description: spec.description,
		target: spec.target,
		required: spec.required,
		optional: Object.keys(spec.fields).filter((field) => !spec.required.includes(field)),
	};
}

export function psdActionDescriptors(): PsdEditorActionDescriptor[] {
	return PSD_ACTION_TYPES.map(psdActionDescriptor);
}

export function isPsdActionType(value: unknown): value is PsdEditorActionType {
	return typeof value === "string" && value in ACTION_SPECS;
}

/** Validates shape only; existence of ids is the reducer's job. */
export function validatePsdAction(action: unknown): asserts action is PsdEditorAction {
	if (typeof action !== "object" || action === null || Array.isArray(action)) {
		throw new PsdActionError("An action must be an object");
	}
	const record = action as Record<string, unknown>;
	if (!isPsdActionType(record.type)) {
		throw new PsdActionError(`Unknown action type '${String(record.type)}'`, "type");
	}
	const spec = ACTION_SPECS[record.type];
	for (const key of Object.keys(record)) {
		if (key === "type") continue;
		if (!(key in spec.fields)) {
			throw new PsdActionError(`${record.type}: '${key}' is not a recognized field`, key);
		}
	}
	for (const required of spec.required) {
		if (!(required in record)) {
			throw new PsdActionError(`${record.type}: '${required}' is required`, required);
		}
	}
	for (const [key, field] of Object.entries(spec.fields)) {
		if (key in record) field.check(record[key], key);
	}
	// Cross-field requirements the flat table cannot express.
	if (record.type === "mask.edit") {
		const field =
			record.operation === "fill"
				? "value"
				: record.operation === "feather"
					? "radius"
					: "matrix";
		if (!(field in record)) throw new PsdActionError(`mask.edit requires ${field}`, field);
	}
	if (record.type === "transform.apply" && record.operation === "distort" && !record.corners)
		throw new PsdActionError("Distort requires four corners", "corners");
	if (record.type === "transform.apply" && record.operation === "rotate") {
		if (typeof record.degrees !== "number") {
			throw new PsdActionError(
				'transform.apply with operation "rotate" requires degrees',
				"degrees",
			);
		}
	}
	if (record.type === "stroke.apply") {
		if (record.sampleAllLayers !== undefined && record.tool !== "clone")
			throw new PsdActionError(
				"sampleAllLayers is only supported for clone",
				"sampleAllLayers",
			);
		if (record.tool === "brush" && !record.color) {
			throw new PsdActionError("stroke.apply with tool 'brush' requires color", "color");
		}
		if (record.tool === "clone" && !record.sourceOffset) {
			throw new PsdActionError(
				"stroke.apply with tool 'clone' requires sourceOffset",
				"sourceOffset",
			);
		}
	}
	if (record.type === "shape.apply" && !record.fill && !record.stroke) {
		throw new PsdActionError("shape.apply requires fill or stroke", "fill");
	}
}
