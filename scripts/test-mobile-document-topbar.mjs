import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { buildEpub } from "../packages/epub/tests/fixture.mjs";
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseUrl = process.env.MOBILE_TEST_URL || "http://127.0.0.1:5179/";
const screenshots = ".cache/notes-qa/topbar";
await mkdir(screenshots, { recursive: true });
const formats = [
	["notes", "手写笔记"],
	["docx", "文字文档"],
	["xlsx", "电子表格"],
	["pptx", "演示文稿"],
	["markdown", "Markdown"],
	["vsdx", "流程图"],
];

async function geometry(page) {
	return page.locator(".document-topbar").evaluate((bar) => {
		const box = (element) => {
			const r = element.getBoundingClientRect();
			return { x: r.x, y: r.y, width: r.width, height: r.height };
		};
		return {
			bar: box(bar),
			mode: bar.querySelector(".document-topbar__mode")
				? box(bar.querySelector(".document-topbar__mode"))
				: null,
			title: box(bar.querySelector(".document-topbar__title")),
			buttons: [...bar.querySelectorAll("button")].map((button) => ({
				label: button.getAttribute("aria-label"),
				...box(button),
			})),
			body: box(document.querySelector(".harmony-body")),
			selectable:
				getComputedStyle(bar).getPropertyValue("user-select") ||
				getComputedStyle(bar).getPropertyValue("-webkit-user-select"),
			overflow: document.documentElement.scrollWidth > innerWidth,
		};
	});
}
function checkLayout(layout, width) {
	assert.equal(layout.bar.width, width);
	assert.equal(layout.bar.height, 64, "Consistent document bar height");
	assert.ok(layout.title.width >= 48, "The filename remains visible on a small phone");
	assert.ok(
		layout.body.y >= layout.bar.y + layout.bar.height - 1,
		"The body starts below navigation",
	);
	assert.equal(layout.selectable, "none", "Toolbar labels cannot be selected");
	assert.equal(layout.overflow, false, "No horizontal app overflow");
	for (const button of layout.buttons) {
		assert.ok(button.width >= 48 && button.height >= 48, button.label + " touch target");
		assert.ok(
			button.x >= 0 && button.x + button.width <= width,
			button.label + " stays on screen",
		);
	}
}
for (const [engineName, engine, launchOptions] of [
	["chrome", chromium, { channel: "chrome" }],
	["webkit", webkit, {}],
]) {
	if (process.env.MOBILE_TEST_BROWSER && process.env.MOBILE_TEST_BROWSER !== engineName) continue;
	const browser = await engine.launch({ headless: true, ...launchOptions });
	try {
		for (const [width, height] of [
			[375, 812],
			[1024, 768],
		]) {
			const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
			page.setDefaultTimeout(60000);
			const errors = [];
			page.on("pageerror", (error) => errors.push(error.message));
			await page.addInitScript(() => {
				localStorage.setItem("cubeoffice.privacy.consent", "2026-09-07");
				// Exercise the shipped iOS shell as well as the Vite preview.
				window.auroraHarmonyHost = {
					getPlatform: () => "ios",
					hasNetwork: () => true,
					consumePendingIntent: () => "",
					appReady: () => {},
				};
			});
			await page.goto(new URL("?platform=ios", baseUrl).href);
			let commonMode;
			for (const [format, label] of formats) {
				await page.getByRole("button", { name: "新建", exact: true }).click();
				await page.locator(".android-sheet button").filter({ hasText: label }).click();
				if (format === "pptx")
					await page.getByRole("button", { name: /空白演示文稿/ }).click();
				await page
					.locator(
						`.harmony-documents__surface[data-active="true"][data-format="${format}"]`,
					)
					.waitFor();
				await page.waitForFunction(
					() => {
						const mode = document.querySelector(".document-topbar__mode");
						return mode && !mode.disabled;
					},
					null,
					{ timeout: 60000 },
				);
				const bar = page.locator(".document-topbar");
				if (format === "docx") {
					await page
						.locator(
							'.harmony-documents__surface[data-active="true"] [contenteditable="true"]',
						)
						.first()
						.click();
					await page.keyboard.insertText("Text survives editing mode changes");
				}
				const editing = await geometry(page);
				checkLayout(editing, width);
				commonMode ??= editing.mode;
				assert.deepEqual(
					editing.mode,
					commonMode,
					"All editable formats use the same mode button position",
				);
				if (format === "notes") {
					assert.equal(
						await page.locator(".cube-notes__header").isVisible(),
						false,
						"No duplicate notes navigation",
					);
					await bar.getByRole("button", { name: "页面", exact: true }).click();
					await page.locator(".cube-notes__sidebar").waitFor();
					await bar.getByRole("button", { name: "页面", exact: true }).click();
				}
				await bar.getByRole("button", { name: "完成编辑", exact: true }).click();
				await bar.getByRole("button", { name: "编辑文档", exact: true }).waitFor();
				const reading = await geometry(page);
				checkLayout(reading, width);
				assert.deepEqual(
					reading.mode,
					editing.mode,
					"Edit/Done does not shift when changing mode",
				);
				assert.equal(
					await page.locator(".android-editor-tools").count(),
					0,
					"No duplicate bottom edit CTA",
				);
				if (format === "notes") {
					await bar.getByRole("button", { name: "页面", exact: true }).click();
					await page.locator(".cube-notes__sidebar").waitFor();
					await bar.getByRole("button", { name: "页面", exact: true }).click();
				}
				if (format === "pptx")
					assert.equal(
						await bar.getByRole("button", { name: "播放", exact: true }).isEnabled(),
						true,
					);
				await bar.getByRole("button", { name: "更多文档操作", exact: true }).click();
				await page.locator(".android-sheet[open]").waitFor();
				assert.equal(
					await bar
						.getByRole("button", { name: "更多文档操作", exact: true })
						.getAttribute("aria-expanded"),
					"true",
				);
				await page.getByRole("button", { name: "关闭面板", exact: true }).click();
				await bar.getByRole("button", { name: "编辑文档", exact: true }).click();
				await bar.getByRole("button", { name: "完成编辑", exact: true }).waitFor();
				if (format === "docx")
					assert.match(
						await page
							.locator('.harmony-documents__surface[data-active="true"]')
							.innerText(),
						/Text survives editing mode changes/,
					);
				await page.screenshot({
					path: `${screenshots}/${engineName}-${width}-${format}.png`,
				});
				await bar.getByRole("button", { name: "完成编辑", exact: true }).click();
				await bar.getByRole("button", { name: "返回", exact: true }).click();
				await page.locator(".android-library").waitFor();
				console.log("PASS", engineName, width, format);
			}
			// A viewer has the same navigation and menu, without an edit button.
			await page.locator(".android-file-input").setInputFiles({
				name: "readonly.png",
				mimeType: "image/png",
				buffer: Buffer.from(
					"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1sAAAAASUVORK5CYII=",
					"base64",
				),
			});
			await page.locator(".document-topbar").waitFor();
			await page.waitForFunction(() =>
				document.querySelector(
					'.harmony-documents__surface[data-active="true"][data-format="image"]',
				),
			);
			const viewer = await geometry(page);
			checkLayout(viewer, width);
			assert.equal(viewer.mode, null);
			assert.equal(await page.locator(".android-editor-tools").count(), 0);
			await page.locator(".android-file-input").setInputFiles({
				name: "reader.epub",
				mimeType: "application/epub+zip",
				buffer: Buffer.from(buildEpub()),
			});
			await page
				.locator('.harmony-documents__surface[data-active="true"][data-format="epub"]')
				.waitFor();
			await page.waitForFunction(() =>
				document
					.querySelector(".document-topbar small")
					?.textContent.includes("只读 · EPUB"),
			);
			checkLayout(await geometry(page), width);
			assert.equal(
				await page.locator(".cubexp-epub-bar.is-top").count(),
				0,
				"No duplicate book navigation",
			);
			assert.equal(
				await page.locator(".cubexp-epub-bar__tabs button").count(),
				6,
				"Reading controls stay available",
			);
			await page
				.locator(".document-topbar")
				.getByRole("button", { name: "更多文档操作", exact: true })
				.click();
			await page.getByRole("button", { name: "查找文档内容", exact: true }).click();
			await page.locator(".cubexp-epub-sheet.is-search").waitFor();
			await page.screenshot({ path: `${screenshots}/${engineName}-${width}-epub.png` });
			assert.deepEqual(errors, []);
			await page.close();
		}
	} finally {
		await browser.close();
	}
}
console.log(
	"PASS: common mobile document navigation, editing/reading, state preservation, page controls, viewers and touch targets",
);
