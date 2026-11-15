import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
if (process.platform !== "darwin")
	throw Error(
		"The Vision helper is built on macOS; provide alternative image services on other platforms.",
	);
const archIndex = process.argv.indexOf("--arch");
const arch = archIndex >= 0 ? process.argv[archIndex + 1] : process.arch === "arm64" ? "arm64" : "x86_64";
if (!["arm64", "x86_64"].includes(arch)) throw Error("Unsupported macOS architecture");
const directory = fileURLToPath(new URL(".", import.meta.url));
mkdirSync(join(directory, "bin"), { recursive: true });
const result = spawnSync(
	"xcrun",
	[
		"swiftc",
		"-O",
		"-target",
		`${arch}-apple-macos14.0`,
		...["main.swift", "GuidedMatte.swift", "SubjectRemoval.swift"].map((n) =>
			join(directory, n),
		),
		"-o",
		join(directory, "bin/psd-images"),
	],
	{ stdio: "inherit" },
);
process.exit(result.status ?? 1);
