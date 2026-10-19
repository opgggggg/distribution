import { isInfinitePage } from "./board.js";
import { bounds, shapePoints, type Bounds, type Point } from "./geometry.js";
import {
	pageElements,
	type AnchorSide,
	type InkElement,
	type InkStroke,
	type NotePage,
} from "./model.js";

export const connectable = (e: InkElement): e is InkStroke =>
	e.kind === "stroke" && (e.shape === "rectangle" || e.shape === "ellipse");
export function selectionBounds(elements: InkElement[]): Bounds | undefined {
	if (!elements.length) return;
	const boxes = elements.map(bounds),
		x = Math.min(...boxes.map((b) => b.x)),
		y = Math.min(...boxes.map((b) => b.y));
	return {
		x,
		y,
		width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
		height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
	};
}
export function anchorPoint(e: InkStroke, side: AnchorSide): Point {
	const b = bounds(e);
	return {
		x: side === "left" ? b.x : side === "right" ? b.x + b.width : b.x + b.width / 2,
		y: side === "top" ? b.y : side === "bottom" ? b.y + b.height : b.y + b.height / 2,
	};
}
export function nearestSide(e: InkStroke, p: Point): AnchorSide {
	return (["top", "right", "bottom", "left"] as AnchorSide[]).sort((a, b) => {
		const x = anchorPoint(e, a),
			y = anchorPoint(e, b);
		return Math.hypot(x.x - p.x, x.y - p.y) - Math.hypot(y.x - p.x, y.y - p.y);
	})[0];
}
export function connectorPoints(a: Point, b: Point) {
	const angle = Math.atan2(b.y - a.y, b.x - a.x),
		size = Math.min(9, Math.hypot(b.x - a.x, b.y - a.y) / 3);
	return [
		a,
		b,
		{ x: b.x - size * Math.cos(angle - 0.48), y: b.y - size * Math.sin(angle - 0.48) },
		b,
		{ x: b.x - size * Math.cos(angle + 0.48), y: b.y - size * Math.sin(angle + 0.48) },
	].map((p) => ({ ...p, pressure: 0.5 }));
}
/** Connections follow both endpoints, including hidden layers; deleting an endpoint removes its connections. */
export function refreshConnections(page: NotePage) {
	const all = page.layers.flatMap((l) => l.elements),
		byId = new Map(all.map((e) => [e.id, e]));
	for (const layer of page.layers)
		layer.elements = layer.elements.filter((e) => {
			if (e.kind !== "stroke" || !e.connector) return true;
			const a = byId.get(e.connector.from.elementId),
				b = byId.get(e.connector.to.elementId);
			if (!a || !b || !connectable(a) || !connectable(b)) return false;
			e.points = connectorPoints(
				anchorPoint(a, e.connector.from.side),
				anchorPoint(b, e.connector.to.side),
			);
			return true;
		});
}
export function resizeElements(elements: InkElement[], from: Bounds, to: Bounds) {
	const sx = to.width / Math.max(1, from.width),
		sy = to.height / Math.max(1, from.height);
	for (const e of elements) {
		if (e.kind === "stroke") {
			if (e.connector) continue;
			[
				...e.points,
				...(e.cutouts ?? []).flat(),
				...(e.erasures ?? []).flatMap((v) => v.points),
			].forEach((p) => {
				p.x = to.x + (p.x - from.x) * sx;
				p.y = to.y + (p.y - from.y) * sy;
			});
			for (const erasure of e.erasures ?? []) {
				erasure.height = Math.max(
					0.01,
					Math.min(1_000_000, (erasure.height ?? erasure.width) * sy),
				);
				erasure.width = Math.max(0.01, Math.min(1_000_000, erasure.width * sx));
			}
		} else {
			e.x = to.x + (e.x - from.x) * sx;
			e.y = to.y + (e.y - from.y) * sy;
			if (e.kind === "image") {
				e.width = Math.max(0.01, Math.min(1_000_000, e.width * sx));
				e.height = Math.max(0.01, Math.min(1_000_000, e.height * sy));
			} else e.size = Math.max(1, Math.min(200, e.size * Math.min(sx, sy)));
		}
	}
}
export interface Guide {
	axis: "x" | "y";
	position: number;
	start: number;
	end: number;
	label?: string;
}
/** Screen-space threshold remains stable at every zoom. Object alignment wins over the optional 20pt grid. */
export function snapMove(
	page: NotePage,
	ids: string[],
	dx: number,
	dy: number,
	threshold: number,
	grid: boolean,
	align: boolean,
) {
	const selected = pageElements(page).filter(
		(e) => ids.includes(e.id) && !(e.kind === "stroke" && e.connector),
	);
	const box = selectionBounds(selected);
	const guides: Guide[] = [];
	if (!box) return { dx, dy, guides };
	const others = pageElements(page)
		.filter((e) => !ids.includes(e.id) && !(e.kind === "stroke" && e.connector))
		.map(bounds);
	for (const axis of ["x", "y"] as const) {
		const length = axis === "x" ? "width" : "height",
			cross = axis === "x" ? "y" : "x",
			crossLength = axis === "x" ? "height" : "width";
		const delta = axis === "x" ? dx : dy,
			origin = box[axis] + delta,
			size = box[length];
		let correction = Infinity,
			guide: Guide | undefined;
		if (align) {
			for (const other of others)
				for (const offset of [0, size / 2, size])
					for (const dest of [
						other[axis],
						other[axis] + other[length] / 2,
						other[axis] + other[length],
					]) {
						const value = dest - origin - offset;
						if (
							Math.abs(value) <= threshold &&
							Math.abs(value) < Math.abs(correction)
						) {
							correction = value;
							guide = {
								axis,
								position: dest,
								start: Math.min(box[cross], other[cross]) - 12,
								end:
									Math.max(
										box[cross] + box[crossLength],
										other[cross] + other[crossLength],
									) + 12,
							};
						}
					}
			// Inspect the nearest neighbors in one pass, avoiding quadratic work on ink-heavy pages.
			let low = -Infinity,
				high = Infinity;
			for (const other of others) {
				if (
					box[cross] + box[crossLength] < other[cross] ||
					box[cross] > other[cross] + other[crossLength]
				)
					continue;
				const end = other[axis] + other[length];
				if (end <= origin + threshold) low = Math.max(low, end);
				if (other[axis] >= origin + size - threshold) high = Math.min(high, other[axis]);
			}
			if (Number.isFinite(low) && Number.isFinite(high) && high - low >= size) {
				const dest = (low + high - size) / 2,
					value = dest - origin;
				if (Math.abs(value) <= threshold && Math.abs(value) < Math.abs(correction)) {
					correction = value;
					guide = {
						axis: cross,
						position: box[cross] + box[crossLength] / 2,
						start: low,
						end: high,
						label: `${Math.round((high - low - size) / 2)} pt`,
					};
				}
			}
		}
		if (!Number.isFinite(correction) && grid) {
			correction = Math.round(origin / 20) * 20 - origin;
			guide = {
				axis,
				position: origin + correction,
				start: 0,
				end: axis === "x" ? page.height : page.width,
			};
		}
		if (Number.isFinite(correction)) {
			if (axis === "x") dx += correction;
			else dy += correction;
			if (guide) guides.push(guide);
		}
	}
	if (!isInfinitePage(page)) {
		dx = Math.max(-box.x, Math.min(page.width - box.x - box.width, dx));
		dy = Math.max(-box.y, Math.min(page.height - box.y - box.height, dy));
	}
	return { dx, dy, guides };
}
export function createConnectedShape(source: InkStroke, center: Point, page: NotePage): InkStroke {
	const b = bounds(source),
		w = isInfinitePage(page)
			? Math.max(24, b.width - source.width)
			: Math.min(page.width - 4, Math.max(24, b.width - source.width)),
		h = isInfinitePage(page)
			? Math.max(24, b.height - source.width)
			: Math.min(page.height - 4, Math.max(24, b.height - source.width));
	const x = isInfinitePage(page)
			? center.x - w / 2
			: Math.max(2, Math.min(page.width - w - 2, center.x - w / 2)),
		y = isInfinitePage(page)
			? center.y - h / 2
			: Math.max(2, Math.min(page.height - h - 2, center.y - h / 2));
	return {
		...structuredClone(source),
		id: crypto.randomUUID(),
		points: shapePoints(
			source.shape as "rectangle" | "ellipse",
			{ x, y },
			{ x: x + w, y: y + h },
		),
	};
}
