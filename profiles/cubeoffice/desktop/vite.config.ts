import { cubeOfficeLargeTextPlugin } from "./large-text-plugin.mjs";
import { cubeOfficeBrandingPlugin } from "./branding-plugin.mjs";
import { defineConfig, mergeConfig } from "vite";
import { fileURLToPath } from "node:url";
import upstreamConfig from "../../../als-office/apps/desktop/vite.config";
import { cubeOfficeTextContributionPlugin } from "./text-contribution-plugin.mjs";

// Extend the generated composition module after upstream Vite has resolved its profile.
// Mutating its build-time catalog from an external profile does not work: Vite
// bundles its own copy, while external profiles load another Node module instance.
export default defineConfig(async (environment) =>
	mergeConfig(await upstreamConfig(environment), {
		plugins: [
			cubeOfficeBrandingPlugin(),
			cubeOfficeLargeTextPlugin(),
			cubeOfficeTextContributionPlugin(),
		],
		resolve: {
			alias: [
				{
					find: /^@yaochn\/als-office-editor-ui\/document-preview$/,
					replacement: fileURLToPath(new URL("./document-preview.ts", import.meta.url)),
				},
			],
		},
	}),
);
