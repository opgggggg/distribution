<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
	UiContextMenu,
	UiIcon,
	UiIconButton,
	UiInput,
	UiSelect,
	UiSlider,
	useUiContextMenuFocus,
	type UiMenuItem,
} from "@yaochn/als-office-editor-ui/vue";
import {
	isPsdBlendMode,
	type PsdEditorAction,
	type PsdLayerNode,
	type PsdMaskOperation,
} from "@cubexp/psd";
import {
	PSD_PROJECT_ID,
	PROJECT_LAYER_MIME,
	layerImportAction,
	dropProjectLayer,
} from "./psd-project-drag";
import { usePsdEditorContext } from "./psd-editor-context";
import { PSD_BLEND_MODE_OPTIONS, type PsdLayerRow } from "./use-psd-editor";

import PsdRepairFillDialog from "./PsdRepairFillDialog.vue";
import PsdAdjustmentDialog from "./PsdAdjustmentDialog.vue";
import type { PsdLiveAdjustmentKind } from "@cubexp/psd";
import PsdCurvesDialog from "./PsdCurvesDialog.vue";
const editor = usePsdEditorContext();
const adjustmentOpen = ref(false),
	adjustmentKind = ref<PsdLiveAdjustmentKind>("levels"),
	adjustmentLayerId = ref<string | undefined>();
function openAdjustment(edit = false) {
	const l = active.value;
	adjustmentLayerId.value = edit ? l?.id : undefined;
	if (edit && l && l.kind !== "group" && l.adjustment) adjustmentKind.value = l.adjustment.kind;
	adjustmentOpen.value = true;
}
const repairFillOpen = ref(false);
const curvesOpen = ref(false),
	curvesLayerId = ref<string | undefined>();
function openCurves(existing = false) {
	curvesLayerId.value = existing ? active.value?.id : undefined;
	curvesOpen.value = true;
}
watch(editor.panelCommand, (command) => {
	if (command === "curves") openCurves(Boolean(active.value && active.value.kind !== "group" && active.value.curves));
	if (command === "repair" && editor.selection.value) repairFillOpen.value = true;
	editor.panelCommand.value = null;
});
const featherRadius = ref(3),
	maskDx = ref(0),
	maskDy = ref(0),
	maskScale = ref(100),
	maskAngle = ref(0);
function maskEdit(operation: "fill" | "feather" | "transform", value?: number) {
	const layer = active.value;
	if (!layer?.mask || maskLocked.value) return;
	let action: PsdEditorAction;
	if (operation === "fill") action = { type: "mask.edit", layerId: layer.id, operation, value };
	else if (operation === "feather")
		action = {
			type: "mask.edit",
			layerId: layer.id,
			operation,
			radius: Number(featherRadius.value),
		};
	else {
		const m = layer.mask,
			s = Number(maskScale.value) / 100,
			a = (Number(maskAngle.value) * Math.PI) / 180,
			c = Math.cos(a) * s,
			n = Math.sin(a) * s,
			x = (m.left + m.right) / 2,
			y = (m.top + m.bottom) / 2;
		action = {
			type: "mask.edit",
			layerId: layer.id,
			operation,
			matrix: [
				c,
				n,
				-n,
				c,
				x - c * x + n * y + Number(maskDx.value),
				y - n * x - c * y + Number(maskDy.value),
			],
		};
	}
	editor.apply([action], `Mask ${operation}`);
}
function paintMask(value: "hide" | "reveal") {
	if (!active.value?.mask) return;
	editor.editTarget.value = "mask";
	editor.maskPaint.value = value;
	editor.tool.value = "brush";
}

// Group disclosure is panel-only workspace state. Keep it on a local revision so
// expanding a large folder does not invalidate the document composite, stage,
// properties, history, and every existing thumbnail.
const groupDisclosureRevision = ref(0);
const rows = computed<PsdLayerRow[]>(() => {
	void groupDisclosureRevision.value;
	void editor.revision.value;
	const document = editor.document.value;
	if (!document) return [];
	const next: PsdLayerRow[] = [];
	const visit = (layers: readonly PsdLayerNode[], parentId: string | null, depth: number) => {
		for (let index = layers.length - 1; index >= 0; index--) {
			const layer = layers[index];
			next.push({ layer, parentId, depth });
			if (layer.kind === "group" && layer.open) visit(layer.children, layer.id, depth + 1);
		}
	};
	visit(document.layers, null, 0);
	return next;
});
const active = computed(() => editor.activeLayer.value);
const maskControlsOpen = ref(false);
const maskLocked = computed(
	() =>
		!active.value ||
		editor.readonly.value ||
		active.value.locks.all ||
		active.value.locks.composite,
);
function editMask(operation: PsdMaskOperation): void {
	if (!active.value || maskLocked.value) return;
	editor.apply(
		[{ type: "layer.mask", layerId: active.value.id, operation }],
		`Layer mask: ${operation}`,
	);
}
const maskThumbnailCache = new WeakMap<object, string>();
function maskThumbnail(layer: PsdLayerNode): string | undefined {
	const mask = layer.mask;
	if (!mask) return undefined;
	const cached = maskThumbnailCache.get(mask);
	if (cached) return cached;
	const width = mask.right - mask.left;
	const height = mask.bottom - mask.top;
	if (width <= 0 || height <= 0) return undefined;
	const canvas = document.createElement("canvas");
	canvas.width = 28;
	canvas.height = 24;
	const context = canvas.getContext("2d");
	if (!context) return undefined;
	const image = context.createImageData(28, 24);
	for (let y = 0; y < 24; y++)
		for (let x = 0; x < 28; x++) {
			const value =
				mask.data[Math.floor((y * height) / 24) * width + Math.floor((x * width) / 28)];
			const offset = (y * 28 + x) * 4;
			image.data.set([value, value, value, 255], offset);
		}
	context.putImageData(image, 0, 0);
	const url = canvas.toDataURL();
	maskThumbnailCache.set(mask, url);
	return url;
}
function openMaskControls(layer: PsdLayerNode): void {
	editor.selectLayer(layer.id);
	maskControlsOpen.value = true;
	editor.editTarget.value = "mask";
	editor.tool.value = "brush";
	editor.toolOptionsOpen.value = true;
}

