<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { artifactSourceToUint8Array, type ArtifactSource } from "@yaochn/als-office-editor-core";
import { UiIcon, deliverUiEditorFile } from "@yaochn/als-office-editor-ui/vue";
import { graphicsAppearance } from "../appearance";
import { exportVectorProject, type VectorExportFormat } from "./export";
import {
	objectBounds,
	pathNodes,
	penPath,
	reshapeNode,
	type Bounds,
	type PenPoint,
} from "./geometry";
import { openVectorProject } from "./import";
import {
	COLOR,
	IDENTITY,
	MAX_BOARDS,
	MAX_DIMENSION,
	MAX_OBJECTS,
	inverse,
	multiply,
	newArtboard,
	newPath,
	pathData,
	shapePath,
	transformPoint,
	type Artboard,
	type Point,
	type VectorObject,
	type VectorProject,
	type VectorText,
} from "./model";
import IllustratorArtwork from "./IllustratorArtwork.vue";
import "./styles.css";

const props = defineProps<{ source: ArtifactSource; fileName: string; readonly?: boolean }>();
const documentName = ref(props.fileName);
const emit = defineEmits<{ loaded: []; error: [Error] }>();
const controller = new AbortController();
const project = shallowRef<VectorProject>();
const original = shallowRef<VectorProject>();
const nativeFormat = ref(false);
const revision = ref(0);
const listeners = new Set<() => void>();
const undoStack = shallowRef<VectorProject[]>([]);
const redoStack = shallowRef<VectorProject[]>([]);
const currentIndex = ref(0);
const selectedId = ref("");
const panel = ref<"layers" | "artboards">("layers");
const scale = ref(1);
const view = ref<HTMLElement>();
const root = ref<HTMLElement>();
const working = ref(false);
const issue = ref("");
const swatch = ref("#7854d8");
let initialSizeObserver: ResizeObserver | undefined;

const tools = [
	{ id: "select", name: "Selection", key: "V", icon: "move" },
	{ id: "anchor", name: "Direct Selection", key: "A", icon: "connector-curved" },
	{ id: "pen", name: "Pen", key: "P", icon: "draw" },
	{ id: "rectangle", name: "Rectangle", key: "M", icon: "shape-rect" },
	{ id: "ellipse", name: "Ellipse", key: "L", icon: "shape-ellipse" },
	{ id: "text", name: "Type", key: "T", icon: "text" },
] as const;
type Tool = (typeof tools)[number]["id"];
const tool = ref<Tool>("select");
const selectedTool = computed(() => tools.find((item) => item.id === tool.value)!);
const board = computed(() => project.value?.artboards[currentIndex.value]);
const selected = computed(() =>
	board.value?.objects.find((object) => object.id === selectedId.value),
);
const draft = shallowRef<VectorObject>();
const selection = computed(() =>
	draft.value?.id === selectedId.value ? draft.value : selected.value,
);
const bounds = computed(() => selection.value && objectBounds(selection.value));
const nodes = computed(() =>
	tool.value === "anchor" &&
	selection.value?.kind === "path" &&
	!selection.value.locked &&
	!selection.value.hidden
		? pathNodes(selection.value)
		: [],
);
const pen = shallowRef<PenPoint[]>([]);
const penHover = shallowRef<Point>();
const penDrag = shallowRef<PenPoint>();
const penPreview = computed(() => {
	const last =
		penDrag.value ??
		(penHover.value && pen.value.length ? { point: penHover.value } : undefined);
	return penPath(last ? [...pen.value, last] : pen.value, false);
});

