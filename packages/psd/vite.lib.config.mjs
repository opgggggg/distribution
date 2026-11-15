import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { preserveCssImports } from "./scripts/vite-css-imports.mjs";

export default defineConfig({
	publicDir: false,
	plugins: [
		vue(),
		preserveCssImports(),
		{
			name: "copy-psd-vue-styles",
			closeBundle() {
				copyFileSync(resolve("src/vue/styles.css"), resolve("dist/vue/styles.css"));
			},
		},
	],
	build: {
		emptyOutDir: false,
		cssCodeSplit: true,
		minify: "esbuild",
		lib: {
			entry: resolve("src/vue/index.ts"),
			formats: ["es"],
		},
		rollupOptions: {
			external(id) {
				return id === "vue" || id.startsWith("vue/") || id.startsWith("@yaochn/") || id.startsWith("@cubexp/");
			},
			output: {
				preserveModules: true,
				preserveModulesRoot: "src/vue",
				entryFileNames: "[name].js",
				chunkFileNames: "[name].js",
				assetFileNames: "[name][extname]",
			},
		},
		outDir: "dist/vue",
	},
});
