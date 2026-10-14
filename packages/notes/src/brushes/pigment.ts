import type { InkElement, InkStroke } from "../model.js";
export function pigmentSeed(stroke: InkStroke): number {
	if (stroke.brushSeed !== undefined) return stroke.brushSeed;
	let seed = 2166136261;
	for (const c of stroke.id) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
	return seed >>> 0;
}
/** Bind legacy pigment before giving a copied element a new identity. */
export function preservePigmentIdentity(element: InkElement): void {
	if (element.kind === "stroke" && element.penStyle) element.brushSeed ??= pigmentSeed(element);
}
