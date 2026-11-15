/**
 * The PSD AI surface's static command registry. Data, not behavior: this file
 * is what a reviewer checks when asking "can an assistant reach this?".
 * Dispatch lives in `ai.ts`; policy in `ai-guards.ts`.
 */

import {
	AI_HOST_COMMAND_EFFECT,
	AI_SAVE_COMMAND_DESCRIPTION,
	AI_SAVE_COMMAND_TITLE,
	AI_SAVE_COMMAND_TYPE,
	aiManifestDigest,
	aiSaveCommandSchema,
	type AiJsonSchema,
} from "@yaochn/als-office-ooxml-core";
import { PSD_BLEND_MODES } from "./codec/document";
import {
	PSD_ACTION_TYPES,
	PSD_MASK_OPERATIONS,
	PSD_CANVAS_ANCHORS,
	psdActionDescriptor,
} from "./editor/actions";

export type PsdAiCommandEffect = "read" | "write" | typeof AI_HOST_COMMAND_EFFECT;

export type PsdAiCommandGroup =
	| "read"
	| "layers"
	| "paint"
	| "text"
	| "selection"
	| "canvas"
	| "document";

export interface PsdAiCommandDescriptor {
	type: string;
	title: string;
	description: string;
	effect: PsdAiCommandEffect;
	group: PsdAiCommandGroup;
	/** False for commands that must be the only command in a call. */
	batchable: boolean;
	/** True when the call must carry the session's latest revision. */
	requiresRevision: boolean;
	schema: AiJsonSchema;
}

/**
 * Fields the AI surface never accepts. Attribution belongs to the host: if a
 * caller could set them, an assistant could forge authorship or backdate an
 * edit.
 */
export const PSD_AI_FORBIDDEN_FIELDS: ReadonlySet<string> = new Set([
	"actorId",
	"timestamp",
	"source",
]);

export const PSD_AI_DEFAULT_PAGE_SIZE = 50;
export const PSD_AI_MAX_PAGE_SIZE = 200;
export const PSD_AI_MAX_COMMANDS = 100;
export const PSD_AI_MAX_REQUEST_BYTES = 256 * 1024;

/** Coordinate space every geometry field in this manifest is expressed in. */
export const PSD_AI_COORDINATE_SPACE = {
	units: "px",
	origin: "top-left",
	xAxis: "right",
	yAxis: "down",
	note:
		"All coordinates are canvas pixels with the origin at the top-left corner; " +
		"y grows downward. Layer bounds may extend beyond the canvas. To move a " +
		"layer up, use a negative dy.",
} as const;

const layerId: AiJsonSchema = {
	type: "string",
	minLength: 1,
	description: "Stable layer id from layers.list, layer.get, or a write result.",
};

