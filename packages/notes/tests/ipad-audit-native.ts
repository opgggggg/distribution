import { viewerRoot } from "./viewer.ts";
import { createNotebook, uid, type InkStroke, type PenStyle } from "../src/model.js";
import { writeNotebook } from "../src/codec.js";

// Runs in an isolated, signed WKWebView test host. Never opens a user's notebook.
viewerRoot.$el.setAttribute("data-ipad-audit", "true");
const w = window as any;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const raf = () => new Promise(requestAnimationFrame);
const report = (value: unknown) => w.webkit?.messageHandlers?.audit?.postMessage(value);
const stats = (frames: number[]) => {
	const sorted = [...frames].sort((a, b) => a - b);
	return {
		meanMs: frames.reduce((a, b) => a + b, 0) / frames.length,
		p95Ms: sorted[Math.floor((sorted.length - 1) * 0.95)],
		maxMs: Math.max(...frames),
	};
};

(async () => {
	try {
		for (let i = 0; i < 100 && !w.notebook?.value; i++) await wait(50);
		const book = createNotebook("iPad UI/UX audit", true);
		const styles: PenStyle[] = ["brush", "watercolor", "pencil", "crayon", "spray", "oil"];
		book.pages[0].layers[0].elements = Array.from(
			{ length: 96 },
			(_, i): InkStroke => ({
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
					x: 60 + j * 7,
					y: 70 + (i % 18) * 28 + Math.sin(j / 7 + i) * 12,
					pressure: 0.4 + (j % 12) / 20,
				})),
			}),
		);
		w.noteSource.value = writeNotebook(book);
		for (let i = 0; i < 100; i++) {
			try {
				if (w.notebook.value.getNotebook().pages[0].layers[0].elements.length === 96) break;
			} catch {}
			await wait(50);
		}
		await wait(400);
		const canvas = document.querySelector<HTMLCanvasElement>(".cube-notes__ink-canvas")!;
		const base = document.querySelector<HTMLCanvasElement>(".cube-notes__paper-canvas")!;
		const box = canvas.getBoundingClientRect();
		const touch = (id: number, x: number, y: number) => ({
			identifier: id,
			target: canvas,
			clientX: x,
			clientY: y,
		});
		const send = (type: string, touches: ReturnType<typeof touch>[], changed = touches) => {
			const event = new Event(type, { bubbles: true, cancelable: true });
			Object.defineProperties(event, {
				touches: { value: touches },
				targetTouches: { value: touches },
				changedTouches: { value: changed },
			});
			canvas.dispatchEvent(event);
		};
		const prototype = CanvasRenderingContext2D.prototype,
			clear = prototype.clearRect;
		let paints = 0;
		prototype.clearRect = function (...args: Parameters<typeof clear>) {
			if (this.canvas === base) paints++;
			return clear.apply(this, args);
		};
		const results: Record<string, unknown> = {
			viewport: [innerWidth, innerHeight],
			dpr: devicePixelRatio,
			canvasPixels: base.width * base.height,
			twoCanvasBufferMiB:
				((base.width * base.height + canvas.width * canvas.height) * 4) / 1024 / 1024,
		};
		const run = async (name: string, pinch = false, steps = 24) => {
			paints = 0;
			let a = touch(11, box.left + 240, box.top + 260),
				b = touch(12, box.left + 400, box.top + 260);
			send("touchstart", pinch ? [a, b] : [a]);
			await raf();
			paints = 0;
			const frames: number[] = [];
			let previous = performance.now();
			for (let i = 1; i <= steps; i++) {
				a = touch(
					11,
					box.left + 240 + (pinch ? -3 : 5) * i,
					box.top + 260 + Math.sin(i / 3) * 20,
				);
				b = touch(12, box.left + 400 + 3 * i, a.clientY);
				send("touchmove", pinch ? [a, b] : [a]);
				await raf();
				const now = performance.now();
				frames.push(now - previous);
				previous = now;
			}
			const during = paints,
				end = performance.now();
			send("touchend", [], pinch ? [a, b] : [a]);
			await raf();
			await raf();
			results[name] = {
				...stats(frames),
				fullPaintsDuring: during,
				fullPaintsAfter: paints,
				releaseMs: performance.now() - end,
			};
			report({ phase: name, ...results });
			await wait(100);
		};
		await run("drawing");
		const afterDraw = w.notebook.value.getNotebook().pages[0].layers[0].elements.length;
		w.notebook.value.undo();
		await wait(100);
		const afterUndo = w.notebook.value.getNotebook().pages[0].layers[0].elements.length;
		w.notebook.value.redo();
		await wait(100);
		results.undoRedo =
			afterDraw === 97 &&
			afterUndo === 96 &&
			w.notebook.value.getNotebook().pages[0].layers[0].elements.length === 97;
		w.noteReadonly.value = true;
		await wait(100);
		const readonlyBefore = JSON.stringify(w.notebook.value.getNotebook());
		await run("pan");
		await run("longPan", false, 72);
		await run("pinch", true);
		results.readonlyUnchanged =
			readonlyBefore === JSON.stringify(w.notebook.value.getNotebook());
		results.readonlyTrayHidden = !document.querySelector(".cube-notes__tool-tray");
		w.notebook.value.togglePages();
		await wait(100);
		results.readonlyPages = !!document.querySelector(".cube-notes__sidebar");
		w.notebook.value.togglePages();
		w.noteReadonly.value = false;
		await wait(100);
		const tray = document.querySelector<HTMLElement>(".cube-notes__tool-tray")!,
			trayBox = tray.getBoundingClientRect();
		results.trayInsideViewport =
			trayBox.left >= 0 && trayBox.right <= innerWidth && trayBox.bottom <= innerHeight;
		results.penTypes = tray.querySelectorAll("[data-pen-style]").length;
		results.smallTargets = [...tray.querySelectorAll<HTMLElement>("button")]
			.filter((e) => e.offsetWidth < 44 || e.offsetHeight < 44)
			.map((e) => e.getAttribute("aria-label"));
		tray.querySelector<HTMLButtonElement>('[data-tray-action="colors"]')!.click();
		await wait(150);
		results.nativeColorInput = !!document.querySelector('input[type="color"]');
		document.querySelector<HTMLButtonElement>(".cube-notes__popover footer button")?.click();
		await wait(100);
		const selected = tray.querySelector<HTMLButtonElement>(
			'[data-pen-style][aria-pressed="true"]',
		)!;
		selected.click();
		await wait(100);
		const menu = document
			.querySelector<HTMLElement>(".cube-notes__popover")
			?.getBoundingClientRect();
		results.settingsInsideViewport =
			!!menu &&
			menu.top >= 0 &&
			menu.bottom <= innerHeight &&
			menu.left >= 0 &&
			menu.right <= innerWidth;
		document.querySelector<HTMLButtonElement>(".cube-notes__popover footer button")?.click();
		prototype.clearRect = clear;
		w.ipadAuditResult = results;
		report({ phase: "complete", ...results });
	} catch (error) {
		report({ phase: "error", error: String(error), stack: (error as Error).stack });
	}
})();
