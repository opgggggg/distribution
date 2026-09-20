#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withNativeBranding } from "./cubeoffice-branding.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
for (const script of ["build:text", "build:ofd"]) {
	const build = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", script], {
		cwd: repositoryRoot,
		// Node refuses to spawn a .cmd without a shell, so a Windows build dies
		// on `npm.cmd` with EINVAL without this.
		shell: process.platform === "win32",
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
const { defaultProfile, profiles, resolveDesktopAppProfileId } = await import(
	pathToFileURL(profileCatalog).href
);
const rawArgs = process.argv.slice(2);
const args = [];
let channel = "";
for (let index = 0; index < rawArgs.length; index += 1) {
	const argument = rawArgs[index];
	if (argument === "--channel") {
		channel = rawArgs[index + 1] ?? "";
		index += 1;
		continue;
	}
	if (argument.startsWith("--channel=")) {
		channel = argument.slice("--channel=".length);
		continue;
	}
	args.push(argument);
}
// Tauri runs `beforeBuildCommand` inside the environment of the build that
// spawned it, and that environment already names the profile being packaged.
// Honouring it keeps a Huawei build from compiling the direct renderer, which
// would ship the market package with its own updater still enabled.
const inheritedProfile = process.env.DESKTOP_APP_PROFILE;
const profileId = resolveDesktopAppProfileId(
	channel ||
		process.env.CUBEOFFICE_CHANNEL ||
		(inheritedProfile && inheritedProfile in profiles ? inheritedProfile : "") ||
		defaultProfile,
);
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
					profileId,
					...args,
				],
			];

const run = (environment) =>
	spawnSync(command[0], command[1], {
		cwd: desktopRoot,
		// Only the renderer branch spawns `npm.cmd`, which Node will not start
		// without a shell; the other branch runs node itself and must stay unshelled
		// so its arguments are not re-parsed.
		shell: process.platform === "win32" && (rendererOnly || rendererDev),
		stdio: "inherit",
		env: {
			...environment,
			DESKTOP_APP_PROFILE: profileId,
			DESKTOP_PROFILE_SERVICE_BINARY: "cubeoffice-ofd-service",
			OFFICE_FONTS_CONFIG: path.join(
				repositoryRoot,
				"profiles/cubeoffice/desktop/font-source.json",
			),
			DESKTOP_APP_PROFILES_PACKAGE: profileCatalog,
		},
	});

const result =
	rendererOnly || rendererDev || args.includes("--print-config")
		? run(process.env)
		: withNativeBranding(repositoryRoot, run);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
