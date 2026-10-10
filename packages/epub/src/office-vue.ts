import { createUiArtifactSurfaceHandle, useUiEditorI18n, type UiArtifactFormatContribution } from "@yaochn/als-office-editor-ui/vue";
import { defineComponent, h, type PropType } from "vue";
import type { EpubSource } from "./archive.js";
import { EPUB_ARTIFACT_PLUGIN } from "./office.js";
import { EpubReader } from "./vue/reader.js";

const OfficeEpubReader = defineComponent({
	name: "OfficeEpubReader",
	inheritAttrs: false,
	props: {
		source: { type: [Blob, ArrayBuffer, Uint8Array, String] as PropType<EpubSource | string>, required: true },
		fileName: { type: String, default: "book.epub" },
	},
	setup(props, { attrs, expose }) {
		const i18n = useUiEditorI18n();
		let reader: Record<string, unknown> | null = null;
		expose(new Proxy({}, { get: (_, key) => reader?.[key as string] }));
		return () => h(EpubReader, {
			...attrs, source: props.source, fileName: props.fileName, locale: i18n.value.locale,
			ref: (value: unknown) => { reader = value as Record<string, unknown> | null; },
		});
	},
});

export const EPUB_VUE_FORMAT_CONTRIBUTION: UiArtifactFormatContribution = {
	plugin: EPUB_ARTIFACT_PLUGIN,
	createBinding(input) {
		return { component: OfficeEpubReader, props: { source: input.source, fileName: input.fileName } };
	},
	adaptExposed(exposed) {
		return createUiArtifactSurfaceHandle(EPUB_ARTIFACT_PLUGIN.manifest, exposed, { nativeExportFormat: "epub", role: "viewer", readonly: true });
	},
};
