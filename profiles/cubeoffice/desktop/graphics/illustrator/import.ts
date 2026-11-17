import { encodeGraphicsPng, probeGraphicsSource } from "@cubexp/graphics";
import { loadPdf } from "@yaochn/als-office-pdf";
import workerUrl from "@yaochn/als-office-pdf/pdf.worker.min.mjs?url";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString } from "pdf-lib";
import { OPS, type PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
	COLOR,
	IDENTITY,
	MAX_BOARDS,
	MAX_COMMANDS,
	MAX_DIMENSION,
	MAX_OBJECTS,
	MAX_PROJECT_BYTES,
	multiply,
	newArtboard,
	newPath,
	parseVectorProject,
	transformPoint,
	type Matrix,
	type PathCommand,
	type Point,
	type VectorPath,
	type VectorProject,
} from "./model";

import { isLegacyIllustrator, readLegacyIllustrator } from "./legacy-ai";

export const PROJECT_KEY = "CubeOfficeVector";
export const MAX_INPUT_BYTES = 128 * 1024 * 1024;

export function requireIllustratorSource(bytes: Uint8Array): void {
	if (probeGraphicsSource(bytes) !== "pdf" && !isLegacyIllustrator(bytes)) {
		throw new Error(
			"Save this .ai file in Illustrator with Create PDF Compatible File enabled.",
		);
	}
}

interface PaintState {
	matrix: Matrix;
	fill: string;
	stroke: string;
	fillAlpha: number;
	strokeAlpha: number;
	strokeWidth: number;
	strokeCap: 0 | 1 | 2;
	strokeJoin: 0 | 1 | 2;
	miterLimit: number;
}

function decodePath(raw: unknown): PathCommand[] | null {
	if (!ArrayBuffer.isView(raw) && !Array.isArray(raw)) return null;
	const data = raw as ArrayLike<number>;
	const commands: PathCommand[] = [];
	let from: Point = [0, 0],
		start: Point = from;
	for (let index = 0; index < data.length; ) {
		if (commands.length >= MAX_COMMANDS) return null;
		const op = data[index++];
		const count = [2, 2, 6, 4, 0][op];
		if (count === undefined || index + count > data.length) return null;
		const values = Array.from({ length: count }, (_, i) => data[index + i]);
		if (!values.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e7)) return null;
		const [x, y, u, v, w, z] = values;
		index += count;
		switch (op) {
			case 0:
				from = start = [x, y];
				commands.push({ op: "M", points: [from] });
				break;
			case 1:
				from = [x, y];
				commands.push({ op: "L", points: [from] });
				break;
			case 2:
				from = [w, z];
				commands.push({ op: "C", points: [[x, y], [u, v], from] });
				break;
			case 3: {
				const c1: Point = [(from[0] + 2 * x) / 3, (from[1] + 2 * y) / 3];
				const c2: Point = [(u + 2 * x) / 3, (v + 2 * y) / 3];
				from = [u, v];
				commands.push({ op: "C", points: [c1, c2, from] });
				break;
			}
			case 4:
				commands.push({ op: "Z", points: [] });
				from = start;
				break;
		}
	}
	return commands[0]?.op === "M" ? commands : null;
}

const paintOperators = new Map<number, { fill: boolean; stroke: boolean; evenOdd?: boolean }>([
	[OPS.fill, { fill: true, stroke: false }],
	[OPS.eoFill, { fill: true, stroke: false, evenOdd: true }],
	[OPS.stroke, { fill: false, stroke: true }],
	[OPS.closeStroke, { fill: false, stroke: true }],
	[OPS.fillStroke, { fill: true, stroke: true }],
	[OPS.eoFillStroke, { fill: true, stroke: true, evenOdd: true }],
	[OPS.closeFillStroke, { fill: true, stroke: true }],
	[OPS.closeEOFillStroke, { fill: true, stroke: true, evenOdd: true }],
]);

