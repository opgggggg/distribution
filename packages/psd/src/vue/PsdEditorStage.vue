<script setup lang="ts">
defineProps<{ showDocumentBar?: boolean }>();
import {
	computed,
	nextTick,
	onBeforeUnmount,
	onMounted,
	ref,
	shallowRef,
	watch,
	type CSSProperties,
} from "vue";
import {
	UiContextMenu,
	UiEmptyState,
	UiIcon,
	UiLoadingOverlay,
	useUiContextMenuFocus,
	type UiMenuItem,
} from "@yaochn/als-office-editor-ui/vue";
import {
	PsdEditorSession,
	PsdDisplayPyramid,
	PsdTileCache,
	cloneDocumentStructure,
	composeLayers,
	composePsdDocument,
	createPsdBitmap,
	rasterizeSelection,
	samplePixel,
	selectionBounds,
	type PsdDocument,
	type PsdEditorAction,
	type PsdBitmap,
	type PsdLayerNode,
	type PsdShapeApplyAction,
	type PsdStrokeApplyAction,
	type PsdRetouchAction,
	walkPsdLayers,
} from "@cubexp/psd";
import { hexToRgb, resolvedPsdTextStyle, rgbToHex } from "./use-psd-editor";
import { usePsdEditorContext } from "./psd-editor-context";

const editor = usePsdEditorContext();

const viewport = ref<HTMLDivElement | null>(null);
const canvasFrame = ref<HTMLDivElement | null>(null);
const canvasHost = ref<HTMLCanvasElement | null>(null);
const overlay = ref<HTMLCanvasElement | null>(null);
const layerPreviewCanvas = ref<HTMLCanvasElement | null>(null);
const moveSelectionCanvas = ref<HTMLCanvasElement | null>(null);
const moveForegroundCanvas = ref<HTMLCanvasElement | null>(null);
const viewportSize = ref({ width: 0, height: 0 });
const PAN_EDGE_PEEK = 40;
const FAST_MOVE_PREVIEW_PIXELS = 2_000_000;

const canvasWidth = computed(() => editor.document.value?.width ?? 0);
const canvasHeight = computed(() => editor.document.value?.height ?? 0);
const scaledWidth = computed(() => Math.round(canvasWidth.value * editor.zoom.value));
const scaledHeight = computed(() => Math.round(canvasHeight.value * editor.zoom.value));
const panPadding = computed(() => ({
	x: Math.max(0, viewportSize.value.width - PAN_EDGE_PEEK),
	y: Math.max(0, viewportSize.value.height - PAN_EDGE_PEEK),
}));
const panSurfaceStyle = computed<CSSProperties>(() => {
	if (!canvasWidth.value || !canvasHeight.value) return { width: "100%", height: "100%" };
	return {
		width: `${scaledWidth.value + panPadding.value.x * 2}px`,
		height: `${scaledHeight.value + panPadding.value.y * 2}px`,
	};
});

// --- rendering ---
const tileCache = new PsdTileCache(256, 64 * 1024 * 1024);
const tiledMove = ref(false);
const tiledWindow = ref<{x:number;y:number;width:number;height:number}|null>(null);
let tileFrame = 0, tileGeneration = 0;
const tileScratch = globalThis.document.createElement("canvas");
const tiledStyle = computed<CSSProperties>(() => {
	const r=tiledWindow.value, z=editor.zoom.value;
	return r ? {left:`${r.x*z}px`,top:`${r.y*z}px`,width:`${r.width*z}px`,height:`${r.height*z}px`,right:"auto",bottom:"auto"} : {};
});
function largeCanvas(){return canvasWidth.value * canvasHeight.value >= FAST_MOVE_PREVIEW_PIXELS;}
function viewRegion(){
	const surface=viewport.value,z=editor.zoom.value;
	const x=Math.max(0,Math.floor(((surface?.scrollLeft??0)-panPadding.value.x)/z));
	const y=Math.max(0,Math.floor(((surface?.scrollTop??0)-panPadding.value.y)/z));
	return {x:Math.min(canvasWidth.value-1,x),y:Math.min(canvasHeight.value-1,y),width:Math.max(1,Math.min(canvasWidth.value-x,Math.ceil((surface?.clientWidth??800)/z)+2)),height:Math.max(1,Math.min(canvasHeight.value-y,Math.ceil((surface?.clientHeight??600)/z)+2))};
}
function paintTiled(document:PsdDocument){
	cancelAnimationFrame(tileFrame); const generation=++tileGeneration;
	const canvas=canvasHost.value;if(!canvas)return;
	const region=viewRegion();tiledWindow.value=region;
	const scale=editor.zoom.value*(globalThis.devicePixelRatio||1);
	canvas.width=Math.max(1,Math.ceil(region.width*scale));canvas.height=Math.max(1,Math.ceil(region.height*scale));
	const context=canvas.getContext("2d")!;context.imageSmoothingEnabled=editor.zoom.value<1;context.imageSmoothingQuality="high";
	const positions:Array<[number,number]>=[];
	for(let y=Math.floor(region.y/256)*256;y<region.y+region.height;y+=256)
		for(let x=Math.floor(region.x/256)*256;x<region.x+region.width;x+=256)positions.push([x,y]);
	let cursor=0;
	const draw=()=>{
		if(generation!==tileGeneration)return;
		const start=performance.now();
		try {
			do {
				const [x,y]=positions[cursor++],tile=tileCache.tile(document,x,y);
				paintBitmapToCanvas(tileScratch,tile.bitmap);
				// Adjacent tiles must share integer device-pixel edges. Fractional
				// destinations otherwise expose transparent seams at e.g. 125% zoom.
				const left=Math.round((x-region.x)*scale),top=Math.round((y-region.y)*scale);
				const right=Math.round((x+tile.region.width-region.x)*scale),bottom=Math.round((y+tile.region.height-region.y)*scale);
				context.drawImage(tileScratch,left,top,right-left,bottom-top);
			}while(cursor<positions.length&&performance.now()-start<8);
			if(cursor<positions.length)tileFrame=requestAnimationFrame(draw);
		}catch(error){editor.lastError.value=String(error);}
	};
	tileFrame=requestAnimationFrame(draw);
}
function paintTiledMove(){
	const preview=moveSelectionPreview.value,doc=editor.document.value;if(!preview||!doc)return;
	const dx=preview.dx,dy=preview.dy;
	const changed=cloneDocumentStructure(doc),selected=new Set(preview.layerIds);
	function move(layers:PsdLayerNode[],parent=false){for(const layer of layers){
		const included=parent||selected.has(layer.id);
		if(included){
			if(layer.kind!=="group"){layer.left+=dx;layer.top+=dy;}
			if(layer.mask&&layer.mask.linked!==false)layer.mask={...layer.mask,left:layer.mask.left+dx,right:layer.mask.right+dx,top:layer.mask.top+dy,bottom:layer.mask.bottom+dy};
		}
		if(layer.kind==="group")move(layer.children,included);
	}}
	move(changed.layers);paintTiled(changed);
}
function onViewportScroll(){
	if(!largeCanvas())return;
	if(tiledMove.value){paintTiledMove();redrawOverlay();return;}
	if(editor.layerVisualPreview.value)repaintWithoutLayer(editor.layerVisualPreview.value.layerId);
	else if(!moveSelectionPreview.value)repaint();
	redrawOverlay();
}


function paintBitmapToCanvas(canvas: HTMLCanvasElement | null, flattened: PsdBitmap): void {
	if (!canvas) return;
	if (canvas.width !== flattened.width) canvas.width = flattened.width;
	if (canvas.height !== flattened.height) canvas.height = flattened.height;
	const context = canvas.getContext("2d");
	if (!context) return;
	if (flattened.width && flattened.height) {
		context.putImageData(
			new ImageData(new Uint8ClampedArray(flattened.data), flattened.width, flattened.height),
			0,
			0,
		);
	}
}

const displayPyramid = new PsdDisplayPyramid();
let displayedComposite: PsdBitmap | null = null;
function paintBitmap(flattened: PsdBitmap): void {
	displayedComposite = flattened;
	const scale = editor.zoom.value * (globalThis.devicePixelRatio || 1);
	paintBitmapToCanvas(canvasHost.value, displayPyramid.bitmap(flattened, scale));
}
watch(editor.zoom, () => {
	if (largeCanvas()) { onViewportScroll(); return; }
	if (displayedComposite && !moveSelectionPreview.value && !editor.layerVisualPreview.value) paintBitmap(displayedComposite);
});

function usesFastMovePreview(document: PsdDocument): boolean {
	return document.width * document.height >= FAST_MOVE_PREVIEW_PIXELS;
}

function repaint(previewDocument?: PsdDocument): void {
	previewDocument ??= editor.previewDocument.value ?? undefined;
	const document = previewDocument ?? editor.document.value;
	if (!document) return;
	if (largeCanvas()) { paintTiled(document); return; }
	++tileGeneration; cancelAnimationFrame(tileFrame); tiledWindow.value=null;
	const flattened = previewDocument ? composePsdDocument(previewDocument) : editor.composite();
	if (!flattened) return;
	paintBitmap(flattened);
}

let backdropCache: { layerId: string; revision: number; bitmap: PsdBitmap } | null = null;
let backdropIdleHandle: ReturnType<typeof globalThis.setTimeout> | number | null = null;
let previewFinalizeHandle: ReturnType<typeof globalThis.setTimeout> | number | null = null;
let suppressPreviewClearRepaint = false;

function findLayer(layerId: string, document = editor.document.value): PsdLayerNode | null {
	if (!document) return null;
	let match: PsdLayerNode | null = null;
	walkPsdLayers(document.layers, (layer) => {
		if (!match && layer.id === layerId) match = layer;
	});
	return match;
}

function leafIdsForLayers(layerIds: readonly string[]): Set<string> {
	const ids = new Set<string>();
	const addLeaves = (layer: PsdLayerNode): void => {
		if (layer.kind === "group") {
			for (const child of layer.children) addLeaves(child);
		} else {
			ids.add(layer.id);
		}
	};
	for (const id of layerIds) {
		const layer = findLayer(id);
		if (layer) addLeaves(layer);
	}
	return ids;
}

function effectiveSelectedLayerIds(): string[] {
	const document = editor.document.value;
	if (!document) return [];
	const selected = new Set(editor.selectedLayerIds.value);
	const result: string[] = [];
	const visit = (layers: readonly PsdLayerNode[], ancestorSelected: boolean): void => {
		for (const layer of layers) {
			const layerSelected = selected.has(layer.id);
			if (layerSelected && !ancestorSelected) result.push(layer.id);
			if (layer.kind === "group") visit(layer.children, ancestorSelected || layerSelected);
		}
	};
	visit(document.layers, false);
	return result;
}

function layerFrame(
	layer: PsdLayerNode,
): { x: number; y: number; width: number; height: number } | null {
	if (layer.kind !== "group") {
		return {
			x: layer.left,
			y: layer.top,
			width: layer.bitmap.width,
			height: layer.bitmap.height,
		};
	}
	const childFrames = layer.children
		.map((child) => layerFrame(child))
		.filter((frame): frame is NonNullable<typeof frame> => Boolean(frame));
	if (!childFrames.length) return null;
	const left = Math.min(...childFrames.map((frame) => frame.x));
	const top = Math.min(...childFrames.map((frame) => frame.y));
	const right = Math.max(...childFrames.map((frame) => frame.x + frame.width));
	const bottom = Math.max(...childFrames.map((frame) => frame.y + frame.height));
	return { x: left, y: top, width: right - left, height: bottom - top };
}

function combinedLayerFrame(
	layerIds: readonly string[],
): { x: number; y: number; width: number; height: number } | null {
	const frames = layerIds
		.map((id) => findLayer(id))
		.filter((layer): layer is PsdLayerNode => Boolean(layer))
		.map((layer) => layerFrame(layer))
		.filter((frame): frame is NonNullable<typeof frame> => Boolean(frame));
	if (!frames.length) return null;
	const left = Math.min(...frames.map((frame) => frame.x));
	const top = Math.min(...frames.map((frame) => frame.y));
	const right = Math.max(...frames.map((frame) => frame.x + frame.width));
	const bottom = Math.max(...frames.map((frame) => frame.y + frame.height));
	return { x: left, y: top, width: right - left, height: bottom - top };
}

function visibleLeafLayersTopFirst(): Array<Exclude<PsdLayerNode, { kind: "group" }>> {
	const document = editor.document.value;
	if (!document) return [];
	const result: Array<Exclude<PsdLayerNode, { kind: "group" }>> = [];
	const visit = (layers: readonly PsdLayerNode[], parentVisible: boolean): void => {
		for (let index = layers.length - 1; index >= 0; index--) {
			const layer = layers[index];
			const visible = parentVisible && layer.visible && layer.opacity > 0;
			if (!visible) continue;
			if (layer.kind === "group") visit(layer.children, visible);
			else result.push(layer);
		}
	};
	visit(document.layers, true);
	return result;
}

function retainOnlyLeafIds(document: PsdDocument, retained: ReadonlySet<string>): void {
	const visit = (layers: PsdLayerNode[]): boolean => {
		let hasVisibleLayer = false;
		for (const layer of layers) {
			if (layer.kind === "group") {
				const hasVisibleChild = visit(layer.children);
				layer.visible = layer.visible && hasVisibleChild;
			} else {
				layer.visible = layer.visible && retained.has(layer.id);
			}
			hasVisibleLayer ||= layer.visible;
		}
		return hasVisibleLayer;
	};
	visit(document.layers);
}

function hideLeafIds(document: PsdDocument, hidden: ReadonlySet<string>): void {
	walkPsdLayers(document.layers, (layer) => {
		if (layer.kind !== "group" && hidden.has(layer.id)) layer.visible = false;
	});
}

function repaintWithoutLayer(layerId: string): void {
	const document = editor.document.value;
	if (!document) return;
	if (backdropCache?.layerId === layerId && backdropCache.revision === editor.revision.value) {
		paintBitmap(backdropCache.bitmap);
		return;
	}
	const backdrop = cloneDocumentStructure(document);
	const layer = findLayer(layerId, backdrop);
	if (layer) layer.visible = false;
	if (largeCanvas()) { paintTiled(backdrop); return; }
	const bitmap = composePsdDocument(backdrop);
	backdropCache = { layerId, revision: editor.revision.value, bitmap };
	paintBitmap(bitmap);
}

function drawLayerPreview(layer: PsdLayerNode): void {
	const canvas = layerPreviewCanvas.value;
	const document = editor.document.value;
	if (!canvas || !document) return;
	const bitmap =
		layer.kind === "group"
			? (() => {
					const groupBitmap = createPsdBitmap(document.width, document.height);
					composeLayers(groupBitmap, layer.children);
					return groupBitmap;
				})()
			: layer.bitmap;
	const originX = layer.kind === "group" ? 0 : layer.left;
	const originY = layer.kind === "group" ? 0 : layer.top;
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const context = canvas.getContext("2d");
	if (!context || !bitmap.width || !bitmap.height) return;
	const pixels = new Uint8ClampedArray(bitmap.data);
	const mask = layer.mask;
	if (mask && !mask.disabled) {
		const maskWidth = mask.right - mask.left;
		const maskHeight = mask.bottom - mask.top;
		if (maskWidth > 0 && maskHeight > 0) {
			for (let y = 0; y < bitmap.height; y++) {
				const maskY = originY + y - mask.top;
				for (let x = 0; x < bitmap.width; x++) {
					const maskX = originX + x - mask.left;
					const coverage =
						maskX >= 0 && maskY >= 0 && maskX < maskWidth && maskY < maskHeight
							? mask.data[maskY * maskWidth + maskX]
							: mask.defaultColor;
					pixels[(y * bitmap.width + x) * 4 + 3] *= coverage / 255;
				}
			}
		}
	}
	context.putImageData(new ImageData(pixels, bitmap.width, bitmap.height), 0, 0);
}

watch(
	() => editor.layerVisualPreview.value?.layerId ?? null,
	(layerId) => {
		if (!layerId) {
			if (!suppressPreviewClearRepaint) repaint();
			return;
		}
		const layer = findLayer(layerId);
		if (!layer) return;
		repaintWithoutLayer(layerId);
		void nextTick(() => drawLayerPreview(layer));
	},
	{ flush: "sync" },
);

function cancelPreviewFinalize(): void {
	if (previewFinalizeHandle === null) return;
	globalThis.clearTimeout(previewFinalizeHandle);
	previewFinalizeHandle = null;
}

function finalizeCommittedPreview(): void {
	previewFinalizeHandle = null;
	if (!editor.layerVisualPreview.value?.committed) return;
	repaint();
	suppressPreviewClearRepaint = true;
	editor.layerVisualPreview.value = null;
	suppressPreviewClearRepaint = false;
}

function schedulePreviewFinalize(): void {
	cancelPreviewFinalize();
	// Keep the exact layer preview on screen briefly. Repeated gestures cancel
	// this work, so a rapid drag sequence never pays a full-document composite
	// between pointer interactions.
	previewFinalizeHandle = globalThis.setTimeout(finalizeCommittedPreview, 350);
}

watch(
	() => editor.layerVisualPreview.value?.committed ?? false,
	(committed) => {
		if (committed) {
			const layerId = editor.layerVisualPreview.value?.layerId;
			if (layerId && backdropCache?.layerId === layerId)
				backdropCache.revision = editor.revision.value;
			schedulePreviewFinalize();
		} else if (editor.layerVisualPreview.value) cancelPreviewFinalize();
	},
	{ flush: "sync" },
);

// --- pointer interactions ---

interface SnapTargets {
	x: number[];
	y: number[];
	width: number[];
	height: number[];
}

interface DragState {
	kind:
		| "move"
		| "scale"
		| "distort"
		| "marquee"
		| "lasso"
		| "bezier"
		| "selection-move"
		| "pixels-move"
		| "crop"
		| "paint"
		| "sample"
		| "gradient"
		| "shape"
		| "pan";
	startX: number;
	startY: number;
	lastX: number;
	lastY: number;
	points: Array<{ x: number; y: number }>;
	panX: number;
	panY: number;
	corner?: string;
	corners?: Array<{ x: number; y: number }>;
	frame?: { x: number; y: number; width: number; height: number };
	cropMode?: "create" | "move" | "resize";
	copyPixels?: boolean;
	layerIds?: string[];
	leafIds?: Set<string>;
	snapTargets?: SnapTargets;
	selectionCombine?: "replace" | "add" | "subtract" | "intersect";
	bezierNodeIndex?: number;
	bezierPart?: "anchor" | "control-in" | "control-out";
	bezierStartNode?: BezierSelectionNode;
	bezierOriginalNode?: BezierSelectionNode;
	bezierCreateHandles?: boolean;
}

interface BezierSelectionNode {
	x: number;
	y: number;
	controlIn: { x: number; y: number };
	controlOut: { x: number; y: number };
}

interface BezierSelectionDraft {
	nodes: BezierSelectionNode[];
	selectionCombine: "replace" | "add" | "subtract" | "intersect";
	closed: boolean;
}