const contextMenu = useUiContextMenuFocus();
const contextMenuHost = ref<HTMLElement | null>(null);
const contextLayer = ref<PsdLayerNode | null>(null);
let contextMenuReturnFocus: HTMLElement | null = null;
let contextMenuReturnLayerId: string | null = null;
let contextMenuFocusTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

const blendOptions = PSD_BLEND_MODE_OPTIONS.map((option) => ({
	value: option.value,
	label: option.label,
}));

const opacityPercent = ref(100);

watch(
	() => [active.value?.id, editor.revision.value] as const,
	() => {
		if (editor.layerVisualPreview.value?.layerId === active.value?.id) return;
		opacityPercent.value = Math.round((active.value?.opacity ?? 1) * 100);
	},
	{ immediate: true },
);

function previewOpacity(value: number): void {
	const layer = active.value;
	if (!layer) return;
	const percent = Math.min(100, Math.max(0, value));
	opacityPercent.value = percent;
	const document = editor.document.value;
	if (!document) return;
	editor.layerVisualPreview.value = {
		layerId: layer.id,
		x: layer.kind === "group" ? 0 : layer.left,
		y: layer.kind === "group" ? 0 : layer.top,
		width: layer.kind === "group" ? document.width : layer.bitmap.width,
		height: layer.kind === "group" ? document.height : layer.bitmap.height,
		opacity: percent / 100,
	};
}

function commitOpacity(value = opacityPercent.value): void {
	const layer = active.value;
	if (!layer) return;
	const opacity = Math.min(100, Math.max(0, value)) / 100;
	let committed = false;
	if (opacity !== layer.opacity) {
		editor.apply(
			[
				{
					type: "layer.setOpacity",
					layerId: layer.id,
					opacity,
				} as PsdEditorAction,
			],
			"Opacity",
		);
		committed = true;
	}
	const preview = editor.layerVisualPreview.value;
	if (committed && preview?.layerId === layer.id) {
		editor.layerVisualPreview.value = { ...preview, opacity, committed: true };
	} else {
		editor.layerVisualPreview.value = null;
	}
}

function cancelOpacityPreview(): void {
	editor.layerVisualPreview.value = null;
	opacityPercent.value = Math.round((active.value?.opacity ?? 1) * 100);
}

const blendMode = computed({
	get: () => active.value?.blendMode ?? "normal",
	set(value: string) {
		if (!active.value || !isPsdBlendMode(value)) return;
		editor.apply(
			[{ type: "layer.setBlendMode", layerId: active.value.id, blendMode: value }],
			"Blend Mode",
		);
	},
});

// --- thumbnails ---

const THUMB_WIDTH = 36;
const THUMB_HEIGHT = 28;
const THUMB_PADDING = 2;
const thumbnailCache = new WeakMap<object, string>();

function thumbnailUrl(layer: PsdLayerNode): string | null {
	if (layer.kind === "group" || typeof document === "undefined") return null;
	const { bitmap } = layer;
	if (!bitmap.width || !bitmap.height) return null;
	const cached = thumbnailCache.get(bitmap);
	if (cached) return cached;
	const canvas = document.createElement("canvas");
	canvas.width = THUMB_WIDTH;
	canvas.height = THUMB_HEIGHT;
	const context = canvas.getContext("2d");
	if (!context) return null;
	const scale = Math.min(
		(THUMB_WIDTH - THUMB_PADDING * 2) / bitmap.width,
		(THUMB_HEIGHT - THUMB_PADDING * 2) / bitmap.height,
	);
	const width = Math.max(1, Math.round(bitmap.width * scale));
	const height = Math.max(1, Math.round(bitmap.height * scale));
	const x = Math.round((THUMB_WIDTH - width) / 2);
	const y = Math.round((THUMB_HEIGHT - height) / 2);
	const pixels = context.createImageData(width,height);
	// A bounded thumbnail sampler avoids allocating a full-size canvas per layer.
	for(let ty=0;ty<height;ty++)for(let tx=0;tx<width;tx++){
		let alpha=0,red=0,green=0,blue=0;
		for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){
			const px=Math.min(bitmap.width-1,Math.floor((tx+(sx+.5)/4)*bitmap.width/width));
			const py=Math.min(bitmap.height-1,Math.floor((ty+(sy+.5)/4)*bitmap.height/height));
			const at=(py*bitmap.width+px)*4,a=bitmap.data[at+3];
			alpha+=a;red+=bitmap.data[at]*a;green+=bitmap.data[at+1]*a;blue+=bitmap.data[at+2]*a;
		}
		const at=(ty*width+tx)*4;if(alpha){pixels.data[at]=red/alpha;pixels.data[at+1]=green/alpha;pixels.data[at+2]=blue/alpha;}pixels.data[at+3]=alpha/16;
	}
	context.putImageData(pixels,x,y);
	const url = canvas.toDataURL();
	thumbnailCache.set(bitmap, url);
	return url;
}

