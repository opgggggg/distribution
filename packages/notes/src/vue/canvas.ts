import {
	computed,
	defineComponent,
	h,
	nextTick,
	onBeforeUnmount,
	onMounted,
	ref,
	shallowRef,
	watch,
	type PropType,
} from "vue";
import {
	bounds,
	contains,
	hitStroke,
	lassoSelect,
	shapePoints,
	translate,
	type Point,
} from "../geometry.js";
import {
	clone,
	pageElements,
	uid,
	type AnchorSide,
	type InkPoint,
	type InkElement,
	type InkStroke,
	type NotePage,
	type PenStyle,
} from "../model.js";
import { paintPage, paintStroke } from "../render.js";
import {
	anchorPoint,
	connectable,
	connectorPoints,
	createConnectedShape,
	nearestSide,
	resizeElements,
	selectionBounds,
	snapMove,
	type Guide,
} from "../manipulation.js";
import { icon } from "./icons.js";

export type NoteTool =
	| "pen"
	| "highlighter"
	| "eraser"
	| "lasso"
	| "hand"
	| "text"
	| "line"
	| "rectangle"
	| "ellipse";
interface Gesture {
	id: number;
	pointerType: string;
	tool: NoteTool | "move" | "resize" | "connect";
	corner?: string;
	dragged?: boolean;
	from?: { id: string; side: AnchorSide };
	resizeBox?: import("../geometry.js").Bounds;
	origin: Point;
	last: Point;
	points: InkPoint[];
	stroke?: InkStroke;
	erased: Set<string>;
}
export const NoteCanvas = defineComponent({
	name: "CubeNoteCanvas",
	props: {
		page: { type: Object as PropType<NotePage>, required: true },
		tool: { type: String as PropType<NoteTool>, default: "pen" },
		color: { type: String, default: "#222b40" },
		width: { type: Number, default: 2 },
		pressure: { type: Boolean, default: true },
		penStyle: { type: String as PropType<PenStyle>, default: "fountain" },
		fingerDraw: Boolean,
		readonly: Boolean,
		zoom: { type: Number, default: 1 },
		snapGrid: Boolean,
		alignGuides: { type: Boolean, default: true },
		locale: { type: String, default: "zh-CN" },
		selected: { type: Array as PropType<string[]>, default: () => [] },
	},
	emits: [
		"add",
		"erase",
		"move",
		"select",
		"text",
		"zoom",
		"gesture",
		"layout",
		"resize",
		"connect",
	],
	setup(props, { emit, expose }) {
		const viewport = ref<HTMLElement>(),
			base = ref<HTMLCanvasElement>(),
			overlay = ref<HTMLCanvasElement>();
		const selection = computed(() =>
			selectionBounds(pageElements(props.page).filter((e) => props.selected.includes(e.id))),
		);
		// Canvas ink and DOM handles must share the same live gesture geometry.
		const preview = shallowRef<InkElement[]>();
		const displayedElements = computed(
			() =>
				preview.value ??
				pageElements(props.page).filter((e) => props.selected.includes(e.id)),
		);
		const displayedSelection = computed(() => selectionBounds(displayedElements.value));
		let guides: Guide[] = [];
		function layout() {
			const paper = overlay.value?.getBoundingClientRect(),
				view = viewport.value?.getBoundingClientRect(),
				b = selection.value;
			if (!paper || !view || !b) return;
			const toolbar = viewport.value
				?.closest(".cube-notes__canvas-stage")
				?.querySelector<HTMLElement>(".cube-notes__selection-bar");
			const width = Math.min(view.width - 16, toolbar?.offsetWidth || 440),
				height = toolbar?.offsetHeight || 54;
			const above = paper.top - view.top + b.y * props.zoom - height - 8;
			emit("layout", {
				x: Math.max(
					8,
					Math.min(
						view.width - width - 8,
						paper.left - view.left + (b.x + b.width / 2) * props.zoom - width / 2,
					),
				),
				y: Math.max(
					8,
					Math.min(
						view.height - height - 8,
						above >= 8
							? above
							: paper.top - view.top + (b.y + b.height) * props.zoom + 8,
					),
				),
			});
		}
		const pointers = new Map<number, Point>();
		let gesture: Gesture | undefined,
			pan: { id: number; x: number; y: number; left: number; top: number } | undefined;
		let pinch: { distance: number; zoom: number } | undefined;
		let renderScale = 1,
			frame = 0,
			zoomGeneration = 0;
		const point = (event: PointerEvent): InkPoint => {
			const box = overlay.value!.getBoundingClientRect();
			return {
				x: Math.max(0, Math.min(props.page.width, (event.clientX - box.left) / props.zoom)),
				y: Math.max(0, Math.min(props.page.height, (event.clientY - box.top) / props.zoom)),
				pressure: event.pointerType === "pen" && event.pressure > 0 ? event.pressure : 0.5,
			};
		};
		function prepare(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
			const ctx = canvas.getContext("2d");
			if (!ctx) return null;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.scale(renderScale, renderScale);
			return ctx;
		}
		function renderBase() {
			if (!base.value) return;
			const ctx = prepare(base.value);
			if (!ctx) return;
			const omit = ["move", "resize"].includes(gesture?.tool ?? "")
				? new Set(props.selected)
				: (gesture?.erased ?? new Set<string>());
			if (["move", "resize"].includes(gesture?.tool ?? "")) {
				for (const e of pageElements(props.page))
					if (
						e.kind === "stroke" &&
						e.connector &&
						[e.connector.from.elementId, e.connector.to.elementId].some((id) =>
							props.selected.includes(id),
						)
					)
						omit.add(e.id);
			}
			paintPage(ctx, props.page, omit);
		}
		function renderOverlay() {
			if (!overlay.value) return;
			const ctx = prepare(overlay.value);
			if (!ctx) return;
			if (gesture?.stroke) paintStroke(ctx, gesture.stroke);
			if (gesture?.tool === "connect" && !guides.length) {
				const source = pageElements(props.page).find((e) => e.id === gesture!.from?.id);
				if (source && connectable(source))
					paintStroke(ctx, {
						...createConnectedShape(source, gesture.last, props.page),
						opacity: 0.28,
					});
			}
			if (gesture?.tool === "lasso") {
				ctx.strokeStyle = "#4f46e5";
				ctx.lineWidth = 1.3 / props.zoom;
				ctx.setLineDash([5 / props.zoom, 4 / props.zoom]);
				ctx.beginPath();
				gesture.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
				ctx.closePath();
				ctx.stroke();
				ctx.setLineDash([]);
			}
			const moving = gesture?.tool === "move";
			const resizing = gesture?.tool === "resize";
			const dx = moving ? gesture!.last.x - gesture!.origin.x : 0,
				dy = moving ? gesture!.last.y - gesture!.origin.y : 0;
			const originals = pageElements(props.page).filter((e) => props.selected.includes(e.id));
			const transformed = clone(originals);
			if (resizing && selection.value && gesture?.resizeBox)
				resizeElements(transformed, selection.value, gesture.resizeBox);
			if (moving) for (const element of transformed) translate(element, dx, dy);
			preview.value = moving || resizing ? transformed : undefined;
			for (const element of transformed) {
				if (moving || resizing) {
					if (element.kind === "stroke") paintStroke(ctx, element);
					else {
						ctx.fillStyle = element.color;
						ctx.font = `${element.size}px sans-serif`;
						element.text
							.split("\n")
							.forEach((line, i) =>
								ctx.fillText(
									line,
									element.x,
									element.y + element.size + i * element.size * 1.35,
								),
							);
					}
				}
				const box = bounds(element);
				ctx.strokeStyle = "#4f46e5";
				ctx.lineWidth = 1.2 / props.zoom;
				ctx.setLineDash([4 / props.zoom, 3 / props.zoom]);
				ctx.strokeRect(box.x - 3, box.y - 3, box.width + 6, box.height + 6);
				ctx.setLineDash([]);
			}
			if (moving || resizing) {
				const byId = new Map(pageElements(props.page).map((e) => [e.id, e]));
				for (const e of transformed) byId.set(e.id, e);
				for (const e of pageElements(props.page))
					if (
						e.kind === "stroke" &&
						e.connector &&
						[e.connector.from.elementId, e.connector.to.elementId].some((id) =>
							props.selected.includes(id),
						)
					) {
						const a = byId.get(e.connector.from.elementId),
							b = byId.get(e.connector.to.elementId);
						if (a && b && connectable(a) && connectable(b))
							paintStroke(ctx, {
								...e,
								points: connectorPoints(
									anchorPoint(a, e.connector.from.side),
									anchorPoint(b, e.connector.to.side),
								),
							});
					}
			}
			ctx.strokeStyle = "#8b5cf6";
			ctx.fillStyle = "#8b5cf6";
			ctx.lineWidth = 1 / props.zoom;
			for (const g of guides) {
				ctx.beginPath();
				ctx.moveTo(
					g.axis === "x" ? g.position : g.start,
					g.axis === "x" ? g.start : g.position,
				);
				ctx.lineTo(
					g.axis === "x" ? g.position : g.end,
					g.axis === "x" ? g.end : g.position,
				);
				ctx.stroke();
				if (g.label) {
					ctx.font = `${11 / props.zoom}px sans-serif`;
					ctx.fillText(g.label, g.start + 4, g.position - 4 / props.zoom);
				}
			}
		}
		function schedule() {
			if (!frame)
				frame = requestAnimationFrame(() => {
					frame = 0;
					if (["eraser", "move", "resize"].includes(gesture?.tool ?? "")) renderBase();
					renderOverlay();
				});
		}
		function resize() {
			renderScale = Math.min(
				(window.devicePixelRatio || 1) * props.zoom,
				4096 / Math.max(props.page.width, props.page.height),
				Math.sqrt(8_000_000 / (props.page.width * props.page.height)),
			);
			for (const canvas of [base.value, overlay.value])
				if (canvas) {
					canvas.width = Math.ceil(props.page.width * renderScale);
					canvas.height = Math.ceil(props.page.height * renderScale);
				}
			renderBase();
			renderOverlay();
			layout();
		}
		function cancel() {
			gesture = undefined;
			guides = [];
			emit("gesture", false);
			renderBase();
			renderOverlay();
		}
		function zoomAround(value: number, center: Point) {
			const before = overlay.value?.getBoundingClientRect();
			if (!before) return;
			const x = (center.x - before.left) / props.zoom,
				y = (center.y - before.top) / props.zoom;
			const token = ++zoomGeneration;
			emit("zoom", value);
			nextTick(() => {
				if (token !== zoomGeneration || !viewport.value || !overlay.value) return;
				const after = overlay.value.getBoundingClientRect();
				viewport.value.scrollLeft += after.left + x * props.zoom - center.x;
				viewport.value.scrollTop += after.top + y * props.zoom - center.y;
			});
		}
		function eraseAt(p: Point) {
			for (const e of pageElements(props.page))
				if (
					e.kind === "stroke" &&
					!gesture?.erased.has(e.id) &&
					hitStroke(e, p, props.width)
				)
					gesture?.erased.add(e.id);
		}
		function down(event: PointerEvent) {
			if (event.pointerType === "mouse" && event.button !== 0) return;
			// Ignore palm contacts while a pen is writing; they must not cancel ink.
			if (event.pointerType === "touch" && gesture?.pointerType === "pen") return;
			if (event.pointerType === "pen") {
				pointers.clear();
				pan = undefined;
				pinch = undefined;
			}
			viewport.value?.focus({ preventScroll: true });
			overlay.value?.setPointerCapture(event.pointerId);
			pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
			if (event.pointerType === "touch" && pointers.size > 1) {
				cancel();
				pan = undefined;
				const [a, b] = Array.from(pointers.values());
				pinch = {
					distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
					zoom: props.zoom,
				};
				return;
			}
			if (gesture) {
				pointers.delete(event.pointerId);
				return;
			}
			if (
				props.readonly ||
				props.tool === "hand" ||
				(event.pointerType === "touch" && !props.fingerDraw)
			) {
				pan = {
					id: event.pointerId,
					x: event.clientX,
					y: event.clientY,
					left: viewport.value!.scrollLeft,
					top: viewport.value!.scrollTop,
				};
				return;
			}
			event.preventDefault();
			let p = point(event);
			if (
				props.snapGrid &&
				!event.altKey &&
				["line", "rectangle", "ellipse"].includes(props.tool)
			)
				p = { ...p, x: Math.round(p.x / 20) * 20, y: Math.round(p.y / 20) * 20 };
			const tool =
				event.button === 5 || (event.pointerType === "pen" && event.buttons & 32)
					? "eraser"
					: props.tool;
			if (tool === "text") {
				const text = pageElements(props.page).find(
					(e) => e.kind === "text" && contains(p, bounds(e)),
				);
				emit("text", p, text);
				return;
			}
			const hit =
				tool === "lasso"
					? [...pageElements(props.page)]
							.reverse()
							.find((e) =>
								e.kind === "text" || connectable(e)
									? contains(p, bounds(e))
									: hitStroke(e, p, 5 / props.zoom),
							)
					: undefined;
			if (hit && !props.selected.includes(hit.id)) emit("select", [hit.id]);
			if (hit?.kind === "stroke" && hit.connector) return;
			const moving =
				tool === "lasso" &&
				Boolean(
					hit ||
						pageElements(props.page).some(
							(e) =>
								props.selected.includes(e.id) &&
								!(e.kind === "stroke" && e.connector) &&
								contains(p, bounds(e)),
						),
				);
			gesture = {
				id: event.pointerId,
				pointerType: event.pointerType,
				tool: moving ? "move" : tool,
				origin: p,
				last: p,
				points: [p],
				erased: new Set(),
			};
			if (tool === "eraser") eraseAt(p);
			else if (tool !== "lasso")
				gesture.stroke = {
					id: uid(),
					kind: "stroke",
					tool: tool === "highlighter" ? "highlighter" : "pen",
					color: props.color,
					width: props.width,
					opacity: tool === "highlighter" ? 0.5 : 1,
					pressure:
						props.pressure &&
						tool === "pen" &&
						props.penStyle !== "ballpoint" &&
						event.pointerType === "pen",
					...(tool === "pen" ? { penStyle: props.penStyle } : {}),
					...(["line", "rectangle", "ellipse"].includes(tool)
						? { shape: tool as "line" | "rectangle" | "ellipse" }
						: {}),
					points: [p],
				};
			if (!moving) emit("select", []);
			emit("gesture", true);
			schedule();
		}
		function move(event: PointerEvent) {
			if (!pointers.has(event.pointerId)) return;
			pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
			if (pinch && pointers.size > 1) {
				const [a, b] = Array.from(pointers.values());
				zoomAround((pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.distance, {
					x: (a.x + b.x) / 2,
					y: (a.y + b.y) / 2,
				});
				return;
			}
			if (pan?.id === event.pointerId) {
				viewport.value!.scrollLeft = pan.left + pan.x - event.clientX;
				viewport.value!.scrollTop = pan.top + pan.y - event.clientY;
				return;
			}
			if (!gesture || gesture.id !== event.pointerId) return;
			const events =
				typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
			for (const sample of events.length ? events : [event]) {
				let p = point(sample);
				if (gesture.tool === "move") {
					// A tap selects without applying nearby alignment/grid corrections.
					if (
						!gesture.dragged &&
						Math.hypot(p.x - gesture.origin.x, p.y - gesture.origin.y) < 3 / props.zoom
					) {
						gesture.last = gesture.origin;
						guides = [];
						continue;
					}
					gesture.dragged = true;
					const snap = snapMove(
						props.page,
						props.selected,
						p.x - gesture.origin.x,
						p.y - gesture.origin.y,
						6 / props.zoom,
						props.snapGrid && !event.altKey,
						props.alignGuides && !event.altKey,
					);
					p = { ...p, x: gesture.origin.x + snap.dx, y: gesture.origin.y + snap.dy };
					guides = snap.guides;
				} else if (gesture.tool === "resize" && selection.value) {
					const b = selection.value,
						c = gesture.corner!,
						fixed = {
							x: c.includes("w") ? b.x + b.width : b.x,
							y: c.includes("n") ? b.y + b.height : b.y,
						};
					let w = Math.max(12, c.includes("w") ? fixed.x - p.x : p.x - fixed.x),
						h = Math.max(12, c.includes("n") ? fixed.y - p.y : p.y - fixed.y);
					if (event.shiftKey) {
						const ratio = Math.max(w / b.width, h / b.height);
						w = b.width * ratio;
						h = b.height * ratio;
					}
					w = Math.min(w, c.includes("w") ? fixed.x : props.page.width - fixed.x);
					h = Math.min(h, c.includes("n") ? fixed.y : props.page.height - fixed.y);
					gesture.resizeBox = {
						x: c.includes("w") ? fixed.x - w : fixed.x,
						y: c.includes("n") ? fixed.y - h : fixed.y,
						width: w,
						height: h,
					};
				} else if (gesture.tool === "connect") {
					const target = [...pageElements(props.page)]
						.reverse()
						.find(
							(e) =>
								e.id !== gesture!.from?.id &&
								connectable(e) &&
								contains(p, bounds(e)),
						);
					if (target && connectable(target)) {
						p = { ...p, ...anchorPoint(target, nearestSide(target, p)) };
						const b = bounds(target);
						guides = [
							{ axis: "x", position: b.x, start: b.y, end: b.y + b.height },
							{ axis: "x", position: b.x + b.width, start: b.y, end: b.y + b.height },
							{ axis: "y", position: b.y, start: b.x, end: b.x + b.width },
							{ axis: "y", position: b.y + b.height, start: b.x, end: b.x + b.width },
						];
					} else {
						guides = [];
						if (props.snapGrid && !event.altKey)
							p = {
								...p,
								x: Math.round(p.x / 20) * 20,
								y: Math.round(p.y / 20) * 20,
							};
					}
					gesture.stroke!.points = connectorPoints(gesture.origin, p);
				} else if (
					["line", "rectangle", "ellipse"].includes(gesture.tool) &&
					props.snapGrid &&
					!event.altKey
				) {
					p = { ...p, x: Math.round(p.x / 20) * 20, y: Math.round(p.y / 20) * 20 };
				}
				gesture.last = p;
				if (gesture.tool === "eraser") {
					// Interpolate across sparse events so fast erasing cannot skip a stroke.
					const previous = gesture.points.at(-1)!;
					const steps = Math.ceil(
						Math.hypot(p.x - previous.x, p.y - previous.y) / Math.max(1, props.width),
					);
					for (let i = 0; i <= steps; i++) {
						const t = steps ? i / steps : 1;
						eraseAt({
							x: previous.x + (p.x - previous.x) * t,
							y: previous.y + (p.y - previous.y) * t,
						});
					}
					gesture.points = [p];
				} else if (["line", "rectangle", "ellipse"].includes(gesture.tool)) {
					gesture.stroke!.points = shapePoints(
						gesture.tool as "line" | "rectangle" | "ellipse",
						gesture.origin,
						p,
					);
				} else if (!["move", "resize", "connect"].includes(gesture.tool)) {
					const previous = gesture.points.at(-1)!;
					if (
						Math.hypot(p.x - previous.x, p.y - previous.y) >= 0.25 &&
						gesture.points.length < 50000
					)
						gesture.points.push(p);
					if (gesture.stroke) gesture.stroke.points = gesture.points;
				}
			}
			schedule();
		}
		function up(event: PointerEvent) {
			if (gesture?.id === event.pointerId) {
				move(event);
				const done = gesture;
				gesture = undefined;
				if (done.tool === "eraser") emit("erase", Array.from(done.erased));
				else if (done.tool === "lasso") {
					const elements = pageElements(props.page);
					const ids = lassoSelect(elements, done.points);
					if (
						done.points.every(
							(p) =>
								Math.hypot(p.x - done.origin.x, p.y - done.origin.y) <
								4 / props.zoom,
						)
					) {
						const hit = [...elements]
							.reverse()
							.find((e) =>
								e.kind === "stroke"
									? connectable(e)
										? contains(done.origin, bounds(e))
										: hitStroke(e, done.origin, 5 / props.zoom)
									: contains(done.origin, bounds(e)),
							);
						emit("select", hit ? [hit.id] : []);
					} else emit("select", ids);
				} else if (done.tool === "move")
					emit("move", done.last.x - done.origin.x, done.last.y - done.origin.y);
				else if (done.tool === "resize" && done.resizeBox) emit("resize", done.resizeBox);
				else if (
					done.tool === "connect" &&
					done.from &&
					Math.hypot(done.last.x - done.origin.x, done.last.y - done.origin.y) > 12
				) {
					const hit = [...pageElements(props.page)]
						.reverse()
						.find(
							(e) =>
								e.id !== done.from!.id &&
								connectable(e) &&
								contains(done.last, bounds(e)),
						);
					emit("connect", done.from.id, done.from.side, done.last, hit?.id);
				} else if (done.stroke) emit("add", done.stroke);
				guides = [];
				emit("gesture", false);
				nextTick(() => {
					renderBase();
					renderOverlay();
				});
			}
			pointers.delete(event.pointerId);
			if (pointers.size < 2) pinch = undefined;
			if (pan?.id === event.pointerId) pan = undefined;
			if (overlay.value?.hasPointerCapture(event.pointerId))
				overlay.value.releasePointerCapture(event.pointerId);
		}
		function pointerCancel(event: PointerEvent) {
			if (gesture?.id === event.pointerId) cancel();
			pointers.delete(event.pointerId);
			pinch = undefined;
			pan = undefined;
		}
		watch(
			() => [props.page, props.zoom],
			() => {
				cancel();
				resize();
			},
			{ flush: "post" },
		);
		watch(
			() => props.selected,
			() => {
				renderOverlay();
				layout();
			},
			{ flush: "post" },
		);
		watch(() => [props.tool, props.readonly], cancel);
		onMounted(resize);
		onBeforeUnmount(() => {
			if (frame) cancelAnimationFrame(frame);
		});
		function beginHandle(event: PointerEvent, mode: "resize" | "connect", value: string) {
			if (props.readonly || !selection.value || gesture) return;
			event.preventDefault();
			event.stopPropagation();
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
			pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
			const p = point(event);
			gesture = {
				id: event.pointerId,
				pointerType: event.pointerType,
				tool: mode,
				origin: p,
				last: p,
				points: [p],
				erased: new Set(),
				corner: value,
			};
			if (mode === "connect") {
				const source = pageElements(props.page).find((e) => e.id === props.selected[0]);
				if (!source || !connectable(source)) {
					cancel();
					return;
				}
				gesture.from = { id: source.id, side: value as AnchorSide };
				gesture.origin = anchorPoint(source, value as AnchorSide);
				gesture.stroke = {
					id: uid(),
					kind: "stroke",
					tool: "pen",
					width: source.width,
					color: source.color,
					opacity: 1,
					pressure: false,
					points: connectorPoints(gesture.origin, p),
				};
			}
			emit("gesture", true);
			schedule();
		}
		function viewBounds() {
			const paper = overlay.value!.getBoundingClientRect(),
				view = viewport.value!.getBoundingClientRect();
			const x = Math.max(0, (view.left - paper.left) / props.zoom),
				y = Math.max(0, (view.top - paper.top) / props.zoom);
			return {
				x,
				y,
				width: Math.max(1, Math.min(props.page.width - x, view.width / props.zoom)),
				height: Math.max(1, Math.min(props.page.height - y, view.height / props.zoom)),
			};
		}
		function focusView(b: import("../geometry.js").Bounds) {
			const view = viewport.value;
			if (!view) return;
			const zoom = Math.max(
				0.25,
				Math.min(4, (view.clientWidth - 32) / b.width, (view.clientHeight - 32) / b.height),
			);
			emit("zoom", zoom);
			nextTick(() => {
				const paper = overlay.value!.getBoundingClientRect(),
					v = view.getBoundingClientRect();
				view.scrollLeft += paper.left - v.left + b.x * zoom - 16;
				view.scrollTop += paper.top - v.top + b.y * zoom - 16;
				layout();
			});
		}
		expose({ cancel, viewport, canvas: base, viewBounds, focusView });
		return () =>
			h(
				"div",
				{
					class: "cube-notes__viewport",
					ref: viewport,
					onScroll: layout,
					tabindex: 0,
					"aria-label": "Notebook paper. Use the toolbar to write, select or navigate.",
					onWheel: (e: WheelEvent) => {
						if (e.ctrlKey || e.metaKey) {
							e.preventDefault();
							zoomAround(props.zoom * Math.exp(-e.deltaY * 0.002), {
								x: e.clientX,
								y: e.clientY,
							});
						}
					},
				},
				h(
					"div",
					{ class: "cube-notes__paper-space" },
					h(
						"div",
						{
							class: "cube-notes__paper",
							style: {
								width: `${props.page.width * props.zoom}px`,
								height: `${props.page.height * props.zoom}px`,
							},
						},
						[
							h("canvas", {
								class: "cube-notes__paper-canvas",
								ref: base,
								"aria-hidden": "true",
							}),
							h("canvas", {
								class: "cube-notes__ink-canvas",
								ref: overlay,
								"aria-label": "Handwriting canvas",
								style: {
									cursor:
										props.readonly || props.tool === "hand"
											? "grab"
											: props.tool === "text"
												? "text"
												: "crosshair",
								},
								onPointerdown: down,
								onPointermove: move,
								onPointerup: up,
								onPointercancel: pointerCancel,
								onLostpointercapture: pointerCancel,
								onContextmenu: (e: Event) => e.preventDefault(),
							}),
							...(!props.readonly &&
							props.tool === "lasso" &&
							selection.value &&
							pageElements(props.page).some(
								(e) =>
									props.selected.includes(e.id) &&
									!(e.kind === "stroke" && e.connector),
							)
								? [
										...["nw", "ne", "sw", "se"].map((c) =>
											h(
												"button",
												{
													type: "button",
													class: "cube-notes__resize-handle",
													draggable: false,
													onPointermove: move,
													onPointerup: up,
													onPointercancel: pointerCancel,
													onLostpointercapture: pointerCancel,
													onDragstart: (e: DragEvent) =>
														e.preventDefault(),
													"aria-label": `${props.locale.startsWith("zh") ? "缩放选中内容" : "Resize selection"} ${c}`,
													"data-resize": c,
													style: {
														left: `${(displayedSelection.value!.x + (c.includes("e") ? displayedSelection.value!.width : 0)) * props.zoom}px`,
														top: `${(displayedSelection.value!.y + (c.includes("s") ? displayedSelection.value!.height : 0)) * props.zoom}px`,
														cursor: `${c}-resize`,
													},
													onPointerdown: (e: PointerEvent) =>
														beginHandle(e, "resize", c),
												},
												h("span"),
											),
										),
										...(props.selected.length === 1 &&
										pageElements(props.page).some(
											(e) => e.id === props.selected[0] && connectable(e),
										)
											? (
													[
														"top",
														"right",
														"bottom",
														"left",
													] as AnchorSide[]
												).map((side) => {
													const source = displayedElements.value.find(
															(e) => e.id === props.selected[0],
														) as InkStroke,
														point = anchorPoint(source, side);
													return h(
														"button",
														{
															type: "button",
															class: `cube-notes__connect-handle side-${side}`,
															draggable: false,
															onPointermove: move,
															onPointerup: up,
															onPointercancel: pointerCancel,
															onLostpointercapture: pointerCancel,
															onDragstart: (e: DragEvent) =>
																e.preventDefault(),
															"aria-label": `${props.locale.startsWith("zh") ? "拖出连接线" : "Drag connection"} ${side}`,
															"data-connect": side,
															style: {
																left: `${point.x * props.zoom}px`,
																top: `${point.y * props.zoom}px`,
															},
															onPointerdown: (e: PointerEvent) =>
																beginHandle(e, "connect", side),
														},
														icon(
															side === "top"
																? "up"
																: side === "bottom"
																	? "down"
																	: side,
														),
													);
												})
											: []),
									]
								: []),
						],
					),
				),
			);
	},
});
