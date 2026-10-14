const assert = require("node:assert/strict"),
	{ chromium } = require("playwright");
(async () => {
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	try {
		for (const [width, height] of [
			[1133, 744],
			[390, 844],
		]) {
			const p = await browser.newPage({ viewport: { width, height }, hasTouch: true });
			const errors = [];
			p.on("pageerror", (e) => errors.push(e.message));
			await p.goto(
				"http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1&infinite=1",
			);
			const canvas = p.locator(".cube-notes__ink-canvas"),
				viewport = p.locator(".cube-notes__viewport");
			await canvas.waitFor();
			await p.waitForFunction(
				() => window.notebook.value?.getNotebook().pages[0].infinite === true,
			);
			await p.waitForTimeout(100);
			const frame = await canvas.boundingBox(),
				view = await viewport.boundingBox();
			assert.ok(
				Math.abs(frame.width - view.width) < 1 && Math.abs(frame.height - view.height) < 1,
				"grid canvas fills the body",
			);
			const domDims = () =>
				p.evaluate(() => {
					const c = document.querySelector(".cube-notes__paper-canvas");
					return [c.width, c.height];
				});
			const allocation = await domDims();
			const document = () => p.evaluate(() => window.notebook.value.getNotebook());
			const count = () =>
				p.evaluate(
					() => window.notebook.value.getNotebook().pages[0].layers[0].elements.length,
				);
			const wheel = async (dx, dy) => {
				await p.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
				await p.mouse.wheel(dx, dy);
				await p.waitForTimeout(60);
			};
			const draw = async () => {
				const b = await canvas.boundingBox();
				await p.mouse.move(b.x + 50, b.y + 70);
				await p.mouse.down();
				await p.mouse.move(b.x + 150, b.y + 85, { steps: 12 });
				await p.mouse.up();
				await p.waitForTimeout(50);
			};
			await p.locator("[data-pen-style=fountain]").click();
			await p.getByRole("slider", { name: "笔迹粗细", exact: true }).fill("12");
			await p.getByRole("button", { name: "完成", exact: true }).click();
			await draw();
			await wheel(6000, 7000);
			await draw();
			await wheel(-15000, -18000);
			await draw();
			const strokes = (await document()).pages[0].layers[0].elements;
			assert.equal(strokes.length, 3);
			assert.ok(strokes[1].points[0].x > 5000 && strokes[1].points[0].y > 6000);
			assert.ok(strokes[2].points[0].x < -5000 && strokes[2].points[0].y < -9000);
			assert.deepEqual(
				await domDims(),
				allocation,
				"world travel does not allocate a giant bitmap",
			);
			// Two moving fingers pan and zoom; one remaining finger must only pan.
			const cdp = await p.context().newCDPSession(p);
			const x = frame.x + frame.width / 2,
				y = frame.y + 150;
			const send = (type, touchPoints) =>
				cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
			const zoom = async () => {
				await p.evaluate(() => window.notebook.value.showViewOptions());
				await p.waitForTimeout(100);
				const value = Number(
					await p.getByRole("combobox", { name: "缩放", exact: true }).inputValue(),
				);
				await p.getByRole("button", { name: "完成", exact: true }).click();
				return value;
			};
			const before = await zoom();
			await send("touchStart", [
				{ x: x - 35, y, id: 1 },
				{ x: x + 35, y, id: 2 },
			]);
			for (let i = 1; i <= 6; i++) {
				await send("touchMove", [
					{ x: x - 35 - i * 2 + 10, y: y + 10, id: 1 },
					{ x: x + 35 + i * 2 + 10, y: y + 10, id: 2 },
				]);
				await p.waitForTimeout(20);
			}
			await send("touchEnd", []);

			assert.ok((await zoom()) / before > 1.3, "continuous pinch updates world scale");
			assert.equal(await count(), 3, "navigation does not add paint");
			assert.ok((await domDims())[0] <= 4096);
			await p.evaluate(() => window.notebook.value.undo());
			assert.equal(await count(), 2);
			await p.evaluate(() => window.notebook.value.redo());
			assert.equal(await count(), 3);
			const blob = await p.evaluate(async () => {
				const png = await window.notebook.value.exportFile("png"),
					pdf = await window.notebook.value.exportFile("pdf");
				const bm = await createImageBitmap(png);
				const c = document.createElement("canvas");
				c.width = bm.width;
				c.height = bm.height;
				const ctx = c.getContext("2d");
				ctx.drawImage(bm, 0, 0);
				const data = ctx.getImageData(0, 0, c.width, c.height).data;
				let blue = 0;
				for (let i = 0; i < data.length; i += 4)
					if (data[i] < 80 && data[i + 1] < 100 && data[i + 2] < 130) blue++;
				return { png: png.size, pdf: pdf.size, width: bm.width, height: bm.height, blue };
			});
			assert.ok(
				blob.png > 1000 && blob.pdf > 1000 && blob.blue > 0,
				"complete board exports paint outside the old page",
			);
			assert.ok(blob.width <= 2401 && blob.height <= 2401);
			await p.evaluate(() => window.notebook.value.showViewOptions());
			await p.getByRole("button", { name: "保存区域", exact: true }).click();
			await p.getByRole("textbox", { name: "区域名称", exact: true }).fill("远处画板");
			await p
				.locator(".cube-notes__dialog")
				.getByRole("button", { name: "保存", exact: true })
				.click();
			const scene = (await document()).pages[0].scenes[0];
			assert.ok(scene.x < 0 && scene.y < 0, "saved view accepts negative world coordinates");
			await p.locator(".cube-notes__scene-link").filter({ hasText: "远处画板" }).click();
			await p.getByRole("button", { name: "更多工具", exact: true }).click();
			await p.getByRole("button", { name: "美纹纸", exact: true }).click();
			const initial = (await document()).pages[0].tapes[0];
			assert.ok(initial.x < 0 && initial.y < 0, "tape is placed in the current distant view");
			const tape = await p.locator(".cube-notes__tape-grab").boundingBox();
			await p.mouse.move(tape.x + tape.width / 2, tape.y + tape.height / 2);
			await p.mouse.down();
			await p.mouse.move(tape.x + tape.width / 2 + 30, tape.y + tape.height / 2 + 25, {
				steps: 8,
			});
			await p.mouse.up();
			const moved = (await document()).pages[0].tapes[0];
			assert.ok(
				moved.x > initial.x && moved.y > initial.y && moved.x < 0 && moved.y < 0,
				"negative-world tape dragging has no old paper clamps",
			);
			await p.getByRole("button", { name: "开始绘画", exact: true }).click();
			// Show all gives a recoverable overview after traveling away from the origin.
			if (width > 760) {
				await p.evaluate(() => window.notebook.value.showViewOptions());
				await p.getByRole("button", { name: "查看全部", exact: true }).click();
				await p.waitForTimeout(100);
				assert.ok((await zoom()) < 10, "overview fits far-away content");
			}
			await p.screenshot({ path: `.cache/notes-qa/infinite-${width}.png` });
			assert.deepEqual(errors, []);
			await p.close();
		}
		const maskPage = await browser.newPage();
		await maskPage.goto("http://127.0.0.1:5178/packages/notes/tests/viewer.html");
		const gap = await maskPage.evaluate(async () => {
			const { createNotebook } = await import("/packages/notes/src/model.ts");
			const { pageContentBounds } = await import("/packages/notes/src/board.ts");
			const { exportNotesPagePng } = await import("/packages/notes/src/image.ts");
			const page = createNotebook("Mask", true).pages[0];
			page.paper = "plain";
			page.layers[0].elements.push({
				id: "outside-mask",
				kind: "stroke",
				tool: "highlighter",
				color: "#ff0000",
				width: 20,
				opacity: 1,
				pressure: false,
				points: [
					{ x: -20000, y: -30000, pressure: 0.5 },
					{ x: -19900, y: -30000, pressure: 0.5 },
				],
				cutouts: [
					[
						{ x: -19960, y: -30030 },
						{ x: -19940, y: -30030 },
						{ x: -19940, y: -29970 },
						{ x: -19960, y: -29970 },
					],
				],
			});
			const area = pageContentBounds(page),
				bitmap = await createImageBitmap(await exportNotesPagePng(page)),
				c = document.createElement("canvas");
			c.width = bitmap.width;
			c.height = bitmap.height;
			const ctx = c.getContext("2d");
			ctx.drawImage(bitmap, 0, 0);
			const scale = c.width / area.width;
			const sample = (x) => [
				...ctx.getImageData(
					Math.floor((x - area.x) * scale),
					Math.floor((-30000 - area.y) * scale),
					1,
					1,
				).data,
			];
			return [sample(-19950), sample(-19980)];
		});
		assert.deepEqual(
			gap[0],
			[255, 253, 247, 255],
			"tape masks remain white beyond original coordinate bounds",
		);
		assert.deepEqual(gap[1], [255, 0, 0, 255]);
		await maskPage.close();
		console.log(
			"PASS: full body infinite grid; drawing in all world directions; bounded bitmap; touch pinch; undo/redo; full-content PNG/PDF; overview",
		);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
