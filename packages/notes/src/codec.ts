import { DOMParser } from "@xmldom/xmldom";
import { Gunzip, gzipSync, strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
	createPage,
	inkWidth,
	LIMITS,
	uid,
	validateNotebook,
	type InkElement,
	type InkStroke,
	type Notebook,
	type PaperStyle,
} from "./model.js";
import { NOTES_MIME_TYPE } from "./formats.js";

export function writeNotebook(book: Notebook): Blob {
	validateNotebook(book);
	const content = strToU8(JSON.stringify(book));
	if (content.length > LIMITS.bytes) throw new Error("Notebook exceeds the 64 MB editing limit.");
	const bytes = zipSync({
		mimetype: [strToU8(NOTES_MIME_TYPE), { level: 0 }],
		"notebook.json": content,
	});
	return new Blob([bytes as BlobPart], { type: NOTES_MIME_TYPE });
}
export function readNotebook(bytes: Uint8Array, fileName = "Notebook"): Notebook {
	if (bytes.length > LIMITS.bytes) throw new Error("Notebook exceeds the 64 MB editing limit.");
	if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
		let entries = 0;
		const files = unzipSync(bytes, {
			filter: (entry) => {
				if (++entries > 20 || entry.originalSize > LIMITS.bytes)
					throw new Error("Invalid or oversized notebook archive.");
				return ["mimetype", "notebook.json", "content.xml"].includes(entry.name);
			},
		});
		if (
			files["content.xml"] &&
			(!files.mimetype || strFromU8(files.mimetype) !== NOTES_MIME_TYPE)
		)
			return readXopp(files["content.xml"], fileName.replace(/\.(xopp|xoj)$/i, ""));
		if (
			!files.mimetype ||
			strFromU8(files.mimetype) !== NOTES_MIME_TYPE ||
			!files["notebook.json"]
		)
			throw new Error("This is not a CubeOffice notebook archive.");
		return validateNotebook(JSON.parse(strFromU8(files["notebook.json"])));
	}
	return readXopp(bytes, fileName.replace(/\.(xopp|xoj)$/i, ""));
}
function inflate(bytes: Uint8Array): Uint8Array {
	if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
	const chunks: Uint8Array[] = [];
	let size = 0;
	const decoder = new Gunzip((chunk) => {
		size += chunk.length;
		if (size > LIMITS.bytes)
			throw new Error("Expanded notebook exceeds the 64 MB editing limit.");
		chunks.push(chunk);
	});
	for (let i = 0; i < bytes.length; i += 16384)
		decoder.push(bytes.subarray(i, i + 16384), i + 16384 >= bytes.length);
	const output = new Uint8Array(size);
	let position = 0;
	for (const chunk of chunks) {
		output.set(chunk, position);
		position += chunk.length;
	}
	return output;
}
const namedInk: Record<string, string> = {
	black: "#000000",
	blue: "#3333cc",
	red: "#ff0000",
	green: "#008000",
	gray: "#808080",
	lightblue: "#00c0ff",
	lightgreen: "#00ff00",
	magenta: "#ff00ff",
	orange: "#ff8000",
	yellow: "#ffff00",
	white: "#ffffff",
	pink: "#ffc0cb",
};
function inkColor(raw: string | null): { color: string; opacity: number } {
	const value = raw ?? "black";
	if (namedInk[value]) return { color: namedInk[value], opacity: 1 };
	if (!/^#[\da-f]{6}([\da-f]{2})?$/i.test(value)) throw new Error("Invalid Xournal ink color.");
	return {
		color: value.slice(0, 7).toLowerCase(),
		opacity: value.length === 9 ? parseInt(value.slice(7), 16) / 255 : 1,
	};
}
export function readXopp(bytes: Uint8Array, title = "Imported notebook"): Notebook {
	const xml = strFromU8(inflate(bytes));
	if (xml.length > LIMITS.bytes || /<!DOCTYPE|<!ENTITY/i.test(xml))
		throw new Error("Unsupported notebook XML.");
	const document = new DOMParser({
		onError: (_level, message) => {
			throw new Error(`Invalid notebook XML: ${message}`);
		},
	}).parseFromString(xml, "text/xml");
	const root = document.documentElement;
	if (!root || root.tagName !== "xournal") throw new Error("Expected a Xournal notebook.");
	const children = (node: typeof root) =>
		Array.from(node.childNodes).filter((n) => n.nodeType === 1) as (typeof root)[];
	const pages = children(root).filter((node) => node.tagName === "page");
	if (!pages.length || pages.length > LIMITS.pages)
		throw new Error("Invalid notebook page count.");
	let pointCount = 0;
	const book: Notebook = {
		format: "cubeoffice-notebook",
		version: 1,
		title,
		pages: pages.map((node) => {
			const background = children(node).find((n) => n.tagName === "background");
			if (!background || background.getAttribute("type") !== "solid")
				throw new Error(
					"Xournal PDF and image backgrounds are not supported yet. Open the original in Xournal++ and export a PDF.",
				);
			if (background.hasAttribute("config"))
				throw new Error("Custom Xournal paper configurations are not supported.");
			const styles: Record<string, PaperStyle> = {
				plain: "plain",
				lined: "ruled",
				ruled: "ruled",
				graph: "grid",
				dotted: "dotted",
			};
			const paper = styles[background.getAttribute("style") ?? "plain"];
			if (!paper) throw new Error("Unsupported Xournal paper style.");
			const page = createPage(
				paper,
				Number(node.getAttribute("width")),
				Number(node.getAttribute("height")),
				inkColor(background.getAttribute("color")).color,
			);
			page.layers = children(node)
				.filter((n) => n.tagName === "layer")
				.map((layer, i) => ({
					id: uid(),
					name: layer.getAttribute("name") ?? `Layer ${i + 1}`,
					visible: true,
					elements: children(layer).map((element): InkElement => {
						const color = inkColor(element.getAttribute("color"));
						if (element.tagName === "text") {
							for (const attribute of [
								"matrix",
								"wrap",
								"align",
								"justify",
								"audioFilename",
							])
								if (element.hasAttribute(attribute))
									throw new Error(
										`Unsupported Xournal text attribute: ${attribute}.`,
									);
							if (color.opacity !== 1)
								throw new Error("Translucent Xournal text is not supported.");
							return {
								id: uid(),
								kind: "text",
								x: Number(element.getAttribute("x")),
								y: Number(element.getAttribute("y")),
								text: element.textContent ?? "",
								color: color.color,
								size: Number(element.getAttribute("size")),
								font: element.getAttribute("font") ?? "sans-serif",
							};
						}
						if (
							element.tagName !== "stroke" ||
							!["pen", "highlighter"].includes(element.getAttribute("tool") ?? "")
						)
							throw new Error(
								`Unsupported Xournal content: ${element.tagName}. Import stopped to preserve your original file.`,
							);
						// These attributes change stroke rendering; rejecting prevents silent loss.
						for (const attribute of ["fill", "lineStyle", "style", "audioFilename"])
							if (element.hasAttribute(attribute))
								throw new Error(
									`Unsupported Xournal stroke attribute: ${attribute}.`,
								);
						if (
							element.hasAttribute("capStyle") &&
							element.getAttribute("capStyle") !== "round"
						)
							throw new Error("Unsupported Xournal stroke cap style.");
						const tool = element.getAttribute("tool") as InkStroke["tool"];
						const widths = (element.getAttribute("width") ?? "")
							.trim()
							.split(/\s+/)
							.map(Number);
						const coords = (element.textContent ?? "").trim().split(/\s+/).map(Number);
						if (
							coords.length < 4 ||
							coords.length % 2 ||
							!widths.length ||
							(widths.length !== 1 && widths.length !== coords.length / 2)
						)
							throw new Error("Invalid Xournal stroke coordinates or widths.");
						pointCount += coords.length / 2;
						if (pointCount > LIMITS.points)
							throw new Error("Too many notebook ink points.");
						if (tool === "highlighter" && widths.length > 1)
							throw new Error(
								"Variable-width Xournal highlighters are not supported.",
							);
						return {
							id: uid(),
							kind: "stroke",
							tool,
							color: color.color,
							opacity: tool === "highlighter" ? 0.5 : color.opacity,
							width: widths[0],
							pressure: false,
							points: Array.from({ length: coords.length / 2 }, (_, p) => ({
								x: coords[p * 2],
								y: coords[p * 2 + 1],
								pressure: 0.5,
								...(widths.length > 1 ? { width: widths[Math.max(1, p)] } : {}),
							})),
						};
					}),
				}));
			if (children(node).some((n) => !["background", "layer"].includes(n.tagName)))
				throw new Error("Unsupported Xournal page content.");
			return page;
		}),
	};
	return validateNotebook(book);
}
export const escapeXml = (text: string) =>
	text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
const decimal = (value: number) => Number(value.toFixed(4)).toString();
export function writeXopp(book: Notebook): Blob {
	validateNotebook(book);
	if (
		book.pages.some(
			(p) =>
				p.paper === "dotted" ||
				p.bookmarked ||
				Boolean(p.scenes?.length) ||
				p.layers.some((l) => !l.visible),
		)
	)
		throw new Error(
			"Xournal export cannot preserve dotted paper, bookmarks, scenes or hidden layers. Save as .cubenote to retain these settings.",
		);
	const pages = book.pages
		.map((page) => {
			const style = { plain: "plain", ruled: "ruled", grid: "graph", dotted: "plain" }[
				page.paper
			];
			const layers = page.layers
				.map(
					(layer) =>
						`<layer name="${escapeXml(layer.name)}">${layer.elements
							.map((element) => {
								if (element.kind === "text")
									return `<text font="${escapeXml(element.font ?? "sans-serif")}" size="${decimal(element.size)}" x="${decimal(element.x)}" y="${decimal(element.y)}" color="${element.color}ff">${escapeXml(element.text)}</text>`;
								const points =
									element.points.length === 1
										? [
												...element.points,
												{
													...element.points[0],
													x: element.points[0].x + 0.001,
												},
											]
										: element.points;
								const widths =
									element.tool === "highlighter"
										? [element.width]
										: [
												element.width,
												...points.slice(1).map((p) => inkWidth(element, p)),
											];
								const alpha = Math.round(element.opacity * 255)
									.toString(16)
									.padStart(2, "0");
								return `<stroke tool="${element.tool}" color="${element.color}${alpha}" width="${widths.map(decimal).join(" ")}">${points.flatMap((p) => [decimal(p.x), decimal(p.y)]).join(" ")}</stroke>`;
							})
							.join("")}</layer>`,
				)
				.join("");
			return `<page width="${decimal(page.width)}" height="${decimal(page.height)}"><background type="solid" color="${page.color}ff" style="${style}"/>${layers}</page>`;
		})
		.join("");
	const xml = `<?xml version="1.0" encoding="UTF-8"?><xournal version="0.4.8" fileversion="4" creator="CubeOffice"><title>${escapeXml(book.title)}</title>${pages}</xournal>`;
	const bytes = gzipSync(strToU8(xml));
	return new Blob([bytes as BlobPart], { type: "application/x-xopp" });
}
