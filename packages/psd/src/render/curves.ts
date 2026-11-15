import type { PsdBitmap, PsdLayerMask } from "../codec/document";
export interface PsdCurvePoint {
	x: number;
	y: number;
}
export type PsdCurves = Record<"rgb" | "red" | "green" | "blue", PsdCurvePoint[]>;
export const CURVE_CHANNELS = ["rgb", "red", "green", "blue"] as const;
export function identityCurves(): PsdCurves {
	return Object.fromEntries(
		CURVE_CHANNELS.map((c) => [
			c,
			[
				{ x: 0, y: 0 },
				{ x: 255, y: 255 },
			],
		]),
	) as PsdCurves;
}
export function validateCurves(value: unknown): asserts value is PsdCurves {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("Expected curves object");
	const v = value as Record<string, unknown>;
	if (Object.keys(v).some((k) => !CURVE_CHANNELS.includes(k as (typeof CURVE_CHANNELS)[number])))
		throw new Error("Unknown curves channel");
	for (const c of CURVE_CHANNELS) {
		const points = v[c];
		if (!Array.isArray(points) || points.length < 2 || points.length > 19)
			throw new Error("Each curve needs 2–19 points");
		let previous = -1;
		for (const p of points) {
			if (
				!p ||
				Object.keys(p).some((k) => k !== "x" && k !== "y") ||
				!Number.isInteger(p.x) ||
				!Number.isInteger(p.y) ||
				p.x <= previous ||
				p.x > 255 ||
				p.y < 0 ||
				p.y > 255
			)
				throw new Error(
					"Curve points must have increasing input values and integer coordinates in 0–255",
				);
			previous = p.x;
		}
	}
}
/** Natural cubic spline, clamped to channel range. End values extend constantly. */
export function curveLut(points: PsdCurvePoint[]): Uint8ClampedArray {
	const n = points.length,
		second = new Float64Array(n),
		u = new Float64Array(n);
	for (let i = 1; i < n - 1; i++) {
		const span = points[i + 1].x - points[i - 1].x,
			sig = (points[i].x - points[i - 1].x) / span,
			p = sig * second[i - 1] + 2;
		second[i] = (sig - 1) / p;
		u[i] =
			((6 *
				((points[i + 1].y - points[i].y) / (points[i + 1].x - points[i].x) -
					(points[i].y - points[i - 1].y) / (points[i].x - points[i - 1].x))) /
				span -
				sig * u[i - 1]) /
			p;
	}
	for (let i = n - 2; i >= 0; i--) second[i] = second[i] * second[i + 1] + u[i];
	const lut = new Uint8ClampedArray(256);
	let k = 0;
	for (let x = 0; x < 256; x++) {
		if (x <= points[0].x) {
			lut[x] = points[0].y;
			continue;
		}
		if (x >= points[n - 1].x) {
			lut[x] = points[n - 1].y;
			continue;
		}
		while (k < n - 2 && x > points[k + 1].x) k++;
		const h = points[k + 1].x - points[k].x,
			a = (points[k + 1].x - x) / h,
			b = (x - points[k].x) / h;
		lut[x] =
			a * points[k].y +
			b * points[k + 1].y +
			(((a * a * a - a) * second[k] + (b * b * b - b) * second[k + 1]) * h * h) / 6;
	}
	return lut;
}
export function applyCurves(
	target: PsdBitmap,
	curves: PsdCurves,
	opacity: number,
	mask?: PsdLayerMask,
): void {
	const master = curveLut(curves.rgb),
		channels = [curves.red, curves.green, curves.blue].map(curveLut);
	for (let y = 0; y < target.height; y++)
		for (let x = 0; x < target.width; x++) {
			let amount = Math.round(opacity * 255) / 255;
			if (mask && !mask.disabled) {
				const inside = x >= mask.left && x < mask.right && y >= mask.top && y < mask.bottom;
				amount *=
					(inside
						? mask.data[(y - mask.top) * (mask.right - mask.left) + x - mask.left]
						: mask.defaultColor) / 255;
			}
			const p = (y * target.width + x) * 4;
			for (let c = 0; c < 3; c++) {
				const old = target.data[p + c];
				target.data[p + c] = old + (channels[c][master[old]] - old) * amount;
			}
		}
}
