import { PagedTextViewer } from "./paged-viewer.js";
import { EDITABLE_TEXT_MAX_BYTES, textSourceSize } from "../large-file.js";
import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, computed, getCurrentInstance, type VNode, type PropType } from "vue";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, rectangularSelection, highlightSpecialChars } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, undo, redo, undoDepth, redoDepth, indentWithTab } from "@codemirror/commands";
import { foldGutter, foldKeymap, foldAll, unfoldAll, bracketMatching, indentOnInput, indentUnit } from "@codemirror/language";
import { search, searchKeymap, highlightSelectionMatches, openSearchPanel, gotoLine } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { languages } from "@codemirror/language-data";
import { createTextBuffer, type TextBuffer, type TextSaveOptions } from "../buffer.js";
import type { TextSource } from "../index.js";
import { highlightJsExtension } from "./editor-extensions.js";
import { registerTextPreview } from "../thumbnail.js";

export interface TextEditorApi {
	getText(): string;
	getRevision(): number;
	isDirty(): boolean;
	subscribe(listener: () => void): () => void;
	exportFile(format?: string, options?: TextSaveOptions): Promise<Blob>;
	saveFile(options?: TextSaveOptions): Promise<Blob>;
	undo(): boolean;
	redo(): boolean;
	find(): boolean;
	goToLine(): boolean;
	foldAll(): boolean;
	unfoldAll(): boolean;
	focus(): void;
}

