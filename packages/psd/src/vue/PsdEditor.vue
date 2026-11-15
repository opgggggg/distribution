<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from "vue";
import {
	UiEditorShell,
	UiDialog,
	UiButton,
	UiInputDialog,
	UiEditorStatusControls,
	UiOfficeTitlebar,
	UiRibbonTabs,
	type UiPanelToolbarItem,
	type UiRibbonTabItem,
	type UiStatusItem,
} from "@yaochn/als-office-editor-ui/vue";
import type { PsdEditorAction, PsdTransactionResult } from "@cubexp/psd";
import type {
	PsdEditorApi,
	PsdEditorAppearance,
	PsdEditorExportFormat,
	PsdEditorProps,
	PsdToolId,
} from "./component-types";
import { PSD_PROJECT_ID, registerProject, registerProjectActivation } from "./psd-project-drag";
import { PSD_EDITOR_CONTEXT } from "./psd-editor-context";
import { registerPsdPreview } from "./thumbnail";
import { usePsdEditor } from "./use-psd-editor";
import PsdToolStrip from "./PsdToolStrip.vue";
import PsdToolOptionsPanel from "./PsdToolOptionsPanel.vue";
import PsdEditorStage from "./PsdEditorStage.vue";
import PsdRightPanels from "./PsdRightPanels.vue";
import PsdRibbonCommands from "./PsdRibbonCommands.vue";
import PsdDialogs from "./PsdDialogs.vue";
import { createPsdPaneState, PSD_PANE_STATE } from "./psd-pane-state";

const props = withDefaults(defineProps<PsdEditorProps>(), {
	source: null,
	fileName: "untitled.psd",
	readonly: false,
	chrome: true,
	headerMode: "default",
	ribbon: true,
	showAppearanceToggle: true,
	showRibbonGroupLabels: false,
	leftPanel: true,
	rightPanel: true,
	ai: false,
});

const emit = defineEmits<{
	loaded: [];
	dirty: [value: boolean];
	activate: [];
	filename: [name: string];
	error: [error: Error];
	change: [result: PsdTransactionResult];
	"update:appearance": [appearance: PsdEditorAppearance];
}>();

const localAppearance = ref<PsdEditorAppearance>(props.getAppearance?.() ?? props.appearance ?? "light");
watch(() => props.getAppearance?.() ?? props.appearance, value => { if (value) localAppearance.value = value; });
function toggleAppearance() {
 localAppearance.value = localAppearance.value === "dark" ? "light" : "dark";
 emit("update:appearance", localAppearance.value);
}
const narrowLayout = ref(false);
const panelsOpen = ref(false);
let layoutObserver: ResizeObserver | undefined;
watch(panelsOpen, open => { if (open) editor.toolOptionsOpen.value = false; });
watch(narrowLayout, narrow => { panelsOpen.value = false; if (narrow) editor.toolOptionsOpen.value = false; });
const editor = usePsdEditor({
	persistPsd: () => props.persistPsd,
	readonly: () => props.readonly,
	imageServices: () => props.imageServices,
	onLoaded: () => emit("loaded"),
	onError: (error) => emit("error", error),
	onChange: (result) => emit("change", result),
});
watch(editor.dirty, (value) => emit("dirty", value));
provide(PSD_EDITOR_CONTEXT, editor);
const projectId = props.projectId ?? `psd-${Math.random().toString(36).slice(2)}`;
provide(PSD_PROJECT_ID, projectId);
const paneState = createPsdPaneState();
provide(PSD_PANE_STATE, paneState);
const anyRightPaneVisible = paneState.anyVisible;

watch(
	() => props.source,
	(source) => {
		void editor.load(source ?? null, props.fileName);
	},
	{ immediate: true },
);

watch(
	() => props.fileName,
	(fileName) => {
		editor.fileName.value = fileName;
	},
);

