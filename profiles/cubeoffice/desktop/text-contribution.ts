import "@cubexp/text/style.css";
import "highlight.js/styles/github.css";
import { TEXT_VUE_FORMAT_CONTRIBUTION as textContribution } from "@cubexp/text/office-vue";

// The desktop host's native HTML editor owns HTML files. The standalone text
// package still supports HTML source, but must not claim it in this registry.
export const TEXT_VUE_FORMAT_CONTRIBUTION = {
	...textContribution,
	plugin: {
		...textContribution.plugin,
		manifest: {
			...textContribution.plugin.manifest,
			extensions: textContribution.plugin.manifest.extensions.filter(
				(extension) => extension !== "html" && extension !== "htm",
			),
			mimeTypes: textContribution.plugin.manifest.mimeTypes?.filter(
				(mimeType) => mimeType !== "text/html",
			),
		},
	},
};
