import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createNotebook,
	inkWidth,
	readNotebook,
	validateNotebook,
	writeNotebook,
	writeXopp,
} from "../dist/index.js";
import { brushPasses, pageSvg } from "../dist/render.js";

const stroke = (style, pressure = 0.5) => ({
	id: style,
	kind: "stroke",
	tool: "pen",
	penStyle: style,
	width: style === "watercolor" ? 24 : 3,
	opacity: style === "watercolor" ? 0.65 : 1,
	pressure: true,
	color: "#2563eb",
	points: [
		{ x: 50, y: 50, pressure },
		{ x: 250, y: 50, pressure },
	],
});

test("native files preserve pencil, watercolor, strength and pressure without silently flattening Xournal export", async () => {
	const book = createNotebook();
	book.pages[0].layers[0].elements.push(stroke("pencil"), stroke("watercolor"));
	assert.deepEqual(readNotebook(new Uint8Array(await writeNotebook(book).arrayBuffer())), book);
	assert.throws(() => writeXopp(book), /cannot preserve this brush plugin/);
	assert.throws(
		() =>
			validateNotebook({
				...book,
				pages: [
					{
						...book.pages[0],
						layers: [{ ...book.pages[0].layers[0], elements: [stroke("invalid")] }],
					},
				],
			}),
		/Invalid/,
	);
	for (const style of ["pencil", "watercolor"]) {
		const s = stroke(style);
		assert.ok(
			inkWidth(s, { ...s.points[0], pressure: 0.9 }) >
				inkWidth(s, { ...s.points[0], pressure: 0.1 }),
		);
		assert.equal(inkWidth({ ...s, pressure: false }, s.points[0]), s.width);
	}
});

test("pencil grain and watercolor washes are deterministic, transparent and retained in SVG previews", () => {
	const book = createNotebook();
	book.pages[0].layers[0].elements.push(stroke("pencil"), stroke("watercolor"));
	const svg = pageSvg(book.pages[0]);
	assert.equal(pageSvg(structuredClone(book.pages[0])), svg);
	assert.match(svg, /patternUnits="userSpaceOnUse"/);
	assert.match(svg, /url\(#ink-2563eb-grain\)/);
	assert.equal(
		(svg.match(/id="ink-2563eb-grain"/g) ?? []).length,
		1,
		"strokes of one color share a grain tile",
	);
	const washes = brushPasses(stroke("watercolor"));
	assert.ok(washes.length > 5);
	assert.ok(washes.every((p) => p.opacity > 0 && p.opacity < 0.65));
	assert.ok(
		new Set(washes.map((p) => p.path)).size > 5,
		"wash edge has several geometric widths",
	);
	assert.ok(
		brushPasses(stroke("pencil", 0.8))[1].opacity >
			brushPasses(stroke("pencil", 0.2))[1].opacity,
	);
	assert.deepEqual(
		brushPasses({ ...stroke("pencil", 0.1), pressure: false }),
		brushPasses({ ...stroke("pencil", 0.9), pressure: false }),
	);
});

test("pencil tone is independent of event density; existing ink opacity remains intact", () => {
	const s = stroke("pencil", 0.2);
	s.points[1].pressure = 0.8;
	const dense = {
		...s,
		points: Array.from({ length: 101 }, (_, i) => ({
			x: 50 + i * 2,
			y: 50,
			pressure: 0.2 + i * 0.006,
		})),
	};
	const tone = (ink) => brushPasses(ink).map((p) => p.opacity);
	tone(s).forEach((opacity, i) => assert.ok(Math.abs(opacity - tone(dense)[i]) < 1e-10));
	const ordinary = { ...stroke("brush"), opacity: 0.7 };
	assert.equal(brushPasses(ordinary).length, 1);
	assert.equal(brushPasses(ordinary)[0].opacity, 0.7);
});