export const PSD_AI_SCHEMA_DEFS: Readonly<Record<string, AiJsonSchema>> = {
	layerId,
	layerIds: { type: "array", minItems: 1, maxItems: 500, items: { $ref: "#/$defs/layerId" } },
	coordinate: { type: "number", minimum: -1_000_000, maximum: 1_000_000 },
	dimension: { type: "number", minimum: 1, maximum: 30_000 },
	unitInterval: { type: "number", minimum: 0, maximum: 1 },
	color: {
		type: "object",
		additionalProperties: false,
		required: ["r", "g", "b"],
		properties: {
			r: { type: "number", minimum: 0, maximum: 255 },
			g: { type: "number", minimum: 0, maximum: 255 },
			b: { type: "number", minimum: 0, maximum: 255 },
		},
		description: "RGB color, 0-255 per channel.",
	},
	textStyle: {
		type: "object",
		additionalProperties: false,
		required: [
			"fontFamily",
			"fontSize",
			"bold",
			"italic",
			"underline",
			"strikethrough",
			"color",
		],
		properties: {
			fontFamily: { type: "string", minLength: 1, maxLength: 255 },
			fontSize: { type: "number", minimum: 4, maximum: 500 },
			bold: { type: "boolean" },
			italic: { type: "boolean" },
			underline: { type: "boolean" },
			strikethrough: { type: "boolean" },
			color: { $ref: "#/$defs/color" },
		},
		description: "Single-run text formatting for a PSD text layer.",
	},
	rect: {
		type: "object",
		additionalProperties: false,
		required: ["x", "y", "width", "height"],
		properties: {
			x: { $ref: "#/$defs/coordinate" },
			y: { $ref: "#/$defs/coordinate" },
			width: { type: "number", minimum: 0, maximum: 30_000 },
			height: { type: "number", minimum: 0, maximum: 30_000 },
		},
		description: "Canvas-space rectangle in pixels.",
	},
	point: {
		type: "object",
		additionalProperties: false,
		required: ["x", "y"],
		properties: {
			x: { $ref: "#/$defs/coordinate" },
			y: { $ref: "#/$defs/coordinate" },
		},
	},
	blendMode: {
		type: "string",
		enum: [...PSD_BLEND_MODES],
		description: "Photoshop blend mode.",
	},
	adjustmentKind: {
		type: "string",
		enum: [
			"brightness-contrast",
			"hue-saturation",
			"invert",
			"grayscale",
			"levels",
			"color-balance",
			"exposure",
			"vibrance",
			"black-white",
		],
	},
	adjustmentParams: {
		type: "object",
		additionalProperties: false,
		properties: {
			brightness: { type: "number", minimum: -100, maximum: 100 },
			contrast: { type: "number", minimum: -100, maximum: 100 },
			hue: { type: "number", minimum: -180, maximum: 180 },
			saturation: { type: "number", minimum: -100, maximum: 100 },
			lightness: { type: "number", minimum: -100, maximum: 100 },
			inBlack: { type: "number", minimum: 0, maximum: 254 },
			inWhite: { type: "number", minimum: 1, maximum: 255 },
			gamma: { type: "number", minimum: 0.1, maximum: 10 },
			outBlack: { type: "number", minimum: 0, maximum: 255 },
			outWhite: { type: "number", minimum: 0, maximum: 255 },
			cyanRed: { type: "number", minimum: -100, maximum: 100 },
			magentaGreen: { type: "number", minimum: -100, maximum: 100 },
			yellowBlue: { type: "number", minimum: -100, maximum: 100 },
			exposure: { type: "number", minimum: -5, maximum: 5 },
			offset: { type: "number", minimum: -0.5, maximum: 0.5 },
			vibrance: { type: "number", minimum: -100, maximum: 100 },
			reds: { type: "number", minimum: -100, maximum: 100 },
			greens: { type: "number", minimum: -100, maximum: 100 },
			blues: { type: "number", minimum: -100, maximum: 100 },
		},
	},
	filterKind: {
		type: "string",
		enum: [
			"motion-blur",
			"lens-correction",
			"gaussian-blur",
			"sharpen",
			"noise",
			"pixelate",
			"threshold",
			"posterize",
		],
	},
	filterParams: {
		type: "object",
		additionalProperties: false,
		properties: {
			radius: { type: "number", minimum: 0.5, maximum: 100 },
			amount: { type: "number", minimum: 1, maximum: 500 },
			strength: { type: "number", minimum: 1, maximum: 100 },
			seed: { type: "number", minimum: 0, maximum: 2_147_483_647 },
			distance: { type: "number", minimum: 0, maximum: 500 },
			angle: { type: "number", minimum: -180, maximum: 180 },
			distortion: { type: "number", minimum: -100, maximum: 100 },
			cellSize: { type: "number", minimum: 2, maximum: 200 },
			level: { type: "number", minimum: 1, maximum: 254 },
			levels: { type: "number", minimum: 2, maximum: 32 },
		},
	},
	effectKind: { type: "string", enum: ["drop-shadow", "stroke", "outer-glow"] },
	effectParams: {
		type: "object",
		additionalProperties: false,
		properties: {
			color: { $ref: "#/$defs/color" },
			opacity: { $ref: "#/$defs/unitInterval" },
			offsetX: { type: "number", minimum: -500, maximum: 500 },
			offsetY: { type: "number", minimum: -500, maximum: 500 },
			size: { type: "number", minimum: 1, maximum: 250 },
		},
	},
	gradientStop: {
		type: "object",
		additionalProperties: false,
		required: ["at", "color"],
		properties: {
			at: { $ref: "#/$defs/unitInterval" },
			color: { $ref: "#/$defs/color" },
			alpha: { $ref: "#/$defs/unitInterval" },
		},
	},
	offset: {
		type: "object",
		additionalProperties: false,
		required: ["dx", "dy"],
		properties: {
			dx: { $ref: "#/$defs/coordinate" },
			dy: { $ref: "#/$defs/coordinate" },
		},
	},
	selectionCombine: {
		type: "string",
		enum: ["replace", "add", "subtract", "intersect"],
		description: "How this selection combines with the current selection; defaults to replace.",
	},
	text: { type: "string", minLength: 1, maxLength: 20_000 },
};

function command(
	type: string,
	title: string,
	description: string,
	effect: PsdAiCommandEffect,
	group: PsdAiCommandGroup,
	schema: AiJsonSchema,
	options: { batchable?: boolean; requiresRevision?: boolean } = {},
): PsdAiCommandDescriptor {
	// Commands carry their discriminating `type`, so every schema declares it;
	// signature rendering omits it by default.
	const properties = (schema.properties ?? {}) as Record<string, unknown>;
	const required = (schema.required ?? []) as string[];
	const withType: AiJsonSchema = {
		...schema,
		properties: { type: { const: type }, ...properties },
		required: required.includes("type") ? required : ["type", ...required],
	};
	return {
		type,
		title,
		description,
		effect,
		group,
		batchable: options.batchable ?? true,
		requiresRevision: options.requiresRevision ?? effect === "write",
		schema: withType,
	};
}

function objectSchema(
	required: Record<string, AiJsonSchema>,
	optional: Record<string, AiJsonSchema> = {},
): AiJsonSchema {
	return {
		type: "object",
		additionalProperties: false,
		required: Object.keys(required),
		properties: { ...required, ...optional },
	};
}

