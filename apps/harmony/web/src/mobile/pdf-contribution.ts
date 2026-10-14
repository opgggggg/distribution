import { type UiArtifactFormatContribution } from "@yaochn/als-office-editor-ui/vue";
import { PDF_ARTIFACT_PLUGIN } from "@yaochn/als-office-pdf";
import { mobileSurface } from "./surface";
import MobilePdf from "./MobilePdf.vue";
const pdfPlugin = {
	...PDF_ARTIFACT_PLUGIN,
	manifest: {
		...PDF_ARTIFACT_PLUGIN.manifest,
		capabilities: { edit: true, search: true, "undo-redo": true },
	},
};
export const MOBILE_PDF_CONTRIBUTION: UiArtifactFormatContribution = {
	plugin: pdfPlugin,
	createBinding: (input) => ({
		component: MobilePdf,
		props: { source: input.source, fileName: input.fileName, readonly: input.readonly },
	}),
	adaptExposed: (exposed, input) => mobileSurface(pdfPlugin.manifest, exposed, input, "pdf"),
};