const drag = ref<DragState | null>(null);
const marqueeDraft = ref<{ x: number; y: number; width: number; height: number } | null>(null);
const selectionMoveOffset = ref<{ dx: number; dy: number } | null>(null);
const bezierDraft = ref<BezierSelectionDraft | null>(null);
const activeBezierNodeIndex = ref<number | null>(null);
const cachedBezierSelection = shallowRef<{
	draft: BezierSelectionDraft;
	selection: NonNullable<PsdDocument["selection"]>;
} | null>(null);
const cropDraft = ref<{ x: number; y: number; width: number; height: number } | null>(null);
const shapeDraft = ref<{ x: number; y: number; width: number; height: number } | null>(null);
const moveDelta = ref<{ dx: number; dy: number } | null>(null);
const moveSelectionPreview = ref<{
	layerIds: string[];
	dx: number;
	dy: number;
	hasForeground: boolean;
} | null>(null);
const snapGuides = ref<{ x: number | null; y: number | null }>({ x: null, y: null });
const sampledPoint = ref<{ x: number; y: number; color: string } | null>(null);
const hoverPoint = ref<{ x: number; y: number } | null>(null);
const textInput = ref<HTMLTextAreaElement | null>(null);
const TEXT_EDITOR_MIN_WIDTH = 80;
const TEXT_LINE_HEIGHT = 1.25;
const textDraft = ref<{
	layerId: string | null;
	x: number;
	y: number;
	text: string;
	fontFamily: string;
	fontSize: number;
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strikethrough: boolean;
	color: string;
	width: number;
} | null>(null);

type SelectionShape = NonNullable<PsdDocument["selection"]>["shape"];

function simpleSelectionPath(shape: Exclude<SelectionShape, { kind: "pixels" }>): string {
	switch (shape.kind) {
		case "rectangle":
			return `M${shape.x} ${shape.y}H${shape.x + shape.width}V${shape.y + shape.height}H${shape.x}Z`;
		case "ellipse": {
			const radiusX = shape.width / 2;
			const radiusY = shape.height / 2;
			const centerX = shape.x + radiusX;
			const centerY = shape.y + radiusY;
			return `M${centerX - radiusX} ${centerY}A${radiusX} ${radiusY} 0 1 0 ${centerX + radiusX} ${centerY}A${radiusX} ${radiusY} 0 1 0 ${centerX - radiusX} ${centerY}Z`;
		}
		case "polygon":
			if (shape.points.length < 2) return "";
			return `${shape.points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join("")}Z`;
	}
}

function pixelSelectionPath(mask: Uint8Array, width: number, height: number): string {
	const parts: string[] = [];
	const selected = (x: number, y: number) =>
		x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] >= 128;

	// Merge adjacent boundary pixels into runs so complex magic-wand selections
	// stay compact enough for an SVG path while preserving their exact contour.
	for (let y = 0; y <= height; y++) {
		let start = -1;
		for (let x = 0; x <= width; x++) {
			const boundary = x < width && selected(x, y - 1) !== selected(x, y);
			if (boundary && start < 0) start = x;
			else if (!boundary && start >= 0) {
				parts.push(`M${start} ${y}H${x}`);
				start = -1;
			}
		}
	}
	for (let x = 0; x <= width; x++) {
		let start = -1;
		for (let y = 0; y <= height; y++) {
			const boundary = y < height && selected(x - 1, y) !== selected(x, y);
			if (boundary && start < 0) start = y;
			else if (!boundary && start >= 0) {
				parts.push(`M${x} ${start}V${y}`);
				start = -1;
			}
		}
	}
	return parts.join("");
}

function pointDistanceToLine(
	point: { x: number; y: number },
	start: { x: number; y: number },
	end: { x: number; y: number },
): number {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	if (!dx && !dy) return Math.hypot(point.x - start.x, point.y - start.y);
	return (
		Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) /
		Math.hypot(dx, dy)
	);
}

function flattenCubicBezier(
	start: { x: number; y: number },
	control1: { x: number; y: number },
	control2: { x: number; y: number },
	end: { x: number; y: number },
	output: Array<{ x: number; y: number }>,
	depth = 0,
): void {
	const flatness = Math.max(
		pointDistanceToLine(control1, start, end),
		pointDistanceToLine(control2, start, end),
	);
	const chordLength = Math.hypot(end.x - start.x, end.y - start.y);
	const controlPolygonLength =
		Math.hypot(control1.x - start.x, control1.y - start.y) +
		Math.hypot(control2.x - control1.x, control2.y - control1.y) +
		Math.hypot(end.x - control2.x, end.y - control2.y);
	// Control points can be collinear while still overshooting or looping back.
	// Compare the control polygon to the chord as well as its distance from it.
	if ((flatness <= 0.35 && controlPolygonLength - chordLength <= 0.35) || depth >= 10) {
		output.push({ x: end.x, y: end.y });
		return;
	}
	const startControl = {
		x: (start.x + control1.x) / 2,
		y: (start.y + control1.y) / 2,
	};
	const controls = {
		x: (control1.x + control2.x) / 2,
		y: (control1.y + control2.y) / 2,
	};
	const controlEnd = {
		x: (control2.x + end.x) / 2,
		y: (control2.y + end.y) / 2,
	};
	const leftControl = {
		x: (startControl.x + controls.x) / 2,
		y: (startControl.y + controls.y) / 2,
	};
	const rightControl = {
		x: (controls.x + controlEnd.x) / 2,
		y: (controls.y + controlEnd.y) / 2,
	};
	const split = {
		x: (leftControl.x + rightControl.x) / 2,
		y: (leftControl.y + rightControl.y) / 2,
	};
	flattenCubicBezier(start, startControl, leftControl, split, output, depth + 1);
	flattenCubicBezier(split, rightControl, controlEnd, end, output, depth + 1);
}

/** Converts the closed interactive path to the polygon mask representation. */
function flattenClosedBezierPath(
	nodes: readonly BezierSelectionNode[],
): Array<{ x: number; y: number }> {
	if (nodes.length < 3) return [];
	const points: Array<{ x: number; y: number }> = [{ x: nodes[0].x, y: nodes[0].y }];
	for (let index = 0; index < nodes.length; index++) {
		const start = nodes[index];
		const end = nodes[(index + 1) % nodes.length];
		flattenCubicBezier(start, start.controlOut, end.controlIn, end, points);
	}
	// The closing segment ends at the first anchor, which point-in-polygon closes
	// implicitly. Remove that duplicate, then cap action size without changing
	// the order of the contour.
	points.pop();
	const maximum = 1_900;
	if (points.length <= maximum) return points;
	return Array.from(
		{ length: maximum },
		(_, index) => points[Math.floor((index * points.length) / maximum)],
	);
}

function bezierPathData(
	nodes: readonly BezierSelectionNode[],
	close: boolean,
	previewPoint?: { x: number; y: number } | null,
): string {
	if (!nodes.length) return "";
	const parts = [`M${nodes[0].x} ${nodes[0].y}`];
	const segmentCount = close ? nodes.length : nodes.length - 1;
	for (let index = 0; index < segmentCount; index++) {
		const start = nodes[index];
		const end = nodes[(index + 1) % nodes.length];
		const hasOutgoingHandle =
			Math.hypot(start.controlOut.x - start.x, start.controlOut.y - start.y) > 0.25;
		const hasIncomingHandle =
			Math.hypot(end.controlIn.x - end.x, end.controlIn.y - end.y) > 0.25;
		if (!hasOutgoingHandle && !hasIncomingHandle) parts.push(`L${end.x} ${end.y}`);
		else
			parts.push(
				`C${start.controlOut.x} ${start.controlOut.y} ${end.controlIn.x} ${end.controlIn.y} ${end.x} ${end.y}`,
			);
	}
	if (!close && previewPoint) {
		const last = nodes[nodes.length - 1];
		const hasOutgoingHandle =
			Math.hypot(last.controlOut.x - last.x, last.controlOut.y - last.y) > 0.25;
		if (!hasOutgoingHandle) parts.push(`L${previewPoint.x} ${previewPoint.y}`);
		else
			parts.push(
				`C${last.controlOut.x} ${last.controlOut.y} ${previewPoint.x} ${previewPoint.y} ${previewPoint.x} ${previewPoint.y}`,
			);
	}
	if (close) parts.push("Z");
	return parts.join("");
}

function pointNearFirstBezierAnchor(point: { x: number; y: number }): boolean {
	const draft = bezierDraft.value;
	const first = draft?.closed ? null : draft?.nodes[0];
	return Boolean(
		first && Math.hypot(point.x - first.x, point.y - first.y) <= 9 / editor.zoom.value,
	);
}

function cloneBezierNode(node: BezierSelectionNode): BezierSelectionNode {
	return {
		x: node.x,
		y: node.y,
		controlIn: { ...node.controlIn },
		controlOut: { ...node.controlOut },
	};
}

function cloneBezierDraft(draft: BezierSelectionDraft): BezierSelectionDraft {
	return {
		nodes: draft.nodes.map(cloneBezierNode),
		selectionCombine: draft.selectionCombine,
		closed: draft.closed,
	};
}

function defaultBezierHandles(
	draft: BezierSelectionDraft,
	index: number,
): Pick<BezierSelectionNode, "controlIn" | "controlOut"> | null {
	const node = draft.nodes[index];
	const previous = draft.nodes[(index - 1 + draft.nodes.length) % draft.nodes.length];
	const next = draft.nodes[(index + 1) % draft.nodes.length];
	if (!node || !previous || !next) return null;
	const tangentX = next.x - previous.x;
	const tangentY = next.y - previous.y;
	const tangentLength = Math.hypot(tangentX, tangentY);
	if (tangentLength < 0.01) return null;
	const adjacentLength = Math.min(
		Math.hypot(node.x - previous.x, node.y - previous.y),
		Math.hypot(next.x - node.x, next.y - node.y),
	);
	const handleLength = Math.max(4, adjacentLength / 3);
	const handleX = (tangentX / tangentLength) * handleLength;
	const handleY = (tangentY / tangentLength) * handleLength;
	return {
		controlIn: { x: node.x - handleX, y: node.y - handleY },
		controlOut: { x: node.x + handleX, y: node.y + handleY },
	};
}

function addDefaultBezierHandles(draft: BezierSelectionDraft, index: number): boolean {
	const node = draft.nodes[index];
	if (!node || bezierNodeHasHandles(node)) return false;
	const handles = defaultBezierHandles(draft, index);
	if (!handles) return false;
	node.controlIn = handles.controlIn;
	node.controlOut = handles.controlOut;
	return true;
}

function bezierDisplayHandles(
	node: BezierSelectionNode,
	index: number,
): [{ x: number; y: number }, { x: number; y: number }] | [] {
	if (bezierNodeHasHandles(node)) return [node.controlIn, node.controlOut];
	const draft = bezierDraft.value;
	if (!draft?.closed || activeBezierNodeIndex.value !== index) return [];
	const handles = defaultBezierHandles(draft, index);
	return handles ? [handles.controlIn, handles.controlOut] : [];
}

function bezierNodeShowsVirtualHandles(node: BezierSelectionNode, index: number): boolean {
	return !bezierNodeHasHandles(node) && bezierDisplayHandles(node, index).length === 2;
}

function bezierNodeChanged(node: BezierSelectionNode, original?: BezierSelectionNode): boolean {
	if (!original) return false;
	return (
		node.x !== original.x ||
		node.y !== original.y ||
		node.controlIn.x !== original.controlIn.x ||
		node.controlIn.y !== original.controlIn.y ||
		node.controlOut.x !== original.controlOut.x ||
		node.controlOut.y !== original.controlOut.y
	);
}

function bezierEditTarget(point: { x: number; y: number }): {
	index: number;
	part: "anchor" | "control-in" | "control-out";
	virtual?: boolean;
} | null {
	const draft = bezierDraft.value;
	if (!draft?.closed) return null;
	const threshold = 8 / editor.zoom.value;
	for (const [index, node] of draft.nodes.entries()) {
		const virtual = !bezierNodeHasHandles(node);
		const handles = bezierDisplayHandles(node, index);
		for (const [part, handle] of [
			["control-in", handles[0]],
			["control-out", handles[1]],
		] as const) {
			if (handle && Math.hypot(point.x - handle.x, point.y - handle.y) <= threshold)
				return { index, part, virtual };
		}
	}
	for (const [index, node] of draft.nodes.entries()) {
		if (Math.hypot(point.x - node.x, point.y - node.y) <= threshold)
			return { index, part: "anchor" };
	}
	return null;
}

interface BezierSegmentTarget {
	index: number;
	t: number;
	point: { x: number; y: number };
	distance: number;
}

function cubicPoint(
	start: { x: number; y: number },
	control1: { x: number; y: number },
	control2: { x: number; y: number },
	end: { x: number; y: number },
	t: number,
): { x: number; y: number } {
	const inverse = 1 - t;
	return {
		x:
			inverse ** 3 * start.x +
			3 * inverse ** 2 * t * control1.x +
			3 * inverse * t ** 2 * control2.x +
			t ** 3 * end.x,
		y:
			inverse ** 3 * start.y +
			3 * inverse ** 2 * t * control1.y +
			3 * inverse * t ** 2 * control2.y +
			t ** 3 * end.y,
	};
}

function bezierSegmentTarget(point: { x: number; y: number }): BezierSegmentTarget | null {
	const draft = bezierDraft.value;
	if (!draft?.closed || draft.nodes.length < 2) return null;
	const threshold = 7 / editor.zoom.value;
	let closest: BezierSegmentTarget | null = null;
	for (let index = 0; index < draft.nodes.length; index++) {
		const start = draft.nodes[index];
		const end = draft.nodes[(index + 1) % draft.nodes.length];
		// Screen-space sampling gives a stable hit target without coupling point
		// insertion to the curve-flattening tolerance used by the raster mask.
		const steps = Math.max(
			12,
			Math.min(
				80,
				Math.ceil((Math.hypot(end.x - start.x, end.y - start.y) * editor.zoom.value) / 8),
			),
		);
		for (let step = 1; step < steps; step++) {
			const t = step / steps;
			const candidate = cubicPoint(start, start.controlOut, end.controlIn, end, t);
			const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
			if (distance <= threshold && (!closest || distance < closest.distance)) {
				closest = { index, t, point: candidate, distance };
			}
		}
	}
	return closest;
}

function interpolatePoint(
	start: { x: number; y: number },
	end: { x: number; y: number },
	t: number,
): { x: number; y: number } {
	return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
}

/** Splits one cubic segment without changing its rendered contour. */
function insertBezierNode(target: BezierSegmentTarget): number | null {
	const draft = bezierDraft.value;
	if (!draft?.closed) return null;
	const start = draft.nodes[target.index];
	const endIndex = (target.index + 1) % draft.nodes.length;
	const end = draft.nodes[endIndex];
	if (!start || !end) return null;
	const a = interpolatePoint(start, start.controlOut, target.t);
	const b = interpolatePoint(start.controlOut, end.controlIn, target.t);
	const c = interpolatePoint(end.controlIn, end, target.t);
	const d = interpolatePoint(a, b, target.t);
	const e = interpolatePoint(b, c, target.t);
	const split = interpolatePoint(d, e, target.t);
	start.controlOut = a;
	end.controlIn = c;
	const node: BezierSelectionNode = {
		x: split.x,
		y: split.y,
		controlIn: d,
		controlOut: e,
	};
	const insertionIndex = target.index + 1;
	draft.nodes.splice(insertionIndex, 0, node);
	return insertionIndex;
}

function straightBezierNode(point: { x: number; y: number }): BezierSelectionNode {
	return {
		x: point.x,
		y: point.y,
		controlIn: { ...point },
		controlOut: { ...point },
	};
}

function selectionToBezierDraft(): BezierSelectionDraft | null {
	const selection = editor.selection.value;
	if (!selection || selection.inverted) return null;
	const shape = selection.shape;
	if (shape.kind === "pixels") {
		editor.lastError.value =
			"Pixel-based selections can be moved and restored, but their outline cannot be edited as anchor points.";
		return null;
	}
	let nodes: BezierSelectionNode[];
	if (shape.kind === "rectangle") {
		nodes = [
			{ x: shape.x, y: shape.y },
			{ x: shape.x + shape.width, y: shape.y },
			{ x: shape.x + shape.width, y: shape.y + shape.height },
			{ x: shape.x, y: shape.y + shape.height },
		].map(straightBezierNode);
	} else if (shape.kind === "ellipse") {
		const cx = shape.x + shape.width / 2;
		const cy = shape.y + shape.height / 2;
		const rx = shape.width / 2;
		const ry = shape.height / 2;
		const kappa = 0.5522847498;
		nodes = [
			{
				x: cx,
				y: cy - ry,
				controlIn: { x: cx - rx * kappa, y: cy - ry },
				controlOut: { x: cx + rx * kappa, y: cy - ry },
			},
			{
				x: cx + rx,
				y: cy,
				controlIn: { x: cx + rx, y: cy - ry * kappa },
				controlOut: { x: cx + rx, y: cy + ry * kappa },
			},
			{
				x: cx,
				y: cy + ry,
				controlIn: { x: cx + rx * kappa, y: cy + ry },
				controlOut: { x: cx - rx * kappa, y: cy + ry },
			},
			{
				x: cx - rx,
				y: cy,
				controlIn: { x: cx - rx, y: cy + ry * kappa },
				controlOut: { x: cx - rx, y: cy - ry * kappa },
			},
		];
	} else {
		const maximum = 96;
		const points =
			shape.points.length <= maximum
				? shape.points
				: Array.from(
						{ length: maximum },
						(_, index) =>
							shape.points[Math.floor((index * shape.points.length) / maximum)],
					);
		nodes = points.map(straightBezierNode);
	}
	return { nodes, selectionCombine: "replace", closed: true };
}

function ensureEditableSelection(): boolean {
	const cached = cachedBezierSelection.value;
	if (cached?.selection === editor.selection.value) {
		bezierDraft.value = cloneBezierDraft(cached.draft);
		activeBezierNodeIndex.value = bezierDraft.value.nodes.length ? 0 : null;
		return true;
	}
	const draft = selectionToBezierDraft();
	if (!draft) return false;
	bezierDraft.value = draft;
	activeBezierNodeIndex.value = draft.nodes.length ? 0 : null;
	rememberClosedBezierSelection(draft);
	redrawOverlay();
	return true;
}

