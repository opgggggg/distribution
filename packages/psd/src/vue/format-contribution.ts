import { PSD_ARTIFACT_PLUGIN } from "@cubexp/psd";
import {
	createUiArtifactSurfaceHandle,
	uiArtifactSurfaceService,
	type UiArtifactFormatContribution,
	type UiArtifactSurfaceHandle,
} from "@yaochn/als-office-editor-ui/vue";

import PsdEditor from "./PsdEditor.vue";
import type { PsdEditorApi, PsdEditorAppearance } from "./component-types";

function adaptPsdSurface(exposed: unknown): UiArtifactSurfaceHandle | null {
	const handle = createUiArtifactSurfaceHandle(PSD_ARTIFACT_PLUGIN.manifest, exposed, {
		nativeExportFormat: "psd",
	});
	if (!handle || !exposed || typeof exposed !== "object") return handle;
	const api = exposed as Partial<PsdEditorApi>;
	if (
		typeof api.getRevision !== "function" ||
		typeof api.isDirty !== "function" ||
		typeof api.isReadonly !== "function"
	) {
		return handle;
	}
	return {
		...handle,
		getState: () => ({
			revision: api.getRevision!(),
			dirty: api.isDirty!(),
			readonly: api.isReadonly!(),
		}),
	};
}

export const PSD_VUE_FORMAT_CONTRIBUTION: UiArtifactFormatContribution = {
	plugin: PSD_ARTIFACT_PLUGIN,
	createBinding(input) {
		return {
			component: PsdEditor,
			props: {
				source: input.source,
				persistPsd: uiArtifactSurfaceService(input, "psdPersist"),
				imageServices: uiArtifactSurfaceService(input, "psdImageServices"),
				fileName: input.fileName,
				readonly: input.readonly,
				headerMode: input.headerMode,
				appearance: uiArtifactSurfaceService<PsdEditorAppearance>(input, "appearance"),
				showAppearanceToggle: uiArtifactSurfaceService<boolean>(
					input,
					"showAppearanceToggle",
				),
				showRibbonGroupLabels: uiArtifactSurfaceService<boolean>(
					input,
					"showRibbonGroupLabels",
				),
				"onUpdate:appearance": uiArtifactSurfaceService(input, "updateAppearance"),
				onLoaded: uiArtifactSurfaceService(input, "loaded"),
				onError: uiArtifactSurfaceService(input, "reportError"),
			},
		};
	},
	adaptExposed: adaptPsdSurface,
};
