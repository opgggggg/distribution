import {
	MAX_COMMANDS,
	MAX_DIMENSION,
	MAX_OBJECTS,
	newArtboard,
	newPath,
	type PathCommand,
	type Point,
	type VectorPath,
	type VectorProject,
} from "./model";

export const LEGACY_AI_HEADER_BYTES = 8192;
const decoder = new TextDecoder("windows-1252");
const number = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;
const pointLimit = 10_000_000;
const bodyLimit = 16 * 1024 * 1024;
const depthLimit = 64;

export function isLegacyIllustrator(bytes: Uint8Array): boolean {
	const header = decoder.decode(bytes.subarray(0, LEGACY_AI_HEADER_BYTES));
	return (
		header.startsWith("%!PS-Adobe-") &&
		/^%%Creator:[^\r\n]*\bIllustrator\(R\)[ \t]+8(?:\.\d+)?[ \t]*\r?$/im.test(
			header.replace(/\r(?!\n)/g, "\n"),
		)
	);
}

function unsupported(detail: string): never {
	throw new Error(
		`This Illustrator 8 file could not be imported as editable paths (${detail}). Save a PDF-compatible .ai copy in Illustrator.`,
	);
}

function rgb(channels: number[]): string {
	return (
		"#" +
		channels
			.map((channel) =>
				Math.round(channel * 255)
					.toString(16)
					.padStart(2, "0"),
			)
			.join("")
	);
}

function cmyk([c, m, y, k]: number[], strength = 1): string {
	return rgb([c, m, y].map((channel) => (1 - channel * strength) * (1 - k * strength)));
}

function bounds(header: string): number[] {
	const raw =
		header.match(/^%%HiResBoundingBox:[ \t]+([^\n]+)/m)?.[1] ??
		header.match(/^%%BoundingBox:[ \t]+([^\n]+)/m)?.[1];
	const coordinates = raw?.trim().split(/\s+/).map(Number);
	if (
		!coordinates ||
		coordinates.length !== 4 ||
		!coordinates.every((v) => Math.abs(v) <= pointLimit)
	)
		unsupported("missing or invalid artboard bounds");
	return coordinates;
}

const paint = /^(?:[fFsSbBnN])$/;
const operandCounts: Readonly<Record<string, number>> = {
	m: 2,
	l: 2,
	L: 2,
	c: 6,
	C: 6,
	v: 4,
	V: 4,
	y: 4,
	Y: 4,
	g: 1,
	G: 1,
	k: 4,
	K: 4,
	x: 6,
	X: 6,
	Xa: 7,
	XA: 7,
	w: 1,
	j: 1,
	J: 1,
	M: 1,
	d: 3,
	i: 1,
	XR: 1,
	A: 1,
	D: 1,
	O: 1,
	R: 1,
	Ln: 1,
	LB: 0,
	u: 0,
	U: 0,
	"*u": 0,
	"*U": 0,
	h: 0,
	H: 0,
};

