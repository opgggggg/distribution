import {
	createUiArtifactSurfaceHandle,
	type UiArtifactFormatContribution,
} from "@yaochn/als-office-editor-ui/vue";
import { OFD_ARTIFACT_PLUGINS, OFD_ARTIFACT_CONVERTERS } from "./office.js";
import { OfdViewer } from "./vue/index.js";
const contributions = OFD_ARTIFACT_PLUGINS.map<UiArtifactFormatContribution>(
	(plugin) =>
		({
			plugin,
			converters: OFD_ARTIFACT_CONVERTERS.filter(
				(converter) => converter.manifest.source.format === plugin.manifest.id,
			),
			createBinding(input: Parameters<UiArtifactFormatContribution["createBinding"]>[0]) {
				return {
					component: OfdViewer,
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
