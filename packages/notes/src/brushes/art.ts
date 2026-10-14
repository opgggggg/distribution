import { pigmentSeed } from "./pigment.js";
import { oilPaint } from "./marks.js";
import type { BrushPlugin } from "../brushes.js";
import type { InkStroke } from "../model.js";
const dot = (x: number, y: number, r: number) =>
	`M${(x - r).toFixed(2)},${y.toFixed(2)}a${r.toFixed(2)},${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)},0a${r.toFixed(2)},${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)},0Z`;
function bristlePath(s: InkStroke, offset: number) {
	const edges = s.points.map((p, i) => {
		const a = s.points[Math.max(0, i - 1)],
			b = s.points[Math.min(s.points.length - 1, i + 1)],
			length = Math.hypot(b.x - a.x, b.y - a.y) || 1,
			nx = -(b.y - a.y) / length,
			ny = (b.x - a.x) / length,
			pressure = s.pressure ? 0.6 + 0.8 * p.pressure : 1,
			w = s.width * pressure,
			drift = Math.sin(i * 0.37 + offset * 8) * 0.008;
		return [
			p.x + nx * w * (offset + drift),
			p.y + ny * w * (offset + drift),
			nx * w * 0.016,
			ny * w * 0.016,
		];
	});
	const points = [
		...edges.map(([x, y, dx, dy]) => [x - dx, y - dy]),
		...edges
			.slice()
			.reverse()
			.map(([x, y, dx, dy]) => [x + dx, y + dy]),
	];
	return `M${points.map((p) => p.map((n) => n.toFixed(2)).join(",")).join("L")}Z`;
}
function pigment(color: string, amount: number) {
	const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
	return (
		"#" +
		rgb
			.map((n) =>
				Math.round(amount > 0 ? n + (255 - n) * amount : n * (1 + amount))
					.toString(16)
					.padStart(2, "0"),
			)
			.join("")
	);
}
/** Stable particle positions across live redraws, native reloads and exports. */
function legacySpray(stroke: InkStroke) {
	let seed = pigmentSeed(stroke);
	const random = () => {
		seed ^= seed << 13;
		seed ^= seed >>> 17;
		seed ^= seed << 5;
		return (seed >>> 0) / 4294967296;
	};
	const density = stroke.brushSettings?.density ?? 55;
	let path = "",
		count = 0,
		carry = 0;
	const total = stroke.points.reduce(
		(sum, p, i) =>
			sum + (i ? Math.hypot(p.x - stroke.points[i - 1].x, p.y - stroke.points[i - 1].y) : 0),
		0,
	);
	const spacing = Math.max(
		1,
		stroke.width / 10,
		total / Math.max(1, Math.floor(5000 / Math.round(density / 6)) - 1),
	);
	const stamp = (x: number, y: number, pressure: number) => {
		const radius = (stroke.width / 2) * (stroke.pressure ? 0.7 + 0.6 * pressure : 1);
		for (let j = 0; j < Math.round(density / 6) && count < 5000; j++, count++) {
			const theta = random() * Math.PI * 2,
				distance = Math.sqrt(random()) * radius;
			path += dot(
				x + Math.cos(theta) * distance,
				y + Math.sin(theta) * distance,
				0.25 + random() * Math.max(0.5, stroke.width / 45),
			);
		}
	};
	stamp(stroke.points[0].x, stroke.points[0].y, stroke.points[0].pressure);
	for (let i = 1; i < stroke.points.length && count < 5000; i++) {
		const a = stroke.points[i - 1],
			b = stroke.points[i],
			distance = Math.hypot(b.x - a.x, b.y - a.y);
		if (!distance) continue;
		let offset = spacing - carry;
		for (; offset <= distance && count < 5000; offset += spacing) {
			const t = offset / distance;
			stamp(
				a.x + (b.x - a.x) * t,
				a.y + (b.y - a.y) * t,
				a.pressure + (b.pressure - a.pressure) * t,
			);
		}
		carry = (carry + distance) % spacing;
	}
	return [{ path, opacity: stroke.opacity }];
}

