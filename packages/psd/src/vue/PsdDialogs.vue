<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { UiButton, UiDialog, UiSlider, UiCheckbox } from "@yaochn/als-office-editor-ui/vue";
import { PsdEditorSession, cloneDocumentStructure, type PsdEditorAction } from "@cubexp/psd";
import PsdBackgroundDialog from "./PsdBackgroundDialog.vue";
import PsdTransformSelectionDialog from "./PsdTransformSelectionDialog.vue";
import PsdCanvasSizeDialog from "./PsdCanvasSizeDialog.vue";
import PsdExportDialog from "./PsdExportDialog.vue";
import PsdImageSizeDialog from "./PsdImageSizeDialog.vue";
import type { PsdDialogKind } from "./component-types";
import { usePsdEditorContext } from "./psd-editor-context";

/**
 * One generic slider dialog serves every parameterized command: adjustments,
 * filters, layer styles, and image resize. The table declares the sliders;
 * `build` turns values into an action.
 */

const editor = usePsdEditorContext();

interface SliderSpec {
	key: string;
	label: string;
	min: number;
	max: number;
	step?: number;
	value: number;
}

interface DialogSpec {
	title: string;
	sliders: SliderSpec[];
	build(values: Record<string, number>, layerId: string): PsdEditorAction;
	/** "image" dialogs need no layer. */
	scope?: "layer" | "image";
	label: string;
}

type GenericDialogKind = Exclude<
	PsdDialogKind,
	"canvas-size" | "image-resize" | "export" | "transform-selection" | "remove-background"
>;

function adjustment(kind: string, title: string, label: string, sliders: SliderSpec[]): DialogSpec {
	return {
		title,
		sliders,
		label,
		build: (values, layerId) =>
			({ type: "adjustment.apply", layerId, kind, params: values }) as PsdEditorAction,
	};
}

function filter(kind: string, title: string, label: string, sliders: SliderSpec[]): DialogSpec {
	return {
		title,
		sliders,
		label,
		build: (values, layerId) =>
			({ type: "filter.apply", layerId, kind, params: values }) as PsdEditorAction,
	};
}

function effect(kind: string, title: string, sliders: SliderSpec[]): DialogSpec {
	return {
		title,
		sliders,
		label: title,
		build: (values, layerId) => {
			const { opacityPercent, ...rest } = values;
			return {
				type: "effect.apply",
				layerId,
				kind,
				params: {
					...rest,
					...(opacityPercent !== undefined ? { opacity: opacityPercent / 100 } : {}),
					color: hexColor(),
				},
			} as PsdEditorAction;
		},
	};
}

