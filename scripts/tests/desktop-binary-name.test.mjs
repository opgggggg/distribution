import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveProfileRuntimeEnv } from "../../als-office/apps/desktop/scripts/desktop-profiles.mjs";
import { profiles } from "../../profiles/cubeoffice/desktop/catalog.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const targets = ["aarch64-apple-darwin", "x86_64-pc-windows-msvc", "x86_64-unknown-linux-gnu"];

for (const target of targets) {
	test(`CubeOffice binary configuration: ${target}`, () => {
		const config = JSON.parse(
			execFileSync(
				process.execPath,
				[
					path.join(root, "scripts/run-cubeoffice-desktop.mjs"),
					"--print-config",
					"--target",
					target,
				],
				{ encoding: "utf8" },
			),
		);
		assert.equal(config.mainBinaryName, "cubeoffice-app");
		assert.deepEqual(config.bundle.externalBin, ["binaries/cubeoffice"]);
		assert.equal(config.identifier, "com.cubexp.office");
	});
}

test("the app and CLI compile with matching CubeOffice names", () => {
	const env = resolveProfileRuntimeEnv(profiles.cubeoffice);
	assert.equal(env.DESKTOP_APP_BINARY, "cubeoffice-app");
	assert.equal(env.DESKTOP_APP_CLI_BINARY, "cubeoffice");
	assert.equal(env.DESKTOP_APP_IDENTIFIER, "com.cubexp.office");
});

// Exercise real staging with a fake Cargo executable; no native compilation.
for (const target of targets) {
	test(`CLI staging uses the target filename: ${target}`, () => {
		const temp = mkdtempSync(path.join(os.tmpdir(), "cubeoffice-sidecar-test-"));
		try {
			const scripts = path.join(temp, "scripts");
			const bin = path.join(temp, "bin");
			mkdirSync(scripts);
			mkdirSync(bin);
			copyFileSync(
				path.join(root, "als-office/apps/desktop/scripts/prepare-sidecar.mjs"),
				path.join(scripts, "prepare-sidecar.mjs"),
			);
			writeFileSync(
				path.join(bin, "cargo"),
				`#!${process.execPath}
const fs = require("node:fs"), path = require("node:path");
const args = process.argv.slice(2);
if (args[args.indexOf("--bin") + 1] !== "als-office-desktop") process.exit(1);
if (process.env.DESKTOP_APP_IDENTIFIER !== "com.cubexp.office") process.exit(2);
const target = args[args.indexOf("--target") + 1];
const folder = path.join("target", target, "release");
fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(path.join(folder, "als-office-desktop" + (target.includes("windows") ? ".exe" : "")), "compiled-cli");
`,
				{ mode: 0o755 },
			);
			execFileSync(
				process.execPath,
				[path.join(scripts, "prepare-sidecar.mjs"), "--target", target],
				{
					env: {
						...process.env,
						...resolveProfileRuntimeEnv(profiles.cubeoffice),
						PATH: `${bin}${path.delimiter}${process.env.PATH}`,
					},
				},
			);
			const suffix = target.includes("windows") ? ".exe" : "";
			assert.equal(
				readFileSync(
					path.join(temp, "src-tauri/binaries", `cubeoffice-${target}${suffix}`),
					"utf8",
				),
				"compiled-cli",
			);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});
}
