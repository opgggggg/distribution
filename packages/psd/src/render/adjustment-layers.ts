import { clonePsdBitmap, type PsdBitmap } from "../codec/document";
import { applyGrain, type PsdGrain } from "./grain";
import { rgbToHsl, hslToRgb } from "./raster-ops";
export const LEVEL_CHANNELS = ["rgb", "red", "green", "blue"] as const;
export const LIVE_ADJUSTMENT_KINDS = [
	"grain",
	"levels",
	"hue-saturation",
	"exposure",
	"gradient-map",
] as const;
export type PsdLiveAdjustmentKind = (typeof LIVE_ADJUSTMENT_KINDS)[number];
export interface PsdLevelChannel {
	inBlack: number;
	inWhite: number;
	gamma: number;
	outBlack: number;
	outWhite: number;
}
export interface PsdHueRange {
	handles: [number, number, number, number];
	hue: number;
	saturation: number;
	lightness: number;
}
export type PsdLiveAdjustment =
	| PsdGrain
	| { kind: "levels"; channels: Record<(typeof LEVEL_CHANNELS)[number], PsdLevelChannel> }
	| {
			kind: "hue-saturation";
			hue: number;
			saturation: number;
			lightness: number;
			colorize: boolean;
			colorHue: number;
			colorSaturation: number;
			colorLightness: number;
			ranges: PsdHueRange[];
	  }
	| { kind: "exposure"; exposure: number; offset: number; gamma: number }
	| {
			kind: "gradient-map";
			reverse: boolean;
			stops: Array<{
				position: number;
				midpoint: number;
				color: { r: number; g: number; b: number };
			}>;
	  };
