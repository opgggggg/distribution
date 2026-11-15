<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
	UiColorPicker,
	UiFileButton,
	UiFontRibbonControls,
	UiRibbonCommandButton,
	UiRibbonField,
	UiRibbonGroup,
	UiInput,
	UiInputDialog,
	UiSelect,
	type UiDropdownItem,
	type UiIconName,
} from "@yaochn/als-office-editor-ui/vue";
import { isPsdBlendMode, type PsdEditorAction, type PsdTextStyle } from "@cubexp/psd";
import type { PsdDialogKind } from "./component-types";
import { usePsdEditorContext } from "./psd-editor-context";
import { PSD_PANE_DEFINITIONS, usePsdPaneState } from "./psd-pane-state";
import { hexToRgb, PSD_BLEND_MODE_OPTIONS, resolvedPsdTextStyle, rgbToHex } from "./use-psd-editor";

const props = defineProps<{ activeTab: string }>();

const editor = usePsdEditorContext();
const paneState = usePsdPaneState();
const active = computed(() => editor.activeLayer.value);
const disabled = computed(() => editor.readonly.value);
const noLayer = computed(() => disabled.value || !active.value);
const noPixelLayer = computed(() => noLayer.value || active.value?.kind === "group");
const noSelection = computed(() => disabled.value || !editor.selection.value);
const saveSelectionOpen = ref(false);
const savedSelectionName = ref("Selection 1");
const selectedSavedSelection = ref("");
const loadSelectionMode = ref<"replace" | "add" | "subtract" | "intersect">("replace");
const savedSelectionOptions = computed(() => {
	void editor.revision.value;
	return (editor.document.value?.savedSelections ?? []).map((entry) => ({
		value: entry.name,
		label: entry.name,
	}));
});

watch(
	savedSelectionOptions,
	(options) => {
		if (!options.some((option) => option.value === selectedSavedSelection.value)) {
			selectedSavedSelection.value = options[0]?.value ?? "";
		}
	},
	{ immediate: true },
);

function run(action: PsdEditorAction, label: string): void {
	editor.apply([action], label);
}

function applySelectionFeather(): void {
	const radius = Math.min(250, Math.max(0, Math.round(editor.selectionFeather.value)));
	editor.selectionFeather.value = radius;
	run({ type: "selection.feather", radius }, "Feather Selection");
}

function beginSaveSelection(): void {
	const count = savedSelectionOptions.value.length + 1;
	savedSelectionName.value = `Selection ${count}`;
	saveSelectionOpen.value = true;
}

function saveSelection(name: string): void {
	const normalized = name.trim();
	if (!normalized) return;
	run({ type: "selection.save", name: normalized }, "Save Selection");
	selectedSavedSelection.value = normalized;
}

function loadSelection(): void {
	if (!selectedSavedSelection.value) return;
	run(
		{
			type: "selection.load",
			name: selectedSavedSelection.value,
			combine: loadSelectionMode.value,
		},
		"Load Selection",
	);
}

function openDialog(kind: PsdDialogKind): void {
	editor.dialog.value = kind;
}

async function openFile(files: File[]): Promise<void> {
	const file = files[0];
	if (!file) return;
	await editor.load(file, file.name);
}

function fillWithForeground(): void {
	if (!active.value) return;
	const rect = editor.marquee.value;
	const hex = editor.foreground.value.replace("#", "");
	const value = Number.parseInt(hex, 16);
	run(
		{
			type: "fill.apply",
			layerId: active.value.id,
			color: { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 },
			...(rect && !editor.selection.value ? { rect: { ...rect } } : {}),
		} as PsdEditorAction,
		"Fill",
	);
}

function deleteSelectionOrLayer(): void {
	const layer = active.value;
	if (!layer) return;
	if (editor.selection.value && layer.kind !== "group") {
		run(
			{ type: "layer.clearSelected", layerId: layer.id } as PsdEditorAction,
			"Clear Selected Pixels",
		);
		return;
	}
	run({ type: "layer.delete", layerIds: [layer.id] } as PsdEditorAction, "Delete Layer");
}