const activeRibbonTab = ref("home");
const ribbonCollapsed = ref(false);
const STANDARD_RIBBON_TABS: UiRibbonTabItem[] = [
	{ id: "home", label: "Home" },
	{ id: "layer", label: "Layer" },
	{ id: "select", label: "Select" },
	{ id: "image", label: "Image" },
	{ id: "filter", label: "Filter" },
	{ id: "view", label: "View" },
];
const previousStandardRibbonTab = ref("home");
const ribbonTabs = computed<UiRibbonTabItem[]>(() => {
	if (editor.activeLayer.value?.kind !== "text") return [...STANDARD_RIBBON_TABS];
	return [
		...STANDARD_RIBBON_TABS,
		{
			id: "text",
			label: "Text",
			context: "Text tools",
			title: "Text layer formatting",
		},
	];
});

watch(
	() => [editor.activeLayer.value?.id, editor.activeLayer.value?.kind] as const,
	([layerId, kind], previous) => {
		const selectionChanged = layerId !== previous?.[0];
		const enteredTextContext = kind === "text" && previous?.[1] !== "text";
		if (kind === "text" && (selectionChanged || enteredTextContext)) {
			if (activeRibbonTab.value !== "text") {
				previousStandardRibbonTab.value = activeRibbonTab.value;
			}
			activeRibbonTab.value = "text";
			ribbonCollapsed.value = false;
			return;
		}
		if (kind !== "text" && activeRibbonTab.value === "text") {
			activeRibbonTab.value = previousStandardRibbonTab.value;
		}
	},
);

function selectRibbonTab(item: UiRibbonTabItem): void {
	ribbonCollapsed.value = false;
	if (item.id !== "text") previousStandardRibbonTab.value = item.id;
}

const statusItems = computed<UiStatusItem[]>(() => {
	const document = editor.document.value;
	if (!document) return [];
	const items: UiStatusItem[] = [
		{ id: "size", label: `${document.width} × ${document.height} px` },
		{ id: "mode", label: `${document.colorMode.toUpperCase()} ${document.bitsPerChannel}-bit` },
	];
	if (editor.readonly.value) items.push({ id: "readonly", label: "Read-only", tone: "warning" });
	if (editor.lastError.value)
		items.push({ id: "error", label: editor.lastError.value, tone: "danger" });
	return items;
});

const zoomPercent = computed({
	get: () => Math.round(editor.zoom.value * 100),
	set: (value: number) => (editor.zoom.value = Math.min(8, Math.max(0.125, value / 100))),
});

const subtitle = computed(() => {
	if (editor.readonly.value) return "Read-only document";
	return editor.dirty.value ? "Unsaved changes" : "All changes saved";
});

const titlebarHistoryItems = computed<UiPanelToolbarItem[]>(() => [
	{
		id: "undo",
		label: "Undo last action",
		icon: "undo",
		title: "Undo (Ctrl/Cmd+Z)",
		disabled: !editor.canUndo.value,
	},
	{
		id: "redo",
		label: "Redo last action",
		icon: "redo",
		title: "Redo (Ctrl/Cmd+Shift+Z)",
		disabled: !editor.canRedo.value,
	},
]);

function selectTitlebarHistoryItem(item: UiPanelToolbarItem): void {
	if (item.id === "undo" && editor.canUndo.value) editor.undo();
	else if (item.id === "redo" && editor.canRedo.value) editor.redo();
}

// --- keyboard shortcuts ---

const TOOL_KEYS: Record<string, PsdToolId> = {
	v: "move",
	m: "marquee",
	l: "lasso",
	w: "wand",
	c: "crop",
	i: "eyedropper",
	b: "brush",
	e: "eraser",
	s: "clone",
	j: "heal",
	r: "blur",
	u: "shape",
	t: "text",
	h: "hand",
	z: "zoom",
};

