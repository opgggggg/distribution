import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default {
	input: "src/index.ts",
	output: {
		file: "dist/psd.mjs",
		format: "es",
		sourcemap: true,
	},
	external: ["utif", "@yaochn/als-office-editor-core", "@yaochn/als-office-ooxml-core"],
	plugins: [
		nodeResolve({
			browser: true,
			preferBuiltins: false,
			extensions: [".mjs", ".js", ".json", ".ts"],
		}),
		typescript({
			include: ["src/**/*.ts"],
			exclude: ["src/vue/**"],
			compilerOptions: {
				declaration: false,
				declarationMap: false,
			},
		}),
	],
};
