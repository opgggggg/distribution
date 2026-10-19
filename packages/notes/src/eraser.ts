import { bounds, distanceToSegment, type Point, type Bounds } from "./geometry.js";
import { erasureCovers, erasureCoversBox } from "./erasure-geometry.js";
import { inkWidth, type InkElement, type InkErasure, type InkStroke } from "./model.js";
export type EraserMode = "stroke" | "path";

function segmentsDistance(a: Point, b: Point, c: Point, d: Point): number {
	const cross = (p: Point, q: Point, r: Point) =>
		(q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
	if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
	return Math.min(
		distanceToSegment(a, c, d),
		distanceToSegment(b, c, d),
		distanceToSegment(c, a, b),
		distanceToSegment(d, a, b),
	);
}
function touches(stroke: InkStroke, a: Point, b: Point, width: number, box: Bounds): boolean {
	const radius = width / 2;
	if (
		Math.max(a.x, b.x) + radius < box.x ||
		Math.min(a.x, b.x) - radius > box.x + box.width ||
		Math.max(a.y, b.y) + radius < box.y ||
		Math.min(a.y, b.y) - radius > box.y + box.height
	)
		return false;
	if (stroke.erasures?.some((e) => erasureCovers(e, a, b, radius))) return false;
	return stroke.points.some((p, i) => {
		const previous = stroke.points[Math.max(0, i - 1)];
		return (
			segmentsDistance(a, b, previous, p) <=
			radius + Math.max(inkWidth(stroke, p), inkWidth(stroke, previous)) / 2
		);
	});
}
function append(path: InkErasure, point: Point) {
	const end = path.points.at(-1)!;
	if (Math.hypot(end.x - point.x, end.y - point.y) < 1e-6) return;
	// Keep straight sweeps compact without smoothing corners or changing the brush.
	const before = path.points.at(-2);
	if (before && distanceToSegment(end, before, point) < 0.01)
		path.points[path.points.length - 1] = { ...point };
	else path.points.push({ ...point });
}
/** Trim only portions of the sweep that cannot reach this stroke. This also
 * makes repeating the same cut a no-op even with different sample spacing. */
function clipSweep(a: Point, b: Point, box: Bounds, radius: number): [Point, Point] | undefined {
	let start = 0,
		end = 1;
	for (const [origin, delta, low, high] of [
		[a.x, b.x - a.x, box.x - radius, box.x + box.width + radius],
		[a.y, b.y - a.y, box.y - radius, box.y + box.height + radius],
	]) {
		if (Math.abs(delta) < 1e-10) {
			if (origin < low || origin > high) return;
			continue;
		}
		const first = (low - origin) / delta,
			last = (high - origin) / delta;
		start = Math.max(start, Math.min(first, last));
		end = Math.min(end, Math.max(first, last));
		if (start > end) return;
	}
	return [
		{ x: a.x + (b.x - a.x) * start, y: a.y + (b.y - a.y) * start },
		{ x: a.x + (b.x - a.x) * end, y: a.y + (b.y - a.y) * end },
	];
}
/** Mutable preview masks belong only to one gesture. Source ink and pigment seeds
 * remain unchanged; callers commit detached replacements in one history step. */
export class PathEraser {
	readonly updates = new Map<string, InkStroke>();
	readonly removed = new Set<string>();
	private readonly paths = new Map<string, InkErasure>();
	private readonly boxes = new Map<string, Bounds>();
	constructor(
		private readonly elements: readonly InkElement[],
		readonly width: number,
	) {
		for (const stroke of elements)
			if (stroke.kind === "stroke") this.boxes.set(stroke.id, bounds(stroke));
	}
	add(from: Point, to = from) {
		for (const source of this.elements) {
			if (source.kind !== "stroke" || this.removed.has(source.id)) continue;
			const sweep = clipSweep(from, to, this.boxes.get(source.id)!, this.width / 2);
			if (!sweep) continue;
			const [a, b] = sweep;
			if (!touches(source, a, b, this.width, this.boxes.get(source.id)!)) continue;
			let stroke = this.updates.get(source.id);
			if (!stroke) {
				stroke = { ...source, erasures: [...(source.erasures ?? [])] };
				this.updates.set(source.id, stroke);
			}
			let path = this.paths.get(source.id);
			const end = path?.points.at(-1);
			if (!path || !end || Math.hypot(end.x - a.x, end.y - a.y) > 1e-6) {
				path = { width: this.width, points: [{ ...a }] };
				stroke.erasures!.push(path);
				this.paths.set(source.id, path);
			}
			append(path, b);
			const box = this.boxes.get(source.id)!,
				margin = source.width * 3;
			if (
				erasureCoversBox(path, {
					x: box.x - margin,
					y: box.y - margin,
					width: box.width + 2 * margin,
					height: box.height + 2 * margin,
				})
			) {
				this.removed.add(source.id);
				this.updates.delete(source.id);
			}
		}
	}
}
