import { fileURLToPath } from "node:url";

/** Set the distribution theme before any editor is mounted. */
export function cubeOfficeEditorThemePlugin() {
	const entry = fileURLToPath(
		new URL("../../../als-office/apps/desktop/src/main.ts", import.meta.url),
	).replaceAll("\\", "/");
	return {
		name: "cubeoffice-editor-theme",
		enforce: "pre",
		transform(source, id) {
			if (id.split("?")[0].replaceAll("\\", "/") !== entry) return;
			return {
				code: `import { setUiEditorTheme } from "@yaochn/als-office-editor-ui/vue";\nsetUiEditorTheme("panel");\n${source}`,
				map: null,
			};
		},
	};
}
