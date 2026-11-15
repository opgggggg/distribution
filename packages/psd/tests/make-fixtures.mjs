/**
 * Regenerates tests/fixtures/*.psd with this package's own writer.
 * Run manually after codec changes: node tests/make-fixtures.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	loadPsd,
	makeDocument,
	makeTySh as makeTyShHelper,
	rasterLayer,
	solidBitmap,
	emptyLocks,
} from "./helpers.mjs";

const psd = await loadPsd();
const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "fixtures");
mkdirSync(fixturesDir, { recursive: true });

function gradientBitmap(width, height, from, to) {
	const bitmap = psd.createPsdBitmap(width, height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const t = x / Math.max(1, width - 1);
			const p = (y * width + x) * 4;
			bitmap.data[p] = from[0] + (to[0] - from[0]) * t;
			bitmap.data[p + 1] = from[1] + (to[1] - from[1]) * t;
			bitmap.data[p + 2] = from[2] + (to[2] - from[2]) * t;
			bitmap.data[p + 3] = 255;
		}
	}
	return bitmap;
}

function circleBitmap(size, r, g, b) {
	const bitmap = psd.createPsdBitmap(size, size);
	const radius = size / 2;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const distance = Math.hypot(x - radius + 0.5, y - radius + 0.5);
			const p = (y * size + x) * 4;
			bitmap.data[p] = r;
			bitmap.data[p + 1] = g;
			bitmap.data[p + 2] = b;
			bitmap.data[p + 3] = distance <= radius ? 255 : 0;
		}
	}
	return bitmap;
}

/** Renders 5x7 uppercase bitmap glyphs — enough for a text layer's pixels. */
function textBitmap(text, scale, r, g, b) {
	const FONT = {
		A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
		D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
		E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
		H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
		L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
		O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
		P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
		S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
		" ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
	};
	const glyphs = [...text.toUpperCase()].map((ch) => FONT[ch] ?? FONT[" "]);
	const width = glyphs.length * 6 * scale;
	const height = 7 * scale;
	const bitmap = psd.createPsdBitmap(width, height);
	glyphs.forEach((glyph, index) => {
		for (let gy = 0; gy < 7; gy++) {
			for (let gx = 0; gx < 5; gx++) {
				if (glyph[gy][gx] !== "1") continue;
				for (let sy = 0; sy < scale; sy++) {
					for (let sx = 0; sx < scale; sx++) {
						const x = (index * 6 + gx) * scale + sx;
						const y = gy * scale + sy;
						const p = (y * width + x) * 4;
						bitmap.data[p] = r;
						bitmap.data[p + 1] = g;
						bitmap.data[p + 2] = b;
						bitmap.data[p + 3] = 255;
					}
				}
			}
		}
	});
	return bitmap;
}

const makeTySh = (text) => makeTyShHelper(psd, text);

const WIDTH = 480;
const HEIGHT = 320;

const document = makeDocument(
	psd,
	[
		rasterLayer(psd, "L1", "Background 背景", {
			bitmap: gradientBitmap(WIDTH, HEIGHT, [28, 36, 54], [90, 140, 200]),
		}),
		{
			kind: "group",
			id: "L10",
			name: "Shapes 形状",
			visible: true,
			opacity: 1,
			blendMode: "normal",
			clipping: false,
			locks: emptyLocks(),
			preservedBlocks: [],
			open: true,
			children: [
				rasterLayer(psd, "L11", "Red circle", {
					top: 60,
					left: 70,
					bitmap: circleBitmap(140, 226, 61, 45),
					blendMode: "normal",
				}),
				rasterLayer(psd, "L12", "Yellow circle", {
					top: 100,
					left: 170,
					opacity: 0.85,
					blendMode: "multiply",
					bitmap: circleBitmap(140, 250, 200, 40),
				}),
				rasterLayer(psd, "L13", "Blue circle", {
					top: 60,
					left: 260,
					opacity: 0.9,
					blendMode: "screen",
					bitmap: circleBitmap(140, 70, 130, 240),
					mask: {
						top: 60,
						left: 260,
						bottom: 200,
						right: 400,
						defaultColor: 255,
						disabled: false,
						data: (() => {
							// Vertical gradient mask.
							const data = new Uint8Array(140 * 140);
							for (let y = 0; y < 140; y++) {
								data.fill(
									Math.round(255 - (y / 139) * 200),
									y * 140,
									(y + 1) * 140,
								);
							}
							return data;
						})(),
					},
				}),
			],
		},
		{
			kind: "text",
			id: "L20",
			name: "Title",
			visible: true,
			opacity: 1,
			blendMode: "normal",
			clipping: false,
			locks: emptyLocks(),
			preservedBlocks: [],
			top: 24,
			left: 32,
			bitmap: textBitmap("HELLO PSD", 4, 255, 255, 255),
			text: { text: "HELLO PSD", raw: makeTySh("HELLO PSD") },
		},
	],
	{ width: WIDTH, height: HEIGHT, resolutionPpi: 72 },
);

const bytes = psd.writePsd(document);
const target = path.join(fixturesDir, "sample-layers.psd");
writeFileSync(target, bytes);
console.log(`wrote ${target} (${bytes.length} bytes)`);

// Sanity: the fixture reopens with everything intact.
const reread = psd.readPsd(bytes);
if (!reread.editable) throw new Error("fixture must be editable");
if (reread.layers.length !== 3) throw new Error("fixture must have 3 root layers");
const textLayer = reread.layers[2];
if (textLayer.kind !== "text" || textLayer.text.text !== "HELLO PSD") {
	throw new Error("fixture text layer failed to round-trip");
}
console.log("fixture verified");
