import type { Point, Bounds } from "./geometry.js";

export const quarterTurn = (turns: number) => ((Math.round(turns) % 4) + 4) % 4;
export function rotateVector(p: Point, turns: number): Point {
	switch (quarterTurn(turns)) {
		case 1:
			return { x: -p.y, y: p.x };
		case 2:
			return { x: -p.x, y: -p.y };
		case 3:
			return { x: p.y, y: -p.x };
		default:
			return { ...p };
	}
}
export function rotatedSize(width: number, height: number, turns: number) {
	return quarterTurn(turns) % 2 ? { width: height, height: width } : { width, height };
}
/** Coordinates in a positively positioned, orthogonally rotated paper box. */
export function rotateLocal(p: Point, width: number, height: number, turns: number): Point {
	switch (quarterTurn(turns)) {
		case 1:
			return { x: height - p.y, y: p.x };
		case 2:
			return { x: width - p.x, y: height - p.y };
		case 3:
			return { x: p.y, y: width - p.x };
		default:
			return { ...p };
	}
}
export function unrotateLocal(p: Point, width: number, height: number, turns: number): Point {
	switch (quarterTurn(turns)) {
		case 1:
			return { x: p.y, y: height - p.x };
		case 2:
			return { x: width - p.x, y: height - p.y };
		case 3:
			return { x: width - p.y, y: p.x };
		default:
			return { ...p };
	}
}
export function paperRotation(width: number, height: number, turns: number): string {
	switch (quarterTurn(turns)) {
		case 1:
			return `matrix(0,1,-1,0,${height},0)`;
		case 2:
			return `matrix(-1,0,0,-1,${width},${height})`;
		case 3:
			return `matrix(0,-1,1,0,0,${width})`;
		default:
			return "none";
	}
}

export function pointBounds(points: Point[]): Bounds {
	const x = Math.min(...points.map((p) => p.x)),
		y = Math.min(...points.map((p) => p.y));
	return {
		x,
		y,
		width: Math.max(...points.map((p) => p.x)) - x,
		height: Math.max(...points.map((p) => p.y)) - y,
	};
}