function deleteSelectionOrLayers(): void {
	const active = editor.activeLayer.value;
	if (active && editor.editTarget.value === "mask") {
		editor.apply([editor.selection.value
			? { type: "mask.edit", layerId: active.id, operation: "fill", value: editor.maskPaint.value === "hide" ? 255 : 0 }
			: { type: "layer.mask", layerId: active.id, operation: "delete" }], "Clear Mask");
		return;
	}
	if (editor.selection.value && active && active.kind !== "group") {
		editor.apply(
			[{ type: "layer.clearSelected", layerId: active.id } as PsdEditorAction],
			"Clear Selected Pixels",
		);
		return;
	}
	if (!editor.selectedLayerIds.value.length) return;
	editor.apply(
		[
			{
				type: "layer.delete",
				layerIds: [...editor.selectedLayerIds.value],
			} as PsdEditorAction,
		],
		"Delete Layer",
	);
}

async function copyActiveLayer(cut: boolean): Promise<void> {
	const session = editor.session.value, stateId = session?.getStateId(), layer = editor.activeLayer.value;
	const target = editor.editTarget.value, maskBackground = editor.maskPaint.value === "hide" ? 255 : 0;
	if (cut && (!editor.selection.value || editor.readonly.value)) return;
	try {
		const blob = await editor.copyLayer();
		await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
		if (!cut || !layer) return;
		if (editor.session.value !== session || session?.getStateId() !== stateId) throw Error("Document changed while copying; pixels were not cut");
		editor.apply([target === "mask" ? { type: "mask.edit", layerId: layer.id, operation: "fill", value: maskBackground } : { type: "layer.clearSelected", layerId: layer.id }], "Cut Selected Pixels");
	} catch (e) { editor.lastError.value = String(e); }
}
async function onPaste(event: ClipboardEvent): Promise<void> {
	const target = event.target as HTMLElement | null;
	if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
	const images = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith("image/"));
	if (!images.length) return;
	event.preventDefault();
	event.stopPropagation();
	try { for (const image of images) await editor.pasteImage(image); }
	catch (error) { editor.lastError.value = String(error); }
}

function onClipboard(event: ClipboardEvent): void {
	const target = event.target as HTMLElement | null;
	if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
	event.preventDefault();
	void copyActiveLayer(event.type === "cut");
}

