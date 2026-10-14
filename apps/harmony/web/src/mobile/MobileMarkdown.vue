<script setup lang="ts">
import { ref, shallowRef, watch, onBeforeUnmount } from "vue";
import {
	MarkdownEditor,
	MarkdownViewer,
	type MarkdownEditorApi,
} from "@yaochn/als-office-markdown/vue";
import type { MarkdownEditorAction, MarkdownSelection } from "@yaochn/als-office-markdown";
const props = defineProps<{ modelValue?: string; fileName: string; readonly?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: string]; error: [error: Error] }>();
const editor = shallowRef<MarkdownEditorApi>(),
	content = ref(props.modelValue ?? "");
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | undefined;
watch(
	() => props.modelValue,
	(value) => {
		if (value != null && value !== content.value) content.value = value;
	},
);
function ready(api: MarkdownEditorApi) {
	editor.value = api;
	unsubscribe?.();
	unsubscribe = api.session.subscribe(() => listeners.forEach((fn) => fn()));
	listeners.forEach((fn) => fn());
}
function changed(value: string) {
	content.value = value;
	emit("update:modelValue", value);
}
function onError(cause: unknown) {
	emit("error", cause instanceof Error ? cause : new Error(String(cause)));
}
function writable() {
	if (props.readonly) throw new Error("请先进入编辑模式。");
	return editor.value!;
}
onBeforeUnmount(() => unsubscribe?.());
defineExpose({
	get ai() {
		return editor.value?.ai;
	},
	get session() {
		return editor.value?.session;
	},
	getRevision: () => editor.value?.session.getDocument().revision ?? 0,
	getDocument: () => editor.value?.getDocument(),
	getContent: () => content.value,
	getSelection: () => editor.value?.getSelection(),
	setSelection: (selection: MarkdownSelection) => editor.value?.setSelection(selection),
	isDirty: () => editor.value?.isDirty() ?? false,
	subscribe: (fn: () => void) => {
		listeners.add(fn);
		return () => listeners.delete(fn);
	},
	exportFile: (format: "md" | "pdf" | "docx", options?: { signal?: AbortSignal }) => {
		if (!editor.value) throw new Error("文档尚未加载。");
		return editor.value.exportFile(format, options);
	},
	apply: (
		actions: MarkdownEditorAction | readonly MarkdownEditorAction[],
		options?: Parameters<MarkdownEditorApi["apply"]>[1],
	) => writable().apply(actions, options),
	focus: () => {
		if (!props.readonly) editor.value?.focus();
	},
	undo: () => writable().undo(),
	redo: () => writable().redo(),
});
</script>
<template>
	<section class="mobile-markdown">
		<!-- The authoring session stays writable and mounted; the read surface has its own
       readonly session. Switching modes never rebases bytes or loses authoring history. -->
		<MarkdownEditor
			v-show="!readonly"
			:model-value="content"
			:file-name="fileName"
			:readonly="false"
			:left-panel="false"
			:right-panel="false"
			:status-bar="false"
			header-mode="compact"
			view-mode="source"
			:ribbon-mode="'mobile'"
			:ai="true"
			@ready="ready"
			@update:model-value="changed"
			@error="onError"
		/>
		<MarkdownViewer
			v-if="readonly"
			:source="content"
			:file-name="fileName"
			:left-panel="false"
			:status-bar="false"
			:chrome="false"
		/>
	</section>
</template>
<style scoped>
.mobile-markdown {
	height: 100%;
	min-height: 0;
}
.mobile-markdown > :deep(*) {
	height: 100%;
}
</style>
