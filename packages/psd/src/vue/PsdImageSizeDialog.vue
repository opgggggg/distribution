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
import type { PsdEditorAction } from "@cubexp/psd";
import { psdBitmapPreviewUrl } from "./psd-bitmap-export";
import { usePsdEditorContext } from "./psd-editor-context";

type ImageSizeUnit = "pixels" | "percent";

const editor = usePsdEditorContext();
const targetWidth = ref(1);
const targetHeight = ref(1);
const unit = ref<ImageSizeUnit>("pixels");
const constrainProportions = ref(true);
const previewUrl = ref("");

const unitOptions = [
	{ value: "pixels", label: "Pixels" },
	{ value: "percent", label: "Percent" },
];
const documentSize = computed(() => {
	const document = editor.document.value;
	return document ? { width: document.width, height: document.height } : null;
});
const resolution = computed(() => editor.document.value?.resolutionPpi ?? 72);
const aspectRatio = computed(() => {
	const current = documentSize.value;
	return current ? current.width / current.height : 1;
});
const open = computed({
	get: () => editor.dialog.value === "image-resize",
	set(value: boolean) {
		if (!value && editor.dialog.value === "image-resize") editor.dialog.value = null;
	},
});

function displayNumber(value: number): number {
	return Number(value.toFixed(unit.value === "pixels" ? 0 : 2));
}

const widthInput = computed<number | string>({
	get() {
		const currentWidth = documentSize.value?.width ?? 1;
		return displayNumber(
			unit.value === "percent" ? (targetWidth.value / currentWidth) * 100 : targetWidth.value,
		);
	},
	set(value) {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return;
		const currentWidth = documentSize.value?.width ?? 1;
		targetWidth.value = unit.value === "percent" ? (currentWidth * numeric) / 100 : numeric;
		if (constrainProportions.value) targetHeight.value = targetWidth.value / aspectRatio.value;
	},
});

const heightInput = computed<number | string>({
	get() {
		const currentHeight = documentSize.value?.height ?? 1;
		return displayNumber(
			unit.value === "percent"
				? (targetHeight.value / currentHeight) * 100
				: targetHeight.value,
		);
	},
	set(value) {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return;
		const currentHeight = documentSize.value?.height ?? 1;
		targetHeight.value = unit.value === "percent" ? (currentHeight * numeric) / 100 : numeric;
		if (constrainProportions.value) targetWidth.value = targetHeight.value * aspectRatio.value;
	},
});

const roundedTarget = computed(() => ({
	width: Math.round(targetWidth.value),
	height: Math.round(targetHeight.value),
}));
const estimatedMemory = computed(() =>
	formatBytes(roundedTarget.value.width * roundedTarget.value.height * 4),
);
const errorMessage = computed(() => {
	const { width, height } = roundedTarget.value;
	if (!Number.isFinite(width) || !Number.isFinite(height)) return "Enter a valid image size.";
	if (width < 1 || height < 1) return "Image width and height must be at least 1 pixel.";
	if (width > 30_000 || height > 30_000)
		return "Image width and height cannot exceed 30,000 pixels.";
	return "";
});
const unchanged = computed(
	() =>
		roundedTarget.value.width === documentSize.value?.width &&
		roundedTarget.value.height === documentSize.value?.height,
);

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	if (bytes < 1024) return `${Math.round(bytes)} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

watch(
	() => editor.dialog.value,
	(kind) => {
		if (kind !== "image-resize" || !documentSize.value) return;
		targetWidth.value = documentSize.value.width;
		targetHeight.value = documentSize.value.height;
		unit.value = "pixels";
		constrainProportions.value = true;
		const bitmap = editor.composite();
		previewUrl.value = bitmap ? psdBitmapPreviewUrl(bitmap, 360, 260) : "";
	},
);

function apply(): void {
	if (!documentSize.value || errorMessage.value) return;
	const { width, height } = roundedTarget.value;
	editor.apply([{ type: "image.resize", width, height } as PsdEditorAction], "Image Size");
	editor.dialog.value = null;
}
</script>

<template>
	<UiDialog
		v-model="open"
		title="Image Size"
		description="Change pixel dimensions by resampling the image and all layers."
		initial-focus="#als-ofs-psd-image-width"
		size="lg"
	>
		<div class="als-ofs-psd-image-size-dialog">
			<div class="als-ofs-psd-image-size-dialog__preview">
				<div class="als-ofs-psd-image-preview">
					<img
						v-if="previewUrl"
						:src="previewUrl"
						alt="Current flattened image preview"
					/>
				</div>
				<div class="als-ofs-psd-image-size-dialog__preview-meta">
					<strong>{{ documentSize?.width }} × {{ documentSize?.height }} px</strong>
					<span>Current pixel dimensions</span>
				</div>
			</div>

			<div class="als-ofs-psd-image-size-dialog__settings">
				<section
					class="als-ofs-psd-size-dialog__section"
					aria-labelledby="image-dimensions-title"
				>
					<div class="als-ofs-psd-size-dialog__section-heading">
						<h3 id="image-dimensions-title">Dimensions</h3>
						<span>{{ estimatedMemory }}</span>
					</div>
					<UiFormGrid>
						<UiField label="Width" label-id="image-width-label">
							<UiInput
								id="als-ofs-psd-image-width"
								v-model="widthInput"
								aria-labelledby="image-width-label"
								type="number"
								step="any"
							/>
						</UiField>
						<UiField label="Height" label-id="image-height-label">
							<UiInput
								v-model="heightInput"
								aria-labelledby="image-height-label"
								type="number"
								step="any"
							/>
						</UiField>
						<UiField label="Units" label-id="image-units-label" full-width>
							<UiSelect
								v-model="unit"
								aria-label="Image size units"
								:options="unitOptions"
							/>
						</UiField>
					</UiFormGrid>
					<UiCheckbox v-model="constrainProportions" label="Constrain proportions" />
					<p v-if="errorMessage" class="als-ofs-psd-size-dialog__error" role="alert">
						{{ errorMessage }}
					</p>
				</section>

				<section
					class="als-ofs-psd-size-dialog__section"
					aria-labelledby="image-output-title"
				>
					<h3 id="image-output-title">Output</h3>
					<dl class="als-ofs-psd-size-dialog__details">
						<div>
							<dt>Result</dt>
							<dd>{{ roundedTarget.width }} × {{ roundedTarget.height }} px</dd>
						</div>
						<div>
							<dt>Resolution</dt>
							<dd>{{ Math.round(resolution) }} pixels/inch</dd>
						</div>
						<div>
							<dt>Resample</dt>
							<dd>Bilinear</dd>
						</div>
					</dl>
					<p class="als-ofs-psd-size-dialog__hint">
						Resampling changes pixel data. Use Canvas Size when you only need more or
						less workspace.
					</p>
				</section>
			</div>
		</div>
		<template #footer>
			<UiButton @click="open = false">Cancel</UiButton>
			<UiButton kind="primary" :disabled="Boolean(errorMessage) || unchanged" @click="apply">
				OK
			</UiButton>
		</template>
	</UiDialog>
</template>
