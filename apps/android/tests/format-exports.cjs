/** Existing mobile document engines still create usable files through the shared host sink. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.ANDROID_PREVIEW_URL || "http://127.0.0.1:5198/?platform=android";
(async () => {
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	try {
		for (const [label, extension] of [
			["文字文档", "docx"],
			["电子表格", "xlsx"],
			["演示文稿", "pptx"],
			["纯文本", "txt"],
		]) {
			const context = await browser.newContext({
				viewport: { width: 390, height: 844 },
				acceptDownloads: true,
			});
			await context.addInitScript(() =>
				localStorage.setItem("cubeoffice.privacy.consent", "2026-09-07"),
			);
			const page = await context.newPage();
			await page.goto(base);
			await page.getByRole("button", { name: "新建", exact: true }).click();
			await page
				.locator(".android-sheet")
				.getByRole("button", { name: new RegExp(label) })
				.click();
			if (extension === "pptx")
				await page.getByRole("button", { name: "空白演示文稿", exact: true }).click();
			const save = page.getByRole("button", { name: "另存", exact: true });
			await save.click();
			const dialog = page.getByRole("dialog", { name: "保存文件", exact: true });
			await dialog
				.getByRole("textbox", { name: "文件名", exact: true })
				.fill("Export QA." + extension);
			const download = page.waitForEvent("download");
			await dialog.getByRole("button", { name: "确定", exact: true }).click();
			const result = await download;
			assert.equal(result.suggestedFilename(), "Export QA." + extension);
			const bytes = await fs.readFile(await result.path());
			if (extension !== "txt") {
				assert.ok(bytes.length > 100);
				assert.equal(bytes.subarray(0, 2).toString(), "PK");
			}
			assert.equal(
				await page.locator(".document-topbar__title strong").innerText(),
				"Export QA." + extension,
			);
			console.log("PASS mobile create/save-as " + extension);
			await context.close();
		}
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
