/** Run against the Android Vite preview; PLAYWRIGHT_MODULE_PATH may point to a bundled install. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const root = path.resolve(__dirname, "../../..");
const base = process.env.ANDROID_PREVIEW_URL || "http://127.0.0.1:5173/?platform=android";

(async () => {
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	const errors = [];
	async function page(options = {}) {
		const p = await browser.newPage({ viewport: { width: 390, height: 844 }, ...options });
		p.on("pageerror", (e) => errors.push(e.message));
		await p.goto(base);
		return p;
	}
	async function create(p, name) {
		await p.getByRole("button", { name: "新建", exact: true }).click();
		await p
			.locator(".android-sheet")
			.getByRole("button", { name: new RegExp(name) })
			.click();
		if (name === "演示文稿") await p.getByRole("button", { name: "空白演示文稿" }).click();
		await p
			.locator(".android-editor-tools")
			.getByRole("button", { name: "格式", exact: true })
			.waitFor();
	}
	async function openFormat(p, textFormat) {
		await p
			.locator(".android-editor-tools")
			.getByRole("button", { name: "格式", exact: true })
			.click();
		if (textFormat) {
			if ((await p.locator(".android-document-title strong").innerText()).endsWith(".docx")) {
				await p.locator(".android-type-panel").waitFor();
				await p.getByRole("button", { name: "加粗", exact: true }).click();
				assert.equal(
					await p
						.getByRole("button", { name: "加粗", exact: true })
						.getAttribute("aria-pressed"),
					"true",
				);
				await p.getByRole("tab", { name: "段落", exact: true }).click();
				await p.getByRole("button", { name: "居中", exact: true }).click();
				await p.getByRole("button", { name: "全部工具" }).click();
			} else await p.getByRole("button", { name: "更多格式工具" }).click();
		}
		await p.locator(".android-ribbon-header").waitFor();
	}
	try {
		for (const [name, text] of [
			["文字文档", true],
			["电子表格", false],
			["演示文稿", false],
			["流程图", false],
			["Markdown", true],
		]) {
			const p = await page();
			await create(p, name);
			await openFormat(p, text);
			const tabs = p.locator(
				'.harmony-documents__surface[data-active="true"] [data-ribbon-tab]:visible',
			);
			await tabs.last().click();
			assert.equal(
				await tabs.last().getAttribute("aria-selected"),
				"true",
				`${name}: ribbon tab is operable`,
			);
			await p.getByRole("button", { name: "关闭面板", exact: true }).click();
			await p
				.locator(".android-editor-tools")
				.getByRole("button", { name: "插入", exact: true })
				.click();
			const close = p.getByRole("button", {
				name: name === "文字文档" ? "关闭添加面板" : "关闭面板",
				exact: true,
			});
			assert((await close.boundingBox()).x > 300, `${name}: close stays on the right`);
			if (name === "文字文档") {
				await p
					.locator(".harmony-mobile-insert-grid")
					.getByRole("button", { name: "链接", exact: true })
					.click();
				await p.getByRole("button", { name: "关闭错误提示" }).click();
				assert.equal(await p.locator('[role="alert"]').count(), 0);
			}
			await close.click();
			console.log(`${name}: format/insert controls and dismissal passed`);
			await p.close();
		}
		const p = await page();
		assert.deepEqual(await p.locator(".android-navigation button").allTextContents(), [
			"文件",
			"设置",
		]);
		assert((await p.locator(".android-navigation").boundingBox()).height <= 56);
		await p.getByRole("button", { name: "设置", exact: true }).click();
		assert.equal(
			await p.getByRole("button", { name: "设置", exact: true }).getAttribute("aria-current"),
			"page",
		);
		await p.getByRole("button", { name: "文件", exact: true }).click();
		// A failed catalog remains dismissible and keeps the offline blank path available.
		await p.route("https://cubexp.com/templates/index.json", (route) => route.abort());
		await p.getByRole("button", { name: "新建", exact: true }).click();
		await p.getByRole("button", { name: /演示文稿 想法/ }).click();
		await p.getByRole("button", { name: "关闭错误提示" }).click();
		await p.getByRole("button", { name: "关闭模板选择" }).click();
		await p.unroute("https://cubexp.com/templates/index.json");
		const bytes = await fs.readFile(path.join(root, "website/templates/pptx/chalk.zh-CN.pptx"));
		await p.route("https://cubexp.com/templates/index.json", (route) =>
			route.fulfill({
				json: {
					templates: [
						{
							id: "test",
							format: "pptx",
							name: "课堂笔记",
							file: "https://cubexp.com/templates/test.pptx",
						},
					],
				},
			}),
		);
		await p.route("https://cubexp.com/templates/test.pptx", (route) =>
			route.fulfill({ body: bytes }),
		);
		await p.getByRole("button", { name: "新建", exact: true }).click();
		await p.getByRole("button", { name: /演示文稿 想法/ }).click();
		await p.getByRole("button", { name: "课堂笔记", exact: true }).click();
		await p
			.locator(".android-document-title strong")
			.filter({ hasText: "课堂笔记.pptx" })
			.waitFor();
		await p.locator(".als-ofs-pptx-editor-component").waitFor();
		console.log("Navigation and template failure/retry/import passed");
		await p.close();

		const f = await page();
		const { legacyWordOle, legacyPowerPointOle } = await import(
			pathToFileURL(path.join(root, "als-office/scripts/test-fixtures/legacy-ole.mjs")).href
		);
		const fixtures = [
			{
				name: "legacy.doc",
				mimeType: "application/msword",
				buffer: Buffer.from(legacyWordOle("Android legacy document")),
			},
			{
				name: "legacy.ppt",
				mimeType: "application/vnd.ms-powerpoint",
				buffer: Buffer.from(legacyPowerPointOle()),
			},
			{
				name: "data.csv",
				mimeType: "text/csv",
				buffer: Buffer.from("Name,Value\nOffice,7\n"),
			},
			{
				name: "photo.png",
				mimeType: "image/png",
				buffer: await fs.readFile(path.join(root, "profiles/cubeoffice/icon.png")),
			},
		];
		for (const fixture of fixtures) {
			await f.locator(".android-file-input:not(:disabled)").setInputFiles(fixture);
			await f
				.locator(".android-document-title strong")
				.filter({
					hasText: new RegExp(
						"^" +
							fixture.name
								.replace(/\.(doc|ppt|csv)$/, (_, ext) =>
									ext === "csv" ? ".xlsx" : "." + ext + "x",
								)
								.replaceAll(".", "\\.") +
							"$",
					),
				})
				.waitFor();
			assert.equal(await f.locator(".harmony-feedback").count(), 0, fixture.name);
			console.log(`${fixture.name}: opened`);
		}
		await f.locator(".android-file-input").setInputFiles({
			name: "unsupported.bin",
			mimeType: "application/octet-stream",
			buffer: Buffer.from("unsupported"),
		});
		await f.getByRole("button", { name: "关闭错误提示" }).click();
		assert.equal(await f.locator(".harmony-feedback").count(), 0);
		await f.close();
		for (const options of [
			{ viewport: { width: 375, height: 812 } },
			{ viewport: { width: 812, height: 375 } },
			{
				viewport: { width: 1024, height: 768 },
				colorScheme: "dark",
				reducedMotion: "reduce",
			},
		]) {
			console.log("Viewport", options.viewport);
			const v = await page(options);
			await create(v, "文字文档");
			await openFormat(v, true);
			const close = v.getByRole("button", { name: "关闭面板", exact: true });
			assert((await close.boundingBox()).y >= 0);
			assert(await v.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
			await close.click();
			await v.close();
		}
		assert.deepEqual(errors, []);
		console.log("Viewport, dark mode, reduced motion and error checks passed");
	} finally {
		await browser.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
