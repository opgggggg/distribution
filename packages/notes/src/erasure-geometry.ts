import type { InkErasure } from "./model.js";
type Point = { x: number; y: number };
const n = (value: number) => Number(value.toFixed(5));

/** Exact elliptical capsule. Each capsule is subtracted separately, so overlapping
 * or self-crossing eraser sweeps can never reveal previously removed pigment. */
export function erasureCapsule(a: Point, b: Point, width: number, height = width): string {
	const rx = width / 2,
		ry = height / 2;
	const dx = (b.x - a.x) / rx,
		dy = (b.y - a.y) / ry;
	const length = Math.hypot(dx, dy);
	if (length < 1e-9)
		return `M${n(a.x + rx)},${n(a.y)}a${n(rx)},${n(ry)} 0 1 0 ${n(-width)},0a${n(rx)},${n(ry)} 0 1 0 ${n(width)},0Z`;
	const ox = (dy / length) * rx,
		oy = (-dx / length) * ry;
	return `M${n(a.x + ox)},${n(a.y + oy)}L${n(b.x + ox)},${n(b.y + oy)}A${n(rx)},${n(ry)} 0 0 1 ${n(b.x - ox)},${n(b.y - oy)}L${n(a.x - ox)},${n(a.y - oy)}A${n(rx)},${n(ry)} 0 0 1 ${n(a.x + ox)},${n(a.y + oy)}Z`;
}
export function erasureSegments(erasure: InkErasure): [Point, Point][] {
	if (erasure.points.length === 1) return [[erasure.points[0], erasure.points[0]]];
	return erasure.points.slice(1).map((b, i) => [erasure.points[i], b]);
}
function capsuleContains(e: InkErasure, a: Point, b: Point, point: Point, inset: number): boolean {
	const rx = e.width / 2,
		ry = (e.height ?? e.width) / 2;
	const dx = (b.x - a.x) / rx,
		dy = (b.y - a.y) / ry;
	const px = (point.x - a.x) / rx,
		py = (point.y - a.y) / ry;
	const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
	return Math.hypot(px - t * dx, py - t * dy) <= 1 - inset / Math.min(rx, ry) + 1e-7;
}
/** A disk/segment fully inside an earlier capsule adds no erased area. */
export function erasureCovers(e: InkErasure, a: Point, b = a, inset = 0): boolean {
	return erasureSegments(e).some(
		([p, q]) => capsuleContains(e, p, q, a, inset) && capsuleContains(e, p, q, b, inset),
	);
}
export function erasureCoversBox(
	e: InkErasure,
	box: { x: number; y: number; width: number; height: number },
): boolean {
	const corners = [
		{ x: box.x, y: box.y },
		{ x: box.x + box.width, y: box.y },
		{ x: box.x, y: box.y + box.height },
		{ x: box.x + box.width, y: box.y + box.height },
	];
	return erasureSegments(e).some(([a, b]) =>
		corners.every((p) => capsuleContains(e, a, b, p, 0)),
	);
}
