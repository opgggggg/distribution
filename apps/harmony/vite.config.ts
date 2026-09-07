import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const fromHere = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * One Vue source, two payload shapes.
 *
 * HarmonyOS (`vite build`): ArkWeb loads the payload from `rawfile/` where
 * cross-file module requests fail the local-origin CORS check, so every script,
 * style and asset is folded into a single `index.html` by
 * `scripts/inline-web-assets.mjs`. That file is about 84 MB, most of it the
 * on-demand icon and SmartArt libraries the desktop build only loads when a
 * picker opens.
 *
 * Android (`vite build --mode android`): the WebView serves `assets/web/` from
 * `file:///android_asset/` with file-to-file access enabled, so the normal
 * code-split output is kept and written straight into the Android project. The
 * home screen then parses a ~1 MB entry chunk instead of one 84 MB inline
 * script; the format engines load when a document opens and the icon libraries
 * when a picker asks for them.
 */
export default defineConfig(({ mode }) => {
	const android = mode === "android";
	return {
		root: fromHere("./web"),
		base: "./",
		plugins: [vue()],
		resolve: {
			dedupe: ["vue"],
		},
		build: {
			outDir: android
				? fromHere("../android/app/src/main/assets/web")
				: fromHere("./entry/src/main/resources/rawfile/web"),
			emptyOutDir: true,
			assetsInlineLimit: android ? 4096 : Number.MAX_SAFE_INTEGER,
			cssCodeSplit: false,
			chunkSizeWarningLimit: 4_000,
			rollupOptions: {
				output: {
					inlineDynamicImports: !android,
				},
			},
		},
	};
});
