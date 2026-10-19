const assert = require("node:assert/strict"),
	{ chromium, webkit } = require("playwright");
(async () => {
	for (const engine of [chromium, webkit]) {
		const browser = await engine.launch({
			headless: true,
			...(engine === chromium ? { channel: "chrome" } : {}),
		});
		try {
			for (const infinite of [true, false])
				for (const width of [744, 375]) {
					const p = await browser.newPage({
						viewport: { width, height: 1133 },
						hasTouch: true,
					});
					const errors = [];
					p.on("pageerror", (e) => errors.push(e.message));
					await p.goto(
						`http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1${infinite ? "&infinite=1" : ""}`,
					);
					const ink = p.locator(".cube-notes__ink-canvas"),
						view = p.locator(".cube-notes__viewport");
					await ink.waitFor();
					await p.waitForFunction(() => window.notebook.value?.getNotebook());
					const book = () => p.evaluate(() => window.notebook.value.getNotebook());
					const camera = () =>
						ink.evaluate((e) => ({
							region: e.__vueParentComponent.exposed.viewBounds(),
							turn: e.__vueParentComponent.props.rotation,
							zoom: e.__vueParentComponent.props.zoom,
						}));
					const initial = await book();
					async function rotate() {
						await p.getByRole("button", { name: "更多工具", exact: true }).click();
						await p.getByRole("button", { name: "旋转画布 90°", exact: true }).click();
						await p.waitForTimeout(90);
					}
					async function draw(a, b) {
						await p.mouse.move(a.x, a.y);
						await p.mouse.down();
						await p.mouse.move(b.x, b.y, { steps: 8 });
						await p.mouse.up();
					}
					const viewport = await view.boundingBox();
					const start = {
						x: viewport.x + viewport.width * 0.35,
						y: viewport.y + viewport.height * 0.35,
					};
					const end = { x: start.x + 40, y: start.y + 15 };
					for (let turn = 0; turn < 4; turn++) {
						if (turn) {
							const before = await camera();
							await rotate();
							const after = await camera();
							assert.equal(after.turn, turn);
							if (infinite) {
								assert.ok(
									Math.abs(
										before.region.x +
											before.region.width / 2 -
											(after.region.x + after.region.width / 2),
									) < 0.001,
									"world center x preserved",
								);
								assert.ok(
									Math.abs(
										before.region.y +
											before.region.height / 2 -
											(after.region.y + after.region.height / 2),
									) < 0.001,
									"world center y preserved",
								);
							}
						}
						const c = await ink.boundingBox();
						if (infinite)
							assert.ok(
								Math.abs(c.width - viewport.width) < 1 &&
									Math.abs(c.height - viewport.height) < 1,
								"rotated infinite board fills the viewport",
							);
						const coordinates = await ink.evaluate((e, start) => {
							const r = e.getBoundingClientRect(),
								vm = e.__vueParentComponent;
							const q = vm.props.rotation,
								z = vm.props.zoom;
							const size = {
								w: q % 2 ? r.height : r.width,
								h: q % 2 ? r.width : r.height,
							};
							const sx = start.x - r.left,
								sy = start.y - r.top;
							const local =
								q === 0
									? { x: sx, y: sy }
									: q === 1
										? { x: sy, y: size.h - sx }
										: q === 2
											? { x: size.w - sx, y: size.h - sy }
											: { x: size.w - sy, y: sx };
							const area = vm.exposed.viewBounds();
							return {
								x: local.x / z + (vm.props.page.infinite ? area.x : 0),
								y: local.y / z + (vm.props.page.infinite ? area.y : 0),
								z,
							};
						}, start);
						// On a finite page use a point inside its intersection with the viewport.
						if (
							!infinite &&
							(start.x < c.x ||
								end.x > c.x + c.width ||
								start.y < c.y ||
								end.y > c.y + c.height)
						)
							throw new Error("test point fell outside finite page");
						await draw(start, end);
						const stroke = (await book()).pages[0].layers[0].elements.at(-1);
						assert.equal(stroke.kind, "stroke");
						assert.ok(
							Math.abs(stroke.points[0].x - coordinates.x) < 1 &&
								Math.abs(stroke.points[0].y - coordinates.y) < 1,
							"stroke starts beneath touch",
						);
						const first = stroke.points[0],
							last = stroke.points.at(-1),
							z = coordinates.z;
						const expected = [
							{ x: 40 / z, y: 15 / z },
							{ x: 15 / z, y: -40 / z },
							{ x: -40 / z, y: -15 / z },
							{ x: -15 / z, y: 40 / z },
						][turn];
						assert.ok(
							Math.abs(last.x - first.x - expected.x) < 1 &&
								Math.abs(last.y - first.y - expected.y) < 1,
							"rotated drawing maps world direction",
						);
						// Native two-finger TouchEvents, including WebKit's negative identifiers.
						const before = await camera();
						await ink.evaluate((e, s) => {
							const dispatch = (type, gap) => {
								const contacts = [
									{ identifier: -8, target: e, clientX: s.x - gap, clientY: s.y },
									{ identifier: -5, target: e, clientX: s.x + gap, clientY: s.y },
								];
								const event = new Event(type, { bubbles: true, cancelable: true });
								Object.assign(event, {
									touches: contacts,
									targetTouches: contacts,
									changedTouches: contacts,
								});
								e.dispatchEvent(event);
							};
							dispatch("touchstart", 35);
							dispatch("touchmove", 55);
						}, start);
						await p.waitForTimeout(70);
						await ink.evaluate((e) => {
							const event = new Event("touchend", {
								bubbles: true,
								cancelable: true,
							});
							Object.assign(event, {
								touches: [],
								targetTouches: [],
								changedTouches: [
									{ identifier: -8, target: e },
									{ identifier: -5, target: e },
								],
							});
							e.dispatchEvent(event);
						});
						await p.waitForTimeout(90);
						const after = await camera();
						assert.ok(after.zoom > before.zoom, "two fingers zoom after rotation");
						assert.equal(
							(await book()).pages[0].layers[0].elements.length,
							turn + 1,
							"pinch leaves no ink",
						);
						await ink.evaluate(
							(e, zoom) => e.__vueParentComponent.emit("zoom", zoom),
							before.zoom,
						);
						await p.waitForTimeout(60);
					}
					await rotate();
					assert.equal((await camera()).turn, 0, "four quarter turns reset direction");
					const content = await book();
					assert.equal(content.pages[0].width, initial.pages[0].width);
					assert.equal(content.pages[0].height, initial.pages[0].height);
					await p.evaluate(() => (window.noteReadonly.value = true));
					await p.evaluate(() => window.notebook.value.showViewOptions());
					await p.getByRole("button", { name: "向左旋转 90°", exact: true }).click();
					await p.waitForTimeout(80);
					assert.equal((await camera()).turn, 3, "readonly canvas can rotate");
					assert.deepEqual(
						await book(),
						content,
						"view-only rotation never changes saved content",
					);
					assert.deepEqual(errors, []);
					await p.screenshot({
						path: `.cache/notes-qa/rotation-${engine.name()}-${infinite ? "infinite" : "page"}-${width}.png`,
					});
					console.log(
						`PASS ${engine.name()} ${width} ${infinite ? "infinite" : "page"}: 4 directions, drawing, center, touch zoom and readonly`,
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
