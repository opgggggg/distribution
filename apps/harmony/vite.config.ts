import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const fromHere = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * One Vue source and one code-split payload strategy for both native hosts.
 *
 * HarmonyOS (`vite build`): ArkWeb intercepts the reserved HTTPS origin and
 * serves packaged rawfile resources, allowing same-origin module imports.
 *
 * Android (`vite build --mode android`): the WebView serves `assets/web/` from
 * `file:///android_asset/` with file-to-file access enabled, so the normal
 * code-split output is kept and written straight into the Android project. The
 * home screen then parses the entry chunk instead of one 84 MB inline
 * script; the format engines load when a document opens and the icon libraries
 * when a picker asks for them.
 *
 * iOS (`vite build --mode ios`): the same code-split output, written into the Xcode
 * project. WKWebView has no `file://` escape hatch, so the shell serves the payload
 * through a custom scheme handler, which gives the page a real origin.
 */
export default defineConfig(({ mode }) => {
	const android = mode === "android";
	const ios = mode === "ios";
	// Both native shells load the payload as chunks over a normal origin; only
	// HarmonyOS takes the inlined build.
	const codeSplit = android || ios;
	return {
		root: fromHere("./web"),
		base: "./",
		plugins: [vue()],
		resolve: {
			alias: {
				"@yaochn/als-office-editor-ui/document-preview": fromHere(
					"../../als-office/packages/editor-ui/src/document-preview.ts",
				),
			},
			dedupe: ["vue"],
		},
		build: {
			outDir: android
				? fromHere("../android/app/src/main/assets/web")
				: ios
					? fromHere("../ios/App/Resources/web")
					: fromHere("./entry/src/main/resources/rawfile/web"),
			emptyOutDir: true,
			assetsInlineLimit: 4096,
			// The native shells should load only workspace styles at startup, then
			// each editor's styles with its lazy JavaScript chunk.
			cssCodeSplit: codeSplit,
			chunkSizeWarningLimit: 4_000,
			rollupOptions: {
				output: {
					inlineDynamicImports: false,
				},
			},
		},
	};
});
