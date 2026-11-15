<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { UiDialog, UiButton, UiCheckbox, UiSlider } from "@yaochn/als-office-editor-ui/vue";
import {
	PsdEditorSession,
	cloneDocumentStructure,
	psdBytesToBase64,
	type PsdEditorAction,
	type PsdBitmap,
} from "@cubexp/psd";
import { usePsdEditorContext } from "./psd-editor-context";
const editor = usePsdEditorContext(),
	advanced = ref(false),
	radius = ref(4),
	shift = ref(0),
	contrast = ref(0),
	preview = ref(true),
	busy = ref(false),
	error = ref("");
let source: PsdBitmap | null = null,
	layerId = "",
	revision = 0,
	serial = 0,
	timer: ReturnType<typeof setTimeout> | undefined,
	maskAction: PsdEditorAction | null = null;
const open = computed({
	get: () => editor.dialog.value === "remove-background",
	set: (v: boolean) => {
		if (!v && editor.dialog.value === "remove-background") editor.dialog.value = null;
	},
});
function clear() {
	serial++;
	clearTimeout(timer);
	editor.previewDocument.value = null;
	busy.value = false;
	maskAction = null;
}
function show() {
	editor.previewDocument.value = null;
	if (!preview.value || !maskAction) return;
	try {
		const session = new PsdEditorSession(cloneDocumentStructure(editor.document.value!));
		session.apply([maskAction]);
		editor.previewDocument.value = session.peekDocument();
	} catch (e) {
		error.value = String(e);
	}
}
function update() {
	clear();
	if (!open.value || !source) return;
	const service = editor.imageServices.value?.foregroundMask;
	if (!service) {
		error.value =
			"Connect a native image service to use foreground segmentation. macOS 14 or later is supported.";
		return;
	}
	const token = serial;
	busy.value = true;
	error.value = "";
	const image = source;
	timer = setTimeout(async () => {
		try {
			const data = await service(image, {
				advanced: advanced.value,
				refineEdges: radius.value,
				shiftEdge: shift.value,
				contrast: contrast.value,
			});
			if (token !== serial || !open.value) return;
			if (editor.revision.value !== revision)
				throw Error("The document changed. Reopen background removal.");
			maskAction = {
				type: "mask.set",
				layerId,
				width: image.width,
				height: image.height,
				dataBase64: psdBytesToBase64(data),
				combine: true,
				respectSelection: true,
			};
			show();
		} catch (e) {
			if (token === serial) error.value = String(e);
		} finally {
			if (token === serial) busy.value = false;
		}
	}, 180);
}
watch(open, (value) => {
	clear();
	if (!value) return;
	const layer = editor.activeLayer.value;
	if (!layer || layer.kind === "group" || layer.adjustment || layer.curves) {
		error.value = "Select an image layer";
		source = null;
		return;
	}
	source = layer.bitmap;
	layerId = layer.id;
	revision = editor.revision.value;
	update();
});
watch([advanced, radius, shift, contrast], update);
watch(preview, show);
onBeforeUnmount(clear);
function apply() {
	if (!maskAction || busy.value) return;
	editor.previewDocument.value = null;
	if (editor.revision.value !== revision) {
		error.value = "The document changed. Reopen background removal.";
		return;
	}
	if (editor.apply([maskAction], "Remove Background")) open.value = false;
	else error.value = editor.lastError.value;
}
</script>
<template>
	<UiDialog v-model="open" title="Remove Background" size="sm"
		><p>The subject stays visible through an editable layer mask.</p>
		<UiCheckbox v-model="advanced" label="Advanced edge refinement" />
		<div v-if="advanced">
			<UiSlider v-model="radius" label="Refine edges" :min="0" :max="100" /><UiSlider
				v-model="shift"
				label="Shift edge"
				:min="-100"
				:max="100"
			/><UiSlider v-model="contrast" label="Contrast" :min="0" :max="100" />
		</div>
		<UiCheckbox v-model="preview" label="Preview on canvas" />
		<p v-if="busy" role="status">Finding foreground…</p>
		<p v-if="error" role="alert">{{ error }}</p>
		<template #footer
			><UiButton @click="open = false">Cancel</UiButton
			><UiButton kind="primary" :disabled="busy || !!error || !maskAction" @click="apply"
				>Apply mask</UiButton
			></template
		></UiDialog
	>
</template>
