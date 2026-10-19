import { BackgroundOverlay } from "./background-overlay.js";
import {
	rotatedSize,
	rotateVector,
	rotateLocal,
	unrotateLocal,
	paperRotation,
	pointBounds,
} from "../view-rotation.js";
import { captureNotesBoardPreview } from "../thumbnail.js";
import { isInfinitePage, worldCoordinate } from "../board.js";
import { tapePolygon } from "../masking.js";
import { TapeOverlay } from "./tape-overlay.js";
import { getBrushPlugin } from "../brushes.js";
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
import { createPagePainter, paintStroke } from "../render.js";
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
import { VelocityPressure } from "../pressure.js";
import { PathEraser, type EraserMode } from "../eraser.js";

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
	simulatedPressure?: VelocityPressure;
	erased: Set<string>;
	pathEraser?: PathEraser;
}
export const NoteCanvas = defineComponent({
	name: "CubeNoteCanvas",
	props: {
		page: { type: Object as PropType<NotePage>, required: true },
		tool: { type: String as PropType<NoteTool>, default: "pen" },
		color: { type: String, default: "#222b40" },
		width: { type: Number, default: 2 },
		eraserMode: { type: String as PropType<EraserMode>, default: "stroke" },
		inkOpacity: { type: Number, default: 1 },
		highlighterOpacity: { type: Number, default: 0.5 },
		pressure: { type: Boolean, default: true },
		penStyle: { type: String as PropType<PenStyle>, default: "fountain" },
		brushSettings: { type: Object as PropType<Record<string, number>>, default: () => ({}) },
		fingerDraw: Boolean,
		editTapes: Boolean,
		editBackground: Boolean,
		backgroundSampling: Boolean,
		activeTape: String,
		readonly: Boolean,
		pencilMenuEnabled: { type: Boolean, default: true },
		zoom: { type: Number, default: 1 },
		rotation: { type: Number, default: 0 },
		snapGrid: Boolean,
		alignGuides: { type: Boolean, default: true },
		locale: { type: String, default: "zh-CN" },
		selected: { type: Array as PropType<string[]>, default: () => [] },
	},
	emits: [
		"add",
		"backgroundUpdate",
		"tapeUpdate",
		"tapeSelect",
		"erase",
		"erasePath",
		"move",
		"select",
		"text",
		"zoom",
		"gesture",
		"layout",
		"resize",
		"connect",
		"pencilMenu",
	],
	setup(props, { emit, expose }) {
		const viewport = ref<HTMLElement>(),
			paperElement = ref<HTMLElement>(),
			base = ref<HTMLCanvasElement>(),
			overlay = ref<HTMLCanvasElement>();
		const backgroundPreview = shallowRef<import("../model.js").InkImage>();
		const backgroundOverlay = ref<{
			cancel(): void;
			showPreview(photo?: import("../model.js").InkImage): void;
		}>();
		const infinite = computed(() => isInfinitePage(props.page));
		const origin = ref({ x: 0, y: 0 }),
			viewSize = ref({ width: 1, height: 1 });
		// A small, bounded border of cached ink lets a pan reveal adjacent content
		// without repainting the page on every touch sample.
		let baseMargin = { x: 0, y: 0 };
		const cameras = new Map<string, Point>();
		const logicalViewSize = () =>
			rotatedSize(
				viewport.value?.clientWidth || 1,
				viewport.value?.clientHeight || 1,
				props.rotation,
			);
		const paperSize = computed(() =>
			infinite.value
				? viewSize.value
				: { width: props.page.width * props.zoom, height: props.page.height * props.zoom },
		);
		const frameSize = computed(() =>
			rotatedSize(paperSize.value.width, paperSize.value.height, props.rotation),
		);
		function localPoint(element: HTMLElement, p: Point): Point {
			const box = element.getBoundingClientRect();
			const size = rotatedSize(box.width, box.height, props.rotation);
			return unrotateLocal(
				{ x: p.x - box.left, y: p.y - box.top },
				size.width,
				size.height,
				props.rotation,
			);
		}
		function clientPoint(element: HTMLElement, p: Point): Point {
			const box = element.getBoundingClientRect();
			const size = rotatedSize(box.width, box.height, props.rotation);
			const projected = rotateLocal(p, size.width, size.height, props.rotation);
			return { x: box.left + projected.x, y: box.top + projected.y };
		}
		function clientBounds(b: import("../geometry.js").Bounds) {
			const corners = [
				{ x: b.x, y: b.y },
				{ x: b.x + b.width, y: b.y },
				{ x: b.x, y: b.y + b.height },
				{ x: b.x + b.width, y: b.y + b.height },
			].map((p) => clientPoint(paperElement.value!, { x: screenX(p.x), y: screenY(p.y) }));
			return pointBounds(corners);
		}
		const screenX = (x: number) => (x - (infinite.value ? origin.value.x : 0)) * props.zoom;
		const screenY = (y: number) => (y - (infinite.value ? origin.value.y : 0)) * props.zoom;
		const region = () => ({
			x: origin.value.x,
			y: origin.value.y,
			width: viewSize.value.width / props.zoom,
			height: viewSize.value.height / props.zoom,
		});
		let zoomAnchor: { world: Point; screen: Point } | undefined;
		let viewPreview: { zoom: number; origin: Point; width: number; height: number } | undefined;
		let viewFrame = 0,
			previewGeneration = 0;
		let pendingView: { value: number; center: Point; anchor?: Point } | undefined;
		function clearViewPreview() {
			for (const canvas of [base.value, overlay.value])
				if (canvas) {
					canvas.style.transform = "";
					canvas.style.willChange = "";
					canvas.style.transformOrigin = "";
				}
			if (paperElement.value) {
				paperElement.value.style.backgroundImage = "";
				paperElement.value.style.backgroundSize = "";
				paperElement.value.style.backgroundPosition = "";
			}
		}
		function beginViewPreview() {
			if (!infinite.value || !base.value || !viewport.value) return;
			previewGeneration++;
			if (viewPreview) return;
			viewPreview = {
				zoom: props.zoom,
				origin: { ...origin.value },
				width: viewSize.value.width,
				height: viewSize.value.height,
			};
			if (frame) {
				cancelAnimationFrame(frame);
				frame = 0;
			}
			for (const canvas of [base.value, overlay.value])
				if (canvas) {
					canvas.style.transformOrigin = "0 0";
					canvas.style.willChange = "transform";
				}
		}
		function applyViewPreview() {
			if (!viewPreview) return;
			const ratio = props.zoom / viewPreview.zoom,
				x = (viewPreview.origin.x - origin.value.x) * props.zoom,
				y = (viewPreview.origin.y - origin.value.y) * props.zoom;
			for (const canvas of [base.value, overlay.value])
				if (canvas) {
					const margin = canvas === base.value ? baseMargin : { x: 0, y: 0 };
					canvas.style.transform = `matrix(${ratio},0,0,${ratio},${x + margin.x * (1 - ratio)},${y + margin.y * (1 - ratio)})`;
				}
			const paper = paperElement.value;
			if (!paper) return;
			const step =
					20 *
					Math.pow(2, Math.max(0, Math.ceil(Math.log2(8 / (20 * props.zoom))))) *
					props.zoom,
				line = 0.5 * Math.max(1, props.zoom);
			paper.style.backgroundImage =
				props.page.paper === "grid"
					? `linear-gradient(to right,#cdd4df ${line}px,transparent ${line}px),linear-gradient(to bottom,#cdd4df ${line}px,transparent ${line}px)`
					: props.page.paper === "ruled"
						? `linear-gradient(to bottom,#cdd4df ${line}px,transparent ${line}px)`
						: props.page.paper === "dotted"
							? `radial-gradient(circle at center,#c1c9d7 ${0.8 * Math.max(1, props.zoom)}px,transparent ${0.8 * Math.max(1, props.zoom)}px)`
							: "none";
			paper.style.backgroundSize = `${step}px ${step}px`;
			const offset = props.page.paper === "dotted" ? step / 2 : 0;
			paper.style.backgroundPosition = `${-origin.value.x * props.zoom - offset}px ${-origin.value.y * props.zoom - offset}px`;
			// Refresh before a long pan consumes the cached border. Short pans stay
			// entirely on the compositor; distant ink still appears during navigation.
			if (
				pan &&
				!pinch &&
				(Math.abs(x) > baseMargin.x * 0.8 || Math.abs(y) > baseMargin.y * 0.8)
			)
				finishViewPreview();
		}
		function flushViewZoom() {
			if (viewFrame) {
				cancelAnimationFrame(viewFrame);
				viewFrame = 0;
			}
			const pending = pendingView;
			pendingView = undefined;
			if (pending) applyZoomAround(pending.value, pending.center, pending.anchor);
		}
		function finishViewPreview() {
			if (!viewPreview) {
				resize(Boolean(pan));
				if (pan) beginViewPreview();
				return;
			}
			flushViewZoom();
			const token = ++previewGeneration;
			nextTick(() => {
				if (token !== previewGeneration || !viewPreview) return;
				viewPreview = undefined;
				clearViewPreview();
				if (frame) {
					cancelAnimationFrame(frame);
					frame = 0;
				}
				resize();
			});
		}
		function setOrigin(x: number, y: number) {
			origin.value = { x: worldCoordinate(x), y: worldCoordinate(y) };
			cameras.set(props.page.id, { ...origin.value });
			schedule(true);
			layout();
		}
		function panPosition() {
			return infinite.value
				? { left: origin.value.x * props.zoom, top: origin.value.y * props.zoom }
				: { left: viewport.value!.scrollLeft, top: viewport.value!.scrollTop };
		}
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
			const projected = clientBounds(b);
			const above = projected.y - view.top - height - 8;
			emit("layout", {
				x: Math.max(
					8,
					Math.min(
						view.width - width - 8,
						projected.x - view.left + projected.width / 2 - width / 2,
					),
				),
				y: Math.max(
					8,
					Math.min(
						view.height - height - 8,
						above >= 8 ? above : projected.y - view.top + projected.height + 8,
					),
				),
			});
		}
		const pointers = new Map<number, Point & { type: string; target: EventTarget | null }>();
		// Touch.identifier is opaque and may be negative on WebKit. Keep synthetic
		// contacts separate from native PointerEvent IDs without arithmetic on it.
		const touchIds = new Map<number, number>();
		let nextTouchId = -1;
		function touchId(touch: Touch) {
			let id = touchIds.get(touch.identifier);
			if (id === undefined) {
				id = nextTouchId--;
				touchIds.set(touch.identifier, id);
			}
			return id;
		}
		const touchContacts = () =>
			[...pointers.entries()].filter(([, point]) => point.type === "touch");
		let gesture: Gesture | undefined,
			pan: { id: number; x: number; y: number; left: number; top: number } | undefined;
		let pinch:
			| { ids: [number, number]; distance: number; zoom: number; anchor?: Point }
			| undefined;
		let renderScale = 1,
			frame = 0,
			baseDirty = false,
			zoomGeneration = 0;
		let mounted = true;
		const photoReady = () => {
			if (mounted) {
				renderBase();
				renderOverlay();
			}
		};
		let paintBoard = createPagePainter(photoReady);
		let rasterCamera: { zoom: number; x: number; y: number } | undefined;
		const point = (event: PointerEvent): InkPoint => {
			const p = localPoint(paperElement.value!, { x: event.clientX, y: event.clientY });
			return {
				x: infinite.value
					? worldCoordinate(origin.value.x + p.x / props.zoom)
					: Math.max(0, Math.min(props.page.width, p.x / props.zoom)),
				y: infinite.value
					? worldCoordinate(origin.value.y + p.y / props.zoom)
					: Math.max(0, Math.min(props.page.height, p.y / props.zoom)),
				pressure: event.pointerType === "pen" && event.pressure > 0 ? event.pressure : 0.5,
			};
		};
		function prepare(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
			const ctx = canvas.getContext("2d");
			if (!ctx) return null;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.scale(renderScale, renderScale);
			if (infinite.value)
				ctx.translate(
					-origin.value.x + (canvas === base.value ? baseMargin.x / props.zoom : 0),
					-origin.value.y + (canvas === base.value ? baseMargin.y / props.zoom : 0),
				);
			return ctx;
		}
		function renderBase() {
			if (viewPreview) {
				applyViewPreview();
				return;
			}
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
			const area = region();
			let paintedPage =
				backgroundPreview.value || props.backgroundSampling
					? {
							...props.page,
							background:
								props.backgroundSampling && props.page.background
									? { ...props.page.background, opacity: 1 }
									: (backgroundPreview.value ?? props.page.background),
							...(props.backgroundSampling
								? {
										paper: "plain" as const,
										tapes: [],
										layers: props.page.layers.map((l) => ({
											...l,
											visible: false,
										})),
									}
								: {}),
						}
					: props.page;
			if (gesture?.pathEraser?.updates.size) {
				const updates = gesture.pathEraser.updates;
				paintedPage = {
					...paintedPage,
					layers: paintedPage.layers.map((l) => ({
						...l,
						elements: l.elements.map((e) => updates.get(e.id) ?? e),
					})),
				};
			}
			paintBoard(
				ctx,
				paintedPage,
				omit,
				infinite.value
					? {
							x: area.x - baseMargin.x / props.zoom,
							y: area.y - baseMargin.y / props.zoom,
							width: area.width + (2 * baseMargin.x) / props.zoom,
							height: area.height + (2 * baseMargin.y) / props.zoom,
						}
					: undefined,
				props.zoom,
			);
			rasterCamera = { zoom: props.zoom, x: origin.value.x, y: origin.value.y };
		}
		function appendInk(page: NotePage, previous: NotePage): boolean {
			if (
				!rasterCamera ||
				viewPreview ||
				!base.value ||
				page.id !== previous.id ||
				rasterCamera.zoom !== props.zoom ||
				rasterCamera.x !== origin.value.x ||
				rasterCamera.y !== origin.value.y ||
				page.width !== previous.width ||
				page.height !== previous.height ||
				page.paper !== previous.paper ||
				page.color !== previous.color ||
				page.infinite !== previous.infinite ||
				page.background !== previous.background ||
				JSON.stringify(page.tapes) !== JSON.stringify(previous.tapes)
			)
				return false;
			const before = pageElements(previous),
				after = pageElements(page);
			if (
				after.length !== before.length + 1 ||
				!before.every((ink, index) => ink === after[index])
			)
				return false;
			const ink = after.at(-1)!;
			if (ink.kind !== "stroke") return false;
			const context = base.value.getContext("2d");
			if (!context) return false;
			context.save();
			context.setTransform(renderScale, 0, 0, renderScale, 0, 0);
			if (infinite.value)
				context.translate(
					-origin.value.x + baseMargin.x / props.zoom,
					-origin.value.y + baseMargin.y / props.zoom,
				);
			paintStroke(context, ink);
			context.restore();
			return true;
		}
		function renderOverlay() {
			if (viewPreview) return;
			if (!overlay.value) return;
			const ctx = prepare(overlay.value);
			if (!ctx) return;
			if (gesture?.stroke) paintStroke(ctx, gesture.stroke);
			const eraserPoint = gesture?.tool === "eraser" ? gesture.last : eraserHover;
			if (!props.readonly && props.tool === "eraser" && eraserPoint) {
				ctx.save();
				ctx.beginPath();
				ctx.arc(
					eraserPoint.x,
					eraserPoint.y,
					props.width / (props.eraserMode === "path" ? 2 : 1),
					0,
					Math.PI * 2,
				);
				ctx.strokeStyle = "#ffffff";
				ctx.lineWidth = 3 / props.zoom;
				ctx.stroke();
				ctx.strokeStyle = "#505767";
				ctx.lineWidth = 1 / props.zoom;
				ctx.stroke();
				ctx.restore();
			}
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
					else if (element.kind === "image") paintBoard.photo(ctx, element);
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
		function schedule(repaintBase = false) {
			baseDirty ||= repaintBase;
			if (!frame)
				frame = requestAnimationFrame(() => {
					frame = 0;
					// Existing ink is immutable during a pen stroke. Only the live overlay
					// changes; redrawing the whole board here made drawing cost grow with it.
					const repaint =
						baseDirty || ["eraser", "move", "resize"].includes(gesture?.tool ?? "");
					baseDirty = false;
					if (repaint) renderBase();
					renderOverlay();
				});
		}
		function resize(navigating = false) {
			if (viewPreview) {
				applyViewPreview();
				return;
			}
			const size = logicalViewSize();
			const width = infinite.value ? size.width / props.zoom : props.page.width;
			const height = infinite.value ? size.height / props.zoom : props.page.height;
			viewSize.value = size;
			baseMargin = infinite.value
				? {
						x: Math.ceil(viewSize.value.width / 4),
						y: Math.ceil(viewSize.value.height / 4),
					}
				: { x: 0, y: 0 };
			const baseWidth = viewSize.value.width + 2 * baseMargin.x,
				baseHeight = viewSize.value.height + 2 * baseMargin.y;
			const density = Math.min(
				navigating ? 1 : window.devicePixelRatio || 1,
				4096 / Math.max(baseWidth, baseHeight),
				Math.sqrt(8_000_000 / (baseWidth * baseHeight)),
			);
			renderScale = infinite.value
				? density * props.zoom
				: Math.min(
						(window.devicePixelRatio || 1) * props.zoom,
						4096 / Math.max(width, height),
						Math.sqrt(8_000_000 / (width * height)),
					);
			for (const canvas of [base.value, overlay.value])
				if (canvas) {
					const extraX = canvas === base.value ? 2 * baseMargin.x : 0,
						extraY = canvas === base.value ? 2 * baseMargin.y : 0;
					const w = Math.ceil(
							infinite.value
								? (viewSize.value.width + extraX) * density
								: width * renderScale,
						),
						h = Math.ceil(
							infinite.value
								? (viewSize.value.height + extraY) * density
								: height * renderScale,
						);
					if (canvas.width !== w) canvas.width = w;
					if (canvas.height !== h) canvas.height = h;
					if (canvas === base.value) {
						canvas.style.left = infinite.value ? `${-baseMargin.x}px` : "";
						canvas.style.top = infinite.value ? `${-baseMargin.y}px` : "";
						canvas.style.width = infinite.value ? `${baseWidth}px` : "";
						canvas.style.height = infinite.value ? `${baseHeight}px` : "";
					}
				}
			renderBase();
			renderOverlay();
			layout();
		}
		function cancel() {
			clearPencilHold();
			const restoreBase = ["eraser", "move", "resize"].includes(gesture?.tool ?? "");
			gesture = undefined;
			guides = [];
			emit("gesture", false);
			if (restoreBase) renderBase();
			renderOverlay();
		}
		function resetInput() {
			eraserHover = undefined;
			backgroundOverlay.value?.cancel();
			const wasPinching = Boolean(pinch),
				hadPreview = Boolean(viewPreview);
			previewGeneration++;
			pendingView = undefined;
			if (viewFrame) {
				cancelAnimationFrame(viewFrame);
				viewFrame = 0;
			}
			viewPreview = undefined;
			clearViewPreview();
			const ids = [...pointers.keys()];
			zoomGeneration++;
			pointers.clear();
			pan = undefined;
			pinch = undefined;
			cancel();
			if (wasPinching || hadPreview) resize();
			for (const id of ids)
				if (overlay.value?.hasPointerCapture(id)) overlay.value.releasePointerCapture(id);
		}
		function pinchAnchor() {
			if (!infinite.value) return;
			const contacts = touchContacts()
				.slice(0, 2)
				.map(([, p]) => p);
			if (contacts.length < 2) return;
			const p = localPoint(paperElement.value!, {
				x: (contacts[0].x + contacts[1].x) / 2,
				y: (contacts[0].y + contacts[1].y) / 2,
			});
			return { x: origin.value.x + p.x / props.zoom, y: origin.value.y + p.y / props.zoom };
		}
		function zoomAround(value: number, center: Point, anchor?: Point) {
			if (pinch && infinite.value) {
				pendingView = { value, center, anchor };
				if (!viewFrame)
					viewFrame = requestAnimationFrame(() => {
						viewFrame = 0;
						flushViewZoom();
					});
				return;
			}
			applyZoomAround(value, center, anchor);
		}
		function applyZoomAround(value: number, center: Point, anchor?: Point) {
			if (infinite.value) {
				value = Math.max(0.000001, Math.min(4, value));
				const p = localPoint(paperElement.value!, center);
				zoomAnchor = {
					world: anchor ?? {
						x: origin.value.x + p.x / props.zoom,
						y: origin.value.y + p.y / props.zoom,
					},
					screen: p,
				};
				if (Math.abs(value - props.zoom) < 1e-9) {
					setOrigin(
						zoomAnchor.world.x - zoomAnchor.screen.x / props.zoom,
						zoomAnchor.world.y - zoomAnchor.screen.y / props.zoom,
					);
					zoomAnchor = undefined;
				} else emit("zoom", value);
				return;
			}
			const before = overlay.value?.getBoundingClientRect();
			if (!before) return;
			const local = localPoint(paperElement.value!, center);
			const x = local.x / props.zoom,
				y = local.y / props.zoom;
			const token = ++zoomGeneration;
			emit("zoom", value);
			nextTick(() => {
				if (token !== zoomGeneration || !viewport.value || !overlay.value) return;
				const after = clientPoint(paperElement.value!, {
					x: x * props.zoom,
					y: y * props.zoom,
				});
				viewport.value.scrollLeft += after.x - center.x;
				viewport.value.scrollTop += after.y - center.y;
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
		let pencilHold:
			| { id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> }
			| undefined;
		let eraserHover: Point | undefined;
		function clearPencilHold() {
			if (pencilHold) clearTimeout(pencilHold.timer);
			pencilHold = undefined;
		}
		function beginPencilHold(event: PointerEvent) {
			if (
				!props.pencilMenuEnabled ||
				event.pointerType !== "pen" ||
				!["pen", "highlighter", "eraser"].includes(props.tool)
			)
				return;
			const { pointerId: id, clientX: x, clientY: y } = event;
			pencilHold = {
				id,
				x,
				y,
				timer: setTimeout(() => {
					if (!pencilHold || gesture?.id !== id || props.readonly) return;
					// Discard the live preview, including any tentative erasure. Keep capture
					// until pen-up so the held tip and palm cannot select a menu item or paint.
					cancel();
					emit("pencilMenu", { x, y });
				}, 550),
			};
		}
		function down(event: PointerEvent) {
			if (event.pointerType === "mouse" && event.button !== 0) return;
			// Ignore palm contacts while a pen is writing; they must not cancel ink.
			if (
				event.pointerType === "touch" &&
				[...pointers.values()].some((p) => p.type === "pen")
			)
				return;
			if (event.pointerType === "pen") resetInput();
			viewport.value?.focus({ preventScroll: true });
			if (event.pointerId >= 0) overlay.value?.setPointerCapture(event.pointerId);
			pointers.set(event.pointerId, {
				x: event.clientX,
				y: event.clientY,
				type: event.pointerType,
				target: event.currentTarget ?? overlay.value ?? null,
			});
			if (event.pointerType === "touch" && touchContacts().length > 1) {
				if (pinch) return;
				cancel();
				pan = undefined;
				const [a, b] = touchContacts().map(([, p]) => p);
				pinch = {
					ids: touchContacts()
						.slice(0, 2)
						.map(([id]) => id) as [number, number],
					distance: Math.max(12, Math.hypot(a.x - b.x, a.y - b.y)),
					zoom: props.zoom,
					anchor: pinchAnchor(),
				};
				beginViewPreview();
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
					...panPosition(),
				};
				beginViewPreview();
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
								e.kind !== "stroke" || connectable(e)
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
			if (tool === "eraser") {
				if (props.eraserMode === "path") {
					gesture.pathEraser = new PathEraser(pageElements(props.page), props.width);
					gesture.pathEraser.add(p);
					gesture.erased = gesture.pathEraser.removed;
				} else eraseAt(p);
			} else if (tool !== "lasso")
				gesture.stroke = {
					id: uid(),
					kind: "stroke",
					tool: tool === "highlighter" ? "highlighter" : "pen",
					color: props.color,
					width: props.width,
					opacity:
						tool === "highlighter"
							? props.highlighterOpacity
							: tool === "pen"
								? props.inkOpacity
								: 1,
					pressure:
						props.pressure &&
						tool === "pen" &&
						getBrushPlugin(props.penStyle)?.supportsPressure !== false &&
						["pen", "touch"].includes(event.pointerType),
					...(tool === "pen"
						? {
								penStyle: props.penStyle,
								brushVersion: getBrushPlugin(props.penStyle)?.version ?? 1,
								brushSeed: crypto.getRandomValues(new Uint32Array(1))[0],
								...(Object.keys(props.brushSettings).length
									? { brushSettings: { ...props.brushSettings } }
									: {}),
							}
						: {}),
					...(["line", "rectangle", "ellipse"].includes(tool)
						? { shape: tool as "line" | "rectangle" | "ellipse" }
						: {}),
					...(props.page.tapes?.length
						? { cutouts: props.page.tapes.map(tapePolygon) }
						: {}),
					points: [p],
				};
			if (gesture.stroke?.pressure && event.pointerType === "touch")
				gesture.simulatedPressure = new VelocityPressure(p, event.timeStamp);
			if (!moving) emit("select", []);
			emit("gesture", true);
			beginPencilHold(event);
			schedule();
		}
		function move(event: PointerEvent) {
			if (!pointers.has(event.pointerId)) {
				if (
					props.tool === "eraser" &&
					!props.readonly &&
					(event.pointerType === "mouse" || event.pointerType === "pen")
				) {
					eraserHover = point(event);
					schedule();
				}
				return;
			}
			pointers.set(event.pointerId, {
				x: event.clientX,
				y: event.clientY,
				type: event.pointerType,
				target: pointers.get(event.pointerId)!.target,
			});
			if (pinch && touchContacts().length > 1) {
				if (!pinch.ids.every((id) => pointers.has(id))) {
					const entries = touchContacts().slice(0, 2);
					pinch = {
						ids: entries.map(([id]) => id) as [number, number],
						distance: Math.max(
							12,
							Math.hypot(
								entries[0][1].x - entries[1][1].x,
								entries[0][1].y - entries[1][1].y,
							),
						),
						zoom: props.zoom,
						anchor: pinchAnchor(),
					};
					return;
				}
				const [a, b] = pinch.ids.map((id) => pointers.get(id)!);
				zoomAround(
					(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.distance,
					{
						x: (a.x + b.x) / 2,
						y: (a.y + b.y) / 2,
					},
					pinch.anchor,
				);
				return;
			}
			if (pan?.id === event.pointerId) {
				if (infinite.value && !viewPreview) beginViewPreview();
				if (infinite.value) {
					const delta = rotateVector(
						{ x: pan.x - event.clientX, y: pan.y - event.clientY },
						-props.rotation,
					);
					setOrigin((pan.left + delta.x) / props.zoom, (pan.top + delta.y) / props.zoom);
				} else {
					viewport.value!.scrollLeft = pan.left + pan.x - event.clientX;
					viewport.value!.scrollTop = pan.top + pan.y - event.clientY;
				}
				return;
			}
			if (!gesture || gesture.id !== event.pointerId) return;
			const events =
				typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
			for (const sample of events.length ? events : [event]) {
				if (
					pencilHold?.id === event.pointerId &&
					Math.hypot(sample.clientX - pencilHold.x, sample.clientY - pencilHold.y) > 5
				)
					clearPencilHold();
				let p = point(sample);
				if (gesture.simulatedPressure)
					p.pressure = gesture.simulatedPressure.sample(p, sample.timeStamp);
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
					const imageOnly =
						props.selected.length === 1 &&
						pageElements(props.page).find((e) => e.id === props.selected[0])?.kind ===
							"image";
					if (event.shiftKey || imageOnly) {
						const ratio = Math.max(w / b.width, h / b.height);
						w = b.width * ratio;
						h = b.height * ratio;
					}
					if (!infinite.value)
						w = Math.min(w, c.includes("w") ? fixed.x : props.page.width - fixed.x);
					if (!infinite.value)
						h = Math.min(h, c.includes("n") ? fixed.y : props.page.height - fixed.y);
					if (imageOnly && !infinite.value) {
						const ratio = Math.min(w / b.width, h / b.height);
						w = b.width * ratio;
						h = b.height * ratio;
					}
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
					if (gesture.pathEraser) {
						gesture.pathEraser.add(previous, p);
						gesture.erased = gesture.pathEraser.removed;
						gesture.points = [p];
						continue;
					}
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
			eraserHover = undefined;
			if (pencilHold?.id === event.pointerId) clearPencilHold();
			const wasPinching = Boolean(pinch);
			if (gesture?.id === event.pointerId) {
				move(event);
				const done = gesture;
				const previousPage = props.page;
				gesture = undefined;
				if (done.tool === "eraser") {
					if (done.pathEraser)
						emit(
							"erasePath",
							[...done.pathEraser.updates.values()],
							[...done.pathEraser.removed],
						);
					else emit("erase", Array.from(done.erased));
				} else if (done.tool === "lasso") {
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
					// A committed page is already repainted by its watcher. Restore only
					// a cancelled/no-op manipulation whose preview removed original ink.
					if (
						props.page === previousPage &&
						["eraser", "move", "resize"].includes(done.tool)
					)
						renderBase();
					renderOverlay();
				});
			}
			pointers.delete(event.pointerId);
			if (pinch && touchContacts().length === 1) {
				const [id, p] = touchContacts()[0];
				pan = {
					id,
					x: p.x,
					y: p.y,
					...panPosition(),
				};
			}
			if (touchContacts().length < 2) pinch = undefined;
			if (wasPinching && !pinch) finishViewPreview();
			if (pan?.id === event.pointerId) {
				pan = undefined;
				if (viewPreview) finishViewPreview();
			}
			if (overlay.value?.hasPointerCapture(event.pointerId))
				overlay.value.releasePointerCapture(event.pointerId);
		}
		function pointerCancel(event: PointerEvent) {
			// Implicit capture loss after a normal up must not cancel other contacts.
			if (!pointers.has(event.pointerId)) return;
			resetInput();
		}
		function reconcilePinchEnd() {
			if (!pinch || touchContacts().length >= 2) return;
			const contact = touchContacts()[0];
			pan = contact
				? {
						id: contact[0],
						x: contact[1].x,
						y: contact[1].y,
						...panPosition(),
					}
				: undefined;
			pinch = undefined;
			finishViewPreview();
		}
		function touchInput(event: TouchEvent, phase: "down" | "move" | "up" | "cancel") {
			event.preventDefault();
			if ([...pointers.values()].some((p) => p.type === "pen")) return;
			if (phase === "cancel") {
				touchIds.clear();
				nextTouchId = -1;
				if ([...pointers.keys()].some((id) => id < 0)) resetInput();
				return;
			}
			const finger = (touch: Touch) =>
				(touch as Touch & { touchType?: string }).touchType !== "stylus";
			const active = Array.from(event.targetTouches).filter(finger),
				global = Array.from(event.touches).filter(finger),
				ids = new Set(active.map(touchId));
			const present = new Set(
				[...global, ...Array.from(event.changedTouches)].map((t) => t.identifier),
			);
			for (const id of touchIds.keys()) if (!present.has(id)) touchIds.delete(id);
			const sample = (touch: Touch) =>
				({
					pointerId: touchId(touch),
					pointerType: "touch",
					currentTarget: overlay.value,
					clientX: touch.clientX,
					clientY: touch.clientY,
					pressure: 0.5,
					timeStamp: event.timeStamp,
					button: 0,
					buttons: phase === "up" ? 0 : 1,
					altKey: false,
					preventDefault: () => event.preventDefault(),
				}) as unknown as PointerEvent;
			if (phase !== "up") {
				// Touch lists are authoritative, even if WebKit missed a capture-loss/up.
				const stale = [...pointers].some(
					([id, p]) =>
						p.type === "touch" &&
						(id < 0
							? !ids.has(id)
							: !global.some(
									(t) =>
										t.target === p.target ||
										(p.target instanceof Node &&
											t.target instanceof Node &&
											p.target.contains(t.target)),
								)),
				);
				if (stale) resetInput();
			}
			if ((phase === "down" || phase === "move") && active.length >= 2) {
				for (const t of active)
					pointers.set(touchId(t), {
						x: t.clientX,
						y: t.clientY,
						type: "touch",
						target: overlay.value ?? null,
					});
				if (!pinch) {
					cancel();
					pan = undefined;
					const contacts = touchContacts().slice(0, 2),
						[a, b] = contacts.map(([, p]) => p);
					pinch = {
						ids: contacts.map(([id]) => id) as [number, number],
						distance: Math.max(12, Math.hypot(a.x - b.x, a.y - b.y)),
						zoom: props.zoom,
						anchor: pinchAnchor(),
					};
					beginViewPreview();
				}
				if (phase === "move") move(sample(active[0]));
				return;
			}
			for (const touch of Array.from(event.changedTouches).filter(finger)) {
				const input = sample(touch);
				if (phase === "down") down(input);
				else if (phase === "move") move(input);
				else up(input);
			}
			if (phase === "up")
				for (const id of [...pointers.keys()])
					if (id < 0 && !ids.has(id)) pointers.delete(id);
			reconcilePinchEnd();
			if (phase === "up") {
				const remaining = new Set(global.map((t) => t.identifier));
				for (const id of touchIds.keys()) if (!remaining.has(id)) touchIds.delete(id);
				if (!touchIds.size) nextTouchId = -1;
			}
		}
		watch(
			() => props.page.id,
			() => {
				zoomAnchor = undefined;
				origin.value = cameras.get(props.page.id) ?? { x: 0, y: 0 };
			},
			{ flush: "sync" },
		);
		watch(
			() => props.page,
			(page, previous) => {
				const canAppend =
					!viewPreview && !["eraser", "move", "resize"].includes(gesture?.tool ?? "");
				resetInput();
				if (canAppend && appendInk(page, previous)) {
					renderOverlay();
					layout();
				} else resize();
			},
			{ flush: "post" },
		);
		// Resizing the backing store must preserve a live two-finger gesture.
		watch(
			() => props.zoom,
			(zoom, previous) => {
				if (infinite.value) {
					const anchor = zoomAnchor ?? {
						world: {
							x: origin.value.x + viewSize.value.width / (2 * previous),
							y: origin.value.y + viewSize.value.height / (2 * previous),
						},
						screen: { x: viewSize.value.width / 2, y: viewSize.value.height / 2 },
					};
					zoomAnchor = undefined;
					setOrigin(
						anchor.world.x - anchor.screen.x / zoom,
						anchor.world.y - anchor.screen.y / zoom,
					);
					resize();
				} else if (!pinch) resize();
				layout();
			},
			{ flush: "post" },
		);
		watch(
			() => props.rotation,
			(_, previous) => {
				const center = infinite.value
					? {
							x: origin.value.x + viewSize.value.width / (2 * props.zoom),
							y: origin.value.y + viewSize.value.height / (2 * props.zoom),
						}
					: (() => {
							const view = viewport.value!.getBoundingClientRect();
							const box = overlay.value!.getBoundingClientRect();
							const size = rotatedSize(box.width, box.height, previous);
							const p = unrotateLocal(
								{
									x: view.left + view.width / 2 - box.left,
									y: view.top + view.height / 2 - box.top,
								},
								size.width,
								size.height,
								previous,
							);
							return { x: p.x / props.zoom, y: p.y / props.zoom };
						})();
				resetInput();
				const size = logicalViewSize();
				viewSize.value = size;
				if (infinite.value)
					setOrigin(
						center.x - size.width / (2 * props.zoom),
						center.y - size.height / (2 * props.zoom),
					);
				nextTick(() => {
					resize();
					if (!infinite.value) {
						const p = clientPoint(paperElement.value!, {
							x: center.x * props.zoom,
							y: center.y * props.zoom,
						});
						const view = viewport.value!.getBoundingClientRect();
						viewport.value!.scrollLeft += p.x - view.left - view.width / 2;
						viewport.value!.scrollTop += p.y - view.top - view.height / 2;
					}
					layout();
				});
			},
			{ flush: "pre" },
		);
		watch(
			() => props.selected,
			() => {
				renderOverlay();
				layout();
			},
			{ flush: "post" },
		);
		watch(
			() => [
				props.tool,
				props.readonly,
				props.color,
				props.editBackground,
				props.backgroundSampling,
				props.eraserMode,
			],
			() => {
				resetInput();
				schedule(true);
			},
		);
		const visibilityChanged = () => {
			if (document.hidden) resetInput();
		};
		let viewportObserver: ResizeObserver | undefined;
		onMounted(() => {
			resize();
			if (base.value)
				Object.assign(base.value, {
					boardPreview: () => captureNotesBoardPreview(props.page),
				});
			viewportObserver = new ResizeObserver(() => {
				if (
					viewPreview &&
					(logicalViewSize().width !== viewPreview.width ||
						logicalViewSize().height !== viewPreview.height)
				)
					resetInput();
				else resize();
			});
			viewportObserver.observe(viewport.value!);
			window.addEventListener("blur", resetInput);
			document.addEventListener("visibilitychange", visibilityChanged);
		});
		onBeforeUnmount(() => {
			clearPencilHold();
			mounted = false;
			viewportObserver?.disconnect();
			window.removeEventListener("blur", resetInput);
			document.removeEventListener("visibilitychange", visibilityChanged);
			if (frame) cancelAnimationFrame(frame);
			if (viewFrame) cancelAnimationFrame(viewFrame);
			previewGeneration++;
		});
		function beginHandle(event: PointerEvent, mode: "resize" | "connect", value: string) {
			if (props.readonly || !selection.value || gesture) return;
			event.preventDefault();
			event.stopPropagation();
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
			pointers.set(event.pointerId, {
				x: event.clientX,
				y: event.clientY,
				type: event.pointerType,
				target: event.currentTarget ?? overlay.value ?? null,
			});
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
			if (infinite.value) return region();
			const v = viewport.value!.getBoundingClientRect();
			const points = [
				{ x: v.left, y: v.top },
				{ x: v.right, y: v.top },
				{ x: v.left, y: v.bottom },
				{ x: v.right, y: v.bottom },
			].map((p) => localPoint(paperElement.value!, p));
			const b = pointBounds(points);
			const x = Math.max(0, b.x / props.zoom),
				y = Math.max(0, b.y / props.zoom);
			return {
				x,
				y,
				width: Math.max(
					1,
					Math.min(props.page.width - x, (b.x + b.width) / props.zoom - x),
				),
				height: Math.max(
					1,
					Math.min(props.page.height - y, (b.y + b.height) / props.zoom - y),
				),
			};
		}
		function focusView(
			b: import("../geometry.js").Bounds,
			inset: number | { bottom?: number; right?: number; top?: number } = 0,
		) {
			const viewBox = viewport.value!.getBoundingClientRect();
			const {
				bottom = 0,
				right = 0,
				top = 0,
			} = typeof inset === "number" ? { bottom: inset } : inset;
			const visibleWidth = Math.max(80, viewBox.width - right),
				visibleHeight = Math.max(80, viewBox.height - bottom - top);
			const usable = rotatedSize(visibleWidth, visibleHeight, props.rotation);
			const centerScreen = localPoint(paperElement.value!, {
				x: viewBox.left + visibleWidth / 2,
				y: viewBox.top + top + visibleHeight / 2,
			});
			if (infinite.value) {
				const zoom = Math.max(
					0.000001,
					Math.min(4, (usable.width - 48) / b.width, (usable.height - 48) / b.height),
				);
				zoomAnchor = {
					world: { x: b.x + b.width / 2, y: b.y + b.height / 2 },
					screen: centerScreen,
				};
				emit("zoom", zoom);
				nextTick(() => {
					if (zoomAnchor) {
						setOrigin(
							zoomAnchor.world.x - zoomAnchor.screen.x / props.zoom,
							zoomAnchor.world.y - zoomAnchor.screen.y / props.zoom,
						);
						zoomAnchor = undefined;
					}
				});
				return;
			}
			const view = viewport.value;
			if (!view) return;
			const zoom = Math.max(
				0.25,
				Math.min(4, (usable.width - 32) / b.width, (usable.height - 32) / b.height),
			);
			emit("zoom", zoom);
			nextTick(() => {
				const projected = clientBounds(b),
					v = view.getBoundingClientRect();
				view.scrollLeft += projected.x - v.left - 16;
				view.scrollTop += projected.y - v.top - 16;
				layout();
			});
		}
		function sampleColor(
			clientX: number,
			clientY: number,
			backgroundOnly = false,
		): string | undefined {
			if (backgroundOnly) {
				const photo = props.page.background;
				if (!photo) return;
				const local = localPoint(paperElement.value!, { x: clientX, y: clientY });
				return paintBoard.samplePhoto(photo, {
					x: local.x / props.zoom + (infinite.value ? origin.value.x : 0),
					y: local.y / props.zoom + (infinite.value ? origin.value.y : 0),
				});
			}
			const element = base.value,
				context = element?.getContext("2d");
			if (!element || !context) return;
			const box = element.getBoundingClientRect();
			if (
				clientX < box.left ||
				clientX >= box.right ||
				clientY < box.top ||
				clientY >= box.bottom
			)
				return;
			const p = localPoint(element, { x: clientX, y: clientY }),
				size = rotatedSize(box.width, box.height, props.rotation);
			const x = Math.min(
					element.width - 1,
					Math.max(0, Math.floor((p.x / size.width) * element.width)),
				),
				y = Math.min(
					element.height - 1,
					Math.max(0, Math.floor((p.y / size.height) * element.height)),
				);
			const pixel = context.getImageData(x, y, 1, 1).data;
			return (
				"#" +
				Array.from(pixel.slice(0, 3))
					.map((n) => n.toString(16).padStart(2, "0"))
					.join("")
			);
		}
		expose({
			cancel: resetInput,
			viewport,
			canvas: base,
			viewBounds,
			focusView,
			sampleColor,
			previewBackground: (photo: import("../model.js").InkImage | undefined) => {
				backgroundPreview.value = photo;
				backgroundOverlay.value?.showPreview(photo);
				schedule(true);
			},
		});
		return () =>
			h(
				"div",
				{
					class: ["cube-notes__viewport", infinite.value && "is-infinite"],
					ref: viewport,
					onScroll: layout,
					onKeydown: (e: KeyboardEvent) => {
						if (
							infinite.value &&
							!props.selected.length &&
							e.target === viewport.value &&
							["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
						) {
							e.preventDefault();
							e.stopPropagation();
							const d = (e.shiftKey ? 240 : 60) / props.zoom;
							const delta = rotateVector(
								{
									x: e.key === "ArrowRight" ? d : e.key === "ArrowLeft" ? -d : 0,
									y: e.key === "ArrowDown" ? d : e.key === "ArrowUp" ? -d : 0,
								},
								-props.rotation,
							);
							setOrigin(origin.value.x + delta.x, origin.value.y + delta.y);
						}
					},
					tabindex: 0,
					"aria-label": "Notebook paper. Use the toolbar to write, select or navigate.",
					onWheel: (e: WheelEvent) => {
						if (e.ctrlKey || e.metaKey) {
							e.preventDefault();
							zoomAround(props.zoom * Math.exp(-e.deltaY * 0.002), {
								x: e.clientX,
								y: e.clientY,
							});
						} else if (infinite.value) {
							e.preventDefault();
							const delta = rotateVector(
								{ x: e.deltaX, y: e.deltaY },
								-props.rotation,
							);
							setOrigin(
								origin.value.x + delta.x / props.zoom,
								origin.value.y + delta.y / props.zoom,
							);
						}
					},
				},
				h(
					"div",
					{ class: "cube-notes__paper-space" },
					h(
						"div",
						{
							class: "cube-notes__paper-frame",
							style: {
								width: `${frameSize.value.width}px`,
								height: `${frameSize.value.height}px`,
							},
						},
						h(
							"div",
							{
								class: "cube-notes__paper",
								ref: paperElement,
								style: {
									backgroundColor: props.page.color,
									transformOrigin: "0 0",
									transform: paperRotation(
										paperSize.value.width,
										paperSize.value.height,
										props.rotation,
									),
									width: infinite.value
										? `${viewSize.value.width}px`
										: `${props.page.width * props.zoom}px`,
									height: infinite.value
										? `${viewSize.value.height}px`
										: `${props.page.height * props.zoom}px`,
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
													: props.tool === "eraser"
														? "none"
														: "crosshair",
									},
									onPointerdown: (e: PointerEvent) => {
										if (e.pointerType !== "touch") down(e);
									},
									onPointermove: (e: PointerEvent) => {
										if (e.pointerType !== "touch") move(e);
									},
									onPointerleave: () => {
										eraserHover = undefined;
										schedule();
									},
									onPointerup: (e: PointerEvent) => {
										if (e.pointerType !== "touch") up(e);
									},
									onPointercancel: (e: PointerEvent) => {
										if (e.pointerType !== "touch") pointerCancel(e);
									},
									onTouchstart: (e: TouchEvent) => touchInput(e, "down"),
									onTouchmove: (e: TouchEvent) => touchInput(e, "move"),
									onTouchend: (e: TouchEvent) => touchInput(e, "up"),
									onTouchcancel: (e: TouchEvent) => touchInput(e, "cancel"),
									onLostpointercapture: pointerCancel,
									onContextmenu: (e: Event) => e.preventDefault(),
								}),
								props.editBackground &&
								!props.readonly &&
								props.page.background &&
								!props.backgroundSampling
									? h(BackgroundOverlay, {
											ref: backgroundOverlay,
											photo: props.page.background,
											zoom: props.zoom,
											origin: infinite.value ? origin.value : { x: 0, y: 0 },
											rotation: props.rotation,
											locale: props.locale,
											onPreview: (
												photo: import("../model.js").InkImage | undefined,
											) => {
												backgroundPreview.value = photo;
												schedule(true);
											},
											onUpdate: (photo: import("../model.js").InkImage) =>
												emit("backgroundUpdate", photo),
										})
									: null,
								h(TapeOverlay, {
									tapes: props.page.tapes ?? [],
									rotation: props.rotation,
									zoom: props.zoom,
									origin: infinite.value ? origin.value : { x: 0, y: 0 },
									infinite: infinite.value,
									editable: props.editTapes && !props.readonly,
									active: props.activeTape,
									locale: props.locale,
									onUpdate: (
										id: string,
										patch: Partial<import("../model.js").MaskingTape>,
									) => emit("tapeUpdate", id, patch),
									onSelect: (id: string) => emit("tapeSelect", id),
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
															left: `${screenX(displayedSelection.value!.x + (c.includes("e") ? displayedSelection.value!.width : 0))}px`,
															top: `${screenY(displayedSelection.value!.y + (c.includes("s") ? displayedSelection.value!.height : 0))}px`,
															cursor: `${props.rotation % 2 ? ({ nw: "ne", ne: "nw", sw: "se", se: "sw" } as Record<string, string>)[c] : c}-resize`,
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
																	left: `${screenX(point.x)}px`,
																	top: `${screenY(point.y)}px`,
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
				),
			);
	},
});
