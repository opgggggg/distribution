import { graphite, wax, wash, chisel, chineseInk } from "./marks.js";
import type { InkPoint, InkStroke } from "../model.js";
import type { BrushPlugin, BrushGeometry } from "../brushes.js";
function tone(stroke: InkStroke): number {
	let weight = 0,
		pressure = 0;
	for (let i = 1; i < stroke.points.length; i++) {
		const a = stroke.points[i - 1],
			b = stroke.points[i],
			d = Math.hypot(b.x - a.x, b.y - a.y);
		weight += d;
		pressure += (d * (a.pressure + b.pressure)) / 2;
	}
	return stroke.pressure ? (weight ? pressure / weight : stroke.points[0].pressure) : 0.5;
}
const round = (stroke: InkStroke, geometry: BrushGeometry) => [
	{ path: geometry.path(), opacity: stroke.opacity },
];
const base = {
	glyph: "ballpoint" as const,
	defaults: { color: "#222b40", width: 2, opacity: 1, pressure: true },
	maxWidth: 24,
	supportsPressure: true,
	xournal: true,
	usesGrain: false,
	render: round,
};

export const builtinBrushes: readonly BrushPlugin[] = [
	{
		...base,
		id: "ballpoint",
		quickWidths: [1, 1.5, 3],
		label: "圆珠笔",
		labelEn: "Ballpoint",
		hint: "均匀线条",
		hintEn: "Uniform ink",
		supportsPressure: false,
		defaults: { ...base.defaults, width: 1.5, pressure: false },
		pressureFactor: () => 1,
	},
	{
		...base,
		id: "fountain",
		quickWidths: [1, 2, 4],
		label: "钢笔",
		labelEn: "Fountain",
		hint: "柔和压感",
		hintEn: "Gentle pressure",
		glyph: "fountain",
		pressureFactor: (p) => 0.6 + 0.8 * p,
	},
	{
		...base,
		id: "brush",
		version: 2,
		quickWidths: [3, 6, 10],
		label: "毛笔",
		labelEn: "Brush",
		hint: "中式笔锋与收锋",
		hintEn: "Chinese ink and tapered tips",
		glyph: "brush",
		defaults: { ...base.defaults, width: 6 },
		usesGrain: true,
		xournal: false,
		parameters: [
			{
				id: "dryness",
				label: "飞白",
				labelEn: "Dry ink",
				min: 0,
				max: 100,
				step: 10,
				default: 40,
			},
		],
		pressureFactor: (p) => 0.1 + 1.8 * p,
		render: (s, g) => {
			if ((s.brushVersion ?? 1) >= 2) return chineseInk(s, g);
			const dry = (s.brushSettings?.dryness ?? 0) / 100;
			if (!dry) return round(s, g);
			return [
				{ path: g.path(), opacity: s.opacity * (1 - dry * 0.8) },
				{ path: g.path(), opacity: s.opacity * dry, grain: true },
			];
		},
	},
	{
		...base,
		id: "pencil",
		version: 2,
		label: "铅笔",
		labelEn: "Pencil",
		hint: "纸张颗粒",
		hintEn: "Paper grain",
		glyph: "pencil",
		defaults: { ...base.defaults, color: "#44403c", width: 3 },
		xournal: false,
		usesGrain: true,
		pressureFactor: (p) => 0.7 + 0.6 * p,
		render: (s, g) => {
			if ((s.brushVersion ?? 1) >= 2) return graphite(s, g);
			const t = tone(s),
				path = g.path();
			return [
				{ path, opacity: s.opacity * (0.045 + t * 0.14) },
				{ path, opacity: s.opacity * (0.3 + t * 0.7), grain: true },
			];
		},
	},
	{
		...base,
		id: "watercolor",
		version: 2,
		quickWidths: [12, 24, 48],
		label: "水彩",
		labelEn: "Watercolor",
		hint: "柔边叠色",
		hintEn: "Soft layered washes",
		parameters: [
			{
				id: "water",
				label: "含水量",
				labelEn: "Water content",
				min: 0,
				max: 100,
				step: 10,
				default: 75,
			},
		],
		glyph: "watercolor",
		defaults: { ...base.defaults, color: "#2563eb", width: 24, opacity: 0.65 },
		maxWidth: 60,
		xournal: false,
		usesGrain: true,
		strength: { label: "浓度", labelEn: "Color strength", min: 0.1, step: 0.05 },
		pressureFactor: (p) => 0.65 + 0.7 * p,
		render: (s, g) =>
			(s.brushVersion ?? 1) >= 2
				? wash(s, g)
				: [
						...[
							[1, 0.015],
							[0.98, 0.025],
							[0.94, 0.04],
							[0.9, 0.06],
							[0.86, 0.09],
							[0.81, 0.14],
							[0.75, 0.19],
							[0.68, 0.24],
						].map(([scale, opacity]) => ({
							path: g.path(scale),
							opacity: s.opacity * opacity,
						})),
						{ path: g.path(0.86), opacity: s.opacity * 0.1, grain: true },
					],
	},
	{
		...base,
		id: "marker",
		version: 2,
		label: "马克笔",
		labelEn: "Marker",
		hint: "平滑宽幅",
		hintEn: "Broad smooth ink",
		glyph: "marker",
		xournal: false,
		render: (s, g) =>
			(s.brushVersion ?? 1) >= 2 ? [{ path: chisel(s, g), opacity: s.opacity }] : round(s, g),
		defaults: { ...base.defaults, width: 12, opacity: 0.85 },
		maxWidth: 60,
		strength: { label: "不透明度", labelEn: "Opacity", min: 0.1, step: 0.05 },
		pressureFactor: (p) => 0.85 + 0.3 * p,
	},
	{
		...base,
		id: "crayon",
		version: 2,
		label: "蜡笔",
		labelEn: "Crayon",
		hint: "蜡质颗粒",
		hintEn: "Waxy grain",
		glyph: "crayon",
		defaults: { ...base.defaults, color: "#dc3658", width: 16 },
		maxWidth: 60,
		xournal: false,
		usesGrain: true,
		strength: { label: "不透明度", labelEn: "Opacity", min: 0.1, step: 0.05 },
		pressureFactor: (p) => 0.6 + 0.8 * p,
		render: (s, g) => {
			if ((s.brushVersion ?? 1) >= 2) return wax(s, g);
			const t = tone(s);
			return [
				{ path: g.path(), opacity: s.opacity * (0.16 + t * 0.24) },
				{ path: g.path(), opacity: s.opacity * (0.4 + t * 0.55), grain: true },
				{ path: g.path(0.7), opacity: s.opacity * 0.16, grain: true },
			];
		},
	},
	{
		...base,
		id: "reed",
		label: "芦苇笔",
		labelEn: "Reed pen",
		hint: "斜尖书法",
		hintEn: "Angled calligraphy",
		glyph: "reed",
		defaults: { ...base.defaults, width: 12 },
		maxWidth: 40,
		xournal: false,
		usesGrain: false,
		parameters: [
			{
				id: "angle",
				label: "笔尖角度",
				labelEn: "Nib angle",
				min: 0,
				max: 180,
				step: 15,
				default: 45,
			},
		],
		pressureFactor: (p) => 0.65 + 0.7 * p,
		render: (s, g) => {
			const angle = ((s.brushSettings?.angle ?? 45) * Math.PI) / 180,
				c = Math.cos(angle),
				d = Math.sin(angle);
			const vertices = (p: InkPoint) => {
				const w = g.width(p) / 2,
					t = Math.max(0.25, w * 0.12);
				return [
					[p.x - c * w - d * t, p.y - d * w + c * t],
					[p.x + c * w - d * t, p.y + d * w + c * t],
					[p.x + c * w + d * t, p.y + d * w - c * t],
					[p.x - c * w + d * t, p.y - d * w - c * t],
				];
			};
			let path = "";
			// Each swept chisel segment is a convex hull. Fill once, so joints cannot darken.
			for (let i = 0; i < s.points.length; i++) {
				const pts = [
					...vertices(s.points[i]),
					...vertices(s.points[Math.max(0, i - 1)]),
				].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
				const cross = (a: number[], b: number[], c: number[]) =>
					(b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
				const half = (ps: number[][]) => {
					const out: number[][] = [];
					for (const p of ps) {
						while (out.length >= 2 && cross(out.at(-2)!, out.at(-1)!, p) <= 0)
							out.pop();
						out.push(p);
					}
					return out.slice(0, -1);
				};
				const hull = [...half(pts), ...half([...pts].reverse())];
				path += `M${hull.map((p) => p.map((n) => n.toFixed(2)).join(",")).join("L")}Z`;
			}
			return [{ path, opacity: s.opacity }];
		},
	},
];
