import { fileURLToPath } from "node:url";

const app = fileURLToPath(
	new URL("../../../als-office/apps/desktop/src/App.vue", import.meta.url),
).replaceAll("\\", "/");

/** Mount converted Office files in the same read-only editor shells as native Office files. */
export function cubeOfficeConversionLayoutPlugin() {
	return {
		name: "cubeoffice-conversion-layout",
		enforce: "pre",
		transform(source, id) {
			const modulePath = id.replaceAll("\\", "/");
			if (modulePath === app.replace(/App\.vue$/, "ReadonlyConversionRibbon.vue")) {
				return {
					code: source
						.replace("useUiEditorI18n,", "useUiEditorI18n,\n\tuseUiEditorPalette,")
						.replace(
							"const i18n = useUiEditorI18n();",
							"const i18n = useUiEditorI18n();\nconst palette = useUiEditorPalette();",
						)
						.replace(
							"<template>\n\t<UiRibbonSurface",
							`<template>
	<div class="cubeoffice-conversion-ribbon als-ofs-ui-editor-shell als-ofs-editor-ui"
		:data-editor-palette="palette" data-editor-ribbon-mode="desktop">
	<UiRibbonSurface mode="desktop"`,
						)
						.replace("\n</template>\n\n<style", "\n\t</div>\n</template>\n\n<style"),
					map: null,
				};
			}
			if (modulePath !== app) return;
			const replacements = [
				[
					"const conversionReadonly = Boolean(tab.document.conversion);",
					`const conversionReadonly = Boolean(tab.document.conversion);
	const useOfficeEditor = conversionReadonly &&
		["docx", "pptx", "vsdx"].includes(tab.document.format);`,
				],
				[
					'{ role: "viewer" as const, readonly: true }',
					'{ role: useOfficeEditor ? "editor" as const : "viewer" as const, readonly: true }',
				],
				[
					"surfaceProps: desktopSurfaceProps(tab.document.format),",
					`surfaceProps: {
			...desktopSurfaceProps(tab.document.format),
			...(useOfficeEditor ? { ribbon: false } : {}),
			...(useOfficeEditor && tab.document.format === "docx" ? { rightPanel: false } : {}),
			...(useOfficeEditor && tab.document.format === "pptx" ? { editor: true, rightPanel: false } : {}),
		},`,
				],
			];
			for (const [before, after] of replacements) {
				if (source.split(before).length !== 2) {
					throw new Error(
						"Upstream desktop conversion layout changed; update the CubeOffice adapter.",
					);
				}
				source = source.replace(before, after);
			}
			return { code: source, map: null };
		},
	};
}