function onKeydown(event: KeyboardEvent): void {
	if (event.defaultPrevented) return;
	const target = event.target as HTMLElement | null;
	const isEditable =
		target && (/^(input|textarea|select)$/i.test(target.tagName) || target.isContentEditable);
	if (event.key === "Escape" && editor.toolOptionsOpen.value) {
		event.preventDefault();
		editor.toolOptionsOpen.value = false;
		return;
	}
	if (
		event.code === "Space" &&
		!isEditable &&
		!event.metaKey &&
		!event.ctrlKey &&
		!event.altKey
	) {
		event.preventDefault();
		editor.spacePanActive.value = true;
		return;
	}
	if (isEditable) return;
	if ((event.key === "Backspace" || event.key === "Delete") && !editor.readonly.value && editor.activeLayer.value) {
		if (event.shiftKey) {
			event.preventDefault(); editor.panelCommand.value = "repair"; return;
		}
		if (event.altKey || event.metaKey || event.ctrlKey) {
			event.preventDefault();
			const hex = (event.altKey ? editor.foreground.value : editor.background.value).replace("#", "");
			const value = Number.parseInt(hex, 16), layerId = editor.activeLayer.value.id;
			editor.apply([editor.editTarget.value === "mask"
				? { type: "mask.edit", layerId, operation: "fill", value: (editor.maskPaint.value === "hide") === event.altKey ? 0 : 255 }
				: {type:"fill.apply",layerId,color:{r:(value >> 16)&255,g:(value >> 8)&255,b:value&255}}], "Fill");
			return;
		}
	}
	if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "t") {
		event.preventDefault();
		editor.dialog.value = "transform-selection";
		return;
	}
	if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
		event.preventDefault();
		if (event.shiftKey) editor.redo();
		else editor.undo();
		return;
	}
	if ((event.metaKey || event.ctrlKey) && event.key === "0") {
		event.preventDefault();
		editor.viewCommand.value = "fit";
		return;
	}
	if ((event.metaKey || event.ctrlKey) && event.key === "1") {
		event.preventDefault();
		editor.viewCommand.value = "actual";
		return;
	}
	if (event.metaKey || event.ctrlKey) {
		const key = event.key.toLowerCase();
		if (key === "=" || key === "+" || key === "-") {
			event.preventDefault();
			editor.zoom.value = Math.max(0.05, Math.min(32, editor.zoom.value * (key === "-" ? 0.8 : 1.25)));
			return;
		}
		if (key === "h" && editor.tool.value === "move") {
			event.preventDefault();
			editor.showTransformControls.value = !editor.showTransformControls.value;
			return;
		}
		if (key === "e" && event.shiftKey) {
			event.preventDefault(); editor.exportPng(); return;
		}
		if (key === "s" && event.altKey && event.shiftKey) {
			event.preventDefault(); editor.exportFormat.value = "jpeg"; editor.dialog.value = "export"; return;
		}
		if (!editor.readonly.value && editor.activeLayer.value) {
			const layerId = editor.activeLayer.value.id;
			if (key === "m") {
				event.preventDefault(); editor.panelCommand.value = "curves"; return;
			}
			if (key === "l" || key === "u") {
				event.preventDefault();
				editor.dialog.value = key === "l" ? "levels" : "hue-saturation";
				return;
			}
			if (key === "i" && !event.shiftKey) {
				event.preventDefault();
				editor.apply([editor.editTarget.value === "mask"
					? { type: "layer.mask", layerId, operation: "invert" }
					: { type: "adjustment.apply", layerId, kind: "invert" }], "Invert");
				return;
			}
			if (key === "e") {
				event.preventDefault();
				editor.apply([editor.selectedLayerIds.value.length > 1 ? { type: "layer.merge", layerIds: [...editor.selectedLayerIds.value] } : { type: "layer.mergeDown", layerId }], "Merge Layers");
				return;
			}
		}
		if ((key === "c" && !event.shiftKey) || key === "x") {
			event.preventDefault();
			void copyActiveLayer(key === "x");
			return;
		}
		if (key === "c" && event.shiftKey) {
			event.preventDefault();
			void editor
				.copyMerged()
				.then((blob) =>
					navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]),
				)
				.catch((e) => (editor.lastError.value = String(e)));
			return;
		}
		if (key === "s") {
			event.preventDefault();
			if (event.shiftKey) editor.saveAsOpen.value = true;
			else editor.savePsd();
			return;
		}
		if (key === "a" && editor.document.value) {
			event.preventDefault();
			editor.apply(
				[
					{
						type: "selection.set",
						shape: "rectangle",
						x: 0,
						y: 0,
						width: editor.document.value.width,
						height: editor.document.value.height,
					},
				],
				"Select All",
			);
			return;
		}
		if (key === "d") {
			event.preventDefault();
			editor.apply([{ type: "selection.clear" }], "Deselect");
			return;
		}
		if (key === "i" && event.shiftKey) {
			event.preventDefault();
			editor.apply([{ type: "selection.invert" }], "Inverse Selection");
			return;
		}
		if (key === "j" && editor.activeLayer.value) {
			event.preventDefault();
			editor.apply(
				[
					editor.selection.value && editor.activeLayer.value.kind !== "group"
						? {
								type: "layer.fromSelection",
								sourceLayerId: editor.activeLayer.value.id,
							}
						: { type: "layer.duplicate", layerId: editor.activeLayer.value.id },
				],
				editor.selection.value ? "Layer Via Copy" : "Duplicate Layer",
			);
			return;
		}
	}
	if (event.metaKey || event.ctrlKey || event.altKey) return;
	const key = event.key.toLowerCase();
	if (key === "x") {
		editor.swapColors();
		return;
	}
	if (key === "d") {
		editor.foreground.value = "#000000";
		editor.background.value = "#ffffff";
		return;
	}
	if (key === "o") {
		editor.tool.value = editor.tool.value === "dodge" ? "burn" : "dodge";
		editor.toolOptionsOpen.value = true;
		return;
	}
	if (key === "g") {
		editor.tool.value = editor.tool.value === "gradient" ? "bucket" : "gradient";
		editor.toolOptionsOpen.value = true;
		return;
	}
	if (key === "delete" || key === "backspace") {
		if (editor.selectedLayerIds.value.length && !editor.readonly.value) {
			event.preventDefault();
			deleteSelectionOrLayers();
		}
		return;
	}
	const tool = TOOL_KEYS[key];
	if (tool) {
		editor.tool.value = tool;
		editor.toolOptionsOpen.value = true;
	}
}