function hexColor(): { r: number; g: number; b: number } {
	const hex = editor.foreground.value.replace("#", "");
	const value = Number.parseInt(hex, 16) || 0;
	return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

const DIALOGS: Record<GenericDialogKind, DialogSpec> = {
	"motion-blur": filter("motion-blur", "Motion Blur", "Motion Blur", [
		{ key: "distance", label: "Distance", min: 0, max: 500, value: 20 },
		{ key: "angle", label: "Angle", min: -180, max: 180, value: 0 },
	]),
	"lens-correction": filter("lens-correction", "Lens Correction", "Lens Correction", [
		{ key: "distortion", label: "Remove distortion", min: -100, max: 100, value: 0 },
	]),
	levels: adjustment("levels", "Levels", "Levels", [
		{ key: "inBlack", label: "Input black", min: 0, max: 254, value: 0 },
		{ key: "inWhite", label: "Input white", min: 1, max: 255, value: 255 },
		{ key: "gamma", label: "Gamma ×100", min: 10, max: 1000, value: 100 },
		{ key: "outBlack", label: "Output black", min: 0, max: 255, value: 0 },
		{ key: "outWhite", label: "Output white", min: 0, max: 255, value: 255 },
	]),
	"brightness-contrast": adjustment(
		"brightness-contrast",
		"Brightness / Contrast",
		"Brightness",
		[
			{ key: "brightness", label: "Brightness", min: -100, max: 100, value: 0 },
			{ key: "contrast", label: "Contrast", min: -100, max: 100, value: 0 },
		],
	),
	"hue-saturation": adjustment("hue-saturation", "Hue / Saturation", "Hue/Saturation", [
		{ key: "hue", label: "Hue", min: -180, max: 180, value: 0 },
		{ key: "saturation", label: "Saturation", min: -100, max: 100, value: 0 },
		{ key: "lightness", label: "Lightness", min: -100, max: 100, value: 0 },
	]),
	"color-balance": adjustment("color-balance", "Color Balance", "Color Balance", [
		{ key: "cyanRed", label: "Cyan ↔ Red", min: -100, max: 100, value: 0 },
		{ key: "magentaGreen", label: "Magenta ↔ Green", min: -100, max: 100, value: 0 },
		{ key: "yellowBlue", label: "Yellow ↔ Blue", min: -100, max: 100, value: 0 },
	]),
	exposure: adjustment("exposure", "Exposure", "Exposure", [
		{ key: "exposure", label: "Exposure ×100", min: -500, max: 500, value: 0 },
		{ key: "offset", label: "Offset ×1000", min: -500, max: 500, value: 0 },
	]),
	vibrance: adjustment("vibrance", "Vibrance", "Vibrance", [
		{ key: "vibrance", label: "Vibrance", min: -100, max: 100, value: 30 },
	]),
	"black-white": adjustment("black-white", "Black & White", "Black & White", [
		{ key: "reds", label: "Reds", min: -100, max: 100, value: 0 },
		{ key: "greens", label: "Greens", min: -100, max: 100, value: 0 },
		{ key: "blues", label: "Blues", min: -100, max: 100, value: 0 },
	]),
	"gaussian-blur": filter("gaussian-blur", "Gaussian Blur", "Gaussian Blur", [
		{ key: "radius", label: "Radius", min: 1, max: 100, value: 4 },
	]),
	sharpen: filter("sharpen", "Sharpen (Unsharp Mask)", "Sharpen", [
		{ key: "radius", label: "Radius", min: 1, max: 50, value: 2 },
		{ key: "amount", label: "Amount %", min: 1, max: 500, value: 100 },
	]),
	noise: filter("noise", "Add Noise", "Noise", [
		{ key: "strength", label: "Strength", min: 1, max: 100, value: 10 },
	]),
	pixelate: filter("pixelate", "Pixelate (Mosaic)", "Pixelate", [
		{ key: "cellSize", label: "Cell size", min: 2, max: 100, value: 8 },
	]),
	threshold: filter("threshold", "Threshold", "Threshold", [
		{ key: "level", label: "Level", min: 1, max: 254, value: 128 },
	]),
	posterize: filter("posterize", "Posterize", "Posterize", [
		{ key: "levels", label: "Levels", min: 2, max: 32, value: 4 },
	]),
	"rotate-layer": {
		title: "Rotate Layer",
		label: "Rotate",
		sliders: [{ key: "degrees", label: "Degrees (clockwise)", min: -180, max: 180, value: 45 }],
		build: (values, layerId) =>
			({
				type: "transform.apply",
				layerId,
				operation: "rotate",
				degrees: values.degrees,
			}) as PsdEditorAction,
	},
	"drop-shadow": effect("drop-shadow", "Drop Shadow", [
		{ key: "offsetX", label: "Offset X", min: -100, max: 100, value: 4 },
		{ key: "offsetY", label: "Offset Y", min: -100, max: 100, value: 4 },
		{ key: "size", label: "Blur size", min: 1, max: 100, value: 8 },
		{ key: "opacityPercent", label: "Opacity %", min: 1, max: 100, value: 75 },
	]),
	"stroke-effect": effect("stroke", "Stroke (outline)", [
		{ key: "size", label: "Width", min: 1, max: 50, value: 3 },
		{ key: "opacityPercent", label: "Opacity %", min: 1, max: 100, value: 100 },
	]),
	"outer-glow": effect("outer-glow", "Outer Glow", [
		{ key: "size", label: "Size", min: 1, max: 100, value: 10 },
		{ key: "opacityPercent", label: "Opacity %", min: 1, max: 100, value: 75 },
	]),
};

function isGenericDialogKind(kind: PsdDialogKind): kind is GenericDialogKind {
	return (
		kind !== "remove-background" &&
		kind !== "transform-selection" &&
		kind !== "canvas-size" &&
		kind !== "image-resize" &&
		kind !== "export"
	);
}

const active = computed(() => {
	const kind = editor.dialog.value;
	return kind && isGenericDialogKind(kind) ? DIALOGS[kind] : null;
});
const values = ref<Record<string, number>>({});
const preview = ref(true),
	previewError = ref("");
let previewFrame: number | null = null;
function clearPreview() {
	if (previewFrame !== null) cancelAnimationFrame(previewFrame);
	previewFrame = null;
	editor.previewDocument.value = null;
}
function schedulePreview() {
	clearPreview();
	if (!active.value) return;
	previewFrame = requestAnimationFrame(() => {
		previewFrame = null;
		previewError.value = "";
		if (!preview.value || !editor.document.value) return;
		try {
			const action = buildAction();
			if (!action) return;
			const session = new PsdEditorSession(cloneDocumentStructure(editor.document.value));
			session.apply([action]);
			editor.previewDocument.value = session.peekDocument();
		} catch (e) {
			previewError.value = String(e);
		}
	});
}
watch([values, preview], schedulePreview, { deep: true });
onBeforeUnmount(clearPreview);

watch(
	() => editor.dialog.value,
	(kind) => {
		clearPreview();
		previewError.value = "";
		preview.value = true;
		if (!kind || !isGenericDialogKind(kind)) return;
		const spec = DIALOGS[kind];
		const next: Record<string, number> = {};
		for (const slider of spec.sliders) next[slider.key] = slider.value;
		values.value = next;
	},
);

const open = computed({
	get: () => active.value !== null,
	set(value: boolean) {
		if (!value && active.value) editor.dialog.value = null;
	},
});

function buildAction(): PsdEditorAction | undefined {
	const spec = active.value;
	if (!spec) return;
	const layer = editor.activeLayer.value;
	if (spec.scope !== "image" && (!layer || layer.kind === "group")) {
		editor.dialog.value = null;
		return;
	}
	const raw = { ...values.value };
	// Sliders are integer-friendly; rescale the ×100 / ×1000 entries.
	if (editor.dialog.value === "levels" && raw.gamma !== undefined) raw.gamma = raw.gamma / 100;
	if (editor.dialog.value === "exposure") {
		if (raw.exposure !== undefined) raw.exposure = raw.exposure / 100;
		if (raw.offset !== undefined) raw.offset = raw.offset / 1000;
	}
	return spec.build(raw, layer?.id ?? "");
}
function apply(): void {
	const action = buildAction(),
		spec = active.value;
	if (!action || !spec) return;
	clearPreview();
	if (editor.apply([action], spec.label)) editor.dialog.value = null;
	else previewError.value = editor.lastError.value;
}
</script>

<template>
	<PsdCanvasSizeDialog />
	<PsdTransformSelectionDialog /><PsdBackgroundDialog />
	<PsdImageSizeDialog />
	<PsdExportDialog />
	<UiDialog v-if="active" v-model="open" :title="active.title" size="sm">
		<div class="als-ofs-psd-dialog__body">
			<UiSlider
				v-for="slider in active.sliders"
				:key="slider.key"
				v-model="values[slider.key]"
				:label="slider.label"
				:min="slider.min"
				:max="slider.max"
				:step="slider.step ?? 1"
				:output="`${values[slider.key]}`"
			/>
			<UiCheckbox v-model="preview" label="Preview on canvas" />
			<p v-if="previewError" role="alert">{{ previewError }}</p>
		</div>
		<template #footer>
			<UiButton @click="open = false">Cancel</UiButton>
			<UiButton kind="primary" @click="apply">Apply</UiButton>
		</template>
	</UiDialog>
</template>
