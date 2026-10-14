import { type UiArtifactFormatContribution } from "@yaochn/als-office-editor-ui/vue";
import { IMAGE_ARTIFACT_PLUGIN } from "@yaochn/als-office-image";
import { mobileSurface } from "./surface";
import MobileImage from "./MobileImage.vue";
import { IMAGE_MIME } from "./image-document";
const imagePlugin = {
	...IMAGE_ARTIFACT_PLUGIN,
	manifest: {
		...IMAGE_ARTIFACT_PLUGIN.manifest,
		capabilities: { edit: true, "undo-redo": true },
		extensions: Object.keys(IMAGE_MIME),
		mimeTypes: [...new Set(Object.values(IMAGE_MIME))],
	},
};
export const MOBILE_IMAGE_CONTRIBUTION: UiArtifactFormatContribution = {
	plugin: imagePlugin,
	createBinding: (input) => ({
		component: MobileImage,
		props: { source: input.source, fileName: input.fileName, readonly: input.readonly },
	}),
	adaptExposed: (exposed, input) => mobileSurface(imagePlugin.manifest, exposed, input, "image"),
};
