const assert = require("node:assert/strict"),
	fs = require("node:fs"),
	{ chromium } = require("playwright");
(async () => {
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	try {
		const p = await browser.newPage({
			viewport: { width: 1133, height: 744 },
			hasTouch: true,
			deviceScaleFactor: 2,
		});
		await p.goto("http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1&infinite=1");
		await p.locator(".cube-notes__ink-canvas").waitFor();
		await p.evaluate(async () => {
			const { createNotebook, uid } = await import("/packages/notes/src/model.ts"),
				{ writeNotebook } = await import("/packages/notes/src/codec.ts");
			const book = createNotebook("Zoom benchmark", true),
				styles = ["brush", "watercolor", "pencil", "crayon", "spray", "oil"];
			book.pages[0].layers[0].elements = Array.from({ length: 96 }, (_, i) => ({
				kind: "stroke",
				id: uid(),
				tool: "pen",
				penStyle: styles[i % 6],
				brushVersion: 2,
				color: ["#222b40", "#2563eb", "#dc3658"][i % 3],
				width: i % 6 === 4 ? 32 : 12,
				opacity: 0.6,
				pressure: true,
				points: Array.from({ length: 90 }, (_, j) => ({
					x: 60 + j * 10,
					y: 70 + (i % 18) * 28 + Math.sin(j / 7 + i) * 12,
					pressure: 0.4 + (j % 12) / 20,
				})),
			}));
			book.pages[0].layers[0].elements.push({
				kind: "stroke",
				id: uid(),
				tool: "pen",
				penStyle: "ballpoint",
				brushVersion: 1,
				color: "#00ff00",
				width: 20,
				opacity: 1,
				pressure: false,
				points: [
					{ x: 500, y: 250, pressure: 0.5 },
					{ x: 500, y: 251, pressure: 0.5 },
				],
			});
			window.noteSource.value = writeNotebook(book);
		});
		await p.waitForTimeout(300);
		const result = await p.evaluate(async () => {
			const c = document.querySelector(".cube-notes__ink-canvas"),
				base = document.querySelector(".cube-notes__paper-canvas"),
				before = JSON.stringify(window.notebook.value.getNotebook()),
				dims = [base.width, base.height],
				box = c.getBoundingClientRect();
			const proto = CanvasRenderingContext2D.prototype,
				clear = proto.clearRect;
			let redraws = 0;
			proto.clearRect = function (...args) {
				if (this.canvas === base) redraws++;
				return clear.apply(this, args);
			};
			const touch = (id, x, y) =>
					new Touch({ identifier: id, target: c, clientX: x, clientY: y }),
				send = (type, active, changed = active) =>
					c.dispatchEvent(
						new TouchEvent(type, {
							bubbles: true,
							cancelable: true,
							touches: active,
							targetTouches: active,
							changedTouches: changed,
						}),
					);
			function marker() {
				const rasterBox = base.getBoundingClientRect();
				const context = base.getContext("2d"),
					data = context.getImageData(0, 0, base.width, base.height).data;
				let x = 0,
					y = 0,
					count = 0;
				for (let i = 0; i < data.length; i += 4)
					if (data[i] < 20 && data[i + 1] > 230 && data[i + 2] < 20) {
						x += (i / 4) % base.width;
						y += Math.floor(i / 4 / base.width);
						count++;
					}
				if (!count) throw Error("Marker not visible");
				return {
					x: rasterBox.left + (x / count / base.width) * rasterBox.width,
					y: rasterBox.top + (y / count / base.height) * rasterBox.height,
				};
			}
			const initialMarker = marker(),
				x = initialMarker.x,
				y = initialMarker.y;
			let a = touch(1, x - 80, y),
				b = touch(2, x + 80, y);
			send("touchstart", [a, b]);
			await new Promise(requestAnimationFrame);
			redraws = 0;
			const frameTimes = [];
			let last = performance.now();
			for (let i = 1; i <= 24; i++) {
				a = touch(1, x - 80 - i * 3, y + i);
				b = touch(2, x + 80 + i * 3, y + i);
				send("touchmove", [a, b]);
				await new Promise(requestAnimationFrame);
				const now = performance.now();
				frameTimes.push(now - last);
				last = now;
			}
			await new Promise(requestAnimationFrame);
			const during = redraws;
			send("touchend", [], [a, b]);
			await new Promise((r) => setTimeout(r, 200));
			proto.clearRect = clear;
			const finalMarker = marker();
			window.zoomMarker = finalMarker;
			return {
				anchorError: Math.hypot(
					finalMarker.x - initialMarker.x,
					finalMarker.y - initialMarker.y - 24,
				),
				during,
				after: redraws,
				dimensionsStable: dims[0] === base.width && dims[1] === base.height,
				unchanged: before === JSON.stringify(window.notebook.value.getNotebook()),
				maxFrameMs: Math.max(...frameTimes),
				meanFrameMs: frameTimes.reduce((a, b) => a + b) / frameTimes.length,
				frameTimes,
			};
		});
		fs.writeFileSync(
			".cache/notes-qa/zoom-" + (process.env.BASELINE ? "before" : "after") + ".json",
			JSON.stringify(result, null, 2),
		);
		console.log(JSON.stringify(result));
		if (!process.env.BASELINE) {
			assert.ok(result.anchorError < 2, "The zoom center follows the fingers without drift");
			assert.equal(result.during, 0, "Pinch must reuse the bitmap");
			assert.ok(result.after <= 2, "Repaint only at gesture completion");
			assert.ok(result.dimensionsStable, "Do not reallocate the canvas during zoom");
			assert.ok(result.unchanged, "Zoom must not modify ink");
			assert.ok(result.meanFrameMs < 35, "Complex brush page remains responsive");
			const marker = await p.evaluate(() => window.zoomMarker);
			await p.mouse.move(marker.x, marker.y);
			await p.mouse.down();
			await p.mouse.move(marker.x + 70, marker.y + 10, { steps: 8 });
			await p.mouse.up();
			const stroke = await p.evaluate(() =>
				window.notebook.value.getNotebook().pages[0].layers[0].elements.at(-1),
			);
			assert.ok(
				Math.abs(stroke.points[0].x - 500) < 2 && Math.abs(stroke.points[0].y - 250.5) < 2,
				"Writing after pinch stays in the same world coordinates",
			);
		}
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
