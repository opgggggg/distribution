<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
	UiQuickAccessToolbar,
	type UiArtifactSurfaceHandle,
	uiEditorHistoryToolbarItems,
	useUiEditorI18n,
} from "@yaochn/als-office-editor-ui/vue";

type Command = "undo" | "redo";
type HistoryState = { canUndo: boolean; canRedo: boolean };
type HistorySurface = {
	getHistoryState?: () => HistoryState | undefined;
	api?: { getHistoryState?: () => HistoryState };
};

const props = defineProps<{ editor: UiArtifactSurfaceHandle; busy: boolean }>();
const emit = defineEmits<{ command: [command: Command] }>();
const i18n = useUiEditorI18n();
const version = ref(0);
watch(
	() => props.editor,
	(editor, _, cleanup) => {
		const unsubscribe = editor.subscribe(() => {
			version.value++;
		});
		cleanup(unsubscribe);
	},
	{ immediate: true },
);

const items = computed(() => {
	void version.value;
	const surface = props.editor.exposed as HistorySurface | undefined;
	const state = surface?.getHistoryState?.() ?? surface?.api?.getHistoryState?.();
	const copy = i18n.value;
	return uiEditorHistoryToolbarItems(
		{
			canUndo: !props.busy && Boolean(props.editor.undo) && (state?.canUndo ?? true),
			canRedo: !props.busy && Boolean(props.editor.redo) && (state?.canRedo ?? true),
		},
		{
			undo: copy.t("history.undo"),
			redo: copy.t("history.redo"),
			undoShortcut: copy.t("history.undoShortcut"),
			redoShortcut: copy.t("history.redoShortcut"),
		},
	);
});
</script>

<template>
	<UiQuickAccessToolbar
		class="cubeoffice-desktop-history"
		:items="items"
		:aria-label="i18n.t('history.quickAccess')"
		@select="emit('command', $event.id === 'undo' ? 'undo' : 'redo')"
	/>
</template>
