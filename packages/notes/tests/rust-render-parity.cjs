const assert = require("node:assert/strict");
const { chromium, webkit } = require("playwright");
(async () => {
	for (const engine of [chromium, webkit]) {
		const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
		try {
			const p = await browser.newPage({ viewport: { width: 744, height: 1133 } });
			const errors = [];
			p.on("pageerror", (e) => errors.push(e.message));
			await p.goto("http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1");
			await p.locator('.cube-notes[data-kernel="rust"] .cube-notes__ink-canvas').waitFor();
			const result = await p.evaluate(async () => {
				const { createNotebook } = await import("/packages/notes/src/model.ts");
				const { listBrushPlugins } = await import("/packages/notes/src/brushes.ts");
				const { RustNoteHistory } = await import("/packages/notes/src/kernel/history.ts");
				const { exportNotesPagePng } = await import("/packages/notes/src/image.ts");
				const { pageSvg } = await import("/packages/notes/src/render.ts");
				const { NotesRustKernel } = await import("/packages/notes/src/kernel/runtime.ts");
				const { compileNotesKernel } = await import("/packages/notes/src/kernel/loader.ts");
				const book = createNotebook("Rendering parity"),
					page = book.pages[0];
				const photo = document.createElement("canvas");
				photo.width = photo.height = 20;
				const context = photo.getContext("2d");
				context.fillStyle = "#1a4ce0";
				context.fillRect(0, 0, 20, 20);
				page.background = {
					id: "reference",
					kind: "image",
					src: photo.toDataURL(),
					x: 20,
					y: 650,
					width: 100,
					height: 80,
					opacity: 0.3,
					angle: 25,
				};
				const brushes = listBrushPlugins();
				for (const [i, b] of brushes.entries())
					page.layers[0].elements.push({
						id: `stroke-${b.id}`,
						kind: "stroke",
						tool: "pen",
						penStyle: b.id,
						brushVersion: b.version ?? 1,
						brushSeed: 12345,
						brushSettings: Object.fromEntries(
							(b.parameters ?? []).map((p) => [p.id, p.default]),
						),
						color: b.defaults.color,
						width: b.defaults.width,
						pressure: true,
						opacity: 0.7,
						points: Array.from({ length: 31 }, (_, j) => ({
							x: 80 + j * 10,
							y: 60 + i * 50 + Math.sin(j / 5) * 12,
							pressure: 0.1 + j / 40,
						})),
						erasures: [
							{
								width: 5,
								points: [
									{ x: 200, y: 40 + i * 50 },
									{ x: 200, y: 80 + i * 50 },
								],
							},
						],
					});
				page.layers[0].elements.push({
					id: "highlighter-preview", kind: "stroke", tool: "highlighter", color: "#facc15", width: 20,
					opacity: 0.3, pressure: false, points: [{x:150,y:740,pressure:0.5},{x:480,y:755,pressure:0.5}],
					erasures: [{width:12,points:[{x:300,y:700},{x:300,y:790}]}],
				});
				const hash = async (blob) =>
					Array.from(
						new Uint8Array(
							await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
						),
					).join(",");
				const before = await hash(await exportNotesPagePng(page));
				const core = new NotesRustKernel(await compileNotesKernel());
				core.request({ op: "init", document: book });
				const scene = core.request({ op: "pageSvg", pageId: page.id }).svg;
				const raster = async (svg) => {
					const image = new Image(),
						url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
					try {
						image.src = url;
						await image.decode();
						const canvas = document.createElement("canvas");
						canvas.width = 600;
						canvas.height = 850;
						const ctx = canvas.getContext("2d");
						ctx.drawImage(image, 0, 0, 600, 850);
						return ctx.getImageData(0, 0, 600, 850).data;
					} finally {
						URL.revokeObjectURL(url);
					}
				};
				const legacy = await raster(pageSvg(page)),
					native = await raster(scene);
				let changed = 0;
				for (let i = 0; i < legacy.length; i += 4)
					if ([0, 1, 2, 3].some((c) => Math.abs(legacy[i + c] - native[i + c]) > 2))
						changed++;
				if (changed / (600 * 850) > 0.001)
					throw Error(`Rust scene raster differs at ${changed} pixels`);
				core.close();
				const history = await RustNoteHistory.create(book);
				const bytes = new Uint8Array(await (await history.exportNotebook()).arrayBuffer());
				const restored = await RustNoteHistory.open(bytes);
				if (JSON.stringify(restored.document.pages) !== JSON.stringify(book.pages))
					throw Error("Rust changed visual document data");
				const after = await hash(await exportNotesPagePng(restored.document.pages[0]));
				const id = page.id, originalCount = page.layers[0].elements.length;
				history.commitPage(id, (p) => {
					p.layers[0].elements.pop();
				});
				history.undo();
				const undone = await hash(await exportNotesPagePng(history.document.pages[0]));
				history.redo();
				if (history.document.pages[0].layers[0].elements.length !== originalCount - 1)
					throw Error("Rust redo failed");
				history.close();
				restored.close();
				return {
					before,
					after,
					undone,
					brushes: brushes.length,
					sceneChangedPixels: changed,
				};
			});
			assert.equal(
				result.before,
				result.after,
				"Rust file roundtrip must preserve PNG pixels",
			);
			assert.equal(result.before, result.undone, "Rust undo must preserve PNG pixels");
			assert.deepEqual(errors, []);
			console.log(
				`${engine.name()}: ${result.brushes} brushes, highlighter, photo background, path erasures, PNG roundtrip and undo pixel parity passed; Rust scene changed ${result.sceneChangedPixels}/510000 pixels`,
			);
		} finally {
			await browser.close();
		}
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