function bezierDraftBounds(): { x: number; y: number; width: number; height: number } | null {
	const nodes = bezierDraft.value?.nodes;
	if (!nodes?.length) return null;
	const points = nodes.flatMap((node) => [
		{ x: node.x, y: node.y },
		node.controlIn,
		node.controlOut,
	]);
	const xs = points.map((point) => point.x);
	const ys = points.map((point) => point.y);
	return normalizedRect(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
}

function polygonArea(points: readonly { x: number; y: number }[]): number {
	let area = 0;
	for (let index = 0; index < points.length; index++) {
		const current = points[index];
		const next = points[(index + 1) % points.length];
		area += current.x * next.y - next.x * current.y;
	}
	return area / 2;
}

function applyBezierSelection(draft: BezierSelectionDraft, label: string): boolean {
	if (draft.nodes.length < 3) return false;
	const points = flattenClosedBezierPath(draft.nodes);
	if (points.length < 3 || Math.abs(polygonArea(points)) < 1) {
		editor.lastError.value = "A Bézier selection needs an enclosed area.";
		return false;
	}
	const result = editor.apply(
		[
			{
				type: "selection.setPolygon",
				points: points.map((point) => ({
					x: Math.round(point.x * 100) / 100,
					y: Math.round(point.y * 100) / 100,
				})),
				feather: editor.selectionFeather.value,
				combine: draft.closed ? "replace" : draft.selectionCombine,
			} as PsdEditorAction,
		],
		label,
	);
	if (!result) return false;
	if (draft.closed) rememberClosedBezierSelection(draft);
	return true;
}

function rememberClosedBezierSelection(draft: BezierSelectionDraft): void {
	const selection = editor.selection.value;
	if (!draft.closed || !selection) return;
	cachedBezierSelection.value = {
		draft: cloneBezierDraft(draft),
		selection,
	};
}

function restoreClosedBezierSelection(): void {
	const cached = cachedBezierSelection.value;
	if (!cached) return;
	if (cached.selection !== editor.selection.value) {
		cachedBezierSelection.value = null;
		return;
	}
	bezierDraft.value = cloneBezierDraft(cached.draft);
	activeBezierNodeIndex.value = bezierDraft.value.nodes.length ? 0 : null;
	redrawOverlay();
}

function commitBezierSelection(): void {
	const draft = bezierDraft.value;
	if (!draft || !applyBezierSelection(draft, "Bézier Selection")) return;
	// Replacing a selection can be edited safely in place. Add/subtract/intersect
	// depend on the previous selection, so close those paths without retaining a
	// misleading editable source contour.
	if (draft.selectionCombine === "replace") {
		draft.closed = true;
		activeBezierNodeIndex.value = draft.nodes.length - 1;
		rememberClosedBezierSelection(draft);
	} else {
		bezierDraft.value = null;
		activeBezierNodeIndex.value = null;
	}
	drag.value = null;
	editor.canvasMeasurement.value = null;
	redrawOverlay();
}

function cancelBezierSelection(): void {
	const draft = bezierDraft.value;
	if (!draft) return;
	if (draft.closed) rememberClosedBezierSelection(draft);
	bezierDraft.value = null;
	activeBezierNodeIndex.value = null;
	if (drag.value?.kind === "bezier") drag.value = null;
	editor.canvasMeasurement.value = null;
	redrawOverlay();
}

function bezierNodeHasHandles(node: BezierSelectionNode): boolean {
	return (
		Math.hypot(node.controlIn.x - node.x, node.controlIn.y - node.y) > 0.25 ||
		Math.hypot(node.controlOut.x - node.x, node.controlOut.y - node.y) > 0.25
	);
}

const bezierDraftPath = computed(() => {
	const draft = bezierDraft.value;
	if (!draft) return "";
	// Keep the rubber-band segment visible while the pointer is held down. Hiding
	// it during an anchor drag made the path appear to vanish until pointerup,
	// especially when shaping the first anchor where there are no older segments.
	const previewPoint = draft.closed ? null : hoverPoint.value;
	return bezierPathData(draft.nodes, draft.closed, previewPoint);
});

const bezierAnchorRadius = computed(() => 4 / editor.zoom.value);
const bezierHandleRadius = computed(() => 3.5 / editor.zoom.value);
const bezierInsertPreview = computed(() => {
	if (
		editor.selectionInteraction.value !== "edit" ||
		!hoverPoint.value ||
		bezierEditTarget(hoverPoint.value)
	)
		return null;
	return bezierSegmentTarget(hoverPoint.value)?.point ?? null;
});

const selectionOutlinePath = computed(() => {
	const selection = editor.selection.value;
	const width = canvasWidth.value;
	const height = canvasHeight.value;
	if (!selection || !width || !height) return "";
	if (selection.shape.kind !== "pixels") {
		const shapePath = simpleSelectionPath(selection.shape);
		return selection.inverted ? `M0 0H${width}V${height}H0Z${shapePath}` : shapePath;
	}
	return pixelSelectionPath(rasterizeSelection(selection, width, height), width, height);
});

const selectionOutlineTransform = computed(() => {
	const offset = selectionMoveOffset.value;
	return offset ? `translate(${offset.dx} ${offset.dy})` : undefined;
});

/** Draws the selection outline plus any in-progress drafts onto the overlay. */
function redrawOverlay(): void {
	const surface = overlay.value;
	if (!surface) return;
	const window = largeCanvas() ? viewRegion() : null;
	const scale = window ? editor.zoom.value*(globalThis.devicePixelRatio||1) : 1;
	const width = window ? Math.ceil(window.width*scale) : canvasWidth.value;
	const height = window ? Math.ceil(window.height*scale) : canvasHeight.value;
	if (surface.width !== width) surface.width = width;
	if (surface.height !== height) surface.height = height;
	const context = surface.getContext("2d");
	if (!context || !surface.width || !surface.height) return;
	context.setTransform(1,0,0,1,0,0);
	context.clearRect(0, 0, surface.width, surface.height);
	if(window)context.setTransform(scale,0,0,scale,-window.x*scale,-window.y*scale);

	if (snapGuides.value.x !== null || snapGuides.value.y !== null) {
		context.save();
		context.strokeStyle = "#ff4fd8";
		context.lineWidth = 1 / editor.zoom.value;
		context.setLineDash([4 / editor.zoom.value, 3 / editor.zoom.value]);
		context.beginPath();
		if (snapGuides.value.x !== null) {
			context.moveTo(snapGuides.value.x, 0);
			context.lineTo(snapGuides.value.x, canvasHeight.value);
		}
		if (snapGuides.value.y !== null) {
			context.moveTo(0, snapGuides.value.y);
			context.lineTo(canvasWidth.value, snapGuides.value.y);
		}
		context.stroke();
		context.restore();
	}
	const state = drag.value;
	if (!state) return;
	if (
		state.kind === "paint" &&
		state.points.length &&
		editor.editTarget.value !== "mask" &&
		!["heal", "blur", "clone"].includes(editor.tool.value)
	) {
		const tool = editor.tool.value;
		const eraser = tool === "eraser";
		context.globalAlpha =
			eraser || tool === "dodge" || tool === "burn" ? 0.4 : editor.brushOpacity.value;
		context.strokeStyle =
			tool === "brush"
				? editor.foreground.value
				: tool === "dodge"
					? "#ffffff"
					: tool === "burn"
						? "#000000"
						: "#888888";
		context.lineWidth = editor.brushSize.value;
		context.lineCap = "round";
		context.lineJoin = "round";
		if (state.points.length === 1) {
			context.beginPath();
			context.arc(
				state.points[0].x,
				state.points[0].y,
				editor.brushSize.value / 2,
				0,
				Math.PI * 2,
			);
			context.fillStyle = context.strokeStyle;
			context.fill();
		} else {
			context.beginPath();
			context.moveTo(state.points[0].x, state.points[0].y);
			for (const point of state.points) context.lineTo(point.x, point.y);
			context.stroke();
		}
		context.globalAlpha = 1;
	} else if (state.kind === "lasso" && state.points.length > 1) {
		const zoom = editor.zoom.value;
		context.strokeStyle = "#ffffff";
		context.setLineDash([4 / zoom, 3 / zoom]);
		context.lineWidth = 1 / zoom;
		context.beginPath();
		context.moveTo(state.points[0].x, state.points[0].y);
		for (const point of state.points) context.lineTo(point.x, point.y);
		context.stroke();
		context.setLineDash([]);
	} else if (state.kind === "gradient") {
		const foreground = editor.gradientReverse.value
			? editor.background.value
			: editor.foreground.value;
		const background = editor.gradientReverse.value
			? editor.foreground.value
			: editor.background.value;
		const gradient =
			editor.gradientType.value === "radial"
				? context.createRadialGradient(
						state.startX,
						state.startY,
						0,
						state.startX,
						state.startY,
						Math.max(
							1,
							Math.hypot(state.lastX - state.startX, state.lastY - state.startY),
						),
					)
				: context.createLinearGradient(
						state.startX,
						state.startY,
						state.lastX,
						state.lastY,
					);
		gradient.addColorStop(0, foreground);
		gradient.addColorStop(1, background);
		context.save();
		context.globalAlpha = editor.gradientOpacity.value;
		context.fillStyle = gradient;
		context.fillRect(0, 0, surface.width, surface.height);
		context.restore();
		context.strokeStyle = "#ffffff";
		context.lineWidth = 1;
		context.setLineDash([5, 3]);
		context.beginPath();
		context.moveTo(state.startX, state.startY);
		context.lineTo(state.lastX, state.lastY);
		context.stroke();
		context.setLineDash([]);
	} else if (state.kind === "shape" && shapeDraft.value) {
		const draft = shapeDraft.value;
		context.save();
		context.globalAlpha = editor.shapeOpacity.value;
		context.fillStyle = editor.foreground.value;
		context.strokeStyle =
			editor.shapeKind.value === "line" ? editor.foreground.value : editor.background.value;
		context.lineWidth = editor.shapeStrokeWidth.value;
		if (editor.shapeKind.value === "ellipse") {
			context.beginPath();
			context.ellipse(
				draft.x + draft.width / 2,
				draft.y + draft.height / 2,
				Math.abs(draft.width / 2),
				Math.abs(draft.height / 2),
				0,
				0,
				Math.PI * 2,
			);
			if (editor.shapeFillEnabled.value) context.fill();
			if (editor.shapeStrokeEnabled.value) context.stroke();
		} else if (editor.shapeKind.value === "rounded-rectangle") {
			context.beginPath();
			context.roundRect(
				draft.x,
				draft.y,
				draft.width,
				draft.height,
				Math.min(
					editor.shapeCornerRadius.value,
					Math.abs(draft.width) / 2,
					Math.abs(draft.height) / 2,
				),
			);
			if (editor.shapeFillEnabled.value) context.fill();
			if (editor.shapeStrokeEnabled.value) context.stroke();
		} else if (editor.shapeKind.value === "line") {
			context.beginPath();
			context.moveTo(state.startX, state.startY);
			context.lineTo(state.lastX, state.lastY);
			context.stroke();
		} else {
			if (editor.shapeFillEnabled.value)
				context.fillRect(draft.x, draft.y, draft.width, draft.height);
			if (editor.shapeStrokeEnabled.value)
				context.strokeRect(draft.x, draft.y, draft.width, draft.height);
		}
		context.restore();
	} else if (state.kind === "marquee" && marqueeDraft.value) {
		const draft = marqueeDraft.value;
		const zoom = editor.zoom.value;
		const drawDraftPath = () => {
			context.beginPath();
			if (editor.marqueeShape.value === "ellipse") {
				context.ellipse(
					draft.x + draft.width / 2,
					draft.y + draft.height / 2,
					draft.width / 2,
					draft.height / 2,
					0,
					0,
					Math.PI * 2,
				);
			} else {
				context.rect(draft.x, draft.y, draft.width, draft.height);
			}
			context.stroke();
		};
		context.save();
		context.lineWidth = 1 / zoom;
		context.setLineDash([4 / zoom, 4 / zoom]);
		context.strokeStyle = "#000000";
		context.lineDashOffset = 0;
		drawDraftPath();
		context.strokeStyle = "#ffffff";
		context.lineDashOffset = 4 / zoom;
		drawDraftPath();
		context.restore();
	}
}

watch(
	() => [editor.revision.value, editor.document.value, editor.previewDocument.value],
	() => {
		if (!editor.layerVisualPreview.value && !moveSelectionPreview.value) repaint();
		redrawOverlay();
	},
	{ flush: "post" },
);
let viewportObserver: ResizeObserver | null = null;
onMounted(() => {
	repaint();
	redrawOverlay();
});

watch(
	viewport,
	(surface) => {
		viewportObserver?.disconnect();
		viewportObserver = null;
		if (!surface) return;
		const updateSize = () => {
			const width = surface.clientWidth;
			const height = surface.clientHeight;
			if (viewportSize.value.width === width && viewportSize.value.height === height) return;
			viewportSize.value = { width, height };
			centerCanvas();
		};
		viewportObserver = new ResizeObserver(updateSize);
		viewportObserver.observe(surface);
		updateSize();
	},
	{ flush: "post" },
);

let centeredSession: PsdEditorSession | null = null;
watch(
	() => [editor.session.value, viewportSize.value.width, viewportSize.value.height] as const,
	([session, width, height]) => {
		if (!session || !width || !height || session === centeredSession) return;
		centeredSession = session;
		centerCanvas();
	},
	{ flush: "post" },
);

watch(
	() => editor.revealRequest.value,
	(id) => {
		if (!id) return;
		centerCanvas();
		editor.revealRequest.value = null;
	},
);

const activeFrame = computed(() => {
	void editor.revision.value;
	const layer = editor.activeLayer.value;
	return layer ? layerFrame(layer) : null;
});

const activeLayerCanScale = computed(() => {
	const layer = editor.activeLayer.value;
	return editor.transformMode.value === "distort"
		? editor.selectedLayerIds.value.length > 0
		: editor.selectedLayerIds.value.length === 1 && Boolean(layer && layer.kind !== "group");
});

function cancelBackdropWarmup(): void {
	if (backdropIdleHandle === null) return;
	if ("cancelIdleCallback" in globalThis)
		globalThis.cancelIdleCallback(backdropIdleHandle as number);
	else globalThis.clearTimeout(backdropIdleHandle);
	backdropIdleHandle = null;
}

function warmBackdrop(layerId: string, revision: number): void {
	if(largeCanvas())return;
	backdropIdleHandle = null;
	const document = editor.document.value;
	const layer = findLayer(layerId, document);
	if (
		!document ||
		!layer ||
		editor.revision.value !== revision ||
		editor.activeLayer.value?.id !== layerId
	)
		return;
	const backdrop = cloneDocumentStructure(document);
	const backdropLayer = findLayer(layerId, backdrop);
	if (!backdropLayer) return;
	backdropLayer.visible = false;
	const bitmap = composePsdDocument(backdrop);
	if (editor.revision.value === revision && editor.activeLayer.value?.id === layerId)
		backdropCache = { layerId, revision, bitmap };
}

watch(
	() => [editor.activeLayer.value?.id ?? null, editor.revision.value] as const,
	([layerId, revision]) => {
		cancelBackdropWarmup();
		if (editor.document.value && usesFastMovePreview(editor.document.value)) return;
		if (!layerId || (backdropCache?.layerId === layerId && backdropCache.revision === revision))
			return;
		if ("requestIdleCallback" in globalThis) {
			backdropIdleHandle = globalThis.requestIdleCallback(
				() => warmBackdrop(layerId, revision),
				{ timeout: 600 },
			);
		} else {
			backdropIdleHandle = globalThis.setTimeout(() => warmBackdrop(layerId, revision), 180);
		}
	},
	{ flush: "post" },
);

function canvasPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
	const canvas = canvasFrame.value;
	if (!canvas) return { x: 0, y: 0 };
	const rect = canvas.getBoundingClientRect();
	return {
		x: ((event.clientX - rect.left) / rect.width) * canvasWidth.value,
		y: ((event.clientY - rect.top) / rect.height) * canvasHeight.value,
	};
}

function hitCorner(
	point: { x: number; y: number },
	frame: { x: number; y: number; width: number; height: number },
): string | null {
	const grip = 8 / editor.zoom.value;
	const corners: Array<[string, number, number]> = [
		["nw", frame.x, frame.y],
		["ne", frame.x + frame.width, frame.y],
		["sw", frame.x, frame.y + frame.height],
		["se", frame.x + frame.width, frame.y + frame.height],
	];
	for (const [name, cx, cy] of corners) {
		if (Math.abs(point.x - cx) <= grip && Math.abs(point.y - cy) <= grip) return name;
	}
	return null;
}

function normalizedRect(x1: number, y1: number, x2: number, y2: number) {
	return {
		x: Math.round(Math.min(x1, x2)),
		y: Math.round(Math.min(y1, y2)),
		width: Math.round(Math.abs(x2 - x1)),
		height: Math.round(Math.abs(y2 - y1)),
	};
}

function updateCanvasPointer(point: { x: number; y: number }): void {
	const x = Math.floor(point.x);
	const y = Math.floor(point.y);
	if (x < 0 || y < 0 || x >= canvasWidth.value || y >= canvasHeight.value) {
		editor.canvasPointer.value = null;
		return;
	}
	editor.canvasPointer.value = {
		x,
		y,
		color: editor.sampleCompositePixel(x, y),
	};
}

function roundedMeasurement(rect: { x: number; y: number; width: number; height: number }): {
	x: number;
	y: number;
	width: number;
	height: number;
} {
	return {
		x: Math.round(rect.x),
		y: Math.round(rect.y),
		width: Math.max(0, Math.round(rect.width)),
		height: Math.max(0, Math.round(rect.height)),
	};
}

function publishCanvasMeasurement(state: DragState): void {
	let measurement: { x: number; y: number; width: number; height: number } | null = null;
	switch (state.kind) {
		case "marquee":
			measurement = marqueeDraft.value;
			break;
		case "crop":
			measurement = cropDraft.value;
			break;
		case "shape":
			measurement = shapeDraft.value;
			break;
		case "gradient":
			measurement = normalizedRect(state.startX, state.startY, state.lastX, state.lastY);
			break;
		case "lasso":
			if (state.points.length) {
				const xs = state.points.map((point) => point.x);
				const ys = state.points.map((point) => point.y);
				measurement = normalizedRect(
					Math.min(...xs),
					Math.min(...ys),
					Math.max(...xs),
					Math.max(...ys),
				);
			}
			break;
		case "bezier":
			measurement = bezierDraftBounds();
			break;
		case "move":
			if (state.frame) {
				measurement = {
					...state.frame,
					x: state.frame.x + (moveDelta.value?.dx ?? 0),
					y: state.frame.y + (moveDelta.value?.dy ?? 0),
				};
			}
			break;
		case "selection-move":
			if (state.frame) {
				measurement = {
					...state.frame,
					x: state.frame.x + (selectionMoveOffset.value?.dx ?? 0),
					y: state.frame.y + (selectionMoveOffset.value?.dy ?? 0),
				};
			}
			break;
		case "scale": {
			const preview = editor.layerVisualPreview.value;
			if (preview) measurement = preview;
			break;
		}
	}
	editor.canvasMeasurement.value = measurement ? roundedMeasurement(measurement) : null;
}

function onCanvasPointerLeave(): void {
	// Keep the rubber-band endpoint for an open Bézier path. Clearing it here
	// makes the preview blink out when embedded browsers briefly report a leave
	// while the pointer is still visually over the transformed canvas.
	if (!bezierDraft.value || bezierDraft.value.closed) hoverPoint.value = null;
	if (!drag.value) editor.canvasPointer.value = null;
	if (bezierDraft.value) redrawOverlay();
}

function cropRect(startX: number, startY: number, pointX: number, pointY: number) {
	let endX = Math.max(0, Math.min(canvasWidth.value, pointX));
	let endY = Math.max(0, Math.min(canvasHeight.value, pointY));
	const aspect = editor.cropAspect.value;
	const ratio =
		aspect === "original"
			? canvasWidth.value / Math.max(1, canvasHeight.value)
			: aspect === "1:1"
				? 1
				: aspect === "4:3"
					? 4 / 3
					: aspect === "16:9"
						? 16 / 9
						: null;
	if (ratio) {
		const dx = endX - startX;
		const dy = endY - startY;
		if (Math.abs(dx) / Math.max(1, Math.abs(dy)) > ratio) {
			endY = startY + Math.sign(dy || 1) * (Math.abs(dx) / ratio);
		} else {
			endX = startX + Math.sign(dx || 1) * Math.abs(dy) * ratio;
		}
		endX = Math.max(0, Math.min(canvasWidth.value, endX));
		endY = Math.max(0, Math.min(canvasHeight.value, endY));
	}
	return normalizedRect(startX, startY, endX, endY);
}

