import {
	createUiArtifactSurfaceHandle,
	deliverUiEditorFile,
	useUiEditorI18n,
	type UiArtifactFormatContribution,
} from "@yaochn/als-office-editor-ui/vue";
import { defineComponent, h, ref, watch } from "vue";
import { NOTES_ARTIFACT_PLUGIN } from "./office.js";
import { nativeNotesFormat } from "./formats.js";
import { NotesEditor, type NotesEditorApi } from "./vue/editor.js";

const OfficeNotesEditor = defineComponent({
	name: "OfficeNotesEditor",
	inheritAttrs: false,
	props: {
		source: null,
		fileName: { type: String, default: "Notebook.cubenote" },
		readonly: Boolean,
		compact: Boolean,
		hostReadingMenu: Boolean,
		nativeColorPicker: Boolean,
	},
	emits: ["loaded", "error"],
	setup(props, { attrs, emit, expose }) {
		const i18n = useUiEditorI18n(),
			editor = ref<NotesEditorApi>();
		let saving = false;
		function currentEditor(): NotesEditorApi {
			if (!editor.value) throw new Error("Notebook editor is not ready.");
			return editor.value;
		}
		// Vue checks exposed property existence; an empty proxy hides methods.
		// Expose concrete methods immediately and resolve the child on each call.
		const api: NotesEditorApi = {
			exportFile: (...args) => currentEditor().exportFile(...args),
			saveFile: (...args) => currentEditor().saveFile(...args),
			getNotebook: () => currentEditor().getNotebook(),
			getRevision: () => editor.value?.getRevision() ?? 0,
			isDirty: () => editor.value?.isDirty() ?? false,
			setDocumentName: (value) => currentEditor().setDocumentName(value),
			undo: () => currentEditor().undo(),
			redo: () => currentEditor().redo(),
			togglePages: () => currentEditor().togglePages(),
			showViewOptions: () => currentEditor().showViewOptions(),
			subscribe(listener) {
				let unsubscribe = () => {};
				const unwatch = watch(
					editor,
					(value) => {
						unsubscribe();
						unsubscribe = value?.subscribe(listener) ?? (() => {});
						listener();
					},
					{ immediate: true },
				);
				return () => {
					unwatch();
					unsubscribe();
				};
			},
		};
		expose(api);
		async function save() {
			if (!editor.value || saving || props.readonly) return;
			saving = true;
			try {
				await editor.value.saveFile({
					deliver: async (blob) => {
						await deliverUiEditorFile({
							blob,
							fileName: props.fileName,
							intent: "save",
						});
					},
				});
			} catch (error) {
				if (!(error instanceof Error && error.name === "AbortError")) emit("error", error);
			} finally {
				saving = false;
			}
		}
		async function exportToHost(blob: Blob, fileName: string) {
			try {
				await deliverUiEditorFile({ blob, fileName, intent: "export" });
			} catch (error) {
				if (!(error instanceof Error && error.name === "AbortError")) emit("error", error);
			}
		}
		return () =>
			h(NotesEditor, {
				...attrs,
				ref: editor,
				source: props.source,
				fileName: props.fileName,
				readonly: props.readonly,
				compact: props.compact,
				hostReadingMenu: props.hostReadingMenu,
				nativeColorPicker: props.nativeColorPicker,
				locale: i18n.value.locale,
				onLoaded: () => emit("loaded"),
				onError: (error: unknown) => emit("error", error),
				onSave: save,
				onExport: exportToHost,
			});
	},
});
export const NOTES_VUE_FORMAT_CONTRIBUTION: UiArtifactFormatContribution = {
	plugin: NOTES_ARTIFACT_PLUGIN,
	createBinding(input) {
		return {
			component: OfficeNotesEditor,
			props: {
				source: input.source,
				fileName: input.fileName,
				readonly: input.readonly || input.role === "viewer",
				compact: input.ribbonMode === "mobile",
			},
		};
	},
	adaptExposed(exposed, input) {
		return createUiArtifactSurfaceHandle(NOTES_ARTIFACT_PLUGIN.manifest, exposed, {
			nativeExportFormat: nativeNotesFormat(input.fileName),
			role: input.role,
			readonly: input.readonly,
		});
	},
};
