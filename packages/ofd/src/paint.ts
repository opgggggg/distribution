import {
	attr,
	children,
	first,
	number,
	escapeXml as e,
	dataUri,
	type XmlElement,
} from "./archive.js";
import { numbers, matrix, multiply, inverse, type Matrix } from "./geometry.js";
import { rgbaPng } from "./raster.js";
import { abort } from "./types.js";
import type { Resources, RenderContext } from "./ofd.js";
type RGBA = [number, number, number, number];
export function solidColor(node: XmlElement | undefined, fallback: RGBA, res: Resources): RGBA {
	if (!node) return fallback;
	const space = res.colors.get(attr(node, "ColorSpace", res.defaultColorSpace)),
		type = space ? attr(space, "Type", "RGB") : "RGB";
	const bits = space ? number(attr(space, "BitsPerComponent"), 8) : 8,
		max = 2 ** bits - 1;
	const palette = space && first(space, "Palette"),
		entry = palette && children(palette, "CV")[number(attr(node, "Index"), -1)];
	const raw =
		attr(node, "Value") ||
		entry?.textContent ||
		(type === "CMYK" ? "0 0 0 0" : type === "Gray" ? "0" : "0 0 0");
	const values = raw
		.trim()
		.split(/\s+/)
		.map((v) => (/^#[\da-f]+$/i.test(v) ? parseInt(v.slice(1), 16) : Number(v)));
	if (
		![1, 2, 4, 8, 16].includes(bits) ||
		values.some((v) => !Number.isInteger(v) || v < 0 || v > max)
	)
		return fallback;
	const v = values.map((c) => c / max),
		alpha = Math.min(255, Math.max(0, number(attr(node, "Alpha"), 255)));
	if (res.options.colorConverter) {
		const converted = res.options.colorConverter(v, {
			type,
			bitsPerComponent: bits,
			profile: res.profiles.get(attr(node, "ColorSpace", res.defaultColorSpace)),
		});
		if (
			converted.length !== 3 ||
			converted.some((v) => !Number.isFinite(v) || v < 0 || v > 255)
		)
			throw new Error("Invalid colorConverter RGB result.");
		return [...converted, alpha] as RGBA;
	}
	if (v.length === 4)
		return [
			255 * (1 - v[0]) * (1 - v[3]),
			255 * (1 - v[1]) * (1 - v[3]),
			255 * (1 - v[2]) * (1 - v[3]),
			alpha,
		];
	if (v.length === 1) return [v[0] * 255, v[0] * 255, v[0] * 255, alpha];
	return v.length === 3 ? [v[0] * 255, v[1] * 255, v[2] * 255, alpha] : fallback;
}
const rgb = (color: RGBA) => `rgb(${color.slice(0, 3).map(Math.round).join(",")})`;
function gradientStops(shade: XmlElement, res: Resources) {
	const segments = children(shade, "Segment");
	if (segments.length < 2) throw new Error("An OFD gradient requires at least two segments.");
	const positions = segments.map((s) =>
		s.hasAttribute("Position") ? number(attr(s, "Position")) : NaN,
	);
	if (!Number.isFinite(positions[0])) positions[0] = 0;
	if (!Number.isFinite(positions.at(-1))) positions[positions.length - 1] = 1;
	for (let i = 0; i < positions.length - 1;) {
		let j = i + 1;
		while (!Number.isFinite(positions[j])) j++;
		for (let k = i + 1; k < j; k++)
			positions[k] = positions[i] + ((positions[j] - positions[i]) * (k - i)) / (j - i);
		i = j;
	}
	if (positions.some((p, i) => p < 0 || p > 1 || (i > 0 && p < positions[i - 1])))
		throw new Error("Invalid gradient segment positions.");
	return segments.map((s, i) => ({
		at: positions[i],
		color: solidColor(first(s, "Color"), [0, 0, 0, 255], res),
	}));
}
function sample(stops: ReturnType<typeof gradientStops>, t: number): RGBA {
	if (t <= stops[0].at) return stops[0].color;
	for (let i = 1; i < stops.length; i++)
		if (t <= stops[i].at) {
			const a = stops[i - 1],
				b = stops[i],
				f = b.at === a.at ? 1 : (t - a.at) / (b.at - a.at);
			return a.color.map((v, k) => v + (b.color[k] - v) * f) as RGBA;
		}
	return stops[stops.length - 1].color;
}
function position(shade: XmlElement, t: number, length: number): number | undefined {
	const extend = number(attr(shade, "Extend"));
	if ((t < 0 && !(extend & 1)) || (t > 1 && !(extend & 2))) return undefined;
	const type = attr(shade, "MapType", "Direct");
	if (type === "Direct") return Math.max(0, Math.min(1, t));
	const unit = number(attr(shade, "MapUnit"), length);
	if (!(unit > 0)) throw new Error("Gradient MapUnit must be positive.");
	const u = (t * length) / unit;
	return type === "Reflect" ? 1 - Math.abs((((u % 2) + 2) % 2) - 1) : ((u % 1) + 1) % 1;
}
export function paint(
	node: XmlElement | undefined,
	fallback: string,
	res: Resources,
	ctx: RenderContext,
	bounds: number[],
	toPage: Matrix,
	render: (node: XmlElement, world: Matrix) => string,
): string {
	if (!node) return fallback;
	const shade = children(node).find((c) =>
		["Pattern", "AxialShd", "RadialShd", "GouraudShd", "LaGouraudShd"].includes(
			c.localName ?? "",
		),
	);
	if (!shade) return rgb(solidColor(node, [0, 0, 0, 255], res));
	const id = `ofd-paint-${ctx.clipId++}`;
	if (shade.localName === "Pattern") {
		const width = number(attr(shade, "Width")),
			height = number(attr(shade, "Height")),
			xs = Math.max(width, number(attr(shade, "XStep"), width)),
			ys = Math.max(height, number(attr(shade, "YStep"), height));
		if (!(width > 0 && height > 0)) throw new Error("Invalid OFD pattern cell dimensions.");
		const reflected = attr(shade, "ReflectMethod", "Normal"),
			columns = reflected === "Column" || reflected === "RowAndColumn" ? 2 : 1,
			rows = reflected === "Row" || reflected === "RowAndColumn" ? 2 : 1;
		const cell = children(shade, "CellContent")[0];
		if (!cell) throw new Error("Pattern is missing CellContent.");
		const patternMatrix = matrix(attr(shade, "CTM")),
			pageRelative = attr(shade, "RelativeTo", "Object") === "Page";
		const content = render(
			cell,
			pageRelative ? patternMatrix : multiply(toPage, patternMatrix),
		);
		res.defs.push(
			`<clipPath id="${id}-cell"><rect width="${width}" height="${height}"/></clipPath>`,
		);
		let cells = "";
		for (let y = 0; y < rows; y++)
			for (let x = 0; x < columns; x++)
				cells += `<g transform="translate(${x * xs + (x ? width : 0)} ${y * ys + (y ? height : 0)}) scale(${x ? -1 : 1} ${y ? -1 : 1})"><g clip-path="url(#${id}-cell)">${content}</g></g>`;
		let transform = matrix(attr(shade, "CTM"));
		if (attr(shade, "RelativeTo", "Object") === "Page")
			transform = multiply(inverse(toPage), transform);
		res.defs.push(
			`<pattern id="${id}" patternUnits="userSpaceOnUse" width="${xs * columns}" height="${ys * rows}" patternTransform="matrix(${transform.join(" ")})">${cells}</pattern>`,
		);
		return `url(#${id})`;
	}
	const [x, y, w, h] = bounds,
		scale = res.options.paintScale ?? (96 / 25.4) * 2,
		width = Math.ceil(w * scale),
		height = Math.ceil(h * scale);
	if (!(width > 0 && height > 0) || width * height > 40000000)
		throw new RangeError("OFD gradient exceeds its raster budget.");
	const pixels = new Uint8Array(width * height * 4);
	if (shade.localName === "GouraudShd" || shade.localName === "LaGouraudShd") {
		const points = children(shade, "Point").map((p) => ({
			x: number(attr(p, "X")),
			y: number(attr(p, "Y")),
			edge: number(attr(p, "EdgeFlag")),
			color: solidColor(first(p, "Color"), [0, 0, 0, 255], res),
		}));
		const triangles: (typeof points)[] = [];
		if (shade.localName === "LaGouraudShd") {
			const n = number(attr(shade, "VerticesPerRow"));
			if (!Number.isInteger(n) || n < 2 || points.length % n)
				throw new Error("Invalid OFD lattice dimensions.");
			for (let i = 0; i < points.length - n; i++)
				if (i % n < n - 1) {
					triangles.push(
						[points[i], points[i + 1], points[i + n]],
						[points[i + 1], points[i + n], points[i + n + 1]],
					);
				}
		} else {
			let last: typeof points = [];
			for (let i = 0; i < points.length;) {
				const p = points[i];
				if (!p.edge) {
					last = points.slice(i, i + 3);
					i += 3;
				} else {
					if (last.length !== 3)
						throw new Error("Invalid Gouraud triangle continuation.");
					last = p.edge === 1 ? [last[1], last[2], p] : [last[0], last[2], p];
					i++;
				}
				if (last.length !== 3) throw new Error("Incomplete Gouraud triangle.");
				triangles.push(last);
			}
		}
		if (number(attr(shade, "Extend")) === 1) {
			const back = solidColor(first(shade, "BackColor"), [0, 0, 0, 255], res);
			for (let i = 0; i < pixels.length; i += 4) pixels.set(back, i);
		}
		for (const [a, b, c] of triangles) {
			abort(ctx.options.signal);
			const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
			if (!det) continue;
			const minX = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - x) * scale)),
				maxX = Math.min(width, Math.ceil((Math.max(a.x, b.x, c.x) - x) * scale)),
				minY = Math.max(0, Math.floor((Math.min(a.y, b.y, c.y) - y) * scale)),
				maxY = Math.min(height, Math.ceil((Math.max(a.y, b.y, c.y) - y) * scale));
			for (let py = minY; py < maxY; py++)
				for (let px = minX; px < maxX; px++) {
					const sx = x + (px + 0.5) / scale,
						sy = y + (py + 0.5) / scale,
						u = ((b.y - c.y) * (sx - c.x) + (c.x - b.x) * (sy - c.y)) / det,
						v = ((c.y - a.y) * (sx - c.x) + (a.x - c.x) * (sy - c.y)) / det,
						z = 1 - u - v;
					if (u >= -1e-8 && v >= -1e-8 && z >= -1e-8)
						for (let k = 0; k < 4; k++)
							pixels[(py * width + px) * 4 + k] = Math.round(
								a.color[k] * u + b.color[k] * v + c.color[k] * z,
							);
				}
		}
	} else {
		const start = numbers(attr(shade, "StartPoint")),
			end = numbers(attr(shade, "EndPoint")),
			colors = gradientStops(shade, res);
		if (start.length !== 2 || end.length !== 2)
			throw new Error("Gradient requires start and end points.");
		const eccentricity = number(attr(shade, "Eccentricity")),
			angle = (number(attr(shade, "Angle")) * Math.PI) / 180,
			q = Math.sqrt(1 - eccentricity ** 2);
		if (!(q > 0 && q <= 1)) throw new Error("Invalid radial eccentricity.");
		const project = (x: number, y: number) => [
			x * Math.cos(angle) + y * Math.sin(angle),
			(-x * Math.sin(angle) + y * Math.cos(angle)) / q,
		];
		const [cx, cy] = project(end[0] - start[0], end[1] - start[1]),
			r0 = number(attr(shade, "StartRadius")),
			r1 = number(attr(shade, "EndRadius")),
			dr = r1 - r0,
			len = Math.hypot(end[0] - start[0], end[1] - start[1]);
		for (let py = 0; py < height; py++) {
			abort(ctx.options.signal);
			for (let px = 0; px < width; px++) {
				const [sx, sy] = project(
					x + (px + 0.5) / scale - start[0],
					y + (py + 0.5) / scale - start[1],
				);
				let t: number;
				if (shade.localName === "AxialShd") t = (sx * cx + sy * cy) / (cx * cx + cy * cy);
				else {
					const a = cx * cx + cy * cy - dr * dr,
						b = -2 * (sx * cx + sy * cy + r0 * dr),
						c = sx * sx + sy * sy - r0 * r0,
						disc = b * b - 4 * a * c;
					const roots =
						Math.abs(a) < 1e-12
							? Math.abs(b) < 1e-12
								? []
								: [-c / b]
							: disc < 0
								? []
								: [
										(-b - Math.sqrt(disc)) / (2 * a),
										(-b + Math.sqrt(disc)) / (2 * a),
									];
					const candidates = roots.filter(
						(t) =>
							r0 + dr * t >= 0 &&
							position(shade, t, len || Math.abs(dr)) !== undefined,
					);
					if (!candidates.length) continue;
					t = Math.max(...candidates);
				}
				const mapped = position(shade, t, len || Math.abs(dr));
				if (mapped === undefined || !Number.isFinite(mapped)) continue;
				pixels.set(sample(colors, mapped).map(Math.round), (py * width + px) * 4);
			}
		}
	}
	const uri = dataUri(rgbaPng(width, height, pixels), "image/png");
	ctx.generatedBytes += uri.length;
	if (ctx.generatedBytes > (ctx.options.maxSvgBytes ?? 128 * 1024 * 1024))
		throw new RangeError("OFD paint output exceeds the size budget.");
	res.defs.push(
		`<pattern id="${id}" patternUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><image x="0" y="0" width="${w}" height="${h}" href="${uri}" preserveAspectRatio="none"/></pattern>`,
	);
	return `url(#${id})`;
}