function fullCanvasCrop() {
	return { x: 0, y: 0, width: canvasWidth.value, height: canvasHeight.value };
}

function cropAspectRatio(): number | null {
	const aspect = editor.cropAspect.value;
	return aspect === "original"
		? canvasWidth.value / Math.max(1, canvasHeight.value)
		: aspect === "1:1"
			? 1
			: aspect === "4:3"
				? 4 / 3
				: aspect === "16:9"
					? 16 / 9
					: null;
}

function constrainCropFrame(frame: { x: number; y: number; width: number; height: number }) {
	const maxWidth = Math.max(1, canvasWidth.value);
	const maxHeight = Math.max(1, canvasHeight.value);
	const width = Math.min(maxWidth, Math.max(1, Math.round(frame.width)));
	const height = Math.min(maxHeight, Math.max(1, Math.round(frame.height)));
	return {
		x: Math.round(Math.max(0, Math.min(maxWidth - width, frame.x))),
		y: Math.round(Math.max(0, Math.min(maxHeight - height, frame.y))),
		width,
		height,
	};
}

function resizedCropFrame(
	frame: { x: number; y: number; width: number; height: number },
	handle: string,
	point: { x: number; y: number },
	symmetric = false,
) {
	if (symmetric) {
		const cx = frame.x + frame.width / 2,
			cy = frame.y + frame.height / 2;
		let w =
			handle.includes("w") || handle.includes("e")
				? Math.max(1, 2 * Math.abs(point.x - cx))
				: frame.width;
		let h =
			handle.includes("n") || handle.includes("s")
				? Math.max(1, 2 * Math.abs(point.y - cy))
				: frame.height;
		const ratio = cropAspectRatio();
		if (ratio) {
			if (handle === "n" || handle === "s") w = h * ratio;
			else if (handle === "e" || handle === "w") h = w / ratio;
			else if (w / h > ratio) h = w / ratio;
			else w = h * ratio;
		}
		const factor = Math.min(
			1,
			(2 * Math.min(cx, canvasWidth.value - cx)) / w,
			(2 * Math.min(cy, canvasHeight.value - cy)) / h,
		);
		w *= factor;
		h *= factor;
		return constrainCropFrame({ x: cx - w / 2, y: cy - h / 2, width: w, height: h });
	}
	const right = frame.x + frame.width;
	const bottom = frame.y + frame.height;
	const clampedPoint = {
		x: Math.max(0, Math.min(canvasWidth.value, point.x)),
		y: Math.max(0, Math.min(canvasHeight.value, point.y)),
	};
	const ratio = cropAspectRatio();
	if (!ratio) return constrainCropFrame(resizedFrame(frame, handle, clampedPoint));

	const horizontal = handle.includes("w") || handle.includes("e");
	const vertical = handle.includes("n") || handle.includes("s");
	if (horizontal && vertical) {
		const anchorX = handle.includes("w") ? right : frame.x;
		const anchorY = handle.includes("n") ? bottom : frame.y;
		let width = Math.max(1, Math.abs(clampedPoint.x - anchorX));
		let height = Math.max(1, Math.abs(clampedPoint.y - anchorY));
		if (width / height > ratio) height = width / ratio;
		else width = height * ratio;
		const maxWidth = handle.includes("w") ? anchorX : canvasWidth.value - anchorX;
		const maxHeight = handle.includes("n") ? anchorY : canvasHeight.value - anchorY;
		const scale = Math.min(1, maxWidth / width, maxHeight / height);
		width *= scale;
		height *= scale;
		return constrainCropFrame({
			x: handle.includes("w") ? anchorX - width : anchorX,
			y: handle.includes("n") ? anchorY - height : anchorY,
			width,
			height,
		});
	}

	if (horizontal) {
		const anchorX = handle === "w" ? right : frame.x;
		const centerY = frame.y + frame.height / 2;
		let width = Math.max(1, Math.abs(clampedPoint.x - anchorX));
		let height = width / ratio;
		const maxWidth = handle === "w" ? anchorX : canvasWidth.value - anchorX;
		const maxHeight = Math.max(1, 2 * Math.min(centerY, canvasHeight.value - centerY));
		const scale = Math.min(1, maxWidth / width, maxHeight / height);
		width *= scale;
		height *= scale;
		return constrainCropFrame({
			x: handle === "w" ? anchorX - width : anchorX,
			y: centerY - height / 2,
			width,
			height,
		});
	}

	const anchorY = handle === "n" ? bottom : frame.y;
	const centerX = frame.x + frame.width / 2;
	let height = Math.max(1, Math.abs(clampedPoint.y - anchorY));
	let width = height * ratio;
	const maxHeight = handle === "n" ? anchorY : canvasHeight.value - anchorY;
	const maxWidth = Math.max(1, 2 * Math.min(centerX, canvasWidth.value - centerX));
	const scale = Math.min(1, maxWidth / width, maxHeight / height);
	width *= scale;
	height *= scale;
	return constrainCropFrame({
		x: centerX - width / 2,
		y: handle === "n" ? anchorY - height : anchorY,
		width,
		height,
	});
}

function resizedFrame(
	frame: { x: number; y: number; width: number; height: number },
	corner: string,
	point: { x: number; y: number },
	preserveAspect = false,
) {
	const right = frame.x + frame.width;
	const bottom = frame.y + frame.height;
	if (preserveAspect) {
		const anchorX = corner.includes("w") ? right : frame.x;
		const anchorY = corner.includes("n") ? bottom : frame.y;
		const ratio = frame.width / Math.max(1, frame.height);
		let width = Math.max(1, corner.includes("w") ? anchorX - point.x : point.x - anchorX);
		let height = Math.max(1, corner.includes("n") ? anchorY - point.y : point.y - anchorY);
		if (width / height > ratio) height = width / ratio;
		else width = height * ratio;
		width = Math.max(1, Math.round(width));
		height = Math.max(1, Math.round(height));
		return {
			x: corner.includes("w") ? anchorX - width : anchorX,
			y: corner.includes("n") ? anchorY - height : anchorY,
			width,
			height,
		};
	}
	let x = frame.x;
	let y = frame.y;
	let width = frame.width;
	let height = frame.height;
	if (corner.includes("w")) {
		x = Math.min(Math.round(point.x), right - 1);
		width = right - x;
	} else if (corner.includes("e")) {
		width = Math.max(1, Math.round(point.x - frame.x));
	}
	if (corner.includes("n")) {
		y = Math.min(Math.round(point.y), bottom - 1);
		height = bottom - y;
	} else if (corner.includes("s")) {
		height = Math.max(1, Math.round(point.y - frame.y));
	}
	return { x, y, width, height };
}

function beginLayerVisualPreview(layer: Exclude<PsdLayerNode, { kind: "group" }>): void {
	cancelPreviewFinalize();
	editor.layerVisualPreview.value = {
		layerId: layer.id,
		x: layer.left,
		y: layer.top,
		width: layer.bitmap.width,
		height: layer.bitmap.height,
		opacity: layer.visible ? layer.opacity : 0,
	};
}

function snapTargetsForSelection(excludedLeafIds: ReadonlySet<string>): SnapTargets {
	const x = [0, canvasWidth.value / 2, canvasWidth.value];
	const y = [0, canvasHeight.value / 2, canvasHeight.value];
	const width = [canvasWidth.value];
	const height = [canvasHeight.value];
	for (const layer of visibleLeafLayersTopFirst()) {
		if (excludedLeafIds.has(layer.id)) continue;
		const frame = layerFrame(layer);
		if (!frame) continue;
		x.push(frame.x, frame.x + frame.width / 2, frame.x + frame.width);
		y.push(frame.y, frame.y + frame.height / 2, frame.y + frame.height);
		width.push(frame.width);
		height.push(frame.height);
	}
	return { x, y, width, height };
}

function closestSnap(
	movingPoints: readonly number[],
	targets: readonly number[],
	threshold: number,
): { adjustment: number; guide: number } | null {
	let closest: { adjustment: number; guide: number } | null = null;
	for (const moving of movingPoints) {
		for (const target of targets) {
			const adjustment = target - moving;
			if (Math.abs(adjustment) > threshold) continue;
			if (!closest || Math.abs(adjustment) < Math.abs(closest.adjustment))
				closest = { adjustment, guide: target };
		}
	}
	return closest;
}

function snappedMoveDelta(
	frame: { x: number; y: number; width: number; height: number },
	dx: number,
	dy: number,
	targets: SnapTargets | undefined,
): { dx: number; dy: number; guideX: number | null; guideY: number | null } {
	if (!targets) return { dx, dy, guideX: null, guideY: null };
	const threshold = 6 / editor.zoom.value;
	const horizontal = closestSnap(
		[frame.x + dx, frame.x + frame.width / 2 + dx, frame.x + frame.width + dx],
		targets.x,
		threshold,
	);
	const vertical = closestSnap(
		[frame.y + dy, frame.y + frame.height / 2 + dy, frame.y + frame.height + dy],
		targets.y,
		threshold,
	);
	return {
		dx: Math.round(dx + (horizontal?.adjustment ?? 0)),
		dy: Math.round(dy + (vertical?.adjustment ?? 0)),
		guideX: horizontal?.guide ?? null,
		guideY: vertical?.guide ?? null,
	};
}

function snappedMarqueePoint(
	point: { x: number; y: number },
	targets: SnapTargets | undefined,
): { x: number; y: number; guideX: number | null; guideY: number | null } {
	if (!targets) return { ...point, guideX: null, guideY: null };
	const threshold = 6 / editor.zoom.value;
	const horizontal = closestSnap([point.x], targets.x, threshold);
	const vertical = closestSnap([point.y], targets.y, threshold);
	return {
		x: point.x + (horizontal?.adjustment ?? 0),
		y: point.y + (vertical?.adjustment ?? 0),
		guideX: horizontal?.guide ?? null,
		guideY: vertical?.guide ?? null,
	};
}

function betterSnap(
	first: { adjustment: number; guide: number } | null,
	second: { adjustment: number; guide: number } | null,
): { adjustment: number; guide: number } | null {
	if (!first) return second;
	if (!second) return first;
	return Math.abs(first.adjustment) <= Math.abs(second.adjustment) ? first : second;
}

function resizeCornerPoint(
	frame: { x: number; y: number; width: number; height: number },
	corner: string,
): { x: number; y: number } {
	return {
		x: corner.includes("w") ? frame.x : frame.x + frame.width,
		y: corner.includes("n") ? frame.y : frame.y + frame.height,
	};
}

function snappedResizeFrame(
	frame: { x: number; y: number; width: number; height: number },
	corner: string,
	point: { x: number; y: number },
	preserveAspect: boolean,
	targets: SnapTargets | undefined,
): {
	frame: { x: number; y: number; width: number; height: number };
	guideX: number | null;
	guideY: number | null;
} {
	const resized = resizedFrame(frame, corner, point, preserveAspect);
	if (!targets) return { frame: resized, guideX: null, guideY: null };
	const threshold = 6 / editor.zoom.value;
	const dragged = resizeCornerPoint(resized, corner);
	const directionX = corner.includes("w") ? -1 : 1;
	const directionY = corner.includes("n") ? -1 : 1;
	const positionX = closestSnap([dragged.x], targets.x, threshold);
	const positionY = closestSnap([dragged.y], targets.y, threshold);
	const widthMatch = closestSnap([resized.width], targets.width, threshold);
	const heightMatch = closestSnap([resized.height], targets.height, threshold);
	const sizeX = widthMatch
		? {
				adjustment: widthMatch.adjustment * directionX,
				guide: dragged.x + widthMatch.adjustment * directionX,
			}
		: null;
	const sizeY = heightMatch
		? {
				adjustment: heightMatch.adjustment * directionY,
				guide: dragged.y + heightMatch.adjustment * directionY,
			}
		: null;
	const horizontal = betterSnap(positionX, sizeX);
	const vertical = betterSnap(positionY, sizeY);

	if (!preserveAspect) {
		const snappedPoint = {
			x: dragged.x + (horizontal?.adjustment ?? 0),
			y: dragged.y + (vertical?.adjustment ?? 0),
		};
		return {
			frame: resizedFrame(frame, corner, snappedPoint, false),
			guideX: horizontal?.guide ?? null,
			guideY: vertical?.guide ?? null,
		};
	}

	const candidates = [
		horizontal ? { axis: "x" as const, ...horizontal } : null,
		vertical ? { axis: "y" as const, ...vertical } : null,
	].filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
	if (!candidates.length) return { frame: resized, guideX: null, guideY: null };
	candidates.sort((a, b) => Math.abs(a.adjustment) - Math.abs(b.adjustment));
	const chosen = candidates[0];
	const anchorX = corner.includes("w") ? frame.x + frame.width : frame.x;
	const anchorY = corner.includes("n") ? frame.y + frame.height : frame.y;
	const ratio = frame.width / Math.max(1, frame.height);
	let snappedX = dragged.x;
	let snappedY = dragged.y;
	if (chosen.axis === "x") {
		snappedX += chosen.adjustment;
		snappedY = anchorY + directionY * (Math.abs(snappedX - anchorX) / ratio);
	} else {
		snappedY += chosen.adjustment;
		snappedX = anchorX + directionX * (Math.abs(snappedY - anchorY) * ratio);
	}
	return {
		frame: resizedFrame(frame, corner, { x: snappedX, y: snappedY }, true),
		guideX: chosen.axis === "x" ? chosen.guide : null,
		guideY: chosen.axis === "y" ? chosen.guide : null,
	};
}

function drawMoveSelectionCanvases(): void {
	if (!moveSelectionPreview.value) return;
	if (pendingFastMoveSelectionLayers)
		paintFastMoveLayers(moveSelectionCanvas.value, pendingFastMoveSelectionLayers);
	else if (pendingMoveSelectionBitmap)
		paintBitmapToCanvas(moveSelectionCanvas.value, pendingMoveSelectionBitmap);
	if (pendingFastMoveForegroundLayers)
		paintFastMoveLayers(moveForegroundCanvas.value, pendingFastMoveForegroundLayers);
	else if (pendingMoveForegroundBitmap)
		paintBitmapToCanvas(moveForegroundCanvas.value, pendingMoveForegroundBitmap);
}

let pendingMoveSelectionBitmap: PsdBitmap | null = null;
let pendingMoveForegroundBitmap: PsdBitmap | null = null;
type LeafLayer = Exclude<PsdLayerNode, { kind: "group" }>;
let pendingFastMoveSelectionLayers: LeafLayer[] | null = null;
let pendingFastMoveForegroundLayers: LeafLayer[] | null = null;
let fastMoveLayerCanvasCache = new WeakMap<LeafLayer, HTMLCanvasElement>();

function fastMoveCompositeOperation(layer: LeafLayer): GlobalCompositeOperation {
	if (layer.blendMode === "linear-dodge") return "lighter";
	if (layer.blendMode === "linear-burn" || layer.blendMode === "dissolve") return "source-over";
	return layer.blendMode === "normal" ? "source-over" : layer.blendMode;
}

function fastMoveLayerCanvas(layer: LeafLayer): HTMLCanvasElement {
	const cached = fastMoveLayerCanvasCache.get(layer);
	if (cached) return cached;
	const source = globalThis.document.createElement("canvas");
	source.width = layer.bitmap.width;
	source.height = layer.bitmap.height;
	const context = source.getContext("2d");
	if (!context || !source.width || !source.height) return source;

	const pixels = new Uint8ClampedArray(layer.bitmap.data);
	const mask = layer.mask;
	if (mask && !mask.disabled) {
		const maskWidth = mask.right - mask.left;
		const maskHeight = mask.bottom - mask.top;
		if (maskWidth > 0 && maskHeight > 0) {
			for (let y = 0; y < layer.bitmap.height; y++) {
				const maskY = layer.top + y - mask.top;
				for (let x = 0; x < layer.bitmap.width; x++) {
					const maskX = layer.left + x - mask.left;
					const coverage =
						maskX >= 0 && maskY >= 0 && maskX < maskWidth && maskY < maskHeight
							? mask.data[maskY * maskWidth + maskX]
							: mask.defaultColor;
					pixels[(y * layer.bitmap.width + x) * 4 + 3] *= coverage / 255;
				}
			}
		}
	}
	context.putImageData(new ImageData(pixels, source.width, source.height), 0, 0);
	fastMoveLayerCanvasCache.set(layer, source);
	return source;
}

function paintFastMoveLayers(
	canvas: HTMLCanvasElement | null,
	layersTopFirst: readonly LeafLayer[],
): void {
	const document = editor.document.value;
	if (!canvas || !document) return;
	if (canvas.width !== document.width) canvas.width = document.width;
	if (canvas.height !== document.height) canvas.height = document.height;
	const context = canvas.getContext("2d");
	if (!context) return;
	context.clearRect(0, 0, canvas.width, canvas.height);
	context.save();
	for (let index = layersTopFirst.length - 1; index >= 0; index--) {
		const layer = layersTopFirst[index];
		context.globalAlpha = layer.opacity;
		context.globalCompositeOperation = fastMoveCompositeOperation(layer);
		context.drawImage(fastMoveLayerCanvas(layer), layer.left, layer.top);
	}
	context.restore();
}

function beginMoveSelectionPreview(layerIds: string[], leafIds: Set<string>): void {
	const document = editor.document.value;
	if (!document) return;
	cancelPreviewFinalize();
	if (editor.layerVisualPreview.value) editor.layerVisualPreview.value = null;

	const leafOrder = visibleLeafLayersTopFirst();
	const highestSelectedIndex = leafOrder.findIndex((layer) => leafIds.has(layer.id));
	const foregroundIds = new Set(
		highestSelectedIndex > 0
			? leafOrder.slice(0, highestSelectedIndex).map((layer) => layer.id)
			: [],
	);
	if (usesFastMovePreview(document)) {
		tiledMove.value=true;
		moveSelectionPreview.value={layerIds:[...layerIds],dx:0,dy:0,hasForeground:false};
		paintTiledMove();return;
	}
	pendingFastMoveSelectionLayers = null;
	pendingFastMoveForegroundLayers = null;
	const backgroundDocument = cloneDocumentStructure(document);
	hideLeafIds(backgroundDocument, new Set([...leafIds, ...foregroundIds]));
	paintBitmap(composePsdDocument(backgroundDocument));

	const selectedDocument = cloneDocumentStructure(document);
	retainOnlyLeafIds(selectedDocument, leafIds);
	pendingMoveSelectionBitmap = composePsdDocument(selectedDocument);

	pendingMoveForegroundBitmap = null;
	if (foregroundIds.size) {
		const foregroundDocument = cloneDocumentStructure(document);
		retainOnlyLeafIds(foregroundDocument, foregroundIds);
		pendingMoveForegroundBitmap = composePsdDocument(foregroundDocument);
	}

	moveSelectionPreview.value = {
		layerIds: [...layerIds],
		dx: 0,
		dy: 0,
		hasForeground: foregroundIds.size > 0,
	};
	void nextTick(drawMoveSelectionCanvases);
}

watch(moveSelectionPreview,()=>{if(tiledMove.value)paintTiledMove();});

