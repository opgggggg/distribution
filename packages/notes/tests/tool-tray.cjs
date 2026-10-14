const assert = require("node:assert/strict");
const { chromium } = require("playwright");

(async () => {
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	const errors = [];
	try {
		for (const [width, height] of [
			[375, 812],
			[390, 844],
			[744, 1133],
			[1024, 768],
			[844, 390],
		]) {
			const p = await browser.newPage({ viewport: { width, height }, hasTouch: true });
			p.on("pageerror", (e) => errors.push(e.message));
			await p.goto("http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1");
			const tray = p.getByRole("toolbar", { name: "画笔工具盒" });
			await tray.waitFor();
			assert.equal(await p.locator(".cube-notes__sidebar").count(), 0);
			assert.equal(await tray.locator("[data-pen-style]").count(), 10);
			const box = await tray.boundingBox();
			assert.ok(box.x >= 12 && box.x + box.width <= width - 11);
			assert.ok(box.y + box.height <= height - 12);
			assert.ok(
				await tray
					.locator("button")
					.evaluateAll((bs) =>
						bs.every((b) => b.offsetWidth >= 44 && b.offsetHeight >= 44),
					),
			);
			if (width >= 680) {
				if (width >= 900)
					assert.ok(
						await tray
							.locator(".cube-notes__pen-strip")
							.evaluate((e) => e.scrollWidth <= e.clientWidth),
					);
				assert.equal(await tray.locator(".cube-notes__tray-swatch").count(), 5);
			}
			const count = () =>
				p.evaluate(
					() => window.notebook.value.getNotebook().pages[0].layers[0].elements.length,
				);
			await p.locator('[data-pen-style="watercolor"]').tap();
			assert.equal(
				await p.locator('[data-pen-style="watercolor"]').getAttribute("aria-pressed"),
				"true",
			);
			assert.equal(await p.locator(".cube-notes__popover").count(), 0);
			await p.locator('[data-pen-style="watercolor"]').tap();
			await p.getByRole("slider", { name: "笔迹粗细", exact: true }).fill("36");
			await p.getByRole("slider", { name: "浓度", exact: true }).fill("30");
			const menu = await p.locator(".cube-notes__popover").boundingBox();
			assert.ok(
				menu.y >= 64 && menu.y + menu.height < box.y,
				"settings stay clear of the pen strip",
			);
			await p.screenshot({ path: `.cache/notes-qa/tray-settings-${width}.png` });
			await p.getByRole("button", { name: "完成", exact: true }).tap();
			await tray.getByRole("button", { name: "更多颜色", exact: true }).tap();
			await p.getByRole("tab", { name: "滑块", exact: true }).tap();
			await p.getByRole("textbox", { name: "颜色十六进制值" }).fill("#dc3658");
			await p.getByRole("button", { name: "关闭选色板", exact: true }).tap();
			if (width === 1024) {
				const tips = await tray
					.locator(".cube-notes__pen-glyph")
					.evaluateAll(async (glyphs) => {
						return Promise.all(
							glyphs.map(async (svg) => {
								const clone = svg.cloneNode(true);
								clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
								clone.setAttribute("width", "44");
								clone.setAttribute("height", "120");
								const img = new Image();
								img.src =
									"data:image/svg+xml," +
									encodeURIComponent(
										new XMLSerializer().serializeToString(clone),
									);
								await img.decode();
								const canvas = document.createElement("canvas");
								canvas.width = 44;
								canvas.height = 120;
								const ctx = canvas.getContext("2d");
								ctx.drawImage(img, 0, 0);
								const pixels = ctx.getImageData(0, 0, 44, 40).data;
								let coverage = 0;
								for (let i = 3; i < pixels.length; i += 4)
									if (pixels[i] > 100) coverage++;
								return {
									tool: svg
										.querySelector("[data-pen-tip]")
										.getAttribute("data-pen-tip"),
									coverage,
								};
							}),
						);
					});
				assert.equal(tips.length, 13);
				for (const tip of tips)
					assert.ok(
						tip.coverage > 30,
						`${tip.tool} must have a visible nib after switching colors`,
					);
			}
			await p.locator('[data-pen-style="brush"]').tap();
			await p.locator('[data-pen-style="watercolor"]').tap();
			await p.locator('[data-pen-style="watercolor"]').tap();
			assert.equal(
				await p.getByRole("slider", { name: "笔迹粗细", exact: true }).inputValue(),
				"36",
			);
			assert.equal(
				await p.getByRole("slider", { name: "浓度", exact: true }).inputValue(),
				"30",
			);
			await p.getByRole("button", { name: "完成", exact: true }).tap();
			await p.mouse.move(width / 2 - 40, 150);
			await p.mouse.down();
			await p.mouse.move(width / 2 + 40, 180, { steps: 8 });
			await p.mouse.up();
			assert.equal(await count(), 1);
			const stroke = await p.evaluate(
				() => window.notebook.value.getNotebook().pages[0].layers[0].elements[0],
			);
			assert.equal(stroke.penStyle, "watercolor");
			assert.equal(stroke.color, "#dc3658");
			assert.equal(stroke.width, 36);
			assert.equal(stroke.opacity, 0.3);
			await tray.getByRole("button", { name: "撤销", exact: true }).tap();
			assert.equal(await count(), 0);
			await tray.getByRole("button", { name: "重做", exact: true }).tap();
			assert.equal(await count(), 1);
			const grip = tray.getByRole("button", { name: "移动画笔工具栏" });
			const g = await grip.boundingBox();
			await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
			await p.mouse.down();
			await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2 - 100, { steps: 8 });
			await p.mouse.up();
			assert.ok(Math.abs((await tray.boundingBox()).y - box.y + 100) < 1);
			assert.equal(await count(), 1, "dragging tools must not draw");
			await p.locator('[data-pen-style="watercolor"]').tap();
			const movedMenu = await p.locator(".cube-notes__popover").boundingBox();
			const movedTray = await tray.boundingBox();
			assert.ok(
				movedMenu.y + movedMenu.height <= movedTray.y ||
					movedMenu.y >= movedTray.y + movedTray.height,
			);
			await p.getByRole("button", { name: "完成", exact: true }).tap();
			await grip.press("Home");
			assert.ok(Math.abs((await tray.boundingBox()).y - box.y) < 1);
			await tray.getByRole("button", { name: "更多工具", exact: true }).tap();
			await p
				.locator(".cube-notes__popover")
				.getByRole("button", { name: "文字", exact: true })
				.tap();
			assert.equal(await p.locator(".cube-notes__tool-tray").count(), 0);
			await p.locator('[data-tool="pen"]').tap();
			await p.locator('[data-tool="lasso"]').tap();
			assert.equal(await tray.count(), 1, "lasso retains direct access to pens");
			await p.screenshot({ path: `.cache/notes-qa/tray-${width}.png` });
			await p.emulateMedia({ colorScheme: "dark" });
			if (width === 744) await p.screenshot({ path: ".cache/notes-qa/tray-ipad-dark.png" });
			await p.close();
		}
		assert.deepEqual(errors, []);
		console.log(
			"PASS: phone/iPad pen silhouettes, direct selection, presets, colors, undo/redo, popup bounds, dragging/reset and alternate tools",
		);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
