#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
// Run from the upstream package-manager boundary: Corepack must read its pnpm
// version rather than CubeOffice's independent npm workspace declaration.
const script = process.argv[2];
if (!script || script.startsWith("-")) throw Error("Specify an upstream package script.");
const result = spawnSync(
	process.platform === "win32" ? "pnpm.cmd" : "pnpm",
	["run", script, ...process.argv.slice(3)],
	{
		cwd: fileURLToPath(new URL("../als-office", import.meta.url)),
		stdio: "inherit",
		shell: process.platform === "win32",
		env: process.env,
	},
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