export const TextEditor = defineComponent({
	name: "TextEditor",
	props: {
		source: { type: [String, Blob, ArrayBuffer, Uint8Array] as PropType<TextSource>, required: true },
		fileName: { type: String, default: "document.txt" },
		encoding: { type: String, default: "utf-8" },
		readonly: Boolean,
		wrap: Boolean,
		lineNumbers: { type: Boolean, default: true },
	},
	emits: ["loaded", "error", "change", "status", "save", "save-as"],
	setup(props, { emit, expose }) {
		const instance = getCurrentInstance();
		const large = computed(() => textSourceSize(props.source) > EDITABLE_TEXT_MAX_BYTES);
		const host = ref<HTMLElement>();
		const error = ref("");
		const loading = ref(true);
		let view: EditorView | undefined, buffer: TextBuffer | undefined;
		let generation = 0;
		let controller: AbortController | undefined;
		const listeners = new Set<() => void>();
		const editable = new Compartment(), wrap = new Compartment(), numbers = new Compartment();
		const syntax = new Compartment(), colours = new Compartment();
		const notify = () => { for (const listener of listeners) listener(); };
		const current = () => { if (!buffer) throw new Error("Text is not loaded."); return buffer; };
		const command = (fn: (view: EditorView) => boolean) => () => view ? fn(view) : false;
		const api: TextEditorApi = {
			getText: () => { if (large.value) throw new Error("Use range reads for this large file."); return buffer?.getText() ?? ""; }, getRevision: () => buffer?.getRevision() ?? 0,
			isDirty: () => buffer?.isDirty() ?? false,
			subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
			exportFile: (format, options) => current().exportFile(format, options),
			saveFile: options => current().saveFile(options),
			undo: command(undo), redo: command(redo), find: command(openSearchPanel), goToLine: command(gotoLine),
			foldAll: command(foldAll), unfoldAll: command(unfoldAll), focus: () => view?.focus(),
		};
		expose(api);
		function status() {
			if (!view || !buffer) return;
			const head = view.state.selection.main.head;
			const line = view.state.doc.lineAt(head);
			emit("status", { line: line.number, column: head - line.from + 1, lines: view.state.doc.lines,
				encoding: buffer.encoding, dirty: buffer.isDirty(), canUndo: undoDepth(view.state) > 0, canRedo: redoDepth(view.state) > 0 });
		}
		let languageGeneration = 0;
		async function loadLanguage() {
			const id = ++languageGeneration, target = view;
			if (!target) return;
			target.dispatch({ effects: [syntax.reconfigure([]), colours.reconfigure(highlightJsExtension(props.fileName))] });
			if (target.state.doc.length > 1_000_000) return;
			const description = languages.find(item => item.filename?.test(props.fileName) || item.extensions.includes(props.fileName.split(".").pop()?.toLowerCase() ?? ""));
			if (!description) return;
			try {
				const support = await description.load();
				if (id === languageGeneration && view === target) target.dispatch({ effects: syntax.reconfigure(support) });
			} catch (reason) { if (id === languageGeneration) emit("error", reason); }
		}
		async function load() {
			const id = ++generation;
			controller?.abort(); controller = new AbortController();
			languageGeneration++;
			view?.destroy(); view = undefined; buffer = undefined;
			if (!host.value || large.value) return;
			loading.value = true; error.value = "";
			try {
				const loaded = await createTextBuffer(props.source, { fileName: props.fileName, encoding: props.encoding, signal: controller.signal });
				if (id !== generation) return;
				buffer = loaded;
				buffer.subscribe(() => { notify(); status(); });
				view = new EditorView({ parent: host.value, state: EditorState.create({
					doc: buffer.getDocument(),
					extensions: [
						history(), drawSelection(), dropCursor(), rectangularSelection(), highlightSpecialChars(),
						highlightActiveLine(), highlightActiveLineGutter(), foldGutter(), bracketMatching(), indentOnInput(),
						indentUnit.of("    "), EditorState.tabSize.of(4), closeBrackets(), autocompletion(), search({ top: true }), highlightSelectionMatches(),
						numbers.of(props.lineNumbers ? lineNumbers() : []), wrap.of(props.wrap ? EditorView.lineWrapping : []),
						editable.of([EditorState.readOnly.of(props.readonly), EditorView.editable.of(!props.readonly)]),
						syntax.of([]), colours.of(highlightJsExtension(props.fileName)),
						EditorView.contentAttributes.of({ "aria-label": "Text editor", spellcheck: "false" }),
						keymap.of([
							{ key: "Mod-s", run: () => { if (!props.readonly) emit("save"); return true; }, preventDefault: true },
							{ key: "Mod-Shift-s", run: () => { if (!props.readonly) emit("save-as"); return true; }, preventDefault: true },
							...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, indentWithTab,
						]),
						EditorView.updateListener.of(update => {
							if (update.docChanged) {
								buffer!.setDocument(update.state.doc);
								if (instance?.vnode.props?.onChange || instance?.vnode.props?.onChangeOnce) emit("change", buffer!.getText());
							}
							status();
						}),
					],
				}) });
				loading.value = false;
				status(); notify(); emit("loaded", api);
				void loadLanguage();
			} catch (reason) {
				if (id !== generation) return;
				loading.value = false; error.value = reason instanceof Error ? reason.message : String(reason); emit("error", reason);
			}
		}
		let unregisterPreview: (() => void) | undefined;
		watch(host, element => {
			unregisterPreview?.();
			if (element) unregisterPreview = registerTextPreview(element, () => buffer ? { text: buffer.getPrefix(), fileName: props.fileName } : undefined);
		});
		onMounted(load);
		watch(() => [props.source, props.encoding], load, { flush: "post" });
		watch(() => props.fileName, loadLanguage);
		watch(() => props.wrap, value => view?.dispatch({ effects: wrap.reconfigure(value ? EditorView.lineWrapping : []) }));
		watch(() => props.lineNumbers, value => view?.dispatch({ effects: numbers.reconfigure(value ? lineNumbers() : []) }));
		watch(() => props.readonly, value => view?.dispatch({ effects: editable.reconfigure([EditorState.readOnly.of(value), EditorView.editable.of(!value)]) }));
		onBeforeUnmount(() => { generation++; controller?.abort(); languageGeneration++; unregisterPreview?.(); view?.destroy(); listeners.clear(); });
		return (): VNode => large.value ? h(PagedTextViewer, { source: props.source instanceof Blob ? props.source : new Blob([typeof props.source === "string" ? props.source : props.source as BlobPart]), fileName: props.fileName, encoding: props.encoding, onError: reason => emit("error", reason) }) : h("div", { class: "cubexp-text-editor", "aria-busy": loading.value }, [
			loading.value ? h("p", { role: "status" }, "Loading text…") : null,
			error.value ? h("p", { role: "alert" }, error.value) : null,
			h("div", { ref: host, class: "cubexp-text-editor__host" }),
		]);
	},
});
