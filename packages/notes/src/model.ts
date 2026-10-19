import { validPhotoSource } from "./photo.js";
import { getBrushPlugin, validateBrushSettings } from "./brushes.js";
/** Coordinates and widths use physical points (1/72 inch), independent of zoom. */
export interface InkPoint {
	x: number;
	y: number;
	pressure: number;
	width?: number;
}
export type PenStyle = string;
export type AnchorSide = "top" | "right" | "bottom" | "left";
export interface InkAnchor {
	elementId: string;
	side: AnchorSide;
}
export interface NoteScene {
	id: string;
	name: string;
	x: number;
	y: number;
	width: number;
	height: number;
}
export interface MaskingTape {
	id: string;
	/** Center, length, width and rotation, in page coordinates. */
	x: number;
	y: number;
	width: number;
	height: number;
	angle: number;
}
export interface InkErasure {
	/** Swept round eraser, in page coordinates. Height preserves nonuniform resizing. */
	width: number;
	height?: number;
	points: { x: number; y: number }[];
}
export interface InkStroke {
	id: string;
	kind: "stroke";
	tool: "pen" | "highlighter";
	color: string;
	width: number;
	opacity: number;
	pressure: boolean;
	penStyle?: PenStyle;
	/** Rendering revision: absent means the original brush appearance. */
	brushVersion?: number;
	/** Independent pigment identity survives copying and changing element IDs. */
	brushSeed?: number;
	brushSettings?: Record<string, number>;
	/** Tape footprints captured when painting; removing tape preserves the white space. */
	cutouts?: { x: number; y: number }[][];
	/** Local removal of existing pigment; future strokes remain unaffected. */
	erasures?: InkErasure[];
	shape?: "line" | "rectangle" | "ellipse";
	connector?: { from: InkAnchor; to: InkAnchor };
	points: InkPoint[];
}
export interface InkText {
	id: string;
	kind: "text";
	x: number;
	y: number;
	text: string;
	color: string;
	size: number;
	font?: string;
}
export interface InkImage {
	/** Degrees clockwise around the image center; omitted in older notebooks. */
	angle?: number;
	id: string;
	kind: "image";
	src: string;
	x: number;
	y: number;
	width: number;
	height: number;
	opacity: number;
}
export type InkElement = InkStroke | InkText | InkImage;
export type PaperStyle = "plain" | "ruled" | "grid" | "dotted";
export interface InkLayer {
	id: string;
	name: string;
	visible: boolean;
	elements: InkElement[];
}
export interface NotePage {
	/** Infinite board; false retains a bounded paper page. */
	infinite?: boolean;
	id: string;
	width: number;
	height: number;
	paper: PaperStyle;
	color: string;
	bookmarked: boolean;
	scenes?: NoteScene[];
	tapes?: MaskingTape[];
	/** Fixed reference beneath the grid and ink; never part of lasso/eraser content. */
	background?: InkImage;
	layers: InkLayer[];
}
export interface Notebook {
	format: "cubeoffice-notebook";
	version: 1;
	title: string;
	pages: NotePage[];
}
export const LIMITS = {
	bytes: 64 * 1024 * 1024,
	pages: 1000,
	points: 2_000_000,
	elements: 100_000,
};
export const uid = () => crypto.randomUUID();
export const clone = <T>(value: T): T => structuredClone(value);
export function createPage(
	paper: PaperStyle = "grid",
	width = 595.28,
	height = 841.89,
	color = "#fffdf7",
): NotePage {
	return {
		id: uid(),
		infinite: false,
		width,
		height,
		paper,
		color,
		bookmarked: false,
		layers: [{ id: uid(), name: "Ink", visible: true, elements: [] }],
	};
}
export function createNotebook(title = "Untitled notebook", infinite = false): Notebook {
	const page = createPage();
	page.infinite = infinite;
	return { format: "cubeoffice-notebook", version: 1, title, pages: [page] };
}
export function pageElements(page: NotePage): InkElement[] {
	return page.layers.filter((layer) => layer.visible).flatMap((layer) => layer.elements);
}
export function inkWidth(stroke: InkStroke, point: InkPoint): number {
	if (point.width !== undefined) return point.width;
	const plugin = stroke.penStyle ? getBrushPlugin(stroke.penStyle) : undefined;
	if (!stroke.pressure || plugin?.supportsPressure === false) return stroke.width;
	const factor = plugin ? plugin.pressureFactor(point.pressure) : 0.3 + 1.4 * point.pressure;
	if (!Number.isFinite(factor) || factor <= 0 || factor > 2)
		throw new Error("Invalid brush pressure response.");
	return stroke.width * factor;
}
export function validateNotebook(value: unknown): Notebook {
	const fail = (): never => {
		throw new Error("Invalid or unsupported CubeOffice notebook.");
	};
	if (!value || typeof value !== "object") fail();
	const book = value as Notebook;
	if (
		book.format !== "cubeoffice-notebook" ||
		book.version !== 1 ||
		typeof book.title !== "string" ||
		book.title.length > 4096 ||
		!Array.isArray(book.pages) ||
		!book.pages.length ||
		book.pages.length > LIMITS.pages
	)
		fail();
	const ids = new Set<string>();
	let points = 0,
		elements = 0;
	const id = (v: unknown) => {
		if (typeof v !== "string" || !v.length || v.length > 128 || ids.has(v)) fail();
		ids.add(v as string);
	};
	const finite = (v: unknown, min: number, max: number) =>
		typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
	const photo = (image: InkImage) => {
		if (
			!image ||
			image.kind !== "image" ||
			!validPhotoSource(image.src) ||
			!finite(image.x, -1_000_000_000, 1_000_000_000) ||
			!finite(image.y, -1_000_000_000, 1_000_000_000) ||
			!finite(image.width, 0.01, 1_000_000) ||
			!finite(image.height, 0.01, 1_000_000) ||
			!finite(image.opacity, 0, 1) ||
			(image.angle !== undefined && !finite(image.angle, -360, 360))
		)
			fail();
	};
	const color = (v: unknown) => typeof v === "string" && /^#[\da-f]{6}$/i.test(v);
	for (const page of book.pages) {
		if (
			!page ||
			(page.infinite !== undefined && typeof page.infinite !== "boolean") ||
			!finite(page.width, 72, 5000) ||
			!finite(page.height, 72, 5000) ||
			!["plain", "ruled", "grid", "dotted"].includes(page.paper) ||
			!color(page.color) ||
			typeof page.bookmarked !== "boolean" ||
			!Array.isArray(page.layers) ||
			!page.layers.length ||
			page.layers.length > 100
		)
			fail();
		const infinite = page.infinite !== false,
			low = infinite ? -1_000_000_000 : 0,
			high = infinite ? 1_000_000_000 : page.width;
		id(page.id);
		if (page.background !== undefined) {
			photo(page.background);
			id(page.background.id);
		}
		if (page.tapes !== undefined) {
			if (!Array.isArray(page.tapes) || page.tapes.length > 24) fail();
			for (const tape of page.tapes) {
				if (
					!tape ||
					!finite(tape.x, low, high) ||
					!finite(tape.y, low, infinite ? high : page.height) ||
					!finite(tape.width, 4, 5000) ||
					!finite(tape.height, 4, 5000) ||
					!finite(tape.angle, -180, 180)
				)
					fail();
				id(tape.id);
			}
		}
		if (page.scenes !== undefined) {
			if (!Array.isArray(page.scenes) || page.scenes.length > 200) fail();
			for (const scene of page.scenes) {
				if (
					!scene ||
					typeof scene.name !== "string" ||
					!scene.name.trim() ||
					scene.name.length > 256 ||
					!finite(scene.x, low, high) ||
					!finite(scene.y, low, infinite ? high : page.height) ||
					!finite(scene.width, 1, high) ||
					!finite(scene.height, 1, infinite ? high : page.height) ||
					(!infinite && scene.x + scene.width > page.width + 0.001) ||
					(!infinite && scene.y + scene.height > page.height + 0.001)
				)
					fail();
				id(scene.id);
			}
		}
		const targets = new Map(
			page.layers
				.flatMap((l) => (Array.isArray(l?.elements) ? l.elements : []))
				.map((e) => [e?.id, e]),
		);
		for (const layer of page.layers) {
			if (
				!layer ||
				typeof layer.name !== "string" ||
				layer.name.length > 4096 ||
				typeof layer.visible !== "boolean" ||
				!Array.isArray(layer.elements)
			)
				fail();
			id(layer.id);
			for (const element of layer.elements) {
				if (
					!element ||
					++elements > LIMITS.elements ||
					(element.kind !== "image" && !color(element.color))
				)
					fail();
				id(element.id);
				if (element.kind === "stroke") {
					if (
						typeof element.penStyle === "string" &&
						element.penStyle.length <= 128 &&
						!getBrushPlugin(element.penStyle)
					)
						throw new Error(
							`Invalid or unsupported CubeOffice notebook: missing brush plugin ${element.penStyle}.`,
						);
					if (
						!["pen", "highlighter"].includes(element.tool) ||
						!finite(element.width, 0.01, 100) ||
						!finite(element.opacity, 0, 1) ||
						typeof element.pressure !== "boolean" ||
						(element.penStyle !== undefined &&
							(element.tool !== "pen" ||
								typeof element.penStyle !== "string" ||
								element.penStyle.length > 128 ||
								!getBrushPlugin(element.penStyle))) ||
						(element.brushSettings !== undefined &&
							(!element.penStyle ||
								!validateBrushSettings(element.penStyle, element.brushSettings))) ||
						(element.brushVersion !== undefined &&
							(!element.penStyle ||
								!Number.isInteger(element.brushVersion) ||
								!finite(
									element.brushVersion,
									1,
									getBrushPlugin(element.penStyle)?.version ?? 1,
								))) ||
						(element.brushSeed !== undefined &&
							(!element.penStyle ||
								!Number.isInteger(element.brushSeed) ||
								!finite(element.brushSeed, 0, 0xffffffff))) ||
						!Array.isArray(element.points) ||
						!element.points.length
					)
						fail();
					if (
						element.shape !== undefined &&
						(element.tool !== "pen" ||
							!["line", "rectangle", "ellipse"].includes(element.shape))
					)
						fail();
					if (element.connector !== undefined) {
						if (
							element.shape !== undefined ||
							element.tool !== "pen" ||
							!element.connector
						)
							fail();
						for (const anchor of [element.connector.from, element.connector.to]) {
							if (
								!anchor ||
								typeof anchor.elementId !== "string" ||
								!["top", "right", "bottom", "left"].includes(anchor.side)
							)
								fail();
							const target = targets.get(anchor.elementId);
							if (
								target?.kind !== "stroke" ||
								!["rectangle", "ellipse"].includes(target.shape ?? "")
							)
								fail();
						}
						if (element.connector.from.elementId === element.connector.to.elementId)
							fail();
					}
					if (element.cutouts !== undefined) {
						if (!Array.isArray(element.cutouts) || element.cutouts.length > 24) fail();
						for (const polygon of element.cutouts)
							if (
								!Array.isArray(polygon) ||
								polygon.length !== 4 ||
								polygon.some(
									(p) =>
										!p ||
										!finite(
											p.x,
											infinite ? low : -10000,
											infinite ? high : 10000,
										) ||
										!finite(
											p.y,
											infinite ? low : -10000,
											infinite ? high : 10000,
										),
								)
							)
								fail();
					}
					if (element.erasures !== undefined) {
						if (!Array.isArray(element.erasures) || element.erasures.length > 10000)
							fail();
						for (const erasure of element.erasures) {
							if (
								!erasure ||
								!finite(erasure.width, 0.01, 1_000_000) ||
								(erasure.height !== undefined &&
									!finite(erasure.height, 0.01, 1_000_000)) ||
								!Array.isArray(erasure.points) ||
								!erasure.points.length
							)
								fail();
							points += erasure.points.length;
							for (const p of erasure.points)
								if (
									!p ||
									!finite(
										p.x,
										infinite ? low : -10000,
										infinite ? high : 10000,
									) ||
									!finite(p.y, infinite ? low : -10000, infinite ? high : 10000)
								)
									fail();
						}
					}
					points += element.points.length;
					if (points > LIMITS.points) fail();
					for (const p of element.points)
						if (
							!p ||
							!finite(p.x, infinite ? low : -10000, infinite ? high : 10000) ||
							!finite(p.y, infinite ? low : -10000, infinite ? high : 10000) ||
							!finite(p.pressure, 0, 1) ||
							(p.width !== undefined && !finite(p.width, 0.01, 200))
						)
							fail();
				} else if (element.kind === "text") {
					if (
						!finite(element.x, infinite ? low : -10000, infinite ? high : 10000) ||
						!finite(element.y, infinite ? low : -10000, infinite ? high : 10000) ||
						!finite(element.size, 1, 200) ||
						typeof element.text !== "string" ||
						element.text.length > 100000 ||
						(element.font !== undefined &&
							(typeof element.font !== "string" || element.font.length > 256))
					)
						fail();
				} else if (element.kind === "image") photo(element);
				else fail();
			}
		}
	}
	return book;
}
