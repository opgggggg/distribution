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
function color(node: XmlElement | undefined, fallback: string): string {
	if (!node) return fallback;
	const v = values(attr(node, "Value"));
	if (v.length === 1) return `rgb(${v[0]},${v[0]},${v[0]})`;
	if (v.length === 3) return `rgb(${v.join(",")})`;
	if (v.length === 4)
		return `rgb(${v
			.slice(0, 3)
			.map((x) => Math.round(255 * (1 - x) * (1 - v[3])))
			.join(",")})`;
	return fallback;
}
function deltas(value: string, limit: number): number[] {
	if (!value) return [];
	const tokens = value.trim().split(/\s+/),
		out: number[] = [];
	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i] === "g") {
			const count = number(tokens[++i]),
				delta = number(tokens[++i]);
			if (!Number.isInteger(count) || count < 0 || count > limit - out.length)
				throw new RangeError("Invalid OFD glyph repetition.");
			for (let j = 0; j < count; j++) out.push(delta);
		} else out.push(number(tokens[i]));
		if (out.length > limit) throw new RangeError("Too many OFD glyph positions.");
	}
	return out;
}
function ofdPath(value: string): string {
	// OFD B is SVG C, OFD C closes a contour. S starts a subpath.
	if (!/^[\s\d.eE+\-MSLQBCAZmslqbcaz]*$/.test(value)) throw new Error("Invalid OFD path.");
	return value.replace(/[BS C]/g, (c) =>
		c === "B" ? "C" : c === "C" ? "Z" : c === "S" ? "M" : c,
	);
}
interface Resources {
	images: Map<string, string>;
	fonts: Map<string, string>;
	draw: Map<string, XmlElement>;
	templates: Map<string, string>;
	defs: string[];
}
function loadResources(
	archive: Archive,
	document: XmlElement,
	path: string,
	diagnostics: Diagnostic[],
): Resources {
	const res: Resources = {
		images: new Map(),
		fonts: new Map(),
		draw: new Map(),
		templates: new Map(),
		defs: [],
	};
	for (const template of descendants(document, "TemplatePage"))
		res.templates.set(attr(template, "ID"), resolvePath(path, attr(template, "BaseLoc")));
	for (const ref of [
		...descendants(document, "PublicRes"),
		...descendants(document, "DocumentRes"),
	]) {
		const resourcePath = resolvePath(path, ref.textContent?.trim() || "");
		const root = archive.xml(resourcePath),
			base = attr(root, "BaseLoc");
		const resource = (name: string) =>
			resolvePath(resourcePath, base ? `${base}/${name}` : name);
		for (const media of descendants(root, "MultiMedia")) {
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
			const bytes = file && archive.files[resource(file)];
			if (bytes) {
				const family = `ofd-font-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
				res.fonts.set(id, family);
				res.defs.push(
					`<style>@font-face{font-family:'${family}';src:url('${dataUri(bytes, "font/ttf")}')}</style>`,
				);
			} else res.fonts.set(id, name);
		}
		for (const draw of descendants(root, "DrawParam")) res.draw.set(attr(draw, "ID"), draw);
	}
	return res;
}
function objectSvg(
	node: XmlElement,
	res: Resources,
	text: string[],
	diagnostics: Diagnostic[],
	depth = 0,
): string {
	if (depth > 64) throw new RangeError("OFD object nesting exceeds the budget.");
	const kind = node.localName;
	if (kind !== "TextObject" && kind !== "PathObject" && kind !== "ImageObject") {
		if (kind === "CompositeObject")
			diagnostics.push({
				code: "ofd-composite",
				message: "Composite resource objects are not rendered.",
			});
		return children(node)
			.map((c) => objectSvg(c, res, text, diagnostics, depth + 1))
			.join("");
	}
	const [x, y, w, h] = box(node);
	const matrix = values(attr(node, "CTM"));
	const transform = `translate(${x} ${y})${matrix.length === 6 ? ` matrix(${matrix.join(" ")})` : ""}`;
	const draw = res.draw.get(attr(node, "DrawParam"));
	const fill = color(first(node, "FillColor") ?? (draw && first(draw, "FillColor")), "black");
	const stroke = color(
		first(node, "StrokeColor") ?? (draw && first(draw, "StrokeColor")),
		"black",
	);
	const opacity = number(attr(node, "Alpha"), 255) / 255;
	let content = "";
	if (kind === "TextObject") {
		const size = number(attr(node, "Size"), 3.5),
			font = res.fonts.get(attr(node, "Font")) || "sans-serif";
		for (const code of children(node, "TextCode")) {
			const value = code.textContent || "";
			text.push(value);
			const dx = deltas(attr(code, "DeltaX"), value.length * 2 + 1),
				dy = deltas(attr(code, "DeltaY"), value.length * 2 + 1);
			let tx = number(attr(code, "X")),
				ty = number(attr(code, "Y"));
			const chars = Array.from(value),
				xs: number[] = [],
				ys: number[] = [];
			for (let i = 0; i < chars.length; i++) {
				xs.push(tx);
				ys.push(ty);
				tx += dx[i] ?? dx[dx.length - 1] ?? size;
				ty += dy[i] ?? dy[dy.length - 1] ?? 0;
			}
			content += `<text xml:space="preserve" font-family="${e(font)}" font-size="${size}" font-weight="${e(attr(node, "Weight", "400"))}" font-style="${attr(node, "Italic") === "true" ? "italic" : "normal"}" fill="${fill}" x="${xs.join(" ")}" y="${ys.join(" ")}">${e(value)}</text>`;
		}
		if (descendants(node, "CGTransform").length)
			diagnostics.push({
				code: "ofd-glyphs",
				message: "Custom glyph substitutions use Unicode text fallback.",
			});
	} else if (kind === "ImageObject") {
		const image = res.images.get(attr(node, "ResourceID"));
		// OFD images map the unit square through CTM; Boundary is only their object box.
		if (image)
			content = `<image href="${image}" width="${matrix.length === 6 ? 1 : w}" height="${matrix.length === 6 ? 1 : h}" preserveAspectRatio="none"/>`;
	} else {
		const path = first(node, "AbbreviatedData")?.textContent || "";
		content = `<path d="${e(ofdPath(path))}" fill="${attr(node, "Fill", "false") === "true" ? fill : "none"}" fill-rule="${attr(node, "Rule") === "Even-Odd" ? "evenodd" : "nonzero"}" stroke="${attr(node, "Stroke", "true") === "false" ? "none" : stroke}" stroke-width="${number(attr(node, "LineWidth", draw ? attr(draw, "LineWidth") : ""), 0.353)}"/>`;
	}
	if (first(node, "Clips"))
		diagnostics.push({
			code: "ofd-clip",
			message: "OFD object clipping is approximated by its page boundary.",
		});
	return `<g transform="${transform}" opacity="${opacity}">${content}</g>`;
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
			const seal = first(signature, "BaseLoc")?.textContent?.trim();
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
						`<image href="${image}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"/>`,
				);
			}
		}
	}
	return out;
}
export function readOfd(archive: Archive, options: ReadOptions): OfdDocument {
	const ofd = archive.xml("OFD.xml"),
		diagnostics: Diagnostic[] = [],
		pages: DocumentPage[] = [];

	for (const body of children(ofd, "DocBody")) {
		const sealMap = stamps(archive, body, diagnostics);
		const path = resolvePath("OFD.xml", first(body, "DocRoot")?.textContent?.trim() || "");
		const document = archive.xml(path),
			res = loadResources(archive, document, path, diagnostics);
		const common = first(document, "CommonData"),
			defaultBox = common && first(common, "PhysicalBox")?.textContent;
		for (const pageRef of children(first(document, "Pages")!, "Page")) {
			abort(options.signal);
			if (pages.length >= (options.maxPages ?? 1000))
				throw new RangeError("Too many OFD pages.");
			const pagePath = resolvePath(path, attr(pageRef, "BaseLoc")),
				page = archive.xml(pagePath);
			const area = values(
				first(page, "PhysicalBox")?.textContent || defaultBox || "0 0 210 297",
			);
			const [left, top, width, height] = area;
			if (!(width > 0 && height > 0 && width < 10000 && height < 10000))
				throw new Error("Invalid OFD page dimensions.");
			const text: string[] = [],
				background: string[] = [],
				foreground: string[] = [];
			for (const template of children(page, "Template")) {
				const tp = res.templates.get(attr(template, "TemplateID"));
				if (!tp) continue;
				const svg = objectSvg(archive.xml(tp), res, text, diagnostics);
				(attr(template, "ZOrder") === "Foreground" ? foreground : background).push(svg);
			}
			const content =
				background.join("") +
				objectSvg(page, res, text, diagnostics) +
				foreground.join("") +
				(sealMap.get(attr(pageRef, "ID")) || "");
			pages.push({
				name: `Page ${pages.length + 1}`,
				width: width * MM,
				height: height * MM,
				text: text.join("\n"),
				svg: svgPage(
					width * MM,
					height * MM,
					`<g transform="scale(${MM}) translate(${-left} ${-top})">${content}</g>`,
					res.defs.join(""),
				),
			});
		}
		if (first(document, "Annotations"))
			diagnostics.push({
				code: "ofd-annotations",
				message: "Document annotations are not included in this preview.",
			});
	}
	if (!pages.length) throw new Error("OFD document contains no pages.");
	const text = pages.map((p) => p.text).join("\n\f\n");
	return {
		format: "ofd",
		pages,
		sheets: [],
		text,
		html: pages.map((p) => `<section>${p.svg}</section>`).join(""),
		markdown: text,
		diagnostics,
	};
}