function changed() {
	revision.value++;
	for (const listener of listeners) listener();
}
function commit(next: VectorProject) {
	if (props.readonly || !project.value || next === project.value) return;
	undoStack.value = [...undoStack.value.slice(-49), project.value];
	redoStack.value = [];
	project.value = next;
	changed();
}
function restore(next: VectorProject) {
	project.value = next;
	currentIndex.value = Math.min(currentIndex.value, next.artboards.length - 1);
	selectedId.value = "";
	cancelDrawing();
	changed();
}
function undo() {
	const next = undoStack.value.at(-1);
	if (!next || !project.value) return;
	redoStack.value = [...redoStack.value, project.value];
	undoStack.value = undoStack.value.slice(0, -1);
	restore(next);
}
function redo() {
	const next = redoStack.value.at(-1);
	if (!next || !project.value) return;
	undoStack.value = [...undoStack.value, project.value];
	redoStack.value = redoStack.value.slice(0, -1);
	restore(next);
}
function updateBoard(next: Artboard) {
	if (!project.value) return;
	const artboards = [...project.value.artboards];
	artboards[currentIndex.value] = next;
	commit({ ...project.value, artboards });
}
function replaceObject(next: VectorObject, includeLocked = false) {
	if (!board.value) return;
	const before = board.value.objects.find((o) => o.id === next.id);
	if (!before || (before.locked && !includeLocked)) return;
	updateBoard({
		...board.value,
		objects: board.value.objects.map((o) => (o.id === next.id ? next : o)),
	});
}
function addObject(object: VectorObject) {
	if (!project.value || !board.value || props.readonly) return;
	if (project.value.artboards.reduce((total, b) => total + b.objects.length, 0) >= MAX_OBJECTS) {
		issue.value = "The document has reached its object limit.";
		return;
	}
	updateBoard({ ...board.value, objects: [...board.value.objects, object] });
	selectedId.value = object.id;
}
function patchObject(patch: Partial<VectorObject>) {
	if (selected.value) replaceObject({ ...selected.value, ...patch } as VectorObject);
}
function erase() {
	if (!board.value || !selected.value || selected.value.locked) return;
	updateBoard({
		...board.value,
		objects: board.value.objects.filter((o) => o.id !== selectedId.value),
	});
	selectedId.value = "";
}
function duplicate() {
	const object = selected.value;
	if (!object || object.locked) return;
	addObject({
		...object,
		id: crypto.randomUUID(),
		name: `${object.name.slice(0, 120)} copy`,
		matrix: multiply([1, 0, 0, 1, 12, 12], object.matrix),
	});
}
function reorder(step: number) {
	if (!board.value || selected.value?.locked) return;
	const objects = [...board.value.objects];
	const index = objects.findIndex((o) => o.id === selectedId.value),
		to = index + step;
	if (index < 0 || to < 0 || to >= objects.length) return;
	[objects[index], objects[to]] = [objects[to], objects[index]];
	updateBoard({ ...board.value, objects });
}
function changeNumber(event: Event, min: number, max: number, apply: (value: number) => void) {
	const input = event.target as HTMLInputElement;
	const value = input.valueAsNumber;
	if (Number.isFinite(value)) apply(Math.max(min, Math.min(max, value)));
	else input.value = input.defaultValue;
}
function changeBounds(key: keyof Bounds, value: number) {
	const object = selected.value,
		box = bounds.value;
	if (!object || !box) return;
	if (key === "x" || key === "y") {
		const dx = key === "x" ? value - box.x : 0;
		const dy = key === "y" ? value - box.y : 0;
		patchObject({ matrix: multiply([1, 0, 0, 1, dx, dy], object.matrix) });
	} else {
		if (box[key] < 0.001) return;
		const sx = key === "width" ? value / box.width : 1;
		const sy = key === "height" ? value / box.height : 1;
		patchObject({
			matrix: multiply([sx, 0, 0, sy, box.x * (1 - sx), box.y * (1 - sy)], object.matrix),
		});
	}
}
function rotate(degrees: number) {
	if (!selected.value || !bounds.value) return;
	const { x, y, width, height } = bounds.value;
	const cx = x + width / 2,
		cy = y + height / 2,
		angle = (degrees * Math.PI) / 180;
	const c = Math.cos(angle),
		s = Math.sin(angle);
	patchObject({
		matrix: multiply(
			[c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy],
			selected.value.matrix,
		),
	});
}
function changeColor(event: Event, key: "fill" | "stroke") {
	const color = (event.target as HTMLInputElement).value;
	if (COLOR.test(color)) patchObject({ [key]: color });
}
function updateOpacity(value: number) {
	patchObject(
		selected.value?.kind === "path"
			? { fillAlpha: value / 100, strokeAlpha: value / 100 }
			: { fillAlpha: value / 100 },
	);
}

function chooseBoard(index: number, scroll = true) {
	if (index !== currentIndex.value) {
		cancelDrawing();
		currentIndex.value = index;
		selectedId.value = "";
	}
	if (scroll)
		void nextTick(() => {
			const target = view.value?.querySelector(`[data-artboard-index="${index}"]`);
			target?.scrollIntoView({ block: "nearest", inline: "nearest" });
		});
}
function addBoard() {
	if (!project.value || project.value.artboards.length >= MAX_BOARDS) return;
	const artboards = [
		...project.value.artboards,
		newArtboard(
			`Artboard ${project.value.artboards.length + 1}`,
			board.value?.width,
			board.value?.height,
		),
	];
	commit({ ...project.value, artboards });
	chooseBoard(artboards.length - 1);
	panel.value = "artboards";
}
function deleteBoard() {
	if (!project.value || project.value.artboards.length < 2) return;
	const artboards = project.value.artboards.filter((_, i) => i !== currentIndex.value);
	commit({ ...project.value, artboards });
	cancelDrawing();
	selectedId.value = "";
	chooseBoard(Math.min(currentIndex.value, artboards.length - 1));
}
function changeBoard(patch: Partial<Artboard>) {
	if (board.value) updateBoard({ ...board.value, ...patch });
}
function zoom(value: number) {
	scale.value = Math.min(4, Math.max(0.05, value));
}
function fitBoard() {
	if (!board.value || !view.value) return;
	zoom(
		Math.min(
			1,
			(view.value.clientWidth - 72) / board.value.width,
			(view.value.clientHeight - 72) / board.value.height,
		),
	);
	chooseBoard(currentIndex.value);
}

