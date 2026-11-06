import { spawnSync } from "node:child_process";
import { readFileSync, copyFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { writeFormatNotices } from "./rust-format-notices.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const rustup = path.join(
	process.env.CARGO_HOME || path.join(os.homedir(), ".cargo"),
	"bin",
	process.platform === "win32" ? "rustup.exe" : "rustup",
);
const compiler = spawnSync(
	existsSync(rustup) ? rustup : "rustup",
	["which", "--toolchain", "1.88.0", "rustc"],
	{
		encoding: "utf8",
	},
);
if (compiler.status !== 0) throw Error("Install Rust 1.88.0 with target wasm32-unknown-unknown.");
// Prime the locked sources before generating notices from offline metadata.
// Fresh release hosts do not yet have the complete workspace dependency cache.
const fetched = spawnSync("cargo", ["fetch", "--locked"], {
	cwd: root,
	stdio: "inherit",
	env: { ...process.env, RUSTC: compiler.stdout.trim() },
});
if (fetched.status !== 0) process.exit(fetched.status || 1);
writeFormatNotices(root, { ...process.env, RUSTC: compiler.stdout.trim() });
for (const name of ["cubeoffice-formats-core", "cubeoffice-ofd-writer"]) {
	const result = spawnSync(
		"cargo",
		[
			"build",
			"--locked",
			"-p",
			name,
			"--lib",
			"--release",
			"--target",
			"wasm32-unknown-unknown",
			"--message-format=json-render-diagnostics",
		],
		{
			cwd: root,
			encoding: "utf8",
			stdio: ["inherit", "pipe", "inherit"],
			env: { ...process.env, RUSTC: compiler.stdout.trim() },
		},
	);
	if (result.status !== 0) process.exit(result.status || 1);
	const artifact = result.stdout
		.split("\n")
		.filter(Boolean)
		.map((s) => JSON.parse(s))
		.find(
			(a) =>
				a.reason === "compiler-artifact" &&
				a.target.name === name.replaceAll("-", "_") &&
				a.filenames.some((f) => f.endsWith(".wasm")),
		);
	const wasm = artifact?.filenames.find((f) => f.endsWith(".wasm"));
	if (!wasm || !WebAssembly.validate(readFileSync(wasm)))
		throw Error("Rust formats WASM artifact is missing or invalid.");
	const target = path.join(root, "packages/kernels/src");
	mkdirSync(target, { recursive: true });
	if (name === "cubeoffice-formats-core")
		copyFileSync(wasm, path.join(target, "formats-kernel.wasm"));
	else
		writeFileSync(
			path.join(target, "writer-generated.ts"),
			`// Generated from the pinned Rust writer build; do not edit.\nexport const WRITER_WASM_BASE64 = ${JSON.stringify(readFileSync(wasm).toString("base64"))};\n`,
		);
}