function clearMoveSelectionPreview(repaintDocument: boolean): void {
	tiledMove.value=false;
	moveSelectionPreview.value = null;
	pendingMoveSelectionBitmap = null;
	pendingMoveForegroundBitmap = null;
	pendingFastMoveSelectionLayers = null;
	pendingFastMoveForegroundLayers = null;
	snapGuides.value = { x: null, y: null };
	if (repaintDocument) repaint();
	redrawOverlay();
}

watch(
	() => editor.session.value,
	() => {
		paintAnchor.value = null;
		tileCache.clear();
	},
);
const paintAnchor = ref<{ x: number; y: number; layerId: string; target: string } | null>(null);
function beginDrag(kind: DragState["kind"], point: { x: number; y: number }): DragState {
	const surface = viewport.value;
	const state: DragState = {
		kind,
		startX: point.x,
		startY: point.y,
		lastX: point.x,
		lastY: point.y,
		points: [{ x: point.x, y: point.y }],
		panX: surface?.scrollLeft ?? 0,
		panY: surface?.scrollTop ?? 0,
	};
	drag.value = state;
	return state;
}

function beginCropAdjustment(event: PointerEvent, mode: "move" | "resize", handle?: string): void {
	if (event.button !== 0 || !cropDraft.value || editor.readonly.value) return;
	event.preventDefault();
	try {
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	} catch {
		// The frame-level pointer handlers still keep mouse input usable.
	}
	canvasFrame.value?.focus({ preventScroll: true });
	const point = canvasPoint(event);
	const state = beginDrag("crop", point);
	const draft = cropDraft.value;
	const coversCanvas =
		mode === "move" &&
		draft.x === 0 &&
		draft.y === 0 &&
		draft.width === canvasWidth.value &&
		draft.height === canvasHeight.value;
	state.snapTargets = snapTargetsForSelection(new Set());
	state.cropMode = coversCanvas ? "create" : mode;
	state.corner = handle;
	state.frame = { ...draft };
	if (coversCanvas) cropDraft.value = { x: point.x, y: point.y, width: 0, height: 0 };
}

function selectionCombineForEvent(
	event: Pick<PointerEvent, "shiftKey" | "altKey">,
): "replace" | "add" | "subtract" | "intersect" {
	if (event.shiftKey && event.altKey) return "intersect";
	if (event.shiftKey) return "add";
	if (event.altKey) return "subtract";
	return editor.selectionMode.value;
}

function beginBezierAnchor(event: PointerEvent, point: { x: number; y: number }): void {
	let existing = bezierDraft.value;
	if (existing?.closed) {
		const target = bezierEditTarget(point);
		if (target) {
			activeBezierNodeIndex.value = target.index;
			if (
				target.part === "anchor" &&
				event.detail >= 2 &&
				addDefaultBezierHandles(existing, target.index)
			) {
				applyBezierSelection(existing, "Convert Bézier Point");
				drag.value = null;
				redrawOverlay();
				return;
			}
			const state = beginDrag("bezier", point);
			state.bezierNodeIndex = target.index;
			state.bezierPart = target.part;
			if (target.virtual) {
				state.bezierOriginalNode = cloneBezierNode(existing.nodes[target.index]);
				addDefaultBezierHandles(existing, target.index);
			}
			state.bezierStartNode = cloneBezierNode(existing.nodes[target.index]);
			state.bezierCreateHandles = target.part === "anchor" && event.altKey;
			publishCanvasMeasurement(state);
			redrawOverlay();
			return;
		}
		if (editor.selectionInteraction.value === "edit") {
			const segment = bezierSegmentTarget(point);
			if (segment) {
				const index = insertBezierNode(segment);
				if (index !== null) {
					activeBezierNodeIndex.value = index;
					const state = beginDrag("bezier", point);
					state.bezierNodeIndex = index;
					state.bezierPart = "anchor";
					state.bezierStartNode = cloneBezierNode(existing.nodes[index]);
					applyBezierSelection(existing, "Add Selection Point");
					redrawOverlay();
				}
				return;
			}
			editor.lastError.value = "Click a selection segment or drag an existing anchor point.";
			return;
		}
		bezierDraft.value = null;
		activeBezierNodeIndex.value = null;
		existing = null;
	}
	if (
		existing &&
		existing.nodes.length >= 3 &&
		(event.detail >= 2 || pointNearFirstBezierAnchor(point))
	) {
		commitBezierSelection();
		return;
	}
	const draft =
		existing ??
		({
			nodes: [],
			selectionCombine: selectionCombineForEvent(event),
			closed: false,
		} satisfies BezierSelectionDraft);
	const node: BezierSelectionNode = {
		x: point.x,
		y: point.y,
		controlIn: { x: point.x, y: point.y },
		controlOut: { x: point.x, y: point.y },
	};
	draft.nodes.push(node);
	bezierDraft.value = draft;
	activeBezierNodeIndex.value = draft.nodes.length - 1;
	const state = beginDrag("bezier", point);
	state.bezierNodeIndex = draft.nodes.length - 1;
	publishCanvasMeasurement(state);
	redrawOverlay();
}

function sampleAt(point: { x: number; y: number }): void {
	let sample: { r: number; g: number; b: number } | null = null;
	if (editor.eyedropperSample.value === "current") {
		const layer = editor.activeLayer.value;
		if (layer && layer.kind !== "group") {
			sample = samplePixel(
				layer.bitmap,
				Math.floor(point.x - layer.left),
				Math.floor(point.y - layer.top),
			);
		}
	} else {
		sample = editor.sampleCompositePixel(point.x, point.y);
	}
	if (!sample) {
		editor.lastError.value = "There are no sampleable pixels at this point.";
		return;
	}
	const color = `#${[sample.r, sample.g, sample.b]
		.map((value) => value.toString(16).padStart(2, "0"))
		.join("")}`;
	editor.foreground.value = color;
	sampledPoint.value = { ...point, color };
}

function editablePixelLayer(): Exclude<PsdLayerNode, { kind: "group" }> | null {
	const layer = editor.activeLayer.value;
	if (editor.editTarget.value === "mask") {
		editor.lastError.value =
			"Mask editing supports Brush and Eraser. Select the image thumbnail for this tool.";
		return null;
	}
	if (!layer || layer.kind === "group" || layer.curves || layer.adjustment) {
		editor.lastError.value = "Select a pixel or text layer before using this tool.";
		return null;
	}
	if (layer.locks.all || layer.locks.composite) {
		editor.lastError.value = "The selected layer is locked and cannot be edited.";
		return null;
	}
	return layer;
}

function isSelectionTool(tool: string): boolean {
	return tool === "marquee" || tool === "lasso" || tool === "wand";
}

function pointInsideActiveSelection(point: { x: number; y: number }): boolean {
	const selection = editor.selection.value;
	const x = Math.floor(point.x);
	const y = Math.floor(point.y);
	if (!selection || x < 0 || y < 0 || x >= canvasWidth.value || y >= canvasHeight.value)
		return false;
	const mask = rasterizeSelection(selection, canvasWidth.value, canvasHeight.value);
	return mask[y * canvasWidth.value + x] >= 128;
}

function translateBezierDraft(draft: BezierSelectionDraft, dx: number, dy: number): void {
	for (const node of draft.nodes) {
		node.x += dx;
		node.y += dy;
		node.controlIn.x += dx;
		node.controlIn.y += dy;
		node.controlOut.x += dx;
		node.controlOut.y += dy;
	}
}

function applySelectionTranslation(dx: number, dy: number, label = "Move Selection"): boolean {
	if (!dx && !dy) return false;
	const cached = cachedBezierSelection.value;
	const cachedMatches = cached?.selection === editor.selection.value;
	if (cachedMatches) translateBezierDraft(cached.draft, dx, dy);
	const result = editor.apply(
		[{ type: "selection.translate", dx, dy } as PsdEditorAction],
		label,
	);
	if (result && cachedMatches && cached && editor.selection.value) {
		cached.selection = editor.selection.value;
		if (bezierDraft.value?.closed) bezierDraft.value = cloneBezierDraft(cached.draft);
	}
	return Boolean(result);
}

function beginSelectionMove(point: { x: number; y: number }): void {
	const selection = editor.selection.value;
	if (!selection) return;
	const state = beginDrag("selection-move", point);
	state.frame = selectionBounds(selection.shape);
	selectionMoveOffset.value = { dx: 0, dy: 0 };
	publishCanvasMeasurement(state);
}

function onPointerDown(event: PointerEvent): void {
	if (event.button !== 0 || !editor.document.value) return;
	(event.currentTarget as HTMLElement).focus({ preventScroll: true });
	const point = canvasPoint(event);
	updateCanvasPointer(point);
	const tool = editor.tool.value;
	// Point text is created from the completed click. Waiting for click avoids
	// pointer-capture/focus races that can otherwise immediately dismiss the
	// textarea in embedded browser surfaces.
	if (tool === "text" && !editor.spacePanActive.value) {
		if (editor.readonly.value) {
			editor.lastError.value = "This document is read-only; text cannot be added.";
		}
		return;
	}
	try {
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	} catch {
		// Pointer capture is an enhancement. Some embedded browsers and synthetic
		// input providers reject it even though the pointer event itself is valid.
	}

	if (tool === "hand" || editor.spacePanActive.value) {
		const state = beginDrag("pan", point);
		state.startX = event.clientX;
		state.startY = event.clientY;
		return;
	}
	if (tool === "zoom") {
		const factor = event.altKey ? 1 / 1.25 : 1.25;
		zoomAround(event.clientX, event.clientY, factor);
		return;
	}
	if (tool === "eyedropper") {
		sampleAt(point);
		beginDrag("sample", point);
		return;
	}
	if (
		event.altKey &&
		(tool === "brush" || tool === "eraser" || tool === "dodge" || tool === "burn")
	) {
		sampleAt(point);
		return;
	}
	if (editor.readonly.value) return;
	if (isSelectionTool(tool)) {
		if (editor.selectionInteraction.value === "edit" && editor.selection.value) {
			if (ensureEditableSelection()) beginBezierAnchor(event, point);
			return;
		}
		if (
			editor.selectionMode.value === "replace" &&
			!event.altKey &&
			!event.shiftKey &&
			pointInsideActiveSelection(point)
		) {
			beginSelectionMove(point);
			return;
		}
	}

	if (editor.editTarget.value === "mask" && tool === "move") {
		editor.lastError.value =
			"Use Transform mask independently in the mask controls, or select the image thumbnail to move the image.";
		return;
	}
	switch (tool) {
		case "wand":
			editor.apply(
				[
					{
						type: "selection.magicWand",
						x: Math.floor(point.x),
						y: Math.floor(point.y),
						tolerance: editor.wandTolerance.value,
						contiguous: editor.wandContiguous.value,
						feather: editor.selectionFeather.value,
						combine: selectionCombineForEvent(event),
					} as PsdEditorAction,
				],
				"Magic Wand",
			);
			return;
		case "bucket": {
			const layer = editablePixelLayer();
			if (!layer) return;
			editor.apply(
				[
					{
						type: "bucket.apply",
						layerId: layer.id,
						x: Math.floor(point.x),
						y: Math.floor(point.y),
						color: hexToRgb(editor.foreground.value),
						tolerance: editor.bucketTolerance.value,
						opacity: editor.bucketOpacity.value,
						contiguous: editor.bucketContiguous.value,
					} as PsdEditorAction,
				],
				"Paint Bucket",
			);
			return;
		}
		case "clone":
			if (event.altKey) {
				editor.cloneSource.value = { x: point.x, y: point.y };
				editor.cloneOffset.value = null;
				return;
			}
			if (!editor.cloneSource.value) {
				editor.lastError.value = "Alt-click the canvas to set a clone source first.";
				return;
			}
			if (!editablePixelLayer()) return;
			beginDrag("paint", point);
			scheduleMaskPreview();
			redrawOverlay();
			return;
		case "brush":
		case "eraser":
		case "dodge":
		case "burn":
		case "heal":
		case "blur":
			if (editor.editTarget.value === "mask") {
				const l = editor.activeLayer.value;
				if (
					!l?.mask ||
					l.locks.all ||
					l.locks.composite ||
					!["brush", "eraser", "blur"].includes(tool)
				) {
					editor.lastError.value =
						"Select an unlocked mask and use Brush, Eraser or Blur.";
					return;
				}
			} else if (!editablePixelLayer()) return;
			{
				const state = beginDrag("paint", point),
					anchor = paintAnchor.value;
				if (
					event.shiftKey &&
					(tool === "brush" || tool === "eraser") &&
					anchor &&
					anchor.layerId === editor.activeLayer.value?.id &&
					anchor.target === editor.editTarget.value
				)
					state.points = [{ x: anchor.x, y: anchor.y }, point];
			}
			scheduleMaskPreview();
			redrawOverlay();
			return;
		case "gradient":
			if (!editablePixelLayer()) return;
			beginDrag("gradient", point);
			return;
		case "shape":
			if (!editablePixelLayer()) return;
			beginDrag("shape", point);
			shapeDraft.value = { x: point.x, y: point.y, width: 0, height: 0 };
			return;
		case "lasso":
			if (editor.lassoMode.value === "bezier") {
				if (!bezierDraft.value) restoreClosedBezierSelection();
				beginBezierAnchor(event, point);
			} else beginDrag("lasso", point).selectionCombine = selectionCombineForEvent(event);
			return;
		case "marquee":
			{
				const state = beginDrag("marquee", point);
				state.selectionCombine = selectionCombineForEvent(event);
				state.snapTargets = snapTargetsForSelection(new Set());
			}
			marqueeDraft.value = { x: point.x, y: point.y, width: 0, height: 0 };
			return;
		case "crop":
			{
				const state = beginDrag("crop", point);
				state.cropMode = "create";
				state.snapTargets = snapTargetsForSelection(new Set());
				state.frame = cropDraft.value ? { ...cropDraft.value } : undefined;
			}
			cropDraft.value = { x: point.x, y: point.y, width: 0, height: 0 };
			return;
		default: {
			// Move selected pixels onto their own layer in one undoable operation.
			const pixelLayer = editor.activeLayer.value;
			if (
				editor.selection.value &&
				editor.editTarget.value === "image" &&
				pixelLayer &&
				pixelLayer.kind !== "group" &&
				pointInsideActiveSelection(point)
			) {
				const state = beginDrag("pixels-move", point);
				state.layerIds = [pixelLayer.id];
				state.copyPixels = event.altKey;
				return;
			}
			const selectedFrame = activeFrame.value;
			const selectedCorner =
				selectedFrame && editor.showTransformControls.value && activeLayerCanScale.value
					? hitCorner(point, selectedFrame)
					: null;
			if (!selectedCorner && editor.moveAutoSelect.value) {
				const hit = layersAtPoint(point)[0];
				if (hit) {
					const selectedLeafIds = leafIdsForLayers(effectiveSelectedLayerIds());
					const hitBelongsToSelection = selectedLeafIds.has(hit.id);
					if (event.shiftKey && !hitBelongsToSelection) editor.selectLayer(hit.id, true);
					else if (
						!hitBelongsToSelection &&
						!editor.selectedLayerIds.value.includes(hit.id)
					)
						editor.selectLayer(hit.id);
				}
			}
			const layer = editor.activeLayer.value;
			const frame = activeFrame.value;
			const corner =
				frame &&
				activeLayerCanScale.value &&
				(selectedCorner ??
					(editor.showTransformControls.value ? hitCorner(point, frame) : null));
			if (corner) {
				if (
					!layer ||
					(layer.kind === "group" && editor.transformMode.value !== "distort") ||
					layer.locks.all ||
					layer.locks.composite ||
					layer.locks.position
				) {
					editor.lastError.value =
						"The selected layer is locked and cannot be transformed.";
					return;
				}
				if (event.metaKey || event.ctrlKey || editor.transformMode.value === "distort") {
					const state = beginDrag("distort", point);
					state.layerIds = effectiveSelectedLayerIds();
					state.frame = { ...frame };
					state.corner = corner;
					state.corners = [
						{ x: frame.x, y: frame.y },
						{ x: frame.x + frame.width, y: frame.y },
						{ x: frame.x + frame.width, y: frame.y + frame.height },
						{ x: frame.x, y: frame.y + frame.height },
					];
					return;
				}
				if (layer.kind === "group") return;
				const state = beginDrag("scale", point);
				state.corner = corner;
				state.frame = { ...frame };
				state.snapTargets = snapTargetsForSelection(leafIdsForLayers([layer.id]));
				beginLayerVisualPreview(layer);
				return;
			}

			const layerIds = effectiveSelectedLayerIds();
			const layers = layerIds
				.map((id) => findLayer(id))
				.filter((candidate): candidate is PsdLayerNode => Boolean(candidate));
			if (!layers.length) return;
			if (
				layers.some(
					(candidate) =>
						candidate.locks.all ||
						candidate.locks.composite ||
						candidate.locks.position,
				)
			) {
				editor.lastError.value = "Unlock every selected layer before moving the selection.";
				return;
			}
			const selectionFrame = combinedLayerFrame(layerIds);
			if (!selectionFrame) return;
			const leafIds = leafIdsForLayers(layerIds);
			const state = beginDrag("move", point);
			state.frame = selectionFrame;
			state.layerIds = layerIds;
			state.leafIds = leafIds;
			state.snapTargets = snapTargetsForSelection(leafIds);
			moveDelta.value = { dx: 0, dy: 0 };
			beginMoveSelectionPreview(layerIds, leafIds);
		}
	}
}

function onCanvasClick(event: MouseEvent): void {
	if (
		event.button !== 0 ||
		editor.tool.value !== "text" ||
		editor.spacePanActive.value ||
		!editor.document.value
	)
		return;
	if (editor.readonly.value) {
		editor.lastError.value = "This document is read-only; text cannot be added.";
		return;
	}
	startTextEditing(canvasPoint(event));
}

function onPasteboardPointerDown(event: PointerEvent): void {
	if (
		event.button === 0 &&
		editor.document.value &&
		editor.tool.value === "text" &&
		!editor.spacePanActive.value
	) {
		editor.lastError.value = editor.readonly.value
			? "This document is read-only; text cannot be added."
			: "Click inside the document image to place text.";
		return;
	}
	if (
		event.button !== 0 ||
		!editor.document.value ||
		(editor.tool.value !== "hand" && !editor.spacePanActive.value)
	)
		return;
	try {
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	} catch {
		// Keep panning usable when the host does not support pointer capture.
	}
	const state = beginDrag("pan", { x: 0, y: 0 });
	state.startX = event.clientX;
	state.startY = event.clientY;
}