export function readLegacyIllustrator(bytes: Uint8Array, signal?: AbortSignal): VectorProject {
	signal?.throwIfAborted();
	if (!isLegacyIllustrator(bytes)) unsupported("missing Illustrator 8 header");
	const text = decoder.decode(bytes).replace(/\r\n?/g, "\n");
	const start = /^%%EndSetup[ \t]*$/m.exec(text) ?? /^%%EndProlog[ \t]*$/m.exec(text);
	const end = /^%%(?:PageTrailer|Trailer|EOF)[ \t]*$/m.exec(text);
	if (!start || !end || end.index <= start.index || end.index - start.index > bodyLimit)
		unsupported("missing or oversized drawing section");

	const headerEnd = /^%%EndComments[ \t]*$/m.exec(text)?.index ?? start.index;
	const [left, bottom, right, top] = bounds(text.slice(0, headerEnd));
	const width = right - left;
	const height = top - bottom;
	if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION)
		unsupported("unsupported artboard dimensions");

	const board = newArtboard("Artboard 1", width, height);
	const groups: string[] = [];
	let layer: { name: string; hidden: boolean; locked: boolean } | undefined;
	let drawing = false;
	let objectLocked = false;
	let evenOdd = false;
	let fill = "#000000";
	let stroke = "#000000";
	let strokeWidth = 1;
	let strokeCap: VectorPath["strokeCap"] = 0;
	let strokeJoin: VectorPath["strokeJoin"] = 0;
	let miterLimit = 10;
	let dashed = false;
	let path: PathCommand[] = [];
	let from: Point | undefined;
	let first: Point | undefined;
	let compound: { commands: PathCommand[]; render?: string } | undefined;
	let commandCount = 0;

	function append(command: PathCommand): void {
		if (++commandCount > MAX_COMMANDS) unsupported("too many path commands");
		path.push(command);
	}

	function addObject(commands: PathCommand[], render: string): void {
		const locked = objectLocked || (layer?.locked ?? false);
		objectLocked = false;
		if (render.toLowerCase() === "n") return;
		const mode = render.toLowerCase();
		if (board.objects.length >= MAX_OBJECTS) unsupported("too many objects");
		if (mode !== "f" && dashed) unsupported("dashed strokes");
		board.objects.push({
			...newPath(
				layer?.name
					? `${layer.name} · Path ${board.objects.length + 1}`
					: `Path ${board.objects.length + 1}`,
				commands,
			),
			groupId: groups.at(-1),
			hidden: layer?.hidden ?? false,
			locked,
			fill: mode === "s" ? null : fill,
			stroke: mode === "f" ? null : stroke,
			strokeWidth,
			strokeJoin,
			strokeCap,
			miterLimit,
			fillRule: evenOdd ? "evenodd" : "nonzero",
		});
	}

	function finish(render: string): void {
		if (!from || !first) unsupported("paint without a path");
		if (["f", "b", "s"].includes(render) && path.at(-1)?.op !== "Z")
			append({ op: "Z", points: [] });
		if (compound) {
			for (const command of path) compound.commands.push(command);
			compound.render = render;
		} else {
			addObject(path, render);
		}
		path = [];
		first = from = undefined;
	}

	const body = text.slice(start.index + start[0].length, end.index);
	// Only tokenize the Illustrator drawing records. The prolog and setup are never evaluated.
	const token = /%[^\n]*|\s+|\((?:\\[\s\S]|[^()\\])*\)|[^\s%()[\]{}<>/]+|[\[\]]/gy;
	let cursor = 0;
	let pageCount = 0;
	let operands: string[] = [];
	while (cursor < body.length) {
		token.lastIndex = cursor;
		const word = token.exec(body)?.[0];
		if (!word) unsupported("unrecognized drawing syntax");
		cursor += word.length;
		if (word.startsWith("%")) {
			if (word.startsWith("%%Page:") && ++pageCount > 1) unsupported("multiple pages");
			if (/^%%(?:BeginData|BeginBinary|BeginDocument)\b/.test(word))
				unsupported("embedded PostScript data");
			continue;
		}
		if (!word.trim()) continue;
		if (number.test(word) || word.startsWith("(") || word === "[" || word === "]") {
			operands.push(word);
			if (operands.length > 64) unsupported("oversized operand list");
			continue;
		}

		const args = operands;
		operands = [];
		const values = args.map(Number);
		const expected = Object.hasOwn(operandCounts, word) ? operandCounts[word] : -1;
		if (
			!(word === "Lb" && [10, 13].includes(args.length)) &&
			!(word === "d" && args.length >= 3) &&
			!(paint.test(word) && args.length === 0) &&
			args.length !== expected
		)
			unsupported(`operator ${word.slice(0, 24)}`);
		const finite = (min: number, max: number, numbers = values) => {
			if (!numbers.every((value) => value >= min && value <= max))
				unsupported(`invalid numbers for ${word}`);
		};
		const flags = () => {
			if (values.some((value) => value !== 0 && value !== 1))
				unsupported(`invalid flag for ${word}`);
		};
		const point = (index: number): Point => [values[index] - left, top - values[index + 1]];

		if (paint.test(word)) {
			finish(word);
			continue;
		}
		switch (word) {
			case "m":
				finite(-pointLimit, pointLimit);
				drawing = true;
				append({ op: "M", points: [(first = from = point(0))] });
				break;
			case "l":
			case "L":
				if (!from) unsupported("line without a start point");
				finite(-pointLimit, pointLimit);
				append({ op: "L", points: [(from = point(0))] });
				break;
			case "c":
			case "C":
			case "v":
			case "V":
			case "y":
			case "Y": {
				if (!from) unsupported("curve without a start point");
				finite(-pointLimit, pointLimit);
				const shorthand = word.toLowerCase();
				const end = point(shorthand === "c" ? 4 : 2);
				const control1 = shorthand === "v" ? from : point(0);
				const control2 = shorthand === "y" ? end : point(shorthand === "v" ? 0 : 2);
				append({ op: "C", points: [control1, control2, end] });
				from = end;
				break;
			}
			case "h":
				if (!first) unsupported("close without a start point");
				append({ op: "Z", points: [] });
				from = first;
				break;
			case "H":
				break;
			case "*u":
				if (compound || path.length) unsupported("nested or unfinished compound path");
				compound = { commands: [] };
				break;
			case "*U":
				if (!compound?.render || path.length) unsupported("unfinished compound path");
				addObject(compound.commands, compound.render);
				compound = undefined;
				break;
			case "u":
				if (path.length || groups.length >= depthLimit) unsupported("invalid group start");
				groups.push(crypto.randomUUID());
				break;
			case "U":
				if (path.length || !groups.pop()) unsupported("invalid group end");
				break;
			case "Lb":
				if (layer || groups.length || path.length || compound)
					unsupported("invalid layer start");
				finite(-1, 255);
				if (values[5] !== 0) unsupported("layer masks");
				layer = { hidden: values[0] === 0, locked: values[2] === 0, name: "" };
				break;
			case "Ln":
				if (!layer || !args[0].startsWith("(")) unsupported("invalid layer name");
				layer.name = args[0].slice(1, -1).slice(0, 72);
				break;
			case "LB":
				if (!layer || groups.length || path.length || compound)
					unsupported("invalid layer end");
				layer = undefined;
				break;
			case "g":
			case "G":
			case "k":
			case "K":
			case "x":
			case "X":
			case "Xa":
			case "XA": {
				const spot = word.toLowerCase() === "x";
				if (spot && !args[4].startsWith("(")) unsupported("invalid spot color name");
				finite(0, 1, spot ? [...values.slice(0, 4), values[5]] : values);
				const color =
					word.length === 2
						? rgb(values.slice(4))
						: word.toLowerCase() === "g"
							? rgb([values[0], values[0], values[0]])
							: cmyk(values, spot ? 1 - values[5] : 1);
				if (word === "G" || word === "K" || word === "X" || word === "XA") stroke = color;
				else fill = color;
				break;
			}
			case "j":
			case "J":
				if (![0, 1, 2].includes(values[0])) unsupported("invalid stroke style");
				if (word === "J") strokeCap = values[0] as VectorPath["strokeCap"];
				else strokeJoin = values[0] as VectorPath["strokeJoin"];
				break;
			case "w":
				finite(0, 4096);
				strokeWidth = values[0];
				break;
			case "M":
				finite(1, 4096);
				miterLimit = values[0];
				break;
			case "d":
				if (args[0] !== "[" || args.at(-2) !== "]") unsupported("invalid dash pattern");
				finite(0, pointLimit, [...values.slice(1, -2), values.at(-1)!]);
				dashed = args.length > 3;
				break;
			case "XR":
				flags();
				evenOdd = values[0] === 1;
				break;
			case "A":
				flags();
				objectLocked = values[0] === 1;
				break;
			case "D":
			case "O":
			case "R":
				flags();
				break;
			case "i":
				finite(0, 100);
				break;
		}
	}
	if (
		operands.length ||
		layer ||
		groups.length ||
		compound ||
		path.length ||
		!drawing ||
		!board.objects.length
	)
		unsupported("incomplete drawing or no supported paths");
	const afterPage = text.slice(end.index + end[0].length);
	if (/^%%Page:/m.test(afterPage)) unsupported("multiple pages");
	return { version: 1, artboards: [board] };
}
