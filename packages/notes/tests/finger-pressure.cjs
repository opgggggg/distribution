const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

(async () => {
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	try {
		const page = await browser.newPage({
			viewport: { width: 390, height: 844 },
			hasTouch: true,
		});
		const output = path.resolve(__dirname, "../../../.cache/notes-qa");
		await fs.mkdir(output, { recursive: true });
		const errors = [];
		page.on("pageerror", (e) => errors.push(e.message));
		await page.goto("http://127.0.0.1:5178/packages/notes/tests/viewer.html");
		await page.locator(".cube-notes__ink-canvas").waitFor();
		const book = () => page.evaluate(() => window.notebook.value.getNotebook());
		const ink = async () => (await book()).pages[0].layers[0].elements;
		const { inkWidth, readNotebook } = await import("../dist/index.js");
		const cdp = await page.context().newCDPSession(page);
		async function preset(style, enabled = true) {
			await page.locator('[data-tool="pen"]').click();
			await page.locator(`[data-pen-style="${style}"]`).click();
			const checkbox = page.getByRole("checkbox", { name: "压感", exact: true });
			if (style !== "ballpoint") await checkbox.setChecked(enabled);
			await page.getByRole("button", { name: "完成", exact: true }).click();
		}
		async function draw(y, duration) {
			const rect = await page.locator(".cube-notes__ink-canvas").boundingBox();
			const model = (await book()).pages[0];
			const toScreen = (x) => ({
				x: rect.x + (x * rect.width) / model.width,
				y: rect.y + (y * rect.height) / model.height,
				id: 1,
			});
			const steps = duration ? 40 : 10;
			// Replay recorded input times: CDP round trips/render load must not change writing speed.
			const traceDuration = duration || 80;
			const traceStart = Date.now() / 1000 - traceDuration / 1000;
			await cdp.send("Input.dispatchTouchEvent", {
				type: "touchStart",
				timestamp: traceStart,
				touchPoints: [toScreen(60)],
			});
			for (let i = 1; i <= steps; i++) {
				if (duration) await page.waitForTimeout(duration / steps);
				await cdp.send("Input.dispatchTouchEvent", {
					type: "touchMove",
					timestamp: traceStart + (i * traceDuration) / steps / 1000,
					touchPoints: [toScreen(60 + (i * 200) / steps)],
				});
			}
			await cdp.send("Input.dispatchTouchEvent", {
				type: "touchEnd",
				timestamp: traceStart + traceDuration / 1000,
				touchPoints: [],
			});
			await page.waitForTimeout(40);
			return (await ink()).at(-1);
		}
		await preset("brush");
		const slow = await draw(100, 2400),
			fast = await draw(170, 0);
		assert.equal(slow.pressure, true);
		assert.equal(fast.pressure, true);
		const slowWidth = inkWidth(slow, slow.points.at(-1)),
			fastWidth = inkWidth(fast, fast.points.at(-1));
		assert.ok(slowWidth > fastWidth * 2.8, `slow=${slowWidth}, fast=${fastWidth}`);
		await page.screenshot({
			path: path.join(output, "finger-pressure-comparison.png"),
			clip: { x: 40, y: 70, width: 240, height: 130 },
		});
		await preset("brush", false);
		const fixed = await draw(240, 2400);
		assert.equal(fixed.pressure, false);
		assert.equal(inkWidth(fixed, fixed.points.at(-1)), fixed.width);
		await preset("ballpoint", true);
		assert.equal((await draw(310, 2400)).pressure, false);
		await preset("brush");
		await draw(380, 2400);
		const saved = await page.evaluate(async () =>
			Array.from(
				new Uint8Array(
					await (await window.notebook.value.exportFile("cubenote")).arrayBuffer(),
				),
			),
		);
		assert.deepEqual(
			readNotebook(new Uint8Array(saved)).pages[0].layers[0].elements,
			await ink(),
		);
		// Export through the application so the preview uses the same rendering as the iPad.
		await page.screenshot({ path: path.join(output, "finger-pressure-phone.png") });
		const png = await page.evaluate(async () =>
			Array.from(
				new Uint8Array(await (await window.notebook.value.exportFile("png")).arrayBuffer()),
			),
		);
		await fs.writeFile(path.join(output, "finger-pressure.png"), Buffer.from(png));
		assert.deepEqual(errors, []);
		console.log(
			`PASS: touch speed changes brush width (${slowWidth.toFixed(1)}pt slow / ${fastWidth.toFixed(1)}pt fast), pressure-off, ballpoint and native roundtrip`,
		);
	} finally {
		await browser.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
