const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const base =
	process.env.NOTES_PREVIEW_URL || "http://127.0.0.1:5178/packages/notes/tests/viewer.html";
(async () => {
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const errors = [];
	p.on("pageerror", (e) => errors.push(e.message));
	const elements = () =>
		p.evaluate(() => window.notebook.value.getNotebook().pages[0].layers[0].elements);
	const center = async (selector) => {
		const b = await p.locator(selector).boundingBox();
		return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
	};
	const handles = async () =>
		Object.fromEntries(
			await Promise.all(
				["nw", "ne", "sw", "se"].map(async (c) => [
					c,
					await center(`[data-resize="${c}"]`),
				]),
			),
		);
	const near = (actual, expected) =>
		assert.ok(Math.abs(actual - expected) < 1, `${actual} != ${expected}`);
	const flush = () =>
		p.evaluate(
			() =>
				new Promise((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(resolve)),
				),
		);
	const at = async (x, y) => {
		const b = await p.locator(".cube-notes__ink-canvas").boundingBox();
		const page = await p.evaluate(() => window.notebook.value.getNotebook().pages[0]);
		return { x: b.x + (x * b.width) / page.width, y: b.y + (y * b.height) / page.height };
	};
	try {
		await p.goto(base);
		await p.locator(".cube-notes__ink-canvas").waitFor();
		await p.getByRole("button", { name: "形状", exact: true }).click();
		await p.locator('[data-tool="rectangle"]').click();
		const a = await at(80, 150),
			b = await at(180, 220);
		await p.mouse.move(a.x, a.y);
		await p.mouse.down();
		await p.mouse.move(b.x, b.y);
		await p.mouse.up();
		await p.locator('[data-resize="se"]').waitFor();
		const initial = await elements(),
			before = await handles(),
			connection = await center('[data-connect="right"]');
		// Inspect while the resize pointer is still held, before any model commit.
		await p.mouse.move(before.se.x, before.se.y);
		await p.mouse.down();
		await p.mouse.move(before.se.x + 60, before.se.y + 45, { steps: 8 });
		await flush();
		const resized = await handles(),
			connected = await center('[data-connect="right"]');
		near(resized.nw.x, before.nw.x);
		near(resized.nw.y, before.nw.y);
		near(resized.se.x, before.se.x + 60);
		near(resized.se.y, before.se.y + 45);
		near(connected.x, connection.x + 60);
		near(connected.y, connection.y + 22.5);
		assert.deepEqual(await elements(), initial, "preview must not commit before release");
		await p.mouse.up();
		await flush();
		const committed = await handles();
		for (const c of Object.keys(committed)) {
			near(committed[c].x, resized[c].x);
			near(committed[c].y, resized[c].y);
		}
		// Text uses proportional font scaling; handles must follow actual text bounds.
		await p.locator('[data-tool="text"]').click();
		const t = await at(80, 240);
		await p.mouse.click(t.x, t.y);
		await p
			.getByRole("textbox", { name: "编辑文字" })
			.fill(
				"套索：单击或圈选，拖动四角缩放\n吸附：对齐线、等距提示与网格开关\n区域：保存视图，点击名称跳回",
			);
		await p.getByRole("button", { name: "完成", exact: true }).click();
		await p.locator('[data-tool="lasso"]').click();
		const hit = await at(100, 260);
		await p.mouse.click(hit.x, hit.y);
		await p.locator('[data-resize="nw"]').waitFor();
		const textBefore = await handles(),
			textModel = await elements();
		await p.keyboard.down("Alt");
		await p.mouse.move(hit.x, hit.y);
		await p.mouse.down();
		await p.mouse.move(hit.x + 68, hit.y + 53, { steps: 8 });
		await flush();
		const moved = await handles();
		for (const c of Object.keys(moved)) {
			near(moved[c].x, textBefore[c].x + 68);
			near(moved[c].y, textBefore[c].y + 53);
		}
		assert.deepEqual(await elements(), textModel);
		await p.screenshot({ path: ".cache/notes-qa/selection-live-drag.png" });
		await p.mouse.up();
		await p.keyboard.up("Alt");
		await flush();
		const movedCommitted = await handles();
		for (const c of Object.keys(moved)) {
			near(movedCommitted[c].x, moved[c].x);
			near(movedCommitted[c].y, moved[c].y);
		}
		// Cancel a live resize: preview geometry and content both restore.
		await p.mouse.move(moved.se.x, moved.se.y);
		await p.mouse.down();
		await p.mouse.move(moved.se.x + 20, moved.se.y + 30, { steps: 4 });
		await flush();
		const current = await handles();
		assert.ok(current.se.x > moved.se.x + 10);
		await p
			.locator('[data-resize="se"]')
			.evaluate((el) =>
				el.dispatchEvent(
					new PointerEvent("pointercancel", { pointerId: 1, bubbles: true }),
				),
			);
		await p.mouse.up();
		await flush();
		const restored = await handles();
		for (const c of Object.keys(moved)) {
			near(restored[c].x, moved[c].x);
			near(restored[c].y, moved[c].y);
		}
		assert.deepEqual(errors, []);
		console.log(
			"PASS: live shape resize and connection anchors, multiline text drag, model commit continuity, and cancellation restore",
		);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
