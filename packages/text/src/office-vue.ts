import { EDITABLE_TEXT_MAX_BYTES, textSourceSize } from "./large-file.js";
import { PagedTextViewer } from "./vue/paged-viewer.js";
import { createUiArtifactSurfaceHandle, deliverUiEditorFile, UiEditorShell, UiEditorFileSection,
	UiRibbonTabs, UiRibbonGroup, UiRibbonCommandButton, type UiArtifactFormatContribution, type UiIconName } from "@yaochn/als-office-editor-ui/vue";
import { artifactSourceToUint8Array } from "@yaochn/als-office-editor-core";
import { defineComponent, h, shallowRef, ref, watch, onBeforeUnmount } from "vue";
import { TEXT_ARTIFACT_PLUGIN } from "./office.js";
import { TEXT_EXTENSIONS } from "./formats.js";
import { TextEditor, type TextEditorApi } from "./vue/editor.js";
import type { TextSaveOptions } from "./buffer.js";

const largeSource = (source: unknown) => (source instanceof Blob || source instanceof ArrayBuffer || source instanceof Uint8Array) && textSourceSize(source) > EDITABLE_TEXT_MAX_BYTES;

export const TEXT_VUE_FORMAT_CONTRIBUTION: UiArtifactFormatContribution = {
	plugin: TEXT_ARTIFACT_PLUGIN,
	createBinding(input) {
		if (largeSource(input.source)) return { component: PagedTextViewer, props: { source: input.source instanceof Blob ? input.source : new Blob([input.source as BlobPart]), fileName: input.fileName } };
		return { component: OfficeTextEditor, props: { source: input.source, fileName: input.fileName,
			readonly: input.readonly === true || input.role === "viewer" } };
	},
	adaptExposed(exposed, input) {
		const readonly = input.readonly === true || input.role === "viewer" || largeSource(input.source);
		return createUiArtifactSurfaceHandle(TEXT_ARTIFACT_PLUGIN.manifest, exposed, {
			nativeExportFormat: "text", role: readonly ? "viewer" : "editor", readonly,
		});
	},
};