function onKeyup(event: KeyboardEvent): void {
	if (event.code !== "Space") return;
	editor.spacePanActive.value = false;
}

function resetSpacePan(): void {
	editor.spacePanActive.value = false;
}

function focusEditor(event: PointerEvent): void {
	const target = event.target as HTMLElement | null;
	if (target && !target.closest(".als-ofs-psd-tool-options, .als-ofs-psd-toolstrip")) {
		editor.toolOptionsOpen.value = false;
	}
	if (target?.closest(".als-ofs-psd-stage__text-entry")) return;
	if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
	rootElement.value?.focus({ preventScroll: true });
}

const saveAsName = ref("");
watch(editor.saveAsOpen, open => { if (open) saveAsName.value = editor.fileName.value; });
watch(editor.fileName, name => emit("filename", name));
const rootElement = ref<HTMLElement | null>(null);
watch(rootElement, (element, _previous, cleanup) => {
	if (element) cleanup(registerPsdPreview(element, editor.composite));
});

onMounted(() => {
	rootElement.value?.addEventListener("keydown", onKeydown);
 if (rootElement.value) {
  const update = () => { narrowLayout.value = rootElement.value!.clientWidth < 760; };
  update(); layoutObserver = new ResizeObserver(update); layoutObserver.observe(rootElement.value);
 }
	globalThis.addEventListener("keyup", onKeyup);
	globalThis.addEventListener("blur", resetSpacePan);
});
onBeforeUnmount(() => {
	layoutObserver?.disconnect();
	rootElement.value?.removeEventListener("keydown", onKeydown);
	globalThis.removeEventListener("keyup", onKeyup);
	globalThis.removeEventListener("blur", resetSpacePan);
});

const api: PsdEditorApi = {
	session: () => editor.session.value,
	document: () => editor.document.value,
	aiApi: () => editor.aiApi.value,
	apply: (actions, label) => editor.apply(actions, label),
	openFile: async (file, name) => editor.load(file, name),
	newFile: async () => editor.load(null, "Untitled.psd"),
	exportFile: (format: PsdEditorExportFormat, options) => editor.exportFile(format, options),
	saveFile: async (options) => {
		const blob = await editor.exportFile("psd", options);
		editor.markSaved();
		return blob;
	},
	copyMerged: () => editor.copyMerged(),
	pasteImage: (file: Blob) => editor.pasteImage(file),
	isDirty: () => editor.dirty.value,
	isReadonly: () => editor.readonly.value,
	getRevision: () => editor.revision.value,
	executeCommands: async (commands, options) => {
		const actionApi = editor.aiApi.value;
		if (!actionApi) throw new Error("The PSD action API is still preparing.");
		return actionApi.execute(commands, options);
	},
	getCommandManifest: (query) => {
		const actionApi = editor.aiApi.value;
		if (!actionApi) throw new Error("The PSD action API is still preparing.");
		return actionApi.getManifest(query);
	},
	markSaved: () => editor.markSaved(),
	savePsd: () => editor.savePsd(),
	exportPng: () => editor.exportPng(),
	undo: () => editor.undo(),
	redo: () => editor.redo(),
};
const unregisterProject = registerProject(projectId, api);
const unregisterActivation = registerProjectActivation(projectId, () => emit("activate"));
onBeforeUnmount(unregisterActivation);
onBeforeUnmount(unregisterProject);
defineExpose(api);
</script>