type PointerEdit =
	| { kind: "move"; start: Point; object: VectorObject }
	| { kind: "resize"; start: Point; object: VectorObject; bounds: Bounds }
	| {
			kind: "node";
			start: Point;
			object: Extract<VectorObject, { kind: "path" }>;
			index: number;
			pointIndex: number;
	  }
	| { kind: "draw"; start: Point; tool: "rectangle" | "ellipse"; id: string }
	| { kind: "pen"; start: Point; shift: boolean };
let drag: PointerEdit | undefined;
let dragSvg: SVGSVGElement | undefined;
let dragPointer: number | undefined;

function selectTool(next: Tool) {
	if (next !== tool.value) cancelDrawing();
	tool.value = next;
}
function cancelDrawing() {
	draft.value = undefined;
	pen.value = [];
	penHover.value = undefined;
	penDrag.value = undefined;
	if (dragPointer !== undefined && dragSvg?.hasPointerCapture(dragPointer))
		dragSvg.releasePointerCapture(dragPointer);
	drag = undefined;
	dragSvg = undefined;
	dragPointer = undefined;
}
function eventPoint(event: PointerEvent, svg: SVGSVGElement): Point {
	const transform = svg.getScreenCTM();
	if (!transform) return [0, 0];
	const at = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
	return [at.x, at.y];
}
function capture(event: PointerEvent, svg: SVGSVGElement, edit: PointerEdit) {
	drag = edit;
	dragSvg = svg;
	dragPointer = event.pointerId;
	svg.setPointerCapture(event.pointerId);
}
function pointerDown(event: PointerEvent, index: number) {
	if (event.button !== 0 || !event.isPrimary || props.readonly) return;
	root.value?.focus({ preventScroll: true });
	chooseBoard(index, false);
	const svg = event.currentTarget as SVGSVGElement;
	const start = eventPoint(event, svg);
	const element = event.target instanceof Element ? event.target : null;
	if (tool.value === "pen") {
		if (
			pen.value.length > 2 &&
			Math.hypot(start[0] - pen.value[0].point[0], start[1] - pen.value[0].point[1]) *
				scale.value <=
				9
		)
			finishPen(true);
		else capture(event, svg, { kind: "pen", start, shift: event.shiftKey });
		return;
	}
	if (tool.value === "rectangle" || tool.value === "ellipse") {
		selectedId.value = "";
		capture(event, svg, { kind: "draw", start, tool: tool.value, id: crypto.randomUUID() });
		return;
	}
	if (tool.value === "text") {
		const newText: VectorText = {
			id: crypto.randomUUID(),
			kind: "text",
			name: "Text",
			text: "Text",
			size: 24,
			matrix: [1, 0, 0, 1, ...start],
			fill: swatch.value,
			fillAlpha: 1,
			hidden: false,
			locked: false,
		};
		addObject(newText);
		selectTool("select");
		void nextTick(() => {
			const input = root.value?.querySelector<HTMLInputElement>(".vector-text-input");
			input?.focus();
			input?.select();
		});
		return;
	}
	const node = element?.closest<SVGElement>("[data-node]");
	if (node && selected.value?.kind === "path" && !selected.value.locked) {
		const [index, pointIndex] = node.dataset.node!.split(":").map(Number);
		capture(event, svg, { kind: "node", start, object: selected.value, index, pointIndex });
		return;
	}
	if (
		element?.hasAttribute("data-resize") &&
		selection.value &&
		bounds.value &&
		!selection.value.locked
	) {
		capture(event, svg, {
			kind: "resize",
			start,
			object: selection.value,
			bounds: bounds.value,
		});
		return;
	}
	const id = element?.closest<SVGElement>("[data-vector-id]")?.dataset.vectorId ?? "";
	selectedId.value = id;
	const object = selected.value;
	if (object && !object.locked && tool.value === "select")
		capture(event, svg, { kind: "move", start, object });
}
function pointerMove(event: PointerEvent, index: number) {
	const point = eventPoint(event, event.currentTarget as SVGSVGElement);
	if (tool.value === "pen" && index === currentIndex.value && !drag) penHover.value = point;
	if (!drag || dragPointer !== event.pointerId) return;
	const dx = point[0] - drag.start[0],
		dy = point[1] - drag.start[1];
	if (drag.kind === "pen") {
		penDrag.value = { point: drag.start, handle: point };
	} else if (drag.kind === "move") {
		draft.value = {
			...drag.object,
			matrix: multiply([1, 0, 0, 1, dx, dy], drag.object.matrix),
		};
	} else if (drag.kind === "resize") {
		const { x, y, width, height } = drag.bounds;
		const sx = Math.max(0.01, 1 + dx / Math.max(width, 0.001));
		const sy = event.shiftKey ? sx : Math.max(0.01, 1 + dy / Math.max(height, 0.001));
		draft.value = {
			...drag.object,
			matrix: multiply([sx, 0, 0, sy, x * (1 - sx), y * (1 - sy)], drag.object.matrix),
		};
	} else if (drag.kind === "node") {
		const undoMatrix = inverse(drag.object.matrix);
		if (undoMatrix)
			draft.value = reshapeNode(
				drag.object,
				drag.index,
				drag.pointIndex,
				transformPoint(undoMatrix, point),
			);
	} else if (drag.kind === "draw") {
		const size = Math.max(Math.abs(dx), Math.abs(dy));
		const end: Point = event.shiftKey
			? [
					drag.start[0] + (Math.sign(dx) || 1) * size,
					drag.start[1] + (Math.sign(dy) || 1) * size,
				]
			: point;
		draft.value = {
			...newPath(
				drag.tool === "rectangle" ? "Rectangle" : "Ellipse",
				shapePath(drag.tool, drag.start, end),
			),
			id: drag.id,
			fill: swatch.value,
		};
	}
}
function pointerUp(event: PointerEvent) {
	if (!drag || dragPointer !== event.pointerId || !dragSvg) return;
	const ending = drag;
	const point = eventPoint(event, dragSvg);
	const distance =
		Math.hypot(point[0] - ending.start[0], point[1] - ending.start[1]) * scale.value;
	if (ending.kind === "pen") {
		const previous = pen.value.at(-1)?.point;
		let anchor = ending.start;
		if (previous && ending.shift && distance < 3) {
			const angle = Math.atan2(anchor[1] - previous[1], anchor[0] - previous[0]);
			const fixed = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
			const length = Math.hypot(anchor[0] - previous[0], anchor[1] - previous[1]);
			anchor = [
				previous[0] + Math.cos(fixed) * length,
				previous[1] + Math.sin(fixed) * length,
			];
		}
		if (pen.value.length < 4096)
			pen.value = [
				...pen.value,
				{ point: anchor, ...(distance >= 3 ? { handle: point } : {}) },
			];
		penHover.value = undefined;
		penDrag.value = undefined;
	} else if (draft.value && distance >= 2) {
		if (ending.kind === "draw") addObject(draft.value);
		else replaceObject(draft.value);
	}
	draft.value = undefined;
	drag = undefined;
	dragSvg = undefined;
	dragPointer = undefined;
}
function finishPen(close = false) {
	if (pen.value.length > 1) {
		const result = newPath("Pen path", penPath(pen.value, close), !close);
		addObject({
			...result,
			fill: close ? swatch.value : null,
			stroke: close ? null : swatch.value,
		});
	}
	pen.value = [];
	penHover.value = undefined;
	penDrag.value = undefined;
}
function keyboard(event: KeyboardEvent) {
	if (
		event.defaultPrevented ||
		(event.target instanceof Element &&
			event.target.closest("input, textarea, select, [contenteditable=true]"))
	)
		return;
	const key = event.key.toLowerCase();
	const modified = event.ctrlKey || event.metaKey;
	if (modified && key === "z") {
		event.preventDefault();
		if (event.shiftKey) redo();
		else undo();
	} else if (modified && key === "d") {
		event.preventDefault();
		duplicate();
	} else if (!modified && !event.altKey && !props.readonly) {
		const next = tools.find((item) => item.key.toLowerCase() === key);
		if (next) {
			event.preventDefault();
			selectTool(next.id);
		} else if (key === "escape") {
			cancelDrawing();
			selectedId.value = "";
		} else if (key === "enter" && tool.value === "pen" && pen.value.length) {
			event.preventDefault();
			finishPen();
		} else if (key === "delete" || key === "backspace") {
			event.preventDefault();
			erase();
		} else if (event.target === root.value && selected.value && key.startsWith("arrow")) {
			event.preventDefault();
			const step = event.shiftKey ? 10 : 1;
			const delta = {
				arrowup: [0, -step],
				arrowdown: [0, step],
				arrowleft: [-step, 0],
				arrowright: [step, 0],
			}[key];
			if (delta)
				patchObject({
					matrix: multiply([1, 0, 0, 1, delta[0], delta[1]], selected.value.matrix),
				});
		}
	}
}

