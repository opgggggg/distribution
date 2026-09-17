#!/usr/bin/env node
import { spawnSync, execFileSync } from "node:child_process";
import {
	readFileSync,
	writeFileSync,
	existsSync,
	mkdirSync,
	copyFileSync,
	cpSync,
	chmodSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2),
	value = (name) => {
		const i = args.indexOf(name);
		return i >= 0 ? args[i + 1] : undefined;
	};
const host = execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(/^host: (.+)$/m)?.[1];
const target = value("--target") ?? host;
if (!target) throw new Error("Unable to determine Rust target");
const debug = args.includes("--debug"),
	extension = target.includes("windows") ? ".exe" : "";
const sourceRoot = path.join(root, "packages/ofd-host"),
	native = path.join(sourceRoot, "native"),
	destination = path.join(root, "als-office/apps/desktop/src-tauri/binaries");
mkdirSync(destination, { recursive: true });
const preparedService = path.join(destination, `cubeoffice-ofd-service-${target}${extension}`);
// Building the OFD host again is the slowest part of a Windows rebuild and it
// only depends on the sidecar sources, so let a repeat build reuse it.
if (process.env.CUBEOFFICE_REUSE_OFD_BINARY === "1" && existsSync(preparedService)) {
	console.log(`Reusing prepared CubeOffice OFD host for ${target}`);
	process.exit(0);
}
const run = (cmd, argv, options = {}) => {
	const r = spawnSync(cmd, argv, { cwd: root, stdio: "inherit", ...options });
	if (r.error) throw r.error;
	if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}`);
};
run("cargo", [
	"build",
	"--locked",
	"--manifest-path",
	path.join(native, "Cargo.toml"),
	...(debug ? [] : ["--release"]),
	...(target !== host ? ["--target", target] : []),
]);
const service = path.join(
	native,
	"target",
	...(target !== host ? [target] : []),
	debug ? "debug" : "release",
	`cubeoffice-ofd-service${extension}`,
);
copyFileSync(service, preparedService);
if (!args.includes("--with-media") && process.env.CUBEOFFICE_BUNDLE_MEDIA !== "1") {
	console.log(`Prepared CubeOffice OFD host for ${target}; optional media transcoder omitted`);
	process.exit(0);
}
let media = process.env.CUBEOFFICE_MEDIA_DIR,
	source = process.env.CUBEOFFICE_MEDIA_SOURCE_DIR;
if (!media) {
	if (target !== host)
		throw new Error(
			"Cross builds require CUBEOFFICE_MEDIA_DIR and CUBEOFFICE_MEDIA_SOURCE_DIR for the target architecture",
		);
	run(process.execPath, [path.join(sourceRoot, "media/build-media.mjs")]);
	const cache = path.resolve(
		process.env.CUBEOFFICE_MEDIA_CACHE ??
			path.join(root, ".cache/ofd-media", `${process.platform}-${process.arch}`),
	);
	media = path.join(cache, "prefix/bin");
	source = path.join(cache, "source-offer");
}
if (!source || !existsSync(source))
	throw new Error(
		"CUBEOFFICE_MEDIA_SOURCE_DIR must contain corresponding codec sources and licenses",
	);
const records = {};
for (const name of ["ffmpeg", "ffprobe"]) {
	const input = path.join(media, `${name}${extension}`);
	if (!existsSync(input)) throw new Error(`Missing ${input}`);
	const output = path.join(destination, `cubeoffice-${name}-${target}${extension}`);
	copyFileSync(input, output);
	if (process.platform !== "win32") chmodSync(output, 0o755);
	records[name] = {
		name: `cubeoffice-${name}${extension}`,
		developmentName: path.basename(output),
		sha256: createHash("sha256").update(readFileSync(output)).digest("hex"),
	};
}
if (target === host) {
	const ffmpeg = path.join(media, `ffmpeg${extension}`);
	const decoders = execFileSync(ffmpeg, ["-hide_banner", "-decoders"], { encoding: "utf8" });
	for (const name of ["cavs", "libdavs2", "libuavs3d", "h264", "aac"])
		if (!new RegExp(`\\b${name}\\b`).test(decoders))
			throw new Error(`Missing required media decoder ${name}`);
	const protocols = execFileSync(ffmpeg, ["-hide_banner", "-protocols"], { encoding: "utf8" });
	if (!/^\s*fd\s*$/m.test(protocols)) throw new Error("Media engine requires fd input");
	const encoders = execFileSync(ffmpeg, ["-hide_banner", "-encoders"], { encoding: "utf8" });
	if (!/\blibx264\b/.test(encoders)) throw new Error("Media engine requires the H.264 encoder");
}
const generated = path.join(root, "profiles/cubeoffice/desktop/generated");
mkdirSync(generated, { recursive: true });
const sources = JSON.parse(readFileSync(path.join(sourceRoot, "media/sources.json"), "utf8"));
const manifest = {
	...records,
	sourceUrls: Object.values(sources).map((s) => s.url),
	requiredDecoders: ["cavs", "libdavs2", "libuavs3d", "h264", "aac"],
};
for (const dir of [generated, destination])
	writeFileSync(path.join(dir, "ofd-engines.json"), JSON.stringify(manifest, null, 2) + "\n");
cpSync(source, path.join(generated, "media-source"), { recursive: true });
console.log(`Prepared CubeOffice OFD host and codec engines for ${target}`);
