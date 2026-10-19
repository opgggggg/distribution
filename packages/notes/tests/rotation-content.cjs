const assert = require("node:assert/strict"),
	{ chromium, webkit } = require("playwright");
(async () => {
	for (const engine of [chromium, webkit]) {
		const browser = await engine.launch({
			headless: true,
			...(engine === chromium ? { channel: "chrome" } : {}),
		});
		try {
			const p = await browser.newPage({ viewport: { width: 744, height: 1133 } });
			const errors = [];
			p.on("pageerror", (e) => errors.push(e.message));
			await p.goto(
				"http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1&infinite=1",
			);
			const ink = p.locator(".cube-notes__ink-canvas");
			await ink.waitFor();
			await p.waitForFunction(() => window.notebook.value?.getNotebook());
			const doc = () => p.evaluate(() => window.notebook.value.getNotebook());
			await p.evaluate(async () => {
				const { createNotebook } = await import("/packages/notes/src/model.ts"),
					{ writeNotebook } = await import("/packages/notes/src/codec.ts");
				const book = createNotebook("rotation photo", true),
					page = book.pages[0];
				page.paper = "plain";
				const v = document.querySelector(".cube-notes__viewport");
				const x = v.clientWidth / 2,
					y = v.clientHeight / 2;
				const src = (color) => {
					const c = document.createElement("canvas");
					c.width = c.height = 20;
					const ctx = c.getContext("2d");
					ctx.fillStyle = color;
					ctx.fillRect(0, 0, 20, 20);
					return c.toDataURL();
				};
				page.background = {
					id: "background",
					kind: "image",
					src: src("#00dd00"),
					x: x - 150,
					y: y - 100,
					width: 300,
					height: 200,
					opacity: 1,
				};
				page.layers[0].elements = [
					{
						id: "photo",
						kind: "image",
						src: src("#ee0000"),
						x: x - 60,
						y: y - 40,
						width: 120,
						height: 80,
						opacity: 1,
					},
				];
				page.tapes = [{ id: "tape", x: x + 110, y: y, width: 150, height: 24, angle: 0 }];
				window.noteSource.value = writeNotebook(book);
			});
			await p.waitForFunction(() => {
				try {
					return window.notebook.value.getNotebook().title === "rotation photo";
				} catch {
					return false;
				}
			});
			await p.getByRole("button", { name: "更多工具", exact: true }).click();
			await p.getByRole("button", { name: "旋转画布 90°", exact: true }).click();
			await p.waitForTimeout(150);
			async function project(point) {
				return ink.evaluate((e, p) => {
					const vm = e.__vueParentComponent,
						r = e.getBoundingClientRect(),
						a = vm.exposed.viewBounds(),
						z = vm.props.zoom;
					const x = (p.x - a.x) * z,
						y = (p.y - a.y) * z;
					return { x: r.right - y, y: r.top + x };
				}, point);
			}
			let photo = (await doc()).pages[0].layers[0].elements[0];
			const center = await project({
				x: photo.x + photo.width / 2,
				y: photo.y + photo.height / 2,
			});
			assert.equal(
				await ink.evaluate(
					(e, p) => e.__vueParentComponent.exposed.sampleColor(p.x, p.y),
					center,
				),
				"#ee0000",
				"eyedropper samples rotated photo",
			);
			const green = await project({ x: photo.x - 40, y: photo.y + 40 });
			assert.equal(
				await ink.evaluate(
					(e, p) => e.__vueParentComponent.exposed.sampleColor(p.x, p.y),
					green,
				),
				"#00dd00",
				"fixed background rotates below photo",
			);
			await p.locator('[data-tool="lasso"]').click();
			await p.mouse.click(center.x, center.y);
			assert.deepEqual(await ink.evaluate((e) => e.__vueParentComponent.props.selected), [
				"photo",
			]);
			await p.mouse.move(center.x, center.y);
			await p.mouse.down();
			await p.mouse.move(center.x + 30, center.y + 20, { steps: 5 });
			await p.mouse.up();
			const moved = (await doc()).pages[0].layers[0].elements[0];
			const zoom = await ink.evaluate((e) => e.__vueParentComponent.props.zoom);
			assert.ok(
				Math.abs(moved.x - photo.x - 20 / zoom) < 1 &&
					Math.abs(moved.y - photo.y + 30 / zoom) < 1,
				`photo drag follows rotated finger direction: ${JSON.stringify({ photo, moved })}`,
			);
			const h = await p.locator('[data-resize="se"]').boundingBox();
			await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
			await p.mouse.down();
			await p.mouse.move(h.x + h.width / 2 - 25, h.y + h.height / 2 + 40, { steps: 5 });
			await p.mouse.up();
			const resized = (await doc()).pages[0].layers[0].elements[0];
			assert.ok(
				resized.width > moved.width && resized.height > moved.height,
				"rotated corner resizes photo",
			);
			assert.ok(
				Math.abs(resized.width / resized.height - 1.5) < 0.01,
				"photo retains aspect ratio",
			);
			assert.deepEqual(
				(await doc()).pages[0].background,
				(
					await p.evaluate(async () => {
						const { readNotebook } = await import("/packages/notes/src/codec.ts");
						return readNotebook(
							new Uint8Array(await window.noteSource.value.arrayBuffer()),
						);
					})
				).pages[0].background,
				"photo manipulation leaves background fixed",
			);
			// Open the existing tape editor, then drag the tape in the rotated coordinate space.
			await p.getByRole("button", { name: "更多工具", exact: true }).click();
			await p.getByRole("button", { name: "美纹纸", exact: true }).click();
			const tape = (await doc()).pages[0].tapes[0],
				t = await project(tape);
			await p.mouse.move(t.x, t.y);
			await p.mouse.down();
			await p.mouse.move(t.x + 20, t.y + 15, { steps: 5 });
			await p.mouse.up();
			const nextTape = (await doc()).pages[0].tapes[0];
			await p.screenshot({ path: `.cache/notes-qa/rotation-content-${engine.name()}.png` });
			assert.ok(
				Math.abs(nextTape.x - tape.x - 15 / zoom) < 1 &&
					Math.abs(nextTape.y - tape.y + 20 / zoom) < 1,
				`tape drag follows rotated finger direction: ${JSON.stringify({ tape, nextTape, t, zoom })}`,
			);
			assert.deepEqual(errors, []);
			await p.screenshot({ path: `.cache/notes-qa/rotation-content-${engine.name()}.png` });
			console.log(
				`PASS ${engine.name()}: rotated photo/background, color sampling, lasso, aspect resize, tape move`,
			);
		} finally {
			await browser.close();
		}
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
