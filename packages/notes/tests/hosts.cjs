const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium } = require("playwright");

(async () => {
	const { readNotebook } = await import("../dist/index.js");
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	const errors = [];
	try {
		for (const [mode, url, viewport] of [
			[
				"desktop",
				process.env.NOTES_DESKTOP_URL || "http://127.0.0.1:5181/",
				{ width: 1280, height: 900 },
			],
			[
				"mobile",
				process.env.NOTES_MOBILE_URL || "http://127.0.0.1:5179/?platform=android",
				{ width: 390, height: 844 },
			],
		]) {
			const page = await browser.newPage({ viewport });
			page.on("pageerror", (error) => errors.push(error.message));
			await page.goto(url);
			if (mode === "mobile") {
				await page.getByRole("button", { name: "同意并继续" }).click();
				await page.getByRole("button", { name: "新建", exact: true }).click();
				await page.locator(".android-sheet button").filter({ hasText: "手写笔记" }).click();
			} else {
				await page.getByRole("button", { name: "New", exact: true }).click();
				await page
					.locator(".desktop-new__menu button")
					.filter({ hasText: "CubeOffice Notes" })
					.click();
			}
			const paper = page.locator(".cube-notes__ink-canvas");
			await paper.waitFor();
			assert.ok((await page.locator(".cube-notes").boundingBox()).height > 400);
			const box = await paper.boundingBox();
			await page.mouse.move(box.x + 40, box.y + 60);
			await page.mouse.down();
			await page.mouse.move(box.x + 150, box.y + 85, { steps: 8 });
			await page.mouse.up();
			const output = page.waitForEvent("download");
			await page
				.locator(".cube-notes__header")
				.getByRole("button", { name: /^(保存|Save)$/ })
				.click();
			const download = await output;
			const bytes = new Uint8Array(await fs.readFile(await download.path()));
			assert.ok(download.suggestedFilename().endsWith(".cubenote"));
			const book = readNotebook(bytes);
			assert.equal(book.pages[0].layers[0].elements.length, 1);
			if (mode === "desktop") {
				const savedViaHost = page.waitForEvent("download");
				await paper.click({ position: { x: 190, y: 100 } });
				await page.keyboard.press("Control+s");
				const hostDownload = await savedViaHost;
				assert.ok(hostDownload.suggestedFilename().endsWith(".cubenote"));
				const fromHost = readNotebook(
					new Uint8Array(await fs.readFile(await hostDownload.path())),
				);
				assert.equal(fromHost.pages[0].layers[0].elements.length, 2);
			}
			await page.screenshot({
				path: `.cache/notes-qa/${mode}-host.png`,
				animations: "disabled",
			});
			if (mode === "mobile") {
				await page.reload();
				await page
					.locator(".android-file-row")
					.filter({ hasText: "Notebook.cubenote" })
					.click();
				await page.locator('.cube-notes[data-readonly="true"]').waitFor();
				await page.getByRole("button", { name: "编辑文档", exact: true }).click();
				await page.locator('.cube-notes[data-readonly="false"]').waitFor();
				const restoredOutput = page.waitForEvent("download");
				await page.locator('.cube-notes__header button[aria-label="保存"]').click();
				const restored = await restoredOutput;
				const recovered = readNotebook(
					new Uint8Array(await fs.readFile(await restored.path())),
				);
				assert.deepEqual(
					recovered.pages[0].layers[0].elements,
					book.pages[0].layers[0].elements,
				);
			}
			console.log(
				`PASS: ${mode} New → write → native save${mode === "mobile" ? " → reload → draft recovery → edit/save" : ""}`,
			);
			await page.close();
		}
		assert.deepEqual(errors, []);
	} finally {
		await browser.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
