import fontkit, { type Font } from "@pdf-lib/fontkit";
import { attr, children, first, number, escapeXml as e, type XmlElement } from "./archive.js";
import type { Diagnostic } from "./types.js";
export type { Font };
export function parseFont(bytes: Uint8Array): Font {
	return fontkit.create(bytes);
}
export function decodeText(text: string): string {
	return text.replace(/\\([0-9a-fA-F]{4})/g, (_, hex: string) =>
		String.fromCharCode(parseInt(hex, 16)),
	);
}
function advances(value: string, limit: number): number[] {
	const tokens = value.trim().split(/\s+/).filter(Boolean),
		out: number[] = [];
	for (let i = 0; i < tokens.length; i++) {
		let count = 1;
		if (tokens[i] === "g") {
			count = Number(tokens[++i]);
			i++;
		}
		const value = Number(tokens[i]);
		if (!Number.isSafeInteger(count) || count < 0 || !Number.isFinite(value))
			throw new Error("Invalid OFD glyph advances.");
		for (let j = 0, n = Math.min(count, limit - out.length); j < n; j++) out.push(value);
	}
	return out;
}
const fontNames = new WeakMap<Font, string>();
function fontSubfamily(font: Font): string {
	const cached = fontNames.get(font);
	if (cached !== undefined) return cached;
	let name = "";
	try {
		name = font.subfamilyName ?? "";
	} catch {
		/* Subset fonts may intentionally omit naming metadata. */
	}
	fontNames.set(font, name);
	return name;
}
function outline(font: Font, id: number, size: number): string {
	if (!Number.isInteger(id) || id < 0 || id >= font.numGlyphs)
		throw new Error(`Invalid glyph index ${id}.`);
	let axis = 0;
	return font
		.getGlyph(id)
		.path.toSVG()
		.replace(/[a-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi, (token) => {
			if (/^[a-z]$/i.test(token)) {
				axis = 0;
				return token;
			}
			return String(((Number(token) * size) / font.unitsPerEm) * (axis++ % 2 ? -1 : 1));
		});
}
export interface TextPaint {
	fill: string;
	stroke: string;
	strokeAttributes: string;
	paintAttributes: string;
}
export function renderText(
	node: XmlElement,
	family: string,
	font: Font | undefined,
	paint: TextPaint,
	text: string[],
	diagnostics: Diagnostic[],
	limits = { glyphs: 100000, bytes: 128 * 1024 * 1024 },
): string {
	const size = number(attr(node, "Size"), 3.5),
		hscale = number(attr(node, "HScale"), 1),
		direction = number(attr(node, "CharDirection"));
	if (
		size <= 0 ||
		hscale <= 0 ||
		![0, 90, 180, 270].includes(direction) ||
		![0, 90, 180, 270].includes(number(attr(node, "ReadDirection")))
	)
		throw new Error("Invalid OFD text size, scale or direction.");
	let startX = 0,
		startY = 0,
		offset = 0;
	const codes = children(node, "TextCode").map((code) => {
		const value = decodeText(code.textContent ?? ""),
			chars = Array.from(value);
		text.push(value);
		if (code.hasAttribute("X")) startX = number(attr(code, "X"));
		if (code.hasAttribute("Y")) startY = number(attr(code, "Y"));
		const item = { code, value, chars, offset, x: startX, y: startY };
		offset += chars.length;
		return item;
	});
	const characters = codes.flatMap((code) => code.chars);
	const maps = new Map<number, { count: number; glyphs: number[] }>();
	for (const cg of children(node, "CGTransform")) {
		const start = number(attr(cg, "CodePosition")),
			count = number(attr(cg, "CodeCount"), 1),
			glyphCount = number(attr(cg, "GlyphCount"), 1),
			glyphs = (first(cg, "Glyphs")?.textContent ?? "")
				.trim()
				.split(/\s+/)
				.filter(Boolean)
				.map(Number);
		if (
			!Number.isInteger(start) ||
			!Number.isInteger(count) ||
			count < 1 ||
			start < 0 ||
			start + count > offset ||
			glyphCount !== glyphs.length ||
			glyphCount < 1
		)
			throw new Error("Invalid OFD CGTransform range.");
		maps.set(start, { count, glyphs });
	}
	const stack =
		[
			family,
			"Noto Sans CJK SC",
			"Source Han Sans SC",
			"PingFang SC",
			"Microsoft YaHei",
			"Songti SC",
			"Arial Unicode MS",
		]
			.map((name) => `'${name.replace(/['\\]/g, "\\$&")}'`)
			.join(",") + ",sans-serif";
	const attributes = `fill="${paint.fill}" stroke="${paint.stroke}" ${paint.strokeAttributes} ${paint.paintAttributes}`;
	const fontAttributes = `font-family="${e(stack)}" font-size="${size}" font-weight="${e(attr(node, "Weight", "400"))}" font-style="${attr(node, "Italic") === "true" ? "italic" : "normal"}" xml:space="preserve"`;
	let output = "",
		consumed = 0,
		totalGlyphs = 0;
	if (maps.size && !font)
		diagnostics.push({
			code: "ofd-glyphs",
			message:
				"Glyph-index mapping requires its embedded font or a caller-supplied matching font.",
		});
	for (const run of codes) {
		const groups: { text: string; glyphs: number[] | undefined }[] = [];
		for (let i = Math.max(0, consumed - run.offset); i < run.chars.length;) {
			const mapped = maps.get(run.offset + i),
				count = mapped && font ? mapped.count : 1;
			const value = characters.slice(run.offset + i, run.offset + i + count).join("");
			groups.push({
				text: value,
				glyphs: font
					? (mapped?.glyphs ?? [font.glyphForCodePoint(run.chars[i].codePointAt(0)!).id])
					: undefined,
			});
			i += count;
			consumed = run.offset + i;
		}
		const count = groups.reduce(
			(n, g) => n + (g.glyphs?.length ?? Array.from(g.text).length),
			0,
		);
		totalGlyphs += count;
		if (totalGlyphs > limits.glyphs)
			throw new RangeError("OFD glyph count exceeds the object budget.");
		const dx = advances(attr(run.code, "DeltaX"), count),
			dy = advances(attr(run.code, "DeltaY"), count);
		let x = run.x,
			y = run.y,
			index = 0;
		const advance = () => {
			x += dx[index] ?? dx.at(-1) ?? 0;
			y += dy[index] ?? dy.at(-1) ?? 0;
			index++;
		};
		if (!font && direction === 0 && hscale === 1) {
			const xs: number[] = [],
				ys: number[] = [];
			for (const _ of run.chars) {
				xs.push(x);
				ys.push(y);
				advance();
			}
			output += `<text ${fontAttributes} ${attributes} x="${xs.join(" ")}" y="${ys.join(" ")}">${e(run.value)}</text>`;
		} else
			for (const group of groups) {
				const firstX = x,
					firstY = y;
				if (group.glyphs && font) {
					for (const id of group.glyphs) {
						const subfamily = fontSubfamily(font),
							italic =
								attr(node, "Italic") === "true" &&
								!/italic|oblique/i.test(subfamily),
							baseWeight = /bold|black|heavy/i.test(subfamily) ? 700 : 400,
							weight = number(attr(node, "Weight"), 400),
							path = e(outline(font, id, size)),
							transform = `translate(${x} ${y}) rotate(${direction}) scale(${hscale} 1)${italic ? " skewX(-12)" : ""}`;
						if (weight > baseWeight && paint.fill !== "none")
							output += `<path data-ofd-synthetic-bold="true" fill="none" stroke="${paint.fill}" stroke-width="${(size * (weight - baseWeight)) / 5000}" stroke-linejoin="round" stroke-opacity="${paint.paintAttributes.match(/fill-opacity="([^"]+)"/)?.[1] ?? "1"}" transform="${transform}" d="${path}"/>`;
						output += `<path ${attributes} transform="${transform}" d="${path}"/>`;
						advance();
					}
					output += `<text ${fontAttributes} fill="transparent" stroke="none" x="${firstX}" y="${firstY}">${e(group.text)}</text>`;
				} else {
					output += `<text ${fontAttributes} ${attributes} transform="translate(${x} ${y}) rotate(${direction}) scale(${hscale} 1)" x="0" y="0">${e(group.text)}</text>`;
					advance();
				}
				if (output.length > limits.bytes)
					throw new RangeError("OFD text output exceeds the SVG budget.");
			}
	}
	return output;
}
