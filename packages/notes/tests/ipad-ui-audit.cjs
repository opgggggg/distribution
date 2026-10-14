const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const fs = require("node:fs");

(async () => {
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	const results = [];
	try {
		for (const [width, height] of [
			[744, 1076],
			[1133, 687],
			[507, 744],
			[744, 550],
		]) {
			for (const colorScheme of ["light", "dark"]) {
				const page = await browser.newPage({
					viewport: { width, height },
					hasTouch: true,
					colorScheme,
					reducedMotion: "reduce",
				});
				const errors = [];
				page.on("pageerror", (error) => errors.push(error.message));
				await page.addInitScript(() =>
					localStorage.setItem("cubeoffice.privacy.consent", "2026-09-07"),
				);
				await page.goto("http://127.0.0.1:5179/?platform=ios");
				await page.locator(".android-library").waitFor();
				await page.getByRole("button", { name: "新建", exact: true }).click();
				await page.locator(".android-sheet button").filter({ hasText: "手写笔记" }).click();
				await page.locator(".cube-notes__tool-tray").waitFor();
				const initialTray = await page.locator(".cube-notes__tool-tray").boundingBox();
				assert.ok(Math.abs(initialTray.x + initialTray.width / 2 - width / 2) < 1, "the drawing tray starts centered, including landscape");
				const strip = page.locator(".cube-notes__pen-strip");
				assert.equal(await strip.locator("[data-pen-style]").count(), 10);
				for (const style of ["oil", "spray", "brush", "fountain"]) {
					const pen = strip.locator(`[data-pen-style="${style}"]`);
					await pen.scrollIntoViewIfNeeded();
					await pen.tap();
					assert.equal(await pen.getAttribute("aria-pressed"), "true");
				}
				await page.locator('[data-pen-style="fountain"]').tap();
				const menu = await page.locator(".cube-notes__popover").boundingBox();
				assert.ok(
					menu.x >= 0 &&
						menu.y >= 0 &&
						menu.x + menu.width <= width &&
						menu.y + menu.height <= height,
					"settings fit portrait, landscape, split view and keyboard-sized view",
				);
				await page.getByRole("button", { name: "完成", exact: true }).tap();
				await page.locator(".android-notes-pages").tap();
				const controls = await page
					.locator(".cube-notes__sidebar button")
					.evaluateAll((buttons) =>
						buttons
							.filter((e) => e.offsetWidth && e.offsetHeight)
							.map((e) => ({
								name: e.getAttribute("aria-label") || e.textContent.trim(),
								width: e.offsetWidth,
								height: e.offsetHeight,
							})),
					);
				assert.ok(
					controls.every((e) => e.width >= 44 && e.height >= 44),
					JSON.stringify(controls),
				);
				await page
					.locator(".cube-notes__sidebar")
					.getByRole("button", { name: "添加页面", exact: true })
					.tap();
				await page.getByRole("button", { name: "第 2 页", exact: true }).waitFor();
				await page.getByRole("button", { name: "第 1 页", exact: true }).tap();
				if (await page.locator(".cube-notes__sidebar").count())
					await page.locator(".android-notes-pages").tap();
				const top = await page.locator(".android-topbar button").evaluateAll((buttons) =>
					buttons
						.filter((e) => e.offsetWidth)
						.map((e) => {
							const rect = e.getBoundingClientRect();
							return {
								name: e.getAttribute("aria-label"),
								hit: e.contains(
									document.elementFromPoint(
										rect.x + rect.width / 2,
										rect.y + rect.height / 2,
									),
								),
							};
						}),
				);
				assert.ok(
					top.every((e) => e.hit),
					JSON.stringify(top),
				);
				assert.ok(
					parseFloat(
						await page
							.locator(".cube-notes__pen-glyph")
							.first()
							.evaluate((e) => getComputedStyle(e).transitionDuration),
					) < 0.001,
				);
				assert.ok(
					await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
					"app chrome does not overflow horizontally",
				);
				await page.screenshot({
					path: `.cache/notes-qa/ipad-audit-${width}-${height}-${colorScheme}.png`,
				});
				await page.getByRole("button", { name: "完成书写", exact: true }).tap();
				await page
					.locator(".android-topbar")
					.getByRole("button", { name: "返回", exact: true })
					.tap();
				await page.locator('.cube-notes[data-readonly="true"]').waitFor();
				assert.equal(await page.locator(".cube-notes__tool-tray").count(), 0);
				if (!(await page.locator(".cube-notes__sidebar").count()))
					await page.locator(".android-notes-pages").tap();
				await page.getByRole("button", { name: "第 2 页", exact: true }).tap();
				if (!(await page.locator(".cube-notes__sidebar").count()))
					await page.locator(".android-notes-pages").tap();
				assert.equal(
					await page
						.getByRole("button", { name: "第 2 页", exact: true })
						.getAttribute("aria-current"),
					"page",
				);
				assert.deepEqual(errors, []);
				results.push({ width, height, colorScheme, pass: true });
				await page.close();
			}
		}
		fs.writeFileSync(".cache/notes-qa/ipad-ui-audit.json", JSON.stringify(results, null, 2));
		console.log(
			"PASS: iPad portrait/landscape, Split View and keyboard-sized layout in both themes; all pens; panel bounds; 44pt page controls; topbar hit targets; reduced motion; readonly page switching",
		);
	} finally {
		await browser.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
