const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const fs = require("node:fs/promises");
(async () => {
	const { createNotebook, createPage, writeNotebook } = await import("../dist/index.js");
	const book = createNotebook("Page navigation");
	book.pages.push(createPage(), createPage());
	const bytes = new Uint8Array(await writeNotebook(book).arrayBuffer());
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	try {
		for (const host of [true, false])
			for (const width of [375, 744]) {
				const p = await browser.newPage({
					viewport: { width, height: 1133 },
					hasTouch: true,
				});
				const errors = [];
				p.on("pageerror", (e) => errors.push(e.message));
				await p.goto(
					host
						? "http://127.0.0.1:5179/?platform=android"
						: "http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1&bridge=1",
				);
				if (host) {
					await p.getByRole("button", { name: "同意并继续" }).click();
					await p.locator(".android-file-input").setInputFiles({
						name: "Pages.cubenote",
						mimeType: "application/octet-stream",
						buffer: Buffer.from(bytes),
					});
				} else {
					await p.waitForFunction(() =>
						Boolean(window.noteSource && window.noteReadonly),
					);
					await p.evaluate(
						(bytes) => {
							window.noteReadonly.value = true;
							window.noteSource.value = new Blob([new Uint8Array(bytes)]);
						},
						[...bytes],
					);
				}
				await p
					.locator(".cube-notes[data-readonly=true] .cube-notes__ink-canvas")
					.waitFor();
				const toggle = p.locator(
					host ? ".android-topbar .android-notes-pages" : ".cube-notes__top-pages",
				);
				const box = await toggle.boundingBox();
				assert.ok(
					box.y < 60 && box.width >= 44 && box.height >= 44,
					"pages has a topbar touch target",
				);
				const before = host
					? null
					: await p.evaluate(() => ({
							book: window.notebook.value.getNotebook(),
							revision: window.notebook.value.getRevision(),
							dirty: window.notebook.value.isDirty(),
						}));
				for (const index of [2, 0, 1]) {
					await toggle.tap();
					const thumbs = p.locator(".cube-notes__thumbnail");
					await thumbs.nth(index).tap();
					await p.locator(".cube-notes__sidebar").waitFor({ state: "hidden" });
					await toggle.tap();
					assert.equal(await thumbs.nth(index).getAttribute("aria-current"), "page");
					assert.ok(
						await p.locator(".cube-notes__sidebar-header button").first().isDisabled(),
					);
					await toggle.tap();
					await p.locator(".cube-notes__sidebar").waitFor({ state: "hidden" });
				}
				assert.equal(await p.locator(".cube-notes__mobile-navigation").count(), 0);
				await p.screenshot({
					path: `.cache/notes-qa/pages-readonly-${host ? "host" : "standalone"}-${width}.png`,
				});
				if (!host)
					assert.deepEqual(
						await p.evaluate(() => ({
							book: window.notebook.value.getNotebook(),
							revision: window.notebook.value.getRevision(),
							dirty: window.notebook.value.isDirty(),
						})),
						before,
						"readonly page changes preserve document and history",
					);
				if (host) await p.getByRole("button", { name: "编辑文档", exact: true }).tap();
				else await p.evaluate(() => (window.noteReadonly.value = false));
				await p.locator(".cube-notes[data-readonly=false]").waitFor();
				assert.equal(
					await p
						.locator(".cube-notes__mobile-navigation")
						.getByRole("button", { name: "页面", exact: true })
						.count(),
					0,
				);
				await toggle.tap();
				const thumbs = p.locator(".cube-notes__thumbnail");
				assert.equal(
					await thumbs.nth(1).getAttribute("aria-current"),
					"page",
					"entering edit preserves the reading page",
				);
				await thumbs.nth(2).tap();
				await toggle.tap();
				assert.equal(await thumbs.nth(2).getAttribute("aria-current"), "page");
				await p
					.locator(".cube-notes__sidebar")
					.locator(".cube-notes__sidebar-header button")
					.last()
					.tap();
				await toggle.tap();
				await p.locator(".cube-notes__sidebar").waitFor();
				await toggle.tap();
				await p.screenshot({
					path: `.cache/notes-qa/pages-edit-${host ? "host" : "standalone"}-${width}.png`,
				});
				assert.deepEqual(errors, []);
				await p.close();
			}
		console.log(
			"PASS: phone/tablet topbar pages in readonly and editing, repeated toggles, page retention, no readonly changes",
		);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