interface SprayState {
	points: number;
	last: { x: number; y: number; pressure: number };
	first: { x: number; y: number; pressure: number };
	signature: string;
	paths: string[];
	seed: number;
	ordinal: number;
	next: number;
}
const sprayCache = new WeakMap<InkStroke, SprayState>();
function stableSpray(s: InkStroke) {
	const density = s.brushSettings?.density ?? 55,
		base = Math.max(1, s.width / 10),
		signature = `${s.brushSeed ?? s.id}:${s.width}:${s.pressure}:${density}`,
		first = s.points[0];
	let state = sprayCache.get(s);
	const previous = state && s.points[state.points - 1];
	if (
		!state ||
		signature !== state.signature ||
		state.points > s.points.length ||
		!previous ||
		previous.x !== state.last.x ||
		previous.y !== state.last.y ||
		previous.pressure !== state.last.pressure ||
		first.x !== state.first.x ||
		first.y !== state.first.y ||
		first.pressure !== state.first.pressure
	) {
		let seed = pigmentSeed(s);
		if (!seed) seed = 0x6d2b79f5;
		state = {
			points: 0,
			last: { ...first },
			first: { ...first },
			signature,
			paths: ["", "", ""],
			seed,
			ordinal: 0,
			next: base,
		};
		sprayCache.set(s, state);
	}
	const random = () => {
		state!.seed ^= state!.seed << 13;
		state!.seed ^= state!.seed >>> 17;
		state!.seed ^= state!.seed << 5;
		return (state!.seed >>> 0) / 4294967296;
	};
	const stamp = (x: number, y: number, pressure: number) => {
		const radius = (s.width / 2) * (s.pressure ? 0.7 + 0.6 * pressure : 1);
		for (let j = 0; j < Math.round(density / 6); j++) {
			const theta = random() * Math.PI * 2,
				distance = Math.sqrt(random()) * radius,
				r = 0.25 + random() * Math.max(0.5, s.width / 45),
				group = Math.floor(random() * 3);
			state!.paths[group] += dot(
				x + Math.cos(theta) * distance,
				y + Math.sin(theta) * distance,
				r,
			);
		}
		state!.ordinal++;
	};
	if (!state.points) {
		stamp(first.x, first.y, first.pressure);
		state.points = 1;
	}
	for (let i = state.points; i < s.points.length; i++) {
		const a = s.points[i - 1],
			b = s.points[i],
			distance = Math.hypot(b.x - a.x, b.y - a.y);
		if (!distance) continue;
		let offset = state.next;
		while (offset <= distance) {
			const t = offset / distance;
			stamp(
				a.x + (b.x - a.x) * t,
				a.y + (b.y - a.y) * t,
				a.pressure + (b.pressure - a.pressure) * t,
			);
			// Bound extreme continuous strokes without ever resampling earlier pigment.
			offset += base * 2 ** Math.floor(state.ordinal / 1024);
		}
		state.next = offset - distance;
	}
	state.points = s.points.length;
	state.last = { ...s.points.at(-1)! };
	return state.paths.map((path, i) => ({ path, opacity: s.opacity * [0.5, 0.75, 1][i] }));
}
export const artBrushes: readonly BrushPlugin[] = [
	{
		id: "spray",
		version: 2,
		label: "喷筒",
		labelEn: "Spray",
		hint: "散点喷绘",
		hintEn: "Scattered pigment",
		glyph: "spray",
		defaults: { color: "#2563eb", width: 40, opacity: 0.75, pressure: true },
		maxWidth: 100,
		quickWidths: [20, 40, 80],
		supportsPressure: true,
		usesGrain: false,
		xournal: false,
		strength: { label: "不透明度", labelEn: "Opacity", min: 0.1, step: 0.05 },
		parameters: [
			{
				id: "density",
				label: "喷点密度",
				labelEn: "Particle density",
				min: 10,
				max: 100,
				step: 5,
				default: 55,
			},
		],
		pressureFactor: (p) => 0.7 + 0.6 * p,
		render: (s) => ((s.brushVersion ?? 1) >= 2 ? stableSpray(s) : legacySpray(s)),
	},
	{
		id: "oil",
		version: 2,
		label: "油画笔",
		labelEn: "Oil paint",
		hint: "厚涂笔触",
		hintEn: "Rich bristle strokes",
		glyph: "oil",
		defaults: { color: "#b45309", width: 24, opacity: 1, pressure: true },
		maxWidth: 80,
		quickWidths: [12, 24, 48],
		supportsPressure: true,
		usesGrain: true,
		xournal: false,
		strength: { label: "不透明度", labelEn: "Opacity", min: 0.2, step: 0.05 },
		parameters: [
			{
				id: "bristles",
				label: "笔触纹理",
				labelEn: "Bristle texture",
				min: 0,
				max: 100,
				step: 10,
				default: 65,
			},
		],
		pressureFactor: (p) => 0.6 + 0.8 * p,
		render: (s, g) => {
			if ((s.brushVersion ?? 1) >= 2) return oilPaint(s, g);
			const texture = (s.brushSettings?.bristles ?? 65) / 100;
			return [
				{ path: g.path(), opacity: s.opacity * (1 - texture * 0.35) },
				{ path: g.path(), opacity: s.opacity * texture * 0.65, grain: true },
				...[0.82, 0.6, 0.38].map((scale) => ({
					path: g.path(scale),
					opacity: s.opacity * (0.18 + texture * 0.18),
				})),
				...[-0.3, -0.16, 0, 0.16, 0.3].map((offset, i) => ({
					path: bristlePath(s, offset),
					opacity: s.opacity * texture * 0.65,
					color: pigment(s.color, i % 2 ? -0.25 : 0.35),
				})),
			];
		},
	},
];
