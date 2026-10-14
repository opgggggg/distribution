const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium } = require("playwright");
(async () => {
	const { readNotebookState } = await import("../dist/index.js");
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	const errors = [];
	try {
		const base = "http://127.0.0.1:5178/packages/notes/tests/viewer.html";
		async function open(bytes) {
			const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
			p.on("pageerror", (e) => errors.push(e.message));
			await p.goto(base);
			await p.locator(".cube-notes__ink-canvas").waitFor();
			if (bytes) {
				await p.evaluate((bytes) => {
					window.noteSource.value = new Blob([new Uint8Array(bytes)]);
				}, bytes);
				await p.waitForFunction(() =>
					document.querySelector('button[aria-label="重做"]:not(:disabled)'),
				);
			}
			return p;
		}
		const doc = (p) => p.evaluate(() => window.notebook.value.getNotebook());
		const count = async (p) => (await doc(p)).pages[0].layers[0].elements.length;
		const bytes = (p) =>
			p.evaluate(async () => [
				...new Uint8Array(
					await (await window.notebook.value.exportFile("cubenote")).arrayBuffer(),
				),
			]);
		const p = await open();
		const box = await p.locator(".cube-notes__ink-canvas").boundingBox();
		for (const y of [120, 200]) {
			await p.mouse.move(box.x + 70, box.y + y);
			await p.mouse.down();
			await p.mouse.move(box.x + 210, box.y + y, { steps: 5 });
			await p.mouse.up();
		}
		const drawn = await doc(p);
		await p.getByRole("button", { name: "撤销", exact: true }).click();
		const saved = await p.evaluate(async () => {
			let result;
			await window.notebook.value.saveFile({
				deliver: async (blob) => {
					result = [...new Uint8Array(await blob.arrayBuffer())];
				},
			});
			return result;
		});
		assert.equal(await p.evaluate(() => window.notebook.value.isDirty()), false);
		await p.close();
		const q = await open(saved);
		assert.equal(await count(q), 1);
		assert.equal(await q.getByRole("button", { name: "撤销", exact: true }).isEnabled(), true);
		await q.getByRole("button", { name: "重做", exact: true }).click();
		assert.deepEqual(await doc(q), drawn);
		await q.getByRole("button", { name: "撤销", exact: true }).click();
		await q.getByRole("button", { name: "撤销", exact: true }).click();
		const blank = await bytes(q);
		await q.close();
		const r = await open(blank);
		assert.equal(await count(r), 0);
		assert.equal(await r.getByRole("button", { name: "撤销", exact: true }).isDisabled(), true);
		await r.getByRole("button", { name: "重做", exact: true }).click();
		await r.getByRole("button", { name: "重做", exact: true }).click();
		assert.deepEqual(await doc(r), drawn);
		await r.locator('[data-tool="text"]').click();
		const paper = await r.locator(".cube-notes__ink-canvas").boundingBox();
		await r.mouse.click(paper.x + 60, paper.y + 65);
		await r.getByRole("textbox", { name: "编辑文字" }).fill("草稿文本也可以继续撤销");
		const draft = await bytes(r);
		assert.equal(await r.getByRole("textbox", { name: "编辑文字" }).isVisible(), true);
		const restored = readNotebookState(new Uint8Array(draft));
		assert.equal(restored.history.past.at(-1).pages[0].layers[0].elements.length, 2);
		assert.equal(restored.document.pages[0].layers[0].elements.length, 3);
		await r.close();
		// Real mobile IndexedDB autosave: undo everything, reload the host, then redo.
		const phone = await browser.newPage({
			viewport: { width: 390, height: 844 },
			hasTouch: true,
			isMobile: true,
		});
		phone.on("pageerror", (e) => errors.push(e.message));
		await phone.goto("http://127.0.0.1:5179/?platform=android");
		await phone.getByRole("button", { name: "同意并继续" }).click();
		await phone.getByRole("button", { name: "新建", exact: true }).click();
		await phone.locator(".android-sheet button").filter({ hasText: "手写笔记" }).click();
		await phone.locator(".cube-notes__ink-canvas").waitFor();
		const input = await phone.context().newCDPSession(phone);
		for (const y of [130, 220]) {
			await input.send("Input.dispatchTouchEvent", {
				type: "touchStart",
				touchPoints: [{ x: 55, y, id: 1 }],
			});
			await input.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [{ x: 220, y, id: 1 }],
			});
			await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		}
		const since = Date.now();
		await phone.getByRole("button", { name: "撤销", exact: true }).click();
		await phone.getByRole("button", { name: "撤销", exact: true }).click();

		let persisted;
		const deadline = Date.now() + 15000;
		while (!persisted && Date.now() < deadline) {
			persisted = await phone.evaluate(async (since) => {
				const db = await new Promise((resolve, reject) => {
					const r = indexedDB.open("auroraprime-office-mobile", 1);
					r.onsuccess = () => resolve(r.result);
					r.onerror = () => reject(r.error);
				});
				try {
					const records = await new Promise((resolve, reject) => {
						const r = db
							.transaction("document-autosaves")
							.objectStore("document-autosaves")
							.getAll();
						r.onsuccess = () => resolve(r.result);
						r.onerror = () => reject(r.error);
					});
					const record = records.find((r) => r.savedAt > since);
					return record ? [...new Uint8Array(await record.blob.arrayBuffer())] : null;
				} finally {
					db.close();
				}
			}, since);
			if (!persisted) await phone.waitForTimeout(300);
		}
		assert.ok(persisted, "the changed redo state was autosaved to IndexedDB");
		const recovered = readNotebookState(new Uint8Array(persisted));
		assert.equal(recovered.document.pages[0].layers[0].elements.length, 0);
		assert.equal(recovered.history.future.length, 2);
		await phone.reload();
		await phone.locator(".android-file-row").first().click();
		await phone.getByRole("button", { name: "编辑文档", exact: true }).first().click();
		await phone.getByRole("button", { name: "重做", exact: true }).click();
		await phone.getByRole("button", { name: "重做", exact: true }).click();
		const download = phone.waitForEvent("download");
		await phone
			.locator(".cube-notes__header")
			.getByRole("button", { name: "保存", exact: true })
			.click();
		const file = await download;
		const final = readNotebookState(new Uint8Array(await fs.readFile(await file.path())));
		assert.equal(final.document.pages[0].layers[0].elements.length, 2);
		assert.equal(final.history.past.length, 2);
		assert.equal(final.history.future.length, 0);
		assert.deepEqual(errors, []);
		console.log(
			"PASS: native reopen restores cursor/buttons, blank-page redo survives, pending text is undoable, and mobile IndexedDB redo survives host reload",
		);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
