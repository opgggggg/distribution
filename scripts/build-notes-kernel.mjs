import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const installedRustup = path.join(
	process.env.CARGO_HOME || path.join(os.homedir(), ".cargo"),
	"bin",
	process.platform === "win32" ? "rustup.exe" : "rustup",
);
const compiler = spawnSync(
	existsSync(installedRustup) ? installedRustup : "rustup",
	["which", "--toolchain", "1.88.0", "rustc"],
	{
		cwd: root,
		encoding: "utf8",
	},
);
if (compiler.status !== 0)
	throw Error(
		"Install the pinned Rust toolchain: rustup toolchain install 1.88.0 --profile minimal --target wasm32-unknown-unknown",
	);
const result = spawnSync(
	"cargo",
	[
		"build",
		"--locked",
		"-p",
		"cubeoffice-notes-core",
		"--lib",
		"--release",
		"--target",
		"wasm32-unknown-unknown",
		"--message-format=json-render-diagnostics",
	],
	{
		cwd: root,
		stdio: ["inherit", "pipe", "inherit"],
		encoding: "utf8",
		env: { ...process.env, RUSTC: compiler.stdout.trim() },
	},
);
if (result.status !== 0) process.exit(result.status || 1);
const artifact = result.stdout
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line))
	.find(
		(item) =>
			item.reason === "compiler-artifact" &&
			item.target.name === "cubeoffice_notes_core" &&
			item.filenames.some((file) => file.endsWith(".wasm")),
	);
const wasm = artifact?.filenames.find((file) => file.endsWith(".wasm"));
if (!wasm || !WebAssembly.validate(readFileSync(wasm)))
	throw Error("Rust did not produce a valid notes WASM kernel.");
const target = path.join(root, "packages/notes/src/kernel");
mkdirSync(target, { recursive: true });
copyFileSync(wasm, path.join(target, "notes-kernel.wasm"));
