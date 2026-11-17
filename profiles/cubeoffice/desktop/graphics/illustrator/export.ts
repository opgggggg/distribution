import {
	PDFDocument,
	PDFHexString,
	PDFName,
	PDFNumber,
	PDFOperator,
	PDFOperatorNames,
	StandardFonts,
	appendBezierCurve,
	closePath,
	concatTransformationMatrix,
	endPath,
	fill,
	fillAndStroke,
	lineTo,
	moveTo,
	popGraphicsState,
	pushGraphicsState,
	rgb,
	setFillingRgbColor,
	setGraphicsState,
	setLineWidth,
	setLineCap,
	setLineJoin,
	setStrokingRgbColor,
	stroke,
	type PDFPage,
	type PDFFont,
} from "pdf-lib";
import { rasterizePdfFirstPage } from "../output";
import { MAX_INPUT_BYTES, PROJECT_KEY } from "./import";
import {
	isObjectHidden,
	parseVectorProject,
	pathData,
	type Artboard,
	type VectorObject,
	type VectorPath,
	type VectorProject,
	type VectorText,
} from "./model";

export type VectorExportFormat = "ai" | "pdf" | "png" | "svg";

function toRgb(hex: string): [number, number, number] {
	const value = Number.parseInt(hex.slice(1), 16);
	return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function paintPath(page: PDFPage, object: VectorPath) {
	const {
		fill: fillColor,
		stroke: strokeColor,
		fillAlpha,
		strokeAlpha,
		strokeWidth,
		fillRule,
	} = object;
	if (!fillColor && !strokeColor) return;
	if (fillAlpha !== 1 || strokeAlpha !== 1) {
		const context = page.doc.context;
		const state = context.register(
			context.obj({ Type: "ExtGState", ca: fillAlpha, CA: strokeAlpha }),
		);
		page.pushOperators(setGraphicsState(page.node.newExtGState("Art", state)));
	}
	if (fillColor) page.pushOperators(setFillingRgbColor(...toRgb(fillColor)));
	if (strokeColor)
		page.pushOperators(
			setStrokingRgbColor(...toRgb(strokeColor)),
			setLineWidth(strokeWidth),
			setLineCap(object.strokeCap),
			setLineJoin(object.strokeJoin),
			PDFOperator.of(PDFOperatorNames.SetLineMiterLimit, [PDFNumber.of(object.miterLimit)]),
		);
	for (const command of object.commands) {
		if (command.op === "Z") page.pushOperators(closePath());
		else if (command.op === "M") page.pushOperators(moveTo(...command.points[0]));
		else if (command.op === "L") page.pushOperators(lineTo(...command.points[0]));
		else {
			const [a, b, c] = command.points;
			page.pushOperators(appendBezierCurve(...a, ...b, ...c));
		}
	}
	const paint =
		fillColor && strokeColor && strokeWidth > 0
			? fillRule === "evenodd"
				? PDFOperator.of(PDFOperatorNames.FillEvenOddAndStroke)
				: fillAndStroke()
			: fillColor
				? fillRule === "evenodd"
					? PDFOperator.of(PDFOperatorNames.FillEvenOdd)
					: fill()
				: strokeWidth > 0
					? stroke()
					: endPath();
	page.pushOperators(paint);
}

async function paintText(page: PDFPage, font: PDFFont, object: VectorText) {
	if (!object.fill || !object.text) return;
	const { text, size, fill: color, fillAlpha } = object;
	page.pushOperators(concatTransformationMatrix(1, 0, 0, -1, 0, 0));
	try {
		font.encodeText(text);
	} catch {
		// Keep Unicode text editable in the project and SVG. The PDF appearance
		// uses the browser's font fallback when the built-in PDF face lacks a glyph.
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Unable to render the text object.");
		const face = `${size}px Arial, sans-serif`;
		context.font = face;
		const metrics = context.measureText(text);
		const width = Math.ceil(metrics.width) + 4;
		const ascent = Math.ceil(metrics.actualBoundingBoxAscent) + 2;
		const height = ascent + Math.ceil(metrics.actualBoundingBoxDescent) + 2;
		const density = Math.min(2, 4096 / width, 4096 / height);
		canvas.width = Math.ceil(width * density);
		canvas.height = Math.ceil(height * density);
		context.scale(density, density);
		context.font = face;
		context.fillStyle = color;
		context.globalAlpha = fillAlpha;
		context.fillText(text, 2, ascent);
		const png = await page.doc.embedPng(canvas.toDataURL("image/png"));
		page.drawImage(png, { x: -2, y: ascent - height, width, height });
		return;
	}
	page.drawText(text, {
		x: 0,
		y: 0,
		size,
		font,
		color: rgb(...toRgb(color)),
		opacity: fillAlpha,
	});
}

async function writePdf(
	project: VectorProject,
	title: string,
	editable: boolean,
	signal?: AbortSignal,
) {
	const pdf = await PDFDocument.create();
	pdf.setTitle(title);
	pdf.setCreator("CubeOffice");
	const font = await pdf.embedFont(StandardFonts.Helvetica);
	for (const board of project.artboards) {
		signal?.throwIfAborted();
		const page = pdf.addPage([board.width, board.height]);
		if (board.background) {
			const image = await pdf.embedPng(board.background);
			page.drawImage(image, { x: 0, y: 0, width: board.width, height: board.height });
		}
		for (const object of board.objects) {
			if (isObjectHidden(board, object)) continue;
			page.pushOperators(
				pushGraphicsState(),
				concatTransformationMatrix(1, 0, 0, -1, 0, board.height),
				concatTransformationMatrix(...object.matrix),
			);
			if (object.kind === "path") paintPath(page, object);
			else await paintText(page, font, object);
			page.pushOperators(popGraphicsState());
		}
	}
	if (editable) {
		const serialized = JSON.stringify(project);
		parseVectorProject(serialized);
		pdf.catalog.set(PDFName.of(PROJECT_KEY), PDFHexString.fromText(serialized));
	}
	const bytes = await pdf.save({ useObjectStreams: !editable });
	signal?.throwIfAborted();
	if (editable && bytes.length > MAX_INPUT_BYTES)
		throw new Error("The saved project exceeds the editing budget.");
	return new Blob([new Uint8Array(bytes)], {
		type: editable ? "application/illustrator" : "application/pdf",
	});
}

function xml(value: string): string {
	return value.replace(
		/[&<>"']/g,
		(character) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!,
	);
}

function svgObject(object: VectorObject): string {
	const attrs = `transform="matrix(${object.matrix.join(" ")})" fill="${object.fill ?? "none"}" fill-opacity="${object.fillAlpha}"`;
	if (object.kind === "text")
		return `<text ${attrs} font-family="Arial, sans-serif" font-size="${object.size}">${xml(object.text)}</text>`;
	return `<path ${attrs} d="${pathData(object.commands)}" fill-rule="${object.fillRule}" stroke="${object.stroke ?? "none"}" stroke-opacity="${object.strokeAlpha}" stroke-width="${object.strokeWidth}" stroke-linecap="${["butt", "round", "square"][object.strokeCap]}" stroke-linejoin="${["miter", "round", "bevel"][object.strokeJoin]}" stroke-miterlimit="${object.miterLimit}"/>`;
}

function writeSvg(board: Artboard): Blob {
	const background = board.background
		? `<image width="${board.width}" height="${board.height}" href="data:image/png;base64,${board.background}"/>`
		: "";
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${board.width}" height="${board.height}" viewBox="0 0 ${board.width} ${board.height}"><title>${xml(board.name)}</title>${background}${board.objects
		.filter((object) => !isObjectHidden(board, object))
		.map(svgObject)
		.join("")}</svg>`;
	return new Blob([svg], { type: "image/svg+xml" });
}

export async function exportVectorProject(
	project: VectorProject,
	title: string,
	format: string,
	activeBoard = 0,
	signal?: AbortSignal,
): Promise<Blob> {
	signal?.throwIfAborted();
	if (format === "svg") return writeSvg(project.artboards[activeBoard]);
	if (format === "png") {
		const board = { ...project, artboards: [project.artboards[activeBoard]] };
		return rasterizePdfFirstPage(await writePdf(board, title, false, signal), signal);
	}
	if (format !== "ai" && format !== "pdf")
		throw new Error(`Unsupported Illustrator export format: ${format}`);
	return writePdf(project, title, format === "ai", signal);
}
