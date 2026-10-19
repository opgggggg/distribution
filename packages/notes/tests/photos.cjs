const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium, webkit } = require("playwright");
(async () => {
	for (const engine of [chromium, webkit]) {
		const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
		try {
			for (const [width, height] of [
				[744, 1133],
				[375, 812],
			]) {
				const p = await browser.newPage({ viewport: { width, height }, hasTouch: true });
				const errors = [];
				p.on("pageerror", (e) => errors.push(e.message));
				await p.addInitScript(() =>
					localStorage.setItem("cubeoffice.privacy.consent", "2026-09-07"),
				);
				await p.goto("http://127.0.0.1:5179/?platform=ios");
				await p.getByRole("button", { name: "新建", exact: true }).click();
				await p.locator(".android-sheet button").filter({ hasText: "手写笔记" }).click();
				await p.locator(".cube-notes__ink-canvas").waitFor();
				const api = (fn) =>
					p.locator(".cube-notes").evaluate((e, fn) => {
						const api = e.__vueParentComponent.exposed;
						return api[fn]();
					}, fn);
				const doc = () => api("getNotebook");
				const pixels = await p.evaluate(() => {
					const c = document.createElement("canvas");
					c.width = 600;
					c.height = 400;
					const x = c.getContext("2d");
					x.fillStyle = "#f03c3c";
					x.fillRect(0, 0, 600, 400);
					x.fillStyle = "#1545e3";
					x.fillRect(200, 100, 200, 200);
					return c.toDataURL("image/png").split(",")[1];
				});
				const file = {
					name: "learning.png",
					mimeType: "image/png",
					buffer: Buffer.from(pixels, "base64"),
				};
				async function menu() {
					await p.getByRole("button", { name: "更多工具", exact: true }).click();

					await p
						.getByRole("dialog")
						.getByRole("button", { name: "插入图片", exact: true })
						.click();
				}
				async function pick(camera = false) {
					await menu();
					const chooser = p.waitForEvent("filechooser");
					await p
						.getByRole("button", { name: camera ? "拍照" : "选择图片", exact: true })
						.click();
					await (await chooser).setFiles(file);
					await p.getByRole("img", { name: "待插入图片预览" }).waitFor();
				}
				await pick();
				assert.equal(
					await p.locator("input[data-note-photo=camera]").getAttribute("capture"),
					"environment",
				);
				await p
					.locator("dialog[open]")
					.getByRole("button", { name: "插入图片", exact: true })
					.click();
				let book = await doc(),
					photo = book.pages[0].layers[0].elements[0];
				assert.equal(photo.kind, "image");
				assert.equal(photo.opacity, 1);
				assert.ok(photo.src.startsWith("data:image/png;base64,"));
				await p.waitForTimeout(120);
				const handle = p.getByRole("button", { name: "缩放选中内容 se", exact: true });
				await handle.waitFor();
				let r = await handle.boundingBox();
				await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
				await p.mouse.down();
				await p.mouse.move(r.x - 40, r.y - 10, { steps: 6 });
				await p.mouse.up();
				let resized = (await doc()).pages[0].layers[0].elements[0];
				assert.ok(resized.width !== photo.width);
				assert.ok(
					Math.abs(resized.width / resized.height - 1.5) < 0.01,
					"photo resize preserves its aspect",
				);
				const center = await p.locator(".cube-notes__ink-canvas").evaluate((e) => {
					const vm = e.__vueParentComponent,
						area = vm.exposed.viewBounds(),
						image = vm.props.page.layers[0].elements.find((e) => e.kind === "image"),
						r = e.getBoundingClientRect();
					return {
						x: r.left + (image.x + image.width / 2 - area.x) * vm.props.zoom,
						y: r.top + (image.y + image.height / 2 - area.y) * vm.props.zoom,
					};
				});
				await p.mouse.move(center.x, center.y);
				await p.mouse.down();
				await p.mouse.move(center.x + 30, center.y + 25, { steps: 6 });
				await p.mouse.up();
				const moved = (await doc()).pages[0].layers[0].elements[0];
				assert.ok(Math.abs(moved.x - resized.x) > 1, "photo moves with lasso");
				await pick(true);
				await p.getByRole("button", { name: "背景图片", exact: true }).click();
				assert.equal(
					await p
						.getByRole("button", { name: "背景图片", exact: true })
						.getAttribute("aria-pressed"),
					"true",
				);
				await p.evaluate(() => new Promise(requestAnimationFrame));
				// Let the mode button's 150 ms color transition settle for visual QA.
				await p.waitForTimeout(180);
				await p.screenshot({
					path: `.cache/notes-qa/photo-dialog-${engine.name()}-${width}.png`,
				});
				await p
					.locator("dialog[open]")
					.getByRole("button", { name: "插入图片", exact: true })
					.click();
				book = await doc();
				assert.equal(book.pages[0].background.opacity, 0.35);
				assert.equal(book.pages[0].layers[0].elements.length, 1);
				await api("undo");
				assert.equal((await doc()).pages[0].background, undefined);
				await p.locator(".cube-notes__tool-tray").waitFor();
				await api("redo");
				await p.getByRole("button", { name: "更多工具", exact: true }).click();
				await p.getByRole("button", { name: "调整背景", exact: true }).click();
				await p
					.getByRole("navigation", { name: "调整背景", exact: true })
					.getByRole("button", { name: "完成", exact: true })
					.click();
				await menu();
				await p.getByRole("slider", { name: "背景透明度", exact: true }).fill("60");
				await p.getByRole("button", { name: "关闭", exact: true }).click();
				assert.equal((await doc()).pages[0].background.opacity, 0.6);
				// Background is outside lasso/eraser content; hand drawing still works after native input returns.
				await p.locator("[data-pen-style=ballpoint]").click();
				const ink = p.locator(".cube-notes__ink-canvas"),
					box = await ink.boundingBox();
				await p.mouse.move(box.x + 30, box.y + 30);
				await p.mouse.down();
				await p.mouse.move(box.x + 100, box.y + 45, { steps: 6 });
				await p.mouse.up();
				assert.equal((await doc()).pages[0].layers[0].elements.length, 2);
				await p.screenshot({
					path: `.cache/notes-qa/photo-board-${engine.name()}-${width}.png`,
				});
				const exports = await p.locator(".cube-notes").evaluate(async (e) => {
					const api = e.__vueParentComponent.exposed;
					return {
						native: Array.from(
							new Uint8Array(await (await api.exportFile("cubenote")).arrayBuffer()),
						),
						png: Array.from(
							new Uint8Array(await (await api.exportFile("png")).arrayBuffer()),
						),
						pdf: Array.from(
							new Uint8Array(await (await api.exportFile("pdf")).arrayBuffer()),
						),
					};
				});
				assert.deepEqual(exports.png.slice(0, 4), [137, 80, 78, 71]);
				assert.equal(Buffer.from(exports.pdf.slice(0, 4)).toString(), "%PDF");
				const { readNotebookState } = await import("../dist/index.js");
				const restored = readNotebookState(new Uint8Array(exports.native));
				assert.equal(restored.document.pages[0].background.opacity, 0.6);
				assert.equal(restored.document.pages[0].layers[0].elements[0].kind, "image");
				assert.ok(restored.history.past.length >= 4);
				await fs.writeFile(
					`.cache/notes-qa/photo-export-${engine.name()}-${width}.png`,
					Buffer.from(exports.png),
				);
				const colors = await p.evaluate(async (bytes) => {
					const c = document.createElement("canvas");
					const i = new Image();
					i.src = URL.createObjectURL(
						new Blob([new Uint8Array(bytes)], { type: "image/png" }),
					);
					await i.decode();
					c.width = i.width;
					c.height = i.height;
					const x = c.getContext("2d");
					x.drawImage(i, 0, 0);
					const d = x.getImageData(0, 0, c.width, c.height).data;
					let red = 0,
						blue = 0;
					for (let j = 0; j < d.length; j += 4) {
						if (d[j] > d[j + 1] * 1.5 && d[j] > d[j + 2] * 1.3) red++;
						if (d[j + 2] > d[j] * 1.3 && d[j + 2] > d[j + 1] * 1.3) blue++;
					}
					return { red, blue };
				}, exports.png);
				assert.ok(colors.red > 1000 && colors.blue > 1000, JSON.stringify(colors));
				await menu();
				const cancelledChooser = p.waitForEvent("filechooser");
				await p.getByRole("button", { name: "拍照", exact: true }).click();
				await (await cancelledChooser).setFiles([]);
				assert.equal(
					await p.getByRole("dialog").count(),
					0,
					"cancelling camera leaves no modal blocking the canvas",
				);
				await menu();
				await p.getByRole("button", { name: "移除背景图片", exact: true }).click();
				assert.equal((await doc()).pages[0].background, undefined);
				await p.getByRole("button", { name: "关闭", exact: true }).click();
				await p.getByRole("button", { name: "撤销", exact: true }).click();
				assert.equal((await doc()).pages[0].background.opacity, 0.6);
				assert.deepEqual(errors, []);
				await p.close();
				console.log(
					`PASS ${engine.name()} ${width}: photo/content/background, resize, opacity, continued drawing, native/history and PNG/PDF export`,
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
