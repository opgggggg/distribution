<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { UiDialog, UiButton } from "@yaochn/als-office-editor-ui/vue";
import {
	PsdEditorSession,
	cloneDocumentStructure,
	type PsdContentAwareFillAction,
} from "@cubexp/psd";
import { usePsdEditorContext } from "./psd-editor-context";
const open = defineModel<boolean>({ default: false }),
	editor = usePsdEditorContext(),
	preview = ref(true),
	sampleAll = ref(false),
	radius = ref(64),
	error = ref("");
let layerId = "";
function action(): PsdContentAwareFillAction {
	return {
		type: "contentAware.fill",
		layerId,
		sampleAllLayers: sampleAll.value,
		searchRadius: radius.value,
	};
}
function update() {
	editor.previewDocument.value = null;
	error.value = "";
	if (!open.value) return;
	try {
		const s = new PsdEditorSession(cloneDocumentStructure(editor.document.value!));
		s.apply([action()]);
		if (preview.value) editor.previewDocument.value = s.peekDocument();
	} catch (e) {
		error.value = String(e);
	}
}
watch(open, (v) => {
	if (v) {
		layerId = editor.activeLayer.value?.id ?? "";
		preview.value = true;
		update();
	} else editor.previewDocument.value = null;
});
watch([preview, sampleAll], update);
onBeforeUnmount(() => (editor.previewDocument.value = null));
function apply() {
	const result = editor.apply([action()], "Content-aware fill");
	if (result) {
		editor.previewDocument.value = null;
		open.value = false;
	}
}
</script>
<template>
	<UiDialog
		v-model="open"
		title="Content-aware fill"
		description="Replace the selection using surrounding texture. A fill can extend the layer inside the canvas."
		size="md"
		><div class="psd-repair-fill">
			<label
				>Search radius
				<input
					v-model.number="radius"
					type="number"
					min="8"
					max="256"
					@change="update" /></label
			><label><input v-model="sampleAll" type="checkbox" />Sample all visible layers</label
			><label><input v-model="preview" type="checkbox" />Preview on canvas</label>
			<p>Up to 65,536 selected pixels per fill. Source patches exclude the selection.</p>
			<p v-if="error" role="alert">{{ error }}</p>
		</div>
		<template #footer
			><UiButton @click="open = false">Cancel</UiButton
			><UiButton :disabled="!!error" kind="primary" @click="apply"
				>Apply fill</UiButton
			></template
		></UiDialog
	>
</template>
<style scoped>
.psd-repair-fill {
	display: grid;
	gap: 14px;
}
.psd-repair-fill label {
	display: flex;
	align-items: center;
	gap: 8px;
}
.psd-repair-fill input[type="number"] {
	width: 90px;
	padding: 6px;
	color: inherit;
	background: transparent;
	border: 1px solid #888;
	border-radius: 4px;
}
.psd-repair-fill [role="alert"] {
	color: #b52323;
}
</style>
