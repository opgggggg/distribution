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
				[375, 812, false],
			]) {
				if (process.env.SAMPLE_WIDTH && width !== Number(process.env.SAMPLE_WIDTH))
					continue;
				const p = await browser.newPage({
					viewport: { width, height },
					hasTouch: true,
					reducedMotion: "reduce",
					colorScheme: process.env.SAMPLE_SCHEME || "light",
				});
				p.setDefaultTimeout(10000);
				const errors = [];
				p.on("pageerror", (e) => errors.push(e.message));
				await p.goto(
					`http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1${infinite ? "&infinite=1" : ""}`,
				);
				const canvas = p.locator(".cube-notes__ink-canvas"),
					menu = p.locator(".cube-notes__pencil-menu"),
					sampler = p.locator(".cube-notes__tip-sample-bar");
				await canvas.waitFor();
				await p.evaluate(async (infinite) => {
					const { createNotebook } = await import("/packages/notes/src/model.ts"),
						{ writeNotebook } = await import("/packages/notes/src/codec.ts");
					const old = document
						.querySelector(".cube-notes__ink-canvas")
						.__vueParentComponent.exposed.viewBounds();
					const cx = old.x + old.width / 2,
						cy = old.y + old.height / 2;
					const book = createNotebook("Tip sampling", infinite),
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
						id: "photo",
						kind: "image",
						src: c.toDataURL(),
						x: cx - 130,
						y: cy - 90,
						width: 260,
						height: 180,
						opacity: 0.2,
						angle: 37,
					};
					const x = cx - 65 * Math.cos((37 * Math.PI) / 180),
						y = cy - 65 * Math.sin((37 * Math.PI) / 180);
					page.layers[0].elements = [
						{
							id: "black",
							kind: "stroke",
							tool: "pen",
							penStyle: "ballpoint",
							color: "#000000",
							width: 30,
							opacity: 1,
							pressure: false,
							points: [
								{ x: x - 30, y, pressure: 0.5 },
								{ x: x + 30, y, pressure: 0.5 },
							],
						},
					];
					window.sampleTarget = { x, y };
					window.noteSource.value = writeNotebook(book);
				}, infinite);
				await p.waitForFunction(() => {
					try {
						return window.notebook.value.getNotebook().title === "Tip sampling";
					} catch {
						return false;
					}
				});
				const ink = () =>
					p.evaluate(
						() => window.notebook.value.getNotebook().pages[0].layers[0].elements,
					);
				const revision = () => p.evaluate(() => window.notebook.value.getRevision());
				const target = () =>
					canvas.evaluate(async (e) => {
						const vm = e.__vueParentComponent,
							world = window.sampleTarget,
							box = e.getBoundingClientRect(),
							z = vm.props.zoom;
						const { rotatedSize, rotateLocal } = await import(
							"/packages/notes/src/view-rotation.ts"
						);
						const area = vm.props.page.infinite
							? vm.exposed.viewBounds()
							: { x: 0, y: 0 };
						const size = rotatedSize(box.width, box.height, vm.props.rotation);
						const local = rotateLocal(
							{ x: (world.x - area.x) * z, y: (world.y - area.y) * z },
							size.width,
							size.height,
							vm.props.rotation,
						);
						return { x: box.left + local.x, y: box.top + local.y };
					});
				async function pen(type, point) {
					await canvas.evaluate(
						(e, { type, point }) => {
							e.setPointerCapture = () => {};
							e.releasePointerCapture = () => {};
							e.hasPointerCapture = () => false;
							e.dispatchEvent(
								new PointerEvent(type, {
									bubbles: true,
									cancelable: true,
									pointerId: 71,
									pointerType: "pen",
									pressure: 0.4,
									buttons: type === "pointerup" ? 0 : 1,
									clientX: point.x,
									clientY: point.y,
								}),
							);
						},
						{ type, point },
					);
				}
				async function openSample() {
					const point = await target();
					await pen("pointerdown", point);
					await menu.waitFor();
					await pen("pointerup", point);
					await menu.getByRole("button", { name: "取色", exact: true }).click();
					await sampler.waitFor();
					assert.equal(
						await p.locator(".cube-notes__tool-tray").isVisible(),
						false,
						"tray is hidden during tip sampling",
					);
				}
				async function source(name, hex) {
					await sampler.getByRole("button", { name, exact: true }).click();
					await p.waitForFunction(
						(hex) =>
							document.querySelector(".cube-notes__tip-sample-bar output")
								?.textContent === hex,
						hex,
					);
				}
				async function draw() {
					const point = await target();
					const x = Math.min(width - 30, Math.max(30, point.x)),
						y = Math.min(height - 180, Math.max(100, point.y + 60));
					await p.mouse.move(x, y);
					await p.mouse.down();
					await p.mouse.move(x + 20, y + 10, { steps: 4 });
					await p.mouse.up();
					return (await ink()).at(-1);
				}
				await p.locator('[data-pen-style="watercolor"]').click();
				const before = await ink(),
					initialRevision = await revision();
				await openSample();
				assert.equal(
					await sampler.locator("output").textContent(),
					"#000000",
					"seed color is the pixel under the held tip, with temporary ink discarded",
				);
				assert.deepEqual(await ink(), before);
				assert.equal(await revision(), initialRevision);
				await source("背景原色", "#DD2200");
				await source("画面颜色", "#000000");
				const rect = await sampler.boundingBox();
				assert.ok(
					rect.x >= 0 &&
						rect.x + rect.width <= width &&
						rect.y >= 0 &&
						rect.y + rect.height <= height,
				);
				assert.ok(
					await sampler
						.locator("button")
						.evaluateAll((nodes) =>
							nodes.every((n) => n.getBoundingClientRect().height >= 44),
						),
				);
				fs.mkdirSync(".cache/notes-qa", { recursive: true });
				await p.screenshot({
					path: `.cache/notes-qa/tip-color-${engine.name()}-${width}${process.env.SAMPLE_SCHEME === "dark" ? "-dark" : ""}.png`,
				});
				await sampler.getByRole("button", { name: "使用此颜色", exact: true }).click();
				assert.equal(await sampler.count(), 0);
				assert.equal(await p.locator(".cube-notes__popover").count(), 0);
				const black = await draw();
				assert.equal(black.color, "#000000");
				assert.equal(black.penStyle, "watercolor");
				// Switch back from source-photo preview and release before its next
				// repaint: acceptance must await the composite, never use stale red.
				await openSample();
				await source("背景原色", "#DD2200");
				const racePoint = await target();
				await p.evaluate((point) => {
					const bar = document.querySelector(".cube-notes__tip-sample-bar");
					[...bar.querySelectorAll("button")]
						.find((b) => b.textContent === "画面颜色")
						.click();
					document.querySelector(".cube-notes__color-sampling").dispatchEvent(
						new PointerEvent("pointerup", {
							bubbles: true,
							cancelable: true,
							pointerType: "pen",
							pointerId: 88,
							clientX: point.x,
							clientY: point.y,
						}),
					);
				}, racePoint);
				await sampler.waitFor({ state: "detached" });
				assert.equal((await draw()).color, "#000000");
				// Cancelling a source switch invalidates its pending repaint/acceptance.
				await openSample();
				await source("背景原色", "#DD2200");
				await p.evaluate(() => {
					const bar = document.querySelector(".cube-notes__tip-sample-bar");
					[...bar.querySelectorAll("button")]
						.find((b) => b.textContent === "画面颜色")
						.click();
					[...bar.querySelectorAll("button")]
						.find((b) => b.textContent === "取消")
						.click();
				});
				await p.evaluate(() => new Promise(requestAnimationFrame));
				assert.equal(await sampler.count(), 0);
				assert.equal((await draw()).color, "#000000");
				const photoBefore = await p.evaluate(
					() => window.notebook.value.getNotebook().pages[0].background,
				);
				let count = (await ink()).length;
				const beforeSampleRevision = await revision();
				await openSample();
				await source("背景原色", "#DD2200");
				let point = await target();
				await p.mouse.click(point.x, point.y);
				assert.equal(
					await sampler.count(),
					0,
					"lifting over photo commits the sampled color",
				);
				assert.equal((await ink()).length, count);
				assert.equal(await revision(), beforeSampleRevision);
				const red = await draw();
				assert.equal(red.color, "#dd2200");
				assert.equal(red.penStyle, "watercolor");
				assert.equal(red.width, black.width);
				assert.equal(red.opacity, black.opacity);
				assert.deepEqual(
					await p.evaluate(() => window.notebook.value.getNotebook().pages[0].background),
					photoBefore,
				);
				// Sampling while erasing returns to the remembered brush only on acceptance.
				await p.evaluate(() =>
					window.dispatchEvent(new CustomEvent("cubeoffice:pencil-double-tap")),
				);
				await openSample();
				await sampler.getByRole("button", { name: "取消", exact: true }).click();
				assert.equal(
					await p.locator('[data-tool="eraser"][aria-pressed="true"]').count(),
					1,
				);
				await openSample();
				await source("背景原色", "#DD2200");
				await sampler.getByRole("button", { name: "使用此颜色", exact: true }).click();
				assert.equal(
					await p.locator('[data-pen-style="watercolor"][aria-pressed="true"]').count(),
					1,
				);
				assert.equal((await draw()).color, "#dd2200");
				// Do not reuse a stale background sample outside the photo or on cancellation.
				count = (await ink()).length;
				await openSample();
				await source("背景原色", "#DD2200");
				await p.locator(".cube-notes__color-sampling").evaluate((e) => {
					for (const type of ["pointermove", "pointerup"])
						e.dispatchEvent(
							new PointerEvent(type, {
								bubbles: true,
								cancelable: true,
								clientX: -5000,
								clientY: -5000,
								pointerId: 83,
								pointerType: "pen",
							}),
						);
				});
				assert.equal(
					await sampler
						.getByRole("button", { name: "使用此颜色", exact: true })
						.isDisabled(),
					true,
				);
				assert.equal((await ink()).length, count);
				await p.keyboard.press("Escape");
				assert.equal(await sampler.count(), 0);
				// Native canvas turns and zoom must not change source-image color mapping.
				if (width === 744) {
					await p.evaluate(() => window.notebook.value.showViewOptions());
					await p
						.locator(".cube-notes__popover")
						.getByLabel("缩放", { exact: true })
						.selectOption("150");
					await p.getByRole("button", { name: "向右旋转 90°", exact: true }).click();
					point = await target();
					await p.evaluate((point) => {
						const v = document.querySelector(".cube-notes__viewport"),
							r = v.getBoundingClientRect();
						v.scrollLeft += point.x - r.left - r.width / 2;
						v.scrollTop += point.y - r.top - r.height / 2;
					}, point);
					await openSample();
					await source("背景原色", "#DD2200");
					await source("画面颜色", "#000000");
					await sampler.getByRole("button", { name: "取消", exact: true }).click();
				}
				// No background: offer the canvas sampler alone, with no dead source switch.
				await p.evaluate(async () => {
					const { writeNotebook } = await import("/packages/notes/src/codec.ts");
					const book = window.notebook.value.getNotebook();
					delete book.pages[0].background;
					window.noteSource.value = writeNotebook(book);
				});
				await p.waitForFunction(() => {
					try {
						return !window.notebook.value.getNotebook().pages[0].background;
					} catch {
						return false;
					}
				});
				if (width === 744) {
					await p.evaluate(() => window.notebook.value.showViewOptions());
					await p.getByRole("button", { name: "重置方向", exact: true }).click();
				}
				await openSample();
				assert.equal(
					await sampler.getByRole("button", { name: "背景原色", exact: true }).count(),
					0,
				);
				await p.evaluate(() => (window.noteReadonly.value = true));
				assert.equal(await sampler.count(), 0, "read-only cancels transient sampling");
				await p.evaluate(() => (window.noteReadonly.value = false));
				assert.equal(
					(await draw()).color,
					"#dd2200",
					"cancel and mode changes preserve the pen color",
				);
				assert.deepEqual(errors, []);
				await p.close();
				console.log(
					`PASS ${engine.name()} ${width}: seeded pen-tip sample, canvas/source switching, source opacity/angle, drag/apply/cancel, ink recovery, eraser return, bounds, readonly`,
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
