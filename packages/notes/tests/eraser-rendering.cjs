const assert = require("node:assert/strict");
const { chromium, webkit } = require("playwright");
(async () => {
	for (const engine of [chromium, webkit]) {
		const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
		try {
			const p = await browser.newPage();
			await p.goto("http://127.0.0.1:5178/packages/notes/tests/viewer.html");
			await p.locator(".cube-notes__ink-canvas").waitFor();
			const result = await p.evaluate(async () => {
				const { createNotebook } = await import("/packages/notes/src/model.ts");
				const { createPagePainter, pageSvg } = await import(
					"/packages/notes/src/render.ts"
				);
				const { resizeElements } = await import("/packages/notes/src/manipulation.ts");
				const { PathEraser } = await import("/packages/notes/src/eraser.ts");
				const book = createNotebook(),
					page = book.pages[0];
				page.paper = "plain";
				page.color = "#ffffff";
				page.width = 1190;
				let stroke = {
					id: "crossing",
					kind: "stroke",
					tool: "pen",
					penStyle: "ballpoint",
					color: "#2563eb",
					width: 30,
					opacity: 1,
					pressure: false,
					points: [
						{ x: 100, y: 120, pressure: 0.5 },
						{ x: 500, y: 120, pressure: 0.5 },
					],
					erasures: [
						{
							width: 40,
							points: [
								{ x: 200, y: 80 },
								{ x: 300, y: 160 },
								{ x: 200, y: 160 },
								{ x: 300, y: 80 },
							],
						},
					],
				};
				page.layers[0].elements = [stroke];
				const c = document.createElement("canvas");
				c.width = 1190;
				c.height = 842;
				const ctx = c.getContext("2d"),
					paint = createPagePainter();
				const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
				const check = async (x, y, uncut) => {
					paint(ctx, page);
					const direct = { hole: pixel(x, y), ink: pixel(uncut, y) };
					const image = new Image();
					image.src = URL.createObjectURL(
						new Blob([pageSvg(page)], { type: "image/svg+xml" }),
					);
					await image.decode();
					ctx.clearRect(0, 0, 1190, 842);
					ctx.drawImage(image, 0, 0);
					URL.revokeObjectURL(image.src);
					return { direct, svg: { hole: pixel(x, y), ink: pixel(uncut, y) } };
				};
				const crossing = await check(250, 120, 150);
				stroke = structuredClone(stroke);
				page.layers[0].elements = [stroke];
				resizeElements(
					[stroke],
					{ x: 0, y: 0, width: 595, height: 842 },
					{ x: 0, y: 0, width: 1190, height: 421 },
				);
				const resized = await check(500, 60, 300);
				page.layers[0].elements.push({
					...stroke,
					id: "new",
					color: "#ee3322",
					erasures: undefined,
				});
				paint(ctx, page);
				const future = pixel(500, 60);
				// Representative long page: 200 immutable strokes, 16k vector samples.
				const dense = Array.from({ length: 200 }, (_, i) => ({
					id: `dense-${i}`,
					kind: "stroke",
					tool: "pen",
					penStyle: "ballpoint",
					color: "#222b40",
					width: 2,
					opacity: 1,
					pressure: false,
					points: Array.from({ length: 80 }, (_, j) => ({
						x: 20 + j * 6,
						y: 40 + i * 3 + Math.sin(j / 5) * 2,
						pressure: 0.5,
					})),
				}));
				page.layers[0].elements = dense;
				const painter = createPagePainter();
				painter(ctx, page);
				const eraser = new PathEraser(dense, 20),
					times = [];
				for (let i = 0; i < 24; i++) {
					const started = performance.now();
					eraser.add({ x: 230, y: 40 + i * 20 }, { x: 230, y: 60 + i * 20 });
					const preview = {
						...page,
						layers: [
							{
								...page.layers[0],
								elements: dense.map((e) => eraser.updates.get(e.id) ?? e),
							},
						],
					};
					painter(ctx, preview);
					times.push(performance.now() - started);
				}
				return {
					crossing,
					resized,
					future,
					performance: {
						mean: times.reduce((a, b) => a + b, 0) / times.length,
						p95: times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)],
					},
				};
			});
			for (const geometry of [result.crossing, result.resized]) {
				assert.deepEqual(geometry.direct.hole, [255, 255, 255, 255]);
				assert.deepEqual(geometry.direct.ink, [37, 99, 235, 255]);
				assert.deepEqual(geometry.svg, geometry.direct);
			}
			assert.deepEqual(result.future, [238, 51, 34, 255]);
			assert.ok(
				result.performance.p95 < 150,
				`eraser preview p95 ${result.performance.p95.toFixed(1)}ms`,
			);
			console.log(
				`PASS ${engine.name()}: self-crossing union, elliptical transform, future ink; 200-stroke preview mean ${result.performance.mean.toFixed(1)}ms p95 ${result.performance.p95.toFixed(1)}ms`,
			);
		} finally {
			await browser.close();
		}
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
