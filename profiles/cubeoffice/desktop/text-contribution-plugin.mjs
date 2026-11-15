import { fileURLToPath } from "node:url";

export function cubeOfficeTextContributionPlugin() {
	return {
		name: "cubeoffice-text-contribution",
		enforce: "post",
		transform(source, id) {
			if (id !== "\0virtual:desktop-format-contributions") return;
			const specifier = fileURLToPath(new URL("./text-contribution.ts", import.meta.url));
			const tsv = fileURLToPath(
				new URL("../../../apps/harmony/web/src/tsv-import.ts", import.meta.url),
			);
			return {
				code: `${source}
import { TEXT_VUE_FORMAT_CONTRIBUTION } from ${JSON.stringify(specifier)};
import { TSV_TO_XLSX_CONVERTER } from ${JSON.stringify(tsv)};
PROFILE_FORMAT_CONTRIBUTIONS.push(TEXT_VUE_FORMAT_CONTRIBUTION);
const workbookIndex = PROFILE_FORMAT_CONTRIBUTIONS.findIndex(
	(contribution) => contribution.plugin.manifest.id === "xlsx",
);
if (workbookIndex >= 0) {
	const workbook = PROFILE_FORMAT_CONTRIBUTIONS[workbookIndex];
	if (!workbook.converters?.some(({ manifest }) => manifest.id === "tsv-to-xlsx")) {
		PROFILE_FORMAT_CONTRIBUTIONS[workbookIndex] = {
			...workbook,
			converters: [...(workbook.converters ?? []), TSV_TO_XLSX_CONVERTER],
		};
	}
}
`,
				map: null,
			};
		},
	};
}
