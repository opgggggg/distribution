export type Point = [number, number];
export type Matrix = [number, number, number, number, number, number];
export type PathCommand =
	| { op: "M"; points: [Point] }
	| { op: "L"; points: [Point] }
	| { op: "C"; points: [Point, Point, Point] }
	| { op: "Z"; points: [] };

interface Artwork {
	id: string;
	name: string;
	matrix: Matrix;
	hidden: boolean;
	locked: boolean;
	fill: string | null;
	fillAlpha: number;
}
export interface VectorPath extends Artwork {
	kind: "path";
	commands: PathCommand[];
	stroke: string | null;
	strokeAlpha: number;
	strokeWidth: number;
	strokeCap: 0 | 1 | 2;
	strokeJoin: 0 | 1 | 2;
	miterLimit: number;
	fillRule: "nonzero" | "evenodd";
}
export interface VectorText extends Artwork {
	kind: "text";
	text: string;
	size: number;
}
export type VectorObject = VectorPath | VectorText;
export interface Artboard {
	id: string;
	name: string;
	width: number;
	height: number;
	objects: VectorObject[];
	/** PNG encoded as base64. Present only when the source page could not be reproduced as paths. */
	background?: string;
}
export interface VectorProject {
	version: 1;
	artboards: Artboard[];
}
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
export const COLOR = /^#[\da-f]{6}$/i;
const PNG = /^iVBORw0KGgo[\w+/]+=*$/;
export const MAX_DIMENSION = 14_400;
export const MAX_BOARDS = 100;
export const MAX_OBJECTS = 10_000;
export const MAX_COMMANDS = 100_000;
export const MAX_PROJECT_BYTES = 16 * 1024 * 1024;

export function newArtboard(name: string, width = 800, height = 600): Artboard {
	return { id: crypto.randomUUID(), name, width, height, objects: [] };
}

export function newPath(name: string, commands: PathCommand[], open = false): VectorPath {
	return {
		id: crypto.randomUUID(),
		kind: "path",
		name,
		matrix: [...IDENTITY],
		commands,
		hidden: false,
		locked: false,
		fill: open ? null : "#7854d8",
		fillAlpha: 1,
		stroke: open ? "#7854d8" : null,
		strokeAlpha: 1,
		strokeWidth: 1.5,
		strokeCap: 0,
		strokeJoin: 0,
		miterLimit: 10,
		fillRule: "nonzero",
	};
}

export function pathData(commands: readonly PathCommand[]): string {
	return commands.map(({ op, points }) => `${op} ${points.flat().join(" ")}`).join(" ");
}

export function transformPoint([a, b, c, d, e, f]: Matrix, [x, y]: Point): Point {
	return [a * x + c * y + e, b * x + d * y + f];
}

export function multiply([a, b, c, d, e, f]: Matrix, [g, h, i, j, k, l]: Matrix): Matrix {
	return [
		a * g + c * h,
		b * g + d * h,
		a * i + c * j,
		b * i + d * j,
		a * k + c * l + e,
		b * k + d * l + f,
	];
}

