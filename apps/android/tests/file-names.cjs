/** Naming and recent-file persistence regression; run against the Android Vite preview. */
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.ANDROID_PREVIEW_URL || "http://127.0.0.1:5173/?platform=android";
(async () => {
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	try {
		const context = await browser.newContext({
			viewport: { width: 390, height: 844 },
			acceptDownloads: true,
		});
		await context.addInitScript(() =>
			localStorage.setItem("cubeoffice.privacy.consent", "2026-09-07"),
		);
		const page = await context.newPage();
		const errors = [];

		page.on("pageerror", (e) => errors.push(e.message));
		await page.goto(base);
		async function create(label) {
			await page.getByRole("button", { name: "新建", exact: true }).click();
			await page
				.locator(".android-sheet")
				.getByRole("button", { name: new RegExp(label) })
				.click();
			if (label === "演示文稿")
				await page.getByRole("button", { name: "空白演示文稿", exact: true }).click();
			await page.getByRole("button", { name: "另存", exact: true }).waitFor();
			await page.waitForFunction(
				() => !document.querySelector('[aria-label="另存"]').disabled,
			);
		}
		async function home() {
			// Back steps dismiss the keyboard, finish editing, then reach Home.
			for (
				let i = 0;
				i < 5 && (await page.locator(".android-document-title").isVisible());
				i++
			) {
				await page.getByRole("button", { name: "返回", exact: true }).click();
				await page.waitForTimeout(150);
			}
			await page.locator(".android-file-list").waitFor();
		}
		async function name(title, value) {
			const dialog = page.getByRole("dialog", { name: title, exact: true });
			await dialog.getByRole("textbox", { name: "文件名", exact: true }).fill(value);
			await dialog.getByRole("button", { name: "确定", exact: true }).click();
		}
		await page.getByRole("searchbox", { name: "搜索文档名称" }).fill("旧名称");
		await page.getByRole("button", { name: "PDF", exact: true }).click();
		await create("Markdown");
		await page
			.locator(".als-ofs-ui-markdown-editor__source-input")
			.fill("# 项目内容\n保存和重命名之后仍然保留。");
		const original = await page.locator(".android-document-title strong").innerText();
		await page.getByRole("button", { name: "另存", exact: true }).click();
		await page
			.getByRole("dialog", { name: "保存文件", exact: true })
			.getByRole("button", { name: "取消", exact: true })
			.click();
		assert.equal(await page.locator(".android-document-title strong").innerText(), original);
		await page.getByRole("button", { name: "另存", exact: true }).click();
		await name("保存文件", "invalid/name");
		await page.getByRole("alert").filter({ hasText: "文件名不能包含" }).waitFor();
		const download = page.waitForEvent("download");
		await name("保存文件", "项目笔记");
		assert.equal((await download).suggestedFilename(), "项目笔记.md");
		assert.equal(
			await page.locator(".android-document-title strong").innerText(),
			"项目笔记.md",
		);
		await page.getByRole("button", { name: "更多文档操作", exact: true }).click();
		await page.getByRole("button", { name: /修改文件名 更新本地名称/ }).click();
		await name("修改文件名", "工作笔记.md");
		await home();
		await page.locator(".android-file-row").filter({ hasText: "工作笔记.md" }).waitFor();
		assert.equal(await page.getByRole("searchbox", { name: "搜索文档名称" }).inputValue(), "");
		assert.equal(
			await page
				.getByRole("button", { name: "全部", exact: true })
				.getAttribute("aria-pressed"),
			"true",
		);
		assert(
			await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
			"file rows fit the phone viewport",
		);
		await page.screenshot({ path: "/tmp/cubeoffice-android-file-names-home.png" });
		await page.reload();
		await page.locator(".android-file-row").filter({ hasText: "工作笔记.md" }).waitFor();
		assert.equal(await page.getByRole("searchbox", { name: "搜索文档名称" }).inputValue(), "");
		assert.equal(
			await page
				.getByRole("button", { name: "全部", exact: true })
				.getAttribute("aria-pressed"),
			"true",
		);
		assert(
			await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
			"file rows fit the phone viewport",
		);
		await page.screenshot({ path: "/tmp/cubeoffice-android-file-names-home.png" });
		await page.getByRole("button", { name: "修改文件名 工作笔记.md", exact: true }).click();
		await name("修改文件名", "最终笔记");
		await page.locator(".android-file-row").filter({ hasText: "最终笔记.md" }).waitFor();
		await page.reload();
		await page.locator(".android-file-row").filter({ hasText: "最终笔记.md" }).click();
		await page
			.locator(".android-document-title strong")
			.filter({ hasText: "最终笔记.md" })
			.waitFor();
		await page.getByText("保存和重命名之后仍然保留。", { exact: true }).waitFor();
		await home();
		// Each untouched blank must survive closing and a fresh session.
		for (const label of ["文字文档", "电子表格", "演示文稿", "流程图"]) {
			await create(label);
			const fileName = await page.locator(".android-document-title strong").innerText();
			await page.getByRole("button", { name: "更多文档操作", exact: true }).click();
			await page.getByRole("button", { name: /关闭文档 先保存/ }).click();
			await page.locator(".android-file-row").filter({ hasText: fileName }).waitFor();
			await page.reload();
			await page.locator(".android-file-row").filter({ hasText: fileName }).waitFor();
			console.log(`${label}: untouched new file survives close/reload`);
		}
		assert.deepEqual(errors, []);
		console.log(
			"Save naming, cancel, invalid name, active/history rename, and recent persistence passed",
		);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
