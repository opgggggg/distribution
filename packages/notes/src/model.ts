/** Coordinates and widths use physical points (1/72 inch), independent of zoom. */
export interface InkPoint {
	x: number;
	y: number;
	pressure: number;
	width?: number;
}
export type PenStyle = "ballpoint" | "fountain" | "brush";
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
export interface InkStroke {
	id: string;
	kind: "stroke";
	tool: "pen" | "highlighter";
	color: string;
	width: number;
	opacity: number;
	pressure: boolean;
	penStyle?: PenStyle;
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
export type InkElement = InkStroke | InkText;
export type PaperStyle = "plain" | "ruled" | "grid" | "dotted";
export interface InkLayer {
	id: string;
	name: string;
	visible: boolean;
	elements: InkElement[];
}
export interface NotePage {
	id: string;
	width: number;
	height: number;
	paper: PaperStyle;
	color: string;
	bookmarked: boolean;
	scenes?: NoteScene[];
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
		width,
		height,
		paper,
		color,
		bookmarked: false,
		layers: [{ id: uid(), name: "Ink", visible: true, elements: [] }],
	};
}
export function createNotebook(title = "Untitled notebook"): Notebook {
	return { format: "cubeoffice-notebook", version: 1, title, pages: [createPage()] };
}
export function pageElements(page: NotePage): InkElement[] {
	return page.layers.filter((layer) => layer.visible).flatMap((layer) => layer.elements);
}
export function inkWidth(stroke: InkStroke, point: InkPoint): number {
	if (point.width !== undefined) return point.width;
	if (!stroke.pressure || stroke.penStyle === "ballpoint") return stroke.width;
	const p = point.pressure;
	const factor =
		stroke.penStyle === "fountain"
			? 0.6 + 0.8 * p
			: stroke.penStyle === "brush"
				? 0.15 + 1.7 * p
				: 0.3 + 1.4 * p;
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
	const color = (v: unknown) => typeof v === "string" && /^#[\da-f]{6}$/i.test(v);
	for (const page of book.pages) {
		if (
			!page ||
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
		id(page.id);
		if (page.scenes !== undefined) {
			if (!Array.isArray(page.scenes) || page.scenes.length > 200) fail();
			for (const scene of page.scenes) {
				if (
					!scene ||
					typeof scene.name !== "string" ||
					!scene.name.trim() ||
					scene.name.length > 256 ||
					!finite(scene.x, 0, page.width) ||
					!finite(scene.y, 0, page.height) ||
					!finite(scene.width, 1, page.width) ||
					!finite(scene.height, 1, page.height) ||
					scene.x + scene.width > page.width + 0.001 ||
					scene.y + scene.height > page.height + 0.001
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
				if (!element || ++elements > LIMITS.elements || !color(element.color)) fail();
				id(element.id);
				if (element.kind === "stroke") {
					if (
						!["pen", "highlighter"].includes(element.tool) ||
						!finite(element.width, 0.01, 100) ||
						!finite(element.opacity, 0, 1) ||
						typeof element.pressure !== "boolean" ||
						(element.penStyle !== undefined &&
							(element.tool !== "pen" ||
								!["ballpoint", "fountain", "brush"].includes(element.penStyle))) ||
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
					points += element.points.length;
					if (points > LIMITS.points) fail();
					for (const p of element.points)
						if (
							!p ||
							!finite(p.x, -10000, 10000) ||
							!finite(p.y, -10000, 10000) ||
							!finite(p.pressure, 0, 1) ||
							(p.width !== undefined && !finite(p.width, 0.01, 200))
						)
							fail();
				} else if (element.kind === "text") {
					if (
						!finite(element.x, -10000, 10000) ||
						!finite(element.y, -10000, 10000) ||
						!finite(element.size, 1, 200) ||
						typeof element.text !== "string" ||
						element.text.length > 100000 ||
						(element.font !== undefined &&
							(typeof element.font !== "string" || element.font.length > 256))
					)
						fail();
				} else fail();
			}
		}
	}
	return book;
}
