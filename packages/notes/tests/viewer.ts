import { createApp, h, ref } from "vue";
import { NotesEditor, type NotesEditorApi } from "../src/vue/editor";
import "../src/style.css";
const bridge = new URLSearchParams(location.search).has("bridge")
	? (await import("../src/office-vue")).NOTES_VUE_FORMAT_CONTRIBUTION
	: undefined;
const input = {
	source: undefined,
	fileName: "会议笔记.cubenote",
	role: "editor" as const,
	readonly: false,
};
const binding = bridge?.createBinding(input);
const editor = ref<NotesEditorApi>();
const readonly = ref(false),
	source = ref<Blob>();
Object.assign(window, {
	notebook: editor,
	noteReadonly: readonly,
	noteSource: source,
	noteExports: [],
});
createApp({
	setup: () => () =>
		h(binding?.component ?? NotesEditor, {
			...binding?.props,
			ref: (value: unknown) => {
				editor.value = value as NotesEditorApi;
				if (value && bridge)
					(window as any).bridgeSurface = bridge.adaptExposed(value, input);
			},
			source: source.value,
			readonly: readonly.value,
			fileName: "会议笔记.cubenote",
			locale: new URLSearchParams(location.search).get("locale") ?? "zh-CN",
			onExport: (blob: Blob, fileName: string) => {
				(window as any).noteExports.push({ blob, fileName });
			},
		}),
}).mount("#app");
