#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const upstreamRoot = path.join(repositoryRoot, "als-office");
const desktopRoot = path.join(upstreamRoot, "apps", "desktop");
const profileCatalog = path.join(
	repositoryRoot,
	"profiles",
	"cubeoffice",
	"desktop",
	"catalog.mjs",
);
const args = process.argv.slice(2);
const rendererOnly = args[0] === "--renderer-only";
const command = rendererOnly
	? [process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"]]
	: [
			process.execPath,
			[
				path.join(desktopRoot, "scripts", "build-desktop.mjs"),
				"--profile",
				"cubeoffice",
				...args,
			],
		];

const result = spawnSync(command[0], command[1], {
	cwd: desktopRoot,
	stdio: "inherit",
	env: {
		...process.env,
		DESKTOP_APP_PROFILE: "cubeoffice",
		OFFICE_FONTS_CONFIG: path.join(
			repositoryRoot,
			"profiles/cubeoffice/desktop/font-source.json",
		),
		DESKTOP_APP_PROFILES_PACKAGE: profileCatalog,
	},
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