const thumbnails = ref(new Map<string, string>());
function rebuildThumbnails(): void {
	const next = new Map<string, string>();
	for (const row of rows.value) {
		const url = thumbnailUrl(row.layer);
		if (url) next.set(row.layer.id, url);
	}
	thumbnails.value = next;
}

function ensureVisibleThumbnails(): void {
	let next: Map<string, string> | null = null;
	for (const row of rows.value) {
		if (thumbnails.value.has(row.layer.id)) continue;
		const url = thumbnailUrl(row.layer);
		if (!url) continue;
		next ??= new Map(thumbnails.value);
		next.set(row.layer.id, url);
	}
	if (next) thumbnails.value = next;
}

watch(() => [editor.revision.value, editor.document.value] as const, rebuildThumbnails, {
	immediate: true,
});
watch(groupDisclosureRevision, ensureVisibleThumbnails, { flush: "post" });

// --- rename ---

const renamingId = ref<string | null>(null);
const renameDraft = ref("");
const listElement = ref<HTMLElement | null>(null);
const selectionAnchorId = ref<string | null>(null);

watch(
	() => editor.selectedLayerIds.value,
	(ids) => {
		if (ids.length === 1) selectionAnchorId.value = ids[0];
	},
	{ immediate: true },
);

function focusRenameInput(): void {
	listElement.value?.querySelector<HTMLInputElement>(".als-ofs-psd-layers__rename")?.focus();
}

async function startRename(layer: PsdLayerNode): Promise<void> {
	if (editor.readonly.value) return;
	renamingId.value = layer.id;
	renameDraft.value = layer.name;
	await nextTick();
	focusRenameInput();
}

function commitRename(): void {
	const id = renamingId.value;
	renamingId.value = null;
	const name = renameDraft.value.trim();
	if (!id || !name) return;
	editor.apply([{ type: "layer.rename", layerId: id, name } as PsdEditorAction], "Rename");
}

// --- row actions ---

function toggleVisible(layer: PsdLayerNode): void {
	editor.apply(
		[
			{
				type: "layer.setVisible",
				layerId: layer.id,
				visible: !layer.visible,
			} as PsdEditorAction,
		],
		layer.visible ? "Hide Layer" : "Show Layer",
	);
}

function toggleLocked(layer: PsdLayerNode): void {
	editor.apply(
		[
			{
				type: "layer.setLocked",
				layerId: layer.id,
				locked: !(layer.locks.all || layer.locks.composite),
			} as PsdEditorAction,
		],
		"Lock",
	);
}

function setGroupOpen(layer: PsdLayerNode, open: boolean, event?: KeyboardEvent): void {
	if (layer.kind !== "group") return;
	event?.preventDefault();
	if (layer.open === open) return;
	layer.open = open;
	groupDisclosureRevision.value += 1;
}

function toggleGroupOpen(layer: PsdLayerNode): void {
	if (layer.kind === "group") setGroupOpen(layer, !layer.open);
}

function selectRow(
	layer: PsdLayerNode,
	event: Pick<MouseEvent, "shiftKey" | "metaKey" | "ctrlKey">,
): void {
	const additive = event.metaKey || event.ctrlKey;
	if (!event.shiftKey) {
		editor.selectLayer(layer.id, additive);
		selectionAnchorId.value = layer.id;
		return;
	}

	const anchorId = selectionAnchorId.value ?? editor.selectedLayerIds.value[0] ?? layer.id;
	const anchorIndex = rows.value.findIndex((row) => row.layer.id === anchorId);
	const targetIndex = rows.value.findIndex((row) => row.layer.id === layer.id);
	if (anchorIndex < 0 || targetIndex < 0) {
		editor.selectLayer(layer.id, additive);
		return;
	}
	const start = Math.min(anchorIndex, targetIndex);
	const end = Math.max(anchorIndex, targetIndex);
	const rangeIds = rows.value.slice(start, end + 1).map((row) => row.layer.id);
	const selected = additive
		? new Set([...editor.selectedLayerIds.value, ...rangeIds])
		: new Set(rangeIds);
	editor.selectedLayerIds.value = [layer.id, ...[...selected].filter((id) => id !== layer.id)];
}

