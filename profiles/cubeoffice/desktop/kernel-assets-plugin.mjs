import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

/** Share one immutable kernel asset map with every mobile host; leave upstream unmodified. */
export function cubeOfficeKernelAssetsPlugin() {
	const entry = fileURLToPath(
		new URL("../../../als-office/apps/desktop/src/main.ts", import.meta.url),
	).replaceAll("\\", "/");
	const assets = fileURLToPath(new URL("../wasm-assets.ts", import.meta.url));
	return {
		name: "cubeoffice-kernel-assets",
		enforce: "pre",
		generateBundle() {
			this.emitFile({ type: "asset", fileName: "cubeoffice-rust-licenses.txt", source: readFileSync(new URL("../../../packages/kernels/THIRD_PARTY_LICENSES.txt", import.meta.url), "utf8") });
		},
		transform(source, id) {
			if (id.split("?")[0].replaceAll("\\", "/") !== entry) return;
			return { code: `import ${JSON.stringify(assets)};\n${source}`, map: null };
		},
	};
}
