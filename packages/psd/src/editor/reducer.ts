import { transformSelectedLayers } from "../render/group-transform";
import { readPsd } from "../codec/read";
import { psdBase64ToBytes } from "../codec/base64";
import { quadTransform } from "../render/projective";
import { applyBlurStroke, applyHealingStroke, contentAwareFill } from "../render/retouch";
import { composeLayers } from "../render/compose";
import { expandMaskToCanvas, maskBitmap, replaceMaskBitmap, transformMask } from "../render/masks";
import { transformLayerPixels, aroundPoint, type PsdAffine } from "../render/affine";
/**
 * The reducer that applies validated actions to a document in place (the
 * session owns cloning and atomicity). Pixel actions are constrained to the
 * document's active selection when one exists.
 */

import {
	clonePsdBitmap,
	createEmptyLocks,
	createPsdBitmap,
	findPsdLayer,
	walkPsdLayers,
	type PsdBitmap,
	type PsdDocument,
	type PsdDocumentSelection,
	type PsdGroupLayer,
	type PsdLayerNode,
	type PsdRasterLayer,
	type PsdTextLayer,
} from "../codec/document";
import { createTyShBlock, rewriteTyShText } from "../codec/descriptor";
import { blendOver, composePsdDocument } from "../render/compose";
import {
	applyAdjustment,
	applyBucketFill,
	applyFill,
	applyStroke,
	floodSelectMask,
	type PsdAdjustmentKind,
} from "../render/raster-ops";
import {
	applyBlackWhite,
	applyColorBalance,
	applyExposure,
	applyFilter,
	applyLevels,
	applyVibrance,
} from "../render/filters";
import { applyLayerEffect } from "../render/effects";
import { applyGradient, applyShape, type PsdFlipRotateOperation } from "../render/geometry-ops";
import {
	rasterizeSelection,
	normalizeSelectionFeather,
	sliceSelectionMask,
	translateSelectionShape,
	type PsdSelectionState,
} from "../render/selection";
import { PsdActionError, type PsdEditorAction, type PsdSelectionCombineMode } from "./actions";

export interface PsdApplyContext {
	allocateLayerId(): string;
	/**
	 * Re-renders a text layer after a content edit. Canvas-dependent, so hosts
	 * inject it; without one the pixels keep the previous rasterization.
	 */
	rasterizeText?(layer: PsdTextLayer, text: string): PsdBitmap | null;
}

export interface PsdApplyResult {
	affectedIds: string[];
	createdIds: string[];
	deletedIds: string[];
	changed: boolean;
	diagnostics: string[];
}

interface LayerListRef {
	list: PsdLayerNode[];
	index: number;
	parent: PsdGroupLayer | null;
}

function locate(document: PsdDocument, layerId: string, path: string): LayerListRef {
	const scan = (list: PsdLayerNode[], parent: PsdGroupLayer | null): LayerListRef | null => {
		for (let index = 0; index < list.length; index++) {
			const layer = list[index];
			if (layer.id === layerId) return { list, index, parent };
			if (layer.kind === "group") {
				const found = scan(layer.children, layer);
				if (found) return found;
			}
		}
		return null;
	};
	const found = scan(document.layers, null);
	if (!found) throw new PsdActionError(`No layer with id '${layerId}'`, path);
	return found;
}

function locateLayer(
	document: PsdDocument,
	layerId: string,
	path = "layerId",
): { layer: PsdLayerNode; parent: PsdGroupLayer | null } {
	const found = findPsdLayer(document.layers, layerId);
	if (!found) throw new PsdActionError(`No layer with id '${layerId}'`, path);
	return found;
}

function requireUnlocked(layer: PsdLayerNode, forPixels: boolean): void {
	if (layer.locks.all || layer.locks.composite) {
		throw new PsdActionError(`Layer '${layer.name}' is locked`, "layerId");
	}
	if (forPixels && layer.locks.transparency) {
		throw new PsdActionError(`Layer '${layer.name}' has locked transparency`, "layerId");
	}
}

function requireRasterOrText(layer: PsdLayerNode, path: string): PsdRasterLayer | PsdTextLayer {
	if (layer.kind === "group" || layer.curves || layer.adjustment) {
		throw new PsdActionError(
			`Layer '${layer.name}' is a group; a pixel layer is required`,
			path,
		);
	}
	return layer;
}

/** Expands a bitmap so the given canvas-space rect fits inside it. */
function expandLayerToInclude(
	layer: PsdRasterLayer | PsdTextLayer,
	rect: { x: number; y: number; width: number; height: number },
	canvas: { width: number; height: number },
): void {
	const targetLeft = Math.max(0, Math.min(layer.left, Math.floor(rect.x)));
	const targetTop = Math.max(0, Math.min(layer.top, Math.floor(rect.y)));
	const targetRight = Math.min(
		canvas.width,
		Math.max(layer.left + layer.bitmap.width, Math.ceil(rect.x + rect.width)),
	);
	const targetBottom = Math.min(
		canvas.height,
		Math.max(layer.top + layer.bitmap.height, Math.ceil(rect.y + rect.height)),
	);
	const width = Math.max(0, targetRight - targetLeft);
	const height = Math.max(0, targetBottom - targetTop);
	if (width === layer.bitmap.width && height === layer.bitmap.height) return;
	const grown = createPsdBitmap(width, height);
	blendOver(grown, {
		bitmap: layer.bitmap,
		left: layer.left - targetLeft,
		top: layer.top - targetTop,
		opacity: 1,
		blendMode: "normal",
	});
	layer.bitmap = grown;
	layer.left = targetLeft;
	layer.top = targetTop;
}

function moveLayer(layer: PsdLayerNode, dx: number, dy: number, forceMask = false): void {
	if (layer.kind === "group") {
		for (const child of layer.children) moveLayer(child, dx, dy, forceMask);
	} else {
		layer.top += dy;
		layer.left += dx;
	}
	if (layer.mask && (forceMask || layer.mask.linked !== false)) {
		layer.mask = {
			...layer.mask,
			top: layer.mask.top + dy,
			bottom: layer.mask.bottom + dy,
			left: layer.mask.left + dx,
			right: layer.mask.right + dx,
		};
	}
}

function isDescendant(layer: PsdLayerNode, id: string): boolean {
	if (layer.kind !== "group") return false;
	return Boolean(findPsdLayer(layer.children, id));
}

function cloneLayerDeep(
	layer: PsdLayerNode,
	context: PsdApplyContext,
	createdIds: string[],
): PsdLayerNode {
	const id = context.allocateLayerId();
	createdIds.push(id);
	if (layer.kind === "group") {
		return {
			...layer,
			id,
			locks: { ...layer.locks },
			preservedBlocks: [...layer.preservedBlocks],
			children: layer.children.map((child) => cloneLayerDeep(child, context, createdIds)),
		};
	}
	const base = {
		...layer,
		id,
		locks: { ...layer.locks },
		preservedBlocks: [...layer.preservedBlocks],
		bitmap: clonePsdBitmap(layer.bitmap),
	};
	if (layer.sourceTransform?.rendered === layer.bitmap)
		base.sourceTransform = { ...layer.sourceTransform, rendered: base.bitmap };
	if (layer.kind === "text") {
		return {
			...base,
			kind: "text",
			text: {
				...layer.text,
				...(layer.text.style
					? { style: { ...layer.text.style, color: { ...layer.text.style.color } } }
					: {}),
			},
		};
	}
	return base as PsdRasterLayer;
}

