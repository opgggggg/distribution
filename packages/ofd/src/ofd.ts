import { strokeScale, deviceLineWidth } from "./strokes.js";
import { describePackage, documentPath, readActions } from "./package.js";
import { paint } from "./paint.js";
import { matrix as getMatrix, multiply, inverse, identity, type Matrix } from "./geometry.js";
import { renderText, parseFont, type Font } from "./text.js";
import {
	Archive,
	attr,
	children,
	descendants,
	first,
	number,
	escapeXml as e,
	resolvePath,
	rasterMime,
	dataUri,
	svgPage,
	type XmlElement,
} from "./archive.js";
import {
	abort,
	type OfdDocument,
	type ReadOptions,
	type Diagnostic,
	type DocumentPage,
	type OfdHotspot,
} from "./types.js";
const MM = 96 / 25.4;
function values(value: string): number[] {
	return value
		.trim()
		.split(/\s+/)
		.map((v) => number(v));
}
function box(node: XmlElement): number[] {
	const v = values(attr(node, "Boundary"));
	return v.length === 4 ? v : [0, 0, 0, 0];
}
function ofdPath(value: string): string {
	const tokens = value.match(/[MSLQBCAZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/gi) ?? [];
	if (value.replace(/[MSLQBCAZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/gi, "").trim())
		throw new Error("Invalid OFD path.");
	const arities: Record<string, number> = { M: 2, S: 2, L: 2, Q: 4, B: 6, A: 7, C: 0, Z: 0 };
	const result: string[] = [];
	for (let i = 0; i < tokens.length;) {
		const command = tokens[i++].toUpperCase(),
			count = arities[command];
		if (count === undefined) throw new Error("Missing OFD path command.");
		const args = tokens.slice(i, i + count);
		if (args.length !== count || args.some((arg) => !Number.isFinite(Number(arg))))
			throw new Error("Invalid OFD path coordinates.");
		if (command === "A") {
			args[0] = String(Math.abs(Number(args[0])));
			args[1] = String(Math.abs(Number(args[1])));
			args[2] = String(Number(args[2]) % 360);
			if (!["0", "1"].includes(args[3]) || !["0", "1"].includes(args[4]))
				throw new Error("Invalid OFD arc flags.");
		}
		result.push(
			command === "B" ? "C" : command === "C" ? "Z" : command === "S" ? "M" : command,
			...args,
		);
		i += count;
	}
	return result.join(" ");
}
export interface Resources {
	images: Map<string, string>;
	fonts: Map<string, string>;
	fontData: Map<string, Font>;
	defaultColorSpace: string;
	options: ReadOptions;
	draw: Map<string, XmlElement>;
	colors: Map<string, XmlElement>;
	profiles: Map<string, Uint8Array>;
	composites: Map<string, XmlElement>;
	templates: Map<string, { path: string; zOrder: string }>;
	defs: string[];
}
function loadResources(
	archive: Archive,
	document: XmlElement,
	path: string,
	diagnostics: Diagnostic[],
	inherited?: Resources,
	options: ReadOptions = inherited?.options ?? {},
): Resources {
	const res: Resources = {
		images: new Map(inherited?.images),
		fonts: new Map(inherited?.fonts),
		fontData: new Map(inherited?.fontData),
		defaultColorSpace:
			first(document, "DefaultCS")?.textContent?.trim() ?? inherited?.defaultColorSpace ?? "",
		options,
		draw: new Map(inherited?.draw),
		colors: new Map(inherited?.colors),
		profiles: new Map(inherited?.profiles),
		composites: new Map(inherited?.composites),
		templates: new Map(inherited?.templates),
		defs: [...(inherited?.defs ?? [])],
	};
	for (const template of descendants(document, "TemplatePage"))
		res.templates.set(attr(template, "ID"), {
			path: resolvePath(path, attr(template, "BaseLoc")),
			zOrder: attr(template, "ZOrder", "Background"),
		});
	for (const ref of [
		...descendants(document, "PublicRes"),
		...descendants(document, "DocumentRes"),
		...descendants(document, "PageRes"),
	]) {
		const resourcePath = resolvePath(path, ref.textContent?.trim() || "");
		if (!archive.files[resourcePath]) {
			diagnostics.push({
				code: "ofd-resource",
				message: `Missing resource dictionary ${resourcePath}.`,
			});
			continue;
		}
		const root = archive.xml(resourcePath),
			base = attr(root, "BaseLoc");
		const resource = (name: string) =>
			resolvePath(
				resourcePath,
				name.startsWith("/") ? name : base ? `${base}/${name}` : name,
			);
		for (const media of descendants(root, "MultiMedia")) {
			if (attr(media, "Type", "Image") !== "Image") continue;
			const file = first(media, "MediaFile")?.textContent?.trim();
			if (!file) continue;
			const bytes = archive.files[resource(file)],
				mime = bytes && rasterMime(bytes);
			if (bytes && mime) res.images.set(attr(media, "ID"), dataUri(bytes, mime));
			else
				diagnostics.push({
					code: "ofd-media",
					message: `Unsupported or missing OFD media ${file}.`,
				});
		}
		for (const font of descendants(root, "Font")) {
			const id = attr(font, "ID"),
				name = attr(font, "FamilyName", attr(font, "FontName", "sans-serif"));
			const file = first(font, "FontFile")?.textContent?.trim();
			const bytes =
				options.fonts?.[id] ||
				options.fonts?.[name] ||
				(file && archive.files[resource(file)]);
			if (bytes) {
				try {
					res.fontData.set(id, parseFont(bytes));
				} catch {
					diagnostics.push({
						code: "ofd-font",
						message: `Cannot decode OpenType font ${name}.`,
					});
				}
				const family = `ofd-font-${res.defs.length}-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
				res.fonts.set(id, family);
				if (!res.fontData.has(id))
					res.defs.push(
						`<style>@font-face{font-family:'${family}';src:url('${dataUri(bytes, "font/ttf")}')}</style>`,
					);
			} else {
				res.fonts.set(id, name);
				if (file)
					diagnostics.push({
						code: "ofd-font",
						message: `Missing embedded font ${file}; using a system font.`,
					});
			}
		}
		for (const space of descendants(root, "ColorSpace")) {
			res.colors.set(attr(space, "ID"), space);
			const profile = attr(space, "Profile");
			if (profile) {
				const bytes = archive.files[resource(profile)];
				if (bytes) res.profiles.set(attr(space, "ID"), bytes);
				if (!bytes || !options.colorConverter)
					diagnostics.push({
						code: "ofd-icc",
						message: bytes
							? "ICC profile rendering requires a colorConverter host."
							: `Missing ICC profile ${profile}.`,
					});
			}
		}
		for (const composite of descendants(root, "CompositeGraphicUnit"))
			res.composites.set(attr(composite, "ID"), composite);
		for (const draw of descendants(root, "DrawParam")) res.draw.set(attr(draw, "ID"), draw);
	}
	return res;
}
export interface RenderContext {
	objects: number;
	clipId: number;
	generatedBytes: number;
	options: ReadOptions;
	hotspots: OfdHotspot[];
	pageBounds?: number[];
}
function drawChain(id: string, res: Resources): XmlElement[] {
	const chain: XmlElement[] = [],
		seen = new Set<string>();
	while (id) {
		if (seen.has(id)) throw new Error("Cyclic OFD DrawParam inheritance.");
		if (seen.size >= 64)
			throw new RangeError("OFD DrawParam inheritance exceeds the nesting budget.");
		seen.add(id);
		const draw = res.draw.get(id);
		if (!draw) break;
		chain.push(draw);
		id = attr(draw, "Relative");
	}
	return chain;
}
function objectSvg(
	node: XmlElement,
	res: Resources,
	text: string[],
	diagnostics: Diagnostic[],
	ctx: RenderContext,
	depth = 0,
	inherited: XmlElement[] = [],
	world: Matrix = identity,
): string {
	if (depth > 64) throw new RangeError("OFD object nesting exceeds the budget.");
	if (++ctx.objects > (ctx.options.maxObjects ?? 100000))
		throw new RangeError("Too many OFD objects.");
	abort(ctx.options.signal);
	if (attr(node, "Visible", "true") === "false") return "";
	const kind =
		node.localName === "Text"
			? "TextObject"
			: node.localName === "Path"
				? "PathObject"
				: node.localName;
	const styles = [node, ...drawChain(attr(node, "DrawParam"), res), ...inherited];
	const property = (name: string, fallback = "") => {
		for (const style of styles) if (style.hasAttribute(name)) return attr(style, name);
		return fallback;
	};
	const paintNode = (name: string) =>
		styles.map((style) => children(style, name)[0]).find(Boolean);
	if (!["TextObject", "PathObject", "ImageObject", "CompositeObject"].includes(kind ?? "")) {
		// Restrict traversal to drawing containers; resource/clip metadata is not page content.
		if (
			![
				"Page",
				"Content",
				"Layer",
				"PageBlock",
				"Appearance",
				"CellContent",
				"CompositeGraphicUnit",
			].includes(kind ?? "")
		)
			return "";
		return children(node)
			.map((child) =>
				objectSvg(
					child,
					res,
					text,
					diagnostics,
					ctx,
					depth + 1,
					kind === "Layer"
						? [...drawChain(attr(node, "DrawParam"), res), ...inherited]
						: inherited,
					world,
				),
			)
			.join("");
	}
	const actions = readActions(node);
	const [x, y, w, h] = box(node),
		matrix = values(attr(node, "CTM"));
	if (ctx.pageBounds && node.hasAttribute("Boundary")) {
		const [left, top, width, height] = ctx.pageBounds,
			corners = [
				[x, y],
				[x + w, y],
				[x, y + h],
				[x + w, y + h],
			].map(([a, b]) => [
				world[0] * a + world[2] * b + world[4],
				world[1] * a + world[3] * b + world[5],
			]);
		if (
			Math.max(...corners.map((p) => p[0])) <= left ||
			Math.min(...corners.map((p) => p[0])) >= left + width ||
			Math.max(...corners.map((p) => p[1])) <= top ||
			Math.min(...corners.map((p) => p[1])) >= top + height
		)
			return "";
	}
	const fillNode = paintNode("FillColor"),
		strokeNode = paintNode("StrokeColor");
	if (actions.length)
		for (const action of actions)
			ctx.hotspots.push({
				objectId: attr(node, "ID"),
				actions: [action],
				region: action.region ?? `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`,
				transform: multiply(world, [1, 0, 0, 1, x, y]),
			});
	const local = getMatrix(attr(node, "CTM")),
		toPage = multiply(world, multiply([1, 0, 0, 1, x, y], local));
	let bounds = [0, 0, w, h];
	if (w > 0 && h > 0) {
		if (Math.abs(local[0] * local[3] - local[1] * local[2]) < 1e-15) return "";
		const inv = inverse(local),
			points = [
				[0, 0],
				[w, 0],
				[0, h],
				[w, h],
			].map(([x, y]) => [inv[0] * x + inv[2] * y + inv[4], inv[1] * x + inv[3] * y + inv[5]]);
		const left = Math.min(...points.map((p) => p[0])),
			top = Math.min(...points.map((p) => p[1]));
		bounds = [
			left,
			top,
			Math.max(...points.map((p) => p[0])) - left,
			Math.max(...points.map((p) => p[1])) - top,
		];
	}
	const renderCell = (cell: XmlElement, cellWorld: Matrix) => {
		const cellContext = { ...ctx, pageBounds: undefined, hotspots: [] };
		const result = objectSvg(cell, res, [], diagnostics, cellContext, depth + 1, [], cellWorld);
		ctx.clipId = cellContext.clipId;
		ctx.objects = cellContext.objects;
		ctx.generatedBytes = cellContext.generatedBytes;
		return result;
	};
	const fill = paint(fillNode, "black", res, ctx, bounds, toPage, renderCell),
		stroke = paint(
			strokeNode,
			kind === "TextObject" ? "none" : "black",
			res,
			ctx,
			bounds,
			toPage,
			renderCell,
		);
	const alpha = (value: string) => Math.max(0, Math.min(255, number(value, 255))) / 255;
	const opacity = alpha(property("Alpha", "255"));
	const lineWidth = number(property("LineWidth"), 0.353),
		lineScale =
			strokeScale(toPage) *
			(kind === "TextObject" ? Math.min(1, Math.abs(number(attr(node, "HScale"), 1))) : 1),
		miterLength = number(property("MiterLimit"), 3.528),
		deviceWidth = deviceLineWidth(lineWidth, lineScale);
	const strokeAttributes = `data-ofd-line-width="${lineWidth}" data-ofd-stroke-scale="${lineScale}" data-ofd-miter-length="${miterLength}" stroke-width="${deviceWidth}" stroke-linecap="${({ Butt: "butt", Round: "round", Square: "square" } as Record<string, string>)[property("Cap")] ?? "butt"}" stroke-linejoin="${({ Miter: "miter", Round: "round", Bevel: "bevel" } as Record<string, string>)[property("Join")] ?? "miter"}" stroke-miterlimit="${Math.max(1, miterLength / deviceWidth)}"${property("DashPattern") ? ` stroke-dasharray="${values(property("DashPattern")).join(" ")}" stroke-dashoffset="${number(property("DashOffset"))}"` : ""}`;
	const paintAttributes = `fill-opacity="${alpha(fillNode ? attr(fillNode, "Alpha", "255") : "255")}" stroke-opacity="${alpha(strokeNode ? attr(strokeNode, "Alpha", "255") : "255")}"`;
	let content = "",
		borderSvg = "";
	if (kind === "TextObject") {
		content = renderText(
			node,
			res.fonts.get(attr(node, "Font")) ?? "sans-serif",
			res.fontData.get(attr(node, "Font")),
			{
				fill: property("Fill", "true") === "false" ? "none" : fill,
				stroke: property("Stroke", "false") === "true" ? stroke : "none",
				strokeAttributes,
				paintAttributes,
			},
			text,
			diagnostics,
			{
				glyphs: (ctx.options.maxObjects ?? 100000) - ctx.objects,
				bytes: (ctx.options.maxSvgBytes ?? 128 * 1024 * 1024) - ctx.generatedBytes,
			},
		);
	} else if (kind === "ImageObject") {
		const primary = res.images.get(attr(node, "ResourceID")),
			substitute = res.images.get(attr(node, "Substitution")),
			image = res.options.useImageSubstitutions
				? (substitute ?? primary)
				: (primary ?? substitute),
			iw = matrix.length === 6 ? 1 : w,
			ih = matrix.length === 6 ? 1 : h;
		if (image) {
			content = `<image href="${image}" width="${iw}" height="${ih}" preserveAspectRatio="none"/>`;
			const mask = res.images.get(attr(node, "ImageMask"));
			if (mask) {
				const id = `ofd-image-mask-${ctx.clipId++}`;
				res.defs.push(
					`<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${iw}" height="${ih}"><image href="${mask}" width="${iw}" height="${ih}" preserveAspectRatio="none"/></mask>`,
				);
				content = `<g mask="url(#${id})">${content}</g>`;
			} else if (attr(node, "ImageMask"))
				diagnostics.push({
					code: "ofd-image-mask",
					message: `Missing image mask ${attr(node, "ImageMask")}.`,
				});
		} else
			diagnostics.push({
				code: "ofd-image",
				message: `Missing image resource ${attr(node, "ResourceID")}.`,
			});
		const border = children(node, "Border")[0];
		if (border) {
			const color = paint(
				children(border, "BorderColor")[0],
				"black",
				res,
				ctx,
				[0, 0, w, h],
				multiply(world, [1, 0, 0, 1, x, y]),
				renderCell,
			);
			borderSvg = `<rect x="0" y="0" width="${w}" height="${h}" rx="${number(attr(border, "HorizonalCornerRadius"))}" ry="${number(attr(border, "VerticalCornerRadius"))}" fill="none" stroke="${color}" stroke-width="${number(attr(border, "LineWidth"), 0.353)}" stroke-dasharray="${attr(border, "DashPattern") ? values(attr(border, "DashPattern")).join(" ") : "none"}" stroke-dashoffset="${number(attr(border, "DashOffset"))}"/>`;
		}
	} else if (kind === "CompositeObject") {
		const unit = res.composites.get(attr(node, "ResourceID"));
		if (unit)
			content = objectSvg(
				unit,
				res,
				text,
				diagnostics,
				ctx,
				depth + 1,
				styles.slice(1),
				toPage,
			);
		else
			diagnostics.push({
				code: "ofd-composite",
				message: `Missing composite resource ${attr(node, "ResourceID")}.`,
			});
	} else {
		const path = children(node, "AbbreviatedData")[0]?.textContent || "";
		content = `<path d="${e(ofdPath(path))}" fill="${property("Fill", "false") === "true" ? fill : "none"}" fill-rule="${attr(node, "Rule") === "Even-Odd" ? "evenodd" : "nonzero"}" stroke="${property("Stroke", "true") === "false" ? "none" : stroke}" ${strokeAttributes} ${paintAttributes}/>`;
	}
	if (kind === "CompositeObject") {
		const unit = res.composites.get(attr(node, "ResourceID")),
			width = unit && number(attr(unit, "Width")),
			height = unit && number(attr(unit, "Height"));
		if (width && height)
			content = `<svg width="${width}" height="${height}" overflow="hidden">${content}</svg>`;
	}
	content = `<g transform="matrix(${local.join(" ")})">${content}</g>` + borderSvg;
	for (const clip of children(children(node, "Clips")[0] ?? node, "Clip")) {
		let shapes = "";
		for (const area of children(clip, "Area")) {
			const styles = drawChain(attr(area, "DrawParam"), res);
			for (const shape of children(area).filter(
				(n) => n.localName === "Path" || n.localName === "Text",
			))
				shapes += `<g transform="matrix(${getMatrix(attr(area, "CTM")).join(" ")})">${objectSvg(
					shape,
					res,
					[],
					diagnostics,
					ctx,
					depth + 1,
					styles,
					world,
				)
					.replace(/<text [^>]*fill="transparent"[^>]*>[\s\S]*?<\/text>/g, "")
					.replace(/(?:fill|stroke)="(?!none")[^"]*"/g, (value) =>
						value.startsWith("fill") ? 'fill="white"' : 'stroke="white"',
					)}</g>`;
		}
		const id = `ofd-clip-${ctx.clipId++}`;
		res.defs.push(
			`<mask id="${id}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" style="mask-type:alpha">${shapes}</mask>`,
		);
		content = `<g mask="url(#${id})">${content}</g>`;
	}
	if (node.hasAttribute("Boundary")) {
		if (w > 0 && h > 0) {
			const id = `ofd-boundary-${ctx.clipId++}`;
			res.defs.push(
				`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><rect width="${w}" height="${h}"/></clipPath>`,
			);
			content = `<g clip-path="url(#${id})">${content}</g>`;
		} else content = "";
	}
	const svg = `<g transform="translate(${x} ${y})" opacity="${opacity}">${content}</g>`;
	// Charge leaf output before joining a page so repeated embedded images cannot
	// allocate an unbounded intermediate string. Containers are checked at page end.
	if (kind !== "CompositeObject") {
		ctx.generatedBytes += new TextEncoder().encode(svg).byteLength;
		if (ctx.generatedBytes > (ctx.options.maxSvgBytes ?? 128 * 1024 * 1024))
			throw new RangeError("OFD SVG output exceeds the size budget.");
	}
	return svg;
}
function stampImage(bytes: Uint8Array): string | undefined {
	// SES seals contain a DER-encoded image OCTET STRING. Accept only an exact
	// DER payload with a recognised image signature, never arbitrary external data.
	for (let i = 0; i < bytes.length - 8; i++) {
		if (bytes[i] !== 4) continue;
		let n = bytes[i + 1],
			offset = i + 2;
		if (n & 128) {
			const count = n & 127;
			if (count < 1 || count > 4) continue;
			n = 0;
			for (let j = 0; j < count; j++) n = n * 256 + bytes[offset++];
		}
		if (n < 8 || offset + n > bytes.length) continue;
		const image = bytes.subarray(offset, offset + n),
			mime = rasterMime(image);
		if (mime) return dataUri(image, mime);
	}
	return undefined;
}
function stamps(archive: Archive, ofd: XmlElement, diagnostics: Diagnostic[]): Map<string, string> {
	const out = new Map<string, string>();
	for (const ref of descendants(ofd, "Signatures")) {
		const path = resolvePath("OFD.xml", ref.textContent?.trim() || ""),
			root = archive.xml(path);
		for (const sig of descendants(root, "Signature")) {
			const sigPath = resolvePath(path, attr(sig, "BaseLoc")),
				signature = archive.xml(sigPath);
			const sealElement = first(signature, "Seal");
			const seal =
				(sealElement && first(sealElement, "BaseLoc")?.textContent?.trim()) ||
				first(signature, "SignedValue")?.textContent?.trim();
			const bytes = seal && archive.files[resolvePath(sigPath, seal)];
			const image =
				bytes &&
				(rasterMime(bytes) ? dataUri(bytes, rasterMime(bytes)!) : stampImage(bytes));
			diagnostics.push({
				code: "signature-unverified",
				message:
					"Electronic signatures are not verified; conversion does not preserve signature validity.",
			});
			if (!image) {
				diagnostics.push({
					code: "ofd-seal",
					message: "The seal image could not be decoded.",
				});
				continue;
			}
			for (const stamp of descendants(signature, "StampAnnot")) {
				const [x, y, w, h] = box(stamp),
					id = attr(stamp, "PageRef");
				out.set(
					id,
					(out.get(id) || "") +
						(() => {
							const clip = values(attr(stamp, "Clip"));
							const seal = `<image href="${image}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"/>`;
							return clip.length === 4
								? `<svg x="${x + clip[0]}" y="${y + clip[1]}" width="${clip[2]}" height="${clip[3]}" viewBox="${x + clip[0]} ${y + clip[1]} ${clip[2]} ${clip[3]}" overflow="hidden">${seal}</svg>`
								: seal;
						})(),
				);
			}
		}
	}
	return out;
}
function annotations(
	archive: Archive,
	document: XmlElement,
	path: string,
	diagnostics: Diagnostic[],
): Map<string, XmlElement[]> {
	const result = new Map<string, XmlElement[]>();
	const reference = first(document, "Annotations")?.textContent?.trim();
	if (!reference) return result;
	const location = resolvePath(path, reference);
	if (!archive.files[location]) {
		diagnostics.push({
			code: "ofd-annotation",
			message: `Missing annotation index ${location}.`,
		});
		return result;
	}
	for (const page of children(archive.xml(location), "Page")) {
		const file = first(page, "FileLoc")?.textContent?.trim();
		if (!file) continue;
		result.set(
			attr(page, "PageID"),
			children(archive.xml(resolvePath(location, file)), "Annot"),
		);
	}
	return result;
}
export function readOfd(archive: Archive, options: ReadOptions): OfdDocument {
	const ofd = archive.xml("OFD.xml"),
		diagnostics: Diagnostic[] = [],
		pages: DocumentPage[] = [];
	if (ofd.localName !== "OFD") throw new Error("Invalid OFD root element.");
	const ctx: RenderContext = { objects: 0, clipId: 0, generatedBytes: 0, options, hotspots: [] };
	let svgBytes = 0;
	const bodies = children(ofd, "DocBody");
	if (
		options.documentIndex !== undefined &&
		(!Number.isInteger(options.documentIndex) ||
			options.documentIndex < 0 ||
			options.documentIndex >= bodies.length)
	)
		throw new RangeError("Document index is outside the OFD package.");
	for (const body of options.documentIndex === undefined
		? bodies
		: [bodies[options.documentIndex]]) {
		const sealMap = stamps(archive, body, diagnostics);
		const path = documentPath(archive, body, options.version);
		const document = archive.xml(path),
			res = loadResources(archive, document, path, diagnostics, undefined, options);
		const annotationMap = annotations(archive, document, path, diagnostics);
		const common = first(document, "CommonData"),
			defaultBox = common && first(common, "PhysicalBox")?.textContent;
		const pageList = children(document, "Pages")[0];
		if (!pageList) throw new Error("OFD document is missing its Pages element.");
		for (const pageRef of children(pageList, "Page")) {
			abort(options.signal);
			if (pages.length >= (options.maxPages ?? 1000))
				throw new RangeError("Too many OFD pages.");
			const diagnosticStart = diagnostics.length;
			ctx.hotspots = [];
			const pagePath = resolvePath(path, attr(pageRef, "BaseLoc")),
				page = archive.xml(pagePath);
			const pageRes = loadResources(archive, page, pagePath, diagnostics, res);
			const pageArea = children(page, "Area")[0];
			const area = values(
				(pageArea && first(pageArea, "PhysicalBox")?.textContent) ||
					defaultBox ||
					"0 0 210 297",
			);
			const [left, top, width, height] = area;
			if (area.length !== 4 || !(width > 0 && height > 0 && width < 10000 && height < 10000))
				throw new Error("Invalid OFD page dimensions.");
			ctx.pageBounds = area;
			const text: string[] = [];
			function renderPage(
				root: XmlElement,
				resources: Resources,
				stack: Set<string>,
			): string {
				const background: string[] = [],
					foreground: string[] = [];
				for (const template of children(root, "Template")) {
					const definition = resources.templates.get(attr(template, "TemplateID"));
					const tp = definition?.path;
					if (!tp) {
						diagnostics.push({
							code: "ofd-template",
							message: `Missing template ${attr(template, "TemplateID")}.`,
						});
						continue;
					}
					if (stack.has(tp) || stack.size >= 64)
						throw new Error("Cyclic or excessively nested OFD template.");
					const templateRoot = archive.xml(tp),
						templateRes = loadResources(
							archive,
							templateRoot,
							tp,
							diagnostics,
							resources,
						);
					stack.add(tp);
					const svg = renderPage(templateRoot, templateRes, stack);
					stack.delete(tp);
					resources.defs.push(...templateRes.defs.slice(resources.defs.length));
					(attr(template, "ZOrder", definition?.zOrder) === "Foreground"
						? foreground
						: background
					).push(svg);
				}
				return (
					background.join("") +
					objectSvg(root, resources, text, diagnostics, ctx) +
					foreground.join("")
				);
			}
			let content = renderPage(page, pageRes, new Set([pagePath]));
			for (const annot of annotationMap.get(attr(pageRef, "ID")) ?? []) {
				if (
					attr(annot, "Visible", "true") === "false" ||
					(options.intent === "print" && attr(annot, "Print", "true") === "false")
				)
					continue;
				const appearance = children(annot, "Appearance")[0];
				if (!appearance) {
					diagnostics.push({
						code: "ofd-annotation",
						message: "An annotation has no drawable appearance.",
					});
					continue;
				}
				const [x, y] = box(appearance);
				content += `<g transform="translate(${x} ${y})">${objectSvg(appearance, pageRes, text, diagnostics, ctx, 0, [], [1, 0, 0, 1, x, y])}</g>`;
			}
			content += sealMap.get(attr(pageRef, "ID")) || "";
			const svg = svgPage(
				width * MM,
				height * MM,
				`<g transform="scale(${MM}) translate(${-left} ${-top})">${content}</g>`,
				pageRes.defs.join(""),
			);
			svgBytes += new TextEncoder().encode(svg).byteLength;
			if (svgBytes > (options.maxSvgBytes ?? 128 * 1024 * 1024))
				throw new RangeError("OFD SVG output exceeds the size budget.");
			for (let i = diagnosticStart; i < diagnostics.length; i++)
				diagnostics[i].page ??= pages.length;
			pages.push({
				name: `Page ${pages.length + 1}`,
				id: attr(pageRef, "ID"),
				documentIndex: bodies.indexOf(body),
				origin: [left, top],
				actions: readActions(page),
				hotspots: [...ctx.hotspots],
				width: width * MM,
				height: height * MM,
				text: text.join("\n"),
				svg,
			});
		}
	}
	if (!pages.length) throw new Error("OFD document contains no pages.");
	const text = pages.map((page) => page.text).join("\n\f\n");
	return {
		format: "ofd",
		documents: describePackage(archive, options),
		pages,
		sheets: [],
		text,
		html: pages.map((page) => `<section>${page.svg}</section>`).join(""),
		markdown: text,
		diagnostics,
	};
}
