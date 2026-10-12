import { getStroke } from "perfect-freehand";
import { escapeXml } from "./codec.js";
import { inkWidth, pageElements, type InkStroke, type NotePage } from "./model.js";

export function strokeOutline(stroke: InkStroke): number[][] {
	const points: number[][] = [];
	for (let i = 0; i < stroke.points.length; i++) {
		const p = stroke.points[i],
			previous = stroke.points[i - 1];
		const width = inkWidth(stroke, p);
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
		const previousWidth = inkWidth(stroke, previous);
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
	});
}
export function outlinePath(points: number[][]): string {
	return points.length
		? `M${points.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join("L")}Z`
		: "";
}
export function paintStroke(ctx: CanvasRenderingContext2D, stroke: InkStroke): void {
	ctx.save();
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
	} else ctx.fill(new Path2D(outlinePath(strokeOutline(stroke))));
	ctx.restore();
}
export function paintPage(
	ctx: CanvasRenderingContext2D,
	page: NotePage,
	omit = new Set<string>(),
): void {
	ctx.save();
	ctx.fillStyle = page.color;
	ctx.fillRect(0, 0, page.width, page.height);
	ctx.strokeStyle = "#cdd4df";
	ctx.fillStyle = "#c1c9d7";
	ctx.lineWidth = 0.5;
	const step = 20;
	if (page.paper === "dotted") {
		for (let x = step; x < page.width; x += step)
			for (let y = step; y < page.height; y += step) {
				ctx.beginPath();
				ctx.arc(x, y, 0.8, 0, Math.PI * 2);
				ctx.fill();
			}
	} else if (page.paper !== "plain") {
		ctx.beginPath();
		for (let y = page.paper === "grid" ? step : 40; y < page.height; y += step) {
			ctx.moveTo(0, y);
			ctx.lineTo(page.width, y);
		}
		if (page.paper === "grid")
			for (let x = step; x < page.width; x += step) {
				ctx.moveTo(x, 0);
				ctx.lineTo(x, page.height);
			}
		ctx.stroke();
	}
	for (const element of pageElements(page)) {
		if (omit.has(element.id)) continue;
		if (element.kind === "stroke") paintStroke(ctx, element);
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
	let paper = "";
	if (page.paper === "dotted")
		paper =
			'<pattern id="paper" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="0.8" fill="#b8c2d2"/></pattern>';
	else if (page.paper !== "plain")
		paper = `<pattern id="paper" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M0 20H20${page.paper === "grid" ? "M20 0V20" : ""}" fill="none" stroke="#cdd4df" stroke-width="0.5"/></pattern>`;
	const content = pageElements(page)
		.map((e) => {
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
				return `<rect x="${p.x - e.width / 2}" y="${p.y - e.width / 2}" width="${e.width}" height="${e.width}" fill="${e.color}" opacity="${e.opacity}"/>`;
			}
			return e.tool === "highlighter"
				? `<polyline points="${e.points.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${e.color}" stroke-width="${e.width}" stroke-opacity="${e.opacity}" stroke-linejoin="round"/>`
				: `<path d="${outlinePath(strokeOutline(e))}" fill="${e.color}" opacity="${e.opacity}"/>`;
		})
		.join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.width} ${page.height}" width="${page.width}" height="${page.height}"><defs>${paper}</defs><rect width="100%" height="100%" fill="${page.color}"/>${paper ? '<rect width="100%" height="100%" fill="url(#paper)"/>' : ""}${content}</svg>`;
}
export function pageSvgUrl(page: NotePage): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pageSvg(page))}`;
}
