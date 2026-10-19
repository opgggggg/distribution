const assert = require("node:assert/strict");
const { chromium, webkit } = require("playwright");
const fs = require("node:fs");

(async () => {
	for (const engine of [chromium, webkit]) {
		const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
		try {
			for (const [width, height, infinite] of [
				[744, 1133, false],
				[1133, 744, true],
				[375, 812, true],
			]) {
				const p = await browser.newPage({
					viewport: { width, height },
					hasTouch: true,
					reducedMotion: "reduce",
				});
				const errors = [];
				p.on("pageerror", (e) => errors.push(e.message));
				p.setDefaultTimeout(8000);
				await p.goto(
					`http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1${infinite ? "&infinite=1" : ""}`,
				);
				await p.locator(".cube-notes__ink-canvas").waitFor();
				// Synthetic pen samples exercise the same handlers in Chromium and WebKit;
				// only native pointer capture needs replacing because no OS pen is down.
				await p.evaluate(() => {
					const c = document.querySelector(".cube-notes__ink-canvas");
					c.setPointerCapture = () => {};
					c.releasePointerCapture = () => {};
					c.hasPointerCapture = () => false;
				});
				const ink = () =>
					p.evaluate(
						() => window.notebook.value.getNotebook().pages[0].layers[0].elements,
					);
				const menu = p.locator(".cube-notes__pencil-menu");
				const canvas = p.locator(".cube-notes__ink-canvas");
				const box = await canvas.boundingBox();
				const x = Math.max(40, box.x + Math.min(130, box.width / 3));
				const y = Math.max(100, box.y + Math.min(180, box.height / 3));
				async function pen(type, px = x, py = y, extra = {}) {
					await p.evaluate(
						({ type, px, py, extra }) => {
							document.querySelector(".cube-notes__ink-canvas").dispatchEvent(
								new PointerEvent(type, {
									bubbles: true,
									cancelable: true,
									pointerId: 71,
									pointerType: "pen",
									isPrimary: true,
									button: 0,
									buttons: type === "pointerup" ? 0 : 1,
									pressure: 0.4,
									clientX: px,
									clientY: py,
									...extra,
								}),
							);
						},
						{ type, px, py, extra },
					);
				}
				async function stroke(px = x, py = y) {
					await pen("pointerdown", px, py);
					await pen("pointermove", px + 45, py + 20);
					await pen("pointerup", px + 45, py + 20);
					await p.evaluate(() => new Promise(requestAnimationFrame));
				}
				async function hold(px = x, py = y) {
					await pen("pointerdown", px, py);
					await menu.waitFor();
					await pen("pointerup", px, py);
				}
				async function doubleTap() {
					await p.evaluate(() =>
						window.dispatchEvent(new CustomEvent("cubeoffice:pencil-double-tap")),
					);
				}
				// Stationary tip: no ink, history step, or lingering overlay after opening.
				await hold();
				assert.equal((await ink()).length, 0);
				assert.equal(
					await menu.getByRole("button", { name: "撤销", exact: true }).isDisabled(),
					true,
				);
				const rect = await menu.boundingBox();
				assert.ok(
					rect.x >= 0 &&
						rect.y >= 0 &&
						rect.x + rect.width <= width &&
						rect.y + rect.height <= height,
				);
				const targets = await menu
					.locator("button")
					.evaluateAll((nodes) =>
						nodes
							.map((n) => n.getBoundingClientRect())
							.every((b) => b.width >= 44 && b.height >= 44),
					);
				assert.ok(targets, "every menu target is at least 44px");
				await menu.getByRole("button", { name: "笔迹颜色 #2563eb", exact: true }).click();
				await menu.waitFor({ state: "detached" });
				await stroke();
				assert.equal((await ink()).length, 1);
				assert.equal((await ink())[0].color, "#2563eb");
				// Moving immediately cancels the hold, even if the pen then pauses.
				await pen("pointerdown", x, y + 35);
				await pen("pointermove", x + 12, y + 35);
				await p.waitForTimeout(650);
				assert.equal(await menu.count(), 0);
				await pen("pointerup", x + 35, y + 35);
				assert.equal((await ink()).length, 2);
				const before = await ink();
				await p.locator('[data-pen-style="watercolor"]').click();
				await stroke(x, y + 70);
				const watercolor = (await ink()).at(-1);
				// Native bridge toggles without changing the saved brush preset.
				await doubleTap();
				assert.equal(
					await p.locator('[data-tool="eraser"][aria-pressed="true"]').count(),
					1,
				);
				// Holding the eraser over existing ink must restore tentative erasure.
				await hold(x + 10, y + 5);
				assert.equal((await ink()).length, 3);
				assert.deepEqual((await ink()).slice(0, 2), before);
				await menu.getByRole("button", { name: "画笔", exact: true }).click();
				await stroke(x, y + 100);
				const restored = (await ink()).at(-1);
				assert.equal(restored.penStyle, "watercolor");
				assert.equal(restored.color, watercolor.color);
				assert.equal(restored.width, watercolor.width);
				await doubleTap();
				await doubleTap();
				await stroke(x, y + 130);
				assert.equal((await ink()).at(-1).penStyle, "watercolor");
				// Width, undo, redo, and the existing color picker remain usable.
				await hold();
				await menu.getByRole("button", { name: "笔迹粗细 12 pt", exact: true }).click();
				await stroke(x, y + 160);
				assert.equal((await ink()).at(-1).width, 12);
				let count = (await ink()).length;
				await hold();
				await menu.getByRole("button", { name: "撤销", exact: true }).click();
				assert.equal((await ink()).length, count - 1);
				await hold();
				await menu.getByRole("button", { name: "重做", exact: true }).click();
				assert.equal((await ink()).length, count);
				await hold();
				await menu.getByRole("button", { name: "更多颜色", exact: true }).click();
				await p.locator(".cube-notes__color-picker").waitFor();
				await p.keyboard.press("Escape");
				await stroke(x + 10, y + 190);
				assert.equal(
					(await ink()).length,
					count + 1,
					"drawing recovers after color picker",
				);
				// Pointer cancellation disarms the timer. No late menu after cancellation.
				await pen("pointerdown");
				await pen("pointercancel");
				await p.waitForTimeout(650);
				assert.equal(await menu.count(), 0);
				await stroke();
				// Click-outside dismissal lets that same new pen stroke draw normally.
				await hold();
				await p.evaluate(
					({ x, y }) =>
						document.querySelector(".cube-notes__ink-canvas").dispatchEvent(
							new PointerEvent("pointerdown", {
								bubbles: true,
								cancelable: true,
								pointerId: 71,
								pointerType: "pen",
								clientX: x,
								clientY: y,
								buttons: 1,
								pressure: 0.4,
							}),
						),
					{ x, y },
				);
				await pen("pointermove", x + 40, y + 10);
				await pen("pointerup", x + 40, y + 10);
				assert.equal(await menu.count(), 0);
				// Edge placement uses client coordinates after rotating and zooming the board.
				await p.evaluate(() => window.notebook.value.showViewOptions());
				await p
					.locator(".cube-notes__popover")
					.getByLabel("缩放", { exact: true })
					.selectOption("150");
				await p.getByRole("button", { name: "向右旋转 90°", exact: true }).click();
				await hold(width - 25, height - 210);
				const edge = await menu.boundingBox();
				assert.ok(
					edge.x >= 0 &&
						edge.y >= 0 &&
						edge.x + edge.width <= width &&
						edge.y + edge.height <= height,
				);
				fs.mkdirSync(".cache/notes-qa", { recursive: true });
				await p.screenshot({
					path: `.cache/notes-qa/pencil-menu-${engine.name()}-${width}.png`,
				});
				await p.keyboard.press("Escape");
				assert.equal(await menu.count(), 0);
				// Finger long holds keep their original behavior; coalesced pen motion
				// cannot return to the starting point and accidentally re-arm the hold.
				if (width === 744) {
					await pen("pointerdown");
					await p.evaluate(
						({ x, y }) => {
							const c = document.querySelector(".cube-notes__ink-canvas");
							const sample = (px) =>
								new PointerEvent("pointermove", {
									bubbles: true,
									cancelable: true,
									pointerId: 71,
									pointerType: "pen",
									clientX: px,
									clientY: y,
									buttons: 1,
									pressure: 0.4,
								});
							const event = sample(x);
							Object.defineProperty(event, "getCoalescedEvents", {
								value: () => [sample(x + 12), sample(x)],
							});
							c.dispatchEvent(event);
						},
						{ x, y },
					);
					await p.waitForTimeout(650);
					assert.equal(await menu.count(), 0);
					await pen("pointerup");
					async function finger(type, active) {
						await p.evaluate(
							({ type, active, x, y }) => {
								const c = document.querySelector(".cube-notes__ink-canvas");
								const contact = {
									identifier: -91,
									clientX: x,
									clientY: y,
									target: c,
									touchType: "direct",
								};
								const event = new Event(type, { bubbles: true, cancelable: true });
								Object.assign(event, {
									changedTouches: [contact],
									touches: active ? [contact] : [],
									targetTouches: active ? [contact] : [],
								});
								c.dispatchEvent(event);
							},
							{ type, active, x, y },
						);
					}
					await finger("touchstart", true);
					await p.waitForTimeout(650);
					assert.equal(await menu.count(), 0);
					await finger("touchend", false);
					await p.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
					await hold();
					await p.screenshot({
						path: `.cache/notes-qa/pencil-menu-${engine.name()}-dark.png`,
					});
					await p.keyboard.press("Escape");
				}
				// Read-only ignores both pen actions; edit-mode re-entry can still draw.
				await p.evaluate(() => (window.noteReadonly.value = true));
				count = (await ink()).length;
				await doubleTap();
				await pen("pointerdown");
				await p.waitForTimeout(650);
				await pen("pointerup");
				assert.equal(await menu.count(), 0);
				assert.equal((await ink()).length, count);
				await p.evaluate(() => (window.noteReadonly.value = false));
				await stroke();
				assert.equal((await ink()).length, count + 1);
				assert.deepEqual(errors, []);
				await p.close();
				console.log(
					`PASS ${engine.name()} ${width}x${height}: pen hold, tools/color/width, eraser restore, native event, history, cancellation, bounds, readonly`,
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
