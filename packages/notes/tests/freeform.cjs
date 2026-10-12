const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium } = require("playwright");
const base =
	process.env.NOTES_PREVIEW_URL || "http://127.0.0.1:5178/packages/notes/tests/viewer.html";
(async () => {
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	const errors = [];
	const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	p.on("pageerror", (e) => errors.push(e.message));
	const doc = () => p.evaluate(() => window.notebook.value.getNotebook());
	const elements = async () => (await doc()).pages[0].layers[0].elements;
	async function at(x, y) {
		const box = await p.locator(".cube-notes__ink-canvas").boundingBox(),
			b = (await doc()).pages[0];
		return { x: box.x + (x * box.width) / b.width, y: box.y + (y * box.height) / b.height };
	}
	async function drag(a, b) {
		await p.mouse.move(a.x, a.y);
		await p.mouse.down();
		await p.mouse.move(b.x, b.y, { steps: 8 });
		await p.mouse.up();
	}
	async function shape(x, y, w, h) {
		await p.getByRole("button", { name: "形状", exact: true }).click();
		await p.locator('[data-tool="rectangle"]').click();
		await drag(await at(x, y), await at(x + w, y + h));
	}
	try {
		await p.goto(base);
		await p.locator(".cube-notes__ink-canvas").waitFor();
		await shape(80, 150, 100, 70);
		assert.equal((await elements())[0].shape, "rectangle");
		await p.locator(".cube-notes__selection-bar").waitFor();
		const shapeBox = await p.locator('[data-resize="se"]').boundingBox();
		await drag(
			{ x: shapeBox.x + shapeBox.width / 2, y: shapeBox.y + shapeBox.height / 2 },
			await at(220, 250),
		);
		assert.ok((await elements())[0].points.some((pt) => pt.x > 210));
		const connectorHandle = await p.locator('[data-connect="right"]').boundingBox();
		await drag(
			{
				x: connectorHandle.x + connectorHandle.width / 2,
				y: connectorHandle.y + connectorHandle.height / 2,
			},
			await at(400, 200),
		);
		let els = await elements();
		assert.equal(els.length, 3);
		const edge = els.find((e) => e.connector);
		assert.ok(edge);
		const created = els.find((e) => e.id === edge.connector.to.elementId);
		assert.ok(created.shape);
		const firstEndpoint = { ...edge.points[0] };
		await p.locator(".cube-notes__viewport").focus();
		await p.keyboard.press("ArrowDown");
		els = await elements();
		assert.notDeepEqual(els.find((e) => e.connector).points[1], edge.points[1]);
		assert.deepEqual(els.find((e) => e.connector).points[0], firstEndpoint);
		// Reconnect to an existing shape instead of making a duplicate.
		const left = await p.locator('[data-connect="left"]').boundingBox();
		await drag({ x: left.x + left.width / 2, y: left.y + left.height / 2 }, await at(160, 200));
		assert.equal((await elements()).filter((e) => e.shape).length, 2);
		assert.equal((await elements()).filter((e) => e.connector).length, 2);
		// Color editing and arrangement are adjacent to the selected object.
		await p
			.locator(".cube-notes__selection-bar")
			.getByRole("button", { name: "笔迹颜色 #2563eb" })
			.click();
		assert.equal((await elements())[0].color, "#2563eb");
		await p.getByRole("button", { name: "排列选中内容", exact: true }).click();
		await p.getByRole("button", { name: "放大选中内容", exact: true }).click();
		await p.getByRole("button", { name: "完成", exact: true }).click();
		// Grid snapping can be bypassed with Alt and does not alter document dirty state by itself.
		await p.getByRole("button", { name: "吸附设置", exact: true }).click();
		await p.getByLabel("网格吸附", { exact: true }).check();
		await p.getByRole("button", { name: "完成", exact: true }).click();
		await drag(await at(130, 190), await at(147, 211));
		const moved = (await elements())[0];
		const xs = moved.points.map((pt) => pt.x);
		assert.ok(Math.abs((Math.min(...xs) - moved.width / 2) % 20) < 0.1);
		// Save selection as a named scene, rename, jump across pages, round trip and undo deletion.
		await p
			.locator(".cube-notes__selection-bar")
			.getByRole("button", { name: "保存区域", exact: true })
			.click();
		await p.getByRole("textbox", { name: "区域名称" }).fill("系统架构");
		await p.locator("dialog").getByRole("button", { name: "保存", exact: true }).click();
		assert.equal((await doc()).pages[0].scenes[0].name, "系统架构");
		await p.getByRole("button", { name: "重命名区域" }).click();
		await p.getByRole("textbox", { name: "区域名称" }).fill("流程设计");
		await p.locator("dialog").getByRole("button", { name: "保存", exact: true }).click();
		await p.getByRole("button", { name: "添加页面", exact: true }).first().click();
		await p.locator(".cube-notes__scene-link").filter({ hasText: "流程设计" }).click();
		assert.match(await p.locator(".cube-notes__footer").innerText(), /1 \/ 2/);
		await p.waitForTimeout(150);
		await p.screenshot({ path: ".cache/notes-qa/freeform-desktop.png" });
		const bytes = await p.evaluate(async () =>
			Array.from(
				new Uint8Array(
					await (await window.notebook.value.exportFile("cubenote")).arrayBuffer(),
				),
			),
		);
		const { readNotebook } = await import("../dist/index.js");
		const saved = readNotebook(new Uint8Array(bytes));
		assert.equal(saved.pages[0].scenes[0].name, "流程设计");
		assert.equal(saved.pages[0].layers[0].elements.filter((e) => e.connector).length, 2);
		await fs.writeFile(".cache/notes-qa/freeform-demo.cubenote", new Uint8Array(bytes));
		await p.evaluate(async () => {
			window.noteSource.value = await window.notebook.value.exportFile("cubenote");
		});
		await p.waitForFunction(() => window.notebook.value.getNotebook().pages.length === 2);
		await p.getByRole("button", { name: "区域", exact: true }).click();
		await p.getByRole("button", { name: "删除区域" }).click();
		assert.equal((await doc()).pages[0].scenes.length, 0);
		await p.getByRole("button", { name: "撤销", exact: true }).click();
		assert.equal((await doc()).pages[0].scenes.length, 1);
		// Capture the visible viewport too, then reorder saved regions.
		await p
			.locator(".cube-notes__footer")
			.getByRole("button", { name: "保存区域", exact: true })
			.click();
		await p.getByRole("textbox", { name: "区域名称" }).fill("当前视图");
		await p.locator("dialog").getByRole("button", { name: "保存", exact: true }).click();
		assert.equal((await doc()).pages[0].scenes.length, 2);
		await p
			.locator(".cube-notes__scene-card")
			.nth(1)
			.getByRole("button", { name: "向前移动", exact: true })
			.click();
		assert.equal((await doc()).pages[0].scenes[0].name, "当前视图");
		// Duplicating pages remaps all connector endpoints and region IDs.
		await p.getByRole("button", { name: "页面操作", exact: true }).click();
		await p.getByRole("button", { name: "复制页面", exact: true }).click();
		const copied = (await doc()).pages[1],
			ids = new Set(copied.layers[0].elements.map((e) => e.id));
		assert.equal((await doc()).pages.length, 3);
		for (const e of copied.layers[0].elements.filter((e) => e.connector))
			assert.ok(ids.has(e.connector.from.elementId) && ids.has(e.connector.to.elementId));
		assert.notEqual(copied.scenes[0].id, (await doc()).pages[0].scenes[0].id);
		await p.getByRole("button", { name: "适合宽度", exact: true }).click();
		const source = copied.layers[0].elements.find((e) => e.shape),
			xs2 = source.points.map((pt) => pt.x),
			ys2 = source.points.map((pt) => pt.y);
		const center = await at(
			(Math.min(...xs2) + Math.max(...xs2)) / 2,
			(Math.min(...ys2) + Math.max(...ys2)) / 2,
		);
		await p.mouse.click(center.x, center.y);
		await p.keyboard.press("Delete");
		assert.equal((await doc()).pages[1].layers[0].elements.length, 1);
		await p.getByRole("button", { name: "撤销", exact: true }).click();
		assert.equal((await doc()).pages[1].layers[0].elements.length, 4);
		await p.evaluate(() => (window.noteReadonly.value = true));
		assert.ok(await p.getByRole("button", { name: "删除区域" }).first().isDisabled());
		await p.locator(".cube-notes__scene-link").first().click();
		assert.equal(await p.locator("[data-resize]").count(), 0);
		// Responsive property popovers preserve the writing surface.
		const phone = await browser.newPage({
			viewport: { width: 390, height: 844 },
			hasTouch: true,
		});
		phone.on("pageerror", (e) => errors.push(e.message));
		await phone.goto(base);
		await phone.locator(".cube-notes__ink-canvas").waitFor();
		await phone.locator('[data-tool="pen"]').click();
		const pop = await phone.locator(".cube-notes__popover").boundingBox();
		assert.ok(pop.x >= 0 && pop.x + pop.width <= 390);
		assert.equal(await phone.locator("dialog[open]").count(), 0);
		await phone.screenshot({ path: ".cache/notes-qa/freeform-phone.png" });
		await phone.keyboard.press("Escape");
		assert.equal(await phone.locator(".cube-notes__popover").count(), 0);
		assert.deepEqual(errors, []);
		console.log(
			"PASS: context controls, resize, connected shapes, grid snapping, scenes, save/reopen, undo, read-only and responsive popovers",
		);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
