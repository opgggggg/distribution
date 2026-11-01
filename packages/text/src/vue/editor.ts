import { PagedTextViewer } from "./paged-viewer.js";
import { EDITABLE_TEXT_MAX_BYTES, textSourceSize } from "../large-file.js";
import {
	defineComponent,
	h,
	onBeforeUnmount,
	onMounted,
	ref,
	watch,
	computed,
	getCurrentInstance,
	type VNode,
	type PropType,
} from "vue";
import { Annotation, EditorSelection, Compartment, EditorState } from "@codemirror/state";
import {
	EditorView,
	keymap,
	lineNumbers,
	highlightActiveLine,
	highlightActiveLineGutter,
	drawSelection,
	dropCursor,
	rectangularSelection,
	highlightSpecialChars,
} from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import {
	foldGutter,
	foldKeymap,
	foldAll,
	unfoldAll,
	bracketMatching,
	indentOnInput,
	indentUnit,
} from "@codemirror/language";
import {
	search,
	searchKeymap,
	highlightSelectionMatches,
	openSearchPanel,
	gotoLine,
} from "@codemirror/search";
import {
	closeBrackets,
	closeBracketsKeymap,
	autocompletion,
	completionKeymap,
} from "@codemirror/autocomplete";
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

const rustHistory = Annotation.define<boolean>();
export const TextEditor = defineComponent({
	name: "TextEditor",
	props: {
		source: {
			type: [String, Blob, ArrayBuffer, Uint8Array] as PropType<TextSource>,
			required: true,
		},
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
		let lastEditTime = 0,
			editGroup = 0;
		let lastComposing = false;
		const editable = new Compartment(),
			wrap = new Compartment(),
			numbers = new Compartment();
		const syntax = new Compartment(),
			colours = new Compartment();
		const notify = () => {
			for (const listener of listeners) listener();
		};
		const current = () => {
			if (!buffer) throw new Error("Text is not loaded.");
			return buffer;
		};
		const command = (fn: (view: EditorView) => boolean) => () => (view ? fn(view) : false);
		function historyCommand(redo: boolean): boolean {
			if (!view || !buffer || props.readonly || !(redo ? buffer.canRedo() : buffer.canUndo()))
				return false;
			const selection = view.state.selection;
			const patch = redo ? buffer.redo() : buffer.undo();
			const doc = buffer.getDocument(),
				saved = buffer.getSelection();
			view.dispatch({
				changes: patch ?? { from: 0, to: view.state.doc.length, insert: doc },
				selection: saved
					? EditorSelection.fromJSON(saved)
					: EditorSelection.cursor(Math.min(selection.main.head, doc.length)),
				annotations: rustHistory.of(true),
				scrollIntoView: true,
			});
			lastEditTime = 0;
			lastComposing = false;
			return true;
		}
		const api: TextEditorApi = {
			getText: () => {
				if (large.value) throw new Error("Use range reads for this large file.");
				return buffer?.getText() ?? "";
			},
			getRevision: () => buffer?.getRevision() ?? 0,
			isDirty: () => buffer?.isDirty() ?? false,
			subscribe(listener) {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
			exportFile: (format, options) => current().exportFile(format, options),
			saveFile: (options) => current().saveFile(options),
			undo: () => historyCommand(false),
			redo: () => historyCommand(true),
			find: command(openSearchPanel),
			goToLine: command(gotoLine),
			foldAll: command(foldAll),
			unfoldAll: command(unfoldAll),
			focus: () => view?.focus(),
		};
		expose(api);
		function status() {
			if (!view || !buffer) return;
			const head = view.state.selection.main.head;
			const line = view.state.doc.lineAt(head);
			emit("status", {
				line: line.number,
				column: head - line.from + 1,
				lines: view.state.doc.lines,
				encoding: buffer.encoding,
				dirty: buffer.isDirty(),
				canUndo: buffer.canUndo(),
				canRedo: buffer.canRedo(),
			});
		}
		let languageGeneration = 0;
		async function loadLanguage() {
			const id = ++languageGeneration,
				target = view;
			if (!target) return;
			target.dispatch({
				effects: [
					syntax.reconfigure([]),
					colours.reconfigure(highlightJsExtension(props.fileName)),
				],
			});
			if (target.state.doc.length > 1_000_000) return;
			const description = languages.find(
				(item) =>
					item.filename?.test(props.fileName) ||
					item.extensions.includes(props.fileName.split(".").pop()?.toLowerCase() ?? ""),
			);
			if (!description) return;
			try {
				const support = await description.load();
				if (id === languageGeneration && view === target)
					target.dispatch({ effects: syntax.reconfigure(support) });
			} catch (reason) {
				if (id === languageGeneration) emit("error", reason);
			}
		}
		async function load() {
			const id = ++generation;
			controller?.abort();
			controller = new AbortController();
			languageGeneration++;
			view?.destroy();
			view = undefined;
			buffer = undefined;
			if (!host.value || large.value) return;
			loading.value = true;
			error.value = "";
			try {
				const loaded = await createTextBuffer(props.source, {
					fileName: props.fileName,
					encoding: props.encoding,
					signal: controller.signal,
				});
				if (id !== generation) return;
				buffer = loaded;
				buffer.setReadonly(props.readonly);
				buffer.subscribe(() => {
					notify();
					status();
				});
				view = new EditorView({
					parent: host.value,
					state: EditorState.create({
						doc: buffer.getDocument(),
						extensions: [
							drawSelection(),
							dropCursor(),
							rectangularSelection(),
							highlightSpecialChars(),
							highlightActiveLine(),
							highlightActiveLineGutter(),
							foldGutter(),
							bracketMatching(),
							indentOnInput(),
							indentUnit.of("    "),
							EditorState.tabSize.of(4),
							closeBrackets(),
							autocompletion(),
							search({ top: true }),
							highlightSelectionMatches(),
							numbers.of(props.lineNumbers ? lineNumbers() : []),
							wrap.of(props.wrap ? EditorView.lineWrapping : []),
							editable.of([
								EditorState.readOnly.of(props.readonly),
								EditorView.editable.of(!props.readonly),
							]),
							syntax.of([]),
							colours.of(highlightJsExtension(props.fileName)),
							EditorView.contentAttributes.of({
								"aria-label": "Text editor",
								spellcheck: "false",
							}),
							keymap.of([
								{
									key: "Mod-s",
									run: () => {
										if (!props.readonly) emit("save");
										return true;
									},
									preventDefault: true,
								},
								{
									key: "Mod-Shift-s",
									run: () => {
										if (!props.readonly) emit("save-as");
										return true;
									},
									preventDefault: true,
								},
								{
									key: "Mod-z",
									run: () => historyCommand(false),
									preventDefault: true,
								},
								{
									key: "Mod-y",
									run: () => historyCommand(true),
									preventDefault: true,
								},
								{
									key: "Mod-Shift-z",
									run: () => historyCommand(true),
									preventDefault: true,
								},
								...closeBracketsKeymap,
								...defaultKeymap,
								...searchKeymap,
								...foldKeymap,
								...completionKeymap,
								indentWithTab,
							]),
							EditorState.transactionFilter.of((transaction) => {
								if (!transaction.docChanged || transaction.annotation(rustHistory))
									return transaction;
								const changes: { from: number; to: number; insert: string }[] = [];
								transaction.changes.iterChanges((from, to, _a, _b, insert) =>
									changes.push({ from, to, insert: insert.toString() }),
								);
								try {
									buffer!.validateChanges(changes);
									return transaction;
								} catch (reason) {
									emit("error", reason);
									return [];
								}
							}),
							EditorView.updateListener.of((update) => {
								if (update.docChanged) {
									const changes: { from: number; to: number; insert: string }[] =
										[];
									update.changes.iterChanges((from, to, _from, _to, insert) =>
										changes.push({ from, to, insert: insert.toString() }),
									);
									if (update.transactions.some((t) => t.annotation(rustHistory)))
										buffer!.adoptViewDocument(update.state.doc);
									else {
										const time = Date.now(),
											groupable = update.transactions.every(
												(t) =>
													t.isUserEvent("input.type") ||
													t.isUserEvent("delete.backward") ||
													t.isUserEvent("delete.forward"),
											);
										const composing =
											Boolean(view?.composing) ||
											update.transactions.some((t) =>
												t.isUserEvent("input.type.compose"),
											);
										if (
											!groupable ||
											composing !== lastComposing ||
											(!composing && time - lastEditTime > 500)
										)
											editGroup++;
										buffer!.applyChanges(changes, update.state.doc, {
											selectionBefore: update.startState.selection.toJSON(),
											selectionAfter: update.state.selection.toJSON(),
											group: groupable ? String(editGroup) : undefined,
										});
										lastEditTime = groupable ? time : 0;
										lastComposing = composing;
									}
									if (
										instance?.vnode.props?.onChange ||
										instance?.vnode.props?.onChangeOnce
									)
										emit("change", buffer!.getText());
								}
								status();
							}),
						],
					}),
				});
				loading.value = false;
				status();
				notify();
				emit("loaded", api);
				void loadLanguage();
			} catch (reason) {
				if (id !== generation) return;
				loading.value = false;
				error.value = reason instanceof Error ? reason.message : String(reason);
				emit("error", reason);
			}
		}
		let unregisterPreview: (() => void) | undefined;
		watch(host, (element) => {
			unregisterPreview?.();
			if (element)
				unregisterPreview = registerTextPreview(element, () =>
					buffer ? { text: buffer.getPrefix(), fileName: props.fileName } : undefined,
				);
		});
		onMounted(load);
		watch(() => [props.source, props.encoding], load, { flush: "post" });
		watch(() => props.fileName, loadLanguage);
		watch(
			() => props.wrap,
			(value) =>
				view?.dispatch({ effects: wrap.reconfigure(value ? EditorView.lineWrapping : []) }),
		);
		watch(
			() => props.lineNumbers,
			(value) => view?.dispatch({ effects: numbers.reconfigure(value ? lineNumbers() : []) }),
		);
		watch(
			() => props.readonly,
			(value) => {
				buffer?.setReadonly(value);
				view?.dispatch({
					effects: editable.reconfigure([
						EditorState.readOnly.of(value),
						EditorView.editable.of(!value),
					]),
				});
			},
		);
		onBeforeUnmount(() => {
			generation++;
			controller?.abort();
			languageGeneration++;
			unregisterPreview?.();
			view?.destroy();
			listeners.clear();
		});
		return (): VNode =>
			large.value
				? h(PagedTextViewer, {
						source:
							props.source instanceof Blob
								? props.source
								: new Blob([
										typeof props.source === "string"
											? props.source
											: (props.source as BlobPart),
									]),
						fileName: props.fileName,
						encoding: props.encoding,
						onError: (reason) => emit("error", reason),
					})
				: h("div", { class: "cubexp-text-editor", "aria-busy": loading.value }, [
						loading.value ? h("p", { role: "status" }, "Loading text…") : null,
						error.value ? h("p", { role: "alert" }, error.value) : null,
						h("div", { ref: host, class: "cubexp-text-editor__host" }),
					]);
	},
});
