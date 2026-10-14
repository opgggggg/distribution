const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium } = require("playwright");
const base = process.env.NOTES_MOBILE_URL || "http://127.0.0.1:5179/?platform=android";
(async () => {
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	const errors = [];
	try {
		const p = await browser.newPage({
			viewport: { width: 390, height: 844 },
			hasTouch: true,
			isMobile: true,
		});
		p.on("pageerror", (e) => errors.push(e.message));
		await p.goto(base);
		await p.getByRole("button", { name: "同意并继续" }).click();
		await p.getByRole("button", { name: "新建", exact: true }).click();
		await p.locator(".android-sheet button").filter({ hasText: "手写笔记" }).click();
		await p.locator(".cube-notes__ink-canvas").waitFor();
		const surface = await p.locator(".cube-notes__viewport").boundingBox();
		assert.ok(surface.height > 800, "the canvas fills the mobile workspace");
		const dock = await p.locator(".cube-notes__dock").boundingBox();
		assert.ok(dock.y >= 680 && dock.height <= 145, "pen tools float above the bottom edge");
		assert.equal(await p.locator(".cube-notes__properties").count(), 0);
		await p.screenshot({ path: ".cache/notes-qa/freeform-mobile-empty.png" });
		const input = await p.context().newCDPSession(p);
		async function drag(a, b, whileHeld) {
			await input.send("Input.dispatchTouchEvent", {
				type: "touchStart",
				touchPoints: [{ ...a, id: 1 }],
			});
			for (let i = 1; i <= 8; i++)
				await input.send("Input.dispatchTouchEvent", {
					type: "touchMove",
					touchPoints: [
						{ x: a.x + ((b.x - a.x) * i) / 8, y: a.y + ((b.y - a.y) * i) / 8, id: 1 },
					],
				});
			if (whileHeld) {
				await p.evaluate(
					() =>
						new Promise((resolve) =>
							requestAnimationFrame(() => requestAnimationFrame(resolve)),
						),
				);
				await whileHeld();
			}
			await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		}
		const paper = await p.locator(".cube-notes__ink-canvas").boundingBox();
		await drag({ x: paper.x + 40, y: paper.y + 100 }, { x: paper.x + 220, y: paper.y + 125 });
		await p.getByRole("button", { name: "完成书写", exact: true }).tap();
		await p.getByRole("button", { name: "形状", exact: true }).tap();
		await p.locator('[data-tool="rectangle"]').tap();
		await drag({ x: paper.x + 45, y: paper.y + 130 }, { x: paper.x + 130, y: paper.y + 200 });
		const bar = p.locator(".cube-notes__selection-bar");
		await bar.waitFor();
		const styles = await bar.evaluate((e) => ({
			width: e.offsetWidth,
			height: e.offsetHeight,
			buttons: [...e.querySelectorAll("button")].map((b) => ({
				label: b.getAttribute("aria-label"),
				width: b.offsetWidth,
				height: b.offsetHeight,
				display: getComputedStyle(b).display,
			})),
		}));
		assert.ok(styles.height <= 56, "selection actions stay on one row");
		assert.ok(
			styles.buttons.filter((b) => b.width > 0).every((b) => b.width >= 44 && b.height >= 44),
			"touch targets remain at least 44px",
		);
		await p.locator('[data-tool="pen"]').tap();
		await p.locator('[data-tool="lasso"]').tap();
		await p.getByRole("button", { name: "视图选项", exact: true }).tap();
		await p.getByRole("button", { name: "吸附设置", exact: true }).tap();
		await p.getByLabel("网格吸附", { exact: true }).check();
		await p.getByRole("button", { name: "完成", exact: true }).tap();
		await p.touchscreen.tap(paper.x + 80, paper.y + 165);
		await p.evaluate(() => {
			window.phonePointerLog = [];
			for (const type of ["pointerdown", "pointerup", "pointercancel", "lostpointercapture"])
				document.addEventListener(
					type,
					(e) =>
						window.phonePointerLog.push({
							type,
							target: e.target.className,
							x: e.clientX,
							y: e.clientY,
						}),
					true,
				);
		});
		const arrow = await p.locator('[data-connect="right"]').boundingBox();
		await drag(
			{ x: arrow.x + arrow.width / 2, y: arrow.y + arrow.height / 2 },
			{ x: paper.x + 260, y: paper.y + 165 },
		);
		assert.ok(
			(await p.evaluate(() => window.phonePointerLog)).every(
				(e) => e.type !== "pointercancel",
			),
			"host touch styling must not cancel handle drags",
		);
		const corner = await p.locator('[data-resize="se"]').boundingBox();
		await drag(
			{ x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 },
			{ x: corner.x + corner.width / 2 + 12, y: corner.y + corner.height / 2 + 16 },
			async () => {
				const live = await p.locator('[data-resize="se"]').boundingBox();
				assert.ok(
					Math.abs(live.x - corner.x - 12) < 1,
					"touch handle follows resize before release",
				);
				assert.ok(Math.abs(live.y - corner.y - 16) < 1);
			},
		);
		assert.ok(
			(await p.evaluate(() => window.phonePointerLog)).every(
				(e) => e.type !== "pointercancel",
			),
		);
		await p
			.locator(".cube-notes__selection-bar")
			.getByRole("button", { name: "保存区域", exact: true })
			.tap();
		await p.getByRole("textbox", { name: "区域名称" }).fill("手机流程");
		await p.locator("dialog").getByRole("button", { name: "保存", exact: true }).tap();
		await p.locator(".cube-notes__scene-link").filter({ hasText: "手机流程" }).tap();
		assert.equal(await p.locator(".cube-notes__sidebar").count(), 0);
		const output = p.waitForEvent("download");
		await p
			.locator(".cube-notes__header")
			.getByRole("button", { name: "保存", exact: true })
			.tap();
		const download = await output;
		const bytes = new Uint8Array(await fs.readFile(await download.path()));
		const { readNotebook } = await import("../dist/index.js");
		const book = readNotebook(bytes);

		assert.equal(book.pages[0].layers[0].elements.length, 4);
		assert.ok(
			Math.abs(
				book.pages[0].layers[0].elements.find((e) => e.shape).points[0].x -
					(book.pages[0].infinite !== false
						? 45
						: (45 * book.pages[0].width) / paper.width),
			) < 0.1,
			"tapping a shape with snapping enabled must not move it",
		);
		assert.equal(book.pages[0].layers[0].elements.filter((e) => e.connector).length, 1);
		const edge = book.pages[0].layers[0].elements.find((e) => e.connector);
		const shapes = book.pages[0].layers[0].elements.filter((e) => e.shape);
		const span = (e) =>
			Math.max(...e.points.map((p) => p.x)) - Math.min(...e.points.map((p) => p.x));
		assert.ok(
			span(shapes.find((e) => e.id === edge.connector.to.elementId)) >
				span(shapes.find((e) => e.id === edge.connector.from.elementId)) + 10,
			"touch resize changes geometry",
		);
		assert.ok(edge.points[1].y > edge.points[0].y, "connected endpoint follows resized shape");
		assert.equal(book.pages[0].scenes[0].name, "手机流程");
		// Export through the same host delivery flow as native mobile save dialogs.
		for (const [label, extension] of [
			["PNG 图片（当前页）", "png"],
			["全部页面图片（ZIP）", "zip"],
			["PDF 文档", "pdf"],
		]) {
			await p.getByRole("button", { name: "视图选项", exact: true }).tap();
			await p.getByRole("button", { name: "导出", exact: true }).tap();
			const exported = p.waitForEvent("download");
			await p
				.getByRole("button", { name: new RegExp(label.replace(/[()（）]/g, "\\$&")) })
				.tap();
			const file = await exported;
			assert.ok(file.suggestedFilename().endsWith(`.${extension}`));
			const data = await fs.readFile(await file.path());
			if (extension === "png") assert.equal(data.subarray(1, 4).toString(), "PNG");
			if (extension === "zip")
				assert.deepEqual(Object.keys(require("fflate").unzipSync(data)), ["page-001.png"]);
			if (extension === "pdf")
				assert.equal((await require("pdf-lib").PDFDocument.load(data)).getPageCount(), 1);
		}
		const preserved = p.waitForEvent("download");
		await p
			.locator(".cube-notes__header")
			.getByRole("button", { name: "保存", exact: true })
			.tap();
		assert.deepEqual(
			readNotebook(new Uint8Array(await fs.readFile(await (await preserved).path()))),
			book,
		);
		await p.getByRole("button", { name: "视图选项", exact: true }).tap();
		await p.getByRole("button", { name: /^(适合宽度|查看全部)$/ }).tap();
		await p.screenshot({ path: ".cache/notes-qa/phone-touch-host.png" });
		await p.locator('[data-tool="pen"]').tap();
		await p.locator('[data-tool="pen"]').tap();
		await p.screenshot({ path: ".cache/notes-qa/phone-touch-settings.png" });
		await p.getByRole("button", { name: "完成", exact: true }).tap();
		for (const width of [375, 390, 414]) {
			await p.setViewportSize({ width, height: 844 });
			assert.ok(
				await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
			);
		}
		await p.setViewportSize({ width: 844, height: 390 });
		await p.evaluate(
			() =>
				new Promise((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(resolve)),
				),
		);
		const landscapeDock = await p.locator(".cube-notes__dock").boundingBox();
		assert.ok(
			landscapeDock.y >= 250 &&
				landscapeDock.height <= 125 &&
				landscapeDock.y + landscapeDock.height <= 390,
		);
		assert.equal(await p.locator(".cube-notes__footer").count(), 0);
		await p.screenshot({ path: ".cache/notes-qa/phone-touch-landscape.png" });
		assert.deepEqual(errors, []);
		console.log(
			"PASS: real touch input, shape connection, scene naming/navigation, native file content, settings and portrait/landscape host layout",
		);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