const READ_COMMANDS: PsdAiCommandDescriptor[] = [
	command(
		"context.get",
		"Get context",
		"Read compact current context: canvas size and color mode, layer count, selection, history availability, and capabilities. Constant-size regardless of document size.",
		"read",
		"read",
		objectSchema({}),
	),
	command(
		"manifest.get",
		"Get manifest",
		'Read the command manifest. With no arguments returns a lightweight discovery index (no schemas). Pass exact `types` for the full contract as a TypeScript-style signature, or `format: "json-schema"` for the machine form. `groups` filters tolerantly: unknown groups are reported without failing.',
		"read",
		"read",
		objectSchema(
			{},
			{
				types: { type: "array", maxItems: 50, items: { type: "string" } },
				groups: { type: "array", maxItems: 10, items: { type: "string" } },
				format: { type: "string", enum: ["signature", "json-schema"] },
			},
		),
	),
	command(
		"document.get",
		"Get document structure",
		"Read the full layer tree without pixel data: ids, kinds, names, bounds, opacity, blend modes, locks, and text content previews. Refused over the response budget for very large documents — page with layers.list instead.",
		"read",
		"read",
		objectSchema({}),
	),
	command(
		"layers.list",
		"List layers",
		`Read a page of layers depth-first from the top of the stack. Defaults to ${PSD_AI_DEFAULT_PAGE_SIZE} per page; pass offset to continue.`,
		"read",
		"read",
		objectSchema(
			{},
			{
				offset: { type: "integer", minimum: 0 },
				limit: { type: "integer", minimum: 1, maximum: PSD_AI_MAX_PAGE_SIZE },
			},
		),
	),
	command(
		"layer.get",
		"Get layer",
		"Read one layer in full detail (still no pixel data), including complete text content and editable text style for text layers.",
		"read",
		"read",
		objectSchema({ layerId: { $ref: "#/$defs/layerId" } }),
	),
	command(
		"pixel.sample",
		"Sample pixel",
		"Read one canvas-space RGBA pixel from the flattened composite, or the raw bitmap of a specific non-group layer when layerId is supplied. Constant-size.",
		"read",
		"read",
		objectSchema(
			{
				x: { $ref: "#/$defs/coordinate" },
				y: { $ref: "#/$defs/coordinate" },
			},
			{ layerId: { $ref: "#/$defs/layerId" } },
		),
	),
	command(
		"selection.get",
		"Get selection",
		"Read the current editor selection, its canvas area, and the names available to selection.load.",
		"read",
		"read",
		objectSchema({}),
	),
	command(
		"history.get",
		"Get history",
		`Read a page of undo/redo history entry labels. Defaults to ${PSD_AI_DEFAULT_PAGE_SIZE} per page; pass offset to continue.`,
		"read",
		"read",
		objectSchema(
			{},
			{
				offset: { type: "integer", minimum: 0 },
				limit: { type: "integer", minimum: 1, maximum: PSD_AI_MAX_PAGE_SIZE },
			},
		),
	),
	command(
		"text.find",
		"Find text",
		`Search text layer content and layer names. Returns a page of matches (default ${PSD_AI_DEFAULT_PAGE_SIZE}); pass offset to continue.`,
		"read",
		"read",
		objectSchema(
			{ query: { type: "string", minLength: 1, maxLength: 1_000 } },
			{
				offset: { type: "integer", minimum: 0 },
				limit: { type: "integer", minimum: 1, maximum: PSD_AI_MAX_PAGE_SIZE },
			},
		),
	),
	command(
		"view.reveal",
		"Reveal layer",
		"Scroll and highlight a layer in the host UI. A viewer affordance: it never changes the document.",
		AI_HOST_COMMAND_EFFECT,
		"read",
		objectSchema({ layerId: { $ref: "#/$defs/layerId" } }),
		{batchable:false,requiresRevision:false},
	),
];

