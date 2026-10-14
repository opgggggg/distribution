import { escapeXml } from "./codec.js";

// A fixed paper-space tile keeps grain stable across redraws, zoom and exports.
// It is generated once, with no device-specific noise or random raster assets.
export const GRAIN_SIZE = 48;
export const pencilGrain = (() => {
	let seed = 173;
	const random = () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed / 4294967296;
	};
	return Array.from({ length: 1024 }, (_, i) => ({
		x: (i % 32) * 1.5 + 0.3 + random() * 0.9,
		y: Math.floor(i / 32) * 1.5 + 0.3 + random() * 0.9,
		r: 0.14 + random() * 0.48,
		opacity: 0.4 + random() * 0.6,
	}));
})();

export function grainSvg(color: string, id: string, texture?: GrainTexture): string {
	if (texture) return textureSvg(color, id, texture);
	return `<pattern id="${escapeXml(id)}" patternUnits="userSpaceOnUse" width="${GRAIN_SIZE}" height="${GRAIN_SIZE}"><g fill="${escapeXml(color)}">${pencilGrain.map((g) => `<circle cx="${g.x.toFixed(3)}" cy="${g.y.toFixed(3)}" r="${g.r.toFixed(3)}" opacity="${g.opacity.toFixed(3)}"/>`).join("")}</g></pattern>`;
}

const patterns = new Map<string, CanvasPattern>();
export function grainPattern(
	ctx: CanvasRenderingContext2D,
	color: string,
	kind?: GrainTexture,
): CanvasPattern {
	const key = `${color}:${kind ?? ""}`;
	const cached = patterns.get(key);
	if (cached) return cached;
	const tile = document.createElement("canvas");
	tile.width = tile.height = GRAIN_SIZE * 2;
	const texture = tile.getContext("2d")!;
	texture.scale(2, 2);
	texture.fillStyle = color;
	for (const g of kind === "wax" ? waxGrain : kind === "paper" ? paperGrain : pencilGrain) {
		texture.globalAlpha = g.opacity * (kind === "paper" ? 0.6 : 1);
		texture.beginPath();
		if (kind === "wax" && "w" in g) {
			const mark = g as (typeof waxGrain)[number];
			texture.ellipse(
				g.x,
				g.y,
				0.3 + mark.r * 0.5,
				0.25 + mark.r * 0.28,
				mark.w * 0.8,
				0,
				Math.PI * 2,
			);
		} else texture.arc(g.x, g.y, g.r, 0, Math.PI * 2);
		texture.fill();
	}
	const pattern = ctx.createPattern(tile, "repeat")!;
	pattern.setTransform(new DOMMatrix().scale(0.5));
	// Bound color-tile memory when repeatedly using custom colors.
	if (patterns.size >= 24) patterns.delete(patterns.keys().next().value!);
	patterns.set(key, pattern);
	return pattern;
}

export type GrainTexture = "wax" | "paper";
function pigmentGrain(seed: number, count: number) {
	const random = () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed / 4294967296;
	};
	return Array.from({ length: count }, () => ({
		x: random() * GRAIN_SIZE,
		y: random() * GRAIN_SIZE,
		r: 0.4 + random() * 2.1,
		opacity: 0.12 + random() * 0.5,
		w: 1.2 + random() * 3.2,
		h: 0.5 + random() * 1.8,
	}));
}
const waxGrain = pigmentGrain(713, 384),
	paperGrain = pigmentGrain(1931, 288);
function textureSvg(color: string, id: string, texture: GrainTexture): string {
	const marks = (texture === "wax" ? waxGrain : paperGrain)
		.map((g) =>
			texture === "wax"
				? `<ellipse cx="${g.x.toFixed(3)}" cy="${g.y.toFixed(3)}" rx="${(0.3 + g.r * 0.5).toFixed(3)}" ry="${(0.25 + g.r * 0.28).toFixed(3)}" transform="rotate(${((g.w * 0.8 * 180) / Math.PI).toFixed(3)} ${g.x.toFixed(3)} ${g.y.toFixed(3)})" opacity="${g.opacity.toFixed(3)}"/>`
				: `<circle cx="${g.x.toFixed(3)}" cy="${g.y.toFixed(3)}" r="${g.r.toFixed(3)}" opacity="${(g.opacity * 0.6).toFixed(3)}"/>`,
		)
		.join("");
	return `<pattern id="${escapeXml(id)}" patternUnits="userSpaceOnUse" width="${GRAIN_SIZE}" height="${GRAIN_SIZE}"><g fill="${escapeXml(color)}">${marks}</g></pattern>`;
}
