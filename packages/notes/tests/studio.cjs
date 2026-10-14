const assert = require("node:assert/strict");
const { chromium } = require("playwright");
(async () => {
	const { createNotebook, writeNotebook, readNotebookState } = await import("../dist/index.js");
	const book = createNotebook("画材试用");
	book.pages[0].paper = "plain";
	const bytes = [...new Uint8Array(await writeNotebook(book).arrayBuffer())];
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	try {
		const p = await browser.newPage({ viewport: { width: 744, height: 1133 }, hasTouch: true });
		const errors = [];
		p.on("pageerror", (e) => errors.push(e.message));
		await p.goto("http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1");
		await p.waitForFunction(() => !!window.noteSource);
		await p.evaluate(
			(bytes) => (window.noteSource.value = new Blob([new Uint8Array(bytes)])),
			bytes,
		);
		await p.locator(".cube-notes__ink-canvas").waitFor();
		await p.waitForFunction(() => {
			try {
				return window.notebook.value.getNotebook().title === "画材试用";
			} catch {
				return false;
			}
		});
		const input = await p.context().newCDPSession(p);
		async function drag(a, b, steps = 12) {
			await input.send("Input.dispatchTouchEvent", {
				type: "touchStart",
				touchPoints: [{ ...a, id: 1 }],
			});
			for (let i = 1; i <= steps; i++)
				await input.send("Input.dispatchTouchEvent", {
					type: "touchMove",
					touchPoints: [
						{
							x: a.x + ((b.x - a.x) * i) / steps,
							y: a.y + ((b.y - a.y) * i) / steps,
							id: 1,
						},
					],
				});
			await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		}
		for (const [index, style] of ["brush", "spray", "oil"].entries()) {
			const pen = p.locator(`[data-pen-style="${style}"]`);
			await pen.scrollIntoViewIfNeeded();
			await pen.tap();
			await pen.tap();
			await p
				.getByRole("slider", { name: "笔迹粗细", exact: true })
				.fill(style === "brush" ? "12" : "40");
			await p.getByRole("button", { name: "完成", exact: true }).tap();
			await drag({ x: 100, y: 130 + index * 65 }, { x: 640, y: 145 + index * 65 });
		}
		const doc = () => p.evaluate(() => window.notebook.value.getNotebook());
		assert.deepEqual(
			(await doc()).pages[0].layers[0].elements.map((e) => e.penStyle),
			["brush", "spray", "oil"],
		);
		assert.equal(
			(await p.locator("[data-pen-style=brush] svg").innerHTML()).includes("#b98442"),
			true,
			"Chinese brush has a bamboo barrel",
		);
		await p.screenshot({ path: ".cache/notes-qa/studio-brushes-ipad.png" });
		await p.getByRole("button", { name: "更多工具", exact: true }).tap();
		await p.getByRole("button", { name: "美纹纸", exact: true }).tap();
		const initial = (await doc()).pages[0].tapes[0];
		const paperBefore = await p.locator(".cube-notes__ink-canvas").boundingBox();
		const zoomBefore = paperBefore.width / (await doc()).pages[0].width;
		const rotate = await p
			.getByRole("button", { name: "旋转美纹纸", exact: true })
			.boundingBox();
		await drag(
			{ x: rotate.x + rotate.width / 2, y: rotate.y + rotate.height / 2 },
			{
				x: paperBefore.x + initial.x * zoomBefore - 60,
				y: paperBefore.y + initial.y * zoomBefore,
			},
		);
		assert.equal((await doc()).pages[0].tapes[0].angle, 90);
		const tape = p.locator(".cube-notes__tape-grab"),
			b = await tape.boundingBox();
		await drag(
			{ x: b.x + b.width / 2, y: b.y + b.height / 2 },
			{ x: b.x + b.width / 2 + 30, y: b.y + b.height / 2 - 30 },
		);
		await p.getByRole("button", { name: "胶带宽度", exact: true }).tap();
		await p.getByRole("slider", { name: "胶带宽度", exact: true }).fill("32");
		await p.getByRole("button", { name: "完成", exact: true }).tap();
		const footprint = (await doc()).pages[0].tapes[0];
		await p.screenshot({ path: ".cache/notes-qa/studio-tape-adjust-ipad.png" });
		await p.getByRole("button", { name: "开始绘画", exact: true }).tap();
		const paper = await p.locator(".cube-notes__ink-canvas").boundingBox();
		const scale = paper.width / (await doc()).pages[0].width;
		const paintY = footprint.y + 130;
		const y = paper.y + paintY * scale;
		await drag({ x: 80, y }, { x: 680, y });
		await p.waitForFunction(
			() => window.notebook.value.getNotebook().pages[0].layers[0].elements.length === 4,
		);
		const painted = (await doc()).pages[0].layers[0].elements.at(-1);
		assert.equal(painted.cutouts.length, 1);
		await p.getByRole("button", { name: "更多工具", exact: true }).tap();
		await p.getByRole("button", { name: "美纹纸", exact: true }).tap();
		await p.getByRole("button", { name: "全部撕下", exact: true }).tap();
		await p.getByRole("button", { name: "开始绘画", exact: true }).tap();
		assert.equal(await p.locator("[data-tape-id]").count(), 0);
		assert.deepEqual((await doc()).pages[0].layers[0].elements.at(-1).cutouts, painted.cutouts);
		const samples = await p.evaluate(
			async ({ x, y }) => {
				const blob = await window.notebook.value.exportFile("png");
				const bitmap = await createImageBitmap(blob);
				const c = document.createElement("canvas");
				c.width = bitmap.width;
				c.height = bitmap.height;
				const ctx = c.getContext("2d");
				ctx.drawImage(bitmap, 0, 0);
				const scale = c.width / window.notebook.value.getNotebook().pages[0].width;
				return [x, x + 40].map((px) => [
					...ctx.getImageData(Math.floor(px * scale), Math.floor(y * scale), 1, 1).data,
				]);
			},
			{ x: footprint.x, y: paintY },
		);
		assert.deepEqual(samples[0], [255, 253, 247, 255], "peeled tape leaves a clean gap in PNG");
		assert.notDeepEqual(samples[1], samples[0], "paint remains beside the gap");
		const svgGap = await p.evaluate(
			async ({ x, y }) => {
				const { pageSvg } = await import("/packages/notes/src/render.ts");
				const page = window.notebook.value.getNotebook().pages[0];
				const url = URL.createObjectURL(
					new Blob([pageSvg(page)], { type: "image/svg+xml" }),
				);
				try {
					const image = new Image();
					image.src = url;
					await image.decode();
					const canvas = document.createElement("canvas");
					canvas.width = page.width * 2;
					canvas.height = page.height * 2;
					const ctx = canvas.getContext("2d");
					ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
					return [...ctx.getImageData(Math.floor(x * 2), Math.floor(y * 2), 1, 1).data];
				} finally {
					URL.revokeObjectURL(url);
				}
			},
			{ x: footprint.x, y: paintY },
		);
		assert.deepEqual(svgGap, [255, 253, 247, 255], "SVG previews preserve tape white space");
		await p.evaluate(() => window.notebook.value.undo());
		assert.equal((await doc()).pages[0].tapes.length, 1);
		await p.evaluate(() => window.notebook.value.redo());
		assert.equal((await doc()).pages[0].tapes.length, 0);
		const saved = await p.evaluate(async () => [
			...new Uint8Array(await (await window.notebook.value.saveFile()).arrayBuffer()),
		]);
		const state = readNotebookState(new Uint8Array(saved));
		assert.equal(state.history.past.length > 0, true);
		assert.deepEqual(state.document, await doc());
		await p.screenshot({ path: ".cache/notes-qa/studio-tape-peeled-ipad.png" });
		assert.deepEqual(errors, []);
		await p.close();
		// The native host delegates custom colors back to the system color picker.
		const native = await browser.newPage({
			viewport: { width: 744, height: 1133 },
			hasTouch: true,
		});
		// A browser's ?platform=ios selects the shell only; the system color path
		// requires a real native host or the explicit editor fixture flag.
		await native.goto(
			"http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1&native-colors=1",
		);
		await native.waitForFunction(() => !!window.noteSource);
		await native.evaluate(
			(bytes) => (window.noteSource.value = new Blob([new Uint8Array(bytes)])),
			bytes,
		);
		await native.waitForFunction(() => {
			try {
				return window.notebook.value.getNotebook().title === "画材试用";
			} catch {
				return false;
			}
		});
		await native.getByRole("button", { name: "更多颜色", exact: true }).tap();
		const color = native.locator('input[type=color][aria-label="自定义颜色"]');
		assert.equal(await color.count(), 1);
		await color.evaluate((el) => {
			el.value = "#8c30b9";
			el.dispatchEvent(new Event("input", { bubbles: true }));
			el.dispatchEvent(new Event("change", { bubbles: true }));
			window.dispatchEvent(new Event("blur"));
			window.dispatchEvent(new Event("focus"));
		});
		await native.getByRole("button", { name: "完成", exact: true }).tap();
		const touch = await native.context().newCDPSession(native);
		await touch.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [{ x: 200, y: 160, id: 1 }],
		});
		await touch.send("Input.dispatchTouchEvent", {
			type: "touchMove",
			touchPoints: [{ x: 500, y: 180, id: 1 }],
		});
		await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		const nativeBytes = await native.evaluate(async () => [
			...new Uint8Array(await (await window.notebook.value.saveFile()).arrayBuffer()),
		]);
		const savedNative = readNotebookState(new Uint8Array(nativeBytes));
		assert.equal(savedNative.document.pages[0].layers[0].elements.at(-1).color, "#8c30b9");
		console.log(
			"PASS: Chinese brush silhouette, spray/oil finger ink, tape move/rotate/peel, PNG white space, undo/redo native history, native color change then drawing",
		);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
