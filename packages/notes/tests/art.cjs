const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { PDFDocument } = require("pdf-lib");

(async () => {
	const { readNotebook } = await import("../dist/index.js");
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	const output = path.resolve(__dirname, "../../../.cache/notes-qa");
	await fs.mkdir(output, { recursive: true });
	try {
		const page = await browser.newPage({
			viewport: { width: 390, height: 844 },
			hasTouch: true,
		});
		const errors = [];
		page.on("pageerror", (e) => errors.push(e.message));
		await page.goto("http://127.0.0.1:5178/packages/notes/tests/viewer.html");
		await page.locator(".cube-notes__ink-canvas").waitFor();
		const book = () => page.evaluate(() => window.notebook.value.getNotebook());
		const elements = async () => (await book()).pages[0].layers[0].elements;
		const cdp = await page.context().newCDPSession(page);
		const settings = async () => page.locator('[data-tool="pen"]').click();
		const close = async () => page.getByRole("button", { name: "完成", exact: true }).click();
		async function draw(coords, force) {
			const rect = await page.locator(".cube-notes__ink-canvas").boundingBox();
			const model = (await book()).pages[0];
			const p = ([x, y]) => ({
				x: rect.x + (x * rect.width) / model.width,
				y: rect.y + (y * rect.height) / model.height,
			});
			await cdp.send("Input.dispatchMouseEvent", {
				type: "mousePressed",
				...p(coords[0]),
				button: "left",
				clickCount: 1,
				pointerType: "pen",
				force,
			});
			for (const xy of coords.slice(1))
				await cdp.send("Input.dispatchMouseEvent", {
					type: "mouseMoved",
					...p(xy),
					button: "left",
					buttons: 1,
					pointerType: "pen",
					force,
				});
			await cdp.send("Input.dispatchMouseEvent", {
				type: "mouseReleased",
				...p(coords.at(-1)),
				button: "left",
				pointerType: "pen",
			});
			return (await elements()).at(-1);
		}
		await page.getByRole("button", { name: "视图选项", exact: true }).click();
		await page.getByRole("button", { name: "纸张", exact: true }).click();
		await page.getByRole("button", { name: "空白", exact: true }).click();
		await close();
		await settings();
		assert.equal(await page.locator("[data-pen-style]").count(), 10);
		await page.locator('[data-pen-style="pencil"]').click();
		await page.getByRole("slider", { name: "笔迹粗细", exact: true }).fill("8");
		await close();
		assert.equal(
			(
				await draw(
					[
						[60, 100],
						[160, 100],
						[260, 100],
					],
					0.2,
				)
			).penStyle,
			"pencil",
		);
		await draw(
			[
				[60, 150],
				[160, 150],
				[260, 150],
			],
			0.85,
		);
		await settings();
		await page.locator('[data-pen-style="watercolor"]').click();
		const width = page.getByRole("slider", { name: "笔迹粗细", exact: true });
		assert.equal(await width.getAttribute("max"), "60");
		await width.fill("40");
		await page.getByRole("slider", { name: "浓度", exact: true }).fill("40");
		await page.getByRole("checkbox", { name: "压感", exact: true }).uncheck();
		await page.screenshot({ path: path.join(output, "art-pen-settings-phone.png") });
		await close();
		const wash = await draw(
			[
				[60, 250],
				[160, 250],
				[260, 250],
			],
			0.5,
		);
		assert.equal(wash.penStyle, "watercolor");
		assert.equal(wash.opacity, 0.4);
		await draw(
			[
				[160, 200],
				[160, 250],
				[160, 300],
			],
			0.5,
		);
		await page.evaluate(() => window.notebook.value.undo());
		assert.equal((await elements()).length, 3);
		await page.evaluate(() => window.notebook.value.redo());
		assert.equal((await elements()).length, 4);
		await settings();
		await page.locator('[data-pen-style="pencil"]').click();
		assert.equal(await width.inputValue(), "8");
		assert.equal(await page.getByRole("slider", { name: "浓度", exact: true }).count(), 0);
		await page.locator('[data-pen-style="watercolor"]').click();
		assert.equal(await width.inputValue(), "40");
		assert.equal(
			await page.getByRole("slider", { name: "浓度", exact: true }).inputValue(),
			"40",
		);
		await close();
		const bytes = async (format) =>
			page.evaluate(
				async (format) =>
					Array.from(
						new Uint8Array(
							await (await window.notebook.value.exportFile(format)).arrayBuffer(),
						),
					),
				format,
			);
		assert.deepEqual(readNotebook(new Uint8Array(await bytes("cubenote"))), await book());
		const png = await bytes("png");
		await fs.writeFile(path.join(output, "art-brush-tests.png"), Buffer.from(png));
		const pixels = await page.evaluate(async (bytes) => {
			const image = await createImageBitmap(
				new Blob([new Uint8Array(bytes)], { type: "image/png" }),
			);
			const c = document.createElement("canvas");
			c.width = image.width;
			c.height = image.height;
			const ctx = c.getContext("2d");
			ctx.drawImage(image, 0, 0);
			const pixel = (x, y) => [
				...ctx.getImageData(Math.round(x * 2), Math.round(y * 2), 1, 1).data,
			];
			const strip = (y) =>
				[...ctx.getImageData(140, y * 2 - 1, 220, 2).data].filter((_, i) => i % 4 === 0);
			const result = {
				light: strip(100),
				dark: strip(150),
				wash: pixel(100, 250),
				overlap: pixel(160, 250),
				edge: pixel(100, 268),
				outside: pixel(100, 273),
			};
			image.close();
			return result;
		}, png);
		const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

		assert.ok(
			new Set(pixels.dark).size > 20,
			"pencil interior has grain, not a uniform ink fill",
		);
		assert.ok(mean(pixels.light) > mean(pixels.dark) + 10, "pressure gives darker graphite");
		assert.ok(pixels.wash[0] > 100 && pixels.wash[0] < 245, "watercolor stays translucent");
		assert.ok(pixels.overlap[0] < pixels.wash[0] - 20, "overlapping watercolor deepens color");
		assert.ok(pixels.edge[0] > pixels.wash[0] + 20, "edge is softer than the body");
		assert.deepEqual(pixels.outside, [255, 253, 247, 255]);
		const pdf = await PDFDocument.load(new Uint8Array(await bytes("pdf")));
		assert.equal(pdf.getPageCount(), 1);
		for (const viewport of [
			{ width: 375, height: 812 },
			{ width: 844, height: 390 },
			{ width: 744, height: 1133 },
		]) {
			await page.setViewportSize(viewport);
			await settings();
			const dialog = page.locator(".cube-notes__popover");
			const box = await dialog.boundingBox();
			assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1);
			assert.ok(box.y >= 0 && box.y + box.height <= viewport.height + 1);
			for (const style of ["pencil", "watercolor"]) {
				await page.locator(`[data-pen-style="${style}"]`).click();
				assert.equal(
					await page.locator(`[data-pen-style="${style}"]`).getAttribute("aria-pressed"),
					"true",
				);
			}
			await close();
		}
		assert.deepEqual(
			await bytes("png"),
			png,
			"grain and wash export are independent of view zoom/size",
		);
		assert.deepEqual(errors, []);
		console.log(
			"PASS: real pen pencil/watercolor input, grain/tone pixels, wash transparency/layering/soft edge, strength presets, undo, native/PNG/PDF and mobile layouts",
		);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
