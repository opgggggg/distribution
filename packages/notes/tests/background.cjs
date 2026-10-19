const assert = require("node:assert/strict"),
	{ chromium, webkit } = require("playwright");
(async () => {
	for (const engine of [chromium, webkit]) {
		const browser = await engine.launch({
			headless: true,
			...(engine === chromium ? { channel: "chrome" } : {}),
		});
		try {
			for (const [width, height, dark] of [
				[744, 1133, false],
				[375, 812, false],
				[844, 390, true],
			]) {
				const p = await browser.newPage({
					viewport: { width, height },
					hasTouch: true,
					colorScheme: dark ? "dark" : "light",
					reducedMotion: "reduce",
				});
				const errors = [];
				p.on("pageerror", (e) => errors.push(e.message));
				await p.goto(
					"http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1&infinite=1",
				);
				const ink = p.locator(".cube-notes__ink-canvas");
				await ink.waitFor();
				await p.waitForFunction(() => window.notebook.value?.getNotebook());
				const book = () => p.evaluate(() => window.notebook.value.getNotebook());
				await p.evaluate(async () => {
					const { createNotebook } = await import("/packages/notes/src/model.ts"),
						{ writeNotebook } = await import("/packages/notes/src/codec.ts");
					const book = createNotebook("Background QA", true),
						page = book.pages[0];
					page.paper = "grid";
					const c = document.createElement("canvas");
					c.width = 200;
					c.height = 100;
					const ctx = c.getContext("2d");
					ctx.fillStyle = "#dd2200";
					ctx.fillRect(0, 0, 100, 100);
					ctx.fillStyle = "#2255ee";
					ctx.fillRect(100, 0, 100, 100);
					page.background = {
						id: "background",
						kind: "image",
						src: c.toDataURL(),
						x: 100,
						y: 200,
						width: 400,
						height: 200,
						opacity: 0.15,
					};
					page.layers[0].elements = [
						{
							id: "ink",
							kind: "stroke",
							tool: "pen",
							width: 40,
							color: "#000000",
							opacity: 1,
							pressure: false,
							points: [
								{ x: 150, y: 250, pressure: 0.5 },
								{ x: 200, y: 250, pressure: 0.5 },
							],
						},
					];
					window.noteSource.value = writeNotebook(book);
				});
				await p.waitForFunction(() => {
					try {
						return window.notebook.value.getNotebook().title === "Background QA";
					} catch {
						return false;
					}
				});
				async function open() {
					await p.getByRole("button", { name: "更多工具", exact: true }).click();
					await p.getByRole("button", { name: "调整背景", exact: true }).click();
					await p.waitForTimeout(100);
				}
				const panel = p.getByRole("navigation", { name: "调整背景", exact: true });
				await open();
				assert.equal(
					await p.locator(".cube-notes__tool-tray").count(),
					0,
					"drawing tray stays out of adjustment mode",
				);
				const panelBox = await panel.boundingBox();
				assert.ok(
					panelBox.x >= 0 &&
						panelBox.x + panelBox.width <= width + 1 &&
						panelBox.y >= 0 &&
						panelBox.y + panelBox.height <= height + 1,
					"controls fit small and landscape screens",
				);
				const before = (await book()).pages[0].background;
				const box = await p
					.getByRole("button", { name: "移动背景图", exact: true })
					.boundingBox();
				const a = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
				await p.mouse.move(a.x, a.y);
				await p.mouse.down();
				await p.mouse.move(a.x + 20, a.y + 10, { steps: 8 });
				await p.mouse.up();
				const moved = (await book()).pages[0].background;
				assert.ok(
					moved.x > before.x && moved.y > before.y,
					"drag moves only the background",
				);
				assert.equal((await book()).pages[0].layers[0].elements[0].points[0].x, 150);
				await panel.getByRole("button", { name: "撤销", exact: true }).click();
				assert.deepEqual(
					(await book()).pages[0].background,
					before,
					"one drag is one undo step",
				);
				await panel.getByRole("button", { name: "重做", exact: true }).click();
				assert.deepEqual((await book()).pages[0].background, moved);
				await panel.getByRole("button", { name: "放大背景图", exact: true }).click();
				let photo = (await book()).pages[0].background;
				assert.ok(photo.width > moved.width);
				assert.equal(photo.width / photo.height, 2);
				await panel.getByRole("button", { name: "背景图旋转 90°", exact: true }).click();
				assert.equal((await book()).pages[0].background.angle, 90);
				await panel.getByRole("button", { name: "背景图设置", exact: true }).click();
				await panel.getByRole("slider", { name: "背景旋转角度", exact: true }).fill("37");
				assert.equal((await book()).pages[0].background.angle, 37);
				await panel.getByRole("button", { name: "显示完整背景", exact: true }).click();
				await p.waitForTimeout(80);
				await p.screenshot({
					path: `.cache/notes-qa/background-adjust-${engine.name()}-${width}.png`,
				});
				await panel.getByRole("button", { name: "背景图设置", exact: true }).click();
				await panel.getByRole("button", { name: "取色", exact: true }).click();
				await p.getByRole("button", { name: "使用此颜色", exact: true }).waitFor();
				assert.equal(
					await p.getByRole("button", { name: "使用此颜色", exact: true }).isEnabled(),
					false,
				);
				const point = await ink.evaluate((e) => {
					const vm = e.__vueParentComponent,
						photo = vm.props.page.background,
						area = vm.exposed.viewBounds(),
						z = vm.props.zoom,
						r = e.getBoundingClientRect(),
						angle = (photo.angle * Math.PI) / 180;
					const dx = -photo.width * 0.25,
						dy = 0,
						x = photo.x + photo.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle),
						y =
							photo.y +
							photo.height / 2 +
							dx * Math.sin(angle) +
							dy * Math.cos(angle);
					return { x: r.left + (x - area.x) * z, y: r.top + (y - area.y) * z };
				});
				await p.mouse.click(point.x, point.y);
				assert.equal(
					await p.locator(".cube-notes__background-sample-bar output").textContent(),
					"#DD2200",
					"samples source color without ink/grid/opacity contamination",
				);
				await p.screenshot({
					path: `.cache/notes-qa/background-pick-${engine.name()}-${width}.png`,
				});
				await p.getByRole("button", { name: "使用此颜色", exact: true }).click();
				assert.equal(await p.locator(".cube-notes__color-sampling").count(), 0);
				assert.equal(
					await p.locator(".cube-notes__background-overlay").count(),
					0,
					"background is locked while drawing",
				);
				const count = (await book()).pages[0].layers[0].elements.length;
				const v = await ink.boundingBox();
				await p.mouse.move(v.x + v.width*.4, v.y + 130);
				await p.mouse.down();
				await p.mouse.move(v.x + v.width*.4+50, v.y + 150, { steps: 6 });
				await p.mouse.up();
				const elements = (await book()).pages[0].layers[0].elements;
				assert.equal(elements.length, count + 1, "drawing resumes after picking");
				assert.equal(elements.at(-1).color, "#dd2200");
				const saved = await p.evaluate(async () => {
					const blob = await window.notebook.value.saveFile(),
						{ readNotebookState } = await import("/packages/notes/src/codec.ts");
					return readNotebookState(new Uint8Array(await blob.arrayBuffer())).document;
				});
				assert.equal(saved.pages[0].background.angle, 37);
				assert.deepEqual(errors, []);
				console.log(
					`PASS ${engine.name()} ${width}: background adjustment, 1-gesture undo, scale/rotation, original color picking, drawing and save`,
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
