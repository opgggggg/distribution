import { pageContentBounds, intersects } from "./board.js";
import { bounds, type Bounds } from "./geometry.js";
import { polygonPath } from "./masking.js";
import { erasureCapsule, erasureSegments } from "./erasure-geometry.js";
import { getStroke } from "perfect-freehand";
import { getBrushPlugin } from "./brushes.js";
import type { BrushPass } from "./brushes.js";
export type { BrushPass } from "./brushes.js";
import { escapeXml } from "./codec.js";
import { inkWidth, pageElements, type InkStroke, type NotePage } from "./model.js";
import { loadPhoto, paintPhoto, photoSvg, samplePhotoColor } from "./photo.js";
import type { InkImage } from "./model.js";
import { grainPattern, grainSvg } from "./texture.js";

type CanvasPass = BrushPass & { drawPath: Path2D; clipPath?: Path2D };
type CanvasStrokeCache = {
	strokes: Map<
		InkStroke,
		{ plugin: ReturnType<typeof getBrushPlugin>; passes: CanvasPass[]; weight: number }
	>;
	weight: number;
	photos?: Map<string, HTMLImageElement>;
	loading?: Set<string>;
	onPhotoReady?: () => void;
};

/** Cache immutable ink vectors across page snapshots, with a bounded estimate of their size. */
function paintCachedPhoto(
	ctx: CanvasRenderingContext2D,
	photo: InkImage,
	cache?: CanvasStrokeCache,
) {
	const image = cache?.photos?.get(photo.src);
	if (image) paintPhoto(ctx, photo, image);
	else if (cache?.onPhotoReady && !cache.loading?.has(photo.src)) {
		cache.loading?.add(photo.src);
		void loadPhoto(photo.src)
			.then((image) => {
				cache.photos?.set(photo.src, image);
				cache.onPhotoReady?.();
			})
			.catch(() => {
				/* A corrupt raster must not block editing other content. */
			});
	}
}
export function createPagePainter(
	onPhotoReady?: () => void,
	photos = new Map<string, HTMLImageElement>(),
) {
	let sampleCanvas: HTMLCanvasElement | undefined;
	const cache: CanvasStrokeCache = {
		strokes: new Map(),
		weight: 0,
		photos,
		loading: new Set(),
		onPhotoReady,
	};
	return Object.assign(
		(
			ctx: CanvasRenderingContext2D,
			page: NotePage,
			omit?: Set<string>,
			region?: Bounds,
			zoom?: number,
		) => {
			const used = new Set([
				...(page.background ? [page.background.src] : []),
				...pageElements(page)
					.filter((e): e is InkImage => e.kind === "image")
					.map((e) => e.src),
			]);
			for (const src of photos.keys()) if (!used.has(src)) photos.delete(src);
			for (const src of cache.loading!) if (!used.has(src)) cache.loading!.delete(src);
			paintPage(ctx, page, omit, region, zoom, cache);
		},
		{
			samplePhoto: (photo: InkImage, point: import("./geometry.js").Point) => {
				const image = photos.get(photo.src);
				if (!image) return;
				sampleCanvas ??= Object.assign(document.createElement("canvas"), {
					width: 1,
					height: 1,
				});
				return samplePhotoColor(photo, image, point, sampleCanvas);
			},
			photo: (ctx: CanvasRenderingContext2D, photo: InkImage) =>
				paintCachedPhoto(ctx, photo, cache),
		},
	);
}

