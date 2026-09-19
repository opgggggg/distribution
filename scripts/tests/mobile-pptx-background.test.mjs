import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// Execute the production gesture handlers with a controlled DOM and clock, so
// assertions can inspect the viewport before the 190 ms settling timer fires.
const app = readFileSync(new URL("../../apps/harmony/web/src/App.vue", import.meta.url), "utf8");
const script = app.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
const source = ts.createSourceFile("App.ts", script, ts.ScriptTarget.Latest, true);
const names = new Set([
	"syncMobilePptxBackground",
	"syncMobilePptxZoomLabel",
	"prepareMobilePptxSlideDrag",
	"setMobilePptxSlideDragOffset",
	"clearMobilePptxSlideDrag",
	"settleMobilePptxSlideDrag",
	"stepMobilePptxSlide",
	"cancelMobilePptxSwipe",
]);
const handlers = source.statements.filter(
	(node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text),
);
const code = ts.transpileModule(handlers.map((node) => node.getText(source)).join("\n"), {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function setup(index = 1, reducedMotion = false) {
	const frames = ["rgb(180, 30, 20)", "rgb(20, 50, 180)", "rgba(0, 0, 0, 0)"].map((color, i) => {
		const attributes = new Map([["aria-hidden", String(i !== index)]]);
		return {
			dataset: { editorActiveSlide: String(i === index) },
			hidden: i !== index,
			classList: { add() {}, remove() {}, toggle() {} },
			style: { setProperty() {}, removeProperty() {} },
			getAttribute: (name) => attributes.get(name) ?? null,
			setAttribute: (name, value) => attributes.set(name, value),
			removeAttribute: (name) => attributes.delete(name),
			getBoundingClientRect: () => ({ width: 800, left: 0, top: 0, height: 450 }),
			querySelector: () => ({ backgroundColor: color }),
		};
	});
	const timers = [];
	const clicks = [];
	let context;
	const surface = {
		querySelectorAll: () => frames,
		querySelector: (selector) => {
			if (!selector.includes("aria-label"))
				return frames.find((f) => f.dataset.editorActiveSlide === "true");
			const direction = selector.includes("Previous") || selector.includes("上一") ? -1 : 1;
			const current = frames.findIndex((f) => f.dataset.editorActiveSlide === "true");
			return {
				disabled: !frames[current + direction],
				click() {
					clicks.push(context.mobilePptxBackground.value);
					frames[current].dataset.editorActiveSlide = "false";
					frames[current + direction].dataset.editorActiveSlide = "true";
				},
			};
		},
	};
	context = vm.createContext({
		activeDocumentSurface: () => surface,
		getComputedStyle: (slide) => slide,
		mobilePptxBackground: { value: "unset" },
		mobilePptxZoomLabel: { value: "" },
		mobilePptxZoomControls: () => null,
		mobilePptxGesture: undefined,
		mobilePptxSlideSettling: false,
		mobilePptxSettlingDrag: undefined,
		mobilePptxSlideSettleToken: 0,
		animateMobilePptxSlideEntry() {},
		CSS: { escape: (text) => text },
		window: {
			matchMedia: () => ({ matches: reducedMotion }),
			setTimeout: (fn, delay) => timers.push({ fn, delay }),
		},
	});
	vm.runInContext(code, context);
	context.syncMobilePptxZoomLabel();
	return {
		context,
		frames,
		timers,
		clicks,
		drag(direction) {
			const gesture = { viewport: { clientWidth: 1000 }, pointers: new Map([[1, {}]]) };
			gesture.slideDrag = context.prepareMobilePptxSlideDrag(gesture, direction);
			context.mobilePptxGesture = gesture;
			return gesture.slideDrag;
		},
	};
}

test("destination fills the viewport on first drag, before active slide changes", () => {
	const h = setup();
	h.drag("previous");
	assert.equal(h.context.mobilePptxBackground.value, "rgb(180, 30, 20)");
	assert.equal(h.frames[1].dataset.editorActiveSlide, "true");
	h.context.syncMobilePptxZoomLabel();
	assert.equal(
		h.context.mobilePptxBackground.value,
		"rgb(180, 30, 20)",
		"zoom observer preserves preview",
	);
});

test("committed transition preserves destination before and after timer", () => {
	for (const reduced of [false, true]) {
		const h = setup(1, reduced);
		const drag = h.drag("previous");
		h.context.mobilePptxGesture = undefined;
		h.context.settleMobilePptxSlideDrag(drag, true);
		h.context.syncMobilePptxZoomLabel();
		assert.equal(h.context.mobilePptxBackground.value, "rgb(180, 30, 20)");
		assert.equal(h.frames[1].dataset.editorActiveSlide, "true");
		assert.equal(h.timers[0].delay, reduced ? 0 : 190);
		h.timers[0].fn();
		assert.equal(h.frames[0].dataset.editorActiveSlide, "true");
		assert.equal(h.context.mobilePptxBackground.value, "rgb(180, 30, 20)");
	}
});

test("short swipe restores outgoing background before rollback animation", () => {
	const h = setup();
	const drag = h.drag("previous");
	h.context.mobilePptxGesture = undefined;
	h.context.settleMobilePptxSlideDrag(drag, false);
	assert.equal(h.context.mobilePptxBackground.value, "rgb(20, 50, 180)");
	h.timers[0].fn();
	assert.equal(h.frames[0].hidden, true);
	assert.equal(h.frames[0].getAttribute("aria-hidden"), "true");
	assert.equal(h.frames[1].dataset.editorActiveSlide, "true");
});

test("pointer cancellation and pinch cleanup restore original background", () => {
	const h = setup();
	h.drag("previous");
	h.context.cancelMobilePptxSwipe({ pointerId: 1 });
	assert.equal(h.context.mobilePptxBackground.value, "rgb(20, 50, 180)");
	const drag = h.drag("next");
	h.context.clearMobilePptxSlideDrag(drag);
	assert.equal(h.context.mobilePptxBackground.value, "rgb(20, 50, 180)");
});

test("reversing a drag previews the other destination with transparent fallback", () => {
	const h = setup();
	const drag = h.drag("previous");
	h.context.clearMobilePptxSlideDrag(drag);
	h.drag("next");
	assert.equal(h.context.mobilePptxBackground.value, "#ffffff");
});

test("first/last slide overscroll retains current background", () => {
	for (const [index, direction, color] of [
		[0, "previous", "rgb(180, 30, 20)"],
		[2, "next", "#ffffff"],
	]) {
		const h = setup(index);
		h.drag(direction);
		assert.equal(h.context.mobilePptxBackground.value, color);
	}
});

test("navigation buttons update background before selecting the next/previous slide", () => {
	const h = setup();
	h.context.stepMobilePptxSlide("previous");
	assert.equal(h.clicks[0], "rgb(180, 30, 20)");
	h.context.stepMobilePptxSlide("next");
	assert.equal(h.clicks[1], "rgb(20, 50, 180)");
	h.context.stepMobilePptxSlide("next");
	assert.equal(h.clicks[2], "#ffffff");
	h.context.stepMobilePptxSlide("next");
	assert.equal(h.clicks.length, 3, "disabled boundary button does not navigate");
});
