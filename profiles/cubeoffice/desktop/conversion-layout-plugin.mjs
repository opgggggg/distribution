import { fileURLToPath } from "node:url";

const app = fileURLToPath(
	new URL("../../../als-office/apps/desktop/src/App.vue", import.meta.url),
).replaceAll("\\", "/");

/** Apply the CubeOffice ribbon palette to the shared read-only conversion ribbon. */
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
		},
	};
}
