import { bounds, type Bounds } from "./geometry.js";
import { pageElements, type NotePage } from "./model.js";

/** Missing mode on older native notes opens as an expandable board. Xournal pages are explicit. */
export const isInfinitePage = (page: NotePage) => page.infinite !== false;
export const WORLD_LIMIT = 1_000_000_000;
export const worldCoordinate = (value: number) =>
	Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, value));

/** Export/overview includes every visible mark, independently of the current camera. */
export function pageContentBounds(page: NotePage): Bounds {
	if (!isInfinitePage(page)) return { x: 0, y: 0, width: page.width, height: page.height };
	let left = Infinity,
		top = Infinity,
		right = -Infinity,
		bottom = -Infinity;
	for (const element of [...(page.background ? [page.background] : []), ...pageElements(page)]) {
		const b = bounds(element),
			margin = element.kind === "stroke" ? element.width * 2 : 8;
		left = Math.min(left, b.x - margin);
		top = Math.min(top, b.y - margin);
		right = Math.max(right, b.x + b.width + margin);
		bottom = Math.max(bottom, b.y + b.height + margin);
	}
	if (!Number.isFinite(left)) return { x: 0, y: 0, width: page.width, height: page.height };
	const padding = 24;
	return {
		x: left - padding,
		y: top - padding,
		width: Math.max(72, right - left + padding * 2),
		height: Math.max(72, bottom - top + padding * 2),
	};
}
export function intersects(a: Bounds, b: Bounds) {
	return (
		a.x + a.width >= b.x &&
		a.y + a.height >= b.y &&
		a.x <= b.x + b.width &&
		a.y <= b.y + b.height
	);
}
