import { fileURLToPath } from "node:url";

export function cubeOfficeTextContributionPlugin() {
	return {
		name: "cubeoffice-text-contribution",
		enforce: "post",
		transform(source, id) {
			if (id !== "\0virtual:desktop-format-contributions") return;
			const specifier = fileURLToPath(new URL("./text-contribution.ts", import.meta.url));
			return {
				code: `${source}\nimport { TEXT_VUE_FORMAT_CONTRIBUTION } from ${JSON.stringify(specifier)};\nPROFILE_FORMAT_CONTRIBUTIONS.push(TEXT_VUE_FORMAT_CONTRIBUTION);\n`,
				map: null,
			};
		},
	};
}