function onPointerMove(event: PointerEvent): void {
	const point = canvasPoint(event);
	hoverPoint.value = point;
	updateCanvasPointer(point);
	const state = drag.value;
	if (!state) {
		if (bezierDraft.value) redrawOverlay();
		return;
	}
	if (state.kind === "pan") {
		const surface = viewport.value;
		if (surface) {
			surface.scrollLeft = state.panX - (event.clientX - state.startX);
			surface.scrollTop = state.panY - (event.clientY - state.startY);
		}
		return;
	}
	state.lastX = point.x;
	state.lastY = point.y;
	switch (state.kind) {
		case "sample":
			sampleAt(point);
			break;
		case "pixels-move": {
			let dx = Math.round(point.x - state.startX),
				dy = Math.round(point.y - state.startY);
			if (event.shiftKey) {
				if (Math.abs(dx) > Math.abs(dy)) dy = 0;
				else dx = 0;
			}
			state.lastX = state.startX + dx;
			state.lastY = state.startY + dy;
			try {
				const preview = new PsdEditorSession(
					cloneDocumentStructure(editor.document.value!),
				);
				preview.apply([
					{
						type: "layer.fromSelection",
						sourceLayerId: state.layerIds![0],
						dx,
						dy,
						cut: !state.copyPixels,
					},
					{ type: "selection.translate", dx, dy },
				]);
				editor.previewDocument.value = preview.peekDocument();
			} catch (e) {
				editor.lastError.value = String(e);
			}
			break;
		}
		case "distort": {
			if (!state.corners || !state.frame) return;
			const i = ({ nw: 0, ne: 1, se: 2, sw: 3 } as Record<string, number>)[
				state.corner ?? ""
			];
			if (i === undefined) return;
			let dx = point.x - state.startX,
				dy = point.y - state.startY;
			if (event.shiftKey) {
				if (Math.abs(dx) > Math.abs(dy)) dy = 0;
				else dx = 0;
			}
			const f = state.frame,
				original = [
					{ x: f.x, y: f.y },
					{ x: f.x + f.width, y: f.y },
					{ x: f.x + f.width, y: f.y + f.height },
					{ x: f.x, y: f.y + f.height },
				];
			state.corners[i] = { x: original[i].x + dx, y: original[i].y + dy };
			try {
				const preview = new PsdEditorSession(
					cloneDocumentStructure(editor.document.value!),
				);
				preview.apply([
					{
						type: "transform.selection",
						layerIds: state.layerIds!,
						corners: state.corners,
					},
				]);
				editor.previewDocument.value = preview.peekDocument();
				editor.lastError.value = "";
			} catch (e) {
				editor.previewDocument.value = null;
				editor.lastError.value = String(e);
			}
			break;
		}
		case "paint":
			state.points.push({ x: point.x, y: point.y });
			scheduleMaskPreview();
			redrawOverlay();
			break;
		case "lasso": {
			const last = state.points[state.points.length - 1];
			if (Math.hypot(point.x - last.x, point.y - last.y) >= 2) {
				state.points.push({ x: point.x, y: point.y });
				redrawOverlay();
			}
			break;
		}
		case "bezier": {
			const draft = bezierDraft.value;
			const node =
				draft && state.bezierNodeIndex !== undefined
					? draft.nodes[state.bezierNodeIndex]
					: null;
			if (node && draft?.closed && state.bezierPart && state.bezierStartNode) {
				const original = state.bezierStartNode;
				const dx = point.x - state.startX;
				const dy = point.y - state.startY;
				if (state.bezierPart === "anchor" && state.bezierCreateHandles) {
					node.controlOut = {
						x: original.x + dx,
						y: original.y + dy,
					};
					node.controlIn = {
						x: original.x - dx,
						y: original.y - dy,
					};
				} else if (state.bezierPart === "anchor") {
					node.x = original.x + dx;
					node.y = original.y + dy;
					node.controlIn = {
						x: original.controlIn.x + dx,
						y: original.controlIn.y + dy,
					};
					node.controlOut = {
						x: original.controlOut.x + dx,
						y: original.controlOut.y + dy,
					};
				} else {
					const moved =
						state.bezierPart === "control-in"
							? {
									x: original.controlIn.x + dx,
									y: original.controlIn.y + dy,
								}
							: {
									x: original.controlOut.x + dx,
									y: original.controlOut.y + dy,
								};
					node[state.bezierPart === "control-in" ? "controlIn" : "controlOut"] = moved;
					if (!event.altKey) {
						const opposite = {
							x: node.x * 2 - moved.x,
							y: node.y * 2 - moved.y,
						};
						node[state.bezierPart === "control-in" ? "controlOut" : "controlIn"] =
							opposite;
					}
				}
				redrawOverlay();
			} else if (node) {
				const dx = point.x - node.x;
				const dy = point.y - node.y;
				node.controlOut = { x: point.x, y: point.y };
				node.controlIn = { x: node.x - dx, y: node.y - dy };
				redrawOverlay();
			}
			break;
		}
		case "gradient":
			redrawOverlay();
			break;
		case "shape":
			if (event.shiftKey) {
				if (editor.shapeKind.value === "line") {
					const distance = Math.hypot(point.x - state.startX, point.y - state.startY);
					const angle =
						Math.round(
							Math.atan2(point.y - state.startY, point.x - state.startX) /
								(Math.PI / 4),
						) *
						(Math.PI / 4);
					state.lastX = state.startX + Math.cos(angle) * distance;
					state.lastY = state.startY + Math.sin(angle) * distance;
				} else {
					const size = Math.max(
						Math.abs(point.x - state.startX),
						Math.abs(point.y - state.startY),
					);
					state.lastX = state.startX + Math.sign(point.x - state.startX || 1) * size;
					state.lastY = state.startY + Math.sign(point.y - state.startY || 1) * size;
				}
			}
			shapeDraft.value = normalizedRect(state.startX, state.startY, state.lastX, state.lastY);
			redrawOverlay();
			break;
		case "marquee": {
			const snapped =
				event.metaKey || event.ctrlKey
					? { ...point, guideX: null, guideY: null }
					: snappedMarqueePoint(point, state.snapTargets);
			state.lastX = snapped.x;
			state.lastY = snapped.y;
			snapGuides.value = { x: snapped.guideX, y: snapped.guideY };
			marqueeDraft.value = normalizedRect(state.startX, state.startY, snapped.x, snapped.y);
			redrawOverlay();
			break;
		}
		case "selection-move": {
			let dx = Math.round(point.x - state.startX);
			let dy = Math.round(point.y - state.startY);
			if (event.shiftKey && (dx || dy)) {
				const distance = Math.hypot(dx, dy);
				const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
				dx = Math.round(Math.cos(angle) * distance);
				dy = Math.round(Math.sin(angle) * distance);
			}
			selectionMoveOffset.value = { dx, dy };
			break;
		}
		case "crop": {
			const snapped =
				event.metaKey || event.ctrlKey
					? { ...point, guideX: null, guideY: null }
					: snappedMarqueePoint(point, state.snapTargets);
			snapGuides.value = { x: snapped.guideX, y: snapped.guideY };
			if (state.cropMode === "move" && state.frame) {
				const dx = point.x - state.startX, dy = point.y - state.startY;
				const move = event.metaKey || event.ctrlKey
					? { dx, dy, guideX: null, guideY: null }
					: snappedMoveDelta(state.frame, dx, dy, state.snapTargets);
				cropDraft.value = constrainCropFrame({
					...state.frame, x: state.frame.x + move.dx, y: state.frame.y + move.dy,
				});
				snapGuides.value = {
					x: cropDraft.value.x === state.frame.x + move.dx ? move.guideX : null,
					y: cropDraft.value.y === state.frame.y + move.dy ? move.guideY : null,
				};
			} else if (state.cropMode === "resize" && state.frame && state.corner) {
				cropDraft.value = resizedCropFrame(
					state.frame,
					state.corner,
					snapped,
					event.altKey,
				);
			} else {
				cropDraft.value = event.altKey
					? resizedCropFrame(
							{ x: state.startX - 0.5, y: state.startY - 0.5, width: 1, height: 1 },
							"se",
							snapped,
							true,
						)
					: cropRect(state.startX, state.startY, snapped.x, snapped.y);
			}
			break;
		}
		case "move":
			if (state.frame) {
				const rawDx = Math.round(point.x - state.startX);
				const rawDy = Math.round(point.y - state.startY);
				const snapped =
					event.metaKey || event.ctrlKey
						? { dx: rawDx, dy: rawDy, guideX: null, guideY: null }
						: snappedMoveDelta(state.frame, rawDx, rawDy, state.snapTargets);
				moveDelta.value = { dx: snapped.dx, dy: snapped.dy };
				snapGuides.value = { x: snapped.guideX, y: snapped.guideY };
				if (moveSelectionPreview.value) {
					moveSelectionPreview.value = {
						...moveSelectionPreview.value,
						dx: snapped.dx,
						dy: snapped.dy,
					};
				}
				redrawOverlay();
			}
			break;
		case "scale":
			if (state.frame && state.corner && editor.layerVisualPreview.value) {
				const snapped =
					event.metaKey || event.ctrlKey
						? {
								frame: resizedFrame(
									state.frame,
									state.corner,
									point,
									event.shiftKey,
								),
								guideX: null,
								guideY: null,
							}
						: snappedResizeFrame(
								state.frame,
								state.corner,
								point,
								event.shiftKey,
								state.snapTargets,
							);
				editor.layerVisualPreview.value = {
					...editor.layerVisualPreview.value,
					...snapped.frame,
				};
				snapGuides.value = { x: snapped.guideX, y: snapped.guideY };
				redrawOverlay();
			}
			break;
	}
	publishCanvasMeasurement(state);
}

let maskPreviewFrame: number | null = null;
function scheduleMaskPreview(): void {
	if (
		(editor.editTarget.value !== "mask" &&
			!["heal", "blur", "clone"].includes(editor.tool.value)) ||
		maskPreviewFrame !== null
	)
		return;
	maskPreviewFrame = requestAnimationFrame(() => {
		maskPreviewFrame = null;
		previewMaskStroke();
	});
}
function cancelMaskPreview(): void {
	if (maskPreviewFrame !== null) cancelAnimationFrame(maskPreviewFrame);
	maskPreviewFrame = null;
}
function previewMaskStroke(): void {
	const state = drag.value,
		doc = editor.document.value,
		layer = editor.activeLayer.value;
	if (
		!state ||
		!doc ||
		!layer ||
		(editor.editTarget.value !== "mask" &&
			!["heal", "blur", "clone"].includes(editor.tool.value))
	)
		return;
	const v = editor.maskPaint.value === "hide" ? 0 : 255;
	try {
		const s = new PsdEditorSession(cloneDocumentStructure(doc));
		s.apply([
			["heal", "blur"].includes(editor.tool.value)
				? retouchAction(state.points)
				: editor.tool.value === "clone"
					? cloneAction(state)
					: {
							type: "stroke.apply",
							layerId: layer.id,
							target: "mask",
							tool: editor.tool.value === "eraser" ? "eraser" : "brush",
							points: state.points,
							size: editor.brushSize.value,
							hardness: editor.brushHardness.value,
							opacity: editor.brushOpacity.value,
							color: { r: v, g: v, b: v },
						},
		]);
		editor.previewDocument.value = s.peekDocument();
	} catch (e) {
		editor.previewDocument.value = null;
		editor.lastError.value = String(e);
	}
}
function cloneAction(state: DragState): PsdStrokeApplyAction {
	const source = editor.cloneSource.value!;
	return {
		type: "stroke.apply",
		layerId: editor.activeLayer.value!.id,
		tool: "clone",
		points: state.points,
		size: editor.brushSize.value,
		hardness: editor.brushHardness.value,
		opacity: editor.brushOpacity.value,
		sampleAllLayers: editor.cloneSampleMerged.value,
		sourceOffset:
			editor.cloneAligned.value && editor.cloneOffset.value
				? editor.cloneOffset.value
				: {
						dx: Math.round(source.x - state.startX),
						dy: Math.round(source.y - state.startY),
					},
	};
}
function retouchAction(points: Array<{ x: number; y: number }>): PsdRetouchAction {
	return {
		type: "retouch.apply",
		layerId: editor.activeLayer.value!.id,
		tool: editor.tool.value === "heal" ? "heal" : "blur",
		target: editor.editTarget.value,
		points,
		size: editor.brushSize.value,
		hardness: editor.brushHardness.value,
		opacity: editor.brushOpacity.value,
		radius: editor.blurRadius.value,
		sampleAllLayers: editor.retouchSampleMerged.value,
	};
}
function onPointerUp(): void {
	cancelMaskPreview();
	const state = drag.value;
	const visualPreview = editor.layerVisualPreview.value;
	drag.value = null;
	editor.canvasMeasurement.value = null;
	if (!state) return;
	const layer = editor.activeLayer.value;
	const tool = editor.tool.value;

	switch (state.kind) {
		case "sample":
			break;
		case "pixels-move": {
			editor.previewDocument.value = null;
			const dx = state.lastX - state.startX,
				dy = state.lastY - state.startY;
			if (dx || dy) {
				const result = editor.apply(
					[
						{
							type: "layer.fromSelection",
							sourceLayerId: state.layerIds![0],
							dx,
							dy,
							cut: !state.copyPixels,
						},
						{ type: "selection.translate", dx, dy },
					],
					state.copyPixels ? "Copy Selected Pixels" : "Move Selected Pixels",
				);
				if (result?.createdIds[0]) editor.selectLayer(result.createdIds[0]);
			}
			repaint();
			break;
		}
		case "distort": {
			editor.previewDocument.value = null;
			if (layer && state.corners)
				editor.apply(
					[
						{
							type: "transform.selection",
							layerIds: state.layerIds!,
							corners: state.corners,
						},
					],
					"Free Distort",
				);
			repaint();
			break;
		}
		case "paint": {
			if (
				layer &&
				(layer.kind !== "group" || editor.editTarget.value === "mask") &&
				state.points.length
			) {
				if (tool === "heal" || tool === "blur") {
					editor.previewDocument.value = null;
					editor.apply(
						[retouchAction(state.points)],
						tool === "heal" ? "Spot healing" : "Blur stroke",
					);
					repaint();
					redrawOverlay();
					break;
				}
				const strokeTool =
					tool === "eraser" || tool === "dodge" || tool === "burn" || tool === "clone"
						? tool
						: "brush";
				const cloneSource = editor.cloneSource.value;
				const action: PsdStrokeApplyAction = {
					type: "stroke.apply",
					layerId: layer.id,
					tool: strokeTool,
					points: state.points.map((p) => ({
						x: Math.round(p.x * 100) / 100,
						y: Math.round(p.y * 100) / 100,
					})),
					size: editor.brushSize.value,
					hardness: editor.brushHardness.value,
					opacity:
						strokeTool === "dodge" || strokeTool === "burn"
							? editor.dodgeBurnExposure.value
							: editor.brushOpacity.value,
					...(strokeTool === "dodge" || strokeTool === "burn"
						? { tonalRange: editor.dodgeBurnRange.value }
						: {}),
					...(strokeTool === "brush" ? { color: hexToRgb(editor.foreground.value) } : {}),
					...(strokeTool === "clone" && cloneSource
						? {
								sampleAllLayers: editor.cloneSampleMerged.value,
								sourceOffset:
									editor.cloneAligned.value && editor.cloneOffset.value
										? editor.cloneOffset.value
										: {
												dx: Math.round(cloneSource.x - state.startX),
												dy: Math.round(cloneSource.y - state.startY),
											},
							}
						: {}),
				};
				if (editor.editTarget.value === "mask") {
					action.target = "mask";
					const v = editor.maskPaint.value === "hide" ? 0 : 255;
					action.color = { r: v, g: v, b: v };
				}
				editor.previewDocument.value = null;
				const applied = editor.apply(
					[action],
					strokeTool.charAt(0).toUpperCase() + strokeTool.slice(1),
				);
				if (applied && (strokeTool === "brush" || strokeTool === "eraser"))
					paintAnchor.value = {
						...state.points[state.points.length - 1],
						layerId: layer.id,
						target: editor.editTarget.value,
					};
				if (applied && strokeTool === "clone" && action.sourceOffset)
					editor.cloneOffset.value = action.sourceOffset;
			}
			redrawOverlay();
			break;
		}
		case "lasso": {
			if (state.points.length >= 3) {
				editor.apply(
					[
						{
							type: "selection.setPolygon",
							points: state.points.map((p) => ({
								x: Math.round(p.x),
								y: Math.round(p.y),
							})),
							feather: editor.selectionFeather.value,
							combine: state.selectionCombine,
						} as PsdEditorAction,
					],
					"Lasso",
				);
			}
			redrawOverlay();
			break;
		}
		case "bezier": {
			const draft = bezierDraft.value;
			const node =
				draft && state.bezierNodeIndex !== undefined
					? draft.nodes[state.bezierNodeIndex]
					: null;
			if (
				draft?.closed &&
				state.bezierPart &&
				node &&
				bezierNodeChanged(node, state.bezierOriginalNode ?? state.bezierStartNode)
			)
				applyBezierSelection(draft, "Adjust Bézier Selection");
			// Before closing, each pointer gesture places one anchor. Once closed,
			// pointer gestures move an anchor or one of its control handles.
			redrawOverlay();
			break;
		}
		case "marquee": {
			const draft = marqueeDraft.value;
			marqueeDraft.value = null;
			snapGuides.value = { x: null, y: null };
			if (draft && draft.width > 1 && draft.height > 1) {
				editor.apply(
					[
						{
							type: "selection.set",
							shape: editor.marqueeShape.value,
							...draft,
							feather: editor.selectionFeather.value,
							combine: state.selectionCombine,
						} as PsdEditorAction,
					],
					"Select",
				);
			} else if (state.selectionCombine === "replace") {
				editor.apply([{ type: "selection.clear" } as PsdEditorAction], "Deselect");
			}
			redrawOverlay();
			break;
		}
		case "selection-move": {
			const offset = selectionMoveOffset.value;
			selectionMoveOffset.value = null;
			if (offset && (offset.dx || offset.dy)) {
				applySelectionTranslation(offset.dx, offset.dy);
			}
			break;
		}
		case "gradient": {
			if (layer && layer.kind !== "group") {
				const distance = Math.hypot(state.lastX - state.startX, state.lastY - state.startY);
				if (distance >= 2) {
					editor.apply(
						[
							{
								type: "gradient.apply",
								layerId: layer.id,
								gradientType: editor.gradientType.value,
								from: { x: Math.round(state.startX), y: Math.round(state.startY) },
								to: { x: Math.round(state.lastX), y: Math.round(state.lastY) },
								stops: [
									{
										at: 0,
										color: hexToRgb(
											editor.gradientReverse.value
												? editor.background.value
												: editor.foreground.value,
										),
									},
									{
										at: 1,
										color: hexToRgb(
											editor.gradientReverse.value
												? editor.foreground.value
												: editor.background.value,
										),
									},
								],
								opacity: editor.gradientOpacity.value,
							} as PsdEditorAction,
						],
						"Gradient",
					);
				}
			}
			redrawOverlay();
			break;
		}
		case "shape": {
			const draft = shapeDraft.value;
			shapeDraft.value = null;
			if (layer && layer.kind !== "group" && draft && (draft.width > 1 || draft.height > 1)) {
				const kind = editor.shapeKind.value;
				const geometry =
					kind === "line"
						? {
								x: Math.round(state.startX),
								y: Math.round(state.startY),
								width: Math.round(state.lastX - state.startX),
								height: Math.round(state.lastY - state.startY),
							}
						: draft;
				const stroked = kind === "line" || editor.shapeStrokeEnabled.value;
				const action: PsdShapeApplyAction = {
					type: "shape.apply",
					layerId: layer.id,
					shape: kind,
					...geometry,
					...(stroked
						? {
								stroke: hexToRgb(
									kind === "line"
										? editor.foreground.value
										: editor.background.value,
								),
								strokeWidth: editor.shapeStrokeWidth.value,
							}
						: {}),
					...(kind !== "line" && editor.shapeFillEnabled.value
						? { fill: hexToRgb(editor.foreground.value) }
						: {}),
					opacity: editor.shapeOpacity.value,
				};
				editor.apply([action], "Shape");
			}
			redrawOverlay();
			break;
		}
		case "crop": {
			const draft = cropDraft.value;
			if (state.cropMode === "create" && (!draft || draft.width < 2 || draft.height < 2)) {
				cropDraft.value = state.frame ?? fullCanvasCrop();
			}
			break; // The crop bar, double-click, or Enter applies the crop.
		}
		case "move": {
			const delta = moveDelta.value;
			moveDelta.value = null;
			let committed = false;
			if (state.layerIds?.length && delta) {
				const { dx, dy } = delta;
				if (dx || dy) {
					committed = Boolean(
						editor.apply(
							state.layerIds.map(
								(layerId) =>
									({ type: "layer.move", layerId, dx, dy }) as PsdEditorAction,
							),
							state.layerIds.length > 1 ? "Move Layers" : "Move",
						),
					);
				}
			}
			clearMoveSelectionPreview(!committed);
			break;
		}
		case "scale": {
			snapGuides.value = { x: null, y: null };
			if (
				layer &&
				layer.kind !== "group" &&
				state.frame &&
				visualPreview?.layerId === layer.id
			) {
				const frame = state.frame;
				const actions: PsdEditorAction[] = [];
				const dx = visualPreview.x - frame.x;
				const dy = visualPreview.y - frame.y;
				if (dx || dy) {
					actions.push({ type: "layer.move", layerId: layer.id, dx, dy });
				}
				if (visualPreview.width !== frame.width || visualPreview.height !== frame.height) {
					actions.push({
						type: "layer.scale",
						layerId: layer.id,
						width: visualPreview.width,
						height: visualPreview.height,
					});
				}
				if (actions.length) {
					editor.apply(actions, "Scale");
					if (backdropCache?.layerId === visualPreview.layerId)
						backdropCache.revision = editor.revision.value;
					editor.layerVisualPreview.value = { ...visualPreview, committed: true };
				} else {
					editor.layerVisualPreview.value = null;
				}
			} else {
				editor.layerVisualPreview.value = null;
			}
			redrawOverlay();
			break;
		}
	}
}

