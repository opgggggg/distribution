import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFName } from "pdf-lib";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { FormatsKernel, loadFormatsKernel, writePdfImages } from "../dist/index.js";
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const fonts = fileURLToPath(
	new URL("../../standard_fonts/", import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs")),
);
const fixture = JSON.parse(
	await readFile(new URL("./fixtures/mobile-pdf.json", import.meta.url), "utf8"),
);
await loadFormatsKernel();
async function projection(bytes) {
	const doc = await PDFDocument.load(bytes.slice(), { updateMetadata: false });
	const task = getDocument({
		data: new Uint8Array(bytes),
		standardFontDataUrl: fonts,
		disableFontFace: true,
		useSystemFonts: false,
	});
	const pdf = await task.promise;
	try {
		const pages = [];
		for (let i = 0; i < pdf.numPages; i++) {
			const page = await pdf.getPage(i + 1),
				viewport = page.getViewport({ scale: 1 }),
				canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height)),
				context = canvas.getContext("2d");
			await page.render({ canvas, canvasContext: context, viewport }).promise;
			const text = (await page.getTextContent()).items
				.filter((t) => "str" in t)
				.map((t) => t.str);
			const annotations = (await page.getAnnotations()).map(
				({ subtype, rect, url, fieldName, fieldValue }) => ({
					subtype,
					rect,
					url,
					fieldName,
					fieldValue,
				}),
			);
			pages.push({
				width: doc.getPage(i).getWidth(),
				height: doc.getPage(i).getHeight(),
				rotation: doc.getPage(i).getRotation().angle,
				text,
				annotations,
				pixels: Buffer.from(context.getImageData(0, 0, canvas.width, canvas.height).data),
			});
		}
		return {
			title: doc.getTitle(),
			author: doc.getAuthor(),
			opaque: doc.catalog.get(PDFName.of("CubeOpaque"))?.decodeText(),
			fields: doc
				.getForm()
				.getFields()
				.map((f) => ({
					name: f.getName(),
					value: f.constructor.name === "PDFTextField" ? f.getText() : null,
				})),
			pages,
		};
	} finally {
		await task.destroy();
	}
}
for (const item of fixture.cases)
	test(`Rust mobile PDF matches original objects and pixels: ${item.name}`, async () => {
		const core = new FormatsKernel(
			"pdf",
			"utf-8",
			item.kind === "image" ? { imageMime: item.mime } : {},
		);
		try {
			if (item.kind === "images") {
				const output = await writePdfImages(
					item.pages.map((page) => ({
						...page,
						bytes: Buffer.from(page.image, "base64"),
					})),
				);
				assert.deepEqual(
					await projection(output),
					await projection(Buffer.from(item.expected, "base64")),
				);
				return;
			}
			if (item.kind === "image") core.open(Buffer.from(item.image, "base64"));
			else {
				const source = Buffer.from(item.input, "base64");
				core.open(source);
				assert.deepEqual(core.save(), new Uint8Array(source));
				if (item.kind === "pages")
					core.request({ op: "pageOperation", operation: item.operation });
				else {
					core.setPdfImage(Buffer.from(item.image, "base64"));
					core.request({ op: "signature", page: item.page, box: item.box });
				}
			}
			const actual = await projection(core.save());
			if (item.name === "inherited-move-1") {
				// The original helper loses inherited MediaBox/Resources when this
				// leaf moves to the root. Preserve the source page's actual display.
				await assert.rejects(projection(Buffer.from(item.expected, "base64")), /PDFArray/);
				const expected = await projection(Buffer.from(item.input, "base64"));
				expected.pages.push(expected.pages.shift());
				assert.deepEqual(actual, expected);
			} else assert.deepEqual(actual, await projection(Buffer.from(item.expected, "base64")));
		} finally {
			core.close();
		}
	});
test("invalid PDF mutations and image uploads never replace valid document state", () => {
	const item = fixture.cases.find((c) => c.name === "signature-0"),
		source = Buffer.from(item.input, "base64"),
		core = new FormatsKernel("pdf");
	try {
		core.open(source);
		for (const operation of [
			{ type: "delete", page: 1 },
			{ type: "rotate", page: 0 },
			{ type: "move", page: 1, target: 2 },
			{ type: "rotate", page: 1.2 },
		]) {
			assert.throws(() => core.request({ op: "pageOperation", operation }));
			assert.deepEqual(core.save(), new Uint8Array(source));
		}
		assert.throws(() => core.setPdfImage(new Uint8Array([1, 2, 3])));
		assert.deepEqual(core.save(), new Uint8Array(source));
		core.setPdfImage(Buffer.from(item.image, "base64"));
		assert.throws(() =>
			core.request({
				op: "signature",
				page: 1,
				box: { x: 0.9, y: 0, width: 0.4, height: 0.2 },
			}),
		);
		assert.deepEqual(core.save(), new Uint8Array(source));
		core.request({ op: "signature", page: 1, box: item.box });
		assert.notDeepEqual(core.save(), new Uint8Array(source));
	} finally {
		core.close();
	}
});
test("raster PDF validation rejects bad pages and recovers on the next call", async () => {
	const item = fixture.cases.find((c) => c.name === "raster-pages-2");
	const pages = item.pages.map((p) => ({ ...p, bytes: Buffer.from(p.image, "base64") }));
	for (const width of [0, -1, NaN, Infinity])
		await assert.rejects(writePdfImages([{ ...pages[0], width }]));
	await assert.rejects(writePdfImages([{ ...pages[0], bytes: new Uint8Array([1, 2, 3]) }]));
	assert.equal((await projection(await writePdfImages(pages))).pages.length, 2);
});
