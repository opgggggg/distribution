const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const base =
	process.env.NOTES_PREVIEW_URL || "http://127.0.0.1:5178/packages/notes/tests/viewer.html";
const output = path.resolve(__dirname, "../../../.cache/notes-qa");

(async () => {
	await fs.mkdir(output, { recursive: true });
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	const errors = [];
	async function open(viewport, extra = {}) {
		const p = await browser.newPage({ viewport, ...extra });
		p.on("pageerror", (error) => errors.push(error.message));
		await p.goto(base);
		await p.locator(".cube-notes__ink-canvas").waitFor();
		await p.waitForFunction(() => window.notebook?.value?.getNotebook()?.pages.length === 1);
		return p;
	}
	const doc = (p) => p.evaluate(() => window.notebook.value.getNotebook());
	async function point(p, x, y) {
		const box = await p.locator(".cube-notes__ink-canvas").boundingBox(),
			book = await doc(p);
		return {
			x: box.x + (x * box.width) / book.pages[0].width,
			y: box.y + (y * box.height) / book.pages[0].height,
		};
	}
	async function draw(p, points) {
		const coords = [];
		for (const [x, y] of points) coords.push(await point(p, x, y));
		await p.mouse.move(coords[0].x, coords[0].y);
		await p.mouse.down();
		for (const c of coords.slice(1)) await p.mouse.move(c.x, c.y, { steps: 3 });
		await p.mouse.up();
	}
	async function tool(p, name) {
		if (["line", "rectangle", "ellipse"].includes(name))
			await p.getByRole("button", { name: "形状", exact: true }).click();
		if ((await p.locator(`[data-tool="${name}"]`).getAttribute("aria-pressed")) !== "true")
			await p.locator(`[data-tool="${name}"]`).click();
	}
	try {
		const bridged = await browser.newPage({ viewport: { width: 1280, height: 900 } });
		bridged.on("pageerror", (error) => errors.push(error.message));
		await bridged.goto(`${base}?bridge=1`);
		await bridged.locator(".cube-notes__ink-canvas").waitFor();
		await draw(bridged, [
			[60, 100],
			[180, 130],
		]);
		await bridged.waitForFunction(() => window.bridgeSurface.getState().dirty);
		assert.ok(await bridged.evaluate(() => window.bridgeSurface.getState().revision > 0));
		const hostFile = await bridged.evaluate(async () => {
			let delivered;
			await window.bridgeSurface.save({
				deliver: async (blob) => {
					delivered = Array.from(new Uint8Array(await blob.arrayBuffer()));
				},
			});
			return delivered;
		});
		const { readNotebook: readBridgeNotebook } = await import("../dist/index.js");
		assert.equal(
			readBridgeNotebook(new Uint8Array(hostFile)).pages[0].layers[0].elements.length,
			1,
		);
		assert.equal(await bridged.evaluate(() => window.bridgeSurface.getState().dirty), false);
		await bridged.close();
		const pens = await open({ width: 390, height: 844 }, { hasTouch: true });
		const penInput = await pens.context().newCDPSession(pens);
		for (const [i, style] of ["ballpoint", "fountain", "brush"].entries()) {
			await pens.locator('[data-tool="pen"]').click();
			await pens.locator(`[data-pen-style="${style}"]`).click();
			if (style === "brush")
				await pens.getByRole("slider", { name: "笔迹粗细", exact: true }).fill("7");
			await pens.getByRole("button", { name: "完成", exact: true }).click();
			const a = await point(pens, 60, 100 + i * 70),
				b = await point(pens, 260, 110 + i * 70);
			await penInput.send("Input.dispatchMouseEvent", {
				type: "mousePressed",
				...a,
				button: "left",
				clickCount: 1,
				pointerType: "pen",
				force: 0.2,
			});
			await penInput.send("Input.dispatchMouseEvent", {
				type: "mouseMoved",
				...b,
				button: "left",
				buttons: 1,
				pointerType: "pen",
				force: 0.8,
			});
			await penInput.send("Input.dispatchMouseEvent", {
				type: "mouseReleased",
				...b,
				button: "left",
				clickCount: 1,
				pointerType: "pen",
			});
			const ink = (await doc(pens)).pages[0].layers[0].elements.at(-1);
			assert.equal(ink.penStyle, style);
			assert.equal(ink.pressure, style !== "ballpoint");
		}
		await pens.locator('[data-tool="pen"]').click();
		await pens.locator('[data-pen-style="fountain"]').click();
		assert.equal(
			await pens.getByRole("slider", { name: "笔迹粗细", exact: true }).inputValue(),
			"2",
		);
		await pens.locator('[data-pen-style="brush"]').click();
		assert.equal(
			await pens.getByRole("slider", { name: "笔迹粗细", exact: true }).inputValue(),
			"7",
		);
		await pens.screenshot({
			path: path.join(output, "pen-types-phone.png"),
			animations: "disabled",
		});
		const saved = await pens.evaluate(async () =>
			Array.from(
				new Uint8Array(
					await (await window.notebook.value.exportFile("cubenote")).arrayBuffer(),
				),
			),
		);
		const { readNotebook } = await import("../dist/index.js");
		assert.deepEqual(
			readNotebook(new Uint8Array(saved)).pages[0].layers[0].elements.map((e) => e.penStyle),
			["ballpoint", "fountain", "brush"],
		);
		await pens.close();
		const p = await open({ width: 1280, height: 900 });
		const resize = p.getByRole("separator", { name: "调整页面面板宽度", exact: true });
		const originalRail = await p.locator(".cube-notes__sidebar").boundingBox();
		const grip = await resize.boundingBox();
		await p.mouse.move(grip.x + grip.width / 2, grip.y + 100);
		await p.mouse.down();
		await p.mouse.move(grip.x + grip.width / 2 + 120, grip.y + 100, { steps: 8 });
		await p.mouse.up();
		assert.equal(
			Math.round((await p.locator(".cube-notes__sidebar").boundingBox()).width),
			Math.round(originalRail.width) + 120,
		);
		assert.equal(await p.evaluate(() => window.notebook.value.isDirty()), false);
		await resize.focus();
		await resize.press("ArrowRight");
		assert.equal(
			Number(await resize.getAttribute("aria-valuenow")),
			Math.round(originalRail.width) + 128,
		);
		await p.reload();
		await p.locator(".cube-notes__ink-canvas").waitFor();
		assert.equal(
			Math.round((await p.locator(".cube-notes__sidebar").boundingBox()).width),
			Math.round(originalRail.width) + 128,
		);
		await resize.focus();
		await resize.press("End");
		assert.equal(
			await resize.getAttribute("aria-valuenow"),
			await resize.getAttribute("aria-valuemax"),
		);
		await p.locator(".cube-notes").evaluate((el) => {
			el.style.width = "700px";
		});
		await p.waitForFunction(
			() =>
				document.querySelector('[role="separator"]').getAttribute("aria-valuemax") ===
				"340",
		);
		assert.ok((await p.locator(".cube-notes__stage").boundingBox()).width >= 360);
		assert.equal(
			await p
				.locator(".cube-notes__tool-tray")
				.evaluate((el) => el.scrollWidth <= el.clientWidth),
			true,
		);
		await p.locator(".cube-notes").evaluate((el) => {
			el.style.width = "";
		});
		await p.setViewportSize({ width: 900, height: 800 });
		await p.waitForFunction(
			() =>
				document.querySelector(".cube-notes__toolbar") &&
				getComputedStyle(document.querySelector(".cube-notes__toolbar")).flexDirection ===
					"column",
		);
		assert.equal(
			await p
				.locator(".cube-notes__toolbar")
				.evaluate((el) => el.scrollWidth <= el.clientWidth),
			true,
		);
		await resize.focus();
		await resize.press("Home");
		assert.equal(await resize.getAttribute("aria-valuenow"), "160");
		await p.setViewportSize({ width: 1280, height: 900 });
		await resize.dblclick();
		assert.equal(await resize.getAttribute("aria-valuenow"), "184");
		const dots = await p
			.locator(".cube-notes__width-dot")
			.evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().width));
		assert.ok(
			dots[1] >= dots[0] * 1.8 && dots[2] >= dots[1] * 1.5,
			"Width preset dots have visibly different sizes",
		);

		await p.getByRole("button", { name: "笔迹粗细 4 pt", exact: true }).click();
		assert.equal(
			await p
				.getByRole("button", { name: "笔迹粗细 4 pt", exact: true })
				.getAttribute("aria-pressed"),
			"true",
		);
		await p.locator('[data-tool="pen"]').click();
		await p.getByRole("slider", { name: "笔迹粗细", exact: true }).fill("2.5");
		await p.getByRole("button", { name: "笔迹颜色 #dc3658", exact: true }).click();
		await p.getByRole("button", { name: "完成", exact: true }).click();
		assert.equal(
			await p
				.getByRole("button", { name: "笔迹颜色 #dc3658", exact: true })
				.getAttribute("aria-pressed"),
			"true",
		);
		await p.getByRole("button", { name: "笔迹颜色 #222b40", exact: true }).click();
		await p.getByRole("button", { name: "笔迹粗细 2 pt", exact: true }).click();
		const viewportBox = await p.locator(".cube-notes__viewport").boundingBox();
		const pageBox = await p.locator(".cube-notes__paper").boundingBox();
		assert.ok(
			pageBox.width > viewportBox.width * 0.9,
			"Paper fills the writing body by default",
		);

		await draw(p, [
			[70, 120],
			[90, 105],
			[110, 130],
			[140, 110],
			[180, 120],
		]);
		assert.equal((await doc(p)).pages[0].layers[0].elements.length, 1);
		assert.equal(await p.evaluate(() => window.notebook.value.isDirty()), true);
		await p.getByRole("button", { name: "撤销", exact: true }).click();
		assert.equal((await doc(p)).pages[0].layers[0].elements.length, 0);
		await p.getByRole("button", { name: "重做", exact: true }).click();
		assert.equal((await doc(p)).pages[0].layers[0].elements.length, 1);
		await tool(p, "lasso");
		await draw(p, [
			[55, 90],
			[200, 90],
			[200, 145],
			[55, 145],
			[55, 90],
		]);
		await p.getByRole("button", { name: "复制选中内容", exact: true }).click();
		assert.equal((await doc(p)).pages[0].layers[0].elements.length, 2);
		await p.getByRole("button", { name: "删除选中内容", exact: true }).click();
		assert.equal((await doc(p)).pages[0].layers[0].elements.length, 1);
		await tool(p, "eraser");
		await draw(p, [
			[110, 125],
			[115, 125],
		]);
		assert.equal((await doc(p)).pages[0].layers[0].elements.length, 0);
		await p.getByRole("button", { name: "撤销", exact: true }).click();
		await tool(p, "text");
		const start = await point(p, 60, 50);
		await p.mouse.click(start.x, start.y);
		await p
			.getByRole("textbox", { name: "编辑文字" })
			.fill("项目想法 / Project notes\n把想法写下来，让讨论更清晰。");
		// Autosave exports a live text draft without closing the text box.
		const draftFile = await p.evaluate(async () => {
			const b = await window.notebook.value.exportFile("cubenote");
			return Array.from(new Uint8Array(await b.arrayBuffer()));
		});
		assert.ok(draftFile.length > 100);
		assert.equal(await p.getByRole("textbox", { name: "编辑文字" }).isVisible(), true);
		await p.getByRole("button", { name: "完成", exact: true }).click();
		assert.equal(
			(await doc(p)).pages[0].layers[0].elements.filter((e) => e.kind === "text").length,
			1,
		);
		// Pressure pen input plus a palm contact must retain one complete stroke.
		await tool(p, "pen");
		const cdp = await p.context().newCDPSession(p);
		const a = await point(p, 65, 165),
			b = await point(p, 250, 180);
		await cdp.send("Input.dispatchMouseEvent", {
			type: "mousePressed",
			...a,
			button: "left",
			clickCount: 1,
			pointerType: "pen",
			force: 0.2,
		});
		await p.locator(".cube-notes__ink-canvas").evaluate((c) =>
			c.dispatchEvent(
				new PointerEvent("pointerdown", {
					pointerId: 92,
					pointerType: "touch",
					clientX: 450,
					clientY: 250,
					bubbles: true,
				}),
			),
		);
		await cdp.send("Input.dispatchMouseEvent", {
			type: "mouseMoved",
			...b,
			button: "left",
			buttons: 1,
			pointerType: "pen",
			force: 0.8,
		});
		await cdp.send("Input.dispatchMouseEvent", {
			type: "mouseReleased",
			...b,
			button: "left",
			clickCount: 1,
			pointerType: "pen",
		});
		const ink = (await doc(p)).pages[0].layers[0].elements.at(-1);
		assert.equal(ink.pressure, true);
		assert.ok(ink.points.some((p) => p.pressure > 0.7));
		await tool(p, "rectangle");
		await draw(p, [
			[60, 225],
			[225, 310],
		]);
		await tool(p, "line");
		await draw(p, [
			[225, 270],
			[310, 270],
		]);
		await tool(p, "ellipse");
		await draw(p, [
			[320, 230],
			[440, 310],
		]);
		await tool(p, "highlighter");
		await p.getByRole("button", { name: "笔迹颜色 #facc15", exact: true }).click();
		await draw(p, [
			[60, 375],
			[320, 375],
		]);
		// A failed delivery and a save of an older snapshot never clear dirty state.
		assert.equal(
			await p.evaluate(async () => {
				try {
					await window.notebook.value.saveFile({
						deliver: async () => {
							throw Error("disk full");
						},
					});
				} catch {}
				return window.notebook.value.isDirty();
			}),
			true,
		);
		await p.evaluate(() => {
			window.pendingNoteSave = window.notebook.value.saveFile({
				deliver: () =>
					new Promise((resolve) => {
						window.finishNoteSave = resolve;
					}),
			});
		});
		await p.waitForFunction(() => typeof window.finishNoteSave === "function");
		await p.getByRole("button", { name: "添加页面", exact: true }).last().click();
		await p.evaluate(async () => {
			window.finishNoteSave();
			await window.pendingNoteSave;
		});
		assert.equal(await p.evaluate(() => window.notebook.value.isDirty()), true);
		assert.equal((await doc(p)).pages.length, 2);
		await p.getByRole("button", { name: "上一页", exact: true }).click();
		const before = await doc(p);
		await p.evaluate(() => {
			window.noteReadonly.value = true;
		});
		await p.waitForFunction(() => !document.querySelector('[data-tool="pen"]'));
		await draw(p, [
			[40, 90],
			[100, 90],
		]);
		assert.deepEqual(await doc(p), before);
		await p.evaluate(() => {
			window.noteReadonly.value = false;
		});
		await p.locator('[data-tool="pen"]').waitFor();
		await p.getByRole("button", { name: "纸张", exact: true }).click();
		await p.getByRole("button", { name: "方格", exact: true }).click();
		await p.getByRole("button", { name: "完成", exact: true }).click();
		assert.equal((await doc(p)).pages[0].paper, "grid");
		await p.getByRole("button", { name: "书签", exact: true }).click();
		await tool(p, "pen");
		await p.screenshot({ animations: "disabled", path: path.join(output, "desktop.png") });
		await p.getByRole("button", { name: "导出", exact: true }).click();
		await p.getByRole("button", { name: /PDF 文档/ }).click();
		await p.waitForFunction(() => window.noteExports.length > 0);
		const pdf = await p.evaluate(async () =>
			Array.from(new Uint8Array(await window.noteExports.at(-1).blob.arrayBuffer())),
		);
		const { PDFDocument } = await import("pdf-lib");
		const document = await PDFDocument.load(new Uint8Array(pdf));
		assert.equal(document.getPageCount(), 2);
		await fs.writeFile(path.join(output, "notebook.pdf"), new Uint8Array(pdf));
		const native = await p.evaluate(async () =>
			Array.from(
				new Uint8Array(
					await (await window.notebook.value.exportFile("cubenote")).arrayBuffer(),
				),
			),
		);
		await fs.writeFile(path.join(output, "notebook.cubenote"), new Uint8Array(native));
		// Reading-mode transitions retain uncommitted text, and history remains usable.
		await tool(p, "text");
		const textPosition = await point(p, 300, 330);
		await p.mouse.click(textPosition.x, textPosition.y);
		await p.getByRole("textbox", { name: "编辑文字" }).fill("阅读模式切换也不会丢失文字。");
		await p.evaluate(() => {
			window.noteReadonly.value = true;
		});
		await p.waitForFunction(() => !document.querySelector('[data-tool="pen"]'));
		assert.ok(
			(await doc(p)).pages[0].layers[0].elements.some(
				(e) => e.kind === "text" && e.text.startsWith("阅读模式"),
			),
		);
		for (const [label, viewport] of [
			["phone", { width: 390, height: 844 }],
			["small-phone", { width: 375, height: 812 }],
			["tablet", { width: 1024, height: 768 }],
			["landscape", { width: 844, height: 390 }],
		]) {
			const mobile = await open(viewport, { hasTouch: true });
			await mobile.evaluate((bytes) => {
				window.noteSource.value = new Blob([new Uint8Array(bytes)]);
			}, native);
			await mobile.waitForFunction(() => {
				try {
					return window.notebook.value.getNotebook().pages.length === 2;
				} catch {
					return false;
				}
			});
			assert.equal(
				await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth),
				false,
			);
			if (label === "phone") {
				const session = await mobile.context().newCDPSession(mobile);
				await mobile.getByRole("button", { name: "视图选项", exact: true }).click();
				const originalZoom = Number(
					await mobile.getByRole("combobox", { name: "缩放" }).inputValue(),
				);
				await mobile.getByRole("button", { name: "完成", exact: true }).click();
				const count = (await doc(mobile)).pages[0].layers[0].elements.length;
				await session.send("Input.dispatchTouchEvent", {
					type: "touchStart",
					touchPoints: [
						{ id: 0, x: 110, y: 400 },
						{ id: 1, x: 230, y: 400 },
					],
				});
				await session.send("Input.dispatchTouchEvent", {
					type: "touchMove",
					touchPoints: [
						{ id: 0, x: 80, y: 400 },
						{ id: 1, x: 260, y: 400 },
					],
				});
				await session.send("Input.dispatchTouchEvent", {
					type: "touchEnd",
					touchPoints: [],
				});
				await mobile.getByRole("button", { name: "视图选项", exact: true }).click();
				assert.ok(
					Number(await mobile.getByRole("combobox", { name: "缩放" }).inputValue()) >
						originalZoom,
				);
				assert.equal((await doc(mobile)).pages[0].layers[0].elements.length, count);
				await mobile.getByRole("button", { name: "适合宽度", exact: true }).click();
				await session.send("Input.dispatchTouchEvent", {
					type: "touchStart",
					touchPoints: [{ id: 5, x: 110, y: 430 }],
				});
				await session.send("Input.dispatchTouchEvent", {
					type: "touchMove",
					touchPoints: [{ id: 5, x: 200, y: 445 }],
				});
				await session.send("Input.dispatchTouchEvent", {
					type: "touchEnd",
					touchPoints: [],
				});
				assert.equal((await doc(mobile)).pages[0].layers[0].elements.length, count + 1);
				await mobile.getByRole("button", { name: "视图选项", exact: true }).click();
				await mobile.getByLabel("手指书写", { exact: true }).uncheck();
				await mobile.getByRole("button", { name: "完成", exact: true }).click();
			}

			await mobile.screenshot({
				animations: "disabled",
				path: path.join(output, `${label}.png`),
			});
			await mobile.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
			await mobile.screenshot({
				animations: "disabled",
				path: path.join(output, `${label}-dark.png`),
			});
			await mobile.close();
		}
		assert.deepEqual(errors, []);
		console.log(
			"PASS: ink, pressure/palm, lasso, eraser, history, live text, save races, readonly, paper, PDF and responsive layout",
		);
		console.log(`Visual QA: ${output}`);
	} finally {
		await browser.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