interface PdfLayer {
	name: string;
	visible: boolean;
}
function pdfLayers(document: PDFDocument): Map<string, PdfLayer> {
	const layers = new Map<string, PdfLayer>();
	const name = PDFName.of;
	const properties = document.catalog.lookup(name("OCProperties"));
	if (!(properties instanceof PDFDict)) return layers;
	const defaults = properties.lookup(name("D"));
	const groups = properties.lookup(name("OCGs"));
	if (!(defaults instanceof PDFDict) || !(groups instanceof PDFArray)) return layers;
	// Usage-based auto state can change visibility with PDF display intent.
	const automatic = defaults.lookup(name("AS"));
	if (automatic && (!(automatic instanceof PDFArray) || automatic.size())) return layers;
	const base = defaults.lookup(name("BaseState"));
	if (base && base !== name("ON") && base !== name("OFF")) return layers;
	const layerId = (ref: PDFRef) => `${ref.objectNumber}R${ref.generationNumber || ""}`;
	const refs = (key: string) => {
		const values = defaults.lookup(name(key));
		return new Set(
			values instanceof PDFArray
				? values
						.asArray()
						.filter((entry): entry is PDFRef => entry instanceof PDFRef)
						.map(layerId)
				: [],
		);
	};
	const on = refs("ON"),
		off = refs("OFF");
	for (const ref of groups.asArray()) {
		if (!(ref instanceof PDFRef)) continue;
		const group = document.context.lookup(ref);
		if (!(group instanceof PDFDict)) continue;
		const title = group.lookup(name("Name"));
		const id = layerId(ref);
		if (on.has(id) && off.has(id)) continue;
		layers.set(id, {
			name:
				title instanceof PDFString || title instanceof PDFHexString
					? title.decodeText().slice(0, 100)
					: "",
			visible: on.has(id) || (base !== name("OFF") && !off.has(id)),
		});
	}
	return layers;
}

function isPageClip(
	commands: PathCommand[],
	matrix: Matrix,
	width: number,
	height: number,
): boolean {
	if (commands.length !== 5 || commands[0].op !== "M" || commands[4].op !== "Z") return false;
	const corners: Point[] = [
		[0, 0],
		[width, 0],
		[width, height],
		[0, height],
	];
	const indices = commands.slice(0, 4).map((command, index) => {
		if (index !== 0 && command.op !== "L") return -1;
		const point = command.points[0];
		if (!point) return -1;
		const [x, y] = transformPoint(matrix, point);
		return corners.findIndex(
			([cx, cy]) => Math.abs(cx - x) < 0.001 && Math.abs(cy - y) < 0.001,
		);
	});
	return (
		new Set(indices).size === 4 &&
		indices.every((index, i) => index >= 0 && Math.abs(index - indices[(i + 1) % 4]) % 2 === 1)
	);
}

