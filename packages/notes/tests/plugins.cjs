const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium } = require("playwright");
(async () => {
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	try {
		const p = await browser.newPage({ viewport: { width: 744, height: 1133 }, hasTouch: true });
		const errors = [];
		p.on("pageerror", (e) => errors.push(e.message));
		await p.goto("http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1");
		await p.locator(".cube-notes__tool-tray").waitFor();
		const book = () => p.evaluate(() => window.notebook.value.getNotebook());
		const cdp = await p.context().newCDPSession(p);
		async function draw(y) {
			const rect = await p.locator(".cube-notes__ink-canvas").boundingBox();
			const page = (await book()).pages[0];
			const point = (x, yy) => ({
				x: rect.x + (x * rect.width) / page.width,
				y: rect.y + (yy * rect.height) / page.height,
			});
			await cdp.send("Input.dispatchMouseEvent", {
				type: "mousePressed",
				...point(80, y),
				button: "left",
				clickCount: 1,
				pointerType: "pen",
				force: 0.3,
			});
			for (let i = 1; i <= 20; i++)
				await cdp.send("Input.dispatchMouseEvent", {
					type: "mouseMoved",
					...point(80 + i * 18, y + 30 * Math.sin((i / 20) * Math.PI * 2)),
					button: "left",
					buttons: 1,
					pointerType: "pen",
					force: 0.2 + i / 25,
				});
			await cdp.send("Input.dispatchMouseEvent", {
				type: "mouseReleased",
				...point(440, y),
				button: "left",
				pointerType: "pen",
			});
		}
		for (const [style, y] of [
			["marker", 100],
			["crayon", 200],
			["reed", 300],
		]) {
			await p.locator(`[data-pen-style="${style}"]`).tap();
			await p.locator(`[data-pen-style="${style}"]`).tap();
			if (style === "reed")
				await p.getByRole("slider", { name: "笔尖角度", exact: true }).fill("75");
			else await p.getByRole("slider", { name: "不透明度", exact: true }).fill("70");
			await p.getByRole("button", { name: "完成", exact: true }).tap();
			await draw(y);
			const ink = (await book()).pages[0].layers[0].elements.at(-1);
			assert.equal(ink.penStyle, style);
			if (style === "reed") assert.equal(ink.brushSettings.angle, 75);
			else assert.equal(ink.opacity, 0.7);
		}
		await p.screenshot({ path: ".cache/notes-qa/freeform-pen-tray-ipad.png" });
		// Register a new extension while an editor is already mounted. No editor/model patch.
		await p.evaluate(async () => {
			const registerBrushPlugin = window.noteBrushPlugins.register;
			const { charcoalBrush } = await import("/packages/notes/examples/charcoal.ts");
			registerBrushPlugin(charcoalBrush);
		});
		await p.waitForFunction(() => document.querySelectorAll("[data-pen-style]").length === 11);
		assert.equal(await p.locator("[data-pen-style]").count(), 11);
		await p.locator('[data-pen-style="example:charcoal"]').tap();
		await p.locator('[data-pen-style="example:charcoal"]').tap();
		await p.getByRole("slider", { name: "柔软度", exact: true }).fill("80");
		await p.getByRole("slider", { name: "笔迹粗细", exact: true }).fill("20");
		await p.getByRole("button", { name: "完成", exact: true }).tap();
		await draw(400);
		let document = await book();
		assert.equal(document.pages[0].layers[0].elements.at(-1).brushSettings.softness, 80);
		await p.getByRole("button", { name: "撤销", exact: true }).tap();
		await p.evaluate(async () => {
			window.noteSource.value = await window.notebook.value.exportFile("cubenote");
		});
		await p.waitForFunction(() => {
			try {
				return window.notebook.value.getNotebook().pages[0].layers[0].elements.length === 3;
			} catch {
				return false;
			}
		});
		await p.getByRole("button", { name: "重做", exact: true }).tap();
		assert.deepEqual(await book(), document);
		await p.screenshot({ path: ".cache/notes-qa/brush-plugins-ipad.png" });
		for (const ext of ["cubenote", "png", "pdf"]) {
			const bytes = await p.evaluate(
				async (ext) =>
					Array.from(
						new Uint8Array(
							await (await window.notebook.value.exportFile(ext)).arrayBuffer(),
						),
					),
				ext,
			);
			await fs.writeFile(`.cache/notes-qa/brush-plugins-demo.${ext}`, Buffer.from(bytes));
			if (ext === "pdf")
				assert.equal(
					(await require("pdf-lib").PDFDocument.load(Buffer.from(bytes))).getPageCount(),
					1,
				);
		}
		assert.deepEqual(errors, []);
		console.log(
			"PASS: actual marker/crayon/reed input, angle/opacity, runtime charcoal plugin discovery/controls, saved-history reopen and PNG/PDF",
		);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