const ready = Promise.withResolvers<void>();
void ready.promise.catch(() => {});
onMounted(async () => {
	try {
		const loaded = await openVectorProject(
			await artifactSourceToUint8Array(props.source),
			controller.signal,
		);
		controller.signal.throwIfAborted();
		project.value = original.value = loaded.project;
		nativeFormat.value = loaded.native;
		ready.resolve();
		emit("loaded");
		await nextTick();
		const canvas = view.value;
		if (canvas) {
			initialSizeObserver = new ResizeObserver(() => {
				if (canvas.clientWidth <= 72 || canvas.clientHeight <= 72) return;
				initialSizeObserver?.disconnect();
				fitBoard();
			});
			initialSizeObserver.observe(canvas);
		}
	} catch (cause) {
		ready.reject(cause);
		if (controller.signal.aborted) return;
		const error = cause instanceof Error ? cause : new Error(String(cause));
		issue.value = error.message;
		emit("error", error);
	}
});
onBeforeUnmount(() => {
	controller.abort();
	initialSizeObserver?.disconnect();
});
const isDirty = () => project.value !== original.value;
const subscribe = (callback: () => void) => {
	listeners.add(callback);
	return () => listeners.delete(callback);
};
function waitReady(signal?: AbortSignal) {
	signal?.throwIfAborted();
	if (!signal) return ready.promise;
	return new Promise<void>((resolve, reject) => {
		const abort = () => reject(signal.reason);
		signal.addEventListener("abort", abort, { once: true });
		void ready.promise
			.then(resolve, reject)
			.finally(() => signal.removeEventListener("abort", abort));
	});
}
function exportFile(format = "ai", options: { signal?: AbortSignal } = {}) {
	const snapshot = project.value;
	if (!snapshot) throw new Error("The vector document is loading.");
	return exportVectorProject(
		snapshot,
		documentName.value,
		format,
		currentIndex.value,
		options.signal,
	);
}
async function saveFile(
	options: { signal?: AbortSignal; deliver?: (blob: Blob) => Promise<void> } = {},
) {
	if (props.readonly) throw new Error("The vector document is read-only.");
	const snapshot = project.value;
	const blob = await exportFile("ai", options);
	if (options.deliver) {
		await options.deliver(blob);
		original.value = snapshot;
		nativeFormat.value = true;
		for (const listener of listeners) listener();
	}
	return blob;
}
async function output(format: VectorExportFormat) {
	if (working.value) return;
	working.value = true;
	issue.value = "";
	try {
		const title = documentName.value.replace(/\.[^.]+$/, "") || "Artwork";
		if (format === "ai") {
			await saveFile({
				deliver: async (blob) => {
					await deliverUiEditorFile({ intent: "save", fileName: `${title}.ai`, blob });
				},
			});
		} else {
			await deliverUiEditorFile({
				intent: "export",
				fileName: `${title}.${format}`,
				blob: await exportFile(format),
			});
		}
	} catch (cause) {
		if (!(cause instanceof DOMException && cause.name === "AbortError"))
			issue.value = cause instanceof Error ? cause.message : String(cause);
	} finally {
		working.value = false;
	}
}
defineExpose({
	isDirty,
	subscribe,
	waitReady,
	exportFile,
	saveFile,
	undo,
	redo,
	getRevision: () => revision.value,
	setDocumentName: (name: string) => {
		documentName.value = name;
	},
	requiresSaveAs: () => !nativeFormat.value,
});
</script>

