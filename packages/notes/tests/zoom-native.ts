import { viewerRoot } from "./viewer.ts";
viewerRoot.$el.setAttribute("data-zoom-benchmark", "true");
import { createNotebook, uid } from "../src/model.js";
import { writeNotebook } from "../src/codec.js";
const w = window as any,
	wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
(async () => {
	try {
		for (let i = 0; i < 200 && !w.notebook?.value; i++) await wait(50);
		const book = createNotebook("iPad zoom stress", true),
			styles = ["brush", "watercolor", "pencil", "crayon", "spray", "oil"];
		book.pages[0].layers[0].elements = Array.from({ length: 96 }, (_, i) => ({
			kind: "stroke" as const,
			id: uid(),
			tool: "pen" as const,
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
		w.noteSource.value = writeNotebook(book);
		const loaded = () => {
			try {
				return w.notebook.value.getNotebook().pages[0].layers[0].elements.length === 96;
			} catch {
				return false;
			}
		};
		for (let i = 0; i < 100 && !loaded(); i++) await wait(50);
		if (!loaded()) throw Error("Benchmark notebook did not load");
		await wait(300);
		const c = document.querySelector<HTMLCanvasElement>(".cube-notes__ink-canvas")!,
			base = document.querySelector<HTMLCanvasElement>(".cube-notes__paper-canvas")!,
			box = c.getBoundingClientRect(),
			before = JSON.stringify(w.notebook.value.getNotebook());
		const prototype = CanvasRenderingContext2D.prototype,
			clear = prototype.clearRect;
		let redraws = 0;
		prototype.clearRect = function (...args: Parameters<typeof clear>) {
			if (this.canvas === base) redraws++;
			return clear.apply(this, args);
		};
		const touch = (id: number, x: number, y: number) => ({
			identifier: id,
			target: c,
			clientX: x,
			clientY: y,
		});
		const send = (type: string, active: ReturnType<typeof touch>[], changed = active) => {
			const event = new Event(type, { bubbles: true, cancelable: true });
			Object.defineProperties(event, {
				touches: { value: active },
				targetTouches: { value: active },
				changedTouches: { value: changed },
			});
			c.dispatchEvent(event);
		};
		const x = box.left + box.width / 2,
			y = box.top + 200;
		let a = touch(1, x - 80, y),
			b = touch(2, x + 80, y);
		send("touchstart", [a, b]);
		await new Promise(requestAnimationFrame);
		redraws = 0;
		const frames: number[] = [];
		let previous = performance.now();
		for (let i = 1; i <= 24; i++) {
			a = touch(1, x - 80 - i * 3, y + i);
			b = touch(2, x + 80 + i * 3, y + i);
			send("touchmove", [a, b]);
			await new Promise(requestAnimationFrame);
			const now = performance.now();
			frames.push(now - previous);
			previous = now;
		}
		await new Promise(requestAnimationFrame);
		const during = redraws;
		send("touchend", [], [a, b]);
		await wait(300);
		prototype.clearRect = clear;
		const result = {
			pass:
				during === 0 &&
				redraws <= 2 &&
				JSON.stringify(w.notebook.value.getNotebook()) === before,
			during,
			after: redraws,
			meanFrameMs: frames.reduce((a, b) => a + b) / frames.length,
			maxFrameMs: Math.max(...frames),
		};
		w.zoomResult = result;
		w.webkit?.messageHandlers?.zoom?.postMessage(result);
	} catch (error) {
		const result = { pass: false, error: String(error) };
		w.zoomResult = result;
		w.webkit?.messageHandlers?.zoom?.postMessage(result);
	}
})();
