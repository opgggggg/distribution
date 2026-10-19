const assert = require("node:assert/strict");
const { chromium, webkit } = require("playwright");
const fs = require("node:fs");
(async () => {
	for (const engine of [chromium, webkit]) {
		const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
		try {
			for (const width of [744, 375]) {
				const p = await browser.newPage({
					viewport: { width, height: 1133 },
					hasTouch: true,
					reducedMotion: "reduce",
				});
				p.setDefaultTimeout(10000);
				const errors = [];
				p.on("pageerror", (e) => errors.push(e.message));
				await p.goto("http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1");
				await p.locator(".cube-notes__ink-canvas").waitFor();
				await p.evaluate(async () => {
					const { createNotebook } = await import("/packages/notes/src/model.ts"),
						{ writeNotebook } = await import("/packages/notes/src/codec.ts");
					const book = createNotebook("擦除测试"),
						page = book.pages[0];
					page.paper = "plain";
					const src = (color) => {
						const c = document.createElement("canvas");
						c.width = c.height = 20;
						const ctx = c.getContext("2d");
						ctx.fillStyle = color;
						ctx.fillRect(0, 0, 20, 20);
						return c.toDataURL();
					};
					page.background = {
						id: "bg",
						kind: "image",
						src: src("#d9f3e5"),
						x: 0,
						y: 0,
						width: 595.28,
						height: 841.89,
						opacity: 1,
					};
					page.layers[0].elements = ["ballpoint", "watercolor", "spray", "oil"].map(
						(style, i) => ({
							id: style,
							kind: "stroke",
							tool: "pen",
							penStyle: style,
							brushVersion: style === "spray" || style === "oil" ? 2 : 1,
							brushSeed: 123,
							color: "#2563eb",
							width: style === "ballpoint" ? 16 : 30,
							opacity: 1,
							pressure: false,
							points: [
								{ x: 100, y: 160 + 90 * i, pressure: 0.5 },
								{ x: 420, y: 160 + 90 * i, pressure: 0.5 },
							],
						}),
					);
					page.layers[0].elements.push({
						id: "photo",
						kind: "image",
						src: src("#ee7722"),
						x: 440,
						y: 80,
						width: 100,
						height: 100,
						opacity: 1,
					});
					window.noteSource.value = writeNotebook(book);
				});
				await p.waitForFunction(
					() => window.notebook.value.getNotebook().pages[0].background?.id === "bg",
				);
				const elements = () =>
					p.evaluate(
						() => window.notebook.value.getNotebook().pages[0].layers[0].elements,
					);
				async function screen(x, y) {
					const b = await p.locator(".cube-notes__ink-canvas").boundingBox();
					return { x: b.x + (x * b.width) / 595.28, y: b.y + (y * b.height) / 841.89 };
				}
				async function erase(x1, y1, x2, y2) {
					const a = await screen(x1, y1),
						b = await screen(x2, y2);
					await p.mouse.move(a.x, a.y);
					await p.mouse.down();
					await p.mouse.move(b.x, b.y, { steps: 8 });
					await p.mouse.up();
					await p.evaluate(() => new Promise(requestAnimationFrame));
				}
				const before = await elements();
				await p.locator('[data-tool="eraser"]').click();
				await p.locator('[data-tool="eraser"]').click();
				await p.getByRole("button", { name: "轨迹擦除", exact: true }).click();
				await p.getByRole("button", { name: "40 pt", exact: true }).click();
				const modes = await p.locator(".cube-notes__eraser-modes").boundingBox();
				assert.ok(modes.x >= 0 && modes.x + modes.width <= width);
				fs.mkdirSync(".cache/notes-qa", { recursive: true });
				await p.screenshot({
					path: `.cache/notes-qa/eraser-settings-${engine.name()}-${width}.png`,
				});
				await p.keyboard.press("Escape");
				await erase(250, 120, 250, 470);
				const after = await elements();
				assert.equal(after.length, 5);
				for (let i = 0; i < 4; i++) {
					assert.ok(after[i].erasures?.length);
					assert.deepEqual(after[i].points, before[i].points);
					assert.equal(after[i].brushSeed, before[i].brushSeed);
				}
				assert.deepEqual(after[4], before[4]);
				// A second crossing mask must never restore earlier holes. Confirm Canvas,
				// SVG thumbnail, PNG export and the original photo underneath agree.
				await erase(230, 160, 270, 160);
				const report = await p.evaluate(async () => {
					const page = window.notebook.value.getNotebook().pages[0];
					const { createPagePainter, pageSvg } = await import(
						"/packages/notes/src/render.ts"
					);
					const { loadPagePhotos } = await import("/packages/notes/src/photo.ts");
					const { exportNotesPagePng } = await import("/packages/notes/src/image.ts");
					const canvas = document.createElement("canvas");
					canvas.width = 596;
					canvas.height = 842;
					const ctx = canvas.getContext("2d");
					createPagePainter(undefined, await loadPagePhotos(page))(ctx, page);
					const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
					const direct = {
						hole: pixel(250, 160),
						left: pixel(150, 160),
						image: pixel(460, 100),
					};
					const svg = new Image();
					svg.src = URL.createObjectURL(
						new Blob([pageSvg(page)], { type: "image/svg+xml" }),
					);
					await svg.decode();
					ctx.clearRect(0, 0, 596, 842);
					ctx.drawImage(svg, 0, 0, 595.28, 841.89);
					URL.revokeObjectURL(svg.src);
					const thumbnail = { hole: pixel(250, 160), left: pixel(150, 160) };
					const blob = await exportNotesPagePng(page),
						png = new Image();
					png.src = URL.createObjectURL(blob);
					await png.decode();
					ctx.clearRect(0, 0, 596, 842);
					ctx.drawImage(png, 0, 0, 595.28, 841.89);
					URL.revokeObjectURL(png.src);
					return {
						direct,
						thumbnail,
						png: { hole: pixel(250, 160), left: pixel(150, 160) },
					};
				});
				assert.deepEqual(report.direct.hole, [217, 243, 229, 255]);
				assert.deepEqual(report.direct.left, [37, 99, 235, 255]);
				assert.deepEqual(report.direct.image, [238, 119, 34, 255]);
				for (const output of [report.thumbnail, report.png]) {
					assert.deepEqual(output.hole, report.direct.hole);
					assert.deepEqual(output.left, report.direct.left);
				}
				await p.evaluate(() => window.notebook.value.undo());
				assert.deepEqual(await elements(), after, "one gesture is one undo step");
				await p.evaluate(() => window.notebook.value.redo());
				const erased = await elements();
				await p.evaluate(async () => {
					window.noteSource.value = await window.notebook.value.saveFile();
				});
				await p.waitForTimeout(100);
				assert.deepEqual(await elements(), erased);
				await p.evaluate(() => window.notebook.value.undo());
				assert.deepEqual(await elements(), after, "undo survives native save/reopen");
				await p.evaluate(() => window.notebook.value.redo());
				// No-op in an already erased straight corridor does not create an undo frame.
				await erase(250, 130, 250, 190);
				assert.deepEqual(await elements(), erased);
				// Pen-body double tap returns to the remembered pixel eraser mode.
				await p.evaluate(() =>
					window.dispatchEvent(new CustomEvent("cubeoffice:pencil-double-tap")),
				);
				await p.evaluate(() =>
					window.dispatchEvent(new CustomEvent("cubeoffice:pencil-double-tap")),
				);
				assert.equal(
					await p
						.locator(
							'[data-tool="eraser"][aria-label="轨迹橡皮擦"][aria-pressed="true"]',
						)
						.count(),
					1,
				);
				// Cancellation and tip hold discard tentative partial erasure.
				await p.evaluate(
					async ({ x, y }) => {
						const c = document.querySelector(".cube-notes__ink-canvas");
						c.setPointerCapture = () => {};
						c.releasePointerCapture = () => {};
						c.hasPointerCapture = () => false;
						for (const type of ["pointerdown", "pointermove", "pointercancel"])
							c.dispatchEvent(
								new PointerEvent(type, {
									bubbles: true,
									cancelable: true,
									pointerId: 71,
									pointerType: "pen",
									clientX: x,
									clientY: y,
									buttons: 1,
									pressure: 0.4,
								}),
							);
					},
					await screen(150, 160),
				);
				assert.deepEqual(await elements(), erased);
				await p.evaluate(
					({ x, y }) =>
						document.querySelector(".cube-notes__ink-canvas").dispatchEvent(
							new PointerEvent("pointerdown", {
								bubbles: true,
								cancelable: true,
								pointerId: 71,
								pointerType: "pen",
								clientX: x,
								clientY: y,
								buttons: 1,
								pressure: 0.4,
							}),
						),
					await screen(150, 160),
				);
				await p.locator(".cube-notes__pencil-menu").waitFor();
				assert.deepEqual(await elements(), erased);
				await p.evaluate(() =>
					document.querySelector(".cube-notes__ink-canvas").dispatchEvent(
						new PointerEvent("pointerup", {
							bubbles: true,
							pointerId: 71,
							pointerType: "pen",
						}),
					),
				);
				await p.keyboard.press("Escape");
				await p.screenshot({
					path: `.cache/notes-qa/eraser-result-${engine.name()}-${width}.png`,
				});
				await p.locator('[data-tool="eraser"]').click();
				await p.getByRole("button", { name: "整笔擦除", exact: true }).click();
				await p.keyboard.press("Escape");
				await erase(150, 155, 150, 165);
				assert.equal((await elements()).length, 4, "object eraser remains available");
				await p.evaluate(() => window.notebook.value.undo());
				assert.deepEqual(await elements(), erased);
				// Eraser follows document coordinates after a 90-degree turn and zoom.
				await p.locator('[data-tool="eraser"]').click();
				await p.getByRole("button", { name: "轨迹擦除", exact: true }).click();
				await p.keyboard.press("Escape");
				await p.evaluate(() => window.notebook.value.showViewOptions());
				await p
					.locator(".cube-notes__popover")
					.getByLabel("缩放", { exact: true })
					.selectOption("150");
				await p.getByRole("button", { name: "向右旋转 90°", exact: true }).click();
				await p.evaluate(() => {
					const c = document.querySelector(".cube-notes__ink-canvas"),
						v = document.querySelector(".cube-notes__viewport");
					const b = c.getBoundingClientRect(),
						r = v.getBoundingClientRect(),
						z = b.width / 841.89;
					v.scrollLeft += b.left + (841.89 - 160) * z - r.left - r.width / 2;
					v.scrollTop += b.top + 150 * z - r.top - r.height / 2;
				});
				const rotated = async (y) =>
					p.evaluate((y) => {
						const b = document
								.querySelector(".cube-notes__ink-canvas")
								.getBoundingClientRect(),
							z = b.width / 841.89;
						return { x: b.left + (841.89 - y) * z, y: b.top + 150 * z };
					}, y);
				const ra = await rotated(145),
					rb = await rotated(175);
				await p.mouse.move(ra.x, ra.y);
				await p.mouse.down();
				await p.mouse.move(rb.x, rb.y, { steps: 5 });
				await p.mouse.up();
				assert.equal(
					await p.evaluate(async () => {
						const { hitStroke } = await import("/packages/notes/src/geometry.ts");
						return hitStroke(
							window.notebook.value.getNotebook().pages[0].layers[0].elements[0],
							{ x: 150, y: 160 },
							1,
						);
					}),
					false,
				);
				await p.evaluate(() => window.notebook.value.undo());
				assert.deepEqual(await elements(), erased);
				await p.evaluate(() => (window.noteReadonly.value = true));
				await p.mouse.move(ra.x, ra.y);
				await p.mouse.down();
				await p.mouse.move(rb.x, rb.y, { steps: 5 });
				await p.mouse.up();
				assert.deepEqual(await elements(), erased);
				assert.deepEqual(errors, []);
				await p.close();
				console.log(
					`PASS ${engine.name()} ${width}: modes, partial masking, brush identity, photos, overlapping masks, PNG/SVG, history/reopen, no-op, Pencil/cancel/read-only`,
				);
			}
		} finally {
			await browser.close();
		}
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
