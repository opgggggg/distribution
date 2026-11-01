import { fileURLToPath } from "node:url";
import path from "node:path";
import {
	assertRendererBranding,
	brandDesktopSource,
} from "../../../scripts/cubeoffice-branding.mjs";

export function cubeOfficeBrandingPlugin() {
	const sourceRoot = fileURLToPath(
		new URL("../../../als-office/apps/desktop/src/", import.meta.url),
	).replaceAll("\\", "/");
	const fallbackLogo = `${sourceRoot}assets/office-editor-mark.svg`;
	const cubeLogo = fileURLToPath(new URL("./cubeoffice-mark.svg", import.meta.url));
	return {
		name: "cubeoffice-branding",
		enforce: "pre",
		resolveId(source, importer) {
			const [file, query] = source.split("?");
			const resolved = path.isAbsolute(file)
				? file
				: importer && file.startsWith(".")
					? path.resolve(path.dirname(importer.split("?")[0]), file)
					: "";
			// URL assets bypass source transforms when Vite copies their bytes.
			if (resolved.replaceAll("\\", "/") === fallbackLogo)
				return cubeLogo + (query ? `?${query}` : "");
		},
		transform(source, id) {
			if (!id.replaceAll("\\", "/").startsWith(sourceRoot)) return;
			const code = brandDesktopSource(source, id);
			if (code !== source) return { code, map: null };
		},
		generateBundle(_options, bundle) {
			assertRendererBranding(bundle);
		},
	};
}
