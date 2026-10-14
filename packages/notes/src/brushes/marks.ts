import type { InkPoint, InkStroke } from "../model.js";
import type { BrushGeometry, BrushPass } from "../brushes.js";
export function pigment(color: string, amount: number) {
	return (
		"#" +
		[1, 3, 5]
			.map((i) => {
				const n = parseInt(color.slice(i, i + 2), 16);
				return Math.round(amount > 0 ? n + (255 - n) * amount : n * (1 + amount))
					.toString(16)
					.padStart(2, "0");
			})
			.join("")
	);
}
export function noise(position: number, seed: number) {
	const value = (i: number) => {
		let n = Math.imul(i + Math.floor(seed * 37), 374761393);
		n = Math.imul(n ^ (n >>> 13), 1274126177);
		return ((n ^ (n >>> 16)) >>> 0) / 2147483647.5 - 1;
	};
	const sample = (step: number) => {
		const x = position / step,
			i = Math.floor(x),
			f = x - i,
			u = f * f * (3 - 2 * f);
		return value(i) + (value(i + 1) - value(i)) * u;
	};
	return sample(7) * 0.65 + sample(29) * 0.35;
}
/** Flat, pressure-sensitive ribbons; texture uses physical travel rather than event index. */
export function ribbon(
	s: InkStroke,
	g: BrushGeometry,
	offset = 0,
	thickness = 1,
	roughness = 0,
	seed = 0,
	trim = 0,
): string {
	const points: { p: InkPoint; distance: number }[] = [];
	let distance = 0;
	for (let i = 0; i < s.points.length; i++) {
		const p = s.points[i],
			a = s.points[Math.max(0, i - 1)],
			d = Math.hypot(p.x - a.x, p.y - a.y);
		const steps = Math.max(
			1,
			Math.min(64, Math.ceil(d / 3), Math.max(1, Math.floor(5000 / s.points.length))),
		);
		if (!i) points.push({ p, distance: 0 });
		else
			for (let j = 1; j <= steps; j++) {
				const t = j / steps;
				points.push({
					p: {
						x: a.x + (p.x - a.x) * t,
						y: a.y + (p.y - a.y) * t,
						pressure: a.pressure + (p.pressure - a.pressure) * t,
						...(a.width !== undefined && p.width !== undefined
							? { width: a.width + (p.width - a.width) * t }
							: {}),
					},
					distance: distance + d * t,
				});
			}
		distance += d;
	}
	if (points.length === 1) {
		const p = points[0].p,
			w = g.width(p);
		return `M${p.x - w * 0.12},${p.y + (offset - thickness / 2) * w}h${w * 0.24}v${thickness * w}h${-w * 0.24}Z`;
	}
	const upper: number[][] = [],
		lower: number[][] = [];
	for (let i = 0; i < points.length; i++) {
		const { p, distance: travel } = points[i];
		if (travel < trim || travel > distance - trim * 0.7) continue;
		const a = points[Math.max(0, i - 1)].p,
			b = points[Math.min(points.length - 1, i + 1)].p,
			len = Math.hypot(b.x - a.x, b.y - a.y) || 1,
			nx = -(b.y - a.y) / len,
			ny = (b.x - a.x) / len,
			w = g.width(p),
			shift = (offset + noise(travel, seed) * roughness * 0.09) * w,
			half = ((thickness * w) / 2) * (1 + noise(travel, seed + 4) * roughness * 0.4);
		upper.push([p.x + nx * (shift - half), p.y + ny * (shift - half)]);
		lower.push([p.x + nx * (shift + half), p.y + ny * (shift + half)]);
	}
	return upper.length
		? `M${[...upper, ...lower.reverse()].map((p) => p.map((n) => n.toFixed(2)).join(",")).join("L")}Z`
		: "";
}
export function oilPaint(s: InkStroke, g: BrushGeometry): BrushPass[] {
	const texture = (s.brushSettings?.bristles ?? 65) / 100;
	const passes: BrushPass[] = [
		{
			path: ribbon(s, g, 0, 0.94, 0.15, 4),
			opacity: s.opacity,
			color: pigment(s.color, -0.05),
		},
	];
	// Many irregular strands with restrained pigment variations avoid the old tube-like stripes.
	for (let i = 0; i < 27; i++) {
		const offset = -0.48 + (i / 26) * 0.96,
			thickness = (0.016 + (i % 4) * 0.007) * (1 + texture * 0.5),
			tone = noise(i * 11, 3) * 0.13;
		passes.push({
			path: ribbon(s, g, offset, thickness, 0.25, i + 13, (i % 5) * s.width * 0.06),
			opacity: s.opacity * texture * (0.5 + texture * 0.4),
			color: pigment(s.color, tone),
		});
	}
	passes.push({
		path: ribbon(s, g, -0.2, 0.012, 0.25, 31, s.width * 0.15),
		opacity: s.opacity * texture * 0.35,
		color: pigment(s.color, 0.22),
	});
	return passes;
}
export function graphite(s: InkStroke, g: BrushGeometry): BrushPass[] {
	return [
		{ path: g.path(), opacity: s.opacity * 0.035 },
		{ path: g.path(), opacity: s.opacity * 0.8, grain: true },
		...[-0.18, 0, 0.19].map((offset, i) => ({
			path: ribbon(s, g, offset, 0.065, 0.8, i + 4),
			opacity: s.opacity * 0.22,
		})),
	];
}
export function wax(s: InkStroke, g: BrushGeometry): BrushPass[] {
	return [
		{ path: ribbon(s, g, 0, 0.98, 0.35, 8), opacity: s.opacity * 0.2 },
		{
			path: ribbon(s, g, 0, 1, 0.4, 8),
			opacity: s.opacity * 0.85,
			grain: true,
			texture: "wax",
		},
		{
			path: ribbon(s, g, -0.12, 0.48, 0.6, 21),
			opacity: s.opacity * 0.25,
			grain: true,
			texture: "wax",
		},
	];
}
export function wash(s: InkStroke, g: BrushGeometry): BrushPass[] {
	const water = (s.brushSettings?.water ?? 75) / 100;
	return [
		...[1, 0.96, 0.91, 0.85, 0.78, 0.68].map((scale, i) => ({
			path: ribbon(s, g, 0, scale, 0.4 + water * 0.4, 11),
			opacity: s.opacity * (0.018 + i * 0.012) * (1.3 - water * 0.5),
		})),
		{
			path: ribbon(s, g, 0, 0.88, 0.5, 11),
			opacity: s.opacity * 0.14,
			grain: true,
			texture: "paper",
		},
		...[-0.44, 0.44].map((offset) => ({
			path: ribbon(s, g, offset, 0.035, 0.35, 11),
			opacity: s.opacity * 0.14 * (1 - water * 0.5),
		})),
	];
}
export function chisel(s: InkStroke, g: BrushGeometry, degrees = 35, aspect = 0.3): string {
	const angle = (degrees * Math.PI) / 180,
		c = Math.cos(angle),
		d = Math.sin(angle);
	const tip = (p: InkPoint) => {
		const w = g.width(p) / 2,
			t = w * aspect;
		return [
			[p.x - c * w - d * t, p.y - d * w + c * t],
			[p.x + c * w - d * t, p.y + d * w + c * t],
			[p.x + c * w + d * t, p.y + d * w - c * t],
			[p.x - c * w + d * t, p.y - d * w - c * t],
		];
	};
	const cross = (a: number[], b: number[], c: number[]) =>
		(b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
	const half = (points: number[][]) => {
		const hull: number[][] = [];
		for (const p of points) {
			while (hull.length >= 2 && cross(hull.at(-2)!, hull.at(-1)!, p) <= 0) hull.pop();
			hull.push(p);
		}
		return hull.slice(0, -1);
	};
	return s.points
		.map((p, i) => {
			const pts = [...tip(p), ...tip(s.points[Math.max(0, i - 1)])].sort(
				(a, b) => a[0] - b[0] || a[1] - b[1],
			);
			return `M${[...half(pts), ...half(pts.slice().reverse())].map((p) => p.map((n) => n.toFixed(2)).join(",")).join("L")}Z`;
		})
		.join("");
}
export function chineseInk(s: InkStroke, g: BrushGeometry): BrushPass[] {
	const dry = (s.brushSettings?.dryness ?? 40) / 100,
		path = g.path();
	if (!dry) return [{ path, opacity: s.opacity }];
	return [
		{ path, opacity: s.opacity * (1 - dry * 0.85) },
		...Array.from({ length: 17 }, (_, i) => ({
			path: ribbon(s, g, -0.46 + (i / 16) * 0.92, 0.035, 0.35, i + 16),
			opacity: s.opacity * (0.5 + dry * 0.5),
			clip: path,
		})),
		{ path, opacity: s.opacity * dry * 0.12, grain: true },
	];
}