function onPointerCancel(): void {
	cancelMaskPreview();
	editor.previewDocument.value = null;
	repaint();
	const state = drag.value;
	editor.canvasMeasurement.value = null;
	if (state?.kind === "selection-move") {
		drag.value = null;
		selectionMoveOffset.value = null;
		return;
	}
	if (
		state?.kind === "bezier" &&
		state.bezierPart &&
		state.bezierNodeIndex !== undefined &&
		state.bezierStartNode &&
		bezierDraft.value?.closed
	) {
		bezierDraft.value.nodes[state.bezierNodeIndex] = cloneBezierNode(
			state.bezierOriginalNode ?? state.bezierStartNode,
		);
		drag.value = null;
		redrawOverlay();
		return;
	}
	if (state?.kind === "crop") {
		drag.value = null;
		cropDraft.value = state.frame ?? fullCanvasCrop();
		return;
	}
	if (state?.kind === "marquee") {
		drag.value = null;
		marqueeDraft.value = null;
		snapGuides.value = { x: null, y: null };
		redrawOverlay();
		return;
	}
	if (state?.kind !== "move" && state?.kind !== "scale") {
		onPointerUp();
		return;
	}
	drag.value = null;
	moveDelta.value = null;
	editor.layerVisualPreview.value = null;
	if (state?.kind === "move") clearMoveSelectionPreview(true);
	else {
		snapGuides.value = { x: null, y: null };
		redrawOverlay();
	}
}

function applyCrop(): void {
	const rect = cropDraft.value;
	cropDraft.value = null;
	if (!rect || rect.width < 2 || rect.height < 2) return;
	editor.apply(
		[
			{
				type: "canvas.crop",
				x: rect.x,
				y: rect.y,
				width: rect.width,
				height: rect.height,
			} as PsdEditorAction,
		],
		"Crop",
	);
}

function cancelCrop(): void {
	cropDraft.value = null;
}

function startTextEditing(point: { x: number; y: number }): void {
	if (textDraft.value) {
		commitText();
		return;
	}
	const existing = textLayerAtPoint(point);
	if (existing) {
		if (existing.locks.all || existing.locks.composite) {
			editor.lastError.value = "The selected text layer is locked and cannot be edited.";
			return;
		}
		editor.selectLayer(existing.id);
		const style = resolvedPsdTextStyle(existing);
		textDraft.value = {
			layerId: existing.id,
			x: existing.left,
			y: existing.top,
			text: existing.text.text,
			fontFamily: style.fontFamily,
			fontSize: style.fontSize,
			bold: style.bold,
			italic: style.italic,
			underline: style.underline,
			strikethrough: style.strikethrough,
			color: rgbToHex(style.color),
			width: Math.min(existing.bitmap.width, Math.max(80, canvasWidth.value - existing.left)),
		};
		repaintWithoutLayer(existing.id);
	} else {
		const fontSize = editor.textSize.value;
		const minimumWidth = Math.min(TEXT_EDITOR_MIN_WIDTH, canvasWidth.value);
		const x = Math.max(
			0,
			Math.min(Math.round(point.x), Math.max(0, canvasWidth.value - minimumWidth)),
		);
		const y = Math.max(
			0,
			Math.min(
				Math.round(point.y),
				Math.max(0, canvasHeight.value - Math.ceil(fontSize * TEXT_LINE_HEIGHT)),
			),
		);
		textDraft.value = {
			layerId: null,
			x,
			y,
			text: "",
			fontFamily: "Arial",
			fontSize,
			bold: false,
			italic: false,
			underline: false,
			strikethrough: false,
			color: editor.foreground.value,
			width: Math.min(320, canvasWidth.value - x),
		};
	}
	void nextTick(() => {
		textInput.value?.focus();
		if (existing) textInput.value?.select();
	});
}

function cancelText(): void {
	if (!textDraft.value) return;
	textDraft.value = null;
	repaint();
}

function commitText(): void {
	const draft = textDraft.value;
	if (!draft) return;
	textDraft.value = null;
	const text = draft.text.trimEnd();
	if (!text && !draft.layerId) {
		repaint();
		return;
	}
	const result = editor.apply(
		[
			draft.layerId
				? ({
						type: "text.setContent",
						layerId: draft.layerId,
						text,
					} as PsdEditorAction)
				: ({
						type: "text.addLayer",
						text,
						x: draft.x,
						y: draft.y,
						size: draft.fontSize,
						color: hexToRgb(draft.color),
						name: text.split("\n")[0].slice(0, 32) || "Text",
					} as PsdEditorAction),
		],
		draft.layerId ? "Edit Text" : "Add Text",
	);
	const targetId = draft.layerId ?? result?.createdIds[0];
	if (targetId) editor.selectLayer(targetId);
	if (!result) repaint();
}

function onTextKeydown(event: KeyboardEvent): void {
	if (event.key === "Escape") {
		event.preventDefault();
		cancelText();
	} else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
		event.preventDefault();
		commitText();
	}
}

function onTextBlur(event: FocusEvent): void {
	const next = event.relatedTarget as HTMLElement | null;
	if (next?.closest(".als-ofs-psd-stage__text-entry")) return;
	commitText();
}

