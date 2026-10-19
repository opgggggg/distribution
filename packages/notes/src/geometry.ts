import { photoBounds } from "./photo-geometry.js";
import { erasureCovers } from "./erasure-geometry.js";
import { inkWidth, type InkElement, type InkPoint, type InkStroke } from "./model.js";
export interface Point {
	x: number;
	y: number;
}
export interface Bounds {
	x: number;
	y: number;
	width: number;
	height: number;
}
export function bounds(element: InkElement): Bounds {
	if (element.kind === "image") return photoBounds(element);
	if (element.kind === "text") {
		const lines = element.text.split("\n");
		return {
			x: element.x,
			y: element.y,
			width: Math.max(1, ...lines.map((line) => Array.from(line).length)) * element.size,
			height: lines.length * element.size * 1.35,
		};
	}
	let radius = 0;
	for (const p of element.points) radius = Math.max(radius, inkWidth(element, p) / 2);
	let x = Infinity,
		y = Infinity,
		right = -Infinity,
		bottom = -Infinity;
	for (const p of element.points) {
		x = Math.min(x, p.x);
		y = Math.min(y, p.y);
		right = Math.max(right, p.x);
		bottom = Math.max(bottom, p.y);
	}
	return {
		x: x - radius,
		y: y - radius,
		width: right - x + radius * 2,
		height: bottom - y + radius * 2,
	};
}
export function distanceToSegment(p: Point, a: Point, b: Point): number {
	const dx = b.x - a.x,
		dy = b.y - a.y;
	const t = Math.max(
		0,
		Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
	);
	return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function hitStroke(stroke: InkStroke, point: Point, radius: number): boolean {
	if (stroke.erasures?.some((e) => erasureCovers(e, point, point, radius))) return false;
	if (stroke.points.length === 1)
		return (
			Math.hypot(point.x - stroke.points[0].x, point.y - stroke.points[0].y) <=
			radius + inkWidth(stroke, stroke.points[0]) / 2
		);
	return stroke.points.some(
		(p, i) =>
			i > 0 &&
			distanceToSegment(point, stroke.points[i - 1], p) <=
				radius + Math.max(inkWidth(stroke, p), inkWidth(stroke, stroke.points[i - 1])) / 2,
	);
}
export function contains(p: Point, box: Bounds) {
	return p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
}
function inside(p: Point, polygon: Point[]) {
	let hit = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const a = polygon[i],
			b = polygon[j];
		if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
			hit = !hit;
	}
	return hit;
}
export function lassoSelect(elements: InkElement[], polygon: Point[]): string[] {
	if (polygon.length < 3) return [];
	const crosses = (a: Point, b: Point, c: Point, d: Point) => {
		const orientation = (p: Point, q: Point, r: Point) =>
			(q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
		const abC = orientation(a, b, c),
			abD = orientation(a, b, d),
			cdA = orientation(c, d, a),
			cdB = orientation(c, d, b);
		return abC * abD < 0 && cdA * cdB < 0;
	};
	return elements
		.filter((e) =>
			e.kind === "stroke"
				? e.points.some(
						(p, i) =>
							inside(p, polygon) ||
							(i > 0 &&
								polygon.some((v, j) =>
									crosses(
										e.points[i - 1],
										p,
										v,
										polygon[(j + 1) % polygon.length],
									),
								)),
					)
				: inside(
						e.kind === "image"
							? { x: e.x + e.width / 2, y: e.y + e.height / 2 }
							: { x: e.x, y: e.y + e.size / 2 },
						polygon,
					),
		)
		.map((e) => e.id);
}
export function translate(element: InkElement, dx: number, dy: number): void {
	if (element.kind !== "stroke") {
		element.x += dx;
		element.y += dy;
	} else
		for (const p of [
			...element.points,
			...(element.cutouts ?? []).flat(),
			...(element.erasures ?? []).flatMap((e) => e.points),
		]) {
			p.x += dx;
			p.y += dy;
		}
}
export function shapePoints(
	tool: "line" | "rectangle" | "ellipse",
	a: Point,
	b: Point,
): InkPoint[] {
	const point = (x: number, y: number): InkPoint => ({ x, y, pressure: 0.5 });
	if (tool === "line") return [point(a.x, a.y), point(b.x, b.y)];
	if (tool === "rectangle")
		return [
			point(a.x, a.y),
			point(b.x, a.y),
			point(b.x, b.y),
			point(a.x, b.y),
			point(a.x, a.y),
		];
	return Array.from({ length: 65 }, (_, i) => {
		const angle = (i * Math.PI) / 32;
		return point(
			(a.x + b.x) / 2 + (Math.abs(b.x - a.x) / 2) * Math.cos(angle),
			(a.y + b.y) / 2 + (Math.abs(b.y - a.y) / 2) * Math.sin(angle),
		);
	});
}