export function strokeOutline(stroke: InkStroke, scale = 1): number[][] {
	const points: number[][] = [];
	for (let i = 0; i < stroke.points.length; i++) {
		const p = stroke.points[i],
			previous = stroke.points[i - 1];
		const width = inkWidth(stroke, p) * scale;
		if (!previous) {
			points.push([p.x, p.y, width / (stroke.width * 4)]);
			continue;
		}
		// Sparse rectangle corners need interpolation; the outline algorithm
		// otherwise joins corner normals across an entire long edge.
		const steps = Math.min(
			64,
			Math.max(
				stroke.points.length === 2 ? 2 : 1,
				Math.min(
					Math.ceil(Math.hypot(p.x - previous.x, p.y - previous.y) / 4),
					Math.max(1, Math.floor(100_000 / stroke.points.length)),
				),
			),
		);
		const previousWidth = inkWidth(stroke, previous) * scale;
		for (let step = 1; step <= steps; step++) {
			const t = step / steps;
			points.push([
				previous.x + (p.x - previous.x) * t,
				previous.y + (p.y - previous.y) * t,
				(previousWidth + (width - previousWidth) * t) / (stroke.width * 4),
			]);
		}
	}
	return getStroke(points, {
		size: stroke.width * 2,
		thinning: 1,
		simulatePressure: false,
		smoothing: 0.5,
		streamline: 0,
		last: true,
		...(stroke.penStyle === "brush"
			? { start: { taper: stroke.width * 0.6 }, end: { taper: stroke.width * 2.4 } }
			: {}),
	});
}
export function outlinePath(points: number[][]): string {
	return points.length
		? `M${points.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join("L")}Z`
		: "";
}
/** Live canvas, previews, thumbnails, PNG and PDF share plugin-generated passes. */
export function brushPasses(stroke: InkStroke): BrushPass[] {
	const geometry = {
		path: (scale = 1) => outlinePath(strokeOutline(stroke, scale)),
		width: (point: InkStroke["points"][number]) => inkWidth(stroke, point),
	};
	const plugin =
		stroke.tool === "pen" && stroke.penStyle ? getBrushPlugin(stroke.penStyle) : undefined;
	if (stroke.penStyle && stroke.tool === "pen" && !plugin)
		throw new Error(`Missing brush plugin: ${stroke.penStyle}`);
	return plugin
		? plugin.render(stroke, geometry)
		: [{ path: geometry.path(), opacity: stroke.opacity }];
}
export function clipStrokeSvg(stroke: InkStroke, content: string): string {
	if (!stroke.cutouts?.length && !stroke.erasures?.length) return content;
	const id = escapeXml(`tape-${stroke.id}`),
		b = bounds(stroke),
		margin = stroke.width * 3;
	const erased = (stroke.erasures ?? [])
		.map((e) => {
			const rx = e.width / 2,
				ry = (e.height ?? e.width) / 2;
			if (e.points.length === 1)
				return `<ellipse cx="${e.points[0].x}" cy="${e.points[0].y}" rx="${rx}" ry="${ry}" fill="black"/>`;
			return `<path d="M${e.points.map((p) => `${p.x / rx},${p.y / ry}`).join("L")}" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="scale(${rx} ${ry})"/>`;
		})
		.join("");
	return `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="${b.x - margin}" y="${b.y - margin}" width="${b.width + margin * 2}" height="${b.height + margin * 2}" style="mask-type:luminance"><rect x="${b.x - margin}" y="${b.y - margin}" width="${b.width + margin * 2}" height="${b.height + margin * 2}" fill="white"/>${(stroke.cutouts ?? []).map((p) => `<path d="${polygonPath(p)}" fill="black"/>`).join("")}${erased}</mask></defs><g mask="url(#${id})">${content}</g>`;
}
export function strokeSvg(
	stroke: InkStroke,
	token: string,
	includeGrain = true,
	supplied?: BrushPass[],
): string {
	const passes = supplied ?? brushPasses(stroke),
		id = `${token}-grain`;
	const textures = new Set(passes.filter((p) => p.grain).map((p) => p.texture));
	const definitions = includeGrain
		? [...textures]
				.map(
					(type) =>
						`<defs>${grainSvg(stroke.color, `${id}${type ? `-${type}` : ""}`, type)}</defs>`,
				)
				.join("")
		: "";
	return clipStrokeSvg(
		stroke,
		definitions +
			passes
				.map((p, i) => {
					const clipId = escapeXml(`${token}-${stroke.id}-clip-${i}`);
					return `${p.clip ? `<defs><clipPath id="${clipId}"><path d="${escapeXml(p.clip)}"/></clipPath></defs>` : ""}<path d="${escapeXml(p.path)}" fill="${p.grain ? `url(#${escapeXml(id + (p.texture ? `-${p.texture}` : ""))})` : escapeXml(p.color ?? stroke.color)}" opacity="${p.opacity}"${p.clip ? ` clip-path="url(#${clipId})"` : ""}/>`;
				})
				.join(""),
	);
}
export function paintStroke(
	ctx: CanvasRenderingContext2D,
	stroke: InkStroke,
	cache?: CanvasStrokeCache,
): void {
	ctx.save();
	const b = bounds(stroke),
		m = stroke.width * 3;
	for (const polygon of stroke.cutouts ?? [])
		ctx.clip(
			new Path2D(
				`M${b.x - m},${b.y - m}h${b.width + m * 2}v${b.height + m * 2}h${-b.width - m * 2}Z${polygonPath(polygon)}`,
			),
			"evenodd",
		);
	for (const erasure of stroke.erasures ?? [])
		for (const [a, end] of erasureSegments(erasure))
			ctx.clip(
				new Path2D(
					`M${b.x - m},${b.y - m}h${b.width + m * 2}v${b.height + m * 2}h${-b.width - m * 2}Z${erasureCapsule(a, end, erasure.width, erasure.height)}`,
				),
				"evenodd",
			);
	ctx.globalAlpha = stroke.opacity;
	ctx.fillStyle = ctx.strokeStyle = stroke.color;
	if (stroke.tool === "highlighter") {
		ctx.lineWidth = stroke.width;
		ctx.lineCap = "butt";
		ctx.lineJoin = "round";
		ctx.beginPath();
		stroke.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
		if (stroke.points.length === 1) {
			const p = stroke.points[0];
			ctx.fillRect(
				p.x - stroke.width / 2,
				p.y - stroke.width / 2,
				stroke.width,
				stroke.width,
			);
		} else ctx.stroke();
	} else {
		const plugin = getBrushPlugin(stroke.penStyle ?? "ballpoint");
		let cached = cache?.strokes.get(stroke);
		if (!cached || cached.plugin !== plugin) {
			if (cached && cache) {
				cache.weight -= cached.weight;
				cache.strokes.delete(stroke);
			}
			cached = {
				plugin,
				weight: 0,
				passes: brushPasses(stroke).map((pass) => ({
					...pass,
					drawPath: new Path2D(pass.path),
					...(pass.clip ? { clipPath: new Path2D(pass.clip) } : {}),
				})),
			};
			if (cache) {
				const weight = cached.passes.reduce(
					(total, pass) =>
						total + 128 + (pass.path.length + (pass.clip?.length ?? 0)) * 4,
					0,
				);
				const limit = 48 * 1024 * 1024;
				while (cache.weight + weight > limit && cache.strokes.size) {
					const oldest = cache.strokes.keys().next().value!;
					cache.weight -= cache.strokes.get(oldest)!.weight;
					cache.strokes.delete(oldest);
				}
				cached.weight = weight;
				if (weight <= limit) {
					cache.weight += weight;
					cache.strokes.set(stroke, cached);
				}
			}
		} else if (cache) {
			cache.strokes.delete(stroke);
			cache.strokes.set(stroke, cached);
		}
		for (const pass of cached.passes) {
			ctx.globalAlpha = pass.opacity;
			ctx.fillStyle = pass.grain
				? grainPattern(ctx, stroke.color, pass.texture)
				: (pass.color ?? stroke.color);
			ctx.save();
			if (pass.clipPath) ctx.clip(pass.clipPath);
			ctx.fill(pass.drawPath);
			ctx.restore();
		}
	}
	ctx.restore();
}
export function paintPage(
	ctx: CanvasRenderingContext2D,
	page: NotePage,
	omit = new Set<string>(),
	region?: Bounds,
	zoom = 1,
	cache?: CanvasStrokeCache,
): void {
	ctx.save();
	const area = region ?? { x: 0, y: 0, width: page.width, height: page.height };
	ctx.fillStyle = page.color;
	ctx.fillRect(area.x, area.y, area.width, area.height);
	if (page.background) paintCachedPhoto(ctx, page.background, cache);
	ctx.strokeStyle = "#cdd4df";
	ctx.fillStyle = "#c1c9d7";
	ctx.lineWidth = 0.5 / Math.min(1, zoom);
	const step = 20 * Math.pow(2, Math.max(0, Math.ceil(Math.log2(8 / (20 * zoom)))));
	const x0 = Math.ceil(area.x / step) * step,
		y0 = Math.ceil(area.y / step) * step;
	if (page.paper === "dotted") {
		for (let x = x0; x < area.x + area.width; x += step)
			for (let y = y0; y < area.y + area.height; y += step) {
				ctx.beginPath();
				ctx.arc(x, y, 0.8 / Math.min(1, zoom), 0, Math.PI * 2);
				ctx.fill();
			}
	} else if (page.paper !== "plain") {
		ctx.beginPath();
		for (let y = y0; y < area.y + area.height; y += step) {
			if (!region && y < (page.paper === "grid" ? step : 40)) continue;
			ctx.moveTo(area.x, y);
			ctx.lineTo(area.x + area.width, y);
		}
		if (page.paper === "grid")
			for (let x = x0; x < area.x + area.width; x += step) {
				if (!region && x < step) continue;
				ctx.moveTo(x, area.y);
				ctx.lineTo(x, area.y + area.height);
			}
		ctx.stroke();
	}
	for (const element of pageElements(page)) {
		if (
			omit.has(element.id) ||
			(region &&
				!intersects(bounds(element), {
					...region,
					x: region.x - 200,
					y: region.y - 200,
					width: region.width + 400,
					height: region.height + 400,
				}))
		)
			continue;
		if (element.kind === "stroke") paintStroke(ctx, element, cache);
		else if (element.kind === "image") paintCachedPhoto(ctx, element, cache);
		else {
			ctx.fillStyle = element.color;
			ctx.font = `${element.size}px ${JSON.stringify(element.font ?? "sans-serif")}, sans-serif`;
			element.text
				.split("\n")
				.forEach((line, i) =>
					ctx.fillText(
						line,
						element.x,
						element.y + element.size + i * element.size * 1.35,
					),
				);
		}
	}
	ctx.restore();
}
export function pageSvg(page: NotePage): string {
	const area = pageContentBounds(page);
	const elements = pageElements(page);
	// Share grain tiles across every stroke of a color; sketches can have thousands
	// of pencil strokes and must not embed a fresh texture for each one.
	const rendered = new Map(
		elements.flatMap((e) =>
			e.kind === "stroke" && e.tool === "pen" ? [[e.id, brushPasses(e)] as const] : [],
		),
	);
	const textureDefinitions = new Map<string, string>();
	for (const e of elements)
		if (e.kind === "stroke")
			for (const pass of rendered.get(e.id) ?? [])
				if (pass.grain) {
					const id = `ink-${e.color.slice(1)}-grain${pass.texture ? `-${pass.texture}` : ""}`;
					if (!textureDefinitions.has(id))
						textureDefinitions.set(id, grainSvg(e.color, id, pass.texture));
				}
	const textures = [...textureDefinitions.values()].join("");
	let paper = "";
	if (page.paper === "dotted")
		paper =
			'<pattern id="paper" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="0.8" fill="#b8c2d2"/></pattern>';
	else if (page.paper !== "plain")
		paper = `<pattern id="paper" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M0 20H20${page.paper === "grid" ? "M20 0V20" : ""}" fill="none" stroke="#cdd4df" stroke-width="0.5"/></pattern>`;
	const content = elements
		.map((e) => {
			if (e.kind === "image") return photoSvg(e);
			if (e.kind === "text")
				return `<text x="${e.x}" y="${e.y + e.size}" fill="${e.color}" font-size="${e.size}" font-family="${escapeXml(e.font ?? "sans-serif")}">${e.text
					.split("\n")
					.map(
						(line, i) =>
							`<tspan x="${e.x}" dy="${i ? e.size * 1.35 : 0}">${escapeXml(line)}</tspan>`,
					)
					.join("")}</text>`;
			if (e.tool === "highlighter" && e.points.length === 1) {
				const p = e.points[0];
				return clipStrokeSvg(
					e,
					`<rect x="${p.x - e.width / 2}" y="${p.y - e.width / 2}" width="${e.width}" height="${e.width}" fill="${e.color}" opacity="${e.opacity}"/>`,
				);
			}
			return e.tool === "highlighter"
				? clipStrokeSvg(
						e,
						`<polyline points="${e.points.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${e.color}" stroke-width="${e.width}" stroke-opacity="${e.opacity}" stroke-linejoin="round"/>`,
					)
				: strokeSvg(e, `ink-${e.color.slice(1)}`, false, rendered.get(e.id));
		})
		.join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${area.x} ${area.y} ${area.width} ${area.height}" width="${area.width}" height="${area.height}"><defs>${paper}${textures}</defs><rect x="${area.x}" y="${area.y}" width="${area.width}" height="${area.height}" fill="${page.color}"/>${page.background ? photoSvg(page.background) : ""}${paper ? `<rect x="${area.x}" y="${area.y}" width="${area.width}" height="${area.height}" fill="url(#paper)"/>` : ""}${content}</svg>`;
}
export function pageSvgUrl(page: NotePage): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pageSvg(page))}`;
}
