const assert = require("node:assert/strict"),
	{ chromium } = require("playwright");
(async () => {
	const b = await chromium.launch({ channel: "chrome", headless: true });
	try {
		for (const [width, height] of [
			[375, 844],
			[744, 1133],
			[844, 390],
		]) {
			const p = await b.newPage({
				viewport: { width, height },
				hasTouch: true,
				isMobile: true,
			});
			const errors = [];
			p.on("pageerror", (e) => errors.push(e.message));
			await p.goto("http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1");
			await p.locator(".cube-notes__tool-tray").waitFor();
			const cdp = await p.context().newCDPSession(p),
				book = () => p.evaluate(() => window.notebook.value.getNotebook());
			async function touch(type, points) {
				await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
			}
			await p.getByRole("button", { name: "更多工具", exact: true }).tap();
			await p.getByRole("button", { name: "美纹纸", exact: true }).tap();
			assert.equal(
				await p.locator(".cube-notes__popover").isVisible(),
				false,
				"placement leaves the page uncovered",
			);
			const nav = await p.locator(".cube-notes__tape-controls").boundingBox();
			assert.ok(nav.x >= 0 && nav.x + nav.width <= width && nav.y + nav.height <= height);
			const original = (await book()).pages[0].tapes[0];
			assert.equal(
				(await book()).pages[0].tapes.length,
				1,
				"first open places one visible strip",
			);
			const paper = await p.locator(".cube-notes__ink-canvas").boundingBox(),
				zoom = paper.width / (await book()).pages[0].width;
			const center = { x: paper.x + original.x * zoom, y: paper.y + original.y * zoom };
			const radius = Math.min(60, (original.width * zoom) / 4);
			const start = [
				{ x: center.x - radius, y: center.y, id: 1 },
				{ x: center.x + radius, y: center.y, id: 2 },
			];
			await touch("touchStart", start);
			for (let i = 1; i <= 8; i++) {
				const theta = ((i / 8) * Math.PI) / 4;
				await touch("touchMove", [
					{
						x: center.x - radius * Math.cos(theta) + 18,
						y: center.y - radius * Math.sin(theta),
						id: 1,
					},
					{
						x: center.x + radius * Math.cos(theta) + 18,
						y: center.y + radius * Math.sin(theta),
						id: 2,
					},
				]);
			}
			// Releasing one contact must not commit or leave a stale pointer behind.
			await touch("touchEnd", [
				{
					x: center.x + radius * Math.cos(Math.PI / 4) + 18,
					y: center.y + radius * Math.sin(Math.PI / 4),
					id: 2,
				},
			]);
			assert.equal((await book()).pages[0].tapes[0].angle, original.angle);
			await touch("touchEnd", []);
			const rotated = (await book()).pages[0].tapes[0];
			assert.equal(rotated.angle, 45);
			assert.ok(Math.abs(rotated.x - original.x - 18 / zoom) < 0.1);
			assert.ok(
				Math.abs(
					(await p.locator(".cube-notes__paper").boundingBox()).width - paper.width,
				) < 0.1,
				"two-finger tape rotation does not zoom paper",
			);
			await p.evaluate(() => window.notebook.value.undo());
			assert.deepEqual(
				(await book()).pages[0].tapes[0],
				original,
				"a whole gesture has one undo",
			);
			await p.evaluate(() => window.notebook.value.redo());
			assert.equal((await book()).pages[0].tapes[0].angle, 45);
			const beforeCancel = (await book()).pages[0].tapes[0],
				grab = p.locator(".cube-notes__tape-grab"),
				box = await grab.boundingBox();
			await touch("touchStart", [
				{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 3 },
			]);
			await touch("touchMove", [
				{ x: box.x + box.width / 2 + 20, y: box.y + box.height / 2 + 12, id: 3 },
			]);
			await touch("touchCancel", []);
			assert.deepEqual((await book()).pages[0].tapes[0], beforeCancel);
			const handle = p.getByRole("button", { name: "调整胶带右端", exact: true }),
				end = await handle.boundingBox();
			assert.ok(end.width >= 44 && end.height >= 44);
			await touch("touchStart", [
				{ x: end.x + end.width / 2, y: end.y + end.height / 2, id: 4 },
			]);
			await touch("touchMove", [
				{ x: end.x + end.width / 2 + 25, y: end.y + end.height / 2 + 25, id: 4 },
			]);
			await touch("touchEnd", []);
			assert.ok((await book()).pages[0].tapes[0].width > beforeCancel.width + 20 / zoom);
			await p.screenshot({ path: `.cache/notes-qa/tape-direct-${width}.png` });
			await p.getByRole("button", { name: "开始绘画", exact: true }).tap();
			assert.equal(await p.locator(".cube-notes__tape-controls").count(), 0);
			const trayBefore = await p.locator(".cube-notes__tool-tray").boundingBox(),
				scaleBefore = await p.evaluate(() => visualViewport.scale);
			await p.getByRole("button", { name: "更多颜色", exact: true }).tap();
			const title = await p.locator("#cube-notes-dialog-title").boundingBox();
			const chromeY = title.y + title.height / 2,
				chromeX = title.x + title.width / 2;
			await touch("touchStart", [
				{ x: chromeX - 20, y: chromeY, id: 7 },
				{ x: chromeX + 20, y: chromeY, id: 8 },
			]);
			await touch("touchMove", [
				{ x: chromeX - 30, y: chromeY, id: 7 },
				{ x: chromeX + 30, y: chromeY, id: 8 },
			]);
			await touch("touchEnd", []);
			await p.getByRole("tab", { name: "滑块", exact: true }).tap();
			assert.equal(
				await p
					.getByRole("textbox", { name: "颜色十六进制值" })
					.evaluate((e) => getComputedStyle(e).userSelect),
				"text",
			);
			await p.getByRole("button", { name: "关闭选色板", exact: true }).tap();

			assert.equal(await p.evaluate(() => visualViewport.scale), scaleBefore);
			assert.deepEqual(
				await p.locator(".cube-notes__tool-tray").boundingBox(),
				trayBefore,
				"chrome does not scale",
			);
			await touch("touchStart", [
				{ x: width / 2 - 35, y: 90, id: 5 },
				{ x: width / 2 + 35, y: 90, id: 6 },
			]);
			await touch("touchMove", [
				{ x: width / 2 - 60, y: 90, id: 5 },
				{ x: width / 2 + 60, y: 90, id: 6 },
			]);
			await touch("touchEnd", []);
			assert.ok(
				(await p.locator(".cube-notes__paper").boundingBox()).width > paper.width * 1.2,
				"paper still supports pinch zoom",
			);
			assert.deepEqual(
				await p.locator(".cube-notes__tool-tray").boundingBox(),
				trayBefore,
				"canvas pinch leaves tools fixed",
			);
			assert.equal(
				await p
					.locator(".cube-notes__tray-grip")
					.evaluate((e) => getComputedStyle(e).userSelect),
				"none",
			);
			await p.getByRole("button", { name: "更多颜色", exact: true }).tap();
			assert.equal(
				await p
					.getByRole("textbox", { name: "颜色十六进制值" })
					.evaluate((e) => getComputedStyle(e).userSelect),
				"text",
				"editable fields retain selection",
			);
			assert.deepEqual(errors, []);
			await p.close();
		}
		console.log(
			"PASS: direct tape placement, two-finger rotation, endpoint resizing, cancellation, one-step undo, fixed chrome and canvas-only zoom",
		);
	} finally {
		await b.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