<template>
	<div
		ref="rootElement"
		:data-project-id="projectId"
		class="als-ofs-editor-ui als-ofs-psd-editor"
		:data-appearance="localAppearance"
		:data-theme="localAppearance"
		tabindex="-1"
		@pointerdown.capture="focusEditor"
		@copy="onClipboard"
		@cut="onClipboard"
		@paste="onPaste"
	>
		<div v-if="narrowLayout && rightPanel" class="als-ofs-psd-mobile-toolbar">
   <UiButton :aria-expanded="panelsOpen" @click="panelsOpen = true">Panels</UiButton>
  </div>
  <UiEditorShell
			class="als-ofs-psd-editor__shell"
			:active-ribbon-tab="activeRibbonTab"
			:data-appearance="localAppearance"
			:ribbon-collapsed="ribbonCollapsed"
			:ribbon-hidden="!ribbon || editor.readonly.value"
			:show-ribbon-group-labels="props.showRibbonGroupLabels"
			:titlebar-hidden="!chrome || headerMode !== 'default'"
			:status-hidden="!chrome || headerMode === 'hidden'"
			:status-items="statusItems"
			workspace-aria-label="PSD image editor"
		>
			<template #titlebar-leading>
				<UiOfficeTitlebar
					app-label="PSD image"
					app-mark="P"
					accent-color="#001e36"
					:quick-access-items="editor.readonly.value ? [] : titlebarHistoryItems"
					quick-access-aria-label="History"
					:title="editor.fileName.value.replace(/\.[^.]+$/, '')"
					:subtitle="subtitle"
					@quick-access-select="selectTitlebarHistoryItem"
				/>
			</template>
			<template #titlebar-actions>
				<UiButton v-if="showAppearanceToggle" :aria-label="localAppearance === 'dark' ? 'Use light appearance' : 'Use dark appearance'" @click="toggleAppearance">{{ localAppearance === 'dark' ? 'Light' : 'Dark' }}</UiButton>
    <slot name="titlebar-actions" :editor="api" />
			</template>

			<template #ribbon-tabs>
				<UiRibbonTabs
					v-model="activeRibbonTab"
					:collapsed="ribbonCollapsed"
					:items="ribbonTabs"
					@reselect="ribbonCollapsed = !ribbonCollapsed"
					@select="selectRibbonTab"
				/>
			</template>
			<template #ribbon-commands>
				<PsdRibbonCommands :active-tab="activeRibbonTab" />
			</template>

			<template v-if="leftPanel" #left-dock>
				<div class="als-ofs-psd-left">
					<PsdToolStrip />
				</div>
			</template>

			<template #stage>
				<div class="als-ofs-psd-stage-layout">
					<PsdToolOptionsPanel />
					<PsdEditorStage :show-document-bar="headerMode === 'default'" />
				</div>
			</template>

			<template v-if="rightPanel && anyRightPaneVisible && !narrowLayout" #right-dock>
				<PsdRightPanels />
			</template>

			<template #status-zoom>
				<UiButton size="sm" aria-label="Decrease Zoom" :disabled="zoomPercent <= 13" @click="zoomPercent = Math.max(13, zoomPercent - 25)">−</UiButton>
				<UiEditorStatusControls
					v-model:zoom-value="zoomPercent"
					:zoom-min="13"
					:zoom-max="800"
					:zoom-step="1"
					:zoom-step-buttons="false"
					:zoom-output="`${zoomPercent}%`"
				/>
				<UiButton size="sm" aria-label="Increase Zoom" :disabled="zoomPercent >= 800" @click="zoomPercent = Math.min(800, zoomPercent + 25)">+</UiButton>
			</template>
		</UiEditorShell>
		<UiDialog v-if="narrowLayout" v-model="panelsOpen" title="Panels" size="sm">
   <div class="als-ofs-psd-mobile-panels" :data-appearance="localAppearance"><PsdRightPanels /></div>
  </UiDialog>
  <PsdDialogs />
		<UiInputDialog v-model="editor.saveAsOpen.value" v-model:value="saveAsName" title="Save As" label="File name" input-aria-label="PSD file name" required @confirm="editor.savePsd($event)" />
	</div>
</template>