async function moveRowFocus(layer: PsdLayerNode, direction: -1 | 1): Promise<void> {
	const index = rows.value.findIndex((row) => row.layer.id === layer.id);
	const next = rows.value[index + direction];
	if (!next) return;
	editor.selectLayer(next.layer.id);
	await nextTick();
	listElement.value
		?.querySelector<HTMLElement>(`[data-layer-id="${CSS.escape(next.layer.id)}"]`)
		?.focus();
}

function reorder(direction: 1 | -1): void {
	const layer = active.value;
	if (!layer) return;
	const row = rows.value.find((candidate) => candidate.layer.id === layer.id);
	if (!row) return;
	// Rows list is top-first; layer.reorder indexes are bottom-first.
	const document = editor.document.value;
	if (!document) return;
	const siblings = row.parentId
		? (
				rows.value.find((candidate) => candidate.layer.id === row.parentId)?.layer as
					| { children?: PsdLayerNode[] }
					| undefined
			)?.children
		: document.layers;
	if (!siblings) return;
	const index = siblings.findIndex((candidate) => candidate.id === layer.id);
	const target = index + direction;
	if (target < 0 || target >= siblings.length) return;
	editor.apply(
		[
			{
				type: "layer.reorder",
				layerId: layer.id,
				parentId: row.parentId,
				index: target,
			} as PsdEditorAction,
		],
		"Reorder",
	);
}

function addLayer(): void {
	const result = editor.apply(
		[{ type: "layer.add", name: "Layer" } as PsdEditorAction],
		"New Layer",
	);
	if (result?.createdIds[0]) editor.selectLayer(result.createdIds[0]);
}

function duplicateLayer(): void {
	if (!active.value) return;
	editor.apply(
		[{ type: "layer.duplicate", layerId: active.value.id } as PsdEditorAction],
		"Duplicate",
	);
}

function deleteSelected(): void {
	if (!editor.selectedLayerIds.value.length) return;
	editor.apply(
		[{ type: "layer.delete", layerIds: [...editor.selectedLayerIds.value] } as PsdEditorAction],
		"Delete Layer",
	);
}

function groupSelected(): void {
	if (!editor.selectedLayerIds.value.length) return;
	editor.apply(
		[{ type: "layer.group", layerIds: [...editor.selectedLayerIds.value] } as PsdEditorAction],
		"Group",
	);
}

function ungroupLayer(layer: PsdLayerNode): void {
	if (layer.kind !== "group") return;
	editor.apply(
		[{ type: "layer.ungroup", groupId: layer.id } as PsdEditorAction],
		"Ungroup Layers",
	);
}

function mergeSelected(): void {
	if (editor.selectedLayerIds.value.length < 2) return;
	editor.apply(
		[
			{
				type: "layer.merge",
				layerIds: [...editor.selectedLayerIds.value],
			} as PsdEditorAction,
		],
		"Merge Layers",
	);
}

const selectedRows = computed(() =>
	rows.value.filter((row) => editor.selectedLayerIds.value.includes(row.layer.id)),
);

const selectedShareParent = computed(() => {
	const candidates = selectedRows.value;
	return (
		candidates.length > 0 && candidates.every((row) => row.parentId === candidates[0].parentId)
	);
});

const contextMenuItems = computed<UiMenuItem[]>(() => {
	const layer = contextLayer.value;
	if (!layer) return [];
	const disabled = editor.readonly.value;
	const locked = layer.locks.all || layer.locks.composite;
	const items: UiMenuItem[] = [];
	if (layer.kind === "group") {
		items.push({
			id: "toggle-group",
			label: layer.open ? "Collapse Group" : "Expand Group",
			icon: layer.open ? "chevron-down" : "chevron-right",
		});
	}
	items.push(
		{
			id: "duplicate",
			label: "Duplicate Layer…",
			icon: "duplicate",
			disabled,
			separatorBefore: items.length > 0,
		},
		{
			id: "visibility",
			label: layer.visible ? "Hide This Layer" : "Show This Layer",
			icon: layer.visible ? "eye-off" : "eye",
			disabled,
			separatorBefore: true,
		},
		{
			id: "lock",
			label: locked ? "Unlock Layer" : "Lock Layer",
			icon: locked ? "unlock" : "lock",
			disabled,
		},
		layer.kind === "group"
			? {
					id: "ungroup",
					label: "Ungroup Layers",
					icon: "group",
					disabled,
					separatorBefore: true,
				}
			: {
					id: "group",
					label: "Group from Layers",
					icon: "group",
					disabled: disabled || !selectedShareParent.value,
					separatorBefore: true,
				},
		{
			id: "merge",
			label: "Merge Layers",
			disabled:
				disabled || editor.selectedLayerIds.value.length < 2 || !selectedShareParent.value,
		},
		{
			id: "delete",
			label: editor.selectedLayerIds.value.length > 1 ? "Delete Layers" : "Delete Layer",
			icon: "trash",
			disabled,
			danger: true,
			separatorBefore: true,
		},
	);
	return items;
});

