import { mapPoint, inverse3, type Matrix3 } from "./projective";
import {
	createPsdBitmap,
	type PsdBitmap,
	type PsdRasterLayer,
	type PsdTextLayer,
} from "../codec/document";
export type PsdAffine = readonly [number, number, number, number, number, number] | Matrix3;
export interface PsdSourceTransform {
	source: PsdBitmap;
	matrix: PsdAffine;
	rendered: PsdBitmap;
	left: number;
	top: number;
}
export function toMatrix3(m: PsdAffine): Matrix3 {
	return m.length === 9 ? m : [m[0], m[2], m[4], m[1], m[3], m[5], 0, 0, 1];
}
export function multiplyAffine(a: PsdAffine, b: PsdAffine): PsdAffine {
	if (a.length === 9 || b.length === 9) {
		const x = toMatrix3(a),
			y = toMatrix3(b),
			out: number[] = [];
		for (let r = 0; r < 3; r++)
			for (let c = 0; c < 3; c++)
				out.push(x[r * 3] * y[c] + x[r * 3 + 1] * y[c + 3] + x[r * 3 + 2] * y[c + 6]);
		return out as unknown as Matrix3;
	}
	return [
		a[0] * b[0] + a[2] * b[1],
		a[1] * b[0] + a[3] * b[1],
		a[0] * b[2] + a[2] * b[3],
		a[1] * b[2] + a[3] * b[3],
		a[0] * b[4] + a[2] * b[5] + a[4],
		a[1] * b[4] + a[3] * b[5] + a[5],
	];
}
export function aroundPoint(matrix: PsdAffine, x: number, y: number): PsdAffine {
	return multiplyAffine([1, 0, 0, 1, x, y], multiplyAffine(matrix, [1, 0, 0, 1, -x, -y]));
}
export function currentSourceTransform(layer: PsdRasterLayer | PsdTextLayer): PsdSourceTransform {
	const old = layer.sourceTransform;
	if (old && old.rendered === layer.bitmap)
		return {
			...old,
			matrix: multiplyAffine(
				[1, 0, 0, 1, layer.left - old.left, layer.top - old.top],
				old.matrix,
			),
			left: layer.left,
			top: layer.top,
		};
	return {
		source: layer.bitmap,
		matrix: [1, 0, 0, 1, layer.left, layer.top],
		rendered: layer.bitmap,
		left: layer.left,
		top: layer.top,
	};
}
export function renderAffine(
	source: PsdBitmap,
	m: PsdAffine,
): { bitmap: PsdBitmap; left: number; top: number } {
	if (!m.every(Number.isFinite)) throw new Error("Transform contains a non-finite value");
	const matrix = toMatrix3(m),
		inverse = inverse3(matrix);
	const vertices = [
		[0, 0],
		[source.width, 0],
		[0, source.height],
		[source.width, source.height],
	];
	const weights = vertices.map(([x, y]) => matrix[6] * x + matrix[7] * y + matrix[8]);
	if (
		weights.some(
			(v) =>
				!Number.isFinite(v) ||
				Math.abs(v) < 1e-10 ||
				Math.sign(v) !== Math.sign(weights[0]),
		)
	)
		throw new Error("Transform crosses infinity");
	const corners = vertices.map(([x, y]) => {
		const p = mapPoint(matrix, x, y);
		return [p.x, p.y];
	});
	const left = Math.floor(Math.min(...corners.map((p) => p[0])) + 1e-8),
		top = Math.floor(Math.min(...corners.map((p) => p[1])) + 1e-8);
	const width = Math.ceil(Math.max(...corners.map((p) => p[0])) - 1e-8) - left,
		height = Math.ceil(Math.max(...corners.map((p) => p[1])) - 1e-8) - top;
	if (width < 0 || height < 0 || width > 30000 || height > 30000 || width * height > 80_000_000)
		throw new Error("Transformed layer exceeds the 80 megapixel budget");
	const bitmap = createPsdBitmap(width, height);
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const mapped = mapPoint(inverse, x + left + 0.5, y + top + 0.5),
				sx = mapped.x - 0.5,
				sy = mapped.y - 0.5;
			if (sx < -0.5 || sy < -0.5 || sx >= source.width - 0.5 || sy >= source.height - 0.5)
				continue;
			const x0 = Math.floor(sx),
				y0 = Math.floor(sy),
				fx = sx - x0,
				fy = sy - y0;
			let alpha = 0;
			const rgb = [0, 0, 0];
			for (let dy = 0; dy < 2; dy++)
				for (let dx = 0; dx < 2; dx++) {
					const xx = Math.max(0, Math.min(source.width - 1, x0 + dx)),
						yy = Math.max(0, Math.min(source.height - 1, y0 + dy));
					const q = (yy * source.width + xx) * 4,
						w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy),
						a = source.data[q + 3] * w;
					alpha += a;
					for (let c = 0; c < 3; c++) rgb[c] += source.data[q + c] * a;
				}
			const q = (y * width + x) * 4;
			for (let c = 0; c < 3; c++) bitmap.data[q + c] = alpha ? rgb[c] / alpha : 0;
			bitmap.data[q + 3] = alpha;
		}
	return { bitmap, left, top };
}
export function transformLayerPixels(
	layer: PsdRasterLayer | PsdTextLayer,
	matrix: PsdAffine,
): void {
	const state = currentSourceTransform(layer),
		next = multiplyAffine(matrix, state.matrix);
	const rendered = renderAffine(state.source, next);
	layer.bitmap = rendered.bitmap;
	layer.left = rendered.left;
	layer.top = rendered.top;
	layer.sourceTransform = {
		source: state.source,
		matrix: next,
		rendered: layer.bitmap,
		left: layer.left,
		top: layer.top,
	};
}