export function defaultLiveAdjustment(kind: PsdLiveAdjustmentKind): PsdLiveAdjustment {
	switch (kind) {
		case "grain":
			return { kind, amount: 25, size: 1.5, roughness: 50, seed: 1 };
		case "levels":
			return {
				kind,
				channels: Object.fromEntries(
					LEVEL_CHANNELS.map((c) => [
						c,
						{ inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 },
					]),
				) as Extract<PsdLiveAdjustment, { kind: "levels" }>["channels"],
			};
		case "hue-saturation":
			return {
				kind,
				hue: 0,
				saturation: 0,
				lightness: 0,
				colorize: false,
				colorHue: 0,
				colorSaturation: 25,
				colorLightness: 0,
				ranges: Array.from({ length: 6 }, (_, i) => ({
					handles: [
						(i * 60 + 315) % 360,
						(i * 60 + 345) % 360,
						(i * 60 + 15) % 360,
						(i * 60 + 45) % 360,
					],
					hue: 0,
					saturation: 0,
					lightness: 0,
				})),
			};
		case "exposure":
			return { kind, exposure: 0, offset: 0, gamma: 1 };
		case "gradient-map":
			return {
				kind,
				reverse: false,
				stops: [
					{ position: 0, midpoint: 0.5, color: { r: 0, g: 0, b: 0 } },
					{ position: 1, midpoint: 0.5, color: { r: 255, g: 255, b: 255 } },
				],
			};
	}
}
function object(v: unknown, keys: string[]): Record<string, unknown> {
	if (!v || typeof v !== "object" || Array.isArray(v))
		throw new Error("Expected adjustment object");
	const o = v as Record<string, unknown>;
	if (Object.keys(o).some((k) => !keys.includes(k)) || keys.some((k) => !(k in o)))
		throw new Error("Missing or unknown adjustment field");
	return o;
}
function number(v: unknown, min: number, max: number, integer = false) {
	if (
		typeof v !== "number" ||
		!Number.isFinite(v) ||
		v < min ||
		v > max ||
		(integer && !Number.isInteger(v))
	)
		throw new Error(`Adjustment value must be ${integer ? "an integer " : ""}in ${min}…${max}`);
}
export function validateLiveAdjustment(value: unknown): asserts value is PsdLiveAdjustment {
	if (!value || typeof value !== "object") throw new Error("Expected adjustment");
	const v = value as PsdLiveAdjustment;
	switch (v.kind) {
		case "grain":
			object(v, ["kind", "amount", "size", "roughness", "seed"]);
			number(v.amount, 0, 100);
			number(v.size, 0.5, 20);
			number(v.roughness, 0, 100);
			number(v.seed, 0, 4294967295, true);
			break;
		case "levels":
			object(v, ["kind", "channels"]);
			object(v.channels, [...LEVEL_CHANNELS]);
			for (const c of LEVEL_CHANNELS) {
				const q = v.channels[c];
				object(q, ["inBlack", "inWhite", "gamma", "outBlack", "outWhite"]);
				for (const k of ["inBlack", "inWhite", "outBlack", "outWhite"] as const)
					number(q[k], 0, 255, true);
				number(q.gamma, 0.01, 9.99);
				if (q.inBlack >= q.inWhite)
					throw new Error("Input black must be below input white");
			}
			break;
		case "exposure":
			object(v, ["kind", "exposure", "offset", "gamma"]);
			number(v.exposure, -20, 20);
			number(v.offset, -0.5, 0.5);
			number(v.gamma, 0.01, 9.99);
			break;
		case "hue-saturation":
			object(v, [
				"kind",
				"hue",
				"saturation",
				"lightness",
				"colorize",
				"colorHue",
				"colorSaturation",
				"colorLightness",
				"ranges",
			]);
			if (typeof v.colorize !== "boolean") throw new Error("Invalid colorize flag");
			number(v.hue, -180, 180, true);
			number(v.saturation, -100, 100, true);
			number(v.lightness, -100, 100, true);
			number(v.colorHue, 0, 360, true);
			number(v.colorSaturation, 0, 100, true);
			number(v.colorLightness, -100, 100, true);
			if (!Array.isArray(v.ranges) || v.ranges.length !== 6)
				throw new Error("Expected six hue ranges");
			for (const r of v.ranges) {
				object(r, ["handles", "hue", "saturation", "lightness"]);
				if (!Array.isArray(r.handles) || r.handles.length !== 4)
					throw new Error("Expected four hue range handles");
				r.handles.forEach((n) => number(n, 0, 360, true));
				const forward = (n: number) => (n - r.handles[0] + 360) % 360;
				if (
					forward(r.handles[1]) > forward(r.handles[2]) ||
					forward(r.handles[2]) > forward(r.handles[3])
				)
					throw new Error("Hue range handles must be ordered around the color wheel");
				number(r.hue, -180, 180, true);
				number(r.saturation, -100, 100, true);
				number(r.lightness, -100, 100, true);
			}
			break;
		case "gradient-map":
			object(v, ["kind", "reverse", "stops"]);
			if (
				typeof v.reverse !== "boolean" ||
				!Array.isArray(v.stops) ||
				v.stops.length < 2 ||
				v.stops.length > 32
			)
				throw new Error("Expected 2–32 gradient stops");
			let prev = -1;
			for (const s of v.stops) {
				object(s, ["position", "midpoint", "color"]);
				number(s.position, 0, 1);
				number(s.midpoint, 0.01, 0.99);
				if (s.position <= prev) throw new Error("Gradient stops must increase");
				prev = s.position;
				object(s.color, ["r", "g", "b"]);
				for (const c of ["r", "g", "b"] as const) number(s.color[c], 0, 255, true);
			}
			if (v.stops[0].position !== 0 || v.stops.at(-1)?.position !== 1)
				throw new Error("Gradient must cover both endpoints");
			break;
		default:
			throw new Error("Unsupported adjustment kind");
	}
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));
function levelsTable(q: PsdLevelChannel): Uint8ClampedArray {
	return Uint8ClampedArray.from(
		{ length: 256 },
		(_, n) =>
			q.outBlack +
			(q.outWhite - q.outBlack) *
				Math.pow(
					clamp((n - q.inBlack) / (q.inWhite - q.inBlack)),
					1 / (Math.round(q.gamma * 100) / 100),
				),
	);
}
function hueWeight(h: number, r: PsdHueRange): number {
	const [a, b, c, d] = r.handles,
		f = (n: number) => (n - a + 360) % 360,
		x = f(h),
		end = f(d);
	if (!end) return 1;
	if (x > end) return 0;
	return x < f(b) ? x / Math.max(1, f(b)) : x <= f(c) ? 1 : (end - x) / Math.max(1, end - f(c));
}
/** Source pixels and alpha are immutable; generated output is applied by the layer compositor. */
export function applyLiveAdjustment(bitmap: PsdBitmap, a: PsdLiveAdjustment, originX = 0, originY = 0): PsdBitmap {
	if (a.kind === "grain") return applyGrain(bitmap, a, originX, originY);
	const out = clonePsdBitmap(bitmap),
		d = out.data;
	if (a.kind === "levels") {
		const tables = LEVEL_CHANNELS.map((c) => levelsTable(a.channels[c]));
		for (let p = 0; p < d.length; p += 4)
			for (let c = 0; c < 3; c++) d[p + c] = tables[0][tables[c + 1][d[p + c]]];
	} else if (a.kind === "exposure") {
		const scale = 2 ** Math.fround(a.exposure),
			gamma = Math.fround(a.gamma),
			offset = Math.fround(a.offset);
		const lut = Uint8ClampedArray.from({ length: 256 }, (_, i) => {
			const x = i / 255,
				linear = x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
				y = Math.max(0, linear * scale + offset) ** (1 / gamma);
			return 255 * (y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055);
		});
		for (let p = 0; p < d.length; p += 4) for (let c = 0; c < 3; c++) d[p + c] = lut[d[p + c]];
	} else if (a.kind === "hue-saturation") {
		for (let p = 0; p < d.length; p += 4) {
			let [h, s, l] = rgbToHsl(d[p], d[p + 1], d[p + 2]);
			if (a.colorize) {
				h = a.colorHue / 360;
				s = a.colorSaturation / 100;
				l =
					a.colorLightness < 0
						? l * (1 + a.colorLightness / 100)
						: l + ((1 - l) * a.colorLightness) / 100;
			} else {
				let hue = a.hue,
					sat = a.saturation,
					light = a.lightness;
				for (const r of a.ranges) {
					const w = hueWeight(h * 360, r);
					hue += r.hue * w;
					sat += r.saturation * w;
					light += r.lightness * w;
				}
				h = (h + hue / 360 + 2) % 1;
				s = sat < 0 ? s * (1 + sat / 100) : s + ((1 - s) * sat) / 100;
				l = light < 0 ? l * (1 + light / 100) : l + ((1 - l) * light) / 100;
			}
			const rgb = hslToRgb(h, clamp(s), clamp(l));
			for (let c = 0; c < 3; c++) d[p + c] = rgb[c];
		}
	} else {
		const stops = a.stops.map((s) => ({
			...s,
			position: Math.round(s.position * 4096) / 4096,
			midpoint: Math.round(s.midpoint * 100) / 100,
		}));
		for (let p = 0; p < d.length; p += 4) {
			let t = Math.round(0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2]) / 255;
			if (a.reverse) t = 1 - t;
			let i = 0;
			while (i < stops.length - 2 && t > stops[i + 1].position) i++;
			const l = stops[i],
				r = stops[i + 1];
			let f = clamp((t - l.position) / (r.position - l.position));
			f = f ** (Math.log(0.5) / Math.log(l.midpoint));
			for (const [c, key] of ["r", "g", "b"].entries())
				d[p + c] = l.color[key as "r"] + (r.color[key as "r"] - l.color[key as "r"]) * f;
		}
	}
	return out;
}
export function autoLevels(bitmap: PsdBitmap): Extract<PsdLiveAdjustment, { kind: "levels" }> {
	const result = defaultLiveAdjustment("levels") as Extract<
		PsdLiveAdjustment,
		{ kind: "levels" }
	>;
	for (let c = 0; c < 3; c++) {
		const bins = new Float64Array(256);
		let total = 0;
		for (let p = 0; p < bitmap.data.length; p += 4) {
			const w = bitmap.data[p + 3] / 255;
			bins[bitmap.data[p + c]] += w;
			total += w;
		}
		if (!total) continue;
		const threshold = total * 0.005;
		let lo = 0,
			hi = 255,
			sum = 0;
		while (lo < 254 && sum + bins[lo] <= threshold) sum += bins[lo++];
		sum = 0;
		while (hi > lo && sum + bins[hi] <= threshold) sum += bins[hi--];
		if (lo < hi) {
			result.channels[LEVEL_CHANNELS[c + 1]].inBlack = lo;
			result.channels[LEVEL_CHANNELS[c + 1]].inWhite = hi;
		}
	}
	return result;
}
