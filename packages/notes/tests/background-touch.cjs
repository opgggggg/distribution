const assert = require("node:assert/strict"),
	{ chromium } = require("playwright");
(async () => {
	const browser = await chromium.launch({ headless: true, channel: "chrome" });
	try {
		for (const turn of [0, 1]) {
			const p = await browser.newPage({
				viewport: { width: 744, height: 1133 },
				hasTouch: true,
			});
			const errors = [];
			p.on("pageerror", (e) => errors.push(e.message));
			await p.goto(
				"http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1&infinite=1",
			);
			const ink = p.locator(".cube-notes__ink-canvas");
			await ink.waitFor();
			await p.waitForFunction(() => window.notebook.value?.getNotebook());
			await p.evaluate(async () => {
				const { createNotebook } = await import("/packages/notes/src/model.ts"),
					{ writeNotebook } = await import("/packages/notes/src/codec.ts");
				const book = createNotebook("Touch Background", true),
					c = document.createElement("canvas");
				c.width = c.height = 10;
				const ctx = c.getContext("2d");
				ctx.fillStyle = "#3355aa";
				ctx.fillRect(0, 0, 10, 10);
				book.pages[0].background = {
					id: "photo",
					kind: "image",
					src: c.toDataURL(),
					x: 100,
					y: 100,
					width: 400,
					height: 300,
					opacity: 0.4,
				};
				window.noteSource.value = writeNotebook(book);
			});
			await p.waitForFunction(() => {
				try {
					return window.notebook.value.getNotebook().title === "Touch Background";
				} catch {
					return false;
				}
			});
			async function menu(name) {
				await p.getByRole("button", { name: "更多工具", exact: true }).click();
				await p.getByRole("button", { name, exact: true }).click();
				await p.waitForTimeout(100);
			}
			if (turn) await menu("旋转画布 90°");
			await menu("调整背景");
			const doc = () => p.evaluate(() => window.notebook.value.getNotebook()),
				before = (await doc()).pages[0].background;
			const grab = await p
					.getByRole("button", { name: "移动背景图", exact: true })
					.boundingBox(),
				cx = grab.x + grab.width / 2,
				cy = grab.y + grab.height / 2;
			const dims = () =>
				p.locator(".cube-notes__paper-canvas").evaluate((e) => [e.width, e.height]);
			const initial = await dims();
			const revision = await p.evaluate(() => window.notebook.value.getRevision());
			const cdp = await p.context().newCDPSession(p),
				contacts = (angle, scale) =>
					[-1, 1].map((sign, i) => ({
						id: i + 1,
						x: cx + sign * 45 * scale * Math.cos(angle),
						y: cy + sign * 45 * scale * Math.sin(angle),
						radiusX: 2,
						radiusY: 2,
						force: 0.5,
					}));
			await cdp.send("Input.dispatchTouchEvent", {
				type: "touchStart",
				touchPoints: contacts(0, 1),
			});
			const began = Date.now();
			for (let step = 1; step <= 16; step++)
				await cdp.send("Input.dispatchTouchEvent", {
					type: "touchMove",
					touchPoints: contacts(((step / 16) * Math.PI) / 5, 1 + (step / 16) * 0.3),
				});
			await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
			await p.waitForTimeout(80);
			const after = (await doc()).pages[0].background;
			assert.ok(
				after.width > before.width * 1.25 && after.width < before.width * 1.35,
				"two fingers scale background without zooming app",
			);
			assert.ok(after.angle > 30 && after.angle < 40, "two fingers freely rotate background");
			assert.deepEqual(await dims(), initial, "gesture retains bounded raster allocation");
			assert.equal(
				(await doc()).pages[0].layers[0].elements.length,
				0,
				"adjustment never draws ink",
			);
			const panel = p.getByRole("navigation", { name: "调整背景", exact: true });
			await panel.getByRole("button", { name: "撤销", exact: true }).click();
			assert.deepEqual(
				(await doc()).pages[0].background,
				before,
				"entire two-finger gesture is one undo transaction",
			);
			await panel.getByRole("button", { name: "重做", exact: true }).click();
			assert.deepEqual((await doc()).pages[0].background, after);
			await panel.getByRole("button", { name: "完成", exact: true }).click();
			assert.equal(await p.locator(".cube-notes__background-overlay").count(), 0);
			assert.deepEqual(errors, []);
			console.log(
				`PASS touch canvas ${turn * 90}°: native two-finger scale/rotate, single undo and bounded raster; 16 moves in ${Date.now() - began} ms`,
			);
			await p.close();
		}
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