function onCanvasKeydown(event: KeyboardEvent): void {
	openCanvasContextMenuFromKeyboard(event);
	if (event.defaultPrevented) return;
	if (
		["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) &&
		isSelectionTool(editor.tool.value) &&
		editor.selection.value &&
		!drag.value
	) {
		event.preventDefault();
		const distance = event.shiftKey ? 10 : 1;
		const dx =
			event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0;
		const dy = event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0;
		applySelectionTranslation(dx, dy, "Nudge Selection");
	} else if (event.key === "Enter" && bezierDraft.value) {
		event.preventDefault();
		if (bezierDraft.value.closed) {
			cancelBezierSelection();
		} else commitBezierSelection();
	} else if (event.key === "Enter" && cropDraft.value) {
		event.preventDefault();
		applyCrop();
	} else if (event.key === "Escape") {
		const wasMoving = drag.value?.kind === "move";
		if (cropDraft.value || bezierDraft.value || drag.value) event.preventDefault();
		cropDraft.value = null;
		cancelBezierSelection();
		cancelText();
		marqueeDraft.value = null;
		shapeDraft.value = null;
		drag.value = null;
		moveDelta.value = null;
		selectionMoveOffset.value = null;
		snapGuides.value = { x: null, y: null };
		editor.layerVisualPreview.value = null;
		editor.canvasMeasurement.value = null;
		if (wasMoving) clearMoveSelectionPreview(true);
		else redrawOverlay();
	}
}

watch(
	() => editor.tool.value,
	(tool, previous) => {
		paintAnchor.value = null;
		if (previous === "crop" && tool !== "crop") cancelCrop();
		if (previous === "text" && tool !== "text") cancelText();
		if (previous === "lasso" && tool !== "lasso") cancelBezierSelection();
		if (tool === "lasso" && editor.lassoMode.value === "bezier") restoreClosedBezierSelection();
		if (isSelectionTool(tool) && editor.selectionInteraction.value === "edit") {
			ensureEditableSelection();
		}
		if (tool !== "clone") {
			editor.cloneSource.value = null;
			editor.cloneOffset.value = null;
		}
		editor.canvasMeasurement.value = null;
		editor.lastError.value = "";
	},
);

watch(
	() => editor.lassoMode.value,
	(mode, previous) => {
		if (previous === "bezier" && mode !== "bezier") cancelBezierSelection();
		if (mode === "bezier" && editor.tool.value === "lasso") restoreClosedBezierSelection();
	},
);

watch(
	() => editor.selectionInteraction.value,
	(mode) => {
		if (!isSelectionTool(editor.tool.value)) return;
		if (mode === "edit") {
			ensureEditableSelection();
			return;
		}
		if (bezierDraft.value?.closed) {
			rememberClosedBezierSelection(bezierDraft.value);
			bezierDraft.value = null;
			activeBezierNodeIndex.value = null;
			redrawOverlay();
		}
	},
);

watch(
	() => editor.selection.value,
	(selection) => {
		const cached = cachedBezierSelection.value;
		if (!cached || selection === cached.selection) return;
		cachedBezierSelection.value = null;
		if (bezierDraft.value?.closed) {
			bezierDraft.value = null;
			activeBezierNodeIndex.value = null;
			redrawOverlay();
		}
	},
);

watch(
	() => [editor.tool.value, canvasWidth.value, canvasHeight.value] as const,
	([tool, width, height], previous) => {
		const enteringCrop = tool === "crop" && previous?.[0] !== "crop";
		const documentBecameAvailable =
			tool === "crop" && width > 0 && height > 0 && (!previous?.[1] || !previous?.[2]);
		if (!cropDraft.value && (enteringCrop || documentBecameAvailable)) {
			cropDraft.value = fullCanvasCrop();
		}
	},
	{ immediate: true },
);

function onWheel(event: WheelEvent): void {
	if (!event.ctrlKey && !event.metaKey) return;
	event.preventDefault();
	const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
	zoomAround(event.clientX, event.clientY, factor);
}

function onPasteboardKeydown(event: KeyboardEvent): void {
	const surface = event.currentTarget as HTMLElement;
	if (event.key !== "Home" && event.key !== "End") return;
	event.preventDefault();
	const end = event.key === "End";
	if (event.shiftKey) surface.scrollLeft = end ? surface.scrollWidth - surface.clientWidth : 0;
	else surface.scrollTop = end ? surface.scrollHeight - surface.clientHeight : 0;
}

function zoomAround(clientX: number, clientY: number, factor: number): void {
	const frame = canvasFrame.value?.getBoundingClientRect();
	const surface = viewport.value;
	const previous = editor.zoom.value;
	const next = Math.min(8, Math.max(0.125, previous * factor));
	if (!frame || !surface || next === previous) return;
	const surfaceRect = surface.getBoundingClientRect();
	const fractionX = (clientX - frame.left) / Math.max(1, frame.width);
	const fractionY = (clientY - frame.top) / Math.max(1, frame.height);
	const viewportX = clientX - surfaceRect.left;
	const viewportY = clientY - surfaceRect.top;
	editor.zoom.value = next;
	void nextTick(() => {
		surface.scrollLeft = panPadding.value.x + fractionX * scaledWidth.value - viewportX;
		surface.scrollTop = panPadding.value.y + fractionY * scaledHeight.value - viewportY;
	});
}

onBeforeUnmount(() => {
	++tileGeneration;cancelAnimationFrame(tileFrame);tileCache.clear();
	cancelMaskPreview();
	drag.value = null;
	selectionMoveOffset.value = null;
	bezierDraft.value = null;
	activeBezierNodeIndex.value = null;
	moveSelectionPreview.value = null;
	pendingMoveSelectionBitmap = null;
	pendingMoveForegroundBitmap = null;
	pendingFastMoveSelectionLayers = null;
	pendingFastMoveForegroundLayers = null;
	fastMoveLayerCanvasCache = new WeakMap<LeafLayer, HTMLCanvasElement>();
	cancelBackdropWarmup();
	cancelPreviewFinalize();
	viewportObserver?.disconnect();
	viewportObserver = null;
	backdropCache = null;
	editor.layerVisualPreview.value = null;
	editor.canvasPointer.value = null;
	editor.canvasMeasurement.value = null;
	document.body.classList.remove("als-ofs-psd-context-menu-open");
});

const cursor = computed(() => {
	if (drag.value?.kind === "pan") return "grabbing";
	if (editor.spacePanActive.value) return "grab";
	if (
		isSelectionTool(editor.tool.value) &&
		editor.selectionInteraction.value === "edit" &&
		hoverPoint.value
	) {
		if (bezierEditTarget(hoverPoint.value)) return "move";
		if (bezierSegmentTarget(hoverPoint.value)) return "copy";
	}
	if (
		isSelectionTool(editor.tool.value) &&
		editor.selectionInteraction.value === "move" &&
		hoverPoint.value &&
		pointInsideActiveSelection(hoverPoint.value)
	)
		return "move";
	if (
		editor.tool.value === "lasso" &&
		editor.lassoMode.value === "bezier" &&
		hoverPoint.value &&
		bezierEditTarget(hoverPoint.value)
	)
		return "move";
	if (
		editor.tool.value === "lasso" &&
		editor.lassoMode.value === "bezier" &&
		bezierDraft.value &&
		bezierDraft.value.nodes.length >= 3 &&
		hoverPoint.value &&
		pointNearFirstBezierAnchor(hoverPoint.value)
	)
		return "pointer";
	switch (editor.tool.value) {
		case "hand":
			return "grab";
		case "zoom":
			return "zoom-in";
		case "move":
			return "default";
		case "brush":
		case "eraser":
		case "clone":
		case "dodge":
		case "burn":
		case "heal":
		case "blur":
			return hoverPoint.value ? "none" : "crosshair";
		default:
			return "crosshair";
	}
});

function frameStyle(rect: { x: number; y: number; width: number; height: number }) {
	const scale = editor.zoom.value;
	return {
		left: `${rect.x * scale}px`,
		top: `${rect.y * scale}px`,
		width: `${rect.width * scale}px`,
		height: `${rect.height * scale}px`,
	};
}

const moveFrame = computed(() => {
	const movingState = drag.value?.kind === "move" ? drag.value : null;
	const frame = movingState?.frame ?? activeFrame.value;
	if (!frame) return null;
	const delta = moveDelta.value;
	if (movingState && delta) return { ...frame, x: frame.x + delta.dx, y: frame.y + delta.dy };
	const preview = editor.layerVisualPreview.value;
	if (preview && preview.layerId === editor.activeLayer.value?.id) {
		return {
			x: preview.x,
			y: preview.y,
			width: preview.width,
			height: preview.height,
		};
	}
	return frame;
});

const frameTransform = computed<CSSProperties>(() => ({
	left: `${panPadding.value.x}px`,
	top: `${panPadding.value.y}px`,
	width: `${scaledWidth.value}px`,
	height: `${scaledHeight.value}px`,
}));

const bezierOverlayTransform = computed(
	() => `translate(${panPadding.value.x} ${panPadding.value.y}) scale(${editor.zoom.value})`,
);

const marqueeMeasurement = computed<{
	width: number;
	height: number;
	style: CSSProperties;
} | null>(() => {
	const state = drag.value;
	const draft = marqueeDraft.value;
	if (state?.kind !== "marquee" || !draft || (!draft.width && !draft.height)) return null;
	const scale = editor.zoom.value;
	const tooltipWidth = 94;
	const tooltipHeight = 46;
	const gap = 12;
	const anchorX = state.lastX * scale;
	const anchorY = state.lastY * scale;
	const preferredLeft =
		anchorX + gap + tooltipWidth <= scaledWidth.value
			? anchorX + gap
			: anchorX - gap - tooltipWidth;
	const preferredTop =
		anchorY + gap + tooltipHeight <= scaledHeight.value
			? anchorY + gap
			: anchorY - gap - tooltipHeight;
	return {
		width: draft.width,
		height: draft.height,
		style: {
			left: `${Math.max(4, Math.min(scaledWidth.value - tooltipWidth - 4, preferredLeft))}px`,
			top: `${Math.max(4, Math.min(scaledHeight.value - tooltipHeight - 4, preferredTop))}px`,
		},
	};
});

function cssBlendMode(mode: PsdLayerNode["blendMode"]): CSSProperties["mixBlendMode"] {
	return mode === "linear-burn" || mode === "linear-dodge" || mode === "dissolve"
		? "normal"
		: mode;
}

const layerPreviewStyle = computed<CSSProperties>(() => {
	const preview = editor.layerVisualPreview.value;
	const layer = preview ? findLayer(preview.layerId) : null;
	const document = editor.document.value;
	if (!preview || !layer || !document) return {};
	const scale = editor.zoom.value;
	const sourceWidth = layer.kind === "group" ? document.width : layer.bitmap.width;
	const sourceHeight = layer.kind === "group" ? document.height : layer.bitmap.height;
	return {
		width: `${sourceWidth * scale}px`,
		height: `${sourceHeight * scale}px`,
		opacity: `${preview.opacity}`,
		mixBlendMode: cssBlendMode(layer.blendMode),
		transform: `translate3d(${preview.x * scale}px, ${preview.y * scale}px, 0) scale(${preview.width / sourceWidth}, ${preview.height / sourceHeight})`,
	};
});

const moveSelectionStyle = computed<CSSProperties>(() => {
	const preview = moveSelectionPreview.value;
	if (!preview) return {};
	return {
		transform: `translate3d(${preview.dx * editor.zoom.value}px, ${preview.dy * editor.zoom.value}px, 0)`,
	};
});

// Photoshop's Move tool context menu selects the visible layer under the pointer.
const contextMenu = useUiContextMenuFocus();
const contextMenuHost = ref<HTMLElement | null>(null);
const contextLayers = ref<PsdLayerNode[]>([]);
let contextMenuReturnFocus: HTMLElement | null = null;

function layersAtPoint(point: { x: number; y: number }): PsdLayerNode[] {
	const document = editor.document.value;
	if (!document) return [];
	const hits: PsdLayerNode[] = [];
	const visit = (layers: readonly PsdLayerNode[], parentVisible: boolean) => {
		for (let index = layers.length - 1; index >= 0; index--) {
			const layer = layers[index];
			const visible = parentVisible && layer.visible && layer.opacity > 0;
			if (!visible) continue;
			if (layer.kind === "group") {
				visit(layer.children, visible);
				continue;
			}
			const x = Math.floor(point.x - layer.left);
			const y = Math.floor(point.y - layer.top);
			if (x < 0 || y < 0 || x >= layer.bitmap.width || y >= layer.bitmap.height) continue;
			if (layer.bitmap.data[(y * layer.bitmap.width + x) * 4 + 3] > 0) hits.push(layer);
		}
	};
	visit(document.layers, true);
	return hits.slice(0, 12);
}

function textLayerAtPoint(point: {
	x: number;
	y: number;
}): Extract<PsdLayerNode, { kind: "text" }> | null {
	const document = editor.document.value;
	if (!document) return null;
	let match: Extract<PsdLayerNode, { kind: "text" }> | null = null;
	const visit = (layers: readonly PsdLayerNode[], parentVisible: boolean): void => {
		for (let index = layers.length - 1; index >= 0 && !match; index--) {
			const layer = layers[index];
			const visible = parentVisible && layer.visible && layer.opacity > 0;
			if (!visible) continue;
			if (layer.kind === "group") {
				visit(layer.children, visible);
				continue;
			}
			if (
				layer.kind === "text" &&
				point.x >= layer.left &&
				point.y >= layer.top &&
				point.x < layer.left + layer.bitmap.width &&
				point.y < layer.top + layer.bitmap.height
			) {
				match = layer;
			}
		}
	};
	visit(document.layers, true);
	return match;
}

const canvasContextMenuItems = computed<UiMenuItem[]>(() => {
	const layers = contextLayers.value;
	const items: UiMenuItem[] = layers.length
		? layers.map((layer) => ({
				id: `select-layer:${layer.id}`,
				label: layer.name || "Unnamed Layer",
			}))
		: [{ id: "no-layer", label: "No visible layer here", disabled: true }];
	items.push(
		{ id: "fit", label: "Fit on Screen", separatorBefore: true },
		{ id: "actual-pixels", label: "100%" },
		{ id: "reset-pan", label: "Center Canvas" },
	);
	return items;
});

function setCanvasContextMenuActive(active: boolean): void {
	contextMenu.setActive(active);
	document.body.classList.toggle("als-ofs-psd-context-menu-open", active);
	if (!active && contextMenuReturnFocus?.isConnected) {
		const target = contextMenuReturnFocus;
		contextMenuReturnFocus = null;
		globalThis.setTimeout(() => target.focus({ preventScroll: true }), 50);
	}
}

async function showCanvasContextMenu(
	point: { x: number; y: number },
	returnFocus: HTMLElement,
	clientX: number,
	clientY: number,
): Promise<void> {
	contextLayers.value = layersAtPoint(point);
	contextMenuReturnFocus = returnFocus;
	contextMenu.rememberReturnFocus(returnFocus);
	setCanvasContextMenuActive(true);
	await nextTick();
	contextMenuHost.value
		?.querySelector<HTMLElement>(".als-ofs-ui-context-menu__trigger")
		?.dispatchEvent(
			new MouseEvent("contextmenu", {
				bubbles: true,
				button: 2,
				cancelable: true,
				clientX,
				clientY,
			}),
		);
}

function openCanvasContextMenu(event: MouseEvent): void {
	event.preventDefault();
	void showCanvasContextMenu(
		canvasPoint(event),
		event.currentTarget as HTMLElement,
		event.clientX,
		event.clientY,
	);
}

function openCanvasContextMenuFromKeyboard(event: KeyboardEvent): void {
	if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
	event.preventDefault();
	const target = event.currentTarget as HTMLElement;
	const rect = target.getBoundingClientRect();
	void showCanvasContextMenu(
		{ x: canvasWidth.value / 2, y: canvasHeight.value / 2 },
		target,
		rect.left + rect.width / 2,
		rect.top + rect.height / 2,
	);
}

function centerCanvas(): void {
	void nextTick(() => {
		const surface = viewport.value;
		if (!surface) return;
		surface.scrollLeft = panPadding.value.x + scaledWidth.value / 2 - surface.clientWidth / 2;
		surface.scrollTop = panPadding.value.y + scaledHeight.value / 2 - surface.clientHeight / 2;
	});
}

function fitCanvas(): void {
	const surface = viewport.value;
	if (!surface || !canvasWidth.value || !canvasHeight.value) return;
	const availableWidth = Math.max(1, surface.clientWidth - 56);
	const availableHeight = Math.max(1, surface.clientHeight - 56);
	editor.zoom.value = Math.min(
		8,
		Math.max(
			0.125,
			Math.min(availableWidth / canvasWidth.value, availableHeight / canvasHeight.value),
		),
	);
	centerCanvas();
}

watch(
	() => editor.viewCommand.value,
	(command) => {
		if (!command) return;
		if (command === "fit") fitCanvas();
		else if (command === "actual") {
			editor.zoom.value = 1;
			centerCanvas();
		} else centerCanvas();
		editor.viewCommand.value = null;
	},
);

function selectCanvasContextMenuItem(item: UiMenuItem): void {
	if (item.id.startsWith("select-layer:")) {
		editor.selectLayer(item.id.slice("select-layer:".length));
		return;
	}
	if (item.id === "fit") fitCanvas();
	else if (item.id === "actual-pixels") editor.zoom.value = 1;
	else if (item.id === "reset-pan") centerCanvas();
}

const cloneMarker = computed(() => {
	const point = hoverPoint.value,
		state = drag.value,
		anchor = editor.cloneSource.value;
	const offset =
		editor.cloneAligned.value && editor.cloneOffset.value
			? editor.cloneOffset.value
			: state?.kind === "paint" && anchor
				? {
						dx: Math.round(anchor.x - state.startX),
						dy: Math.round(anchor.y - state.startY),
					}
				: null;
	const source =
		point && offset
			? { x: point.x + offset.dx, y: point.y + offset.dy }
			: editor.cloneSource.value;
	if (!source || editor.tool.value !== "clone") return null;
	const scale = editor.zoom.value;
	return { left: `${source.x * scale}px`, top: `${source.y * scale}px` };
});

const brushCursorStyle = computed<CSSProperties | null>(() => {
	const point = hoverPoint.value;
	const isBrush = ["brush", "eraser", "clone", "dodge", "burn", "heal", "blur"].includes(
		editor.tool.value,
	);
	if (!point || !isBrush || editor.spacePanActive.value) return null;
	const diameter = Math.max(4, editor.brushSize.value * editor.zoom.value);
	return {
		left: `${point.x * editor.zoom.value}px`,
		top: `${point.y * editor.zoom.value}px`,
		width: `${diameter}px`,
		height: `${diameter}px`,
	};
});

const sampledPointStyle = computed<CSSProperties | null>(() => {
	const point = sampledPoint.value;
	if (!point || editor.tool.value !== "eyedropper") return null;
	return {
		left: `${point.x * editor.zoom.value}px`,
		top: `${point.y * editor.zoom.value}px`,
		backgroundColor: point.color,
	};
});

const textEditorStyle = computed<CSSProperties | null>(() => {
	const draft = textDraft.value;
	if (!draft) return null;
	return {
		left: `${draft.x * editor.zoom.value}px`,
		top: `${draft.y * editor.zoom.value}px`,
		fontSize: `${Math.max(8, draft.fontSize * editor.zoom.value)}px`,
		fontFamily: `"${draft.fontFamily.replaceAll('"', '\\"')}", sans-serif`,
		fontWeight: draft.bold ? "700" : "400",
		fontStyle: draft.italic ? "italic" : "normal",
		textDecoration:
			[draft.underline ? "underline" : "", draft.strikethrough ? "line-through" : ""]
				.filter(Boolean)
				.join(" ") || "none",
		color: draft.color,
		width: `${Math.max(TEXT_EDITOR_MIN_WIDTH, draft.width * editor.zoom.value)}px`,
	};
});

const textEditorSurface = computed(() => {
	const color = textDraft.value?.color;
	if (!color) return "dark";
	const { r, g, b } = hexToRgb(color);
	const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
	return luminance < 0.46 ? "light" : "dark";
});

const textEditorLabel = computed(() =>
	textDraft.value?.layerId ? "Edit text layer content" : "New text layer content",
);
const textEditorRows = computed(() => Math.max(1, textDraft.value?.text.split("\n").length ?? 1));

const documentTabMeta = computed(() => {
	const document = editor.document.value;
	if (!document) return "";
	const percent = Math.round(editor.zoom.value * 1000) / 10;
	return `${percent}% (${document.colorMode.toUpperCase()}/${document.bitsPerChannel})`;
});
</script>

<template>
	<div class="als-ofs-psd-stage" :style="{ cursor }">
		<UiLoadingOverlay v-if="editor.loading.value" label="Opening document…" />
		<UiEmptyState
			v-else-if="editor.loadError.value"
			:title="'This file could not be opened'"
			:description="editor.loadError.value.message"
		/>
		<template v-else>
			<div v-if="showDocumentBar" class="als-ofs-psd-stage__document-bar" aria-label="Open document">
				<div class="als-ofs-psd-stage__document-tab" aria-current="page">
					<span class="als-ofs-psd-stage__document-mark" aria-hidden="true">P</span>
					<span class="als-ofs-psd-stage__document-name">{{
						editor.fileName.value
					}}</span>
					<span v-if="editor.dirty.value" class="als-ofs-psd-stage__document-dirty">
						•
					</span>
					<span class="als-ofs-psd-stage__document-meta">@ {{ documentTabMeta }}</span>
				</div>
			</div>
			<div
				ref="viewport"
				class="als-ofs-psd-stage__viewport"
				tabindex="0"
				aria-label="Scrollable canvas pasteboard"
				aria-keyshortcuts="Home End Shift+Home Shift+End"
				@wheel="onWheel"
				@scroll.passive="onViewportScroll"
				@keydown="onPasteboardKeydown"
			>
				<div
					class="als-ofs-psd-stage__pan-surface"
					:style="panSurfaceStyle"
					@pointerdown.self="onPasteboardPointerDown"
					@pointermove.self="onPointerMove"
					@pointerup.self="onPointerUp"
					@pointercancel.self="onPointerCancel"
				>
					<div
						ref="canvasFrame"
						class="als-ofs-psd-stage__frame"
						:style="frameTransform"
						tabindex="0"
						aria-label="PSD canvas workspace"
						aria-keyshortcuts="Shift+F10"
						@pointerdown="onPointerDown"
						@pointermove="onPointerMove"
						@pointerup="onPointerUp"
						@pointercancel="onPointerCancel"
						@pointerleave="onCanvasPointerLeave"
						@click="onCanvasClick"
						@contextmenu="openCanvasContextMenu"
						@keydown="onCanvasKeydown"
					>
						<canvas
							ref="canvasHost"
							class="als-ofs-psd-stage__canvas"
							aria-label="PSD canvas"
							:style="{
								...tiledStyle,
								imageRendering: editor.zoom.value < 1 ? 'auto' : 'pixelated',
							}"
						/>
						<div
							v-if="editor.showPixelGrid.value && editor.zoom.value >= 8"
							class="als-ofs-psd-stage__pixel-grid"
							:style="{
								backgroundSize: `${editor.zoom.value}px ${editor.zoom.value}px`,
							}"
							aria-hidden="true"
						/>
						<canvas
							v-if="moveSelectionPreview && !tiledMove"
							ref="moveSelectionCanvas"
							class="als-ofs-psd-stage__move-preview"
							:style="moveSelectionStyle"
							aria-hidden="true"
						/>
						<canvas
							v-if="moveSelectionPreview?.hasForeground && !tiledMove"
							ref="moveForegroundCanvas"
							class="als-ofs-psd-stage__move-foreground"
							aria-hidden="true"
						/>
						<canvas
							v-if="editor.layerVisualPreview.value"
							ref="layerPreviewCanvas"
							class="als-ofs-psd-stage__layer-preview"
							:style="layerPreviewStyle"
							aria-hidden="true"
						/>
						<canvas
							ref="overlay"
							:style="tiledStyle"
							class="als-ofs-psd-stage__overlay"
							aria-hidden="true"
						/>
						<svg
							v-if="selectionOutlinePath"
							class="als-ofs-psd-stage__selection-outline"
							:viewBox="`0 0 ${canvasWidth} ${canvasHeight}`"
							preserveAspectRatio="none"
							aria-hidden="true"
						>
							<path
								class="als-ofs-psd-stage__selection-ant als-ofs-psd-stage__selection-ant--dark"
								:d="selectionOutlinePath"
								:transform="selectionOutlineTransform"
							/>
							<path
								class="als-ofs-psd-stage__selection-ant als-ofs-psd-stage__selection-ant--light"
								:d="selectionOutlinePath"
								:transform="selectionOutlineTransform"
							/>
						</svg>
						<div
							v-if="marqueeMeasurement"
							class="als-ofs-psd-stage__marquee-measurement"
							:style="marqueeMeasurement.style"
							aria-hidden="true"
						>
							<span>W: {{ marqueeMeasurement.width }} px</span>
							<span>H: {{ marqueeMeasurement.height }} px</span>
						</div>
						<div
							v-if="
								moveFrame &&
								editor.tool.value === 'move' &&
								editor.showTransformControls.value
							"
							class="als-ofs-psd-stage__selection"
							:style="frameStyle(moveFrame)"
						>
							<template v-if="activeLayerCanScale">
								<i
									v-for="corner in ['nw', 'ne', 'sw', 'se']"
									:key="corner"
									class="als-ofs-psd-stage__grip"
									:data-corner="corner"
								/>
							</template>
						</div>
						<i
							v-if="cloneMarker"
							class="als-ofs-psd-stage__clone-source"
							:style="cloneMarker"
						/>
						<div
							v-if="textDraft && textEditorStyle"
							class="als-ofs-psd-stage__text-entry"
							:style="textEditorStyle"
							@pointerdown.stop
							@click.stop
						>
							<textarea
								ref="textInput"
								v-model="textDraft.text"
								class="als-ofs-psd-stage__text-editor"
								:data-editor-surface="textEditorSurface"
								:aria-label="textEditorLabel"
								:rows="textEditorRows"
								placeholder="Type text"
								@keydown="onTextKeydown"
								@blur="onTextBlur"
							/>
							<div
								class="als-ofs-psd-stage__text-actions"
								aria-label="Text editing actions"
							>
								<button
									type="button"
									class="als-ofs-psd-stage__text-cancel"
									aria-label="Cancel text editing"
									title="Cancel (Esc)"
									@pointerdown.prevent.stop
									@click="cancelText"
								>
									<UiIcon name="close" :size="14" />
								</button>
								<button
									type="button"
									class="als-ofs-psd-stage__text-apply"
									aria-label="Apply text editing"
									title="Apply (Ctrl/Cmd+Enter)"
									@pointerdown.prevent.stop
									@click="commitText"
								>
									<UiIcon name="check" :size="14" />
								</button>
							</div>
						</div>
						<i
							v-if="brushCursorStyle"
							class="als-ofs-psd-stage__brush-cursor"
							:style="brushCursorStyle"
						/>
						<i
							v-if="sampledPointStyle"
							class="als-ofs-psd-stage__sample-chip"
							:style="sampledPointStyle"
						/>
						<div
							v-if="cropDraft"
							class="als-ofs-psd-stage__crop"
							:style="frameStyle(cropDraft)"
							aria-label="Crop boundary"
							@pointerdown.stop="beginCropAdjustment($event, 'move')"
							@dblclick.stop="applyCrop"
						>
							<i
								v-for="handle in ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']"
								:key="handle"
								class="als-ofs-psd-stage__crop-handle"
								:data-handle="handle"
								@pointerdown.stop="beginCropAdjustment($event, 'resize', handle)"
							/>
							<div class="als-ofs-psd-stage__crop-bar" @pointerdown.stop>
								<button
									type="button"
									class="als-ofs-psd-stage__crop-cancel"
									aria-label="Cancel crop"
									title="Cancel crop (Esc)"
									@click.stop="cancelCrop"
								>
									<UiIcon name="close" :size="14" />
								</button>
								<button
									type="button"
									class="als-ofs-psd-stage__crop-apply"
									aria-label="Apply crop"
									title="Apply crop (Enter)"
									@click.stop="applyCrop"
								>
									<UiIcon name="check" :size="14" />
								</button>
							</div>
						</div>
					</div>
					<svg
						v-if="bezierDraft && bezierDraftPath"
						class="als-ofs-psd-stage__bezier-edit"
						aria-hidden="true"
					>
						<g :transform="bezierOverlayTransform">
							<path
								v-if="bezierDraft.closed"
								class="als-ofs-psd-stage__bezier-path"
								:d="bezierDraftPath"
							/>
							<template v-else>
								<path
									class="als-ofs-psd-stage__bezier-preview-halo"
									:d="bezierDraftPath"
								/>
								<path
									class="als-ofs-psd-stage__bezier-preview-path"
									:d="bezierDraftPath"
								/>
							</template>
							<g v-for="(node, index) in bezierDraft.nodes" :key="index">
								<template v-if="bezierDisplayHandles(node, index).length">
									<line
										v-for="(handle, handleIndex) in bezierDisplayHandles(
											node,
											index,
										)"
										:key="`line-${handleIndex}`"
										class="als-ofs-psd-stage__bezier-control-line"
										:class="{
											'is-virtual': bezierNodeShowsVirtualHandles(
												node,
												index,
											),
										}"
										:x1="node.x"
										:y1="node.y"
										:x2="handle.x"
										:y2="handle.y"
									/>
									<circle
										v-for="(handle, handleIndex) in bezierDisplayHandles(
											node,
											index,
										)"
										:key="handleIndex"
										class="als-ofs-psd-stage__bezier-handle"
										:class="{
											'is-virtual': bezierNodeShowsVirtualHandles(
												node,
												index,
											),
										}"
										:cx="handle.x"
										:cy="handle.y"
										:r="bezierHandleRadius"
									/>
								</template>
								<rect
									class="als-ofs-psd-stage__bezier-anchor"
									:class="{
										'is-active':
											bezierDraft.closed && activeBezierNodeIndex === index,
										'is-close-target':
											index === 0 &&
											!bezierDraft.closed &&
											hoverPoint &&
											pointNearFirstBezierAnchor(hoverPoint),
									}"
									:x="node.x - bezierAnchorRadius"
									:y="node.y - bezierAnchorRadius"
									:width="bezierAnchorRadius * 2"
									:height="bezierAnchorRadius * 2"
								/>
							</g>
							<circle
								v-if="bezierInsertPreview"
								class="als-ofs-psd-stage__bezier-insert"
								:cx="bezierInsertPreview.x"
								:cy="bezierInsertPreview.y"
								:r="bezierHandleRadius"
							/>
						</g>
					</svg>
				</div>
			</div>
		</template>
		<div ref="contextMenuHost" class="als-ofs-psd-stage__context-menu-host">
			<UiContextMenu
				:active="contextMenu.active.value"
				aria-label="Canvas context menu"
				:items="canvasContextMenuItems"
				@select="selectCanvasContextMenuItem"
				@update:active="setCanvasContextMenuActive"
			/>
		</div>
		<div v-if="editor.lastError.value" class="als-ofs-psd-stage__error" role="alert">
			{{ editor.lastError.value }}
		</div>
	</div>
</template>