const ACTION_GROUPS: Record<string, PsdAiCommandGroup> = {
	"retouch.apply": "paint",
	"contentAware.fill": "paint",
	"adjustment.set": "layers",
	"curves.set": "layers",
	"mask.edit": "layers",
	"layer.mask": "layers",
	"mask.set": "layers",
	"layer.rename": "layers",
	"layer.setVisible": "layers",
	"layer.setLocked": "layers",
	"layer.setOpacity": "layers",
	"layer.setBlendMode": "layers",
	"layer.setClipping": "layers",
	"layer.reorder": "layers",
	"layer.delete": "layers",
	"layer.clearSelected": "paint",
	"layer.duplicate": "layers",
	"layer.add": "layers",
	"layer.import": "layers",
	"layer.group": "layers",
	"layer.ungroup": "layers",
	"layer.merge": "layers",
	"layer.mergeDown": "layers",
	"layer.mergeVisible": "layers",
	"layer.rasterize": "layers",
	"layer.fromSelection": "layers",
	"layer.move": "layers",
	"layer.scale": "layers",
	"transform.apply": "layers",
	"transform.selection": "layers",
	"text.setContent": "text",
	"text.setStyle": "text",
	"text.addLayer": "text",
	"adjustment.apply": "paint",
	"filter.apply": "paint",
	"effect.apply": "paint",
	"fill.apply": "paint",
	"stroke.apply": "paint",
	"bucket.apply": "paint",
	"gradient.apply": "paint",
	"shape.apply": "paint",
	"selection.set": "selection",
	"selection.fromLayer": "selection",
	"selection.setPolygon": "selection",
	"selection.magicWand": "selection",
	"selection.all": "selection",
	"selection.clear": "selection",
	"selection.invert": "selection",
	"selection.feather": "selection",
	"selection.translate": "selection",
	"selection.save": "selection",
	"selection.load": "selection",
	"canvas.resize": "canvas",
	"canvas.crop": "canvas",
	"image.resize": "canvas",
	"image.flip": "canvas",
	"image.rotate": "canvas",
	"image.flatten": "canvas",
};

const adjustmentNumber = (minimum: number, maximum: number, integer = false): AiJsonSchema => ({
	type: integer ? "integer" : "number",
	minimum,
	maximum,
});
const levelChannelSchema = objectSchema({
	inBlack: adjustmentNumber(0, 255, true),
	inWhite: adjustmentNumber(0, 255, true),
	gamma: adjustmentNumber(0.01, 9.99),
	outBlack: adjustmentNumber(0, 255, true),
	outWhite: adjustmentNumber(0, 255, true),
});
const liveAdjustmentSchema: AiJsonSchema = {
	oneOf: [
		objectSchema({
			kind: { const: "grain" },
			amount: adjustmentNumber(0, 100),
			size: adjustmentNumber(0.5, 20),
			roughness: adjustmentNumber(0, 100),
			seed: adjustmentNumber(0, 4294967295, true),
		}),
		objectSchema({
			kind: { const: "levels" },
			channels: objectSchema(
				Object.fromEntries(
					["rgb", "red", "green", "blue"].map((c) => [c, levelChannelSchema]),
				),
			),
		}),
		objectSchema({
			kind: { const: "exposure" },
			exposure: adjustmentNumber(-20, 20),
			offset: adjustmentNumber(-0.5, 0.5),
			gamma: adjustmentNumber(0.01, 9.99),
		}),
		objectSchema({
			kind: { const: "hue-saturation" },
			hue: adjustmentNumber(-180, 180, true),
			saturation: adjustmentNumber(-100, 100, true),
			lightness: adjustmentNumber(-100, 100, true),
			colorize: { type: "boolean" },
			colorHue: adjustmentNumber(0, 360, true),
			colorSaturation: adjustmentNumber(0, 100, true),
			colorLightness: adjustmentNumber(-100, 100, true),
			ranges: {
				type: "array",
				minItems: 6,
				maxItems: 6,
				items: objectSchema({
					handles: {
						type: "array",
						minItems: 4,
						maxItems: 4,
						items: adjustmentNumber(0, 360, true),
					},
					hue: adjustmentNumber(-180, 180, true),
					saturation: adjustmentNumber(-100, 100, true),
					lightness: adjustmentNumber(-100, 100, true),
				}),
			},
		}),
		objectSchema({
			kind: { const: "gradient-map" },
			reverse: { type: "boolean" },
			stops: {
				type: "array",
				minItems: 2,
				maxItems: 32,
				items: objectSchema({
					position: adjustmentNumber(0, 1),
					midpoint: adjustmentNumber(0.01, 0.99),
					color: objectSchema({
						r: adjustmentNumber(0, 255, true),
						g: adjustmentNumber(0, 255, true),
						b: adjustmentNumber(0, 255, true),
					}),
				}),
			},
		}),
	],
};

