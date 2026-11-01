import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const rustup = path.join(
	process.env.CARGO_HOME || path.join(os.homedir(), ".cargo"),
	"bin",
	"rustup",
);
function run(command, args, options = {}) {
	const r = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
	if (r.status !== 0) throw Error(`${command} failed (${r.status ?? r.error})`);
	return r;
}
const compiler = spawnSync(
	existsSync(rustup) ? rustup : "rustup",
	["which", "--toolchain", "1.88.0", "rustc"],
	{ encoding: "utf8" },
);
if (compiler.status !== 0)
	throw Error("Install Rust 1.88.0 and the aarch64-apple-ios/aarch64-apple-ios-sim targets.");
run(
	"cargo",
	[
		"build",
		"--locked",
		"-p",
		"cubeoffice-notes-core",
		"--lib",
		"--release",
		"--features",
		"gpu-renderer",
		"--target",
		"aarch64-apple-ios",
		"--target",
		"aarch64-apple-ios-sim",
	],
	{ env: { ...process.env, RUSTC: compiler.stdout.trim() } },
);
const target = path.resolve(root, process.env.CARGO_TARGET_DIR || "target");
const output = path.join(root, "apps/ios/App/Native/CubeNotes.xcframework");
rmSync(output, { recursive: true, force: true });
run("xcodebuild", [
	"-create-xcframework",
	...["aarch64-apple-ios", "aarch64-apple-ios-sim"].flatMap((t) => [
		"-library",
		path.join(target, t, "release/libcubeoffice_notes_core.a"),
		"-headers",
		path.join(root, "crates/notes-core/include"),
	]),
	"-output",
	output,
]);
console.log("Built device and Apple Silicon simulator native notes libraries.");
