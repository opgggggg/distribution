<script setup lang="ts">
import { computed, ref, shallowRef, watch, watchEffect } from "vue";
import {
	UiIconButton,
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

const props = defineProps<{
	artifactId: string;
	editor: UiArtifactSurfaceHandle;
	busy: boolean;
	saveDisabled: boolean;
}>();
const emit = defineEmits<{ command: [command: Command]; save: [] }>();
const i18n = useUiEditorI18n();
const version = ref(0);
const anchor = ref<HTMLElement>();
const target = shallowRef<HTMLElement>();

// The presentation editor mounts its shared Ribbon in a separate Vue app.
// Attach the shell-owned actions to the active artifact's actual tab row.
watchEffect(
	(onCleanup) => {
		const host = anchor.value?.closest(".document-host");
		if (!host) return;
		const artifactId = CSS.escape(props.artifactId);
		const selector = `.als-ofs-artifact-workspace__surface[data-artifact-id="${artifactId}"]`;
		const resolve = () => {
			const surface = host.querySelector(selector);
			target.value =
				surface?.querySelector<HTMLElement>(".als-ofs-ui-ribbon-surface__tabs") ??
				surface?.querySelector<HTMLElement>(".cube-notes__header") ??
				undefined;
		};
		resolve();
		const observer = new MutationObserver(() => {
			if (!target.value?.isConnected) resolve();
		});
		observer.observe(host, { childList: true, subtree: true });
		onCleanup(() => observer.disconnect());
	},
	{ flush: "post" },
);
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
	<span ref="anchor" hidden />
	<Teleport v-if="target" :to="target">
		<div class="cubeoffice-ribbon-quick-access">
			<UiIconButton
				icon="save"
				size="sm"
				:aria-label="i18n.t('common.save')"
				:disabled="busy || saveDisabled"
				@mousedown.prevent
				@click="emit('save')"
			/>
			<UiQuickAccessToolbar
				v-if="editor.undo || editor.redo"
				:items="items"
				:aria-label="i18n.t('history.quickAccess')"
				@select="emit('command', $event.id === 'undo' ? 'undo' : 'redo')"
			/>
		</div>
	</Teleport>
</template>