const ACTION_SCHEMAS: Record<string, AiJsonSchema> = {
	"retouch.apply": objectSchema(
		{
			layerId: { $ref: "#/$defs/layerId" },
			tool: { type: "string", enum: ["blur", "heal"] },
			points: {
				type: "array",
				minItems: 1,
				maxItems: 10000,
				items: { $ref: "#/$defs/point" },
			},
			size: adjustmentNumber(1, 300),
		},
		{
			target: { type: "string", enum: ["image", "mask"] },
			hardness: adjustmentNumber(0, 1),
			opacity: adjustmentNumber(0, 1),
			radius: adjustmentNumber(0.5, 100),
			sampleAllLayers: { type: "boolean" },
		},
	),
	"contentAware.fill": objectSchema(
		{ layerId: { $ref: "#/$defs/layerId" } },
		{ sampleAllLayers: { type: "boolean" }, searchRadius: adjustmentNumber(8, 256) },
	),
	"adjustment.set": objectSchema(
		{ adjustment: liveAdjustmentSchema },
		{
			layerId: { $ref: "#/$defs/layerId" },
			aboveLayerId: { $ref: "#/$defs/layerId" },
			name: { type: "string", minLength: 1 },
		},
	),
	"curves.set": objectSchema(
		{
			curves: {
				type: "object",
				additionalProperties: false,
				required: ["rgb", "red", "green", "blue"],
				properties: Object.fromEntries(
					["rgb", "red", "green", "blue"].map((c) => [
						c,
						{
							type: "array",
							minItems: 2,
							maxItems: 19,
							items: {
								type: "object",
								additionalProperties: false,
								required: ["x", "y"],
								properties: {
									x: { type: "integer", minimum: 0, maximum: 255 },
									y: { type: "integer", minimum: 0, maximum: 255 },
								},
							},
						},
					]),
				),
			},
		},
		{ layerId: { $ref: "#/$defs/layerId" }, name: { type: "string", minLength: 1 } },
	),
	"mask.edit": objectSchema(
		{
			layerId: { $ref: "#/$defs/layerId" },
			operation: { type: "string", enum: ["fill", "feather", "transform"] },
		},
		{
			value: { type: "number", minimum: 0, maximum: 255 },
			radius: { type: "number", minimum: 0.5, maximum: 100 },
			matrix: {
				type: "array",
				minItems: 6,
				maxItems: 6,
				items: { type: "number", minimum: -30000, maximum: 30000 },
			},
		},
	),
	"mask.set": objectSchema(
		{
			layerId: { $ref: "#/$defs/layerId" },
			width: { type: "integer", minimum: 1, maximum: 30000 },
			height: { type: "integer", minimum: 1, maximum: 30000 },
			dataBase64: { type: "string", minLength: 1 },
		},
		{ combine: { type: "boolean" }, respectSelection: { type: "boolean" } },
	),
	"layer.mask": objectSchema({
		layerId: { $ref: "#/$defs/layerId" },
		operation: { type: "string", enum: [...PSD_MASK_OPERATIONS] },
	}),
	"layer.rename": objectSchema({
		layerId: { $ref: "#/$defs/layerId" },
		name: { type: "string", minLength: 1, maxLength: 255 },
	}),
	"layer.setVisible": objectSchema({
		layerId: { $ref: "#/$defs/layerId" },
		visible: { type: "boolean" },
	}),
	"layer.setLocked": objectSchema({
		layerId: { $ref: "#/$defs/layerId" },
		locked: { type: "boolean" },
	}),
	"layer.setOpacity": objectSchema({
		layerId: { $ref: "#/$defs/layerId" },
		opacity: { $ref: "#/$defs/unitInterval" },
	}),
	"layer.setBlendMode": objectSchema({
		layerId: { $ref: "#/$defs/layerId" },
		blendMode: { $ref: "#/$defs/blendMode" },
	}),
	"layer.setClipping": objectSchema({
		layerId: { $ref: "#/$defs/layerId" },
		clipping: { type: "boolean" },
	}),
	"layer.reorder": objectSchema(
		{
			layerId: { $ref: "#/$defs/layerId" },
			index: { type: "integer", minimum: 0, maximum: 10_000 },
		},
		{
			parentId: {
				anyOf: [{ $ref: "#/$defs/layerId" }, { type: "null" }],
				description: "Destination group id; null or omitted targets the root list.",
			},
		},
	),
	"layer.delete": objectSchema({ layerIds: { $ref: "#/$defs/layerIds" } }),
	"layer.clearSelected": objectSchema({ layerId: { $ref: "#/$defs/layerId" } }),
	"layer.duplicate": objectSchema(
		{ layerId: { $ref: "#/$defs/layerId" } },
		{ name: { type: "string", minLength: 1, maxLength: 255 } },
	),
	"layer.import": objectSchema(
		{ psdBase64: { type: "string", maxLength: 67108864 } },
		{
			parentId: { type: ["string", "null"] },
			index: { type: "integer", minimum: 0, maximum: 100000 },
		},
	),
	"layer.add": objectSchema(
		{},
		{
			name: { type: "string", minLength: 1, maxLength: 255 },
			color: { $ref: "#/$defs/color" },
			rect: { $ref: "#/$defs/rect" },
		},
	),
	"layer.group": objectSchema(
		{ layerIds: { $ref: "#/$defs/layerIds" } },
		{ name: { type: "string", minLength: 1, maxLength: 255 } },
	),
	"layer.ungroup": objectSchema({ groupId: { $ref: "#/$defs/layerId" } }),
	"layer.mergeDown": objectSchema({ layerId: { $ref: "#/$defs/layerId" } }),
	"layer.merge": objectSchema(
		{ layerIds: { $ref: "#/$defs/layerIds" } },
		{ name: { type: "string", minLength: 1, maxLength: 255 } },
	),
	"layer.mergeVisible": objectSchema(
		{},
		{ name: { type: "string", minLength: 1, maxLength: 255 } },
	),
	"layer.rasterize": objectSchema({ layerId: { $ref: "#/$defs/layerId" } }),
	"layer.fromSelection": objectSchema(
		{ sourceLayerId: { $ref: "#/$defs/layerId" } },
		{
			name: { type: "string", minLength: 1, maxLength: 255 },
			dx: { $ref: "#/$defs/coordinate" },
			dy: { $ref: "#/$defs/coordinate" },
			cut: { type: "boolean" },
		},
	),
	"image.flatten": objectSchema({}),
	"layer.move": objectSchema({
		layerId: { $ref: "#/$defs/layerId" },
		dx: { $ref: "#/$defs/coordinate" },
		dy: { $ref: "#/$defs/coordinate" },
	}),
	"layer.scale": objectSchema({
		layerId: { $ref: "#/$defs/layerId" },
		width: { $ref: "#/$defs/dimension" },
		height: { $ref: "#/$defs/dimension" },
	}),
	"transform.selection": objectSchema(
		{ layerIds: { $ref: "#/$defs/layerIds" } },
		{
			corners: {
				type: "array",
				minItems: 4,
				maxItems: 4,
				items: {
					type: "object",
					properties: { x: { type: "number" }, y: { type: "number" } },
					required: ["x", "y"],
					additionalProperties: false,
				},
			},
			dx: { $ref: "#/$defs/coordinate" },
			dy: { $ref: "#/$defs/coordinate" },
			scaleX: { type: "number", minimum: 0.001, maximum: 1000 },
			scaleY: { type: "number", minimum: 0.001, maximum: 1000 },
			degrees: { type: "number", minimum: -360, maximum: 360 },
		},
	),
	"transform.apply": objectSchema(
		{
			layerId: { $ref: "#/$defs/layerId" },
			operation: {
				type: "string",
				enum: [
					"flip-horizontal",
					"flip-vertical",
					"rotate-90",
					"rotate-180",
					"rotate-270",
					"rotate",
					"distort",
				],
			},
		},
		{
			corners: { type: "array", minItems: 4, maxItems: 4, items: { $ref: "#/$defs/point" } },
			degrees: {
				type: "number",
				minimum: -360,
				maximum: 360,
				description: 'Required when operation is "rotate"; clockwise.',
			},
		},
	),
	"text.setContent": objectSchema({
		layerId: { $ref: "#/$defs/layerId" },
		text: { $ref: "#/$defs/text" },
	}),
	"text.setStyle": objectSchema({
		layerId: { $ref: "#/$defs/layerId" },
		style: { $ref: "#/$defs/textStyle" },
	}),
	"text.addLayer": objectSchema(
		{
			text: { $ref: "#/$defs/text" },
			x: { $ref: "#/$defs/coordinate" },
			y: { $ref: "#/$defs/coordinate" },
		},
		{
			size: { type: "number", minimum: 4, maximum: 500 },
			color: { $ref: "#/$defs/color" },
			name: { type: "string", minLength: 1, maxLength: 255 },
		},
	),
	"adjustment.apply": objectSchema(
		{
			layerId: { $ref: "#/$defs/layerId" },
			kind: { $ref: "#/$defs/adjustmentKind" },
		},
		{ params: { $ref: "#/$defs/adjustmentParams" } },
	),
	"filter.apply": objectSchema(
		{
			layerId: { $ref: "#/$defs/layerId" },
			kind: { $ref: "#/$defs/filterKind" },
		},
		{ params: { $ref: "#/$defs/filterParams" } },
	),
	"effect.apply": objectSchema(
		{
			layerId: { $ref: "#/$defs/layerId" },
			kind: { $ref: "#/$defs/effectKind" },
		},
		{ params: { $ref: "#/$defs/effectParams" } },
	),
	"fill.apply": objectSchema(
		{
			layerId: { $ref: "#/$defs/layerId" },
			color: { $ref: "#/$defs/color" },
		},
		{
			opacity: { $ref: "#/$defs/unitInterval" },
			rect: { $ref: "#/$defs/rect" },
		},
	),
	"stroke.apply": objectSchema(
		{
			layerId: { $ref: "#/$defs/layerId" },
			tool: { type: "string", enum: ["brush", "eraser", "dodge", "burn", "clone"] },
			points: {
				type: "array",
				minItems: 1,
				maxItems: 5_000,
				items: { $ref: "#/$defs/point" },
			},
			size: { type: "number", minimum: 1, maximum: 2_000 },
		},
		{
			target: { type: "string", enum: ["image", "mask"] },
			hardness: { $ref: "#/$defs/unitInterval" },
			opacity: { $ref: "#/$defs/unitInterval" },
			color: { $ref: "#/$defs/color", description: "Required for tool 'brush'." },
			tonalRange: {
				type: "string",
				enum: ["shadows", "midtones", "highlights"],
				description: "Dodge/burn tonal band; defaults to midtones.",
			},
			sampleAllLayers: {
				type: "boolean",
				description: "Clone only: sample all visible layers before the stroke.",
			},
			sourceOffset: {
				$ref: "#/$defs/offset",
				description: "Required for tool 'clone': offset to the sampled source.",
			},
		},
	),
	"gradient.apply": objectSchema(
		{
			layerId: { $ref: "#/$defs/layerId" },
			gradientType: { type: "string", enum: ["linear", "radial"] },
			from: { $ref: "#/$defs/point" },
			to: { $ref: "#/$defs/point" },
			stops: {
				type: "array",
				minItems: 1,
				maxItems: 8,
				items: { $ref: "#/$defs/gradientStop" },
			},
		},
		{ opacity: { $ref: "#/$defs/unitInterval" } },
	),
	"shape.apply": objectSchema(
		{
			layerId: { $ref: "#/$defs/layerId" },
			shape: { type: "string", enum: ["rectangle", "rounded-rectangle", "ellipse", "line"] },
			x: { $ref: "#/$defs/coordinate" },
			y: { $ref: "#/$defs/coordinate" },
			width: { type: "number", minimum: -30_000, maximum: 30_000 },
			height: { type: "number", minimum: -30_000, maximum: 30_000 },
		},
		{
			fill: { $ref: "#/$defs/color" },
			stroke: { $ref: "#/$defs/color" },
			strokeWidth: { type: "number", minimum: 1, maximum: 200 },
			cornerRadius: { type: "number", minimum: 0, maximum: 15000 },
			opacity: { $ref: "#/$defs/unitInterval" },
		},
	),
	"selection.fromLayer": objectSchema(
		{
			layerId: { $ref: "#/$defs/layerId" },
			source: { type: "string", enum: ["pixels", "mask-black"] },
		},
		{ combine: { $ref: "#/$defs/selectionCombine" } },
	),
	"selection.set": objectSchema(
		{
			shape: { type: "string", enum: ["rectangle", "ellipse"] },
			x: { $ref: "#/$defs/coordinate" },
			y: { $ref: "#/$defs/coordinate" },
			width: { type: "number", minimum: 0, maximum: 30_000 },
			height: { type: "number", minimum: 0, maximum: 30_000 },
		},
		{
			combine: { $ref: "#/$defs/selectionCombine" },
			feather: { type: "number", minimum: 0, maximum: 250 },
		},
	),
	"selection.setPolygon": objectSchema(
		{
			points: {
				type: "array",
				minItems: 3,
				maxItems: 2_000,
				items: { $ref: "#/$defs/point" },
			},
		},
		{
			combine: { $ref: "#/$defs/selectionCombine" },
			feather: { type: "number", minimum: 0, maximum: 250 },
		},
	),
	"selection.magicWand": objectSchema(
		{
			x: { $ref: "#/$defs/coordinate" },
			y: { $ref: "#/$defs/coordinate" },
		},
		{
			tolerance: { type: "number", minimum: 0, maximum: 255 },
			contiguous: { type: "boolean" },
			combine: { $ref: "#/$defs/selectionCombine" },
			feather: { type: "number", minimum: 0, maximum: 250 },
		},
	),
	"selection.all": objectSchema({}),
	"selection.clear": objectSchema({}),
	"selection.invert": objectSchema({}),
	"selection.feather": objectSchema({ radius: { type: "number", minimum: 0, maximum: 250 } }),
	"selection.translate": objectSchema({
		dx: { type: "number", minimum: -30_000, maximum: 30_000 },
		dy: { type: "number", minimum: -30_000, maximum: 30_000 },
	}),
	"selection.save": objectSchema({ name: { type: "string", minLength: 1, maxLength: 255 } }),
	"selection.load": objectSchema(
		{ name: { type: "string", minLength: 1, maxLength: 255 } },
		{
			combine: { $ref: "#/$defs/selectionCombine" },
			invert: { type: "boolean" },
		},
	),
	"bucket.apply": objectSchema(
		{
			layerId: { $ref: "#/$defs/layerId" },
			x: { $ref: "#/$defs/coordinate" },
			y: { $ref: "#/$defs/coordinate" },
			color: { $ref: "#/$defs/color" },
		},
		{
			tolerance: { type: "number", minimum: 0, maximum: 255 },
			opacity: { $ref: "#/$defs/unitInterval" },
			contiguous: { type: "boolean" },
		},
	),
	"canvas.resize": objectSchema(
		{
			width: { $ref: "#/$defs/dimension" },
			height: { $ref: "#/$defs/dimension" },
		},
		{ anchor: { type: "string", enum: [...PSD_CANVAS_ANCHORS] } },
	),
	"canvas.crop": objectSchema({
		x: { $ref: "#/$defs/coordinate" },
		y: { $ref: "#/$defs/coordinate" },
		width: { $ref: "#/$defs/dimension" },
		height: { $ref: "#/$defs/dimension" },
	}),
	"image.resize": objectSchema({
		width: { $ref: "#/$defs/dimension" },
		height: { $ref: "#/$defs/dimension" },
	}),
	"image.flip": objectSchema({
		operation: { type: "string", enum: ["flip-horizontal", "flip-vertical"] },
	}),
	"image.rotate": objectSchema({
		operation: { type: "string", enum: ["rotate-90", "rotate-180", "rotate-270"] },
	}),
};

