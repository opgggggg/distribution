const assert = require("node:assert/strict");
const { chromium, webkit } = require("playwright");
(async () => {
	for (const engine of [chromium, webkit]) {
		const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
		try {
			const p = await browser.newPage({
				viewport: { width: 744, height: 1133 },
				hasTouch: true,
			});
			const errors = [];
			p.on("pageerror", (e) => errors.push(e.message));
			await p.goto("http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1");
			await p.locator(".cube-notes__ink-canvas").waitFor();
			const result = await p.evaluate(async () => {
				const { createNotebook } = await import("/packages/notes/src/model.ts");
				const { NoteHistory } = await import("/packages/notes/src/history.ts");
				const { writeNotebook, readNotebookState } = await import(
					"/packages/notes/src/codec.ts"
				);
				const { writeNotebookInBackground } = await import(
					"/packages/notes/src/vue/notebook-writer.ts"
				);
				const { getBrushPlugin, registerBrushPlugin } = await import(
					"/packages/notes/src/brushes.ts"
				);
				const h = new NoteHistory(createNotebook("Latency", true));
				for (let i = 0; i < 50; i++)
					h.commitPage(h.document.pages[0].id, (p) =>
						p.layers[0].elements.push({
							id: "s" + i,
							kind: "stroke",
							tool: "pen",
							penStyle: "fountain",
							color: "#123456",
							width: 3,
							opacity: 1,
							pressure: true,
							points: Array.from({ length: 200 }, (_, j) => ({
								x: j * 1.5,
								y: 50 + i * 2 + Math.sin(j / 20) * 20,
								pressure: 0.5,
							})),
						}),
					);
				const original = h.document,
					history = h.capture();
				window.perfFixture = writeNotebook(original, history);
				const before = performance.now();
				writeNotebook(original, history);
				const syncMs = performance.now() - before;
				// During a background save, pen input and animation must remain responsive.
				let last = performance.now(),
					maxGap = 0,
					ticks = 0;
				const timer = setInterval(() => {
					const now = performance.now();
					maxGap = Math.max(maxGap, now - last);
					last = now;
					ticks++;
				}, 5);
				const start = performance.now();
				const pending = writeNotebookInBackground(original, history);
				const dispatchMs = performance.now() - start;
				h.commitPage(h.document.pages[0].id, (p) =>
					p.layers[0].elements.push({ ...p.layers[0].elements[0], id: "newer" }),
				);
				const blob = await pending;
				clearInterval(timer);
				const asyncMs = performance.now() - start;
				const restored = readNotebookState(new Uint8Array(await blob.arrayBuffer()));
				if (restored.document.pages[0].layers[0].elements.length !== 50)
					throw Error("save used a later revision");
				if (restored.history.past.length !== history.past.length)
					throw Error("history was truncated unexpectedly");
				const reopened = new NoteHistory(restored.document, false, restored.history);
				reopened.undo();
				if (reopened.document.pages[0].layers[0].elements.length !== 49)
					throw Error("undo lost");
				reopened.redo();
				if (reopened.document.pages[0].layers[0].elements.length !== 50)
					throw Error("redo lost");
				const plugin = getBrushPlugin("ballpoint");
				registerBrushPlugin({
					...plugin,
					id: "qa:save",
					label: "Save plugin",
					labelEn: "Save plugin",
				});
				const custom = createNotebook("Custom");
				custom.pages[0].layers[0].elements = [
					{
						...original.pages[0].layers[0].elements[0],
						penStyle: "qa:save",
						brushVersion: 1,
					},
				];
				const customBlob = await writeNotebookInBackground(custom, {
					past: [],
					future: [],
				});
				if (
					readNotebookState(new Uint8Array(await customBlob.arrayBuffer())).document
						.pages[0].layers[0].elements[0].penStyle !== "qa:save"
				)
					throw Error("custom plugin lost");
				const controller = new AbortController();
				const aborted = writeNotebookInBackground(original, history, controller.signal);
				controller.abort();
				let didAbort = false;
				try {
					await aborted;
				} catch (e) {
					didAbort = e.name === "AbortError";
				}
				if (!didAbort) throw Error("cancellation failed");
				let invalid = false;
				try {
					await writeNotebookInBackground({ ...original, pages: [] }, history);
				} catch (e) {
					invalid = /Invalid/.test(e.message);
				}
				if (!invalid) throw Error("worker validation failure not delivered");
				h.undo();
				h.undo();
				const redoBlob = await writeNotebookInBackground(h.document, h.capture());
				const redoState = readNotebookState(new Uint8Array(await redoBlob.arrayBuffer()));
				if (redoState.history.future.length !== 2)
					throw Error("redo stack lost in background save");
				const redoHistory = new NoteHistory(redoState.document, false, redoState.history);
				redoHistory.redo();
				redoHistory.redo();
				if (redoHistory.document.pages[0].layers[0].elements.length !== 51)
					throw Error("redo restore failed");
				return {
					syncMs,
					dispatchMs,
					asyncMs,
					maxGap,
					ticks,
					historySteps: history.past.length,
					bytes: blob.size,
				};
			});
			console.log(engine.name(), JSON.stringify(result));
			assert(result.ticks > 2, "main-thread heartbeat must continue while saving");
			assert(
				result.maxGap < Math.max(100, result.syncMs * 0.65),
				"save must not monopolize the UI thread",
			);
			assert(
				result.dispatchMs < Math.max(80, result.syncMs * 0.5),
				"dispatch must not encode history synchronously",
			);
			await p.evaluate(() => (window.noteSource.value = window.perfFixture));
			await p.waitForFunction(() => {
				try {
					return window.notebook.value.getNotebook().title === "Latency";
				} catch {
					return false;
				}
			});
			const drawing = await p.evaluate(async () => {
				const { readNotebookState } = await import("/packages/notes/src/codec.ts");
				const c = document.querySelector(".cube-notes__ink-canvas"),
					base = document.querySelector(".cube-notes__paper-canvas"),
					box = c.getBoundingClientRect();
				c.setPointerCapture = () => {};
				c.hasPointerCapture = () => false;
				const pen = (type, x) =>
					c.dispatchEvent(
						new PointerEvent(type, {
							bubbles: true,
							cancelable: true,
							pointerId: 73,
							pointerType: "pen",
							buttons: type === "pointerup" ? 0 : 1,
							pressure: 0.6,
							clientX: box.left + x,
							clientY: box.top + 180,
						}),
					);
				const saved = window.notebook.value.exportFile();
				pen("pointerdown", 100);
				await new Promise(requestAnimationFrame);
				const isDrawing = document.querySelector(".cube-notes").dataset.drawing === "true";
				const thumb = await base.boardPreview();
				for (let i = 1; i <= 8; i++) {
					pen("pointermove", 100 + i * 10);
					await new Promise(requestAnimationFrame);
				}
				pen("pointerup", 190);
				const blob = await saved;
				const restored = readNotebookState(new Uint8Array(await blob.arrayBuffer()));
				return {
					isDrawing,
					thumbSkipped: thumb === undefined,
					saved: restored.document.pages[0].layers[0].elements.length,
					current: window.notebook.value.getNotebook().pages[0].layers[0].elements.length,
				};
			});
			assert.deepEqual(drawing, {
				isDrawing: true,
				thumbSkipped: true,
				saved: 50,
				current: 51,
			});
			await p.evaluate(async () => {
				const api = window.notebook.value;
				let release;
				const waiting = new Promise((resolve) => (release = resolve));
				const revision = api.getRevision();
				const save = api.saveFile({ deliver: () => waiting });
				api.undo();
				release();
				await save;
				if (!api.isDirty() || api.getRevision() === revision)
					throw Error("stale save cleared newer changes");
				const controller = new AbortController();
				controller.abort();
				try {
					await api.exportFile("cubenote", { signal: controller.signal });
					throw Error("abort ignored");
				} catch (e) {
					if (e.name !== "AbortError") throw e;
				}
			});
			console.log(
				`${engine.name()}: drawing during save, preview deferral, revision isolation, redo, plugin and cancellation passed`,
			);
			assert.deepEqual(errors, []);
			await p.close();
		} finally {
			await browser.close();
		}
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