/** Reconstruct a page only if its entire painting program maps to editable paths. */
async function editablePagePaths(
	page: PDFPageProxy,
	layers: Map<string, PdfLayer>,
): Promise<VectorPath[] | null> {
	const list = await page.getOperatorList({ annotationMode: 0 });
	if (list.fnArray.length > MAX_COMMANDS) return null;
	if ((await page.getAnnotations({ intent: "display" })).length > 0) return null;
	const viewport = page.getViewport({ scale: 1 });
	const stack: PaintState[] = [];
	let state: PaintState = {
		matrix: [...IDENTITY],
		fill: "#000000",
		stroke: "#000000",
		fillAlpha: 1,
		strokeAlpha: 1,
		strokeWidth: 1,
		strokeCap: 0,
		strokeJoin: 0,
		miterLimit: 10,
	};
	const paths: VectorPath[] = [];
	const marked: PdfLayer[] = [];
	let pendingClip = false;
	let commandsTotal = 0;
	for (let i = 0; i < list.fnArray.length; i++) {
		const op = list.fnArray[i],
			args = list.argsArray[i] ?? [];
		if (pendingClip && op !== OPS.constructPath) return null;
		switch (op) {
			case OPS.save:
				if (stack.length > 128) return null;
				stack.push({ ...state });
				break;
			case OPS.restore: {
				const previous = stack.pop();
				if (!previous) return null;
				state = previous;
				break;
			}
			case OPS.transform:
				if (args.length !== 6 || !args.every(Number.isFinite)) return null;
				state.matrix = multiply(state.matrix, args as Matrix);
				break;
			case OPS.setFillRGBColor:
			case OPS.setStrokeRGBColor:
				if (typeof args[0] !== "string" || !COLOR.test(args[0])) return null;
				if (op === OPS.setFillRGBColor) state.fill = args[0];
				else state.stroke = args[0];
				break;
			case OPS.setLineWidth:
				if (!Number.isFinite(args[0]) || args[0] < 0 || args[0] > 4096) return null;
				state.strokeWidth = args[0];
				break;
			case OPS.setGState:
				for (const [key, value] of args[0] ?? []) {
					if (key === "ca" || key === "CA") {
						if (!Number.isFinite(value) || value < 0 || value > 1) return null;
						state[key === "ca" ? "fillAlpha" : "strokeAlpha"] = value;
					} else if (
						!(key === "BM" && value === "source-over") &&
						!(key === "SMask" && value === false)
					)
						return null;
				}
				break;
			case OPS.setLineCap:
			case OPS.setLineJoin:
				if (args[0] !== 0 && args[0] !== 1 && args[0] !== 2) return null;
				state[op === OPS.setLineCap ? "strokeCap" : "strokeJoin"] = args[0];
				break;
			case OPS.setMiterLimit:
				if (!Number.isFinite(args[0]) || args[0] < 1 || args[0] > 4096) return null;
				state.miterLimit = args[0];
				break;
			case OPS.clip:
			case OPS.eoClip:
				pendingClip = true;
				break;
			case OPS.beginMarkedContent:
				marked.push({ name: "", visible: true });
				break;
			case OPS.beginMarkedContentProps: {
				const group = args[1];
				const layer = group?.type === "OCG" ? layers.get(group.id) : undefined;
				if (args[0] !== "OC" || !layer) return null;
				marked.push(layer);
				break;
			}
			case OPS.endMarkedContent:
				if (!marked.pop()) return null;
				break;
			case OPS.setDash:
				if (args[0]?.length) return null;
				break;
			case OPS.constructPath: {
				const matrix = multiply(viewport.transform as Matrix, state.matrix);
				if (pendingClip) {
					const clip = decodePath(args[1]?.[0]);
					if (!clip || !isPageClip(clip, matrix, viewport.width, viewport.height))
						return null;
					pendingClip = false;
				}
				if (args[0] === OPS.endPath) break;
				const paint = paintOperators.get(args[0]);
				const commands = decodePath(args[1]?.[0]);
				if (
					!paint ||
					!commands ||
					paths.length >= MAX_OBJECTS ||
					(paint.stroke && state.strokeWidth === 0)
				)
					return null;
				if (
					[OPS.closeStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].some(
						(id) => id === args[0],
					)
				)
					commands.push({ op: "Z", points: [] });
				commandsTotal += commands.length;
				if (commandsTotal > MAX_COMMANDS) return null;
				if (!matrix.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e7)) return null;
				paths.push({
					...newPath(
						`${marked.findLast((layer) => layer.name)?.name ? marked.findLast((layer) => layer.name)!.name + " · " : ""}Path ${paths.length + 1}`,
						commands,
					),
					hidden: marked.some((layer) => !layer.visible),
					matrix,
					fill: paint.fill ? state.fill : null,
					stroke: paint.stroke ? state.stroke : null,
					fillAlpha: state.fillAlpha,
					strokeAlpha: state.strokeAlpha,
					strokeWidth: state.strokeWidth,
					strokeCap: state.strokeCap,
					strokeJoin: state.strokeJoin,
					miterLimit: state.miterLimit,
					fillRule: paint.evenOdd ? "evenodd" : "nonzero",
				});
				break;
			}
			case OPS.dependency:
			case OPS.setRenderingIntent:
			case OPS.setFlatness:
				break;
			default:
				return null;
		}
	}
	return stack.length || marked.length || pendingClip ? null : paths;
}

