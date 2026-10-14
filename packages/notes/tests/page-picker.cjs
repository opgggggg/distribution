const assert = require("node:assert/strict");
const { chromium, webkit } = require("playwright");
(async () => {
	for (const [name, engine, options] of [
		["chrome", chromium, { channel: "chrome" }],
		["webkit", webkit, {}],
	]) {
		const browser = await engine.launch({ headless: true, ...options });
		try {
			for (const [width, height] of [
				[375, 812],
				[744, 1133],
				[1024, 768],
				[500, 430],
			]) {
				const p = await browser.newPage({ viewport: { width, height }, hasTouch: true });
				const errors = [];
				p.on("pageerror", (e) => errors.push(e.message));
				await p.addInitScript(() => {
					localStorage.setItem("cubeoffice.privacy.consent", "2026-09-07");
					window.auroraHarmonyHost = {
						getPlatform: () => "ios",
						hasNetwork: () => true,
						consumePendingIntent: () => "",
						appReady: () => {},
					};
				});
				await p.goto(process.env.MOBILE_TEST_URL || "http://127.0.0.1:5179/?platform=ios");
				await p.getByRole("button", { name: "新建", exact: true }).click();
				await p.locator(".android-sheet button").filter({ hasText: "手写笔记" }).click();
				await p.locator(".cube-notes.is-writing .cube-notes__ink-canvas").waitFor();
				const pages = p
					.locator(".document-topbar")
					.getByRole("button", { name: "页面", exact: true });
				const stage = p.locator(".cube-notes__viewport");
				const before = await stage.boundingBox();
				await pages.click();
				const popup = p.locator(".cube-notes__page-picker");
				await popup.waitFor();
				const pane = await popup.boundingBox(),
					trigger = await pages.boundingBox();
				assert.ok(
					pane.y >= trigger.y + trigger.height &&
						pane.y <= trigger.y + trigger.height + 12,
					"Picker appears just below its button",
				);
				assert.ok(
					pane.x >= 0 && pane.x + pane.width <= width && pane.y + pane.height <= height,
					"Picker stays on screen",
				);
				assert.deepEqual(
					await stage.boundingBox(),
					before,
					"Opening pages never moves or resizes the canvas",
				);
				assert.equal(await pages.getAttribute("aria-expanded"), "true");
				assert.equal(await p.locator(".cube-notes__sidebar-resizer").count(), 0);
				assert.ok(
					await popup.evaluate((e) =>
						document
							.elementFromPoint(
								e.getBoundingClientRect().left + 20,
								e.getBoundingClientRect().top + 20,
							)
							?.closest(".cube-notes__page-picker"),
					),
					"Overlay is not clipped by the canvas",
				);
				await popup.getByRole("button", { name: "添加页面", exact: true }).click();
				await popup.getByRole("button", { name: "第 2 页", exact: true }).waitFor();
				await popup.getByRole("button", { name: "第 1 页", exact: true }).click();
				await popup.waitFor({ state: "detached" });
				assert.equal(await pages.getAttribute("aria-expanded"), "false");
				assert.equal(
					await pages.evaluate((e) => document.activeElement === e),
					true,
					"Selecting a page returns focus to the trigger",
				);
				await pages.click();
				assert.equal(
					await popup
						.getByRole("button", { name: "第 1 页", exact: true })
						.getAttribute("aria-current"),
					"page",
				);
				await p.keyboard.press("Escape");
				await popup.waitFor({ state: "detached" });
				assert.equal(await pages.evaluate((e) => document.activeElement === e), true);
				await pages.click();
				const revision = await p
					.locator(".cube-notes")
					.evaluate((e) => e.__vueParentComponent.exposed.getRevision());
				await p.mouse.click(20, Math.min(height - 170, 640));
				await popup.waitFor({ state: "detached" });
				assert.equal(
					await p
						.locator(".cube-notes")
						.evaluate((e) => e.__vueParentComponent.exposed.getRevision()),
					revision,
					"Dismissing pages must not paint",
				);
				await p
					.locator(".document-topbar")
					.getByRole("button", { name: "完成编辑", exact: true })
					.click();
				await pages.click();
				await popup.waitFor();
				await popup.getByRole("button", { name: "第 2 页", exact: true }).click();
				await popup.waitFor({ state: "detached" });
				await pages.click();
				assert.equal(
					await popup
						.getByRole("button", { name: "第 2 页", exact: true })
						.getAttribute("aria-current"),
					"page",
					"Readonly page switching works",
				);
				await p.setViewportSize({ width: width === 375 ? 812 : height, height: width });
				await p.waitForTimeout(100);
				const rotated = await popup.boundingBox();
				assert.ok(
					rotated.x >= 0 &&
						rotated.x + rotated.width <= (width === 375 ? 812 : height) &&
						rotated.y + rotated.height <= width,
					"Open picker repositions on rotation",
				);
				await p.screenshot({ path: `.cache/notes-qa/topbar/picker-${name}-${width}.png` });
				assert.deepEqual(errors, []);
				console.log(
					"PASS",
					name,
					width,
					height,
					"anchored page overlay, dismissal, focus, rotation and readonly navigation",
				);
				await p.close();
			}
		} finally {
			await browser.close();
		}
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