export function inverse([a, b, c, d, e, f]: Matrix): Matrix | null {
	const det = a * d - b * c;
	return Math.abs(det) < 1e-10
		? null
		: [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export function shapePath(tool: "rectangle" | "ellipse", from: Point, to: Point): PathCommand[] {
	const x = Math.min(from[0], to[0]),
		y = Math.min(from[1], to[1]);
	const w = Math.abs(to[0] - from[0]),
		h = Math.abs(to[1] - from[1]);
	if (tool === "rectangle")
		return [
			{ op: "M", points: [[x, y]] },
			{ op: "L", points: [[x + w, y]] },
			{ op: "L", points: [[x + w, y + h]] },
			{ op: "L", points: [[x, y + h]] },
			{ op: "Z", points: [] },
		];
	const cx = x + w / 2,
		cy = y + h / 2,
		dx = (0.55228474983 * w) / 2,
		dy = (0.55228474983 * h) / 2;
	return [
		{ op: "M", points: [[x + w, cy]] },
		{
			op: "C",
			points: [
				[x + w, cy + dy],
				[cx + dx, y + h],
				[cx, y + h],
			],
		},
		{
			op: "C",
			points: [
				[cx - dx, y + h],
				[x, cy + dy],
				[x, cy],
			],
		},
		{
			op: "C",
			points: [
				[x, cy - dy],
				[cx - dx, y],
				[cx, y],
			],
		},
		{
			op: "C",
			points: [
				[cx + dx, y],
				[x + w, cy - dy],
				[x + w, cy],
			],
		},
		{ op: "Z", points: [] },
	];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validNumber(value: unknown, min = -1e7, max = 1e7): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validString(value: unknown, max: number): value is string {
	return typeof value === "string" && value.length <= max;
}

// Never feed an arbitrary embedded document into either the SVG viewport or the PDF writer.
export function parseVectorProject(serialized: string): VectorProject {
	if (serialized.length > MAX_PROJECT_BYTES)
		throw new Error("The vector project exceeds the editing budget.");
	const project: unknown = JSON.parse(serialized);
	const invalid = () => new Error("This CubeOffice vector project is invalid.");
	if (
		!isRecord(project) ||
		project.version !== 1 ||
		!Array.isArray(project.artboards) ||
		project.artboards.length === 0 ||
		project.artboards.length > MAX_BOARDS
	)
		throw invalid();
	let objects = 0,
		commands = 0;
	const ids = new Set<string>();
	const validId = (id: unknown) => {
		if (!validString(id, 80) || !/^[\w-]+$/.test(id) || ids.has(id)) return false;
		ids.add(id);
		return true;
	};
	const colorOrNone = (value: unknown) =>
		value === null || (typeof value === "string" && COLOR.test(value));
	for (const board of project.artboards) {
		if (
			!isRecord(board) ||
			!validId(board.id) ||
			!validString(board.name, 128) ||
			!validNumber(board.width, 1, MAX_DIMENSION) ||
			!validNumber(board.height, 1, MAX_DIMENSION) ||
			!Array.isArray(board.objects) ||
			(board.background !== undefined &&
				(typeof board.background !== "string" || !PNG.test(board.background)))
		)
			throw invalid();
		objects += board.objects.length;
		if (objects > MAX_OBJECTS) throw invalid();
		for (const object of board.objects) {
			if (
				!isRecord(object) ||
				!validId(object.id) ||
				!validString(object.name, 128) ||
				!Array.isArray(object.matrix) ||
				object.matrix.length !== 6 ||
				!object.matrix.every((entry) => validNumber(entry)) ||
				typeof object.hidden !== "boolean" ||
				typeof object.locked !== "boolean" ||
				!colorOrNone(object.fill) ||
				!validNumber(object.fillAlpha, 0, 1)
			)
				throw invalid();
			if (object.kind === "text") {
				if (!validString(object.text, 1024) || !validNumber(object.size, 1, 512))
					throw invalid();
				continue;
			}
			if (
				object.kind !== "path" ||
				!Array.isArray(object.commands) ||
				!colorOrNone(object.stroke) ||
				!validNumber(object.strokeWidth, 0, 4096) ||
				(object.strokeCap !== 0 && object.strokeCap !== 1 && object.strokeCap !== 2) ||
				(object.strokeJoin !== 0 && object.strokeJoin !== 1 && object.strokeJoin !== 2) ||
				!validNumber(object.miterLimit, 1, 4096) ||
				!validNumber(object.strokeAlpha, 0, 1) ||
				(object.fillRule !== "nonzero" && object.fillRule !== "evenodd")
			)
				throw invalid();
			commands += object.commands.length;
			if (commands > MAX_COMMANDS || object.commands[0]?.op !== "M") throw invalid();
			for (const command of object.commands) {
				if (!isRecord(command) || !Array.isArray(command.points)) throw invalid();
				const length =
					command.op === "M" || command.op === "L"
						? 1
						: command.op === "C"
							? 3
							: command.op === "Z"
								? 0
								: -1;
				if (
					command.points.length !== length ||
					!command.points.every(
						(pt) =>
							Array.isArray(pt) && pt.length === 2 && pt.every((v) => validNumber(v)),
					)
				)
					throw invalid();
			}
		}
	}
	return project as unknown as VectorProject;
}
