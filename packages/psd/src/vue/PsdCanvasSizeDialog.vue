<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
	UiButton,
	UiCheckbox,
	UiDialog,
	UiField,
	UiFormGrid,
	UiInput,
	UiSelect,
} from "@yaochn/als-office-editor-ui/vue";
import type { PsdCanvasAnchor, PsdEditorAction } from "@cubexp/psd";
import { usePsdEditorContext } from "./psd-editor-context";

type SizeUnit = "pixels" | "inches" | "centimeters" | "millimeters";
const editor = usePsdEditorContext();
const targetWidth = ref(1);
const targetHeight = ref(1);
const relative = ref(false);
const unit = ref<SizeUnit>("pixels");
const anchor = ref<PsdCanvasAnchor>("center");

const unitOptions = [
	{ value: "pixels", label: "Pixels" },
	{ value: "inches", label: "Inches" },
	{ value: "centimeters", label: "Centimeters" },
	{ value: "millimeters", label: "Millimeters" },
];

const anchors: Array<{ id: PsdCanvasAnchor; label: string }> = [
	{ id: "top-left", label: "Anchor existing image at top left" },
	{ id: "top-center", label: "Anchor existing image at top center" },
	{ id: "top-right", label: "Anchor existing image at top right" },
	{ id: "middle-left", label: "Anchor existing image at middle left" },
	{ id: "center", label: "Anchor existing image at center" },
	{ id: "middle-right", label: "Anchor existing image at middle right" },
	{ id: "bottom-left", label: "Anchor existing image at bottom left" },
	{ id: "bottom-center", label: "Anchor existing image at bottom center" },
	{ id: "bottom-right", label: "Anchor existing image at bottom right" },
];

const documentSize = computed(() => {
	const document = editor.document.value;
	return document ? { width: document.width, height: document.height } : null;
});
const resolution = computed(() => editor.document.value?.resolutionPpi ?? 72);
const open = computed({
	get: () => editor.dialog.value === "canvas-size",
	set(value: boolean) {
		if (!value && editor.dialog.value === "canvas-size") editor.dialog.value = null;
	},
});

function unitFactor(): number {
	switch (unit.value) {
		case "inches":
			return resolution.value;
		case "centimeters":
			return resolution.value / 2.54;
		case "millimeters":
			return resolution.value / 25.4;
		default:
			return 1;
	}
}

function displayNumber(value: number): number {
	return Number(value.toFixed(unit.value === "pixels" ? 0 : 3));
}

const widthInput = computed<number | string>({
	get() {
		const current = documentSize.value?.width ?? 0;
		return displayNumber(
			(relative.value ? targetWidth.value - current : targetWidth.value) / unitFactor(),
		);
	},
	set(value) {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return;
		const current = documentSize.value?.width ?? 0;
		targetWidth.value = (relative.value ? current : 0) + numeric * unitFactor();
	},
});

const heightInput = computed<number | string>({
	get() {
		const current = documentSize.value?.height ?? 0;
		return displayNumber(
			(relative.value ? targetHeight.value - current : targetHeight.value) / unitFactor(),
		);
	},
	set(value) {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return;
		const current = documentSize.value?.height ?? 0;
		targetHeight.value = (relative.value ? current : 0) + numeric * unitFactor();
	},
});

const roundedTarget = computed(() => ({
	width: Math.round(targetWidth.value),
	height: Math.round(targetHeight.value),
}));
const errorMessage = computed(() => {
	const { width, height } = roundedTarget.value;
	if (!Number.isFinite(width) || !Number.isFinite(height)) return "Enter a valid canvas size.";
	if (width < 1 || height < 1) return "Canvas width and height must be at least 1 pixel.";
	if (width > 30_000 || height > 30_000)
		return "Canvas width and height cannot exceed 30,000 pixels.";
	return "";
});
const unchanged = computed(
	() =>
		roundedTarget.value.width === documentSize.value?.width &&
		roundedTarget.value.height === documentSize.value?.height,
);

watch(
	() => editor.dialog.value,
	(kind) => {
		if (kind !== "canvas-size" || !documentSize.value) return;
		targetWidth.value = documentSize.value.width;
		targetHeight.value = documentSize.value.height;
		relative.value = false;
		unit.value = "pixels";
		anchor.value = "center";
	},
);

function apply(): void {
	const current = documentSize.value;
	if (!current || errorMessage.value) return;
	const { width, height } = roundedTarget.value;
	editor.apply(
		[
			{
				type: "canvas.resize",
				width,
				height,
				anchor: anchor.value,
			} as PsdEditorAction,
		],
		"Canvas Size",
	);
	editor.dialog.value = null;
}
</script>

<template>
	<UiDialog
		v-model="open"
		title="Canvas Size"
		description="Change the editable canvas without resampling layer pixels."
		initial-focus="#als-ofs-psd-canvas-width"
		size="md"
	>
		<div class="als-ofs-psd-size-dialog">
			<section
				class="als-ofs-psd-size-dialog__section"
				aria-labelledby="canvas-current-title"
			>
				<h3 id="canvas-current-title">Current size</h3>
				<div class="als-ofs-psd-size-dialog__summary">
					<strong>{{ documentSize?.width }} × {{ documentSize?.height }} px</strong>
					<span>{{ Math.round(resolution) }} pixels/inch</span>
				</div>
			</section>

			<section class="als-ofs-psd-size-dialog__section" aria-labelledby="canvas-new-title">
				<div class="als-ofs-psd-size-dialog__section-heading">
					<h3 id="canvas-new-title">New size</h3>
					<UiCheckbox v-model="relative" label="Relative" />
				</div>
				<UiFormGrid>
					<UiField label="Width" label-id="canvas-width-label">
						<UiInput
							id="als-ofs-psd-canvas-width"
							v-model="widthInput"
							aria-labelledby="canvas-width-label"
							type="number"
							step="any"
						/>
					</UiField>
					<UiField label="Height" label-id="canvas-height-label">
						<UiInput
							v-model="heightInput"
							aria-labelledby="canvas-height-label"
							type="number"
							step="any"
						/>
					</UiField>
					<UiField label="Units" label-id="canvas-units-label" full-width>
						<UiSelect
							v-model="unit"
							aria-label="Canvas size units"
							:options="unitOptions"
						/>
					</UiField>
				</UiFormGrid>
				<p class="als-ofs-psd-size-dialog__result">
					Result: {{ roundedTarget.width }} × {{ roundedTarget.height }} px
				</p>
				<p v-if="errorMessage" class="als-ofs-psd-size-dialog__error" role="alert">
					{{ errorMessage }}
				</p>
			</section>

			<section class="als-ofs-psd-size-dialog__section" aria-labelledby="canvas-anchor-title">
				<h3 id="canvas-anchor-title">Anchor</h3>
				<div class="als-ofs-psd-canvas-anchor" role="group" aria-label="Canvas anchor">
					<button
						v-for="entry in anchors"
						:key="entry.id"
						type="button"
						:aria-label="entry.label"
						:aria-pressed="anchor === entry.id"
						:data-active="anchor === entry.id ? 'true' : undefined"
						@click="anchor = entry.id"
					>
						<span aria-hidden="true" />
					</button>
				</div>
				<p class="als-ofs-psd-size-dialog__hint">
					The anchor pins the existing image while transparent canvas is added or removed.
				</p>
			</section>
		</div>
		<template #footer>
			<UiButton @click="open = false">Cancel</UiButton>
			<UiButton kind="primary" :disabled="Boolean(errorMessage) || unchanged" @click="apply">
				OK
			</UiButton>
		</template>
	</UiDialog>
</template>
