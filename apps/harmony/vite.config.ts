import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const fromHere = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
	root: fromHere("./web"),
	base: "./",
	plugins: [vue()],
	resolve: {
		dedupe: ["vue"],
	},
	build: {
		outDir: fromHere("./entry/src/main/resources/rawfile/web"),
		emptyOutDir: true,
		assetsInlineLimit: Number.MAX_SAFE_INTEGER,
		cssCodeSplit: false,
		chunkSizeWarningLimit: 4_000,
		rollupOptions: {
			output: {
				inlineDynamicImports: true,
			},
		},
	},
});
