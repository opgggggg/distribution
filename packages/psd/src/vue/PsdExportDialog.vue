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
	UiSlider,
} from "@yaochn/als-office-editor-ui/vue";
import {
	downloadPsdExport,
	exportPsdBitmap,
	psdBitmapPreviewUrl,
	type PsdRasterExportFormat,
} from "./psd-bitmap-export";
import { usePsdEditorContext } from "./psd-editor-context";

const editor = usePsdEditorContext();
const format = editor.exportFormat;
const quality = ref(90);
const transparency = ref(true);
const targetWidth = ref(1);
const targetHeight = ref(1);
const constrainProportions = ref(true);
const previewUrl = ref("");
const busy = ref(false);
const exportError = ref("");

const formatOptions = [
	{ value: "png", label: "PNG" },
	{ value: "jpeg", label: "JPEG" },
	{ value: "webp", label: "WebP" },
];
const documentSize = computed(() => {
	const document = editor.document.value;
	return document ? { width: document.width, height: document.height } : null;
});
const aspectRatio = computed(() => {
	const current = documentSize.value;
	return current ? current.width / current.height : 1;
});
const open = computed({
	get: () => editor.dialog.value === "export",
	set(value: boolean) {
		if (!value && editor.dialog.value === "export") editor.dialog.value = null;
	},
});

const widthInput = computed<number | string>({
	get: () => Math.round(targetWidth.value),
	set(value) {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return;
		targetWidth.value = numeric;
		if (constrainProportions.value) targetHeight.value = numeric / aspectRatio.value;
	},
});
const heightInput = computed<number | string>({
	get: () => Math.round(targetHeight.value),
	set(value) {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return;
		targetHeight.value = numeric;
		if (constrainProportions.value) targetWidth.value = numeric * aspectRatio.value;
	},
});
const roundedTarget = computed(() => ({
	width: Math.round(targetWidth.value),
	height: Math.round(targetHeight.value),
}));
const supportsTransparency = computed(() => format.value !== "jpeg");
const extension = computed(() => (format.value === "jpeg" ? ".jpg" : `.${format.value}`));
const outputFileName = computed(() => {
	const stem = editor.fileName.value.replace(/\.[^./\\]+$/, "") || "untitled";
	return `${stem}${extension.value}`;
});
const errorMessage = computed(() => {
	const { width, height } = roundedTarget.value;
	if (!Number.isFinite(width) || !Number.isFinite(height)) return "Enter a valid export size.";
	if (width < 1 || height < 1) return "Export width and height must be at least 1 pixel.";
	if (width > 30_000 || height > 30_000)
		return "Export width and height cannot exceed 30,000 pixels.";
	return "";
});

watch(
	() => editor.dialog.value,
	(kind) => {
		if (kind !== "export" || !documentSize.value) return;
		format.value = "png";
		quality.value = 90;
		transparency.value = true;
		targetWidth.value = documentSize.value.width;
		targetHeight.value = documentSize.value.height;
		constrainProportions.value = true;
		exportError.value = "";
		const bitmap = editor.composite();
		previewUrl.value = bitmap ? psdBitmapPreviewUrl(bitmap, 420, 320) : "";
	},
);

async function exportImage(): Promise<void> {
	const bitmap = editor.composite();
	if (!bitmap || errorMessage.value || busy.value) return;
	busy.value = true;
	exportError.value = "";
	try {
		const blob = await exportPsdBitmap(bitmap, {
			format: format.value,
			width: roundedTarget.value.width,
			height: roundedTarget.value.height,
			quality: quality.value / 100,
			matte:
				!supportsTransparency.value || !transparency.value
					? editor.background.value
					: undefined,
		});
		downloadPsdExport(blob, outputFileName.value);
		editor.dialog.value = null;
	} catch (cause) {
		exportError.value = cause instanceof Error ? cause.message : String(cause);
	} finally {
		busy.value = false;
	}
}
</script>

<template>
	<UiDialog
		v-model="open"
		title="Export As"
		description="Create a flattened image copy while keeping the editable PSD unchanged."
		initial-focus=".als-ofs-psd-export-dialog .als-ofs-ui-dropdown__trigger"
		size="xl"
	>
		<div class="als-ofs-psd-export-dialog">
			<div class="als-ofs-psd-export-dialog__preview-column">
				<div class="als-ofs-psd-image-preview als-ofs-psd-export-dialog__preview">
					<img v-if="previewUrl" :src="previewUrl" alt="Flattened export preview" />
				</div>
				<div class="als-ofs-psd-export-dialog__asset-summary">
					<strong>{{ outputFileName }}</strong>
					<span
						>{{ roundedTarget.width }} × {{ roundedTarget.height }} px ·
						{{ format.toUpperCase() }}</span
					>
				</div>
			</div>

			<div class="als-ofs-psd-export-dialog__settings">
				<section
					class="als-ofs-psd-size-dialog__section"
					aria-labelledby="export-file-title"
				>
					<h3 id="export-file-title">File settings</h3>
					<UiField label="Format" label-id="export-format-label" full-width>
						<UiSelect
							v-model="format"
							aria-label="Export format"
							:options="formatOptions"
						/>
					</UiField>
					<UiSlider
						v-if="format !== 'png'"
						v-model="quality"
						label="Quality"
						:min="1"
						:max="100"
						:output="`${Math.round(quality)}%`"
					/>
					<UiCheckbox
						v-if="supportsTransparency"
						v-model="transparency"
						label="Transparency"
					/>
					<p v-else class="als-ofs-psd-size-dialog__hint">
						JPEG does not support transparency; transparent pixels use the background
						color.
					</p>
				</section>

				<section
					class="als-ofs-psd-size-dialog__section"
					aria-labelledby="export-size-title"
				>
					<h3 id="export-size-title">Image size</h3>
					<UiFormGrid>
						<UiField label="Width (px)" label-id="export-width-label">
							<UiInput
								v-model="widthInput"
								aria-labelledby="export-width-label"
								type="number"
								min="1"
								max="30000"
							/>
						</UiField>
						<UiField label="Height (px)" label-id="export-height-label">
							<UiInput
								v-model="heightInput"
								aria-labelledby="export-height-label"
								type="number"
								min="1"
								max="30000"
							/>
						</UiField>
					</UiFormGrid>
					<UiCheckbox v-model="constrainProportions" label="Constrain proportions" />
					<p v-if="errorMessage" class="als-ofs-psd-size-dialog__error" role="alert">
						{{ errorMessage }}
					</p>
				</section>

				<p v-if="exportError" class="als-ofs-psd-size-dialog__error" role="alert">
					{{ exportError }}
				</p>
			</div>
		</div>
		<template #footer>
			<UiButton :disabled="busy" @click="open = false">Cancel</UiButton>
			<UiButton kind="primary" :disabled="busy || Boolean(errorMessage)" @click="exportImage">
				{{ busy ? "Exporting…" : "Export" }}
			</UiButton>
		</template>
	</UiDialog>
</template>