const WRITE_COMMANDS: PsdAiCommandDescriptor[] = PSD_ACTION_TYPES.map((type) => {
	const descriptor = psdActionDescriptor(type);
	const schema = ACTION_SCHEMAS[type];
	if (!schema) throw new Error(`Missing AI schema for action '${type}'`);
	return command(
		type,
		descriptor.title,
		descriptor.description,
		"write",
		ACTION_GROUPS[type],
		schema,
	);
});

const SAVE_COMMAND = command(
	AI_SAVE_COMMAND_TYPE,
	AI_SAVE_COMMAND_TITLE,
	AI_SAVE_COMMAND_DESCRIPTION,
	AI_HOST_COMMAND_EFFECT,
	"document",
	aiSaveCommandSchema(),
	{ batchable: false, requiresRevision: true },
);


const resourceId = {type: "string", minLength: 1} as const;
const offset = {type: "integer", minimum: 0} as const;
const SERVICE_COMMANDS: PsdAiCommandDescriptor[] = [
 command("resource.create", "Create upload", "Allocate a session resource, maximum 64 MiB total. Upload sequential chunks with resource.write; release when done.", "read", "document", objectSchema({length:{type:"integer",minimum:1,maximum:67108864}}), {batchable:false}),
 command("resource.write", "Upload chunk", "Append at most 48 KiB of decoded data to an incomplete resource.", "read", "document", objectSchema({resourceId,offset,dataBase64:{type:"string",minLength:1,maxLength:65536}}), {batchable:false}),
 command("resource.read", "Read chunk", "Read up to 48 KiB of a complete resource, continue using nextOffset.", "read", "document", objectSchema({resourceId},{offset}), {batchable:false}),
 command("resource.release", "Release resource", "Free session binary storage; handles expire when the session closes.", "read", "document", objectSchema({resourceId}), {batchable:false}),
 command("mask.fromResource", "Apply uploaded mask", "Apply a raw one-byte-per-pixel mask resource. Requires baseRevision. Undoable.", AI_HOST_COMMAND_EFFECT, "layers", objectSchema({resourceId,layerId,width:{type:"integer",minimum:1,maximum:30000},height:{type:"integer",minimum:1,maximum:30000}},{combine:{type:"boolean"},respectSelection:{type:"boolean"}}), {batchable:false,requiresRevision:true}),
 command("background.remove", "Remove background", "Generate and apply an editable foreground mask using the host native service. Requires baseRevision; await completion or query request.get using requestId.", AI_HOST_COMMAND_EFFECT, "layers", objectSchema({layerId},{advanced:{type:"boolean"},refineEdges:{type:"number",minimum:0,maximum:100},shiftEdge:{type:"number",minimum:-100,maximum:100},contrast:{type:"number",minimum:0,maximum:100}}), {batchable:false,requiresRevision:true}),
 command("document.preview", "Render preview", "Return a PNG resource for the canvas or a region. Input region budget 16 megapixels; output longest edge defaults to 1024. Use resource.read to retrieve bytes.", "read", "document", objectSchema({}, {x:offset,y:offset,width:{type:"integer",minimum:1,maximum:30000},height:{type:"integer",minimum:1,maximum:30000},maxDimension:{type:"integer",minimum:1,maximum:2048}}), {batchable:false}),
 command("document.export", "Export document", "Return a PSD or PNG resource plus revision. Export does not claim persistence; use document.save if the host supports it. PNG budget 16 megapixels.", "read", "document", objectSchema({format:{type:"string",enum:["psd","png"]}}), {batchable:false}),
 command("request.get", "Get request status", "Query a retained requestId: pending, completed, failed, or unknown. Repeating the same requestId and payload returns its original outcome. Requests are retained until session close (maximum 256).", "read", "read", objectSchema({requestId:{type:"string",minLength:1,maxLength:128}}), {batchable:false}),
];

export const PSD_AI_COMMANDS: readonly PsdAiCommandDescriptor[] = [
	...READ_COMMANDS,
	...SERVICE_COMMANDS,
	...WRITE_COMMANDS,
	SAVE_COMMAND,
];

export const PSD_AI_COMMAND_TYPES: ReadonlySet<string> = new Set(
	PSD_AI_COMMANDS.map((descriptor) => descriptor.type),
);

export const PSD_AI_COMMAND_GROUPS: ReadonlySet<string> = new Set(
	PSD_AI_COMMANDS.map((descriptor) => descriptor.group),
);

export function psdAiCommandDescriptor(type: string): PsdAiCommandDescriptor | undefined {
	return PSD_AI_COMMANDS.find((descriptor) => descriptor.type === type);
}

export const PSD_AI_MANIFEST_VERSION = 1;

export function psdAiManifestHash(commands: readonly PsdAiCommandDescriptor[]): string {
	return aiManifestDigest(
		commands.map((descriptor) => ({
			type: descriptor.type,
			effect: descriptor.effect,
			schema: descriptor.schema,
		})),
	);
}
