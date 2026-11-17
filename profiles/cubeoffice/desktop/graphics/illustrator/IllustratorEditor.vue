<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { artifactSourceToUint8Array, type ArtifactSource } from "@yaochn/als-office-editor-core";
import {
	UiContextMenu,
	UiEditorFileSection,
	UiIcon,
	useUiContextMenuFocus,
	useUiEditorPalette,
	UiRibbonCommandButton,
	UiRibbonGroup,
	deliverUiEditorFile,
	type UiMenuItem,
} from "@yaochn/als-office-editor-ui/vue";
import { graphicsAppearance } from "../appearance";
import { applyIllustratorActions, illustratorActionManifest } from "./ai-actions";
import { exportVectorProject } from "./export";
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
	isObjectHidden,
	multiply,
	newArtboard,
	newPath,
	pathData,
	shapePath,
	transformPoint,
	type Artboard,
	type Point,
	type Matrix,
	type VectorObject,
	type VectorProject,
	type VectorText,
} from "./model";
import {
	alignObjects,
	alignmentCommands,
	boxBetween,
	distributeObjects,
	enclosed,
	selectionUnits,
	transformObjects,
	unionBounds,
	type Alignment,
} from "./selection";
import type { IllustratorCommand, IllustratorMenuState } from "./menu-commands";
import IllustratorArtwork from "./IllustratorArtwork.vue";
import IllustratorRibbon from "./IllustratorRibbon.vue";
import "./styles.css";

const props = defineProps<{ source: ArtifactSource; fileName: string; readonly?: boolean }>();
const documentName = ref(props.fileName);
const editorPalette = useUiEditorPalette();
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
const selectedIds = shallowRef<Set<string>>(new Set());
const alignTo = ref<"selection" | "artboard">("selection");
const panel = ref<"layers" | "artboards">("layers");
const showProperties = ref(true);
const showStructure = ref(true);
const scale = ref(1);
const view = ref<HTMLElement>();
const root = ref<HTMLElement>();
const working = ref(false);
const issue = ref("");
const swatch = ref("#7854d8");
let sizeObserver: ResizeObserver | undefined;
const viewportSize = ref({ width: 0, height: 0 });
const spacePan = ref(false);
const panning = ref(false);
const handActive = computed(() => spacePan.value || tool.value === "hand");

const tools = [
	{ id: "select", name: "Selection", key: "V", icon: "move" },
	{ id: "anchor", name: "Direct Selection", key: "A", icon: "connector-curved" },
	{ id: "pen", name: "Pen", key: "P", icon: "draw" },
	{ id: "rectangle", name: "Rectangle", key: "M", icon: "shape-rect" },
	{ id: "ellipse", name: "Ellipse", key: "L", icon: "shape-ellipse" },
	{ id: "text", name: "Type", key: "T", icon: "text" },
	{ id: "hand", name: "Hand", key: "H", icon: "move" },
] as const;
type Tool = (typeof tools)[number]["id"];
const tool = ref<Tool>("select");
const selectedTool = computed(() => tools.find((item) => item.id === tool.value)!);
const board = computed(() => project.value?.artboards[currentIndex.value]);
const collapsedGroups = shallowRef(new Set<string>());
type LayerRow =
	| { kind: "object"; id: string; object: VectorObject }
	| { kind: "group"; id: string; name: string; hidden: boolean };
const layerRows = computed<LayerRow[]>(() => {
	const activeBoard = board.value;
	if (!activeBoard) return [];
	const rows: LayerRow[] = [];
	const children = new Map<string, LayerRow[]>();
	for (const object of [...activeBoard.objects].reverse()) {
		const row: LayerRow = { kind: "object", id: object.id, object };
		const id = object.groupId;
		if (!id) {
			rows.push(row);
			continue;
		}
		const groupRows = children.get(id);
		if (groupRows) {
			groupRows.push(row);
			continue;
		}
		children.set(id, [row]);
		const group = activeBoard.groups?.[id];
		rows.push({
			kind: "group",
			id,
			name: group?.name ?? "Group",
			hidden: group?.hidden ?? false,
		});
	}
	return rows.flatMap((row) =>
		row.kind === "group" && !collapsedGroups.value.has(row.id)
			? [row, ...children.get(row.id)!]
			: [row],
	);
});
function toggleGroupExpansion(id: string) {
	const next = new Set(collapsedGroups.value);
	if (!next.delete(id)) next.add(id);
	collapsedGroups.value = next;
}
function toggleGroupVisibility(id: string) {
	const activeBoard = board.value;
	if (!activeBoard || props.readonly) return;
	const group = activeBoard.groups?.[id] ?? { name: "Group", hidden: false };
	updateBoard({
		...activeBoard,
		groups: { ...activeBoard.groups, [id]: { ...group, hidden: !group.hidden } },
	});
	if (!group.hidden)
		setSelection(picked.value.filter((object) => object.groupId !== id).map(({ id }) => id));
}
function selectGroup(id: string) {
	setSelection(
		selectableObjects()
			.filter((object) => object.groupId === id)
			.map(({ id }) => id),
	);
}
const picked = computed(
	() => board.value?.objects.filter((object) => selectedIds.value.has(object.id)) ?? [],
);
const selected = computed(() => (picked.value.length === 1 ? picked.value[0] : undefined));
const editable = computed(() =>
	picked.value.filter((object) => !object.locked && !isObjectHidden(board.value, object)),
);
const draft = shallowRef<VectorObject>();
const draftObjects = shallowRef<Map<string, VectorObject>>();
const marquee = shallowRef<Bounds>();
const selection = computed(() => (selected.value ? displayObject(selected.value) : undefined));
const bounds = computed(() => selection.value && objectBounds(selection.value));
const units = computed(() => selectionUnits(editable.value));
const editBounds = computed(() =>
	unionBounds(editable.value.map((object) => objectBounds(displayObject(object)))),
);
const canGroup = computed(() => !props.readonly && units.value.length > 1);
const canUngroup = computed(
	() => !props.readonly && editable.value.some((object) => object.groupId),
);