async function lockedBackground(
	page: PDFPageProxy,
	width: number,
	height: number,
	signal?: AbortSignal,
) {
	const viewport = page.getViewport({ scale: Math.min(2, 2048 / Math.max(width, height)) });
	const canvas = document.createElement("canvas");
	canvas.width = Math.ceil(viewport.width);
	canvas.height = Math.ceil(viewport.height);
	const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
	if (!context) throw new Error("Unable to render the locked artboard.");
	const task = page.render({ canvas, canvasContext: context, viewport });
	const cancel = () => task.cancel();
	signal?.addEventListener("abort", cancel, { once: true });
	try {
		signal?.throwIfAborted();
		await task.promise;
		signal?.throwIfAborted();
		const png = encodeGraphicsPng(
			context.getImageData(0, 0, canvas.width, canvas.height).data,
			canvas.width,
			canvas.height,
		);
		let binary = "";
		for (let index = 0; index < png.length; index += 16_384)
			binary += String.fromCharCode(...png.subarray(index, index + 16_384));
		return btoa(binary);
	} finally {
		signal?.removeEventListener("abort", cancel);
		canvas.width = canvas.height = 0;
	}
}

export async function isCubeOfficeVectorFile(bytes: Uint8Array): Promise<boolean> {
	if (bytes.length > MAX_INPUT_BYTES || probeGraphicsSource(bytes) !== "pdf") return false;
	try {
		const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
		return pdf.catalog.lookup(PDFName.of(PROJECT_KEY)) instanceof PDFHexString;
	} catch {
		return false;
	}
}

export async function openVectorProject(
	bytes: Uint8Array,
	signal?: AbortSignal,
): Promise<{ project: VectorProject; native: boolean }> {
	if (bytes.length > MAX_INPUT_BYTES)
		throw new Error("This Illustrator file exceeds the 128 MiB editing limit.");
	if (isLegacyIllustrator(bytes))
		return { project: readLegacyIllustrator(bytes, signal), native: false };
	requireIllustratorSource(bytes);
	const container = await PDFDocument.load(bytes, { updateMetadata: false });
	const embedded = container.catalog.lookup(PDFName.of(PROJECT_KEY));
	if (embedded) {
		if (!(embedded instanceof PDFHexString))
			throw new Error("The CubeOffice vector project is invalid.");
		// PDFHexString.decodeText spreads all UTF-16 code points into a single
		// function call. Use a streaming decoder for CubeOffice's UTF-16BE data.
		const data = embedded.asBytes();
		const serialized =
			data[0] === 0xfe && data[1] === 0xff
				? new TextDecoder("utf-16be").decode(data)
				: embedded.decodeText();
		return { project: parseVectorProject(serialized), native: true };
	}
	if (container.getPageCount() > MAX_BOARDS)
		throw new Error(`This file has more than ${MAX_BOARDS} artboards.`);
	const layers = pdfLayers(container);
	const pdf = await loadPdf(bytes, { workerSrc: workerUrl, signal });
	try {
		const permissions = await pdf.getPermissions();
		if (!permissions.copy || !permissions.print)
			throw new Error("This file restricts editing or export.");
		const project: VectorProject = { version: 1, artboards: [] };
		let backgroundBytes = 0,
			objects = 0,
			commands = 0;
		for (let index = 1; index <= pdf.pageCount; index++) {
			signal?.throwIfAborted();
			const page = await pdf.getPageProxy(index);
			const { width, height } = page.getViewport({ scale: 1 });
			if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION)
				throw new Error("An artboard has unsupported dimensions.");
			const board = newArtboard(`Artboard ${index}`, width, height);
			const paths = await editablePagePaths(page, layers);
			if (paths !== null) {
				board.objects = paths;
				objects += paths.length;
				commands += paths.reduce((sum, path) => sum + path.commands.length, 0);
				if (objects > MAX_OBJECTS || commands > MAX_COMMANDS)
					throw new Error("The file exceeds the vector editing budget.");
			} else {
				board.background = await lockedBackground(page, width, height, signal);
				backgroundBytes += board.background.length;
				if (backgroundBytes > MAX_PROJECT_BYTES / 2)
					throw new Error("The locked artboards exceed the rendering budget.");
			}
			project.artboards.push(board);
			page.cleanup();
		}
		if (!project.artboards.length) throw new Error("The file contains no artboards.");
		return { project, native: false };
	} finally {
		await pdf.destroy();
	}
}
