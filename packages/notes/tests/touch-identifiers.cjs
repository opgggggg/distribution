const assert = require("node:assert/strict");
const { chromium, webkit } = require("playwright");

(async () => {
	for (const engine of [chromium, webkit]) {
		const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
		try {
			for (const infinite of [false, true]) {
				const p = await browser.newPage({
					viewport: { width: 744, height: 1133 },
					hasTouch: true,
				});
				const errors = [];
				p.on("pageerror", (e) => errors.push(e.message));
				await p.goto(
					`http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1${infinite ? "&infinite=1" : ""}`,
				);
				await p.locator(".cube-notes__ink-canvas").waitFor();
				const ink = () =>
					p.evaluate(
						() => window.notebook.value.getNotebook().pages[0].layers[0].elements,
					);
				async function send(type, changed, active = changed) {
					await p.evaluate(
						({ type, changed, active }) => {
							const c = document.querySelector(".cube-notes__ink-canvas");
							const contact = ([identifier, clientX, clientY]) => ({
								identifier,
								clientX,
								clientY,
								target: c,
							});
							const event = new Event(type, { bubbles: true, cancelable: true });
							Object.assign(event, {
								changedTouches: changed.map(contact),
								touches: active.map(contact),
								targetTouches: active.map(contact),
							});
							c.dispatchEvent(event);
						},
						{ type, changed, active },
					);
					await p.evaluate(() => new Promise(requestAnimationFrame));
				}
				async function draw(id) {
					const before = (await ink()).length;
					await send("touchstart", [[id, 300, 200]]);
					await send("touchmove", [[id, 340, 220]]);
					await send("touchend", [[id, 340, 220]], []);
					assert.equal((await ink()).length, before + 1, `finger ${id} draws`);
					assert.ok((await ink()).at(-1).points.length > 1);
				}
				for (const id of [-1, -1752575, -2147483648, 0, 1752575, 2147483647])
					await draw(id);
				await p.locator('[data-pen-style="brush"]').tap();
				await draw(-1752575);
				await p.getByRole("button", { name: "笔迹颜色 #2563eb", exact: true }).tap();
				await draw(-1752575);
				assert.equal((await ink()).at(-1).color, "#2563eb");
				assert.equal((await ink()).at(-1).penStyle, "brush");
				// Opposite signed identifiers must stay distinct, and two contacts must never paint.
				const beforePinch = (await ink()).length;
				await send("touchstart", [
					[-42, 300, 250],
					[42, 380, 250],
				]);
				await send("touchmove", [
					[-42, 280, 250],
					[42, 400, 250],
				]);
				await send("touchend", [[-42, 280, 250]], [[42, 400, 250]]);
				await send("touchmove", [[42, 410, 260]]);
				await send("touchend", [[42, 410, 260]], []);
				assert.equal(
					(await ink()).length,
					beforePinch,
					"pinch and remaining finger do not paint",
				);
				await draw(-42);
				await send("touchstart", [[-42, 300, 200]]);
				await send("touchcancel", [[-42, 300, 200]], []);
				await draw(-42);
				await p.evaluate(() => (window.noteReadonly.value = true));
				const beforeReadonly = (await ink()).length;
				await send("touchstart", [[-1, 300, 200]]);
				await send("touchend", [[-1, 340, 220]], []);
				assert.equal((await ink()).length, beforeReadonly);
				await p.evaluate(() => (window.noteReadonly.value = false));
				await draw(-1);
				assert.deepEqual(errors, []);
				await p.close();
			}
		} finally {
			await browser.close();
		}
	}
	console.log(
		"PASS: signed opaque touch IDs, tool/color changes, pinch, cancellation and edit-mode recovery in Chromium/WebKit",
	);
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
