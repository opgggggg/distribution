import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
const url = process.env.GALLERY_TEST_URL ?? "http://127.0.0.1:5179/?platform=ios";
for (const engine of [chromium]) {
	const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
	try {
		for (const [width, height] of [
			[744, 1133],
			[1133, 744],
			[375, 812],
		]) {
			const p = await browser.newPage({ viewport: { width, height }, hasTouch: true });
			const errors = [];
			p.on("pageerror", (e) => errors.push(e.message));
			p.on("console", (m) => {
				if (m.type() === "error") console.log("BROWSER", m.text());
			});
			await p.addInitScript(() =>
				localStorage.setItem("cubeoffice.privacy.consent", "2026-09-07"),
			);
			await p.goto(url);
			await p.getByRole("button", { name: "新建", exact: true }).click();
			await p.locator(".android-sheet button").filter({ hasText: "手写笔记" }).click();
			await p.locator(".cube-notes__ink-canvas").waitFor();
			await p.waitForFunction(
				() => !document.querySelector(".document-topbar__mode")?.disabled,
			);
			assert.equal(
				await p.evaluate(() => window.auroraPrepareForClose()),
				true,
				"local draft persisted before returning home",
			);
			await p
				.locator(".document-topbar")
				.getByRole("button", { name: "完成编辑", exact: true })
				.click();
			await p
				.locator(".document-topbar")
				.getByRole("button", { name: "编辑文档", exact: true })
				.waitFor();
			await p
				.locator(".document-topbar")
				.getByRole("button", { name: "返回", exact: true })
				.click();
			await p.locator(".android-file-row").waitFor();
			// Seed isolated browser documents, never the user's device library.
			await p.evaluate(async () => {
				const { listHarmonyAutosaves, writeHarmonyAutosave } = await import(
					"/src/autosave-store.ts"
				);
				const base = (await listHarmonyAutosaves())[0];
				for (let i = 0; i < 7; i++)
					await writeHarmonyAutosave({
						...base,
						id: "gallery-fixture-" + i,
						fileName: i === 0 ? "画画练习.cubenote" : `文档 ${i}.cubenote`,
						savedAt: Date.now() - i * 1000,
					});
			});
			await p.reload();
			await p.locator(".android-file-row").first().waitFor();
			assert.equal(await p.locator(".android-file-row").count(), 8);
			const entries = p.locator(".android-file-entry");
			const a = await entries.nth(0).boundingBox(),
				b = await entries.nth(1).boundingBox();
			if (width >= 600) {
				assert.ok(Math.abs(a.y - b.y) < 1);
				assert.ok(b.x > a.x + a.width);
			} else assert.ok(b.y > a.y + a.height - 1);
			assert.equal(
				await p.locator('.android-library button[aria-label^="修改文件名"]').count(),
				0,
			);
			await p.screenshot({ path: `.cache/notes-qa/gallery-${engine.name()}-${width}.png` });
			const card = p.getByRole("button", { name: "打开 画画练习.cubenote", exact: true });
			await card.scrollIntoViewIfNeeded();
			const r = await card.boundingBox();
			await p.mouse.move(r.x + r.width / 2, r.y + 35);
			await p.mouse.down();
			await p.waitForTimeout(560);
			await p.locator(".android-file-menu[open]").waitFor();
			await p.mouse.up();
			assert.ok(
				await p.locator(".android-library").isVisible(),
				"long press must not open document",
			);
			const menu = p.locator(".android-file-menu[open]");
			await menu.evaluate((e) =>
				Promise.allSettled(e.getAnimations().map((a) => a.finished)),
			);
			const m = await menu.boundingBox();
			assert.ok(
				m.x >= 0 && m.x + m.width <= width + 1 && m.y >= 0 && m.y + m.height <= height + 1,
				JSON.stringify(m),
			);
			for (const button of await menu.locator("button").all()) {
				const rect = await button.boundingBox();
				assert.ok(rect.width >= 44 && rect.height >= 44);
			}
			await p.screenshot({
				path: `.cache/notes-qa/gallery-menu-${engine.name()}-${width}.png`,
			});
			await p.keyboard.press("Escape");
			await menu.waitFor({ state: "hidden" });
			// Scroll gestures must cancel the long press, without navigation.
			await card.dispatchEvent("pointerdown", {
				pointerId: 1,
				pointerType: "touch",
				button: 0,
				clientX: 100,
				clientY: 200,
			});
			await card.dispatchEvent("pointermove", {
				pointerId: 1,
				pointerType: "touch",
				clientX: 100,
				clientY: 250,
			});
			await card.dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch" });
			await p.waitForTimeout(550);
			assert.equal(await p.locator(".android-file-menu[open]").count(), 0);
			await p
				.getByRole("button", { name: "文件操作 画画练习.cubenote", exact: true })
				.click();
			await menu.getByRole("button", { name: "删除", exact: true }).click();
			const confirmation = p.getByRole("dialog").filter({ hasText: "删除文档" });
			await confirmation.getByRole("button", { name: "取消", exact: true }).click();
			assert.equal(await card.count(), 1, "cancel keeps file");
			await p
				.getByRole("button", { name: "文件操作 画画练习.cubenote", exact: true })
				.click();
			await menu.getByRole("button", { name: "删除", exact: true }).click();
			await confirmation.getByRole("button", { name: "删除", exact: true }).click();
			await card.waitFor({ state: "hidden" });
			await p.reload();
			await p.locator(".android-file-row").first().waitFor();
			assert.equal(await card.count(), 0, "deleted draft stays absent after reload");
			assert.equal(await p.locator(".android-file-row").count(), 7);
			// Opening through the menu preserves the reading mode; editing is still available.
			const other = p.locator(".android-file-row").first();
			await other.focus();
			await p.keyboard.press("Shift+F10");
			await menu.getByRole("button", { name: "编辑", exact: true }).click();
			await p.locator(".cube-notes.is-writing .cube-notes__ink-canvas").waitFor();
			await p.waitForFunction(
				() => !document.querySelector(".document-topbar__mode")?.disabled,
			);
			assert.equal(
				await p.evaluate(() => window.auroraPrepareForClose()),
				true,
				"local draft persisted before returning home",
			);
			await p
				.locator(".document-topbar")
				.getByRole("button", { name: "完成编辑", exact: true })
				.click();
			await p
				.locator(".document-topbar")
				.getByRole("button", { name: "编辑文档", exact: true })
				.waitFor();
			await p
				.locator(".document-topbar")
				.getByRole("button", { name: "返回", exact: true })
				.click();
			const open = p.locator(".android-file-entry").filter({ hasText: "已打开" }).first();
			await open.getByRole("button", { name: /^文件操作 / }).click();
			await menu.getByRole("button", { name: "删除", exact: true }).click();
			await confirmation.getByRole("button", { name: "删除", exact: true }).click();
			await open.waitFor({ state: "hidden" });
			await p.waitForTimeout(1100);
			await p.reload();
			await p.locator(".android-file-row").first().waitFor();
			assert.equal(
				await p.locator(".android-file-row").count(),
				6,
				"autosave/preview cannot resurrect deleted open document",
			);
			assert.deepEqual(errors, []);
			await p.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
			await p.evaluate(() => new Promise(requestAnimationFrame));
			assert.equal(
				await p
					.locator(".android-file-copy strong")
					.first()
					.evaluate(
						(e) =>
							getComputedStyle(e).color ===
							getComputedStyle(e.closest(".android-file-row")).color,
					),
				true,
				"filename contrast follows shell theme",
			);
			await p.screenshot({
				path: `.cache/notes-qa/gallery-dark-${engine.name()}-${width}.png`,
			});
			await p.close();
			console.log(
				`PASS ${engine.name()} ${width}: gallery, press/scroll, menu bounds, cancellation and persistent deletion`,
			);
		}
	} finally {
		await browser.close();
	}
}

