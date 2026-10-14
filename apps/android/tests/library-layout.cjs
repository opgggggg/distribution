/** Visual checks for the phone file library, using an isolated browser's synthetic records. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const output = process.env.MOBILE_QA_OUTPUT || "/tmp/cubeoffice-home-redesign";
const base = process.env.ANDROID_PREVIEW_URL || "http://127.0.0.1:5198/?platform=android";
fs.mkdirSync(output, { recursive: true });
(async () => {
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	try {
		const page = await browser.newPage({
			viewport: { width: 390, height: 844 },
			hasTouch: true,
			reducedMotion: "reduce",
		});
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.addInitScript(() =>
			localStorage.setItem("cubeoffice.privacy.consent", "2026-09-07"),
		);
		await page.goto(base);
		await page.getByRole("heading", { name: "我的文件", exact: true }).waitFor();
		const button = (name) => page.getByRole("button", { name, exact: true });
		await page.screenshot({ path: output + "/empty.png" });
		const empty = await page.locator(".android-empty").boundingBox(),
			nav = await page.locator(".android-navigation").boundingBox();
		assert.ok(
			empty.y + empty.height < nav.y,
			"empty-state copy is completely above navigation",
		);
		assert.equal(await page.locator(".android-fab").count(), 0);
		assert.equal(await button("新建").count(), 1);
		assert.equal(
			await page
				.locator(".android-library-scroll")
				.evaluate((e) => e.scrollHeight === e.clientHeight),
			true,
		);
		await page.evaluate(async () => {
			const { writeHarmonyAutosave } = await import("/src/autosave-store.ts");
			for (const [index, [fileName, format, size]] of [
				["项目计划.docx", "docx", 28000],
				["季度数据.xlsx", "xlsx", 17000],
				["设计方案.pdf", "pdf", 2100000],
				["会议纪要.md", "markdown", 2400],
			].entries()) {
				const blob = new Blob([new Uint8Array(size)]);
				await writeHarmonyAutosave({
					id: "visual-" + index,
					fileName,
					format,
					blob,
					originalBlob: blob,
					isDraft: index === 3,
					favorite: index === 0,
					savedAt: Date.now() - index * 1000,
					sourceRef: {
						id: "source-" + index,
						name: fileName,
						writable: true,
						location: "设备文件",
					},
				});
			}
		});
		await page.reload();
		await page.locator(".android-file-row").filter({ hasText: "项目计划.docx" }).waitFor();
		await page.screenshot({ path: output + "/files.png" });
		await button("筛选与排序，全部类型").click();
		await button("PDF").click();
		await button("完成").click();
		assert.equal(await page.locator(".android-file-row").count(), 1);
		assert.match(await page.locator(".android-file-row").innerText(), /设计方案.pdf/);
		await button("筛选与排序，PDF").click();
		await button("全部类型").click();
		await button("名称").click();
		await page.screenshot({ path: output + "/filters.png" });
		await button("完成").click();
		await button("文件操作 会议纪要.md").click();
		await button("收藏 会议纪要.md").click();
		await page
			.locator(".android-library-tabs")
			.getByRole("button", { name: "收藏", exact: true })
			.click();
		assert.equal(await page.locator(".android-file-row").count(), 2);
		await button("文件操作 会议纪要.md").click();
		await button("修改文件名").click();
		const dialog = page.getByRole("dialog", { name: "修改文件名", exact: true });
		await dialog.getByRole("textbox", { name: "文件名", exact: true }).fill("新的会议纪要.md");
		await dialog.getByRole("button", { name: "确定", exact: true }).click();
		await page.locator(".android-file-row").filter({ hasText: "新的会议纪要.md" }).waitFor();
		await button("最近").click();
		for (const [name, size, colorScheme, fontSize] of [
			["small", { width: 375, height: 812 }, "light", "16px"],
			["landscape", { width: 812, height: 375 }, "light", "16px"],
			["tablet", { width: 1024, height: 768 }, "light", "16px"],
			["dark", { width: 390, height: 844 }, "dark", "16px"],
			["large-text", { width: 375, height: 812 }, "light", "32px"],
		]) {
			await page.setViewportSize(size);
			await page.emulateMedia({ colorScheme });
			await page.evaluate(
				(fontSize) => (document.documentElement.style.fontSize = fontSize),
				fontSize,
			);
			await page.waitForTimeout(250);
			if (name === "large-text")
				assert.equal(
					await page
						.locator(".android-home-heading h1")
						.evaluate((e) => getComputedStyle(e).fontSize),
					"56px",
				);
			assert.equal(
				await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
				true,
				name + " horizontal fit",
			);
			assert.equal(
				await page
					.locator(".android-library-scroll")
					.evaluate((e) => e.scrollWidth <= e.clientWidth),
				true,
				name + " library horizontal fit",
			);
			await page.screenshot({ path: output + "/" + name + ".png" });
		}
		assert.deepEqual(errors, []);
		console.log(
			"PASS empty/populated file library, filter/sort, row favorite/rename, small phone, landscape, tablet, dark and 200% text",
		);
	} finally {
		await browser.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
