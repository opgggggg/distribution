/** Existing-format phone workflow, including final native receipts and save/edit races.
 * ANDROID_PREVIEW_URL=http://127.0.0.1:5198/?platform=android node apps/android/tests/file-workspace.cjs
 */
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const UTIF = require("utif");
const fs = require("node:fs");
const output = process.env.MOBILE_QA_OUTPUT || "/tmp/cubeoffice-mobile-qa";
fs.mkdirSync(output, { recursive: true });
const base = process.env.ANDROID_PREVIEW_URL || "http://127.0.0.1:5198/?platform=android";
function tiffFixture() {
	const pages = [0, 1].map(() => ({
		t256: [20],
		t257: [30],
		t258: [8, 8, 8, 8],
		t259: [1],
		t262: [2],
		t273: [0],
		t277: [4],
		t278: [30],
		t279: [2400],
		t284: [1],
		t338: [2],
	}));
	const header = UTIF.encode(pages);
	pages[0].t273 = [header.byteLength];
	pages[1].t273 = [header.byteLength + 2400];
	const encoded = UTIF.encode(pages),
		bytes = Buffer.alloc(encoded.byteLength + 4800);
	Buffer.from(encoded).copy(bytes);
	for (let i = 0; i < 1200; i++) {
		bytes[encoded.byteLength + i * 4 + (i < 600 ? 0 : 2)] = 255;
		bytes[encoded.byteLength + i * 4 + 3] = 255;
	}
	return bytes;
}
(async () => {
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	try {
		const page = await browser.newPage({
			viewport: { width: 390, height: 844 },
			hasTouch: true,
		});
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.addInitScript(() => {
			localStorage.setItem("cubeoffice.privacy.consent", "2026-09-07");
			let sequence = 0;
			const sessions = {},
				results = {},
				queue = [];
			let incoming = null;
			window.__fileTest = {
				sessions,
				results,
				queue,
				auto: true,
				operations: [],
				completed: [],
				enqueue(encoded, name, type, source) {
					incoming = { encoded, name, type, source, id: "open-" + ++sequence };
					queue.push(
						JSON.stringify({
							type: "open-document",
							id: incoming.id,
							fileName: name,
							mimeType: type,
							size: atob(encoded).length,
							source,
						}),
					);
					window.dispatchEvent(new Event("aurora-native-document"));
				},
				complete(id, status = "saved", error) {
					results[id] = JSON.stringify(
						error
							? { error }
							: {
									status,
									destination: "test/" + sessions[id].name,
									source:
										status === "saved"
											? {
													id: "saved-original",
													name: sessions[id].name,
													writable: true,
													version: "written",
												}
											: undefined,
								},
					);
					this.completed.push(id);
				},
			};
			window.auroraHarmonyHost = {
				getPlatform: () => "android",
				appReady: () => true,
				hasNetwork: () => false,
				hasWindowControls: () => false,
				startWindowMove: () => false,
				toggleMaximizeWindow: () => false,
				consumePendingIntent: () => queue.shift() || "",
				readOpenDocumentChunk: (id, offset, length) =>
					incoming?.id === id
						? btoa(atob(incoming.encoded).slice(offset, offset + length))
						: "",
				finishOpenDocument: () => true,
				beginSave: (name) => {
					const id = "save-" + ++sequence;
					sessions[id] = { name, chunks: [] };
					return id;
				},
				appendSaveChunk: (id, chunk) => {
					sessions[id].chunks.push(chunk);
					return true;
				},
				abortSave: () => true,
				finishFileOperation: (id, intent, source) => {
					window.__fileTest.operations.push({ id, intent, source: JSON.parse(source) });
					if (window.__fileTest.auto)
						window.__fileTest.complete(
							id,
							intent === "share"
								? "shared"
								: intent === "print"
									? "printed"
									: "saved",
						);
					return id;
				},
				finishShareFiles: (encoded) => {
					const ids = JSON.parse(encoded);
					window.__fileTest.operations.push({ id: ids[0], intent: "share-many", ids });
					window.__fileTest.complete(ids[0], "shared");
					return ids[0];
				},
				takeFileResult: (id) => {
					const result = results[id] || "";
					delete results[id];
					return result;
				},
			};
		});
		const button = (name) => page.getByRole("button", { name, exact: true });
		async function open(bytes, name, type, source) {
			await page.evaluate(
				({ encoded, name, type, source }) =>
					window.__fileTest.enqueue(encoded, name, type, source),
				{ encoded: Buffer.from(bytes).toString("base64"), name, type, source },
			);
			await page
				.locator(".document-topbar__title strong")
				.filter({ hasText: name })
				.waitFor();
			await page.waitForFunction(
				() => !document.querySelector('[aria-label="编辑文档"]')?.disabled,
			);
		}
		async function home() {
			for (let i = 0; i < 6 && (await page.locator(".document-topbar").isVisible()); i++) {
				await button("返回").click();
				await page.waitForTimeout(150);
			}
			await page.locator(".android-open-card").waitFor();
		}
		async function more() {
			await button("更多文档操作").click();
		}
		async function delivery() {
			await more();
			await button("转换、分享与打印").click();
		}
		await page.goto(base);
		await button("新建").waitFor();
		await page.screenshot({ path: output + "/home-phone.png" });
		await open(Buffer.from("# Original\nhello"), "working.md", "text/markdown", {
			id: "original",
			name: "working.md",
			writable: true,
			version: "initial",
		});
		await button("编辑文档").click();
		const editor = page.locator(".als-ofs-ui-markdown-editor__source-input");
		await editor.fill("# First edit\nhello");
		await page.evaluate(() => (window.__fileTest.auto = false));
		await more();
		await button(/保存原文件/).click();
		await page.waitForFunction(() => window.__fileTest.operations.length > 0);
		await editor.fill("# Edited while saving\nhello");
		await page.evaluate(() => {
			const operation = window.__fileTest.operations.at(-1);
			window.__fileTest.complete(operation.id);
		});
		await page.waitForFunction(() => !document.body.innerText.includes("正在处理文件…"));
		const saved = await page.evaluate(() => {
			const operation = window.__fileTest.operations.at(-1);
			return {
				intent: operation.intent,
				source: operation.source,
				bytes: window.__fileTest.sessions[operation.id].chunks.map(atob).join(""),
			};
		});
		assert.equal(saved.intent, "save");
		assert.equal(saved.source.id, "original");
		assert.match(saved.bytes, /# First edit/);
		assert.doesNotMatch(saved.bytes, /Edited while saving/);
		assert.match(await editor.inputValue(), /Edited while saving/);
		await delivery();
		await button("另存所选格式").click();
		await page.waitForFunction(() => window.__fileTest.operations.length >= 2);
		await page.evaluate(() =>
			window.__fileTest.complete(window.__fileTest.operations.at(-1).id, "cancelled"),
		);
		await page.waitForFunction(() => !document.body.innerText.includes("正在处理文件…"));
		assert.match(await editor.inputValue(), /Edited while saving/);
		await delivery();
		await button("另存所选格式").click();
		await page.waitForFunction(() => window.__fileTest.operations.length >= 3);
		await page.evaluate(() =>
			window.__fileTest.complete(
				window.__fileTest.operations.at(-1).id,
				"saved",
				"Provider failed",
			),
		);
		await page.getByRole("alert").filter({ hasText: "Provider failed" }).waitFor();
		assert.match(await editor.inputValue(), /Edited while saving/);
		await page.evaluate(() => (window.__fileTest.auto = true));
		await home();
		await page.reload();
		await page.locator(".android-file-row").filter({ hasText: "working.md" }).click();
		await page.getByRole("heading", { name: "Edited while saving", exact: true }).waitFor();
		await home();
		console.log("PASS save snapshot, edits during save, cancel/failure, reload recovery");

		const svg = Buffer.from(
			'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="red"/></svg>',
		);
		await open(svg, "vector.svg", "image/svg+xml", {
			id: "svg",
			name: "vector.svg",
			writable: true,
			version: "svg",
		});
		await page
			.locator('.harmony-documents__surface[data-active="true"] .mobile-image__picture img')
			.waitFor();
		await button("放大").click();
		await delivery();
		await button("分享原文件").click();
		await page.waitForFunction(() => window.__fileTest.operations.at(-1)?.intent === "share");
		let imageResult = await page.evaluate(() => {
			const operation = window.__fileTest.operations.at(-1);
			return window.__fileTest.sessions[operation.id].chunks.map(atob).join("");
		});
		assert.equal(imageResult, svg.toString());
		await button("编辑文档").click();
		await page
			.getByRole("dialog")
			.filter({ hasText: "转换为 PNG" })
			.getByRole("button", { name: /确定|继续|确认/ })
			.click();
		await button("图片工具").click();
		await button("向右旋转 90°").click();
		await page.waitForFunction(() =>
			document
				.querySelector(
					'.harmony-documents__surface[data-active="true"] .mobile-image__navigation span',
				)
				?.textContent.includes("100 × 200"),
		);
		await button("关闭图片工具").click();
		await page.screenshot({ path: output + "/image-edit-phone.png" });
		await button("撤销").click();
		await page.waitForFunction(() =>
			document
				.querySelector(
					'.harmony-documents__surface[data-active="true"] .mobile-image__navigation span',
				)
				?.textContent.includes("200 × 100"),
		);
		await delivery();
		await page.getByLabel("输出格式", { exact: true }).selectOption("pdf");
		await button("另存所选格式").click();
		await page.waitForFunction(() => window.__fileTest.operations.at(-1)?.intent === "export");
		const imagePdf = await page.evaluate(() => {
			const operation = window.__fileTest.operations.at(-1);
			return window.__fileTest.sessions[operation.id].chunks.map(atob).join("");
		});
		assert.equal((await PDFDocument.load(Buffer.from(imagePdf, "binary"))).getPageCount(), 1);
		await button("图片工具").click();
		await page.getByLabel("宽", { exact: true }).fill("50");
		await button("应用裁剪").click();
		await page.waitForFunction(() =>
			document
				.querySelector(
					'.harmony-documents__surface[data-active="true"] .mobile-image__navigation span',
				)
				?.textContent.includes("100 × 100"),
		);
		await page.getByLabel("最长边（像素）", { exact: true }).fill("50");
		await button("缩小图片").click();
		await page.waitForFunction(() =>
			document
				.querySelector(
					'.harmony-documents__surface[data-active="true"] .mobile-image__navigation span',
				)
				?.textContent.includes("50 × 50"),
		);
		await page.getByLabel("标注文字", { exact: true }).fill("QA");
		await button("添加文字").click();
		await page.waitForFunction(() => !document.body.innerText.includes("正在处理图片…"));
		await button("关闭图片工具").click();
		await home();
		console.log("PASS SVG preservation, explicit conversion, image rotate/undo/PDF export");

		await open(tiffFixture(), "multipage.tiff", "image/tiff");
		await page
			.locator('.harmony-documents__surface[data-active="true"] .mobile-image__picture img')
			.waitFor();
		assert.match(
			await page
				.locator(
					'.harmony-documents__surface[data-active="true"] .mobile-image__navigation span',
				)
				.innerText(),
			/1 \/ 2/,
		);
		await button("下一页").click();
		assert.match(
			await page
				.locator(
					'.harmony-documents__surface[data-active="true"] .mobile-image__navigation span',
				)
				.innerText(),
			/2 \/ 2/,
		);
		await home();
		console.log("PASS all TIFF pages remain available");
		const oversized = UTIF.encode([
			{
				t256: [100000],
				t257: [100000],
				t258: [8],
				t259: [1],
				t262: [1],
				t273: [0],
				t277: [1],
				t279: [1],
			},
		]);
		const imageBudget = await page.evaluate(async (encoded) => {
			const { readImagePreview } = await import("/src/mobile/image-document.ts");
			try {
				await readImagePreview(
					new Blob([Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))]),
					"oversized.tiff",
				);
				return "unexpected success";
			} catch (error) {
				return error.message;
			}
		}, Buffer.from(oversized).toString("base64"));
		assert.match(imageBudget, /尺寸过大/);
		console.log("PASS oversized TIFF rejected before pixel allocation");

		const doc = await PDFDocument.create();
		const font = await doc.embedFont(StandardFonts.Helvetica);
		doc.addPage([300, 400]).drawText("First page", { x: 30, y: 350, font });
		doc.addPage([400, 300]).drawText("Second page", { x: 30, y: 250, font });
		const field = doc.getForm().createTextField("Contact");
		field.addToPage(doc.getPage(0), { x: 30, y: 250, width: 160, height: 30 });
		await open(await doc.save(), "form.pdf", "application/pdf", {
			id: "pdf",
			name: "form.pdf",
			writable: true,
			version: "pdf",
		});
		await button("编辑文档").click();
		await page.getByRole("textbox", { name: "Contact", exact: true }).fill("张三");
		await button("PDF 工具").click();
		await page.getByLabel("文字或批注", { exact: true }).fill("Review note");
		await button("添加批注").click();
		await page.waitForFunction(() => !document.body.innerText.includes("正在处理 PDF…"));
		await button("旋转当前页").click();
		await page.waitForTimeout(400);
		await page.getByLabel("文字或批注", { exact: true }).fill("签收确认");
		await button("填写文字").click();
		await page.waitForFunction(() => !document.body.innerText.includes("正在处理 PDF…"));
		const signature = page.getByLabel("手写签名区域", { exact: true });
		await signature.scrollIntoViewIfNeeded();
		const area = await signature.boundingBox();
		await page.mouse.move(area.x + 20, area.y + 20);
		await page.mouse.down();
		await page.mouse.move(area.x + 90, area.y + 50, { steps: 6 });
		await page.mouse.up();
		await button("放入当前页").click();
		await page.waitForFunction(() => !document.body.innerText.includes("正在处理 PDF…"));
		await button("关闭 PDF 工具").click();
		await delivery();
		await button("另存所选格式").click();
		await page.waitForTimeout(250);
		const pdfResult = await page.evaluate(() => {
			const operation = window.__fileTest.operations.at(-1);
			return window.__fileTest.sessions[operation.id].chunks.map(atob).join("");
		});
		const exported = await PDFDocument.load(Buffer.from(pdfResult, "binary"));
		assert.equal(exported.getPageCount(), 2);
		assert.equal(exported.getPage(0).getRotation().angle, 90);
		assert.equal(exported.getForm().getTextField("Contact").getText(), "张三");
		assert.ok(exported.getPage(0).node.Annots()?.size() >= 3);
		assert.ok(
			exported.getPage(0).node.Resources().get(require("pdf-lib").PDFName.of("XObject")),
		);
		await page.screenshot({ path: output + "/pdf-edit-phone.png" });
		await home();
		console.log("PASS PDF annotation/rotation export preserves forms and page count");

		const row = page.locator(".android-file-entry").filter({ hasText: "form.pdf" });
		await row.getByRole("button", { name: "文件操作 form.pdf", exact: true }).click();
		await button("收藏 form.pdf").click();
		await button("收藏").click();
		await page.locator(".android-file-row").filter({ hasText: "form.pdf" }).waitFor();
		await page.reload();
		await button("收藏").click();
		await page.locator(".android-file-row").filter({ hasText: "form.pdf" }).waitFor();
		await button("最近").click();
		await button("多选").click();
		await page.getByRole("checkbox", { name: "选择 working.md", exact: true }).check();
		await page.getByRole("checkbox", { name: "选择 form.pdf", exact: true }).check();
		await button("分享 2 个").click();
		await page.waitForFunction(() =>
			window.__fileTest.operations.some((item) => item.intent === "share-many"),
		);
		assert.equal(await page.evaluate(() => window.__fileTest.operations.at(-1).ids.length), 2);
		await button("逐个另存").click();
		await page.waitForFunction(
			() =>
				window.__fileTest.operations.filter((item) => item.intent === "export").length >= 2,
		);
		await page.screenshot({ path: output + "/file-selection-phone.png" });
		await button("完成选择").click();
		for (const size of [
			{ width: 375, height: 812 },
			{ width: 812, height: 375 },
			{ width: 1024, height: 768 },
			{ width: 390, height: 430 },
		]) {
			await page.setViewportSize(size);
			assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
			await page.screenshot({ path: `${output}/home-${size.width}x${size.height}.png` });
		}
		assert.deepEqual(errors, []);
		console.log("PASS favorites, batch share/export, phone/tablet/keyboard-sized layout");
	} finally {
		await browser.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
