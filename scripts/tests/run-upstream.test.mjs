import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = fileURLToPath(new URL("../../", import.meta.url));
test(
	"upstream adapter runs pnpm from its own package boundary and propagates failures",
	{ skip: process.platform === "win32" },
	(t) => {
		const temp = mkdtempSync(path.join(tmpdir(), "cube-upstream-"));
		t.after(() => rmSync(temp, { recursive: true, force: true }));
		for (const directory of ["scripts", "als-office", "bin"])
			mkdirSync(path.join(temp, directory));
		writeFileSync(
			path.join(temp, "package.json"),
			JSON.stringify({ packageManager: "npm@10.9.8" }),
		);
		writeFileSync(
			path.join(temp, "als-office/package.json"),
			JSON.stringify({ packageManager: "pnpm@10.30.3" }),
		);
		copyFileSync(
			path.join(root, "scripts/run-upstream.mjs"),
			path.join(temp, "scripts/run-upstream.mjs"),
		);
		writeFileSync(
			path.join(temp, "bin/pnpm"),
			`#!${process.execPath}\nconsole.log(JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}));process.exit(Number(process.env.TEST_EXIT));\n`,
			{ mode: 0o755 },
		);
		for (const status of [0, 7]) {
			const result = spawnSync(
				process.execPath,
				[path.join(temp, "scripts/run-upstream.mjs"), "build:packages", "--plan"],
				{
					cwd: temp,
					encoding: "utf8",
					env: {
						...process.env,
						TEST_EXIT: String(status),
						PATH: `${path.join(temp, "bin")}${path.delimiter}${process.env.PATH}`,
					},
				},
			);
			assert.equal(result.status, status, result.stderr);
			assert.deepEqual(JSON.parse(result.stdout), {
				cwd: realpathSync(path.join(temp, "als-office")),
				args: ["run", "build:packages", "--plan"],
			});
		}
	},
);
test("upstream adapter rejects missing script names before spawning", () => {
	const result = spawnSync(process.execPath, [path.join(root, "scripts/run-upstream.mjs")], {
		encoding: "utf8",
	});
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /Specify an upstream package script/);
});
