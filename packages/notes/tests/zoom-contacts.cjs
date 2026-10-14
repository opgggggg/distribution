const assert = require("node:assert/strict"),
	{ chromium } = require("playwright");
(async () => {
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	try {
		for (const [width, height] of [
			[390, 844],
			[744, 1133],
			[1133, 744],
		]) {
			const p = await browser.newPage({ viewport: { width, height }, hasTouch: true });
			const errors = [];
			p.on("pageerror", (e) => errors.push(e.message));
			await p.goto("http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1");
			await p.locator(".cube-notes__ink-canvas").waitFor();
			await p.evaluate(() => (window.noteReadonly.value = true));
			const input = await p.context().newCDPSession(p),
				canvas = p.locator(".cube-notes__ink-canvas");
			const paperWidth = async () => (await canvas.boundingBox()).width;
			const center = { x: width / 2, y: 200 };
			const send = (type, points) =>
				input.send("Input.dispatchTouchEvent", { type, touchPoints: points });
			async function pinch(factor) {
				const before = await paperWidth();
				await send("touchStart", [
					{ x: center.x - 35, y: center.y, id: 1 },
					{ x: center.x + 35, y: center.y, id: 2 },
				]);
				const widths = [];
				for (let i = 1; i <= 8; i++) {
					const r = 35 * (1 + ((factor - 1) * i) / 8);
					await send("touchMove", [
						{ x: center.x - r, y: center.y, id: 1 },
						{ x: center.x + r, y: center.y, id: 2 },
					]);
					await p.evaluate(() => new Promise(requestAnimationFrame));
					widths.push(await paperWidth());
				}
				assert.ok(
					Math.abs(widths.at(-1) / before - factor) < 0.02,
					"sustained pinch reaches its intended scale",
				);
				assert.ok(
					widths.every(
						(w, i) =>
							!i ||
							(factor > 1 ? w >= widths[i - 1] - 0.1 : w <= widths[i - 1] + 0.1),
					),
					"all frames of the pinch respond",
				);
				await send("touchEnd", [{ x: center.x + 35 * factor, y: center.y, id: 2 }]);
				const remaining = await paperWidth();
				await send("touchMove", [
					{ x: center.x + 35 * factor + 20, y: center.y + 15, id: 2 },
				]);
				assert.equal(await paperWidth(), remaining, "remaining finger only pans");
				await send("touchEnd", []);
			}
			await pinch(1.4);
			await pinch(0.8);
			await pinch(1.1);
			const beforeCancel = await paperWidth();
			await p.evaluate(() => {
				const c = document.querySelector(".cube-notes__ink-canvas");
				c.addEventListener(
					"touchstart",
					(e) => (window.lastTouches = Array.from(e.touches)),
				);
			});
			await send("touchStart", [
				{ x: center.x - 30, y: 200, id: 3 },
				{ x: center.x + 30, y: 200, id: 4 },
			]);
			// Reproduce WebKit cancelling one contact while another is still down.
			await p.evaluate(() => {
				const t = window.lastTouches;
				document.querySelector(".cube-notes__ink-canvas").dispatchEvent(
					new TouchEvent("touchcancel", {
						bubbles: true,
						cancelable: true,
						changedTouches: [t[0]],
						touches: [t[1]],
						targetTouches: [t[1]],
					}),
				);
			});
			// CDP only supports ending the whole gesture; provide the native partial
			// contact lists explicitly to test a held finger after cancellation.
			await p.evaluate(
				({ x }) => {
					const c = document.querySelector(".cube-notes__ink-canvas");
					const touch = (id, px) =>
						new Touch({ identifier: id, target: c, clientX: px, clientY: 200 });
					const remaining = window.lastTouches[1];
					const added = touch(10, x - 30);
					c.dispatchEvent(
						new TouchEvent("touchstart", {
							bubbles: true,
							cancelable: true,
							changedTouches: [added],
							touches: [remaining, added],
							targetTouches: [remaining, added],
						}),
					);
					const moved = [touch(remaining.identifier, x + 36), touch(10, x - 36)];
					c.dispatchEvent(
						new TouchEvent("touchmove", {
							bubbles: true,
							cancelable: true,
							changedTouches: moved,
							touches: moved,
							targetTouches: moved,
						}),
					);
					c.dispatchEvent(
						new TouchEvent("touchend", {
							bubbles: true,
							cancelable: true,
							changedTouches: moved,
							touches: [],
							targetTouches: [],
						}),
					);
				},
				{ x: center.x },
			);
			await send("touchEnd", []);
			assert.ok(
				(await paperWidth()) / beforeCancel > 1.15,
				"pinch recovers even if the remaining finger was not lifted",
			);
			const recoveredWidth = await paperWidth();
			await send("touchStart", [{ x: center.x, y: 160, id: 5 }]);
			await send("touchMove", [{ x: center.x + 45, y: 190, id: 5 }]);
			await send("touchEnd", []);
			assert.equal(
				await paperWidth(),
				recoveredWidth,
				"cancelled contact cannot cause a later one-finger zoom",
			);
			await pinch(1.1);
			// Backgrounding must also discard both contacts and allow the next pinch.
			await send("touchStart", [
				{ x: center.x - 30, y: 180, id: 6 },
				{ x: center.x + 30, y: 180, id: 7 },
			]);
			await p.evaluate(() => window.dispatchEvent(new Event("blur")));
			await send("touchEnd", []);
			const before = await paperWidth();
			await send("touchStart", [{ x: center.x, y: 180, id: 8 }]);
			await send("touchMove", [{ x: center.x + 20, y: 190, id: 8 }]);
			await send("touchEnd", []);
			assert.equal(await paperWidth(), before);
			await pinch(0.9);
			await p.evaluate(() => (window.noteReadonly.value = false));
			const start = (await p.evaluate(() => window.notebook.value.getNotebook())).pages[0]
				.layers[0].elements.length;
			await send("touchStart", [{ x: center.x - 50, y: 160, id: 9 }]);
			await send("touchMove", [{ x: center.x + 50, y: 175, id: 9 }]);
			await send("touchEnd", []);
			assert.equal(
				(await p.evaluate(() => window.notebook.value.getNotebook())).pages[0].layers[0]
					.elements.length,
				start + 1,
				"one finger still draws after repeated pinches",
			);
			assert.deepEqual(errors, []);
			await p.close();
		}
		console.log(
			"PASS: continuous two-finger zoom, remaining-finger pan, partial cancellation, blur recovery, and one-finger drawing without zoom",
		);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