<template>
	<div
		ref="root"
		class="vector-editor"
		:data-appearance="graphicsAppearance"
		tabindex="-1"
		@keydown="keyboard"
	>
		<div v-if="!project" class="vector-editor__loading" role="status">
			{{ issue || "Opening Illustrator artboards…" }}
		</div>
		<template v-else>
			<header class="vector-commandbar" aria-label="Vector commands">
				<div class="vector-commandbar__document">
					<UiIcon name="shape" :size="17" />
					<strong>{{ documentName }}</strong>
					<span
						v-if="isDirty()"
						class="vector-dirty"
						title="Unsaved changes"
						aria-label="Unsaved changes"
					/>
				</div>
				<div class="vector-commandbar__group">
					<button
						type="button"
						aria-label="Undo"
						title="Undo"
						:disabled="!undoStack.length"
						@click="undo"
					>
						<UiIcon name="undo" />
					</button>
					<button
						type="button"
						aria-label="Redo"
						title="Redo"
						:disabled="!redoStack.length"
						@click="redo"
					>
						<UiIcon name="redo" />
					</button>
				</div>
				<div class="vector-commandbar__context">
					<template v-if="tool === 'pen' && pen.length">
						<button type="button" :disabled="pen.length < 2" @click="finishPen()">
							Finish path
						</button>
						<button type="button" :disabled="pen.length < 3" @click="finishPen(true)">
							Close path
						</button>
					</template>
					<template v-else-if="selected">
						<button
							type="button"
							:disabled="selected.locked || readonly"
							@click="duplicate"
						>
							<UiIcon name="duplicate" /> Duplicate
						</button>
						<button
							type="button"
							:disabled="selected.locked || readonly"
							@click="rotate(15)"
							title="Rotate 15°"
						>
							Rotate 15°
						</button>
					</template>
				</div>
				<button
					type="button"
					class="vector-save"
					:disabled="readonly || working"
					@click="output('ai')"
				>
					<UiIcon name="save" /> {{ nativeFormat ? "Save" : "Save editable copy" }}
				</button>
				<details class="vector-export">
					<summary>Export <span aria-hidden="true">⌄</span></summary>
					<div>
						<button
							type="button"
							:disabled="working"
							@click="
								output('svg');
								($event.target as HTMLElement).closest('details')!.open = false;
							"
						>
							Current artboard · SVG
						</button>
						<button
							type="button"
							:disabled="working"
							@click="
								output('png');
								($event.target as HTMLElement).closest('details')!.open = false;
							"
						>
							Current artboard · PNG
						</button>
						<button
							type="button"
							:disabled="working"
							@click="
								output('pdf');
								($event.target as HTMLElement).closest('details')!.open = false;
							"
						>
							All artboards · PDF
						</button>
					</div>
				</details>
			</header>
			<div v-if="issue" class="vector-error" role="alert">
				<span>{{ issue }}</span
				><button type="button" @click="issue = ''">Close</button>
			</div>
			<div class="vector-workspace">
				<div
					class="vector-tools"
					role="toolbar"
					aria-label="Illustrator tools"
					aria-orientation="vertical"
				>
					<button
						v-for="entry in tools"
						:key="entry.id"
						type="button"
						:data-tool="entry.id"
						:aria-label="entry.name"
						:title="`${entry.name} (${entry.key})`"
						:aria-keyshortcuts="entry.key"
						:aria-pressed="tool === entry.id"
						:disabled="readonly"
						@click="selectTool(entry.id)"
					>
						<UiIcon v-if="entry.id !== 'pen'" :name="entry.icon" :size="18" />
						<svg
							v-else
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path
								d="m3 21 2.7-10 9.7-3L18 11l-3 9.1L3 21Zm0 0 7-7m5.4-6 2.7-4L22 8l-4 3"
							/>
							<circle cx="11" cy="13" r="1.25" />
						</svg>
					</button>
					<label class="vector-swatch" title="Color for new objects">
						<input
							v-model="swatch"
							type="color"
							aria-label="Color for new objects"
							:disabled="readonly"
						/>
					</label>
				</div>
				<main ref="view" class="vector-pasteboard" aria-label="Artboard canvas">
					<div class="vector-pasteboard__content">
						<section
							v-for="(sheet, index) in project.artboards"
							:key="sheet.id"
							class="vector-artboard"
							:data-artboard-index="index"
							:data-active="index === currentIndex"
						>
							<button
								class="vector-artboard__caption"
								type="button"
								@click="chooseBoard(index)"
							>
								{{ String(index + 1).padStart(2, "0") }} · {{ sheet.name }}
							</button>
							<svg
								class="vector-artboard__page"
								:data-tool="tool"
								:viewBox="`0 0 ${sheet.width} ${sheet.height}`"
								:width="sheet.width * scale"
								:height="sheet.height * scale"
								:aria-label="sheet.name"
								@pointerdown="pointerDown($event, index)"
								@pointermove="pointerMove($event, index)"
								@pointerup="pointerUp"
								@pointercancel="cancelDrawing"
								@pointerleave="penHover = undefined"
							>
								<image
									v-if="sheet.background"
									:href="`data:image/png;base64,${sheet.background}`"
									:width="sheet.width"
									:height="sheet.height"
									pointer-events="none"
									preserveAspectRatio="none"
								/>
								<IllustratorArtwork
									v-for="object in sheet.objects"
									:key="object.id"
									:object="
										index === currentIndex && draft?.id === object.id
											? draft
											: object
									"
								/>
								<template v-if="index === currentIndex">
									<IllustratorArtwork
										v-if="draft && !selectedId"
										:object="draft"
									/>
									<g
										v-if="selection && !selection.hidden && bounds"
										class="vector-selection"
									>
										<rect
											v-if="tool !== 'anchor'"
											fill="none"
											:x="bounds.x"
											:y="bounds.y"
											:width="bounds.width"
											:height="bounds.height"
											vector-effect="non-scaling-stroke"
											pointer-events="none"
										/>
										<rect
											v-if="
												tool === 'select' &&
												!selection.locked &&
												!readonly &&
												bounds.width > 0.01 &&
												bounds.height > 0.01
											"
											class="vector-handle vector-resize"
											data-resize
											:x="bounds.x + bounds.width - 4 / scale"
											:y="bounds.y + bounds.height - 4 / scale"
											:width="8 / scale"
											:height="8 / scale"
											vector-effect="non-scaling-stroke"
										/>
										<template
											v-for="node in nodes"
											:key="`${node.index}:${node.pointIndex}`"
										>
											<line
												v-if="node.from"
												class="vector-handle-line"
												:x1="node.from[0]"
												:y1="node.from[1]"
												:x2="node.point[0]"
												:y2="node.point[1]"
												vector-effect="non-scaling-stroke"
												pointer-events="none"
											/>
											<circle
												class="vector-handle"
												:class="{ 'vector-control-point': node.from }"
												:data-node="`${node.index}:${node.pointIndex}`"
												:cx="node.point[0]"
												:cy="node.point[1]"
												:r="(node.from ? 3.5 : 4.5) / scale"
												vector-effect="non-scaling-stroke"
											/>
										</template>
									</g>
									<g
										v-if="tool === 'pen'"
										class="vector-selection"
										pointer-events="none"
									>
										<line
											v-if="penDrag?.handle"
											class="vector-handle-line"
											:x1="2 * penDrag.point[0] - penDrag.handle[0]"
											:y1="2 * penDrag.point[1] - penDrag.handle[1]"
											:x2="penDrag.handle[0]"
											:y2="penDrag.handle[1]"
											vector-effect="non-scaling-stroke"
										/>
										<path
											:d="pathData(penPreview)"
											fill="none"
											vector-effect="non-scaling-stroke"
										/>
										<circle
											v-for="(anchor, i) in pen"
											:key="i"
											class="vector-handle"
											:cx="anchor.point[0]"
											:cy="anchor.point[1]"
											:r="(i === 0 ? 4.5 : 3.5) / scale"
											vector-effect="non-scaling-stroke"
										/>
									</g>
								</template>
							</svg>
						</section>
					</div>
				</main>
				<aside v-if="board" class="vector-inspector" aria-label="Artwork panels">
					<section class="vector-properties">
						<h2>
							Properties
							<span>{{
								selected?.kind === "text" ? "Text" : selected ? "Path" : "Artboard"
							}}</span>
						</h2>
						<div v-if="selected && bounds" class="vector-properties__body">
							<label class="vector-property-line"
								>Name
								<input
									:value="selected.name"
									maxlength="128"
									:disabled="selected.locked || readonly"
									@change="
										patchObject({
											name:
												($event.target as HTMLInputElement).value.trim() ||
												selected!.name,
										})
									"
								/>
							</label>
							<fieldset :disabled="selected.locked || readonly">
								<legend>Transform</legend>
								<div class="vector-property-grid">
									<label
										v-for="key in ['x', 'y', 'width', 'height'] as const"
										:key="key"
									>
										{{ { x: "X", y: "Y", width: "W", height: "H" }[key] }}
										<input
											type="number"
											:aria-label="`Object ${key}`"
											:value="Number(bounds[key].toFixed(2))"
											step="any"
											@change="
												changeNumber(
													$event,
													key === 'x' || key === 'y' ? -100000 : 0.01,
													100000,
													(v) => changeBounds(key, v),
												)
											"
										/>
									</label>
								</div>
							</fieldset>
							<fieldset :disabled="selected.locked || readonly">
								<legend>Appearance</legend>
								<div class="vector-property-grid">
									<label
										>Fill
										<input
											type="color"
											aria-label="Fill color"
											:value="selected.fill || '#000000'"
											@input="changeColor($event, 'fill')"
									/></label>
									<button
										type="button"
										:disabled="!selected.fill"
										@click="patchObject({ fill: null })"
									>
										No fill
									</button>
									<template v-if="selected.kind === 'path'">
										<label
											>Stroke
											<input
												type="color"
												aria-label="Stroke color"
												:value="selected.stroke || '#000000'"
												@input="changeColor($event, 'stroke')"
										/></label>
										<button
											type="button"
											:disabled="!selected.stroke"
											@click="patchObject({ stroke: null })"
										>
											No stroke
										</button>
										<label
											>Weight
											<input
												type="number"
												min="0"
												max="4096"
												step=".25"
												aria-label="Stroke width"
												:value="selected.strokeWidth"
												@change="
													changeNumber($event, 0, 4096, (v) =>
														patchObject({ strokeWidth: v }),
													)
												"
										/></label>
									</template>
									<label
										>Opacity
										<input
											type="number"
											min="0"
											max="100"
											aria-label="Opacity"
											:value="
												Math.round(
													100 *
														(selected.fill
															? selected.fillAlpha
															: selected.kind === 'path'
																? selected.strokeAlpha
																: selected.fillAlpha),
												)
											"
											@change="changeNumber($event, 0, 100, updateOpacity)"
									/></label>
								</div>
							</fieldset>
							<fieldset
								v-if="selected.kind === 'text'"
								:disabled="selected.locked || readonly"
							>
								<legend>Type</legend>
								<label class="vector-property-line"
									>Text
									<input
										class="vector-text-input"
										maxlength="1024"
										:value="selected.text"
										@change="
											patchObject({
												text: ($event.target as HTMLInputElement).value,
											})
										"
									/>
								</label>
								<label class="vector-property-line"
									>Size
									<input
										type="number"
										min="1"
										max="512"
										:value="selected.size"
										@change="
											changeNumber($event, 1, 512, (v) =>
												patchObject({ size: v }),
											)
										"
									/>
								</label>
							</fieldset>
						</div>
						<div v-else class="vector-properties__body">
							<label class="vector-property-line"
								>Name
								<input
									:value="board.name"
									maxlength="128"
									:disabled="readonly"
									@change="
										changeBoard({
											name:
												($event.target as HTMLInputElement).value.trim() ||
												board!.name,
										})
									"
								/>
							</label>
							<div class="vector-property-grid">
								<label
									>W
									<input
										type="number"
										aria-label="Artboard width"
										:value="Number(board.width.toFixed(2))"
										:disabled="readonly"
										@change="
											changeNumber($event, 1, MAX_DIMENSION, (v) =>
												changeBoard({ width: v }),
											)
										"
								/></label>
								<label
									>H
									<input
										type="number"
										aria-label="Artboard height"
										:value="Number(board.height.toFixed(2))"
										:disabled="readonly"
										@change="
											changeNumber($event, 1, MAX_DIMENSION, (v) =>
												changeBoard({ height: v }),
											)
										"
								/></label>
							</div>
							<p v-if="board.background" class="vector-note">
								Original artwork is a locked background. Draw new objects on top.
							</p>
						</div>
					</section>
					<section class="vector-structure">
						<div class="vector-panel-tabs" aria-label="Structure panel">
							<button
								type="button"
								:aria-pressed="panel === 'layers'"
								@click="panel = 'layers'"
							>
								Layers
							</button>
							<button
								type="button"
								:aria-pressed="panel === 'artboards'"
								@click="panel = 'artboards'"
							>
								Artboards
							</button>
						</div>
						<div
							v-if="panel === 'layers'"
							class="vector-panel-list"
							aria-label="Object layers"
						>
							<div
								v-for="object in [...board.objects].reverse()"
								:key="object.id"
								class="vector-layer"
								:data-selected="object.id === selectedId"
							>
								<button
									type="button"
									:disabled="readonly"
									:aria-label="`${object.hidden ? 'Show' : 'Hide'} ${object.name}`"
									@click="
										replaceObject({ ...object, hidden: !object.hidden }, true)
									"
								>
									<UiIcon :name="object.hidden ? 'eye-off' : 'eye'" :size="15" />
								</button>
								<button
									type="button"
									class="vector-layer__name"
									:title="object.name"
									@click="selectedId = object.id"
								>
									<UiIcon
										:name="object.kind === 'text' ? 'text' : 'shape'"
										:size="15"
									/>
									{{ object.name }}
								</button>
								<button
									type="button"
									:disabled="readonly"
									:aria-label="`${object.locked ? 'Unlock' : 'Lock'} ${object.name}`"
									@click="
										replaceObject({ ...object, locked: !object.locked }, true)
									"
								>
									<UiIcon :name="object.locked ? 'lock' : 'unlock'" :size="15" />
								</button>
							</div>
							<div
								v-if="board.background"
								class="vector-layer vector-layer--background"
							>
								<UiIcon name="lock" :size="15" /> <span>Locked artwork</span>
							</div>
							<p
								v-if="!board.objects.length && !board.background"
								class="vector-note"
							>
								Draw an object to add a layer.
							</p>
						</div>
						<div v-else class="vector-panel-list" aria-label="Artboards">
							<button
								v-for="(sheet, index) in project.artboards"
								:key="sheet.id"
								class="vector-artboard-row"
								type="button"
								:aria-pressed="index === currentIndex"
								@click="chooseBoard(index)"
							>
								<span>{{ index + 1 }}</span> {{ sheet.name }}
							</button>
						</div>
						<div v-if="panel === 'layers'" class="vector-panel-actions">
							<button
								type="button"
								aria-label="Bring forward"
								title="Bring forward"
								:disabled="!selected || selected.locked || readonly"
								@click="reorder(1)"
							>
								<UiIcon name="arrow-up" />
							</button>
							<button
								type="button"
								aria-label="Send backward"
								title="Send backward"
								:disabled="!selected || selected.locked || readonly"
								@click="reorder(-1)"
							>
								<UiIcon name="arrow-down" />
							</button>
							<button
								type="button"
								aria-label="Delete object"
								title="Delete object"
								:disabled="!selected || selected.locked || readonly"
								@click="erase"
							>
								<UiIcon name="trash" />
							</button>
						</div>
						<div v-else class="vector-panel-actions">
							<button
								type="button"
								aria-label="New artboard"
								title="New artboard"
								:disabled="readonly || project.artboards.length >= MAX_BOARDS"
								@click="addBoard"
							>
								<UiIcon name="plus" />
							</button>
							<button
								type="button"
								aria-label="Delete artboard"
								title="Delete artboard"
								:disabled="readonly || project.artboards.length < 2"
								@click="deleteBoard"
							>
								<UiIcon name="trash" />
							</button>
						</div>
					</section>
				</aside>
			</div>
			<footer class="vector-status" aria-label="Illustrator workspace status">
				<span>{{ selectedTool.name }}</span>
				<span>{{ currentIndex + 1 }} / {{ project.artboards.length }} artboards</span>
				<div>
					<button type="button" @click="fitBoard">Fit artboard</button>
					<button type="button" aria-label="Zoom out" @click="zoom(scale / 1.2)">
						<UiIcon name="minus" :size="15" />
					</button>
					<output>{{ Math.round(scale * 100) }}%</output>
					<button type="button" aria-label="Zoom in" @click="zoom(scale * 1.2)">
						<UiIcon name="plus" :size="15" />
					</button>
				</div>
			</footer>
		</template>
	</div>
</template>
