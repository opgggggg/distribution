import { fileURLToPath } from "node:url";
import {
	assertRendererBranding,
	brandDesktopSource,
} from "../../../scripts/cubeoffice-branding.mjs";

export function cubeOfficeBrandingPlugin() {
	const sourceRoot = fileURLToPath(
		new URL("../../../als-office/apps/desktop/src/", import.meta.url),
	).replaceAll("\\", "/");
	return {
		name: "cubeoffice-branding",
		enforce: "pre",
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