const OfficeTextEditor = defineComponent({
	name: "OfficeTextEditor",
	props: { source: null, fileName: { type: String, default: "document.txt" }, readonly: Boolean },
	emits: ["loaded", "error"],
	setup(props, { emit, expose }) {
		const bytes = shallowRef<Blob | Uint8Array>();
		const editor = shallowRef<TextEditorApi>();
		const error = ref(""), tab = ref("home"), wrap = ref(false), numbers = ref(true), busy = ref(false), ready = ref(false);
		const name = ref(props.fileName);
		const state = ref({ dirty: false, canUndo: false, canRedo: false, line: 1, column: 1, lines: 1, encoding: "utf-8" });
		const listeners = new Set<() => void>();
		let generation = 0;
		const notify = () => { for (const listener of listeners) listener(); };
		watch(() => props.fileName, value => { name.value = value; });
		watch(() => props.source, async (source) => {
			const id = ++generation;
			bytes.value = undefined; error.value = ""; ready.value = false;
			try {
				const result = source instanceof Blob ? source : await artifactSourceToUint8Array(source);
				if (id === generation) bytes.value = result;
			} catch (reason) {
				if (id !== generation) return;
				error.value = String(reason); emit("error", reason);
			}
		}, { immediate: true });
		onBeforeUnmount(() => { generation++; listeners.clear(); });
		function current() { if (!editor.value || !ready.value) throw new Error("Text is not loaded."); return editor.value; }
		expose({
			isDirty: () => editor.value?.isDirty() ?? false,
			getRevision: () => editor.value?.getRevision() ?? 0,
			getText: () => editor.value?.getText() ?? "",
			subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
			exportFile: (format?: string, options?: TextSaveOptions) => current().exportFile(format, options),
			saveFile: (options?: TextSaveOptions) => current().saveFile(options),
			setDocumentName: (value: string) => { name.value = value; },
			undo: () => current().undo(), redo: () => current().redo(),
		});
		function report(reason: unknown) {
			if (reason instanceof Error && reason.name === "AbortError") return;
			error.value = reason instanceof Error ? reason.message : String(reason); emit("error", reason);
		}
		async function save(intent: "save" | "save-as") {
			if (busy.value || props.readonly || !ready.value) return;
			busy.value = true; error.value = "";
			try {
				const blob = await current().exportFile();
				// Desktop acknowledges the persisted snapshot through exposed.saveFile.
				// Do not acknowledge here: a native dialog may be cancelled, or the
				// document may change while the host is persisting it.
				await deliverUiEditorFile({ blob, fileName: name.value, intent });
			} catch (reason) { report(reason); }
			finally { busy.value = false; }
		}
		async function open(files: File[]) {
			const file = files[0];
			if (!file) return;
			try { await deliverUiEditorFile({ blob: file, fileName: file.name, intent: "open" }); }
			catch (reason) { report(reason); }
		}
		const button = (label: string, icon: UiIconName, action: () => unknown, disabled = false, active = false) =>
			h(UiRibbonCommandButton, { label, icon, disabled: !ready.value || disabled, active, onActivate: action });
		const group = (label: string, children: () => unknown) => h(UiRibbonGroup, { label }, { default: children });
		return () => h(UiEditorShell, {
			class: "cubexp-text-shell", titlebarHidden: true, activeRibbonTab: tab.value,
			ribbonAriaLabel: "Text editor ribbon", workspaceAriaLabel: "Text editor workspace",
			statusItems: [
				{ id: "position", label: `Ln ${state.value.line}, Col ${state.value.column}` },
				{ id: "lines", label: `${state.value.lines} lines` },
				{ id: "encoding", label: state.value.encoding.toUpperCase() },
				{ id: "saved", label: props.readonly ? "Read only" : state.value.dirty ? "Unsaved changes" : "Saved" },
			],
		}, {
			"ribbon-tabs": () => h(UiRibbonTabs, { modelValue: tab.value, "onUpdate:modelValue": (value: string) => { tab.value = value; }, items: [{ id: "home", label: "Home" }, { id: "view", label: "View" }] }),
			"ribbon-commands": () => tab.value === "home" ? [
				group("File", () => h(UiEditorFileSection, { accept: TEXT_EXTENSIONS.map(ext => `.${ext}`).join(","),
					readonly: props.readonly, loading: !ready.value || busy.value, dirty: state.value.dirty, showNew: false,
					onSave: () => save("save"), onSaveAs: () => save("save-as"), onOpen: open })),
				group("History", () => [button("Undo", "undo", () => editor.value?.undo(), props.readonly || !state.value.canUndo), button("Redo", "redo", () => editor.value?.redo(), props.readonly || !state.value.canRedo)]),
				group("Find", () => [button("Find / Replace", "search", () => editor.value?.find()), button("Go to line", "paragraph", () => editor.value?.goToLine())]),
			] : [
				group("Code folding", () => [button("Fold all", "chevron-right", () => editor.value?.foldAll()), button("Unfold all", "chevron-down", () => editor.value?.unfoldAll())]),
				group("Display", () => [button("Line numbers", "paragraph", () => { numbers.value = !numbers.value; }, false, numbers.value), button("Word wrap", "wrap-text", () => { wrap.value = !wrap.value; }, false, wrap.value)]),
			],
			stage: () => h("div", { class: "cubexp-text-stage" }, [
				error.value ? h("p", { role: "alert", class: "cubexp-text-error" }, error.value) : null,
				bytes.value ? h(TextEditor, { ref: editor, source: bytes.value, fileName: name.value, readonly: props.readonly,
					wrap: wrap.value, lineNumbers: numbers.value, onSave: () => save("save"), onSaveAs: () => save("save-as"),
					onLoaded: () => { ready.value = true; emit("loaded"); notify(); }, onError: report,
					onStatus: (value: typeof state.value) => { state.value = value; notify(); },
				}) : h("p", { role: "status" }, "Loading text…"),
			]),
		});
	},
});
