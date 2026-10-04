import {
	createUiArtifactSurfaceHandle,
	useUiEditorTheme,
	type UiArtifactFormatContribution,
} from "@yaochn/als-office-editor-ui/vue";
import { OFD_ARTIFACT_PLUGINS, OFD_ARTIFACT_CONVERTERS } from "./office.js";
import { OfdViewer } from "./vue/index.js";
import { defineComponent, h, type PropType } from "vue";
import type { OfdSource } from "./source.js";

const OfficeOfdViewer = defineComponent({
	name: "OfficeOfdViewer",
	inheritAttrs: false,
	props: {
		source: {
			type: [Blob, ArrayBuffer, Uint8Array, String] as PropType<OfdSource>,
			required: true,
		},
		fileName: { type: String, default: "document.ofd" },
	},
	setup(props, { attrs, expose }) {
		const theme = useUiEditorTheme();
		let viewer: Record<string, unknown> | null = null;
		// Forward the viewer API without replacing it on a theme change.
		expose(new Proxy({}, { get: (_, key) => viewer?.[key as string] }));
		return () =>
			h(OfdViewer, {
				...attrs,
				source: props.source,
				fileName: props.fileName,
				editorTheme: theme.value,
				ref: (value: unknown) => {
					viewer = value as Record<string, unknown> | null;
				},
			});
	},
});
const contributions = OFD_ARTIFACT_PLUGINS.map<UiArtifactFormatContribution>(
	(plugin) =>
		({
			plugin,
			converters: OFD_ARTIFACT_CONVERTERS.filter(
				(converter) => converter.manifest.source.format === plugin.manifest.id,
			),
			createBinding(input: Parameters<UiArtifactFormatContribution["createBinding"]>[0]) {
				return {
					component: OfficeOfdViewer,
					props: { source: input.source, fileName: input.fileName },
				};
			},
			adaptExposed(exposed: unknown) {
				return createUiArtifactSurfaceHandle(plugin.manifest, exposed, {
					nativeExportFormat: plugin.manifest.id,
					role: "viewer",
					readonly: true,
				});
			},
		}) satisfies UiArtifactFormatContribution,
);
export const [OFD_VUE_FORMAT_CONTRIBUTION] = contributions;
