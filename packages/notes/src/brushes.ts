import { artBrushes } from "./brushes/art.js";
import { builtinBrushes } from "./brushes/builtins.js";
import type { InkPoint, InkStroke } from "./model.js";

export interface BrushPass {
	path: string;
	opacity: number;
	grain?: boolean;
	texture?: "wax" | "paper";
	/** Trusted pigment highlight/shadow color for bristle rendering. */
	color?: string;
	clip?: string;
}
export interface BrushGeometry {
	path(scale?: number): string;
	width(point: InkPoint): number;
}
export interface BrushParameter {
	id: string;
	label: string;
	labelEn: string;
	min: number;
	max: number;
	step: number;
	default: number;
}
export interface BrushPlugin {
	/** Stable file-format identity. Third-party IDs must use a namespace, e.g. acme:charcoal. */
	id: string;
	label: string;
	labelEn: string;
	hint: string;
	hintEn: string;
	glyph:
		| "ballpoint"
		| "fountain"
		| "brush"
		| "pencil"
		| "watercolor"
		| "marker"
		| "crayon"
		| "reed"
		| "spray"
		| "oil";
	/** New ink records this revision; renderers retain support for earlier ink. */
	version?: number;
	/** Optional vector tip paths; never executable markup from a notebook. */
	tipPaths?: readonly string[];
	quickWidths?: readonly number[];
	usesGrain: boolean;
	defaults: { color: string; width: number; opacity: number; pressure: boolean };
	maxWidth: number;
	supportsPressure: boolean;
	strength?: { label: string; labelEn: string; min: number; step: number };
	parameters?: readonly BrushParameter[];
	/** Whether ordinary Xournal variable-width ink can represent this brush. */
	xournal: boolean;
	pressureFactor(pressure: number): number;
	render(stroke: InkStroke, geometry: BrushGeometry): BrushPass[];
}
const registry = new Map<string, BrushPlugin>();
const subscribers = new Set<() => void>();
const finite = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;

function add(plugin: BrushPlugin, builtin = false): void {
	if (
		plugin.id.length > 128 ||
		!/^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?$/.test(plugin.id) ||
		(!builtin && !plugin.id.includes(":")) ||
		registry.has(plugin.id)
	)
		throw new Error(`Invalid or duplicate brush plugin ID: ${plugin.id}`);
	if (
		(plugin.version !== undefined &&
			(!Number.isInteger(plugin.version) || !finite(plugin.version, 1, 1000))) ||
		!plugin.label ||
		!plugin.labelEn ||
		!/^#[\da-f]{6}$/i.test(plugin.defaults.color) ||
		!finite(plugin.maxWidth, 1, 100) ||
		!finite(plugin.defaults.width, 0.1, plugin.maxWidth) ||
		!finite(plugin.defaults.opacity, 0, 1) ||
		typeof plugin.defaults.pressure !== "boolean" ||
		typeof plugin.supportsPressure !== "boolean" ||
		typeof plugin.xournal !== "boolean" ||
		typeof plugin.usesGrain !== "boolean" ||
		typeof plugin.render !== "function" ||
		typeof plugin.pressureFactor !== "function"
	)
		throw new Error(`Invalid brush plugin definition: ${plugin.id}`);
	const ids = new Set<string>();
	for (const p of plugin.parameters ?? []) {
		if (
			!/^[a-z][a-zA-Z0-9]*$/.test(p.id) ||
			["constructor", "prototype", "__proto__"].includes(p.id) ||
			ids.has(p.id) ||
			!finite(p.min, -10000, 10000) ||
			!finite(p.max, p.min + 0.001, 10000) ||
			!finite(p.step, 0.001, p.max - p.min) ||
			!finite(p.default, p.min, p.max)
		)
			throw new Error(`Invalid brush parameter: ${plugin.id}.${p.id}`);
		ids.add(p.id);
	}
	if (
		plugin.strength &&
		(!finite(plugin.strength.min, 0.01, 1) || !finite(plugin.strength.step, 0.01, 1))
	)
		throw new Error("Invalid brush strength control");
	for (const pressure of [0, 0.5, 1])
		if (!finite(plugin.pressureFactor(pressure), 0.01, 2))
			throw new Error("Invalid brush pressure response");
	if (
		plugin.quickWidths &&
		(!plugin.quickWidths.length ||
			!plugin.quickWidths.every((n) => finite(n, 0.1, plugin.maxWidth)))
	)
		throw new Error("Invalid brush width presets");
	registry.set(
		plugin.id,
		Object.freeze({
			...plugin,
			defaults: Object.freeze({ ...plugin.defaults }),
			strength: plugin.strength && Object.freeze({ ...plugin.strength }),
			quickWidths: plugin.quickWidths && Object.freeze([...plugin.quickWidths]),
			parameters: Object.freeze(
				(plugin.parameters ?? []).map((p) => Object.freeze({ ...p })),
			),
			tipPaths: plugin.tipPaths && Object.freeze([...plugin.tipPaths]),
		}),
	);
	for (const listener of subscribers) listener();
}
/** Register trusted application code before opening documents; documents contain IDs/data only. */
export function registerBrushPlugin(plugin: BrushPlugin): void {
	add(plugin);
}
export function listBrushPlugins(): readonly BrushPlugin[] {
	return [...registry.values()];
}
export function getBrushPlugin(id: string): BrushPlugin | undefined {
	return registry.get(id);
}
export function subscribeBrushPlugins(listener: () => void): () => void {
	subscribers.add(listener);
	return () => subscribers.delete(listener);
}
export function brushDefaults(id: string): Record<string, number> {
	return Object.fromEntries((registry.get(id)?.parameters ?? []).map((p) => [p.id, p.default]));
}
export function validateBrushSettings(id: string, settings: unknown): boolean {
	if (!settings || typeof settings !== "object" || Array.isArray(settings)) return false;
	const parameters = registry.get(id)?.parameters;
	if (!parameters) return false;
	return Object.entries(settings).every(([key, value]) => {
		const p = parameters.find((p) => p.id === key);
		return !!p && typeof value === "number" && finite(value, p.min, p.max);
	});
}

for (const plugin of [...builtinBrushes, ...artBrushes]) add(plugin, true);
