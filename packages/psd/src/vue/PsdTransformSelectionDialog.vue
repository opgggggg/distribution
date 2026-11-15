<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { UiDialog, UiButton, UiCheckbox } from "@yaochn/als-office-editor-ui/vue";
import {
	selectionTransformBounds,
	PsdEditorSession,
	cloneDocumentStructure,
	type PsdEditorAction,
} from "@cubexp/psd";
import { usePsdEditorContext } from "./psd-editor-context";
const editor = usePsdEditorContext(),
	x = ref(0),
	y = ref(0),
	width = ref(1),
	height = ref(1),
	angle = ref(0),
	preview = ref(true),
	error = ref("");
let ids: string[] = [],
	original = { x: 0, y: 0, width: 1, height: 1 },
	frame: number | null = null;
const open = computed({
	get: () => editor.dialog.value === "transform-selection",
	set: (v: boolean) => {
		if (!v) editor.dialog.value = null;
	},
});
function clear() {
	if (frame !== null) cancelAnimationFrame(frame);
	frame = null;
	editor.previewDocument.value = null;
}
function action(): PsdEditorAction {
	return {
		type: "transform.selection",
		layerIds: ids,
		dx: x.value - original.x + (width.value - original.width) / 2,
		dy: y.value - original.y + (height.value - original.height) / 2,
		scaleX: width.value / original.width,
		scaleY: height.value / original.height,
		degrees: angle.value,
	};
}
function update() {
	clear();
	if (!open.value) return;
	frame = requestAnimationFrame(() => {
		frame = null;
		error.value = "";
		try {
			const s = new PsdEditorSession(cloneDocumentStructure(editor.document.value!));
			s.apply([action()]);
			if (preview.value) editor.previewDocument.value = s.peekDocument();
		} catch (e) {
			error.value = String(e);
		}
	});
}
watch(open, (value) => {
	clear();
	if (!value) return;
	ids = [...editor.selectedLayerIds.value];
	try {
		original = selectionTransformBounds(editor.document.value!, ids);
		x.value = original.x;
		y.value = original.y;
		width.value = original.width;
		height.value = original.height;
		angle.value = 0;
		error.value = "";
	} catch (e) {
		error.value = String(e);
	}
});
watch([x, y, width, height, angle, preview], update);
onBeforeUnmount(clear);
function commit() {
	clear();
	if (editor.apply([action()], "Transform Selected Layers")) open.value = false;
	else error.value = editor.lastError.value;
}
</script>
<template>
	<UiDialog v-model="open" title="Transform Selected Layers" size="sm"
		><p>
			Scale and rotate all selected layers around their shared center. X and Y position the
			scaled bounds before rotation.
		</p>
		<div class="psd-transform-fields">
			<label>X<input v-model.number="x" type="number" step="1" /></label
			><label>Y<input v-model.number="y" type="number" step="1" /></label
			><label>Width<input v-model.number="width" type="number" min="1" max="30000" /></label
			><label>Height<input v-model.number="height" type="number" min="1" max="30000" /></label
			><label
				>Angle<input v-model.number="angle" type="number" min="-360" max="360" step="1"
			/></label>
		</div>
		<UiCheckbox v-model="preview" label="Preview on canvas" />
		<p v-if="error" role="alert">{{ error }}</p>
		<template #footer
			><UiButton @click="open = false">Cancel</UiButton
			><UiButton kind="primary" :disabled="!!error" @click="commit"
				>Apply transform</UiButton
			></template
		></UiDialog
	>
</template>
<style scoped>
.psd-transform-fields {
	display: grid;
	gap: 10px;
	margin: 12px 0;
}
.psd-transform-fields label {
	display: flex;
	justify-content: space-between;
	align-items: center;
}
.psd-transform-fields input {
	padding: 7px;
	width: 130px;
}
</style>
