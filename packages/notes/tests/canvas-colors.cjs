const assert = require("node:assert/strict");
const { chromium, webkit } = require("playwright");
(async () => {
	for (const engine of [chromium, webkit]) {
		const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
		try {
			for (const [width, height, native] of [
				[744, 1133, true],
				[1133, 744, false],
				[375, 812, false],
			]) {
				const p = await browser.newPage({ viewport: { width, height }, hasTouch: true });
				p.setDefaultTimeout(10000);
				const errors = [];
				p.on("pageerror", (e) => errors.push(e.message));
				await p.goto(
					`http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1${native ? "&native-colors=1" : ""}`,
				);
				await p.locator(".cube-notes__ink-canvas").waitFor();
				await p.evaluate(async () => {
					const { createNotebook } = await import("/packages/notes/src/model.ts");
					const { writeNotebook } = await import("/packages/notes/src/codec.ts");
					const book = createNotebook("Canvas palette");
					const stroke = (id, color, opacity = 1) => ({
						id,
						kind: "stroke",
						color,
						opacity,
						width: 4,
						tool: "pen",
						pressure: false,
						points: [
							{ x: 100, y: 100, pressure: 0.5 },
							{ x: 200, y: 130, pressure: 0.5 },
						],
					});
					book.pages[0].layers[0].elements = [
						stroke("a", "#AB1234"),
						stroke("b", "#ab1234", 0.3),
						{
							id: "text",
							kind: "text",
							x: 150,
							y: 200,
							text: "Text",
							color: "#12ab34",
							size: 20,
						},
						...Array.from({ length: 12 }, (_, i) =>
							stroke(`more${i}`, `#22${(i * 10).toString(16).padStart(2, "0")}bb`),
						),
					];
					book.pages[0].layers.push({
						id: "hidden",
						name: "Hidden",
						visible: false,
						elements: [stroke("hiddenStroke", "#999999")],
					});
					const second = structuredClone(book.pages[0]);
					second.id = "second";
					second.layers = [
						{
							id: "secondLayer",
							name: "Layer",
							visible: true,
							elements: [stroke("secondColor", "#987654")],
						},
					];
					book.pages.push(second);
					window.noteSource.value = writeNotebook(book);
				});
				await p.waitForFunction(() => {
					try {
						return window.notebook.value.getNotebook().title === "Canvas palette";
					} catch {
						return false;
					}
				});
				const open = () => p.getByRole("button", { name: "更多颜色", exact: true }).click();
				const row = p.getByRole("group", { name: "画布颜色", exact: true });
				const close = () =>
					native
						? p.getByRole("button", { name: "完成", exact: true }).click()
						: p.getByRole("button", { name: "关闭选色板", exact: true }).click();
				await open();
				assert.equal(await row.getByRole("button").count(), 14);
				assert.equal(
					await row
						.getByRole("button", { name: "画布颜色 #ab1234", exact: true })
						.count(),
					1,
				);
				assert.equal(await row.getByRole("button", { name: /#999999/ }).count(), 0);
				const common = await p
						.getByRole("group", { name: "常用颜色", exact: true })
						.boundingBox(),
					bounds = await row.boundingBox();
				assert(
					bounds.y >= common.y + common.height,
					"canvas palette is below common colors",
				);
				const target = row.getByRole("button", { name: "画布颜色 #ab1234", exact: true });
				const hit = await target.boundingBox();
				assert(hit.width >= 44 && hit.height >= 44);
				assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
				await row.evaluate((e) => (e.scrollLeft = e.scrollWidth));
				await row.getByRole("button").last().click();
				assert.equal(
					await row.getByRole("button").last().getAttribute("aria-pressed"),
					"true",
				);
				await target.click();
				await p.screenshot({
					path: `.cache/notes-qa/canvas-colors-${engine.name()}-${width}.png`,
				});
				await close();
				// Choosing a palette color must leave the canvas drawable.
				const c = p.locator(".cube-notes__ink-canvas");
				await c.evaluate((e) => {
					e.setPointerCapture = () => {};
					e.hasPointerCapture = () => false;
					const r = e.getBoundingClientRect();
					for (const [type, dx] of [
						["pointerdown", 0],
						["pointermove", 30],
						["pointerup", 50],
					])
						e.dispatchEvent(
							new PointerEvent(type, {
								bubbles: true,
								cancelable: true,
								pointerId: 47,
								pointerType: "pen",
								buttons: type === "pointerup" ? 0 : 1,
								pressure: 0.5,
								clientX: r.x + 100 + dx,
								clientY: r.y + 230,
							}),
						);
				});
				await p.waitForFunction(
					() =>
						window.notebook.value.getNotebook().pages[0].layers[0].elements.length ===
						16,
				);
				assert.equal(
					await p.evaluate(
						() =>
							window.notebook.value.getNotebook().pages[0].layers[0].elements.at(-1)
								.color,
					),
					"#ab1234",
				);
				await p.evaluate(() => window.notebook.value.undo());
				await p.evaluate(() => window.notebook.value.redo());
				await open();
				assert.equal(await row.getByRole("button").count(), 14);
				await close();
				await p.getByRole("button", { name: "页面", exact: true }).click();
				await p.getByRole("button", { name: "第 2 页", exact: true }).click();
				await open();
				assert.equal(await row.getByRole("button").count(), 1);
				assert.equal(
					await row
						.getByRole("button", { name: "画布颜色 #987654", exact: true })
						.count(),
					1,
				);
				await close();
				await p.getByRole("button", { name: "页面", exact: true }).click();
				await p.getByRole("button", { name: "第 1 页", exact: true }).click();
				await open();
				assert.equal(await row.getByRole("button").count(), 14);
				await close();
				assert.deepEqual(errors, []);
				console.log(
					`${engine.name()} ${width} native=${native}: palette dedupe, source order, overflow, selection, drawing and history passed`,
				);
				await p.close();
			}
		} finally {
			await browser.close();
		}
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
