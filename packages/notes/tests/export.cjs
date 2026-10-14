const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium } = require("playwright");
const { unzipSync } = require("fflate");
const { PDFDocument } = require("pdf-lib");
(async () => {
	const { createNotebook, createPage, writeNotebook } = await import("../dist/index.js");
	const book = createNotebook("导出测试");
	const a = createPage("grid", 200, 280);
	a.layers[0].elements.push(
		{
			id: "red-ink",
			kind: "stroke",
			tool: "pen",
			width: 4,
			color: "#ff0000",
			opacity: 1,
			pressure: false,
			penStyle: "ballpoint",
			points: [
				{ x: 20, y: 30, pressure: 0.5 },
				{ x: 90, y: 30, pressure: 0.5 },
			],
		},
		{
			id: "cjk",
			kind: "text",
			text: "中文导出\n完整页面",
			x: 30,
			y: 90,
			size: 16,
			color: "#222b40",
		},
	);
	a.layers.push({
		id: "hidden",
		name: "Hidden",
		visible: false,
		elements: [
			{
				id: "hidden-ink",
				kind: "stroke",
				tool: "pen",
				width: 8,
				color: "#0000ff",
				opacity: 1,
				pressure: false,
				points: [
					{ x: 20, y: 60, pressure: 0.5 },
					{ x: 90, y: 60, pressure: 0.5 },
				],
			},
		],
	});
	book.pages = [
		a,
		createPage("plain", 200, 100, "#eef5fc"),
		createPage("plain", 150, 200, "#ffffff"),
	];
	const bytes = Array.from(new Uint8Array(await writeNotebook(book).arrayBuffer()));
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const errors = [];
	p.on("pageerror", (e) => errors.push(e.message));
	const exportBytes = (format) =>
		p.evaluate(
			async (format) =>
				Array.from(
					new Uint8Array(
						await (await window.notebook.value.exportFile(format)).arrayBuffer(),
					),
				),
			format,
		);
	async function pngPixels(bytes) {
		return p.evaluate(async (bytes) => {
			const image = await createImageBitmap(
				new Blob([new Uint8Array(bytes)], { type: "image/png" }),
			);
			const c = document.createElement("canvas");
			c.width = image.width;
			c.height = image.height;
			const ctx = c.getContext("2d");
			ctx.drawImage(image, 0, 0);
			const sample = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
			const result = {
				width: c.width,
				height: c.height,
				paper: sample(2, 2),
				ink: sample(80, 60),
				hidden: sample(80, 120),
				text: Array.from(ctx.getImageData(60, 180, 150, 100).data).filter(
					(v, i) => i % 4 === 0 && v < 100,
				).length,
			};
			image.close();
			return result;
		}, bytes);
	}
	try {
		await p.goto(
			process.env.NOTES_PREVIEW_URL ||
				"http://127.0.0.1:5178/packages/notes/tests/viewer.html",
		);
		await p.locator(".cube-notes__ink-canvas").waitFor();
		await p.evaluate(
			(bytes) => (window.noteSource.value = new Blob([new Uint8Array(bytes)])),
			bytes,
		);
		await p.waitForFunction(() => window.notebook.value.getNotebook().pages.length === 3);
		const png = await exportBytes("png");
		const pixels = await pngPixels(png);
		assert.equal(pixels.width, 400);
		assert.equal(pixels.height, 560);
		assert.deepEqual(pixels.paper, [255, 253, 247, 255]);
		assert.deepEqual(pixels.ink, [255, 0, 0, 255]);
		assert.notDeepEqual(pixels.hidden, [0, 0, 255, 255]);
		assert.ok(pixels.text > 100, "CJK text renders into the exported image");
		await p.getByRole("combobox", { name: "缩放", exact: true }).selectOption("200");
		assert.deepEqual(await exportBytes("png"), png, "export is independent of view zoom");
		await p.getByRole("button", { name: "导出", exact: true }).click();
		await p.getByRole("button", { name: /PNG 图片（当前页）/ }).click();
		await p.waitForFunction(() => window.noteExports.length === 1);
		const file = await p.evaluate(() => ({
			name: window.noteExports[0].fileName,
			type: window.noteExports[0].blob.type,
		}));
		assert.match(file.name, /-page-1\.png$/);
		assert.equal(file.type, "image/png");
		await p.getByRole("button", { name: "下一页", exact: true }).click();
		const secondBytes = await exportBytes("png");
		const second = await pngPixels(secondBytes);
		assert.equal(second.width, 400);
		assert.equal(second.height, 200);
		assert.deepEqual(second.paper, [238, 245, 252, 255]);
		const archive = unzipSync(new Uint8Array(await exportBytes("png-zip")));
		assert.deepEqual(Object.keys(archive), ["page-001.png", "page-002.png", "page-003.png"]);
		assert.deepEqual(Array.from(archive["page-001.png"]), png);
		const pdfBytes = await exportBytes("pdf");
		const pdf = await PDFDocument.load(new Uint8Array(pdfBytes));
		assert.equal(pdf.getPageCount(), 3);
		assert.deepEqual(
			pdf.getPages().map((p) => p.getSize()),
			[
				{ width: 200, height: 280 },
				{ width: 200, height: 100 },
				{ width: 150, height: 200 },
			],
		);
		assert.equal(await p.evaluate(() => window.notebook.value.isDirty()), false);
		await p.evaluate(() => (window.noteReadonly.value = true));
		assert.deepEqual(await exportBytes("png"), secondBytes);
		assert.equal(
			(await PDFDocument.load(new Uint8Array(await exportBytes("pdf")))).getPageCount(),
			3,
		);
		await p.evaluate(async () => {
			const c = new AbortController();
			c.abort();
			try {
				await window.notebook.value.exportFile("png-zip", { signal: c.signal });
				throw new Error("export did not abort");
			} catch (e) {
				if (e.name !== "AbortError") throw e;
			}
		});
		await fs.writeFile(".cache/notes-qa/export-page-1.png", new Uint8Array(png));
		await fs.writeFile(".cache/notes-qa/export-notebook.pdf", new Uint8Array(pdfBytes));
		assert.deepEqual(errors, []);
		console.log(
			"PASS: complete-page PNG, CJK/ink/paper/hidden layers, zoom independence, current-page naming, numbered ZIP, multipage PDF, readonly and cancellation",
		);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