function displayObject(object: VectorObject): VectorObject {
	return (
		draftObjects.value?.get(object.id) ?? (draft.value?.id === object.id ? draft.value : object)
	);
}

function setSelection(ids: Iterable<string> = []) {
	selectedIds.value = new Set(ids);
}
function groupMembers(object: VectorObject, individual = false): VectorObject[] {
	return !individual && object.groupId && !isObjectHidden(board.value, object) && !object.locked
		? board.value!.objects.filter(
				(member) =>
					member.groupId === object.groupId &&
					!isObjectHidden(board.value, member) &&
					!member.locked,
			)
		: [object];
}
function selectObject(object: VectorObject, toggle = false, individual = false) {
	const members = groupMembers(object, individual);
	if (!toggle) {
		setSelection(members.map((member) => member.id));
		return;
	}
	const next = new Set(selectedIds.value);
	const remove = members.every((member) => next.has(member.id));
	for (const member of members) {
		if (remove) next.delete(member.id);
		else next.add(member.id);
	}
	setSelection(next);
}
const nodes = computed(() =>
	tool.value === "anchor" &&
	selection.value?.kind === "path" &&
	!selection.value.locked &&
	!isObjectHidden(board.value, selection.value)
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
	setSelection();
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
function replaceObjects(changes: readonly VectorObject[], includeLocked = false) {
	if (!board.value || !changes.length) return;
	const replacements = new Map(changes.map((change) => [change.id, change]));
	updateBoard({
		...board.value,
		objects: board.value.objects.map((object) =>
			object.locked && !includeLocked ? object : (replacements.get(object.id) ?? object),
		),
	});
}
function replaceObject(next: VectorObject, includeLocked = false) {
	replaceObjects([next], includeLocked);
}
function transformSelection(matrix: Matrix) {
	replaceObjects(transformObjects(editable.value, matrix));
}
function addObject(object: VectorObject) {
	if (!project.value || !board.value || props.readonly) return;
	if (project.value.artboards.reduce((total, b) => total + b.objects.length, 0) >= MAX_OBJECTS) {
		issue.value = "The document has reached its object limit.";
		return;
	}
	updateBoard({ ...board.value, objects: [...board.value.objects, object] });
	setSelection([object.id]);
}
function patchObject(patch: Partial<VectorObject>) {
	if (selected.value) replaceObject({ ...selected.value, ...patch } as VectorObject);
}
function erase() {
	if (!board.value || !editable.value.length || props.readonly) return;
	const remove = new Set(editable.value.map((object) => object.id));
	updateBoard({
		...board.value,
		objects: board.value.objects.filter((object) => !remove.has(object.id)),
	});
	setSelection();
}
function duplicate() {
	if (!project.value || !board.value || !editable.value.length || props.readonly) return;
	if (
		project.value.artboards.reduce((n, b) => n + b.objects.length, 0) + editable.value.length >
		MAX_OBJECTS
	) {
		issue.value = "The document has reached its object limit.";
		return;
	}
	const groups = new Map<string, string>();
	const copies = transformObjects(editable.value, [1, 0, 0, 1, 12, 12]).map((object) => {
		let groupId: string | undefined;
		if (object.groupId) {
			groupId = groups.get(object.groupId) ?? crypto.randomUUID();
			groups.set(object.groupId, groupId);
		}
		return {
			...object,
			id: crypto.randomUUID(),
			name: `${object.name.slice(0, 120)} copy`,
			groupId,
		};
	});
	updateBoard({ ...board.value, objects: [...board.value.objects, ...copies] });
	setSelection(copies.map((object) => object.id));
}
function reorder(step: 1 | -1, toEdge = false) {
	if (!board.value || !editable.value.length || props.readonly) return;
	const objects = [...board.value.objects];
	const members = new Set(editable.value.map((object) => object.id));
	if (toEdge) {
		// A locked layer is a boundary, matching the one-step Arrange commands.
		let start = 0;
		for (let end = 0; end <= objects.length; end++) {
			if (end < objects.length && !objects[end].locked) continue;
			const segment = objects.slice(start, end);
			const moved = segment.filter((item) => members.has(item.id));
			const rest = segment.filter((item) => !members.has(item.id));
			objects.splice(
				start,
				segment.length,
				...(step === 1 ? [...rest, ...moved] : [...moved, ...rest]),
			);
			start = end + 1;
		}
		if (objects.some((item, index) => item !== board.value!.objects[index]))
			updateBoard({ ...board.value, objects });
		return;
	}
	let changed = false;
	// Process from the leading edge so an adjacent selection moves as a block.
	for (let i = step === 1 ? objects.length - 2 : 1; i >= 0 && i < objects.length; i -= step) {
		const neighbor = objects[i + step];
		if (!neighbor || !members.has(objects[i].id) || members.has(neighbor.id) || neighbor.locked)
			continue;
		[objects[i], objects[i + step]] = [neighbor, objects[i]];
		changed = true;
	}
	if (changed) updateBoard({ ...board.value, objects });
}
function groupSelection() {
	if (!canGroup.value) return;
	const groupId = crypto.randomUUID();
	replaceObjects(editable.value.map((object) => ({ ...object, groupId })));
}
function ungroupSelection() {
	if (!canUngroup.value) return;
	replaceObjects(
		editable.value
			.filter((object) => object.groupId)
			.map((object) => ({ ...object, groupId: undefined })),
	);
}
function align(alignment: Alignment) {
	if (!board.value || !editBounds.value || props.readonly) return;
	const target =
		alignTo.value === "artboard"
			? { x: 0, y: 0, width: board.value.width, height: board.value.height }
			: editBounds.value;
	replaceObjects(alignObjects(units.value, alignment, target));
}
function distribute(axis: "x" | "y") {
	if (!props.readonly) replaceObjects(distributeObjects(units.value, axis));
}
function changeNumber(event: Event, min: number, max: number, apply: (value: number) => void) {
	const input = event.target as HTMLInputElement;
	const value = input.valueAsNumber;
	if (Number.isFinite(value)) apply(Math.max(min, Math.min(max, value)));
	else input.value = input.defaultValue;
}
function changeBounds(key: keyof Bounds, value: number) {
	const box = editBounds.value;
	if (!box) return;
	if (key === "x" || key === "y") {
		transformSelection([
			1,
			0,
			0,
			1,
			key === "x" ? value - box.x : 0,
			key === "y" ? value - box.y : 0,
		]);
	} else {
		if (box[key] < 0.001) return;
		const sx = key === "width" ? value / box.width : 1,
			sy = key === "height" ? value / box.height : 1;
		transformSelection([sx, 0, 0, sy, box.x * (1 - sx), box.y * (1 - sy)]);
	}
}
function rotate(degrees: number) {
	if (!editBounds.value) return;
	const { x, y, width, height } = editBounds.value;
	const cx = x + width / 2,
		cy = y + height / 2,
		angle = (degrees * Math.PI) / 180;
	const c = Math.cos(angle),
		s = Math.sin(angle);
	transformSelection([c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]);
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
		setSelection();
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
	setSelection();
	chooseBoard(Math.min(currentIndex.value, artboards.length - 1));
}
function changeBoard(patch: Partial<Artboard>) {
	if (board.value) updateBoard({ ...board.value, ...patch });
}
function zoom(value: number) {
	scale.value = Math.min(4, Math.max(0.05, value));
}
function artboardPage(index = currentIndex.value) {
	return view.value?.querySelector<SVGSVGElement>(
		`[data-artboard-index="${index}"] .vector-artboard__page`,
	);
}
function centerBoard() {
	void nextTick(() => {
		const surface = view.value;
		const page = artboardPage()?.getBoundingClientRect();
		if (!surface || !page) return;
		const frame = surface.getBoundingClientRect();
		surface.scrollLeft += page.left + page.width / 2 - frame.left - surface.clientWidth / 2;
		surface.scrollTop += page.top + page.height / 2 - frame.top - surface.clientHeight / 2;
	});
}
function zoomAround(clientX: number, clientY: number, value: number) {
	const surface = view.value;
	if (!surface || drag || pan) return;
	const frame = surface.getBoundingClientRect();
	const x =
		clientX >= frame.left && clientX < frame.right ? clientX : frame.left + frame.width / 2;
	const y =
		clientY >= frame.top && clientY < frame.bottom ? clientY : frame.top + frame.height / 2;
	const page =
		document.elementFromPoint(x, y)?.closest<SVGSVGElement>(".vector-artboard__page") ??
		artboardPage();
	if (!page || !surface.contains(page)) return;

	const before = page.getBoundingClientRect();
	const fractionX = (x - before.left) / before.width;
	const fractionY = (y - before.top) / before.height;
	const previous = scale.value;
	zoom(value);
	if (previous === scale.value) return;
	void nextTick(() => {
		if (!page.isConnected || surface !== view.value) return;
		const after = page.getBoundingClientRect();
		surface.scrollLeft += after.left + fractionX * after.width - x;
		surface.scrollTop += after.top + fractionY * after.height - y;
	});
}
function wheelZoom(event: WheelEvent) {
	if (!event.ctrlKey && !event.metaKey) return;
	event.preventDefault();
	if (gestureZoomStart !== undefined || !event.deltaY) return;
	zoomAround(event.clientX, event.clientY, scale.value * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
}
let gestureZoomStart: number | undefined;
function handlePinch(event: Event) {
	const gesture = event as MouseEvent & { scale: number };
	event.preventDefault();
	if (event.type === "gestureend") gestureZoomStart = undefined;
	else if (event.type === "gesturestart") gestureZoomStart = scale.value;
	else if (gestureZoomStart !== undefined && Number.isFinite(gesture.scale) && gesture.scale > 0)
		zoomAround(gesture.clientX, gesture.clientY, gestureZoomStart * gesture.scale);
}

let pan: { surface: HTMLElement; id: number; origin: Point; scroll: Point } | undefined;
function startPan(event: PointerEvent) {
	const surface = view.value;
	if (!surface || !event.isPrimary || event.button !== 0 || event.ctrlKey || drag || pan) return;
	if (!handActive.value) {
		if (
			event.target instanceof Element &&
			!event.target.closest("button, .vector-artboard__page")
		)
			surface.focus({ preventScroll: true });
		return;
	}
	event.preventDefault();
	event.stopPropagation();
	surface.focus({ preventScroll: true });
	pan = {
		surface,
		id: event.pointerId,
		origin: [event.clientX, event.clientY],
		scroll: [surface.scrollLeft, surface.scrollTop],
	};
	panning.value = true;
	surface.setPointerCapture(event.pointerId);
}
function movePan(event: PointerEvent) {
	if (!pan || pan.id !== event.pointerId) return;
	pan.surface.scrollLeft = pan.scroll[0] - (event.clientX - pan.origin[0]);
	pan.surface.scrollTop = pan.scroll[1] - (event.clientY - pan.origin[1]);
}
function stopPan(event?: PointerEvent) {
	if (!pan || (event && event.pointerId !== pan.id)) return;
	const { surface, id } = pan;
	pan = undefined;
	panning.value = false;
	if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
}
function releaseSpace(event: KeyboardEvent) {
	if (event.code === "Space") spacePan.value = false;
}
function resetNavigation() {
	spacePan.value = false;
	gestureZoomStart = undefined;
	stopPan();
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
	centerBoard();
}

type PointerEdit =
	| { kind: "move"; start: Point; objects: VectorObject[] }
	| { kind: "marquee"; start: Point; add: boolean }
	| { kind: "resize"; start: Point; objects: VectorObject[]; bounds: Bounds }
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
	draftObjects.value = undefined;
	marquee.value = undefined;
	pen.value = [];
	penHover.value = undefined;
	penDrag.value = undefined;
	if (dragPointer !== undefined && dragSvg?.hasPointerCapture(dragPointer))
		dragSvg.releasePointerCapture(dragPointer);
	drag = undefined;
	dragSvg = undefined;
	dragPointer = undefined;
}
function eventPoint(event: MouseEvent, svg: SVGSVGElement): Point {
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
	if (
		event.button !== 0 ||
		event.ctrlKey ||
		!event.isPrimary ||
		handActive.value ||
		props.readonly
	)
		return;
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
		setSelection();
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
	if (element?.hasAttribute("data-resize") && editBounds.value && editable.value.length) {
		capture(event, svg, {
			kind: "resize",
			start,
			objects: editable.value,
			bounds: editBounds.value,
		});
		return;
	}
	const id = element?.closest<SVGElement>("[data-vector-id]")?.dataset.vectorId;
	const object = board.value?.objects.find((candidate) => candidate.id === id);
	if (!object || object.locked) {
		if (tool.value === "select")
			capture(event, svg, { kind: "marquee", start, add: event.shiftKey });
		else if (!event.shiftKey) setSelection();
		return;
	}
	const individual = event.altKey || tool.value === "anchor";
	if (event.shiftKey || individual || !selectedIds.value.has(object.id))
		selectObject(object, event.shiftKey, individual);
	if (!event.shiftKey && tool.value === "select" && editable.value.length)
		capture(event, svg, { kind: "move", start, objects: editable.value });
}
function pointerMove(event: PointerEvent, index: number) {
	const point = eventPoint(event, event.currentTarget as SVGSVGElement);
	if (tool.value === "pen" && index === currentIndex.value && !drag && !handActive.value)
		penHover.value = point;
	if (!drag || dragPointer !== event.pointerId) return;
	const dx = point[0] - drag.start[0],
		dy = point[1] - drag.start[1];
	if (drag.kind === "pen") {
		penDrag.value = { point: drag.start, handle: point };
	} else if (drag.kind === "marquee") {
		marquee.value = boxBetween(drag.start, point);
	} else if (drag.kind === "move") {
		draftObjects.value = new Map(
			transformObjects(drag.objects, [1, 0, 0, 1, dx, dy]).map((object) => [
				object.id,
				object,
			]),
		);
	} else if (drag.kind === "resize") {
		const { x, y, width, height } = drag.bounds;
		const sx = Math.max(0.01, 1 + dx / Math.max(width, 0.001));
		const sy = event.shiftKey ? sx : Math.max(0.01, 1 + dy / Math.max(height, 0.001));
		draftObjects.value = new Map(
			transformObjects(drag.objects, [sx, 0, 0, sy, x * (1 - sx), y * (1 - sy)]).map(
				(object) => [object.id, object],
			),
		);
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
	} else if (ending.kind === "marquee") {
		const ids = ending.add ? new Set(selectedIds.value) : new Set<string>();
		if (distance >= 2 && marquee.value && board.value) {
			for (const object of board.value.objects) {
				if (
					!isObjectHidden(board.value, object) &&
					!object.locked &&
					enclosed(objectBounds(object), marquee.value)
				)
					for (const member of groupMembers(object)) ids.add(member.id);
			}
		}
		setSelection(ids);
	} else if (draftObjects.value && distance >= 2) {
		replaceObjects([...draftObjects.value.values()]);
	} else if (draft.value && distance >= 2) {
		if (ending.kind === "draw") addObject(draft.value);
		else replaceObject(draft.value);
	}
	draft.value = undefined;
	draftObjects.value = undefined;
	marquee.value = undefined;
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
const contextMenu = useUiContextMenuFocus();
const contextMenuHost = ref<HTMLElement>();
const contextItems = ref<UiMenuItem[]>([]);
let contextBoardId: string | undefined;
let contextObjectId: string | undefined;

function objectsAtPoint(page: SVGSVGElement, sheet: Artboard, event: MouseEvent) {
	const artwork = new Map(sheet.objects.map((object) => [object.id, object]));
	const hits: VectorObject[] = [];
	const point = new DOMPoint(event.clientX, event.clientY);
	const elements = [...page.querySelectorAll<SVGGElement>(":scope > [data-vector-id]")];
	for (let index = elements.length - 1; index >= 0 && hits.length < 12; index--) {
		const group = elements[index];
		const object = artwork.get(group.dataset.vectorId ?? "");
		if (!object || isObjectHidden(sheet, object)) continue;
		const graphic = group.firstElementChild;
		if (graphic instanceof SVGPathElement && object.kind === "path") {
			const transform = graphic.getScreenCTM();
			if (!transform) continue;
			const local = point.matrixTransform(transform.inverse());
			const fillHit = object.fill && object.fillAlpha > 0 && graphic.isPointInFill(local);
			const strokeHit =
				object.stroke &&
				object.strokeAlpha > 0 &&
				object.strokeWidth > 0 &&
				graphic.isPointInStroke(local);
			if (fillHit || strokeHit) hits.push(object);
		} else if (graphic && object.kind === "text" && object.fill && object.fillAlpha > 0) {
			const bounds = graphic.getBoundingClientRect();
			if (
				point.x >= bounds.left &&
				point.x <= bounds.right &&
				point.y >= bounds.top &&
				point.y <= bounds.bottom
			)
				hits.push(object);
		}
	}
	return hits;
}
function showContext(items: UiMenuItem[], focus: HTMLElement, x: number, y: number) {
	contextItems.value = items;
	contextMenu.rememberReturnFocus(focus);
	contextMenu.setActive(true);
	void nextTick(() => {
		contextMenuHost.value?.querySelector(".als-ofs-ui-context-menu__trigger")?.dispatchEvent(
			new MouseEvent("contextmenu", {
				bubbles: true,
				cancelable: true,
				button: 2,
				clientX: x,
				clientY: y,
			}),
		);
	});
}
function showCanvasContext(index: number, objects: VectorObject[], x: number, y: number) {
	if (!view.value) return;
	chooseBoard(index, false);
	contextBoardId = board.value?.id;
	contextObjectId = undefined;
	const items: UiMenuItem[] = objects.map((object) => ({
		id: `object:${object.id}`,
		label: object.name,
		icon: object.locked ? "lock" : object.kind === "text" ? "text" : "shape",
	}));
	if (!items.length) items.push({ id: "empty", label: "No visible object here", disabled: true });
	items.push(
		{ id: "fit", label: "Fit on Screen", separatorBefore: true },
		{ id: "actual", label: "100%" },
		{ id: "center", label: "Center Canvas" },
	);
	showContext(items, view.value, x, y);
}
function canvasContext(event: MouseEvent, index = currentIndex.value) {
	const sheet = project.value?.artboards[index];
	if (!sheet) return;
	const page = artboardPage(index);
	const objects = page?.contains(event.target as Node) ? objectsAtPoint(page, sheet, event) : [];
	showCanvasContext(index, objects, event.clientX, event.clientY);
}
function canvasContextKey(event: KeyboardEvent) {
	if (event.target !== view.value && event.target !== root.value) return;
	if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
	event.preventDefault();
	const frame = view.value?.getBoundingClientRect();
	if (frame)
		showCanvasContext(
			currentIndex.value,
			[...picked.value].reverse(),
			frame.left + frame.width / 2,
			frame.top + frame.height / 2,
		);
}
function layerContext(object: VectorObject, event: MouseEvent | KeyboardEvent) {
	if (
		event instanceof KeyboardEvent &&
		event.key !== "ContextMenu" &&
		!(event.shiftKey && event.key === "F10")
	)
		return;
	event.preventDefault();
	if (!selectedIds.value.has(object.id)) selectObject(object, false, true);
	contextBoardId = board.value?.id;
	contextObjectId = object.id;
	const focus = event.currentTarget as HTMLElement;
	const frame = focus.getBoundingClientRect();
	const items: UiMenuItem[] = [
		{
			id: "duplicate",
			label: "Duplicate",
			icon: "copy",
			disabled: props.readonly || !editable.value.length,
		},
		{
			id: "visibility",
			label: object.hidden ? "Show" : "Hide",
			icon: object.hidden ? "eye" : "eye-off",
			disabled: props.readonly,
		},
		{
			id: "lock",
			label: object.locked ? "Unlock" : "Lock",
			icon: object.locked ? "unlock" : "lock",
			disabled: props.readonly,
		},
		canUngroup.value
			? { id: "ungroup", label: "Ungroup", icon: "group", disabled: props.readonly }
			: { id: "group", label: "Group", icon: "group", disabled: !canGroup.value },
		{
			id: "delete",
			label: "Delete",
			icon: "trash",
			disabled: props.readonly || !editable.value.length,
			danger: true,
			separatorBefore: true,
		},
	];
	showContext(
		items,
		focus,
		event instanceof MouseEvent ? event.clientX : frame.left + 28,
		event instanceof MouseEvent ? event.clientY : frame.top + frame.height / 2,
	);
}
function selectContext(item: UiMenuItem) {
	if (contextBoardId !== board.value?.id) return;
	if (item.id.startsWith("object:")) {
		const object = board.value?.objects.find(({ id }) => id === item.id.slice(7));
		if (object && !isObjectHidden(board.value, object)) selectObject(object, false, true);
	} else if (item.id === "fit") fitBoard();
	else if (item.id === "actual") {
		zoom(1);
		centerBoard();
	} else if (item.id === "center") centerBoard();
	else {
		const object = board.value?.objects.find(({ id }) => id === contextObjectId);
		if (!object) return;
		if (item.id === "duplicate") duplicate();
		else if (item.id === "group") groupSelection();
		else if (item.id === "ungroup") ungroupSelection();
		else if (item.id === "delete") erase();
		else if (item.id === "visibility")
			replaceObject({ ...object, hidden: !object.hidden }, true);
		else if (item.id === "lock") replaceObject({ ...object, locked: !object.locked }, true);
	}
}

function keyboard(event: KeyboardEvent) {
	if (
		event.defaultPrevented ||
		(event.target instanceof Element &&
			event.target.closest("input, textarea, select, [contenteditable=true]"))
	)
		return;
	if (
		event.code === "Space" &&
		!event.ctrlKey &&
		!event.metaKey &&
		!event.altKey &&
		!contextMenu.active.value &&
		(event.target === root.value ||
			event.target === view.value ||
			view.value?.matches(":hover"))
	) {
		event.preventDefault();
		spacePan.value = true;
		penHover.value = undefined;
		return;
	}
	const key = event.key.toLowerCase();
	if (
		key === "enter" &&
		event.target instanceof Element &&
		event.target.closest(".vector-ribbon button")
	)
		return;
	if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
		canvasContextKey(event);
		return;
	}
	const modified = event.ctrlKey || event.metaKey;
	if (modified && key === "z") {
		event.preventDefault();
		if (event.shiftKey) redo();
		else undo();
	} else if (modified && key === "a") {
		event.preventDefault();
		selectAllObjects();
	} else if (modified && key === "g") {
		event.preventDefault();
		if (event.shiftKey) ungroupSelection();
		else groupSelection();
	} else if (modified && key === "d") {
		event.preventDefault();
		duplicate();
	} else if (!modified && !event.altKey && (key === "h" || key === "v")) {
		event.preventDefault();
		selectTool(key === "h" ? "hand" : "select");
	} else if (!modified && !event.altKey && !props.readonly) {
		const next = tools.find((item) => item.key.toLowerCase() === key);
		if (next) {
			event.preventDefault();
			selectTool(next.id);
		} else if (key === "escape") {
			cancelDrawing();
			setSelection();
		} else if (key === "enter" && tool.value === "pen" && pen.value.length) {
			event.preventDefault();
			finishPen();
		} else if (key === "delete" || key === "backspace") {
			event.preventDefault();
			erase();
		} else if (
			(event.target === root.value || event.target === view.value) &&
			editable.value.length &&
			key.startsWith("arrow")
		) {
			event.preventDefault();
			const step = event.shiftKey ? 10 : 1;
			const delta = {
				arrowup: [0, -step],
				arrowdown: [0, step],
				arrowleft: [-step, 0],
				arrowright: [step, 0],
			}[key];
			if (delta) transformSelection([1, 0, 0, 1, delta[0], delta[1]]);
		}
	}
}

const ready = Promise.withResolvers<void>();
void ready.promise.catch(() => {});
onMounted(async () => {
	window.addEventListener("keyup", releaseSpace);
	window.addEventListener("blur", resetNavigation);
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
			let fitted = false;
			sizeObserver = new ResizeObserver(() => {
				const width = canvas.clientWidth;
				const height = canvas.clientHeight;
				if (!width || !height) {
					resetNavigation();
					return;
				}
				viewportSize.value = { width, height };
				if (!fitted && width > 72 && height > 72) {
					fitted = true;
					fitBoard();
				}
			});
			sizeObserver.observe(canvas);
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
	sizeObserver?.disconnect();
	window.removeEventListener("keyup", releaseSpace);
	window.removeEventListener("blur", resetNavigation);
	resetNavigation();
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
async function output(format: string, saveAs = false) {
	if (format !== "ai" && format !== "svg" && format !== "png" && format !== "pdf") return;
	if (working.value) return;
	working.value = true;
	issue.value = "";
	try {
		const title = documentName.value.replace(/\.[^.]+$/, "") || "Artwork";
		if (format === "ai") {
			await saveFile({
				deliver: async (blob) => {
					await deliverUiEditorFile({
						intent: saveAs ? "save-as" : "save",
						fileName: `${title}.ai`,
						blob,
					});
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
function selectableObjects() {
	return (
		board.value?.objects.filter(
			(object) => !object.locked && !isObjectHidden(board.value, object),
		) ?? []
	);
}

async function openFromRibbon(files: File[]) {
	const file = files[0];
	if (!file) return;
	try {
		await deliverUiEditorFile({ intent: "open", fileName: file.name, blob: file });
	} catch (cause) {
		issue.value = cause instanceof Error ? cause.message : String(cause);
	}
}

const illustratorMenuState = computed<IllustratorMenuState | null>(() => {
	if (!board.value) return null;
	const canEdit = !props.readonly && !working.value;
	const selected = new Set(editable.value.map((object) => object.id));
	const objects = board.value.objects;
	const canArrange = (step: 1 | -1) =>
		canEdit &&
		objects.some((object, index) => {
			const neighbor = objects[index + step];
			return (
				selected.has(object.id) &&
				neighbor &&
				!neighbor.locked &&
				!selected.has(neighbor.id)
			);
		});
	const forward = canArrange(1),
		backward = canArrange(-1);
	const selectable = selectableObjects();
	return {
		enabled: {
			group: canEdit && canGroup.value,
			ungroup: canEdit && canUngroup.value,
			bringToFront: forward,
			bringForward: forward,
			sendBackward: backward,
			sendToBack: backward,
			selectAll: selectable.some((object) => !selectedIds.value.has(object.id)),
			deselect: selectedIds.value.size > 0,
			inverse: selectable.length > 0,
			zoomIn: scale.value < 4,
			zoomOut: scale.value > 0.05,
			actualSize: scale.value !== 1,
			fitArtboard: true,
			layers: true,
			properties: true,
			artboards: true,
		},
		checked: {
			layers: showStructure.value && panel.value === "layers",
			properties: showProperties.value,
			artboards: showStructure.value && panel.value === "artboards",
		},
	};
});

function getIllustratorMenuState(): IllustratorMenuState | null {
	return illustratorMenuState.value;
}

function toggleStructure(next: "layers" | "artboards") {
	showStructure.value = !showStructure.value || panel.value !== next;
	panel.value = next;
}

function selectAllObjects() {
	setSelection(selectableObjects().map((object) => object.id));
}

const illustratorActions: Record<IllustratorCommand, () => void> = {
	group: groupSelection,
	ungroup: ungroupSelection,
	bringToFront: () => reorder(1, true),
	bringForward: () => reorder(1),
	sendBackward: () => reorder(-1),
	sendToBack: () => reorder(-1, true),
	selectAll: selectAllObjects,
	deselect: () => {
		cancelDrawing();
		setSelection();
	},
	inverse: () =>
		setSelection(
			selectableObjects()
				.filter((object) => !selectedIds.value.has(object.id))
				.map((object) => object.id),
		),
	zoomIn: () => zoom(scale.value * 1.2),
	zoomOut: () => zoom(scale.value / 1.2),
	actualSize: () => {
		zoom(1);
		centerBoard();
	},
	fitArtboard: fitBoard,
	layers: () => toggleStructure("layers"),
	properties: () => {
		showProperties.value = !showProperties.value;
	},
	artboards: () => toggleStructure("artboards"),
};

function runIllustratorCommand(command: IllustratorCommand) {
	if (getIllustratorMenuState()?.enabled[command]) illustratorActions[command]();
}

function executeCommands(
	commands: readonly unknown[],
	options: { baseRevision?: number | string } = {},
) {
	const current = project.value;
	if (!current) throw new Error("The Illustrator document is still loading.");
	if (options.baseRevision !== undefined && options.baseRevision !== revision.value)
		throw new Error("The Illustrator document changed. Read the current revision and retry.");

	const result = applyIllustratorActions(current, commands, Boolean(props.readonly));
	const wrote = result.project !== current;
	if (wrote) commit(result.project);
	return { revision: revision.value, wrote, noop: !wrote, values: result.values };
}

defineExpose({
	getCommandManifest: () => illustratorActionManifest(Boolean(props.readonly)),
	executeCommands,
	getIllustratorMenuState,
	getHistoryState: () => ({
		canUndo: undoStack.value.length > 0,
		canRedo: redoStack.value.length > 0,
	}),
	runIllustratorCommand,
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
		class="vector-editor als-ofs-editor-ui als-ofs-ui-editor-shell"
		:data-editor-palette="editorPalette"
		data-editor-ribbon-mode="desktop"
		:data-appearance="graphicsAppearance"
		tabindex="-1"
		@keydown="keyboard"
	>
		<div v-if="!project" class="vector-editor__loading" role="status">
			{{ issue || "Opening Illustrator artboards…" }}
		</div>
		<template v-else>
			<IllustratorRibbon :state="illustratorMenuState" @command="runIllustratorCommand">
				<template #home="{ language }">
					<UiRibbonGroup :label="language ? '文件' : 'File'">
						<UiEditorFileSection
							accept=".ai,application/illustrator"
							:readonly="readonly"
							:loading="working"
							:dirty="isDirty()"
							:exports="[
								{
									id: 'svg',
									label: language ? '当前画板 · SVG' : 'Current artboard · SVG',
								},
								{
									id: 'png',
									label: language ? '当前画板 · PNG' : 'Current artboard · PNG',
								},
								{
									id: 'pdf',
									label: language ? '所有画板 · PDF' : 'All artboards · PDF',
								},
							]"
							@open="openFromRibbon"
							@save="output('ai')"
							@save-as="output('ai', true)"
							@export="output"
						/>
					</UiRibbonGroup>
				</template>
				<template #object="{ language }">
					<UiRibbonGroup :label="language ? '编辑' : 'Edit'">
						<UiRibbonCommandButton
							icon="duplicate"
							:label="language ? '复制对象' : 'Duplicate'"
							:disabled="readonly || working || !editable.length"
							@activate="duplicate"
						/>
						<UiRibbonCommandButton
							icon="rotate-right"
							:label="language ? '旋转 15°' : 'Rotate 15°'"
							:disabled="readonly || working || !editable.length"
							@activate="rotate(15)"
						/>
					</UiRibbonGroup>
				</template>
				<template #context="{ language }">
					<UiRibbonGroup v-if="tool === 'pen'" :label="language ? '路径' : 'Path'">
						<UiRibbonCommandButton
							icon="check"
							:label="language ? '结束路径' : 'Finish path'"
							:disabled="readonly || pen.length < 2"
							@activate="finishPen()"
						/>
						<UiRibbonCommandButton
							icon="shape"
							:label="language ? '闭合路径' : 'Close path'"
							:disabled="readonly || pen.length < 3"
							@activate="finishPen(true)"
						/>
					</UiRibbonGroup>
				</template>
			</IllustratorRibbon>
			<div v-if="issue" class="vector-error" role="alert">
				<span>{{ issue }}</span
				><button type="button" @click="issue = ''">Close</button>
			</div>
			<div class="vector-workspace" :data-inspector="showProperties || showStructure">
				<div ref="contextMenuHost" class="vector-context-host">
					<UiContextMenu
						:active="contextMenu.active.value"
						aria-label="Illustrator context menu"
						:restore-focus="false"
						:items="contextItems"
						@select="selectContext"
						@update:active="contextMenu.setActive"
					/>
				</div>
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
						:disabled="readonly && entry.id !== 'hand' && entry.id !== 'select'"
						@click="selectTool(entry.id)"
					>
						<svg
							v-if="entry.id === 'hand'"
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path
								d="M8 13V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-2a5 5 0 0 1-4-2l-4-5a1.6 1.6 0 0 1 2.4-2.1L8 13Z"
							/>
						</svg>
						<UiIcon v-else-if="entry.id !== 'pen'" :name="entry.icon" :size="18" />
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
				<main
					ref="view"
					class="vector-pasteboard"
					tabindex="0"
					aria-label="Artboard canvas"
					aria-keyshortcuts="Space Shift+F10"
					:data-hand="handActive"
					:data-panning="panning"
					:style="{
						'--vector-pan-x': `${Math.max(36, viewportSize.width - 40)}px`,
						'--vector-pan-y': `${Math.max(44, viewportSize.height - 40)}px`,
					}"
					@wheel="wheelZoom"
					@gesturestart="handlePinch"
					@gesturechange="handlePinch"
					@gestureend="handlePinch"
					@pointerdown.capture="startPan"
					@pointermove="movePan"
					@pointerup="stopPan"
					@pointercancel="stopPan"
					@lostpointercapture="stopPan"
					@contextmenu.prevent="canvasContext($event)"
				>
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
								@contextmenu.stop.prevent="canvasContext($event, index)"
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
									v-for="object in sheet.objects.filter(
										(item) => !isObjectHidden(sheet, item),
									)"
									:key="object.id"
									:object="displayObject(object)"
								/>
								<template v-if="index === currentIndex">
									<IllustratorArtwork
										v-if="draft && !picked.length"
										:object="draft"
									/>
									<rect
										v-if="marquee"
										class="vector-marquee"
										:x="marquee.x"
										:y="marquee.y"
										:width="marquee.width"
										:height="marquee.height"
										vector-effect="non-scaling-stroke"
										pointer-events="none"
									/>
									<g
										v-if="editBounds && tool !== 'anchor'"
										class="vector-selection"
									>
										<rect
											fill="none"
											:x="editBounds.x"
											:y="editBounds.y"
											:width="editBounds.width"
											:height="editBounds.height"
											vector-effect="non-scaling-stroke"
											pointer-events="none"
										/>
										<rect
											v-if="
												tool === 'select' &&
												!readonly &&
												editBounds.width > 0.01 &&
												editBounds.height > 0.01
											"
											class="vector-handle vector-resize"
											data-resize
											:x="editBounds.x + editBounds.width - 4 / scale"
											:y="editBounds.y + editBounds.height - 4 / scale"
											:width="8 / scale"
											:height="8 / scale"
											vector-effect="non-scaling-stroke"
										/>
									</g>
									<g v-if="nodes.length" class="vector-selection">
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
				<aside
					v-if="board && (showProperties || showStructure)"
					class="vector-inspector"
					aria-label="Artwork panels"
				>
					<section
						v-if="showProperties"
						class="vector-properties"
						:class="{ 'vector-properties--full': !showStructure }"
					>
						<h2>
							Properties
							<span>{{
								picked.length > 1
									? `${picked.length} objects`
									: selected?.kind === "text"
										? "Text"
										: selected
											? "Path"
											: "Artboard"
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
							<fieldset :disabled="selected.locked || selected.hidden || readonly">
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
						<div
							v-else-if="editBounds && picked.length > 1"
							class="vector-properties__body"
						>
							<fieldset :disabled="readonly">
								<legend>Transform selection</legend>
								<div class="vector-property-grid">
									<label
										v-for="key in ['x', 'y', 'width', 'height'] as const"
										:key="key"
									>
										{{ { x: "X", y: "Y", width: "W", height: "H" }[key] }}
										<input
											type="number"
											:aria-label="`Selection ${key}`"
											:value="Number(editBounds[key].toFixed(2))"
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
						<div v-if="editable.length" class="vector-properties__body vector-arrange">
							<fieldset :disabled="readonly">
								<legend>Align and distribute</legend>
								<label class="vector-property-line"
									>Align to
									<select v-model="alignTo" aria-label="Align to">
										<option value="selection">Selection</option>
										<option value="artboard">Artboard</option>
									</select>
								</label>
								<div class="vector-arrange__buttons">
									<button
										type="button"
										v-for="[command, label, icon] in alignmentCommands"
										:key="command"
										:aria-label="label"
										:title="label"
										:disabled="alignTo === 'selection' && units.length < 2"
										@click="align(command)"
									>
										<UiIcon :name="icon" />
									</button>
									<button
										type="button"
										aria-label="Distribute horizontal gaps"
										title="Distribute horizontal gaps"
										:disabled="units.length < 3"
										@click="distribute('x')"
									>
										<UiIcon name="distribute-horizontal" />
									</button>
									<button
										type="button"
										aria-label="Distribute vertical gaps"
										title="Distribute vertical gaps"
										:disabled="units.length < 3"
										@click="distribute('y')"
									>
										<UiIcon name="distribute-vertical" />
									</button>
								</div>
							</fieldset>
						</div>
					</section>
					<section v-if="showStructure" class="vector-structure">
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
							<template v-for="row in layerRows" :key="row.id">
								<div
									v-if="row.kind === 'group'"
									class="vector-layer vector-layer--group"
								>
									<button
										type="button"
										:disabled="readonly"
										:aria-label="`${row.hidden ? 'Show group' : 'Hide group'} ${row.name}`"
										@click="toggleGroupVisibility(row.id)"
									>
										<UiIcon :name="row.hidden ? 'eye-off' : 'eye'" :size="15" />
									</button>
									<button
										type="button"
										class="vector-layer__name"
										:title="row.name"
										@click="selectGroup(row.id)"
									>
										<UiIcon name="group" :size="15" />
										<span>{{ row.name }}</span>
									</button>
									<button
										type="button"
										:aria-expanded="!collapsedGroups.has(row.id)"
										:aria-label="`${collapsedGroups.has(row.id) ? 'Expand' : 'Collapse'} ${row.name}`"
										@click="toggleGroupExpansion(row.id)"
									>
										<UiIcon
											:name="
												collapsedGroups.has(row.id)
													? 'chevron-right'
													: 'chevron-down'
											"
											:size="15"
										/>
									</button>
								</div>
								<div
									v-else
									class="vector-layer"
									:data-selected="selectedIds.has(row.object.id)"
									:data-group="row.object.groupId"
								>
									<button
										type="button"
										:disabled="readonly"
										:aria-label="`${row.object.hidden ? 'Show' : 'Hide'} ${row.object.name}`"
										@click="
											replaceObject(
												{ ...row.object, hidden: !row.object.hidden },
												true,
											)
										"
									>
										<UiIcon
											:name="row.object.hidden ? 'eye-off' : 'eye'"
											:size="15"
										/>
									</button>
									<button
										type="button"
										class="vector-layer__name"
										:title="row.object.name"
										:aria-pressed="selectedIds.has(row.object.id)"
										@click="selectObject(row.object, $event.shiftKey, true)"
										@contextmenu.prevent="layerContext(row.object, $event)"
										@keydown="layerContext(row.object, $event)"
									>
										<UiIcon
											:name="row.object.kind === 'text' ? 'text' : 'shape'"
											:size="15"
										/>
										<span>{{ row.object.name }}</span>
									</button>
									<button
										type="button"
										:disabled="readonly"
										:aria-label="`${row.object.locked ? 'Unlock' : 'Lock'} ${row.object.name}`"
										@click="
											replaceObject(
												{ ...row.object, locked: !row.object.locked },
												true,
											)
										"
									>
										<UiIcon
											:name="row.object.locked ? 'lock' : 'unlock'"
											:size="15"
										/>
									</button>
								</div>
							</template>
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
								:disabled="!editable.length || readonly"
								@click="reorder(1)"
							>
								<UiIcon name="arrow-up" />
							</button>
							<button
								type="button"
								aria-label="Send backward"
								title="Send backward"
								:disabled="!editable.length || readonly"
								@click="reorder(-1)"
							>
								<UiIcon name="arrow-down" />
							</button>
							<button
								type="button"
								:aria-label="
									editable.length > 1
										? 'Delete selected objects'
										: 'Delete object'
								"
								title="Delete object"
								:disabled="!editable.length || readonly"
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
