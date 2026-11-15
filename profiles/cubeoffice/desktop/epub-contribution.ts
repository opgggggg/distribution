import "@cubexp/epub/style.css";
import { EPUB_VUE_FORMAT_CONTRIBUTION as reader } from "@cubexp/epub/office-vue";
import type { UiArtifactFormatContribution } from "@yaochn/als-office-editor-ui/vue";
import DesktopEpubRibbon from "./DesktopEpubRibbon.vue";

export const EPUB_VUE_FORMAT_CONTRIBUTION: UiArtifactFormatContribution = {
	...reader,
	createBinding(input) {
		const binding = reader.createBinding(input);
		return {
			...binding,
			props: { ...binding.props, desktopToolbar: DesktopEpubRibbon, form: "desktop" },
		};
	},
};
