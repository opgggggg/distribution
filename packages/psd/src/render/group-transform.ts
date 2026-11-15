import { type PsdDocument, type PsdLayerNode } from "../codec/document";
import { aroundPoint, multiplyAffine, transformLayerPixels } from "./affine";
import { quadTransform, type Point } from "./projective";
import { transformMask } from "./masks";
export interface PsdSelectionTransform {
	corners?: Point[];
	dx?: number;
	dy?: number;
	scaleX?: number;
	scaleY?: number;
	degrees?: number;
}
export function selectedTransformNodes(
	document: PsdDocument,
	ids: readonly string[],
): PsdLayerNode[] {
	const wanted = new Set(ids),
		out: PsdLayerNode[] = [];
	function visit(layers: readonly PsdLayerNode[], selected = false) {
		for (const l of layers) {
			const include = selected || wanted.has(l.id);
			if (include) out.push(l);
			if (l.kind === "group") visit(l.children, include);
		}
	}
	visit(document.layers);
	for (const id of ids)
		if (!out.some((l) => l.id === id)) throw Error("Selected layer no longer exists");
	return out;
}
export function selectionTransformBounds(document: PsdDocument, ids: readonly string[]) {
	const leaves = selectedTransformNodes(document, ids).filter(
		(l) =>
			l.kind !== "group" && !l.adjustment && !l.curves && l.bitmap.width && l.bitmap.height,
	);
	if (!leaves.length) throw Error("Select layers with image pixels");
	let left = Infinity,
		top = Infinity,
		right = -Infinity,
		bottom = -Infinity;
	for (const l of leaves)
		if (l.kind !== "group") {
			left = Math.min(left, l.left);
			top = Math.min(top, l.top);
			right = Math.max(right, l.left + l.bitmap.width);
			bottom = Math.max(bottom, l.top + l.bitmap.height);
		}
	return { x: left, y: top, width: right - left, height: bottom - top };
}
export function transformSelectedLayers(
	document: PsdDocument,
	ids: readonly string[],
	params: PsdSelectionTransform,
): string[] {
	const nodes = selectedTransformNodes(document, ids),
		bounds = selectionTransformBounds(document, ids);
	const selected = new Set(nodes.map(node => node.id));
	function checkLocks(layers: readonly PsdLayerNode[], lockedAncestor?: PsdLayerNode) {
		for (const layer of layers) {
			const locked = lockedAncestor ?? (layer.locks.all || layer.locks.composite || layer.locks.position ? layer : undefined);
			if (selected.has(layer.id) && locked) throw Error(`Layer '${locked.name}' is locked`);
			if (layer.kind === "group") checkLocks(layer.children, locked);
		}
	}
	checkLocks(document.layers);
	const radians = ((params.degrees ?? 0) * Math.PI) / 180,
		c = Math.cos(radians),
		s = Math.sin(radians),
		sx = params.scaleX ?? 1,
		sy = params.scaleY ?? 1;
	const matrix = params.corners
		? quadTransform(
				[
					{ x: bounds.x, y: bounds.y },
					{ x: bounds.x + bounds.width, y: bounds.y },
					{ x: bounds.x + bounds.width, y: bounds.y + bounds.height },
					{ x: bounds.x, y: bounds.y + bounds.height },
				],
				params.corners,
			)
		: multiplyAffine(
				[1, 0, 0, 1, params.dx ?? 0, params.dy ?? 0],
				aroundPoint(
					[c * sx, s * sx, -s * sy, c * sy, 0, 0],
					bounds.x + bounds.width / 2,
					bounds.y + bounds.height / 2,
				),
			);
	for (const l of nodes) {
		if (l.kind !== "group" && !l.adjustment && !l.curves) transformLayerPixels(l, matrix);
		if (l.mask && l.mask.linked !== false) l.mask = transformMask(l.mask, matrix);
	}
	return nodes.map((l) => l.id);
}
