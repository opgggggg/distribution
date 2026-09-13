/** Android regression: run against the Vite dev server using ANDROID_PREVIEW_URL. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const root = path.resolve(__dirname, "../../..");
const base = process.env.ANDROID_PREVIEW_URL || "http://127.0.0.1:5173/?platform=android";

(async () => {
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	const errors = [];
	const page = await browser.newPage({
		viewport: { width: 412, height: 915 },
		isMobile: true,
		hasTouch: true,
		deviceScaleFactor: 3,
	});
	page.on("pageerror", (error) => errors.push(error.message));
	async function waitForPreview(fileName) {
		const deadline = Date.now() + 20000;
		while (Date.now() < deadline) {
			const ready = await page.evaluate(async (name) => {
				const { listHarmonyAutosaves } = await import("/src/autosave-store.ts");
				return (await listHarmonyAutosaves()).some(
					(record) =>
						record.fileName === name && record.preview?.startsWith("data:image/jpeg;"),
				);
			}, fileName);
			if (ready) return;
			await page.waitForTimeout(100);
		}
		assert.fail(`Missing persisted preview: ${fileName}`);
	}
	async function swipe(from, to) {
		const session = await page.context().newCDPSession(page);
		await session.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [{ x: from, y: 200 }],
		});
		for (let step = 1; step <= 12; step++) {
			await session.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [{ x: from + ((to - from) * step) / 12, y: 200 }],
			});
		}
		await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		await session.detach();
	}
	async function activeSlide(index) {
		await page.waitForFunction(
			(expected) =>
				[...document.querySelectorAll("#viewer .als-ofs-pptx-slide-frame")].findIndex(
					(frame) => frame.dataset.editorActiveSlide === "true",
				) === expected,
			index,
		);
	}
	try {
		await page.goto(base);
		await page
			.locator(".android-file-input")
			.setInputFiles(path.join(root, "als-office/demo/assets/translation-demo-zh-CN.docx"));
		await waitForPreview("translation-demo-zh-CN.docx");
		await page.reload();
		await page.locator(".android-file-preview img").waitFor();
		assert.equal(
			await page
				.locator(".android-file-preview img")
				.evaluate((img) => img.complete && img.naturalWidth > 0),
			true,
		);
		console.log("PASS: DOCX cover persists and displays after reload");

		await page
			.locator(".android-file-input")
			.setInputFiles(path.join(root, "website/templates/pptx/meridian.en.pptx"));
		await waitForPreview("meridian.en.pptx");
		await page.getByRole("button", { name: "播放", exact: true }).click();
		await page.setViewportSize({ width: 915, height: 412 });
		await page.locator('#dropzone[data-editor-view="single"]').waitFor();
		await activeSlide(0);
		await swipe(720, 170);
		await activeSlide(1);
		await swipe(170, 720);
		await activeSlide(0);
		await swipe(170, 720);
		await activeSlide(0);
		await page.keyboard.press("Escape");
		await page.setViewportSize({ width: 412, height: 915 });
		await page.locator('#dropzone[data-editor-view="all"]').waitFor();
		console.log(
			"PASS: PPTX cover, playback, left/right touch swipes, first-slide boundary and exit",
		);

		await page.goto(base);
		await page.getByRole("button", { name: "新建", exact: true }).click();
		await page
			.locator(".android-sheet")
			.getByRole("button", { name: /文字文档/ })
			.click();
		await page.locator(".als-ofs-docx-word-page").waitFor();
		// New unsaved documents have no source Blob but still need a cover.
		await page.waitForFunction(
			() => {
				const instance = document.querySelector(".android-topbar")?.__vueParentComponent;
				return instance?.props.active?.preview?.startsWith("data:image/jpeg;");
			},
			null,
			{ timeout: 15000 },
		);
		console.log("PASS: new DOCX gets a cover without a source Blob");

		await page.goto(base);
		const result = await page.evaluate(async () => {
			const { captureDocumentPreview } = await import("/src/document-preview.ts");
			const surface = document.createElement("div");
			surface.style.cssText = "position:fixed;left:0;top:0;width:400px;background:white";
			const target = document.createElement("section");
			target.className = "als-ofs-docx-word-page";
			target.dataset.wordPageId = "word-web-page";
			target.style.cssText = "width:400px;background:white";
			for (let i = 0; i < 1500; i++) {
				const block = document.createElement("div");
				block.dataset.wordBlockId = String(i);
				block.style.cssText = "height:80px;color:black;font-size:20px";
				block.textContent = `Preview paragraph ${i}`;
				target.append(block);
			}
			const broken = document.createElement("img");
			broken.src = "data:image/png;base64,broken";
			target.firstElementChild.append(broken);
			surface.append(target);
			document.body.append(surface);
			await new Promise((resolve) => {
				if (broken.complete) resolve();
				else broken.onerror = resolve;
			});
			const original = window.getComputedStyle;
			let styledBlocks = 0;
			window.getComputedStyle = function (node, pseudo) {
				if (node instanceof Element && node.hasAttribute("data-word-block-id"))
					styledBlocks++;
				return original.call(window, node, pseudo);
			};
			const start = performance.now();
			try {
				const preview = await captureDocumentPreview(surface);
				return {
					preview: preview?.slice(0, 23),
					styledBlocks,
					milliseconds: performance.now() - start,
				};
			} finally {
				window.getComputedStyle = original;
				surface.remove();
			}
		});
		assert.equal(result.preview, "data:image/jpeg;base64,");
		assert.ok(result.styledBlocks < 100, `Cloned off-cover blocks: ${result.styledBlocks}`);
		assert.ok(result.milliseconds < 5000, `Preview timed out: ${result.milliseconds}ms`);
		console.log(
			"PASS: broken image does not block cover; 1500-block document crops before cloning",
			result,
		);
		const hiddenSlidePreview = await page.evaluate(async () => {
			const { captureDocumentPreview } = await import("/src/document-preview.ts");
			const surface = document.createElement("div");
			surface.style.cssText = "position:fixed;left:0;top:0;width:240px";
			surface.innerHTML =
				'<div id="viewer"><section class="als-ofs-pptx-slide" hidden style="width:240px;height:135px;background:red"></section><section class="als-ofs-pptx-slide" style="width:240px;height:135px;background:rgb(0,128,0)"></section></div>';
			document.body.append(surface);
			try {
				const preview = await captureDocumentPreview(surface);
				if (!preview) return false;
				const image = new Image();
				image.src = preview;
				await image.decode();
				const canvas = document.createElement("canvas");
				canvas.width = image.width;
				canvas.height = image.height;
				const context = canvas.getContext("2d");
				context.drawImage(image, 0, 0);
				const [red, green, blue] = context.getImageData(10, 10, 1, 1).data;
				return red < 10 && green > 110 && blue < 10;
			} finally {
				surface.remove();
			}
		});
		assert.equal(hiddenSlidePreview, true);
		console.log("PASS: preview captures visible PPTX slide when first slide is hidden");
		assert.deepEqual(errors, []);
	} finally {
		await browser.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
