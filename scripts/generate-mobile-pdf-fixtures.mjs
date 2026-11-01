/** Original pdf-lib helper is the independent reference, never production code. */
import { PDFDocument, StandardFonts, degrees, rgb, PDFName, PDFString } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";
const commit = "43022d3584827e6adb89c18f1d7fa5b50ed17b21";
const reference = spawnSync(
	"git",
	["show", `${commit}:apps/harmony/web/src/mobile/pdf-operations.ts`],
	{ encoding: "utf8" },
);
if (reference.status !== 0) throw Error(reference.stderr);
const dir = new URL("../.cache/notes-qa/", import.meta.url);
await mkdir(dir, { recursive: true });
const file = new URL("original-mobile-pdf.mjs", dir);
await writeFile(
	file,
	ts.transpileModule(reference.stdout, {
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
	}).outputText,
);
const original = await import(file.href);
const canvas = createCanvas(64, 32),
	ctx = canvas.getContext("2d");
ctx.fillStyle = "rgba(20,70,230,.5)";
ctx.fillRect(0, 0, 32, 32);
ctx.fillStyle = "#e02050";
ctx.fillRect(32, 0, 32, 32);
ctx.fillStyle = "#20c040";
ctx.fillRect(8, 8, 20, 16);
const png = new Uint8Array(canvas.toBuffer("image/png")),
	jpeg = new Uint8Array(canvas.toBuffer("image/jpeg"));
async function source(count, rotation = 0, nested = false) {
	const doc = await PDFDocument.create();
	doc.setTitle("Portable PDF test");
	doc.setAuthor("Synthetic test");
	const font = await doc.embedFont(StandardFonts.Helvetica);
	for (let i = 0; i < count; i++) {
		const page = doc.addPage([240 + i * 20, 160 + i * 10]);
		page.setRotation(degrees(rotation));
		page.drawRectangle({
			x: 5,
			y: 5,
			width: 80 + i * 10,
			height: 30,
			color: rgb(0.1 + i * 0.15, 0.3, 0.7),
		});
		page.drawText(`Page ${i + 1}`, { x: 10, y: 90, font, size: 16 });
	}
	const form = doc.getForm(),
		field = form.createTextField("keep-field");
	field.setText("keep-value");
	field.addToPage(doc.getPage(0), { x: 100, y: 10, width: 100, height: 20 });
	doc.catalog.set(PDFName.of("CubeOpaque"), PDFString.of("keep-private-metadata"));
	const page = doc.getPage(0);
	page.node.set(
		PDFName.of("Annots"),
		doc.context.obj([
			...page.node.Annots().asArray(),
			doc.context.register(
				doc.context.obj({
					Type: "Annot",
					Subtype: "Link",
					Rect: [10, 40, 60, 60],
					A: { Type: "Action", S: "URI", URI: PDFString.of("https://example.test/keep") },
				}),
			),
		]),
	);
	if (nested) {
		const root = doc.catalog.Pages(),
			kids = root.Kids();
		const first = doc.getPage(0),
			second = doc.getPage(1);
		const node = doc.context.obj({
			Type: "Pages",
			Parent: doc.catalog.get(PDFName.of("Pages")),
			Kids: [first.ref, second.ref],
			Count: 2,
			MediaBox: [0, 0, 240, 160],
			Rotate: 90,
			Resources: first.node.Resources(),
		});
		const ref = doc.context.register(node);
		for (const leaf of [first, second]) {
			leaf.node.set(PDFName.of("Parent"), ref);
			for (const key of ["MediaBox", "Resources", "Rotate"])
				leaf.node.delete(PDFName.of(key));
		}
		kids.remove(0);
		kids.remove(0);
		kids.insert(0, ref);
	}
	return new Uint8Array(
		await doc.save({ useObjectStreams: false, updateFieldAppearances: false }),
	);
}
const cases = [];
for (const nested of [false, true]) {
	const input = await source(3, 0, nested);
	for (const operation of [
		{ type: "rotate", page: 1 },
		{ type: "delete", page: 2 },
		{ type: "move", page: 1, target: 3 },
		{ type: "move", page: 3, target: 1 },
	])
		cases.push({
			name: `${nested ? "inherited" : "flat"}-${operation.type}-${operation.page}`,
			kind: "pages",
			input: Buffer.from(input).toString("base64"),
			operation,
			expected: Buffer.from(await original.changePdfPages(input, operation)).toString(
				"base64",
			),
		});
	if (nested)
		for (const page of [1, 2]) {
			const box = { x: 0.15, y: 0.2, width: 0.4, height: 0.3 };
			cases.push({
				name: `signature-inherited-${page}`,
				kind: "signature",
				input: Buffer.from(input).toString("base64"),
				image: Buffer.from(png).toString("base64"),
				page,
				box,
				expected: Buffer.from(
					await original.addPdfSignature(input, png, page, box),
				).toString("base64"),
			});
		}
}
for (const rotation of [0, 90, 180, 270]) {
	const input = await source(1, rotation),
		box = { x: 0.15, y: 0.2, width: 0.4, height: 0.3 };
	cases.push({
		name: `signature-${rotation}`,
		kind: "signature",
		input: Buffer.from(input).toString("base64"),
		image: Buffer.from(png).toString("base64"),
		page: 1,
		box,
		expected: Buffer.from(await original.addPdfSignature(input, png, 1, box)).toString(
			"base64",
		),
	});
}
for (const [mime, bytes] of [
	["image/png", png],
	["image/jpeg", jpeg],
])
	cases.push({
		name: `image-${mime}`,
		kind: "image",
		image: Buffer.from(bytes).toString("base64"),
		mime,
		expected: Buffer.from(
			await (await original.imageToPdf(new Blob([bytes]), mime)).arrayBuffer(),
		).toString("base64"),
	});
for (const count of [0, 2, 3]) {
	const doc = await PDFDocument.create(),
		pages = [];
	for (let i = 0; i < count; i++) {
		const bytes = i % 2 ? jpeg : png,
			mime = i % 2 ? "image/jpeg" : "image/png",
			width = 120.5 + i * 25,
			height = 80.25 + i * 15;
		const image = mime === "image/jpeg" ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
		const page = doc.addPage([width, height]);
		page.drawImage(image, { x: 0, y: 0, width, height });
		pages.push({ image: Buffer.from(bytes).toString("base64"), mime, width, height });
	}
	cases.push({
		name: `raster-pages-${count}`,
		kind: "images",
		pages,
		expected: Buffer.from(await doc.save()).toString("base64"),
	});
}

await writeFile(
	new URL("../packages/kernels/tests/fixtures/mobile-pdf.json", import.meta.url),
	JSON.stringify({ sourceCommit: commit, cases }, null, 2) + "\n",
);
console.log(`Recorded ${cases.length} original mobile PDF results`);