function newRasterLayer(
	id: string,
	name: string,
	top: number,
	left: number,
	bitmap: PsdBitmap,
): PsdRasterLayer {
	return {
		kind: "raster",
		id,
		name,
		visible: true,
		opacity: 1,
		blendMode: "normal",
		clipping: false,
		locks: createEmptyLocks(),
		preservedBlocks: [],
		top,
		left,
		bitmap,
	};
}

/** Bitmap-local slice of the document selection, or null when unselected. */
function selectionMaskFor(
	document: PsdDocument,
	layer: PsdRasterLayer | PsdTextLayer,
): Uint8Array | null {
	if (!document.selection) return null;
	const canvasMask = rasterizeSelection(
		document.selection as PsdSelectionState,
		document.width,
		document.height,
	);
	return sliceSelectionMask(
		canvasMask,
		document.width,
		document.height,
		layer.left,
		layer.top,
		layer.bitmap.width,
		layer.bitmap.height,
	);
}

function combineSelection(
	document: PsdDocument,
	next: PsdDocumentSelection,
	mode: PsdSelectionCombineMode = "replace",
): void {
	if (mode === "replace" || (!document.selection && mode === "add")) {
		document.selection = next;
		return;
	}
	const nextMask = rasterizeSelection(next, document.width, document.height);
	const currentMask = document.selection
		? rasterizeSelection(document.selection, document.width, document.height).slice()
		: new Uint8Array(document.width * document.height);
	for (let index = 0; index < currentMask.length; index++) {
		if (mode === "add") currentMask[index] = Math.max(currentMask[index], nextMask[index]);
		else if (mode === "subtract")
			currentMask[index] = Math.round((currentMask[index] * (255 - nextMask[index])) / 255);
		else currentMask[index] = Math.min(currentMask[index], nextMask[index]);
	}
	document.selection = {
		shape: {
			kind: "pixels",
			mask: currentMask,
			width: document.width,
			height: document.height,
		},
		inverted: false,
		feather: 0,
	};
}

function cloneSelection(selection: PsdDocumentSelection): PsdDocumentSelection {
	const shape = selection.shape;
	return {
		inverted: selection.inverted,
		feather: selection.feather,
		shape:
			shape.kind === "polygon"
				? { kind: "polygon", points: shape.points.map((point) => ({ ...point })) }
				: shape.kind === "pixels"
					? {
							kind: "pixels",
							mask: new Uint8Array(shape.mask),
							width: shape.width,
							height: shape.height,
						}
					: { ...shape },
	};
}

/**
 * Applies validated actions to `document` **in place**. Throws
 * `PsdActionError` without partial effects for the failing action; the
 * session wraps the batch in a transaction for atomicity.
 */
