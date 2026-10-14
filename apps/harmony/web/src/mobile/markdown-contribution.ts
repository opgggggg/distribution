import { MARKDOWN_VUE_FORMAT_CONTRIBUTION } from "@yaochn/als-office-markdown/vue";
import type { UiArtifactFormatContribution } from "@yaochn/als-office-editor-ui/vue";
import MobileMarkdown from "./MobileMarkdown.vue";
export const MOBILE_MARKDOWN_CONTRIBUTION: UiArtifactFormatContribution = {
	...MARKDOWN_VUE_FORMAT_CONTRIBUTION,
	createBinding(input) {
		const binding = MARKDOWN_VUE_FORMAT_CONTRIBUTION.createBinding(input);
		return { ...binding, component: MobileMarkdown };
	},
};