const blendMode = computed({
	get: () => active.value?.blendMode ?? "normal",
	set(value: string) {
		if (!active.value || !isPsdBlendMode(value)) return;
		run(
			{ type: "layer.setBlendMode", layerId: active.value.id, blendMode: value },
			"Blend Mode",
		);
	},
});

// --- contextual text tab ---

const textOpacityDraft = ref<number | string>(100);
const textLayerLocked = computed(
	() =>
		disabled.value ||
		active.value?.kind !== "text" ||
		Boolean(active.value.locks.all || active.value.locks.composite),
);

watch(
	() => [active.value?.id, editor.revision.value] as const,
	() => {
		const layer = active.value;
		if (layer?.kind !== "text") return;
		textOpacityDraft.value = Math.round(layer.opacity * 100);
	},
	{ immediate: true },
);

const fallbackTextStyle: PsdTextStyle = {
	fontFamily: "Arial",
	fontSize: 32,
	bold: false,
	italic: false,
	underline: false,
	strikethrough: false,
	color: { r: 255, g: 255, b: 255 },
};
const textStyle = computed(() => {
	const layer = active.value;
	return layer?.kind === "text" ? resolvedPsdTextStyle(layer) : fallbackTextStyle;
});
const textFontFamily = computed(() => {
	const layer = active.value;
	return layer?.kind === "text" && !layer.text.style
		? "Original PSD"
		: textStyle.value.fontFamily;
});
const textColor = computed(() => rgbToHex(textStyle.value.color));
const standardFontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
const textFontSizeItems = computed<UiDropdownItem[]>(() => {
	const current = textStyle.value.fontSize;
	return [...new Set([...standardFontSizes, current])]
		.sort((left, right) => left - right)
		.map((size) => ({
			id: String(size),
			label: String(size),
			checked: size === current,
		}));
});

function applyTextStyle(patch: Partial<PsdTextStyle>, label: string): void {
	const layer = active.value;
	if (layer?.kind !== "text" || textLayerLocked.value) return;
	const current = resolvedPsdTextStyle(layer);
	const style: PsdTextStyle = {
		...current,
		...patch,
		color: patch.color ? { ...patch.color } : { ...current.color },
	};
	run(
		{
			type: "text.setStyle",
			layerId: layer.id,
			style,
		} as PsdEditorAction,
		label,
	);
}

function selectTextFontFamily(fontFamily: string): void {
	if (fontFamily === "Original PSD") return;
	applyTextStyle({ fontFamily }, "Text Font");
}

function selectTextFontSize(item: UiDropdownItem): void {
	const fontSize = Number(item.id);
	if (!Number.isFinite(fontSize)) return;
	applyTextStyle({ fontSize }, "Text Size");
}

function applyTextOpacity(): void {
	const layer = active.value;
	if (layer?.kind !== "text" || textLayerLocked.value) return;
	const percent = Math.min(100, Math.max(0, Math.round(Number(textOpacityDraft.value))));
	if (!Number.isFinite(percent)) {
		textOpacityDraft.value = Math.round(layer.opacity * 100);
		return;
	}
	textOpacityDraft.value = percent;
	const opacity = percent / 100;
	if (opacity === layer.opacity) return;
	run({ type: "layer.setOpacity", layerId: layer.id, opacity }, "Text Opacity");
}

function cropToSelection(): void {
	const rect = editor.marquee.value;
	if (!rect) return;
	editor.apply(
		[
			{ type: "canvas.crop", x: rect.x, y: rect.y, width: rect.width, height: rect.height },
		] as PsdEditorAction[],
		"Crop",
	);
}

const ADJUSTMENT_DIALOGS: Array<{
	kind: PsdDialogKind;
	label: string;
	icon: UiIconName;
}> = [
	{ kind: "levels", label: "Levels", icon: "chart-area" },
	{ kind: "brightness-contrast", label: "Brightness…", icon: "contrast" },
	{ kind: "hue-saturation", label: "Hue / Sat…", icon: "palette" },
	{ kind: "color-balance", label: "Color Balance", icon: "distribute-horizontal" },
	{ kind: "exposure", label: "Exposure", icon: "image" },
	{ kind: "vibrance", label: "Vibrance", icon: "sparkles" },
	{ kind: "black-white", label: "Black & White", icon: "clear-formatting" },
];