// Playwright's macOS WebKit cannot store Blob in IndexedDB (UnknownError while
// preparing Blob/File data). Exercise its actual Vue component independently;
// Chromium above verifies the host's durable storage and autosave deletion races.
const safari = await webkit.launch();
try {
	for (const [width, height] of [
		[744, 1133],
		[1133, 744],
		[375, 812],
	]) {
		const p = await safari.newPage({ viewport: { width, height }, hasTouch: true });
		const errors = [];
		p.on("pageerror", (e) => errors.push(e.message));
		await p.route("**/gallery-fixture", (route) =>
			route.fulfill({
				contentType: "text/html",
				body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#app{margin:0;width:100%;height:100%;overflow:hidden}</style><div id="app"></div>',
			}),
		);
		await p.goto(new URL("/gallery-fixture", url).href);
		await p.evaluate(async () => {
			const source = await (await fetch("/src/android/AndroidWorkspace.vue")).text();
			const vueModule = source.match(/from "([^"]*\/vue\.js[^"]*)"/)[1];
			const { createApp, h, ref } = await import(vueModule);
			const { default: Workspace } = await import("/src/android/AndroidWorkspace.vue");
			await import("/src/styles.css");
			await import("/src/android/android.css");
			const files = ref(
				Array.from({ length: 8 }, (_, i) => ({
					id: "fixture-" + i,
					fileName: "画画练习 " + i + ".cubenote",
					format: i === 7 ? "pdf" : "notes",
					savedAt: Date.now(),
					preview:
						"data:image/svg+xml," +
						encodeURIComponent(
							'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#fffdf5"/><path d="M20 170 Q80 20 140 150 T270 120" fill="none" stroke="#5347ed" stroke-width="8"/></svg>',
						),
				})),
			);
			window.galleryActions = [];
			createApp({
				setup: () => () =>
					h("main", { class: "harmony-app android-app" }, [
						h(Workspace, {
							documents: [],
							history: files.value,
							active: null,
							editing: false,
							opening: false,
							openingLabel: "",
							saving: false,
							ready: true,
							status: "",
							editable: false,
							reduceMotion: false,
							immersive: false,
							onRestore: (id) => window.galleryActions.push(["open", id]),
							onEditDocument: (id) => window.galleryActions.push(["edit", id]),
							onRename: (id) => window.galleryActions.push(["rename", id]),
							onDelete: (id) => {
								window.galleryActions.push(["delete", id]);
								files.value = files.value.filter((f) => f.id !== id);
							},
						}),
					]),
			}).mount("#app");
		});
		await p.locator(".android-file-row").first().waitFor();
		const a = await p.locator(".android-file-entry").nth(0).boundingBox(),
			b = await p.locator(".android-file-entry").nth(1).boundingBox();
		if (width >= 600) assert.ok(Math.abs(a.y - b.y) < 1 && b.x > a.x + a.width);
		else assert.ok(b.y > a.y + a.height - 1);
		const card = p.locator(".android-file-row").first();
		await card.scrollIntoViewIfNeeded();
		const r = await card.boundingBox();
		await p.mouse.move(r.x + 50, r.y + 35);
		await p.mouse.down();
		await p.waitForTimeout(560);
		await p.mouse.up();
		const menu = p.locator(".android-file-menu[open]");
		await menu.waitFor();
		await menu.evaluate((e) => Promise.allSettled(e.getAnimations().map((a) => a.finished)));
		const m = await menu.boundingBox();
		assert.ok(
			m.x >= 0 && m.y >= 0 && m.x + m.width <= width + 1 && m.y + m.height <= height + 1,
		);
		assert.equal(
			(await p.evaluate(() => window.galleryActions)).length,
			0,
			"holding does not open the file",
		);
		await p.screenshot({ path: `.cache/notes-qa/gallery-menu-webkit-${width}.png` });
		await p.keyboard.press("Escape");
		await menu.waitFor({ state: "hidden" });
		await card.focus();
		await p.keyboard.press("Shift+F10");
		await menu.getByRole("button", { name: "修改文件名", exact: true }).click();
		assert.deepEqual(await p.evaluate(() => window.galleryActions.at(-1)), [
			"rename",
			"fixture-0",
		]);
		await card.tap();
		assert.deepEqual(await p.evaluate(() => window.galleryActions.at(-1)), [
			"open",
			"fixture-0",
		]);
		await p.getByRole("button", { name: "文件操作 画画练习 0.cubenote", exact: true }).tap();
		await menu.getByRole("button", { name: "删除", exact: true }).tap();
		assert.equal(await p.locator(".android-file-row").count(), 7);
		await p.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
		// The standalone fixture has no host theme provider; supply its dark tokens.
		await p.evaluate(() => {
			const root = document.querySelector(".android-app");
			for (const [name, value] of Object.entries({
				primary: "#a3d6c3",
				"on-primary": "#073c2e",
				"primary-container": "#254e40",
				surface: "#151c18",
				container: "#202b24",
				card: "#1c2520",
				text: "#e3ebe4",
				secondary: "#b6c4b9",
				outline: "#3b4a40",
				error: "#ffb4ab",
			}))
				root.style.setProperty("--android-" + name, value);
		});
		await p.evaluate(() => new Promise(requestAnimationFrame));
		assert.equal(
			await p
				.locator(".android-file-copy strong")
				.first()
				.evaluate(
					(e) =>
						getComputedStyle(e).color ===
						getComputedStyle(e.closest(".android-file-row")).color,
				),
			true,
			"filename contrast follows shell theme",
		);
		await p.screenshot({ path: `.cache/notes-qa/gallery-dark-webkit-${width}.png` });
		assert.deepEqual(errors, []);
		await p.close();
		console.log(
			`PASS webkit ${width}: component gallery, long press, menu bounds, keyboard and file actions`,
		);
	}
} finally {
	await safari.close();
}
