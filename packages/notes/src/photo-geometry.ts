import type { InkImage } from "./model.js";
import type { Point, Bounds } from "./geometry.js";
export const photoAngle = (angle: number) => ((((angle + 180) % 360) + 360) % 360) - 180;
export function turnPoint(p: Point, angle: number): Point {
	const a = (angle * Math.PI) / 180,
		c = Math.cos(a),
		s = Math.sin(a);
	return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}
export function photoCenter(p: InkImage): Point {
	return { x: p.x + p.width / 2, y: p.y + p.height / 2 };
}
export function photoLocal(p: InkImage, point: Point): Point {
	const c = photoCenter(p),
		v = turnPoint({ x: point.x - c.x, y: point.y - c.y }, -(p.angle ?? 0));
	return { x: v.x + p.width / 2, y: v.y + p.height / 2 };
}
export function photoBounds(p: InkImage): Bounds {
	if (!p.angle) return { x: p.x, y: p.y, width: p.width, height: p.height };
	const a = (p.angle * Math.PI) / 180,
		w = Math.abs(Math.cos(a)) * p.width + Math.abs(Math.sin(a)) * p.height,
		h = Math.abs(Math.sin(a)) * p.width + Math.abs(Math.cos(a)) * p.height,
		c = photoCenter(p);
	return { x: c.x - w / 2, y: c.y - h / 2, width: w, height: h };
}
/** Transform around the gesture pivot, keeping that point under the fingers. */
export function transformPhoto(
	p: InkImage,
	pivot: Point,
	scale: number,
	rotation: number,
	translation: Point = { x: 0, y: 0 },
): InkImage {
	scale = Math.max(
		Math.max(12 / p.width, 12 / p.height),
		Math.min(Math.min(1_000_000 / p.width, 1_000_000 / p.height), scale),
	);
	const c = photoCenter(p),
		v = turnPoint({ x: (c.x - pivot.x) * scale, y: (c.y - pivot.y) * scale }, rotation),
		width = p.width * scale,
		height = p.height * scale;
	return {
		...p,
		x: Math.max(-1e9, Math.min(1e9, pivot.x + translation.x + v.x - width / 2)),
		y: Math.max(-1e9, Math.min(1e9, pivot.y + translation.y + v.y - height / 2)),
		width,
		height,
		angle: photoAngle((p.angle ?? 0) + rotation),
	};
}
