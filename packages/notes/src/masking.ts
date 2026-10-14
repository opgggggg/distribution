import type { MaskingTape } from "./model.js";
export type MaskPoint = { x: number; y: number };
export function tapePolygon(tape: MaskingTape): MaskPoint[] {
	const angle = (tape.angle * Math.PI) / 180,
		c = Math.cos(angle),
		s = Math.sin(angle);
	return [
		[-1, -1],
		[1, -1],
		[1, 1],
		[-1, 1],
	].map(([x, y]) => ({
		x: tape.x + ((x * tape.width) / 2) * c - ((y * tape.height) / 2) * s,
		y: tape.y + ((x * tape.width) / 2) * s + ((y * tape.height) / 2) * c,
	}));
}
export function polygonPath(points: readonly MaskPoint[]): string {
	return `M${points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join("L")}Z`;
}