function setContextMenuActive(active: boolean): void {
	contextMenu.setActive(active);
	document.body.classList.toggle("als-ofs-psd-context-menu-open", active);
	if (!active) {
		const returnFocus = contextMenuReturnFocus;
		const returnLayerId = contextMenuReturnLayerId;
		contextMenuReturnFocus = null;
		contextMenuReturnLayerId = null;
		if (returnFocus || returnLayerId) {
			if (contextMenuFocusTimer) globalThis.clearTimeout(contextMenuFocusTimer);
			contextMenuFocusTimer = globalThis.setTimeout(() => {
				const target = returnLayerId
					? listElement.value?.querySelector<HTMLElement>(
							`[data-layer-id="${CSS.escape(returnLayerId)}"]`,
						)
					: returnFocus;
				if (target?.isConnected) target.focus({ preventScroll: true });
				contextMenuFocusTimer = null;
			}, 50);
		}
	}
}

async function showLayerContextMenu(
	layer: PsdLayerNode,
	returnFocus: HTMLElement,
	clientX: number,
	clientY: number,
): Promise<void> {
	if (!editor.selectedLayerIds.value.includes(layer.id)) editor.selectLayer(layer.id);
	contextLayer.value = layer;
	contextMenuReturnFocus = returnFocus;
	contextMenuReturnLayerId = layer.id;
	contextMenu.rememberReturnFocus(contextMenuReturnFocus);
	setContextMenuActive(true);
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

function openLayerContextMenu(layer: PsdLayerNode, event: MouseEvent): void {
	event.preventDefault();
	void showLayerContextMenu(
		layer,
		event.currentTarget as HTMLElement,
		event.clientX,
		event.clientY,
	);
}

function openLayerContextMenuFromKeyboard(layer: PsdLayerNode, event: KeyboardEvent): void {
	if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
	event.preventDefault();
	const target = event.currentTarget as HTMLElement;
	const rect = target.getBoundingClientRect();
	void showLayerContextMenu(layer, target, rect.left + 28, rect.top + rect.height / 2);
}

function selectContextMenuItem(item: UiMenuItem): void {
	const layer = contextLayer.value;
	if (!layer) return;
	switch (item.id) {
		case "toggle-group":
			toggleGroupOpen(layer);
			break;
		case "duplicate":
			editor.apply(
				[{ type: "layer.duplicate", layerId: layer.id } as PsdEditorAction],
				"Duplicate",
			);
			break;
		case "visibility":
			toggleVisible(layer);
			break;
		case "lock":
			toggleLocked(layer);
			break;
		case "group":
			groupSelected();
			break;
		case "ungroup":
			ungroupLayer(layer);
			break;
		case "merge":
			mergeSelected();
			break;
		case "delete":
			deleteSelected();
			break;
	}
}

onBeforeUnmount(() => {
	if (contextMenuFocusTimer) globalThis.clearTimeout(contextMenuFocusTimer);
	if (editor.layerVisualPreview.value?.layerId === active.value?.id)
		editor.layerVisualPreview.value = null;
	document.body.classList.remove("als-ofs-psd-context-menu-open");
});
const projectId = inject(PSD_PROJECT_ID, "");
function startLayerDrag(event: DragEvent, layer: PsdLayerNode) {
	if (!event.dataTransfer) return;
	event.dataTransfer.setData(
		PROJECT_LAYER_MIME,
		JSON.stringify({ project: projectId, id: layer.id, copy: event.altKey }),
	);
	event.dataTransfer.effectAllowed = "copyMove";
}
function dropLayer(event: DragEvent, row: PsdLayerRow) {
	event.preventDefault();
	event.stopPropagation();
	if (editor.readonly.value) return;
	try {
		const raw = event.dataTransfer?.getData(PROJECT_LAYER_MIME);
		if (!raw) return;
		const source = JSON.parse(raw);
		if (typeof source.project !== "string" || typeof source.id !== "string") return;
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect(),
			middle = (event.clientY - rect.top) / rect.height;
		const into = row.layer.kind === "group" && middle > 0.25 && middle < 0.75,
			parentId = into ? row.layer.id : row.parentId;
		const parent = parentId ? rows.value.find((r) => r.layer.id === parentId)?.layer : null;
		const siblings = parent?.kind === "group" ? parent.children : editor.document.value!.layers;
		let index = into
			? siblings.length
			: siblings.findIndex((l) => l.id === row.layer.id) + (middle < 0.5 ? 1 : 0);
		if (source.project === projectId && !source.copy && !event.altKey) {
			if (source.id === row.layer.id) return;
			const old = siblings.findIndex((l) => l.id === source.id);
			if (old >= 0 && old < index) index--;
			editor.apply(
				[{ type: "layer.reorder", layerId: source.id, parentId, index }],
				"Move Layer",
			);
		} else {
			const result = editor.apply(
				[layerImportAction(source.project, source.id, parentId, index)],
				"Copy Layer",
			);
			if (result?.createdIds[0]) editor.selectLayer(result.createdIds[0]);
		}
	} catch (e) {
		editor.lastError.value = String(e);
	}
}
let cancelLayerPointerDrag: (() => void) | null = null;
onBeforeUnmount(() => cancelLayerPointerDrag?.());
function startLayerPointerDrag(event: PointerEvent, layer: PsdLayerNode) {
	if (
		event.button !== 0 ||
		editor.readonly.value ||
		(event.target as HTMLElement).closest("input,textarea,select")
	)
		return;
	const x = event.clientX,
		y = event.clientY;
	cancelLayerPointerDrag?.();
	const finish = (end: PointerEvent) => {
		cancelLayerPointerDrag?.();
		if (Math.hypot(end.clientX - x, end.clientY - y) < 6) return;
		const hit = document.elementFromPoint(end.clientX, end.clientY),
			tab = hit?.closest<HTMLElement>("[data-project-tab]"),
			row = hit?.closest<HTMLElement>("[data-layer-id]"),
			root = hit?.closest<HTMLElement>("[data-project-id]");
		if (!tab && !row) return;
		const target = tab?.dataset.projectTab ?? root?.dataset.projectId;
		if (!target) return;
		const rect = row?.getBoundingClientRect();
		try {
			dropProjectLayer(
				projectId,
				layer.id,
				target,
				row?.dataset.layerId ?? null,
				rect ? (end.clientY - rect.top) / rect.height : 0.5,
				event.altKey || end.altKey,
			);
		} catch (e) {
			editor.lastError.value = String(e);
		}
	};
	const cancel = () => cancelLayerPointerDrag?.();
	cancelLayerPointerDrag = () => {
		window.removeEventListener("pointerup", finish);
		window.removeEventListener("pointercancel", cancel);
		cancelLayerPointerDrag = null;
	};
	window.addEventListener("pointerup", finish, { once: true });
	window.addEventListener("pointercancel", cancel, { once: true });
}
</script>

<template>
	<div class="als-ofs-psd-layers">
		<div class="als-ofs-psd-layers__controls">
			<UiSelect
				v-model="blendMode"
				class="als-ofs-psd-layers__blend"
				aria-label="Blend mode"
				:disabled="!active || editor.readonly.value"
				:options="blendOptions"
			/>
			<UiSlider
				:model-value="opacityPercent"
				class="als-ofs-psd-layers__opacity"
				label="Opacity"
				:min="0"
				:max="100"
				:disabled="!active || editor.readonly.value"
				:output="`${opacityPercent}%`"
				@input="previewOpacity"
				@change="commitOpacity()"
				@pointercancel="cancelOpacityPreview"
				@keydown.esc="cancelOpacityPreview"
			/>
		</div>
		<div class="als-ofs-psd-layers__scroll">
			<ul
				ref="listElement"
				class="als-ofs-psd-layers__list"
				role="tree"
				aria-label="Layers"
				aria-multiselectable="true"
			>
				<li
					v-for="row in rows"
					:key="row.layer.id"
					class="als-ofs-psd-layers__row"
					role="treeitem"
					draggable="false"
					@pointerdown="startLayerPointerDrag($event, row.layer)"
					@dragstart.prevent
					@dragover.prevent
					@drop="dropLayer($event, row)"
					:aria-level="row.depth + 1"
					:aria-expanded="row.layer.kind === 'group' ? row.layer.open : undefined"
					:aria-selected="editor.selectedLayerIds.value.includes(row.layer.id)"
					:data-selected="
						editor.selectedLayerIds.value.includes(row.layer.id) || undefined
					"
					:data-kind="row.layer.kind"
					:data-layer-id="row.layer.id"
					:tabindex="editor.selectedLayerIds.value.includes(row.layer.id) ? 0 : -1"
					:style="{ paddingLeft: `${8 + row.depth * 16}px` }"
					@click="selectRow(row.layer, $event)"
					@contextmenu="openLayerContextMenu(row.layer, $event)"
					@dblclick="startRename(row.layer)"
					@keydown.enter.prevent="editor.selectLayer(row.layer.id)"
					@keydown="openLayerContextMenuFromKeyboard(row.layer, $event)"
					@keydown.space.prevent="editor.selectLayer(row.layer.id)"
					@keydown.up.prevent="moveRowFocus(row.layer, -1)"
					@keydown.down.prevent="moveRowFocus(row.layer, 1)"
					@keydown.left="setGroupOpen(row.layer, false, $event)"
					@keydown.right="setGroupOpen(row.layer, true, $event)"
				>
					<button
						type="button"
						class="als-ofs-psd-layers__eye"
						:title="row.layer.visible ? 'Hide layer' : 'Show layer'"
						:aria-label="row.layer.visible ? 'Hide layer' : 'Show layer'"
						:data-off="!row.layer.visible || undefined"
						@click.stop="toggleVisible(row.layer)"
					>
						<UiIcon :name="row.layer.visible ? 'eye' : 'eye-off'" :size="14" />
					</button>
					<button
						v-if="row.layer.kind === 'group'"
						type="button"
						class="als-ofs-psd-layers__disclosure"
						:aria-label="row.layer.open ? 'Collapse group' : 'Expand group'"
						:aria-expanded="row.layer.open"
						:tabindex="-1"
						@click.stop="toggleGroupOpen(row.layer)"
					>
						<UiIcon
							:name="row.layer.open ? 'chevron-down' : 'chevron-right'"
							:size="12"
						/>
					</button>
					<span v-else class="als-ofs-psd-layers__disclosure-spacer" aria-hidden="true" />
					<button
						type="button"
						class="als-ofs-psd-layers__thumb"
						:data-kind="row.layer.kind"
						:aria-label="`Edit image: ${row.layer.name}`"
						:aria-pressed="
							active?.id === row.layer.id && editor.editTarget.value === 'image'
						"
						@click.stop="editor.selectLayer(row.layer.id)"
						@keydown="($event.key === 'Enter' || $event.key === ' ') && $event.stopPropagation()"
					>
						<img
							v-if="thumbnails.get(row.layer.id)"
							:src="thumbnails.get(row.layer.id)"
							alt=""
						/>
						<UiIcon v-else-if="row.layer.kind === 'group'" name="group" :size="15" />
						<span v-else aria-hidden="true">{{
							row.layer.curves || row.layer.adjustment ? "∿" : "T"
						}}</span>
					</button>
					<button
						v-if="row.layer.mask"
						type="button"
						class="als-ofs-psd-layers__mask-thumb"
						:aria-pressed="
							active?.id === row.layer.id && editor.editTarget.value === 'mask'
						"
						:aria-label="`Mask controls: ${row.layer.name}${row.layer.mask.disabled ? ' (disabled)' : ''}`"
						:title="
							row.layer.mask.disabled
								? 'Mask disabled — click for controls'
								: 'Layer mask — click for controls'
						"
						:data-disabled="row.layer.mask.disabled || undefined"
						@click.stop="openMaskControls(row.layer)"
						@dblclick.stop
						@keydown="($event.key === 'Enter' || $event.key === ' ') && $event.stopPropagation()"
					>
						<img :src="maskThumbnail(row.layer)" alt="" />
					</button>
					<span v-if="renamingId !== row.layer.id" class="als-ofs-psd-layers__name">
						{{ row.layer.name }}
						<em
							v-if="row.layer.blendModeFallback"
							class="als-ofs-psd-layers__fallback"
							:title="`Blend mode '${row.layer.blendModeFallback}' renders as normal`"
							>!</em
						>
					</span>
					<UiInput
						v-else
						v-model="renameDraft"
						class="als-ofs-psd-layers__rename"
						@keydown.enter="commitRename"
						@keydown.escape="renamingId = null"
						@blur="commitRename"
					/>
					<button
						type="button"
						class="als-ofs-psd-layers__lock"
						:title="
							row.layer.locks.all || row.layer.locks.composite ? 'Unlock' : 'Lock'
						"
						:aria-label="
							row.layer.locks.all || row.layer.locks.composite ? 'Unlock' : 'Lock'
						"
						:data-locked="row.layer.locks.all || row.layer.locks.composite || undefined"
						@click.stop="toggleLocked(row.layer)"
					>
						<UiIcon
							:name="
								row.layer.locks.all || row.layer.locks.composite ? 'lock' : 'unlock'
							"
							:size="14"
						/>
					</button>
				</li>
			</ul>
			<div class="als-ofs-psd-layers__mask-controls">
				<button type="button" :disabled="editor.readonly.value" @click="openCurves()">
					New curves adjustment</button
				><button
					v-if="active && active.kind !== 'group' && active.curves"
					type="button"
					:disabled="maskLocked"
					@click="openCurves(true)"
				>
					Edit curves
				</button>
			</div>
			<PsdCurvesDialog v-model="curvesOpen" :layer-id="curvesLayerId" />
			<div class="als-ofs-psd-layers__mask-controls">
				<label
					>Adjustment type<select
						v-model="adjustmentKind"
						aria-label="Adjustment layer type"
					>
						<option value="levels">Levels</option>
						<option value="hue-saturation">Hue / Saturation</option>
						<option value="exposure">Exposure</option>
						<option value="grain">Film Grain</option>
						<option value="gradient-map">Gradient Map</option>
					</select></label
				><button type="button" :disabled="editor.readonly.value" @click="openAdjustment()">
					New adjustment layer</button
				><button
					v-if="active && active.kind !== 'group' && active.adjustment"
					type="button"
					:disabled="maskLocked"
					@click="openAdjustment(true)"
				>
					Edit adjustment
				</button>
			</div>
			<PsdAdjustmentDialog
				v-model="adjustmentOpen"
				:kind="adjustmentKind"
				:layer-id="adjustmentLayerId"
			/>
			<div class="als-ofs-psd-layers__mask-controls">
				<button
					type="button"
					:disabled="
						maskLocked ||
						!editor.selection.value ||
						!active ||
						active.kind === 'group' ||
						!!active.curves ||
						!!active.adjustment ||
						editor.editTarget.value === 'mask'
					"
					@click="repairFillOpen = true"
				>
					Content-aware fill selection
				</button>
			</div>
			<PsdRepairFillDialog v-model="repairFillOpen" />
			<details
				v-if="active"
				class="als-ofs-psd-layers__mask-controls"
				:open="maskControlsOpen"
				@toggle="maskControlsOpen = ($event.target as HTMLDetailsElement).open"
			>
				<summary>
					Layer mask ·
					{{ active.mask ? (active.mask.disabled ? "Disabled" : "Enabled") : "None" }}
				</summary>
				<p>{{ active.name }} · White reveals, black hides. Image pixels stay unchanged.</p>
				<div role="group" aria-label="Layer mask actions">
					<template v-if="!active.mask">
						<button
							type="button"
							:disabled="maskLocked"
							@click="editMask('reveal-all')"
						>
							Reveal all
						</button>
						<button type="button" :disabled="maskLocked" @click="editMask('hide-all')">
							Hide all
						</button>
						<button
							type="button"
							:disabled="maskLocked || !editor.selection.value"
							@click="editMask('from-selection')"
						>
							From selection
						</button>
					</template>
					<template v-else>
						<button
							type="button"
							:disabled="maskLocked"
							:aria-pressed="
								editor.editTarget.value === 'mask' &&
								editor.maskPaint.value === 'hide'
							"
							@click="paintMask('hide')"
						>
							Paint black · hide
						</button>
						<button
							type="button"
							:disabled="maskLocked"
							:aria-pressed="
								editor.editTarget.value === 'mask' &&
								editor.maskPaint.value === 'reveal'
							"
							@click="paintMask('reveal')"
						>
							Paint white · reveal
						</button>
						<button
							type="button"
							:disabled="maskLocked"
							@click="editMask(active.mask.linked === false ? 'link' : 'unlink')"
						>
							{{
								active.mask.linked === false ? "Link to image" : "Unlink from image"
							}}
						</button>
						<button type="button" :disabled="maskLocked" @click="maskEdit('fill', 0)">
							Fill black</button
						><button
							type="button"
							:disabled="maskLocked"
							@click="maskEdit('fill', 255)"
						>
							Fill white
						</button>
						<label
							>Feather px
							<input
								v-model.number="featherRadius"
								aria-label="Mask feather radius"
								type="number"
								min="0.5"
								max="100"
								step="0.5" /></label
						><button type="button" :disabled="maskLocked" @click="maskEdit('feather')">
							Feather mask
						</button>
						<fieldset :disabled="maskLocked">
							<legend>Transform mask independently</legend>
							<label>Move X <input v-model.number="maskDx" type="number" /></label
							><label>Move Y <input v-model.number="maskDy" type="number" /></label
							><label
								>Scale %
								<input
									v-model.number="maskScale"
									type="number"
									min="1"
									max="1000" /></label
							><label
								>Rotate °
								<input
									v-model.number="maskAngle"
									type="number"
									min="-360"
									max="360" /></label
							><button type="button" @click="maskEdit('transform')">
								Apply mask transform
							</button>
						</fieldset>
						<button
							type="button"
							:disabled="maskLocked"
							@click="editMask(active.mask.disabled ? 'enable' : 'disable')"
						>
							{{ active.mask.disabled ? "Enable" : "Disable" }}
						</button>
						<button type="button" :disabled="maskLocked" @click="editMask('invert')">
							Invert
						</button>
						<button type="button" :disabled="maskLocked" @click="editMask('delete')">
							Delete mask
						</button>
					</template>
				</div>
			</details>
		</div>
		<div ref="contextMenuHost">
			<UiContextMenu
				:active="contextMenu.active.value"
				aria-label="Layer commands"
				:items="contextMenuItems"
				@select="selectContextMenuItem"
				@update:active="setContextMenuActive"
			/>
		</div>

		<div class="als-ofs-psd-layers__footer" role="toolbar" aria-label="Layer actions">
			<UiIconButton
				icon="plus"
				label="New layer"
				:disabled="editor.readonly.value"
				@click="addLayer"
			/>
			<UiIconButton
				icon="duplicate"
				label="Duplicate"
				:disabled="!active || editor.readonly.value"
				@click="duplicateLayer"
			/>
			<UiIconButton
				icon="group"
				label="Group"
				:disabled="!editor.selectedLayerIds.value.length || editor.readonly.value"
				@click="groupSelected"
			/>
			<UiIconButton
				icon="arrow-up"
				label="Move up"
				:disabled="!active || editor.readonly.value"
				@click="reorder(1)"
			/>
			<UiIconButton
				icon="arrow-down"
				label="Move down"
				:disabled="!active || editor.readonly.value"
				@click="reorder(-1)"
			/>
			<UiIconButton
				icon="trash"
				label="Delete"
				:disabled="!editor.selectedLayerIds.value.length || editor.readonly.value"
				@click="deleteSelected"
			/>
		</div>
	</div>
</template>

<style scoped>
.als-ofs-psd-layers__mask-controls input {
	width: 65px;
	background: transparent;
	color: inherit;
	border: 1px solid #777;
	border-radius: 3px;
	padding: 4px;
}
.als-ofs-psd-layers__mask-controls label {
	display: flex;
	align-items: center;
	gap: 6px;
}
.als-ofs-psd-layers__mask-controls fieldset {
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
	border: 1px solid #777;
	max-width: 100%;
}
.als-ofs-psd-layers__mask-controls button[aria-pressed="true"],
.als-ofs-psd-layers__thumb[aria-pressed="true"],
.als-ofs-psd-layers__mask-thumb[aria-pressed="true"] {
	outline: 2px solid #89aaff;
	outline-offset: 1px;
}
</style>