const FILTER_DIALOGS: Array<{ kind: PsdDialogKind; label: string; icon: UiIconName }> = [
	{ kind: "remove-background", label: "Remove Background", icon: "image" },
	{ kind: "gaussian-blur", label: "Gaussian Blur", icon: "shape-cloud" },
	{ kind: "motion-blur", label: "Motion Blur", icon: "shape-cloud" },
	{ kind: "lens-correction", label: "Lens Correction", icon: "image" },
	{ kind: "sharpen", label: "Sharpen", icon: "inspect" },
	{ kind: "noise", label: "Add Noise", icon: "chart-radar" },
	{ kind: "pixelate", label: "Pixelate", icon: "sorter-view" },
	{ kind: "threshold", label: "Threshold", icon: "contrast" },
	{ kind: "posterize", label: "Posterize", icon: "palette" },
];
</script>

<template>
	<div class="als-ofs-psd-ribbon">
		<UiInputDialog
			v-model="saveSelectionOpen"
			:value="savedSelectionName"
			description="Store the current selection as a reusable named selection in this editing session."
			label="Name"
			input-aria-label="Saved selection name"
			placeholder="Selection name"
			required
			title="Save Selection"
			@confirm="saveSelection"
			@update:value="savedSelectionName = $event"
		/>
		<template v-if="props.activeTab === 'home'">
			<UiRibbonGroup label="File">
				<UiFileButton
					accept=".psd,image/*"
					:disabled="editor.loading.value"
					icon="open-file"
					label="Open"
					presentation="ribbon"
					ribbon-size="lg"
					@select="openFile"
				/>
				<UiRibbonCommandButton
					:disabled="disabled || !editor.document.value"
					icon="save"
					label="Save"
					size="lg"
					@activate="editor.savePsd()"
				/>
				<UiRibbonCommandButton :disabled="disabled || !editor.document.value" icon="save" label="Save As" size="sm" @activate="editor.saveAsOpen.value = true" />
				<UiRibbonCommandButton
					:disabled="!editor.document.value"
					icon="export-file"
					label="Export"
					size="lg"
					@activate="openDialog('export')"
				/>
			</UiRibbonGroup>
			<UiRibbonGroup label="Layer">
				<UiRibbonCommandButton
					icon="plus"
					label="New layer"
					size="sm"
					:disabled="disabled"
					@activate="
						run({ type: 'layer.add', name: 'Layer' } as PsdEditorAction, 'New Layer')
					"
				/>
				<UiRibbonCommandButton
					icon="duplicate"
					label="Duplicate"
					size="sm"
					:disabled="noLayer"
					@activate="
						run(
							{ type: 'layer.duplicate', layerId: active!.id } as PsdEditorAction,
							'Duplicate',
						)
					"
				/>
				<UiRibbonCommandButton
					icon="trash"
					label="Delete"
					size="sm"
					tone="danger"
					:disabled="noLayer"
					:title="
						editor.selection.value && active?.kind !== 'group'
							? 'Clear pixels inside the selection'
							: 'Delete the active layer'
					"
					@activate="deleteSelectionOrLayer"
				/>
			</UiRibbonGroup>
			<UiRibbonGroup label="Color">
				<UiColorPicker
					v-model="editor.foreground.value"
					label="Foreground"
					show-label
					:disabled="disabled"
				/>
				<UiRibbonCommandButton
					icon="palette"
					label="Fill"
					size="sm"
					:disabled="noPixelLayer"
					title="Fill the layer (or selection) with the foreground color"
					@activate="fillWithForeground"
				/>
			</UiRibbonGroup>
			<UiRibbonGroup label="Adjustments">
				<UiRibbonCommandButton
					v-for="entry in ADJUSTMENT_DIALOGS"
					:key="entry.kind"
					:icon="entry.icon"
					:label="entry.label"
					size="sm"
					:disabled="noPixelLayer"
					@activate="openDialog(entry.kind)"
				/>
				<UiRibbonCommandButton
					icon="effects"
					label="Invert"
					size="sm"
					:disabled="noPixelLayer"
					@activate="
						run(
							{
								type: 'adjustment.apply',
								layerId: active!.id,
								kind: 'invert',
							} as PsdEditorAction,
							'Invert',
						)
					"
				/>
				<UiRibbonCommandButton
					icon="color"
					label="Grayscale"
					size="sm"
					:disabled="noPixelLayer"
					@activate="
						run(
							{
								type: 'adjustment.apply',
								layerId: active!.id,
								kind: 'grayscale',
							} as PsdEditorAction,
							'Grayscale',
						)
					"
				/>
			</UiRibbonGroup>
		</template>

		<template v-else-if="props.activeTab === 'layer'">
			<UiRibbonGroup label="Transform"
				><UiRibbonCommandButton
					label="Transform Selected"
					icon="image"
					:disabled="disabled || !editor.selectedLayerIds.value.length"
					@activate="openDialog('transform-selection')"
			/></UiRibbonGroup>
			<UiRibbonGroup label="Organize">
				<UiRibbonCommandButton
					icon="group"
					label="Group"
					size="sm"
					:disabled="disabled || !editor.selectedLayerIds.value.length"
					@activate="
						run(
							{
								type: 'layer.group',
								layerIds: [...editor.selectedLayerIds.value],
							} as PsdEditorAction,
							'Group',
						)
					"
				/>
				<UiRibbonCommandButton
					icon="ungroup"
					label="Ungroup"
					size="sm"
					:disabled="noLayer || active?.kind !== 'group'"
					@activate="
						run(
							{ type: 'layer.ungroup', groupId: active!.id } as PsdEditorAction,
							'Ungroup',
						)
					"
				/>
				<UiRibbonCommandButton
					icon="merge-cells"
					:label="editor.selectedLayerIds.value.length > 1 ? 'Merge' : 'Merge Down'"
					size="sm"
					:disabled="noLayer"
					@activate="
						run(
							(editor.selectedLayerIds.value.length > 1 ? {
								type: 'layer.merge', layerIds: [...editor.selectedLayerIds.value],
							} : { type: 'layer.mergeDown', layerId: active!.id }) as PsdEditorAction,
							'Merge',
						)
					"
				/>
				<UiRibbonCommandButton
					icon="merge-cells"
					label="Merge visible"
					size="sm"
					:disabled="disabled"
					@activate="
						run({ type: 'layer.mergeVisible' } as PsdEditorAction, 'Merge Visible')
					"
				/>
				<UiRibbonCommandButton
					icon="layout"
					label="Flatten"
					size="sm"
					:disabled="disabled"
					@activate="run({ type: 'image.flatten' } as PsdEditorAction, 'Flatten')"
				/>
			</UiRibbonGroup>
			<UiRibbonGroup label="Blending">
				<UiRibbonField label="Mode" :control-width="140">
					<UiSelect
						v-model="blendMode"
						aria-label="Blend mode"
						:disabled="noLayer"
						:options="PSD_BLEND_MODE_OPTIONS"
					/>
				</UiRibbonField>
				<UiRibbonCommandButton
					icon="indent-increase"
					:label="active?.clipping ? 'Release clip' : 'Clipping mask'"
					size="sm"
					:active="active?.clipping"
					:disabled="noPixelLayer"
					title="Clip this layer to the coverage of the layer below it"
					@activate="
						run(
							{
								type: 'layer.setClipping',
								layerId: active!.id,
								clipping: !active!.clipping,
							} as PsdEditorAction,
							'Clipping Mask',
						)
					"
				/>
			</UiRibbonGroup>
			<UiRibbonGroup label="Convert">
				<UiRibbonCommandButton
					icon="text"
					label="Rasterize"
					size="sm"
					:disabled="noLayer || active?.kind !== 'text'"
					@activate="
						run(
							{ type: 'layer.rasterize', layerId: active!.id } as PsdEditorAction,
							'Rasterize',
						)
					"
				/>
				<UiRibbonCommandButton
					icon="duplicate"
					label="Layer via copy"
					size="sm"
					title="Copy the selected pixels into a new layer"
					:disabled="noPixelLayer || !editor.selection.value"
					@activate="
						run(
							{
								type: 'layer.fromSelection',
								sourceLayerId: active!.id,
							} as PsdEditorAction,
							'Layer Via Copy',
						)
					"
				/>
			</UiRibbonGroup>
			<UiRibbonGroup label="Styles">
				<UiRibbonCommandButton
					icon="effects"
					label="Drop shadow"
					size="sm"
					:disabled="noPixelLayer"
					@activate="openDialog('drop-shadow')"
				/>
				<UiRibbonCommandButton
					icon="shape"
					label="Stroke"
					size="sm"
					:disabled="noPixelLayer"
					@activate="openDialog('stroke-effect')"
				/>
				<UiRibbonCommandButton
					icon="sparkles"
					label="Outer glow"
					size="sm"
					:disabled="noPixelLayer"
					@activate="openDialog('outer-glow')"
				/>
			</UiRibbonGroup>
			<UiRibbonGroup label="Protect">
				<UiRibbonCommandButton
					:icon="active?.locks.all || active?.locks.composite ? 'lock' : 'unlock'"
					:label="active?.locks.all || active?.locks.composite ? 'Unlock' : 'Lock'"
					size="sm"
					:disabled="noLayer"
					@activate="
						run(
							{
								type: 'layer.setLocked',
								layerId: active!.id,
								locked: !(active!.locks.all || active!.locks.composite),
							} as PsdEditorAction,
							'Lock',
						)
					"
				/>
			</UiRibbonGroup>
		</template>

		<template v-else-if="props.activeTab === 'select'">
			<UiRibbonGroup label="Load from layer"
				><UiRibbonCommandButton
					label="Layer Pixels"
					icon="image"
					:disabled="
						!editor.activeLayer.value || editor.activeLayer.value.kind === 'group'
					"
					@activate="
						run(
							{
								type: 'selection.fromLayer',
								layerId: editor.activeLayer.value!.id,
								source: 'pixels',
							},
							'Load Layer Selection',
						)
					" /><UiRibbonCommandButton
					label="Mask Black Areas"
					icon="image"
					:disabled="!editor.activeLayer.value?.mask"
					@activate="
						run(
							{
								type: 'selection.fromLayer',
								layerId: editor.activeLayer.value!.id,
								source: 'mask-black',
							},
							'Load Mask Selection',
						)
					"
			/></UiRibbonGroup>
			<UiRibbonGroup label="Select">
				<UiRibbonCommandButton
					icon="crop-fit"
					label="All"
					size="sm"
					:disabled="disabled"
					@activate="run({ type: 'selection.all' } as PsdEditorAction, 'Select All')"
				/>
				<UiRibbonCommandButton
					icon="close"
					label="Deselect"
					size="sm"
					:disabled="noSelection"
					@activate="run({ type: 'selection.clear' } as PsdEditorAction, 'Deselect')"
				/>
				<UiRibbonCommandButton
					icon="contrast"
					label="Inverse"
					size="sm"
					:disabled="noSelection"
					@activate="run({ type: 'selection.invert' } as PsdEditorAction, 'Inverse')"
				/>
			</UiRibbonGroup>
			<UiRibbonGroup label="Marquee">
				<UiRibbonField label="Shape" :control-width="110">
					<UiSelect
						v-model="editor.marqueeShape.value"
						aria-label="Marquee shape"
						:options="[
							{ value: 'rectangle', label: 'Rectangle' },
							{ value: 'ellipse', label: 'Ellipse' },
						]"
					/>
				</UiRibbonField>
			</UiRibbonGroup>
			<UiRibbonGroup label="Refine">
				<UiRibbonField label="Feather (px)" :control-width="88">
					<UiInput
						v-model.number="editor.selectionFeather.value"
						aria-label="Selection feather radius in pixels"
						:max="250"
						:min="0"
						type="number"
					/>
				</UiRibbonField>
				<UiRibbonCommandButton
					icon="contrast"
					label="Apply feather"
					size="sm"
					:disabled="noSelection"
					@activate="applySelectionFeather"
				/>
			</UiRibbonGroup>
			<UiRibbonGroup label="Saved selections">
				<UiRibbonCommandButton
					icon="bookmark"
					label="Save selection"
					size="sm"
					:disabled="noSelection"
					title="Save a named selection in this editing session"
					@activate="beginSaveSelection"
				/>
				<UiRibbonField label="Saved" :control-width="132">
					<UiSelect
						v-model="selectedSavedSelection"
						aria-label="Saved selection"
						:disabled="!savedSelectionOptions.length"
						:options="savedSelectionOptions"
						placeholder="No saved selections"
					/>
				</UiRibbonField>
				<UiRibbonField label="Load as" :control-width="112">
					<UiSelect
						v-model="loadSelectionMode"
						aria-label="Load selection mode"
						:disabled="!savedSelectionOptions.length"
						:options="[
							{ value: 'replace', label: 'New selection' },
							{ value: 'add', label: 'Add' },
							{ value: 'subtract', label: 'Subtract' },
							{ value: 'intersect', label: 'Intersect' },
						]"
					/>
				</UiRibbonField>
				<UiRibbonCommandButton
					icon="session-file"
					label="Load"
					size="sm"
					:disabled="disabled || !selectedSavedSelection"
					@activate="loadSelection"
				/>
			</UiRibbonGroup>
		</template>

		<template v-else-if="props.activeTab === 'image'">
			<UiRibbonGroup label="Canvas">
				<UiRibbonCommandButton
					icon="page-setup"
					label="Canvas size"
					size="lg"
					:disabled="disabled || !editor.document.value"
					@activate="openDialog('canvas-size')"
				/>
				<UiRibbonCommandButton
					icon="match-size"
					label="Image size"
					size="lg"
					title="Resample the whole image"
					:disabled="disabled"
					@activate="openDialog('image-resize')"
				/>
				<UiRibbonCommandButton
					icon="crop-reset"
					label="Crop to selection"
					size="sm"
					:disabled="disabled || !editor.marquee.value"
					@activate="cropToSelection"
				/>
			</UiRibbonGroup>
			<UiRibbonGroup label="Rotate canvas">
				<UiRibbonCommandButton
					icon="rotate-right"
					label="90° CW"
					size="sm"
					:disabled="disabled"
					@activate="
						run(
							{ type: 'image.rotate', operation: 'rotate-90' } as PsdEditorAction,
							'Rotate',
						)
					"
				/>
				<UiRibbonCommandButton
					icon="rotate-left"
					label="90° CCW"
					size="sm"
					:disabled="disabled"
					@activate="
						run(
							{ type: 'image.rotate', operation: 'rotate-270' } as PsdEditorAction,
							'Rotate',
						)
					"
				/>
				<UiRibbonCommandButton
					icon="reload"
					label="180°"
					size="sm"
					:disabled="disabled"
					@activate="
						run(
							{ type: 'image.rotate', operation: 'rotate-180' } as PsdEditorAction,
							'Rotate',
						)
					"
				/>
				<UiRibbonCommandButton
					icon="distribute-horizontal"
					label="Flip H"
					size="sm"
					:disabled="disabled"
					@activate="
						run(
							{ type: 'image.flip', operation: 'flip-horizontal' } as PsdEditorAction,
							'Flip',
						)
					"
				/>
				<UiRibbonCommandButton
					icon="distribute-vertical"
					label="Flip V"
					size="sm"
					:disabled="disabled"
					@activate="
						run(
							{ type: 'image.flip', operation: 'flip-vertical' } as PsdEditorAction,
							'Flip',
						)
					"
				/>
			</UiRibbonGroup>
			<UiRibbonGroup label="Transform layer">
				<UiRibbonCommandButton
					icon="distribute-horizontal"
					label="Flip layer H"
					size="sm"
					:disabled="noPixelLayer"
					@activate="
						run(
							{
								type: 'transform.apply',
								layerId: active!.id,
								operation: 'flip-horizontal',
							} as PsdEditorAction,
							'Flip Layer',
						)
					"
				/>
				<UiRibbonCommandButton
					icon="distribute-vertical"
					label="Flip layer V"
					size="sm"
					:disabled="noPixelLayer"
					@activate="
						run(
							{
								type: 'transform.apply',
								layerId: active!.id,
								operation: 'flip-vertical',
							} as PsdEditorAction,
							'Flip Layer',
						)
					"
				/>
				<UiRibbonCommandButton
					icon="rotate-right"
					label="Rotate layer…"
					size="sm"
					:disabled="noPixelLayer"
					@activate="openDialog('rotate-layer')"
				/>
			</UiRibbonGroup>
		</template>

		<template v-else-if="props.activeTab === 'filter'">
			<UiRibbonGroup label="Filters">
				<UiRibbonCommandButton
					v-for="entry in FILTER_DIALOGS"
					:key="entry.kind"
					:icon="entry.icon"
					:label="entry.label"
					size="sm"
					:disabled="noPixelLayer"
					@activate="openDialog(entry.kind)"
				/>
			</UiRibbonGroup>
		</template>

		<template v-else-if="props.activeTab === 'text'">
			<UiRibbonGroup label="Font">
				<UiFontRibbonControls
					:bold="textStyle.bold"
					:color="textColor"
					:disabled="textLayerLocked"
					:font-family="textFontFamily"
					:font-size-items="textFontSizeItems"
					:font-size-label="String(textStyle.fontSize)"
					:italic="textStyle.italic"
					:strike="textStyle.strikethrough"
					:underline="textStyle.underline"
					@select-font="selectTextFontFamily"
					@select-font-size="selectTextFontSize"
					@toggle-bold="applyTextStyle({ bold: !textStyle.bold }, 'Bold')"
					@toggle-italic="applyTextStyle({ italic: !textStyle.italic }, 'Italic')"
					@toggle-strike="
						applyTextStyle({ strikethrough: !textStyle.strikethrough }, 'Strikethrough')
					"
					@toggle-underline="
						applyTextStyle({ underline: !textStyle.underline }, 'Underline')
					"
					@update-color="applyTextStyle({ color: hexToRgb($event) }, 'Text Color')"
				/>
			</UiRibbonGroup>
			<UiRibbonGroup class="als-ofs-psd-ribbon__text-format" label="Format">
				<UiRibbonField label="Opacity (%)" :control-width="196">
					<UiInput
						v-model="textOpacityDraft"
						aria-label="Text layer opacity percentage"
						:disabled="textLayerLocked"
						max="100"
						min="0"
						type="number"
						@change="applyTextOpacity"
						@keydown.enter.prevent="applyTextOpacity"
					/>
				</UiRibbonField>
				<UiRibbonField label="Blend" :control-width="196">
					<UiSelect
						v-model="blendMode"
						aria-label="Text layer blend mode"
						:disabled="textLayerLocked"
						:options="PSD_BLEND_MODE_OPTIONS"
					/>
				</UiRibbonField>
			</UiRibbonGroup>
			<UiRibbonGroup label="Convert">
				<UiRibbonCommandButton
					icon="text"
					label="Rasterize"
					size="lg"
					:disabled="textLayerLocked"
					title="Convert this text layer to pixels"
					@activate="
						run(
							{ type: 'layer.rasterize', layerId: active!.id } as PsdEditorAction,
							'Rasterize',
						)
					"
				/>
			</UiRibbonGroup>
		</template>

		<template v-else-if="props.activeTab === 'view'">
			<UiRibbonGroup label="Canvas">
				<UiRibbonCommandButton label="Pixel Grid" icon="table" :active="editor.showPixelGrid.value" title="Show pixel grid at 800% and above" @activate="editor.showPixelGrid.value = !editor.showPixelGrid.value" />
			</UiRibbonGroup>
			<UiRibbonGroup class="als-ofs-psd-ribbon__panels" label="Panels">
				<UiRibbonCommandButton
					v-for="pane in PSD_PANE_DEFINITIONS"
					:key="pane.id"
					:active="paneState.visibility[pane.id]"
					:icon="pane.icon"
					:label="pane.label"
					size="lg"
					:title="`${paneState.visibility[pane.id] ? 'Hide' : 'Show'} ${pane.label} pane`"
					@activate="paneState.togglePane(pane.id)"
				/>
			</UiRibbonGroup>
		</template>
	</div>
</template>