export function applyPsdActions(
	document: PsdDocument,
	actions: readonly PsdEditorAction[],
	context: PsdApplyContext,
): PsdApplyResult {
	const result: PsdApplyResult = {
		affectedIds: [],
		createdIds: [],
		deletedIds: [],
		changed: false,
		diagnostics: [],
	};

	const touch = (id: string, didChange = true): void => {
		if (didChange) {
			result.changed = true;
			if (!result.affectedIds.includes(id)) result.affectedIds.push(id);
		}
	};

	const markChanged = (): void => {
		result.changed = true;
	};

	for (const action of actions) {
		switch (action.type) {
			case "retouch.apply":
			case "contentAware.fill": {
				const { layer: node } = locateLayer(document, action.layerId);
				requireUnlocked(
					node,
					action.type === "contentAware.fill" || action.target !== "mask",
				);
				if (action.type === "retouch.apply" && action.target === "mask") {
					if (!node.mask) throw new PsdActionError("This layer has no mask", "layerId");
					if (action.tool !== "blur")
						throw new PsdActionError(
							"Masks support the Blur tool; healing requires image pixels",
							"tool",
						);
					const mask = expandMaskToCanvas(node.mask, document.width, document.height),
						bitmap = maskBitmap(mask),
						selection = document.selection
							? sliceSelectionMask(
									rasterizeSelection(
										document.selection,
										document.width,
										document.height,
									),
									document.width,
									document.height,
									mask.left,
									mask.top,
									bitmap.width,
									bitmap.height,
								)
							: undefined;
					node.mask = replaceMaskBitmap(
						mask,
						applyBlurStroke(
							bitmap,
							{
								points: action.points.map((p) => ({
									x: p.x - mask.left,
									y: p.y - mask.top,
								})),
								size: action.size,
								hardness: action.hardness ?? 0.8,
								opacity: action.opacity ?? 1,
								radius: action.radius,
							},
							selection,
						),
					);
					touch(node.id);
					break;
				}
				const layer = requireRasterOrText(node, "layerId");
				if (action.type === "contentAware.fill") {
					if (!document.selection)
						throw new PsdActionError(
							"Select an area before content-aware fill",
							"layerId",
						);
					const coverage = rasterizeSelection(
						document.selection,
						document.width,
						document.height,
					);
					let left = document.width,
						top = document.height,
						right = 0,
						bottom = 0;
					for (let y = 0; y < document.height; y++)
						for (let x = 0; x < document.width; x++)
							if (coverage[y * document.width + x]) {
								left = Math.min(left, x);
								top = Math.min(top, y);
								right = Math.max(right, x + 1);
								bottom = Math.max(bottom, y + 1);
							}
					if (right > left && bottom > top)
						expandLayerToInclude(
							layer,
							{ x: left, y: top, width: right - left, height: bottom - top },
							document,
						);
				}
				const selection = selectionMaskFor(document, layer);
				let source: PsdBitmap | undefined;
				if (action.sampleAllLayers) {
					const composite = composePsdDocument(document);
					source = createPsdBitmap(layer.bitmap.width, layer.bitmap.height);
					for (let y = 0; y < source.height; y++)
						for (let x = 0; x < source.width; x++) {
							const cx = x + layer.left,
								cy = y + layer.top;
							if (cx >= 0 && cy >= 0 && cx < composite.width && cy < composite.height)
								source.data.set(
									composite.data.subarray(
										(cy * composite.width + cx) * 4,
										(cy * composite.width + cx) * 4 + 4,
									),
									(y * source.width + x) * 4,
								);
						}
				}
				if (action.type === "contentAware.fill")
					layer.bitmap = contentAwareFill(
						layer.bitmap,
						selection ??
							new Uint8Array(layer.bitmap.width * layer.bitmap.height).fill(255),
						source,
						action.searchRadius,
					);
				else {
					const options = {
						points: action.points.map((p) => ({
							x: p.x - layer.left,
							y: p.y - layer.top,
						})),
						size: action.size,
						hardness: action.hardness ?? 0.8,
						opacity: action.opacity ?? 1,
						radius: action.radius,
					};
					layer.bitmap =
						action.tool === "blur"
							? applyBlurStroke(layer.bitmap, options, selection)
							: applyHealingStroke(layer.bitmap, options, selection, source);
				}
				touch(layer.id);
				break;
			}
			case "adjustment.set": {
				const adjustment = JSON.parse(
					JSON.stringify(action.adjustment),
				) as typeof action.adjustment;
				if (
					document.colorMode !== "rgb" &&
					(adjustment.kind === "hue-saturation" || adjustment.kind === "gradient-map")
				)
					throw new PsdActionError(
						"Color adjustments require an RGB document",
						"adjustment",
					);
				if (action.layerId) {
					const { layer } = locateLayer(document, action.layerId);
					requireUnlocked(layer, false);
					if (layer.kind === "group" || !layer.adjustment)
						throw new PsdActionError("Select an adjustment layer", "layerId");
					layer.adjustment = adjustment;
					touch(layer.id);
				} else {
					const id = context.allocateLayerId(),
						layer = newRasterLayer(
							id,
							action.name ?? adjustment.kind,
							0,
							0,
							createPsdBitmap(0, 0),
						);
					layer.adjustment = adjustment;
					if (action.aboveLayerId) {
						const ref = locate(document, action.aboveLayerId, "aboveLayerId"),
							anchor = ref.list[ref.index];
						if (anchor.kind === "group") {
							requireUnlocked(anchor, false);
							anchor.children.push(layer);
						} else ref.list.splice(ref.index + 1, 0, layer);
					} else document.layers.push(layer);
					result.createdIds.push(id);
					markChanged();
				}
				break;
			}
			case "curves.set": {
				const curves = Object.fromEntries(
					Object.entries(action.curves).map(([c, points]) => [
						c,
						points.map((p) => ({ ...p })),
					]),
				) as typeof action.curves;
				if (action.layerId) {
					const { layer } = locateLayer(document, action.layerId);
					requireUnlocked(layer, false);
					if (layer.kind === "group" || !layer.curves)
						throw new PsdActionError("Select a curves adjustment layer", "layerId");
					layer.curves = curves;
					touch(layer.id);
				} else {
					const id = context.allocateLayerId();
					const layer = newRasterLayer(
						id,
						action.name ?? "Curves",
						0,
						0,
						createPsdBitmap(0, 0),
					);
					layer.curves = curves;
					document.layers.push(layer);
					result.createdIds.push(id);
					markChanged();
				}
				break;
			}
			case "mask.edit": {
				const { layer } = locateLayer(document, action.layerId);
				requireUnlocked(layer, false);
				const ownedMask = layer.mask;
				if (!ownedMask) throw new PsdActionError("This layer has no mask", "layerId");
				const mask = action.operation === "fill" ? expandMaskToCanvas(ownedMask, document.width, document.height) : ownedMask;
				if (action.operation === "transform") {
					if (!action.matrix)
						throw new PsdActionError("Transform requires matrix", "matrix");
					layer.mask = transformMask(mask, action.matrix);
				} else {
					const bitmap = maskBitmap(mask);
					const selection = document.selection
						? sliceSelectionMask(
								rasterizeSelection(
									document.selection,
									document.width,
									document.height,
								),
								document.width,
								document.height,
								mask.left,
								mask.top,
								bitmap.width,
								bitmap.height,
							)
						: undefined;
					if (action.operation === "fill") {
						if (action.value === undefined)
							throw new PsdActionError("Fill requires value", "value");
						layer.mask = replaceMaskBitmap(
							mask,
							applyFill(
								bitmap,
								{ r: action.value, g: action.value, b: action.value },
								1,
								undefined,
								selection,
							),
						);
					} else {
						if (action.radius === undefined)
							throw new PsdActionError("Feather requires radius", "radius");
						layer.mask = replaceMaskBitmap(
							mask,
							applyFilter(
								bitmap,
								"gaussian-blur",
								{ radius: action.radius },
								selection,
							),
						);
					}
				}
				touch(layer.id);
				break;
			}
			case "mask.set": {
				const { layer } = locateLayer(document, action.layerId);
				requireUnlocked(layer, false);
				if (
					layer.kind === "group" ||
					layer.bitmap.width !== action.width ||
					layer.bitmap.height !== action.height
				)
					throw new PsdActionError("Mask dimensions must match the image layer", "width");
				const data = psdBase64ToBytes(action.dataBase64);
				if (data.length !== action.width * action.height)
					throw new PsdActionError(
						"Mask byte count does not match dimensions",
						"dataBase64",
					);
				const old = layer.mask;
				if (action.combine && old && !old.disabled) {
					const ow = old.right - old.left;
					for (let y = 0; y < action.height; y++)
						for (let x = 0; x < action.width; x++) {
							const wx = layer.left + x,
								wy = layer.top + y;
							const value =
								wx >= old.left && wx < old.right && wy >= old.top && wy < old.bottom
									? old.data[(wy - old.top) * ow + wx - old.left]
									: old.defaultColor;
							data[y * action.width + x] = Math.round(
								(data[y * action.width + x] * value) / 255,
							);
						}
				}
				if (action.respectSelection) {
					const selection = selectionMaskFor(document, layer);
					if (selection) {
						for (let y = 0; y < action.height; y++)
							for (let x = 0; x < action.width; x++) {
								const wx = layer.left + x,
									wy = layer.top + y,
									p = y * action.width + x;
								const prior =
									old && !old.disabled
										? wx >= old.left &&
											wx < old.right &&
											wy >= old.top &&
											wy < old.bottom
											? old.data[
													(wy - old.top) * (old.right - old.left) +
														wx -
														old.left
												]
											: old.defaultColor
										: 255;
								data[p] = Math.round(
									(data[p] * selection[p]) / 255 +
										prior * (1 - selection[p] / 255),
								);
							}
					}
				}

				layer.mask = {
					left: layer.left,
					top: layer.top,
					right: layer.left + action.width,
					bottom: layer.top + action.height,
					defaultColor: 0,
					disabled: false,
					linked: old?.linked ?? true,
					data,
				};
				touch(layer.id);
				break;
			}
			case "layer.mask": {
				const { layer } = locateLayer(document, action.layerId);
				requireUnlocked(layer, false);
				const operation = action.operation;
				const mask = layer.mask;
				if (
					operation === "reveal-all" ||
					operation === "hide-all" ||
					operation === "from-selection"
				) {
					if (mask)
						throw new PsdActionError(
							"Delete the existing mask before creating a new one",
							"layerId",
						);
					if (operation === "from-selection" && !document.selection) {
						throw new PsdActionError(
							"Select an area before creating a selection mask",
							"operation",
						);
					}
					const value = operation === "reveal-all" ? 255 : 0;
					const data =
						operation === "from-selection"
							? rasterizeSelection(
									document.selection!,
									document.width,
									document.height,
								)
							: new Uint8Array(document.width * document.height).fill(value);
					layer.mask = {
						top: 0,
						left: 0,
						right: document.width,
						bottom: document.height,
						defaultColor: value,
						disabled: false,
						data,
					};
				} else {
					if (!mask) throw new PsdActionError("This layer has no mask", "layerId");
					if (operation === "delete") layer.mask = undefined;
					else if (operation === "link" || operation === "unlink") {
						if ((mask.linked !== false) === (operation === "link")) break;
						layer.mask = { ...mask, linked: operation === "link" };
					} else if (operation === "invert")
						layer.mask = {
							...mask,
							defaultColor: 255 - mask.defaultColor,
							data: mask.data.map((value) => 255 - value),
						};
					else {
						const disabled = operation === "disable";
						if (mask.disabled === disabled) break;
						layer.mask = { ...mask, disabled };
					}
				}
				touch(layer.id);
				break;
			}
			case "layer.rename": {
				const { layer } = locateLayer(document, action.layerId);
				touch(layer.id, layer.name !== action.name);
				layer.name = action.name;
				break;
			}
			case "layer.setVisible": {
				const { layer } = locateLayer(document, action.layerId);
				touch(layer.id, layer.visible !== action.visible);
				layer.visible = action.visible;
				break;
			}
			case "layer.setLocked": {
				const { layer } = locateLayer(document, action.layerId);
				const next = action.locked;
				touch(layer.id, layer.locks.all !== next);
				layer.locks = { transparency: next, composite: next, position: next, all: next };
				break;
			}
			case "layer.setOpacity": {
				const { layer } = locateLayer(document, action.layerId);
				requireUnlocked(layer, false);
				touch(layer.id, layer.opacity !== action.opacity);
				layer.opacity = action.opacity;
				break;
			}
			case "layer.setBlendMode": {
				const { layer } = locateLayer(document, action.layerId);
				requireUnlocked(layer, false);
				touch(layer.id, layer.blendMode !== action.blendMode);
				layer.blendMode = action.blendMode;
				delete layer.blendModeFallback;
				break;
			}
			case "layer.setClipping": {
				const { layer } = locateLayer(document, action.layerId);
				requireUnlocked(layer, false);
				if (layer.kind === "group") {
					throw new PsdActionError("Groups cannot be clipping layers", "layerId");
				}
				touch(layer.id, layer.clipping !== action.clipping);
				layer.clipping = action.clipping;
				break;
			}
			case "layer.reorder": {
				const ref = locate(document, action.layerId, "layerId");
				const layer = ref.list[ref.index];
				requireUnlocked(layer, false);
				let targetList: PsdLayerNode[];
				if (action.parentId == null) {
					targetList = document.layers;
				} else {
					const { layer: parent } = locateLayer(document, action.parentId, "parentId");
					if (parent.kind !== "group") {
						throw new PsdActionError(`'${action.parentId}' is not a group`, "parentId");
					}
					if (parent.id === layer.id || isDescendant(layer, parent.id)) {
						throw new PsdActionError("Cannot move a group into itself", "parentId");
					}
					targetList = parent.children;
				}
				ref.list.splice(ref.index, 1);
				const index = Math.min(Math.max(0, Math.round(action.index)), targetList.length);
				targetList.splice(index, 0, layer);
				touch(layer.id);
				break;
			}
			case "layer.delete": {
				for (const id of action.layerIds) {
					const ref = locate(document, id, "layerIds");
					const [removed] = ref.list.splice(ref.index, 1);
					result.deletedIds.push(removed.id);
					if (removed.kind === "group") {
						walkPsdLayers(removed.children, (child) =>
							result.deletedIds.push(child.id),
						);
					}
					markChanged();
				}
				break;
			}
			case "layer.clearSelected": {
				if (!document.selection) {
					throw new PsdActionError(
						"layer.clearSelected requires an active selection",
						"type",
					);
				}
				const { layer: node } = locateLayer(document, action.layerId);
				const layer = requireRasterOrText(node, "layerId");
				requireUnlocked(layer, true);
				const mask = selectionMaskFor(document, layer);
				if (!mask) {
					throw new PsdActionError(
						"layer.clearSelected requires an active selection",
						"type",
					);
				}
				const cleared = clonePsdBitmap(layer.bitmap);
				let changed = false;
				for (let index = 0; index < mask.length; index++) {
					const alphaIndex = index * 4 + 3;
					const previous = cleared.data[alphaIndex];
					const next = Math.round(previous * (1 - mask[index] / 255));
					if (next === previous) continue;
					cleared.data[alphaIndex] = next;
					changed = true;
				}
				if (changed) layer.bitmap = cleared;
				touch(layer.id, changed);
				break;
			}
			case "layer.duplicate": {
				const ref = locate(document, action.layerId, "layerId");
				const source = ref.list[ref.index];
				const copy = cloneLayerDeep(source, context, result.createdIds);
				copy.name = action.name ?? `${source.name} copy`;
				ref.list.splice(ref.index + 1, 0, copy);
				markChanged();
				break;
			}
			case "layer.import": {
				const imported = readPsd(psdBase64ToBytes(action.psdBase64));
				if (!imported.editable || imported.colorMode !== document.colorMode)
					throw new PsdActionError(
						"Import requires an editable PSD in the same color mode",
						"psdBase64",
					);
				let list = document.layers;
				if (action.parentId) {
					const { layer } = locateLayer(document, action.parentId);
					if (layer.kind !== "group")
						throw new PsdActionError("Destination must be a group", "parentId");
					requireUnlocked(layer, false);
					list = layer.children;
				}
				const remap = (l: PsdLayerNode): PsdLayerNode => ({
					...l,
					id: context.allocateLayerId(),
					...(l.kind === "group" ? { children: l.children.map(remap) } : {}),
				});
				imported.layers = imported.layers.map(remap);
				const index = Math.min(list.length, Math.round(action.index ?? list.length));
				list.splice(index, 0, ...imported.layers);
				result.createdIds.push(...imported.layers.map((l) => l.id));
				markChanged();
				break;
			}
			case "layer.add": {
				const id = context.allocateLayerId();
				const rect = action.rect ?? {
					x: 0,
					y: 0,
					width: document.width,
					height: document.height,
				};
				const width = Math.max(1, Math.round(rect.width));
				const height = Math.max(1, Math.round(rect.height));
				const bitmap = createPsdBitmap(width, height);
				if (action.color) {
					for (let p = 0; p < bitmap.data.length; p += 4) {
						bitmap.data[p] = action.color.r;
						bitmap.data[p + 1] = action.color.g;
						bitmap.data[p + 2] = action.color.b;
						bitmap.data[p + 3] = 255;
					}
				}
				document.layers.push(
					newRasterLayer(
						id,
						action.name ?? "Layer",
						Math.round(rect.y),
						Math.round(rect.x),
						bitmap,
					),
				);
				result.createdIds.push(id);
				markChanged();
				break;
			}
			case "layer.group": {
				const refs = action.layerIds.map((id) => locate(document, id, "layerIds"));
				const list = refs[0].list;
				for (const ref of refs) {
					if (ref.list !== list) {
						throw new PsdActionError(
							"Layers must share the same parent to group",
							"layerIds",
						);
					}
				}
				const members = refs
					.map((ref) => ref.list[ref.index])
					.sort((a, b) => list.indexOf(a) - list.indexOf(b));
				const anchor = Math.min(...members.map((member) => list.indexOf(member)));
				for (const member of members) list.splice(list.indexOf(member), 1);
				const id = context.allocateLayerId();
				const group: PsdGroupLayer = {
					kind: "group",
					id,
					name: action.name ?? "Group",
					visible: true,
					opacity: 1,
					blendMode: "normal",
					clipping: false,
					locks: createEmptyLocks(),
					preservedBlocks: [],
					open: true,
					children: members,
				};
				list.splice(Math.min(anchor, list.length), 0, group);
				result.createdIds.push(id);
				markChanged();
				break;
			}
			case "layer.ungroup": {
				const ref = locate(document, action.groupId, "groupId");
				const group = ref.list[ref.index];
				if (group.kind !== "group") {
					throw new PsdActionError(`'${action.groupId}' is not a group`, "groupId");
				}
				ref.list.splice(ref.index, 1, ...group.children);
				result.deletedIds.push(group.id);
				markChanged();
				break;
			}
			case "layer.mergeDown":
			case "layer.merge": {
				let layerIds: string[];
				if (action.type === "layer.mergeDown") {
					const ref = locate(document, action.layerId, "layerId");
					if (ref.index === 0) throw new PsdActionError("There is no lower sibling to merge", "layerId");
					layerIds = [ref.list[ref.index - 1].id, action.layerId];
				} else layerIds = action.layerIds;
				if (layerIds.length < 2) {
					throw new PsdActionError("layer.merge needs at least two layers", "layerIds");
				}
				const refs = layerIds.map((id) => locate(document, id, "layerIds"));
				const list = refs[0].list;
				for (const ref of refs) {
					if (ref.list !== list) {
						throw new PsdActionError(
							"Layers must share the same parent to merge",
							"layerIds",
						);
					}
				}
				const members = refs
					.map((ref) => ref.list[ref.index])
					.sort((a, b) => list.indexOf(a) - list.indexOf(b));
				function checkMergeLocks(layers: readonly PsdLayerNode[]) {
					for (const layer of layers) {
						requireUnlocked(layer, true);
						if (layer.kind === "group") checkMergeLocks(layer.children);
					}
				}
				checkMergeLocks(members);
				let parent = refs[0].parent;
				while (parent) {
					requireUnlocked(parent, false);
					parent = locate(document, parent.id, "layerIds").parent;
				}
				const flattened = createPsdBitmap(document.width, document.height);
				composeLayers(flattened, members);
				const topIndex = Math.max(...members.map((member) => list.indexOf(member)));
				const id = context.allocateLayerId();
				list.splice(
					topIndex + 1,
					0,
					newRasterLayer(
						id,
						(action.type === "layer.merge" ? action.name : undefined) ?? members[members.length - 1].name,
						0,
						0,
						flattened,
					),
				);
				for (const member of members) {
					list.splice(list.indexOf(member), 1);
					result.deletedIds.push(member.id);
				}
				result.createdIds.push(id);
				markChanged();
				break;
			}
			case "layer.mergeVisible": {
				const visible = document.layers.filter((layer) => layer.visible);
				if (!visible.length) {
					throw new PsdActionError("No visible layers to merge", "type");
				}
				const flattened = createPsdBitmap(document.width, document.height);
				composeLayers(flattened, visible);
				const topIndex = Math.max(
					...visible.map((member) => document.layers.indexOf(member)),
				);
				const id = context.allocateLayerId();
				document.layers.splice(
					topIndex + 1,
					0,
					newRasterLayer(id, action.name ?? "Merged", 0, 0, flattened),
				);
				for (const member of visible) {
					document.layers.splice(document.layers.indexOf(member), 1);
					result.deletedIds.push(member.id);
					if (member.kind === "group") {
						walkPsdLayers(member.children, (child) => result.deletedIds.push(child.id));
					}
				}
				result.createdIds.push(id);
				markChanged();
				break;
			}
			case "image.flatten": {
				const flattened = composePsdDocument(document);
				walkPsdLayers(document.layers, (layer) => result.deletedIds.push(layer.id));
				const id = context.allocateLayerId();
				document.layers = [newRasterLayer(id, "Background", 0, 0, flattened)];
				result.createdIds.push(id);
				markChanged();
				break;
			}
			case "layer.rasterize": {
				const ref = locate(document, action.layerId, "layerId");
				const layer = ref.list[ref.index];
				if (layer.kind !== "text") {
					throw new PsdActionError(
						`Layer '${layer.name}' is not a text layer`,
						"layerId",
					);
				}
				requireUnlocked(layer, false);
				const raster = newRasterLayer(
					layer.id,
					layer.name,
					layer.top,
					layer.left,
					layer.bitmap,
				);
				raster.visible = layer.visible;
				raster.opacity = layer.opacity;
				raster.blendMode = layer.blendMode;
				raster.clipping = layer.clipping;
				raster.locks = { ...layer.locks };
				if (layer.mask) raster.mask = layer.mask;
				if (layer.sourceTransform?.rendered === layer.bitmap)
					raster.sourceTransform = layer.sourceTransform;
				ref.list.splice(ref.index, 1, raster);
				touch(layer.id);
				break;
			}
			case "layer.fromSelection": {
				if (!document.selection) {
					throw new PsdActionError(
						"layer.fromSelection requires an active selection",
						"type",
					);
				}
				const ref = locate(document, action.sourceLayerId, "sourceLayerId");
				const source = ref.list[ref.index];
				const layer = requireRasterOrText(source, "sourceLayerId");
				const mask = selectionMaskFor(document, layer);
				if (action.cut) requireUnlocked(layer, true);
				const copy = clonePsdBitmap(layer.bitmap);
				if (mask) {
					for (let index = 0; index < mask.length; index++) {
						copy.data[index * 4 + 3] = (copy.data[index * 4 + 3] * mask[index]) / 255;
					}
				}
				const id = context.allocateLayerId();
				const created = newRasterLayer(
					id,
					action.name ?? `${layer.name} copy`,
					layer.top + Math.round(action.dy ?? 0),
					layer.left + Math.round(action.dx ?? 0),
					copy,
				);
				if (action.cut && mask) {
					const cleared = clonePsdBitmap(layer.bitmap);
					for (let i = 0; i < mask.length; i++)
						cleared.data[i * 4 + 3] = Math.round(
							cleared.data[i * 4 + 3] * (1 - mask[i] / 255),
						);
					layer.bitmap = cleared;
					touch(layer.id);
				}
				ref.list.splice(ref.index + 1, 0, created);
				result.createdIds.push(id);
				markChanged();
				break;
			}
			case "layer.move": {
				const { layer } = locateLayer(document, action.layerId);
				requireUnlocked(layer, false);
				if (layer.locks.position) {
					throw new PsdActionError(
						`Layer '${layer.name}' has locked position`,
						"layerId",
					);
				}
				const dx = Math.round(action.dx);
				const dy = Math.round(action.dy);
				touch(layer.id, dx !== 0 || dy !== 0);
				moveLayer(layer, dx, dy);
				break;
			}
			case "transform.selection": {
				for (const id of transformSelectedLayers(document, action.layerIds, action))
					touch(id);
				break;
			}
			case "layer.scale":
			case "transform.apply": {
				const { layer: node } = locateLayer(document, action.layerId);
				const layer = requireRasterOrText(node, "layerId");
				requireUnlocked(layer, true);
				if (layer.locks.position)
					throw new PsdActionError("Layer position is locked", "layerId");
				let matrix: PsdAffine;
				if (action.type === "layer.scale") {
					const sx = Math.round(action.width) / Math.max(1, layer.bitmap.width),
						sy = Math.round(action.height) / Math.max(1, layer.bitmap.height);
					if (sx === 1 && sy === 1) break;
					matrix = aroundPoint([sx, 0, 0, sy, 0, 0], layer.left, layer.top);
				} else if (action.operation === "distort") {
					const x = layer.left,
						y = layer.top,
						w = layer.bitmap.width,
						h = layer.bitmap.height;
					matrix = quadTransform(
						[
							{ x, y },
							{ x: x + w, y },
							{ x: x + w, y: y + h },
							{ x, y: y + h },
						],
						action.corners!,
					);
				} else {
					const op = action.operation;
					const angle =
						((op === "rotate"
							? (action.degrees ?? 0)
							: op === "rotate-90"
								? 90
								: op === "rotate-180"
									? 180
									: op === "rotate-270"
										? 270
										: 0) *
							Math.PI) /
						180;
					const c = Math.cos(angle),
						sn = Math.sin(angle);
					matrix = aroundPoint(
						op === "flip-horizontal"
							? [-1, 0, 0, 1, 0, 0]
							: op === "flip-vertical"
								? [1, 0, 0, -1, 0, 0]
								: [c, sn, -sn, c, 0, 0],
						layer.left + layer.bitmap.width / 2,
						layer.top + layer.bitmap.height / 2,
					);
				}
				transformLayerPixels(layer, matrix);
				if (layer.mask && layer.mask.linked !== false)
					layer.mask = transformMask(layer.mask, matrix);
				touch(layer.id);
				break;
			}
			case "text.setContent": {
				const { layer: node } = locateLayer(document, action.layerId);
				if (node.kind !== "text") {
					throw new PsdActionError(`Layer '${node.name}' is not a text layer`, "layerId");
				}
				requireUnlocked(node, true);
				touch(node.id, node.text.text !== action.text);
				const rewritten = rewriteTyShText(node.text.raw, action.text);
				if (rewritten) {
					node.text = { text: action.text, raw: rewritten.raw, style: node.text.style };
					if (!rewritten.engineDataPatched) {
						result.diagnostics.push(
							`Layer '${node.name}': the styled text engine data could not be updated; Photoshop may still show the previous text.`,
						);
					}
				} else {
					node.text = { text: action.text, raw: node.text.raw, style: node.text.style };
					result.diagnostics.push(
						`Layer '${node.name}': the text metadata block uses unsupported features and was kept unchanged.`,
					);
				}
				const raster = context.rasterizeText?.(node, action.text);
				if (raster) {
					node.bitmap = raster;
				} else {
					result.diagnostics.push(
						`Layer '${node.name}': text pixels were not re-rendered (no rasterizer in this environment).`,
					);
				}
				break;
			}
			case "text.setStyle": {
				const { layer: node } = locateLayer(document, action.layerId);
				if (node.kind !== "text") {
					throw new PsdActionError(`Layer '${node.name}' is not a text layer`, "layerId");
				}
				requireUnlocked(node, true);
				const previous = node.text.style;
				const changed =
					!previous ||
					previous.fontFamily !== action.style.fontFamily ||
					previous.fontSize !== action.style.fontSize ||
					previous.bold !== action.style.bold ||
					previous.italic !== action.style.italic ||
					previous.underline !== action.style.underline ||
					previous.strikethrough !== action.style.strikethrough ||
					previous.color.r !== action.style.color.r ||
					previous.color.g !== action.style.color.g ||
					previous.color.b !== action.style.color.b;
				touch(node.id, changed);
				if (!changed) break;
				node.text = {
					...node.text,
					style: { ...action.style, color: { ...action.style.color } },
				};
				const raster = context.rasterizeText?.(node, node.text.text);
				if (raster) {
					node.bitmap = raster;
				} else {
					result.diagnostics.push(
						`Layer '${node.name}': styled text pixels were not re-rendered (no rasterizer in this environment).`,
					);
				}
				break;
			}
			case "text.addLayer": {
				const id = context.allocateLayerId();
				const size = Math.round(action.size ?? 32);
				const lineHeight = 1.25;
				const color = action.color ?? { r: 0, g: 0, b: 0 };
				const lines = action.text.split("\n");
				// Placeholder bitmap until the host rasterizer replaces it.
				const fallback = createPsdBitmap(
					Math.max(
						1,
						Math.round(Math.max(...lines.map((line) => line.length), 1) * size * 0.6),
					),
					Math.max(1, Math.round(size * lineHeight * lines.length)),
				);
				const layer: PsdTextLayer = {
					kind: "text",
					id,
					name: action.name ?? action.text.slice(0, 32),
					visible: true,
					opacity: 1,
					blendMode: "normal",
					clipping: false,
					locks: createEmptyLocks(),
					preservedBlocks: [],
					top: Math.round(action.y),
					left: Math.round(action.x),
					bitmap: fallback,
					text: {
						text: action.text,
						raw: createTyShBlock(action.text),
						style: {
							fontFamily: "Arial",
							fontSize: size,
							bold: false,
							italic: false,
							underline: false,
							strikethrough: false,
							color: { ...color },
						},
					},
				};
				const raster = context.rasterizeText?.(layer, action.text);
				if (raster) {
					layer.bitmap = raster;
				} else {
					result.diagnostics.push(
						"text.addLayer: text pixels were not rendered (no rasterizer in this environment).",
					);
				}
				document.layers.push(layer);
				result.createdIds.push(id);
				markChanged();
				break;
			}
			case "adjustment.apply": {
				const { layer: node } = locateLayer(document, action.layerId);
				const layer = requireRasterOrText(node, "layerId");
				requireUnlocked(layer, true);
				const mask = selectionMaskFor(document, layer);
				const params = action.params ?? {};
				switch (action.kind) {
					case "levels":
						layer.bitmap = applyLevels(layer.bitmap, params, mask);
						break;
					case "color-balance":
						layer.bitmap = applyColorBalance(layer.bitmap, params, mask);
						break;
					case "exposure":
						layer.bitmap = applyExposure(layer.bitmap, params, mask);
						break;
					case "vibrance":
						layer.bitmap = applyVibrance(layer.bitmap, params, mask);
						break;
					case "black-white":
						layer.bitmap = applyBlackWhite(layer.bitmap, params, mask);
						break;
					default:
						layer.bitmap = applyAdjustment(
							layer.bitmap,
							action.kind as PsdAdjustmentKind,
							params,
							mask,
						);
				}
				touch(layer.id);
				break;
			}
			case "filter.apply": {
				const { layer: node } = locateLayer(document, action.layerId);
				const layer = requireRasterOrText(node, "layerId");
				requireUnlocked(layer, true);
				if (
					action.kind === "gaussian-blur" ||
					(action.kind === "motion-blur" && (action.params?.distance ?? 20) > 0)
				) {
					const pad =
						action.kind === "gaussian-blur"
							? Math.ceil((action.params?.radius ?? 4) * 3 + 2)
							: Math.ceil((action.params?.distance ?? 20) / 2 + 2);
					const width = layer.bitmap.width + pad * 2,
						height = layer.bitmap.height + pad * 2;
					if (width > 30000 || height > 30000 || width * height > 80_000_000)
						throw new PsdActionError("Expanded blur exceeds bitmap limits", "params");
					const expanded = createPsdBitmap(width, height);
					for (let y = 0; y < layer.bitmap.height; y++)
						expanded.data.set(
							layer.bitmap.data.subarray(
								y * layer.bitmap.width * 4,
								(y + 1) * layer.bitmap.width * 4,
							),
							((y + pad) * width + pad) * 4,
						);
					layer.bitmap = expanded;
					layer.left -= pad;
					layer.top -= pad;
				}
				const mask = selectionMaskFor(document, layer);
				layer.bitmap = applyFilter(layer.bitmap, action.kind, action.params, mask);
				touch(layer.id);
				break;
			}
			case "effect.apply": {
				const { layer: node } = locateLayer(document, action.layerId);
				const layer = requireRasterOrText(node, "layerId");
				requireUnlocked(layer, true);
				const applied = applyLayerEffect(layer.bitmap, action.kind, action.params);
				layer.bitmap = applied.bitmap;
				layer.left += applied.offsetX;
				layer.top += applied.offsetY;
				touch(layer.id);
				break;
			}
			case "fill.apply": {
				const { layer: node } = locateLayer(document, action.layerId);
				const layer = requireRasterOrText(node, "layerId");
				requireUnlocked(layer, true);
				if (action.rect) {
					expandLayerToInclude(layer, action.rect, document);
				}
				const mask = selectionMaskFor(document, layer);
				layer.bitmap = applyFill(
					layer.bitmap,
					action.color,
					action.opacity ?? 1,
					action.rect
						? {
								x: action.rect.x - layer.left,
								y: action.rect.y - layer.top,
								width: action.rect.width,
								height: action.rect.height,
							}
						: undefined,
					mask,
				);
				touch(layer.id);
				break;
			}
			case "stroke.apply": {
				const { layer: node } = locateLayer(document, action.layerId);
				if (action.target === "mask") {
					requireUnlocked(node, false);
					let mask = node.mask;
					if (!mask) throw new PsdActionError("This layer has no mask", "layerId");
					if (action.tool !== "brush" && action.tool !== "eraser")
						throw new PsdActionError("Mask painting supports brush and eraser", "tool");
					mask = expandMaskToCanvas(mask, document.width, document.height);
					const bitmap = maskBitmap(mask);
					const value =
						action.tool === "eraser"
							? 255
							: Math.round(
									0.299 * (action.color?.r ?? 0) +
										0.587 * (action.color?.g ?? 0) +
										0.114 * (action.color?.b ?? 0),
								);
					const selection = document.selection
						? sliceSelectionMask(
								rasterizeSelection(
									document.selection,
									document.width,
									document.height,
								),
								document.width,
								document.height,
								mask.left,
								mask.top,
								bitmap.width,
								bitmap.height,
							)
						: undefined;
					node.mask = replaceMaskBitmap(
						mask,
						applyStroke(bitmap, {
							tool: "brush",
							points: action.points.map((p) => ({
								x: p.x - mask.left,
								y: p.y - mask.top,
							})),
							size: action.size,
							hardness: action.hardness ?? 1,
							opacity: action.opacity ?? 1,
							color: { r: value, g: value, b: value },
							mask: selection,
						}),
					);
					touch(node.id);
					break;
				}

				const layer = requireRasterOrText(node, "layerId");
				requireUnlocked(layer, true);
				const cloneComposite =
					action.tool === "clone" && action.sampleAllLayers
						? composePsdDocument(document)
						: undefined;
				const radius = action.size / 2;
				const xs = action.points.map((point) => point.x);
				const ys = action.points.map((point) => point.y);
				expandLayerToInclude(
					layer,
					{
						x: Math.min(...xs) - radius,
						y: Math.min(...ys) - radius,
						width: Math.max(...xs) - Math.min(...xs) + action.size,
						height: Math.max(...ys) - Math.min(...ys) + action.size,
					},
					document,
				);
				const mask = selectionMaskFor(document, layer);
				layer.bitmap = applyStroke(layer.bitmap, {
					tool: action.tool,
					points: action.points.map((point) => ({
						x: point.x - layer.left,
						y: point.y - layer.top,
					})),
					size: action.size,
					hardness: action.hardness ?? 1,
					opacity: action.opacity ?? 1,
					color: action.color ?? { r: 0, g: 0, b: 0 },
					sourceOffset: action.sourceOffset,
					sourceBitmap: cloneComposite,
					sourceOrigin: cloneComposite ? { x: layer.left, y: layer.top } : undefined,
					tonalRange: action.tonalRange,
					mask,
				});
				touch(layer.id);
				break;
			}
			case "bucket.apply": {
				const { layer: node } = locateLayer(document, action.layerId);
				const layer = requireRasterOrText(node, "layerId");
				requireUnlocked(layer, true);
				const localX = Math.round(action.x) - layer.left;
				const localY = Math.round(action.y) - layer.top;
				if (
					localX < 0 ||
					localY < 0 ||
					localX >= layer.bitmap.width ||
					localY >= layer.bitmap.height
				) {
					throw new PsdActionError("The seed point is outside the layer's pixels", "x");
				}
				const mask = selectionMaskFor(document, layer);
				layer.bitmap = applyBucketFill(
					layer.bitmap,
					localX,
					localY,
					action.color,
					action.tolerance ?? 32,
					mask,
					action.opacity ?? 1,
					action.contiguous ?? true,
				);
				touch(layer.id);
				break;
			}
			case "gradient.apply": {
				const { layer: node } = locateLayer(document, action.layerId);
				const layer = requireRasterOrText(node, "layerId");
				requireUnlocked(layer, true);
				expandLayerToInclude(
					layer,
					{ x: 0, y: 0, width: document.width, height: document.height },
					document,
				);
				const mask = selectionMaskFor(document, layer);
				layer.bitmap = applyGradient(
					layer.bitmap,
					{
						type: action.gradientType,
						from: { x: action.from.x - layer.left, y: action.from.y - layer.top },
						to: { x: action.to.x - layer.left, y: action.to.y - layer.top },
						stops: action.stops,
						opacity: action.opacity,
					},
					mask,
				);
				touch(layer.id);
				break;
			}
			case "shape.apply": {
				const { layer: node } = locateLayer(document, action.layerId);
				const layer = requireRasterOrText(node, "layerId");
				requireUnlocked(layer, true);
				const strokeWidth = action.strokeWidth ?? 2;
				const minX = Math.min(action.x, action.x + action.width) - strokeWidth;
				const minY = Math.min(action.y, action.y + action.height) - strokeWidth;
				expandLayerToInclude(
					layer,
					{
						x: minX,
						y: minY,
						width: Math.abs(action.width) + strokeWidth * 2,
						height: Math.abs(action.height) + strokeWidth * 2,
					},
					document,
				);
				const mask = selectionMaskFor(document, layer);
				layer.bitmap = applyShape(
					layer.bitmap,
					{
						shape: action.shape,
						cornerRadius: action.cornerRadius,
						x: action.x - layer.left,
						y: action.y - layer.top,
						width: action.width,
						height: action.height,
						fill: action.fill ?? null,
						stroke: action.stroke ?? null,
						strokeWidth,
						opacity: action.opacity,
					},
					mask,
				);
				touch(layer.id);
				break;
			}
			case "selection.fromLayer": {
				const { layer } = locateLayer(document, action.layerId),
					coverage = new Uint8Array(document.width * document.height);
				if (action.source === "mask-black") {
					const mask = layer.mask;
					if (!mask) throw new PsdActionError("This layer has no mask", "layerId");
					const width = mask.right - mask.left;
					for (
						let y = Math.max(0, mask.top);
						y < Math.min(document.height, mask.bottom);
						y++
					)
						for (
							let x = Math.max(0, mask.left);
							x < Math.min(document.width, mask.right);
							x++
						)
							coverage[y * document.width + x] =
								mask.data[(y - mask.top) * width + x - mask.left] < 128 ? 255 : 0;
				} else {
					const image = requireRasterOrText(layer, "layerId");
					for (
						let y = Math.max(0, image.top);
						y < Math.min(document.height, image.top + image.bitmap.height);
						y++
					)
						for (
							let x = Math.max(0, image.left);
							x < Math.min(document.width, image.left + image.bitmap.width);
							x++
						)
							coverage[y * document.width + x] =
								image.bitmap.data[
									((y - image.top) * image.bitmap.width + x - image.left) * 4 + 3
								] >= 128
									? 255
									: 0;
				}
				combineSelection(
					document,
					{
						shape: {
							kind: "pixels",
							mask: coverage,
							width: document.width,
							height: document.height,
						},
						inverted: false,
					},
					action.combine ?? "replace",
				);
				markChanged();
				break;
			}
			case "selection.set": {
				combineSelection(
					document,
					{
						shape: {
							kind: action.shape,
							x: Math.round(action.x),
							y: Math.round(action.y),
							width: Math.round(action.width),
							height: Math.round(action.height),
						},
						inverted: false,
						feather: normalizeSelectionFeather(action.feather),
					},
					action.combine,
				);
				markChanged();
				break;
			}
			case "selection.setPolygon": {
				combineSelection(
					document,
					{
						shape: { kind: "polygon", points: action.points.map((p) => ({ ...p })) },
						inverted: false,
						feather: normalizeSelectionFeather(action.feather),
					},
					action.combine,
				);
				markChanged();
				break;
			}
			case "selection.magicWand": {
				const composite = composePsdDocument(document);
				const mask = floodSelectMask(
					composite,
					Math.round(action.x),
					Math.round(action.y),
					action.tolerance ?? 32,
					action.contiguous ?? true,
				);
				combineSelection(
					document,
					{
						shape: {
							kind: "pixels",
							mask,
							width: document.width,
							height: document.height,
						},
						inverted: false,
						feather: normalizeSelectionFeather(action.feather),
					},
					action.combine,
				);
				markChanged();
				break;
			}
			case "selection.all": {
				document.selection = {
					shape: {
						kind: "rectangle",
						x: 0,
						y: 0,
						width: document.width,
						height: document.height,
					},
					inverted: false,
					feather: 0,
				};
				markChanged();
				break;
			}
			case "selection.clear": {
				if (document.selection) markChanged();
				document.selection = null;
				break;
			}
			case "selection.invert": {
				if (!document.selection) {
					throw new PsdActionError("There is no selection to invert", "type");
				}
				document.selection = {
					shape: document.selection.shape,
					inverted: !document.selection.inverted,
					feather: document.selection.feather,
				};
				markChanged();
				break;
			}
			case "selection.feather": {
				if (!document.selection) {
					throw new PsdActionError("There is no selection to feather", "type");
				}
				document.selection = {
					...document.selection,
					feather: normalizeSelectionFeather(action.radius),
				};
				markChanged();
				break;
			}
			case "selection.translate": {
				if (!document.selection) {
					throw new PsdActionError("There is no selection to move", "type");
				}
				const dx = Math.round(action.dx);
				const dy = Math.round(action.dy);
				if (!dx && !dy) break;
				document.selection = {
					...document.selection,
					shape: translateSelectionShape(
						document.selection.shape,
						dx,
						dy,
						document.width,
						document.height,
					),
				};
				markChanged();
				break;
			}
			case "selection.save": {
				if (!document.selection) {
					throw new PsdActionError("There is no selection to save", "type");
				}
				const name = action.name.trim();
				const savedSelections = document.savedSelections ?? [];
				const match = savedSelections.findIndex(
					(entry) => entry.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
				);
				const saved = { name, selection: cloneSelection(document.selection) };
				if (match >= 0) savedSelections.splice(match, 1, saved);
				else savedSelections.push(saved);
				document.savedSelections = savedSelections;
				markChanged();
				break;
			}
			case "selection.load": {
				const saved = document.savedSelections?.find(
					(entry) =>
						entry.name.toLocaleLowerCase() === action.name.trim().toLocaleLowerCase(),
				);
				if (!saved) {
					throw new PsdActionError(`No saved selection named '${action.name}'`, "name");
				}
				const next = cloneSelection(saved.selection);
				if (action.invert) next.inverted = !next.inverted;
				combineSelection(document, next, action.combine);
				markChanged();
				break;
			}
			case "canvas.resize": {
				const width = Math.round(action.width);
				const height = Math.round(action.height);
				const anchor = action.anchor ?? "top-left";
				const horizontalFactor = anchor.endsWith("left")
					? 0
					: anchor.endsWith("right")
						? 1
						: 0.5;
				const verticalFactor = anchor.startsWith("top")
					? 0
					: anchor.startsWith("bottom")
						? 1
						: 0.5;
				const dx = Math.round((width - document.width) * horizontalFactor);
				const dy = Math.round((height - document.height) * verticalFactor);
				if (dx || dy) {
					for (const layer of document.layers) moveLayer(layer, dx, dy, true);
				}
				result.changed ||= width !== document.width || height !== document.height;
				document.width = width;
				document.height = height;
				document.selection = null;
				break;
			}
			case "canvas.crop": {
				const x = Math.round(action.x);
				const y = Math.round(action.y);
				document.width = Math.round(action.width);
				document.height = Math.round(action.height);
				for (const layer of document.layers) moveLayer(layer, -x, -y, true);
				document.selection = null;
				markChanged();
				break;
			}
			case "image.resize": {
				const width = Math.round(action.width);
				const height = Math.round(action.height);
				const scaleX = width / document.width;
				const scaleY = height / document.height;
				walkPsdLayers(document.layers, (layer) => {
					const matrix: PsdAffine = [scaleX, 0, 0, scaleY, 0, 0];
					if (layer.kind !== "group" && !layer.curves && !layer.adjustment)
						transformLayerPixels(layer, matrix);
					if (layer.mask) layer.mask = transformMask(layer.mask, matrix);
				});
				document.width = width;
				document.height = height;
				document.selection = null;
				markChanged();
				break;
			}
			case "image.flip":
			case "image.rotate": {
				const operation = action.operation;
				const oldWidth = document.width;
				const oldHeight = document.height;
				const swap = operation === "rotate-90" || operation === "rotate-270";
				const matrix: PsdAffine =
					operation === "flip-horizontal"
						? [-1, 0, 0, 1, oldWidth, 0]
						: operation === "flip-vertical"
							? [1, 0, 0, -1, 0, oldHeight]
							: operation === "rotate-90"
								? [0, 1, -1, 0, oldHeight, 0]
								: operation === "rotate-180"
									? [-1, 0, 0, -1, oldWidth, oldHeight]
									: [0, -1, 1, 0, 0, oldWidth];
				walkPsdLayers(document.layers, (layer) => {
					if (layer.kind !== "group" && !layer.curves && !layer.adjustment)
						transformLayerPixels(layer, matrix);
					if (layer.mask) layer.mask = transformMask(layer.mask, matrix);
				});
				if (swap) {
					document.width = oldHeight;
					document.height = oldWidth;
				}
				document.selection = null;
				markChanged();
				break;
			}
			default: {
				const unhandled: never = action;
				throw new PsdActionError(`Unhandled action: ${String(unhandled)}`, "type");
			}
		}
	}

	return result;
}

export type { PsdDocumentSelection };
