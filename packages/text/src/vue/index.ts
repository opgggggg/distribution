import { PagedTextViewer } from "./paged-viewer.js";
import { EDITABLE_TEXT_MAX_BYTES, textSourceSize } from "../large-file.js";
import { defineComponent, h, onBeforeUnmount, ref, shallowRef, watch, type PropType } from "vue";
import { readTextDocument, type TextDocument, type TextSource } from "../index.js";
export { PagedTextViewer } from "./paged-viewer.js";
export { TextEditor, type TextEditorApi } from "./editor.js";

export const TextViewer = defineComponent({
	name: "TextViewer",
	props: {
		source: { type: [String, Blob, ArrayBuffer, Uint8Array] as PropType<TextSource>, required: true },
		fileName: String,
		encoding: { type: String, default: "utf-8" },
		language: String,
		maxBytes: { type: Number, default: EDITABLE_TEXT_MAX_BYTES },
		maxHighlightLength: { type: Number, default: 200_000 },
		wrap: { type: Boolean, default: false },
	},
	emits: {
		loaded: (_document: TextDocument) => true,
		error: (_error: unknown) => true,
	},
	setup(props, { emit, expose }) {
		const model = shallowRef<TextDocument>();
		const error = ref("");
		const loading = ref(false);
		let generation = 0;
		watch(() => [props.source, props.fileName, props.encoding, props.language, props.maxBytes, props.maxHighlightLength], async () => {
			const id = ++generation;
			if (textSourceSize(props.source) > 1024 * 1024) { model.value = undefined; error.value = ""; loading.value = false; return; }
			model.value = undefined;
			error.value = "";
			loading.value = true;
			try {
				const document = await readTextDocument(props.source, props);
				if (id !== generation) return;
				model.value = document;
				emit("loaded", document);
			} catch (reason) {
				if (id !== generation) return;
				error.value = reason instanceof Error ? reason.message : String(reason);
				emit("error", reason);
			} finally {
				if (id === generation) loading.value = false;
			}
		}, { immediate: true });
		onBeforeUnmount(() => { generation++; });
		expose({ getDocument: () => model.value });
		return () => textSourceSize(props.source) > 1024 * 1024 ? h(PagedTextViewer, { source: props.source instanceof Blob ? props.source : new Blob([typeof props.source === "string" ? props.source : props.source as BlobPart]), fileName: props.fileName, encoding: props.encoding, onError: reason => emit("error", reason) }) : h("section", { class: "cubexp-text-viewer", "aria-label": props.fileName ?? "Text viewer", "aria-busy": loading.value }, [
			loading.value ? h("p", { role: "status" }, "Loading text…") : null,
			error.value ? h("p", { role: "alert" }, error.value) : null,
			model.value ? h("pre", { tabindex: 0, style: { whiteSpace: props.wrap ? "pre-wrap" : "pre", overflowWrap: props.wrap ? "anywhere" : "normal" } }, [
				h("code", { class: "hljs", innerHTML: model.value.html }),
			]) : null,
		]);
	},
});
