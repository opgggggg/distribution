#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
for (const script of ["build:text", "build:ofd"]) {
	const build = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", script], {
		cwd: repositoryRoot,
		// Keep --print-config stdout parseable as JSON.
		stdio: ["inherit", process.stderr, process.stderr],
	});
	if (build.error) throw build.error;
	if (build.status !== 0) process.exit(build.status ?? 1);
}
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
const rendererDev = args[0] === "--renderer-dev";
const rendererConfig = path.join(repositoryRoot, "profiles/cubeoffice/desktop/vite.config.ts");
if (!rendererOnly && !rendererDev && !args.includes("--print-config")) {
	const targetIndex = args.indexOf("--target");
	const preparation = spawnSync(
		process.execPath,
		[
			path.join(repositoryRoot, "scripts/prepare-ofd-host.mjs"),
			...(args.includes("dev") || args.includes("--debug") ? ["--debug"] : []),
			...(targetIndex >= 0 ? ["--target", args[targetIndex + 1]] : []),
		],
		{ cwd: repositoryRoot, stdio: "inherit", env: process.env },
	);
	if (preparation.error) throw preparation.error;
	if (preparation.status !== 0) process.exit(preparation.status ?? 1);
}
const command =
	rendererOnly || rendererDev
		? [
				process.platform === "win32" ? "npm.cmd" : "npm",
				["run", rendererDev ? "dev" : "build", "--", "--config", rendererConfig],
			]
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
		DESKTOP_PROFILE_SERVICE_BINARY: "cubeoffice-ofd-service",
		OFFICE_FONTS_CONFIG: path.join(
			repositoryRoot,
			"profiles/cubeoffice/desktop/font-source.json",
		),
		DESKTOP_APP_PROFILES_PACKAGE: profileCatalog,
	},
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
