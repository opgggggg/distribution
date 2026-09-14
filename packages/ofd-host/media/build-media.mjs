#!/usr/bin/env node
/** Reproducible local codec build. All source archives are pinned and shipped with the app. */
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
	readdirSync,
	copyFileSync,
	chmodSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(path.join(here, "sources.json"), "utf8"));
const root = path.resolve(here, "../../..");
const cache = path.resolve(
	process.env.CUBEOFFICE_MEDIA_CACHE ??
		path.join(root, ".cache/ofd-media", `${process.platform}-${process.arch}`),
);
if (/\s/.test(cache)) throw new Error("Set CUBEOFFICE_MEDIA_CACHE to a directory without spaces.");
const prefix = path.join(cache, "prefix"),
	archiveDir = path.join(cache, "sources");
mkdirSync(archiveDir, { recursive: true });
mkdirSync(prefix, { recursive: true });
const executable = (name) =>
	path.join(prefix, "bin", `${name}${process.platform === "win32" ? ".exe" : ""}`);
const recipe = JSON.stringify({
	sources: catalog,
	revision: 1,
	platform: process.platform,
	arch: process.arch,
});
const key = createHash("sha256").update(recipe).digest("hex");
const marker = path.join(cache, "recipe.sha256");
const run = (program, args, cwd, env = {}) => {
	const result = spawnSync(program, args, {
		cwd,
		env: { ...process.env, ...env },
		stdio: "inherit",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`${program} failed (${result.status})`);
};
const jobs = String(Math.max(1, Math.min(4, Number(process.env.CUBEOFFICE_BUILD_JOBS) || 4)));
const shell = process.env.CUBEOFFICE_BUILD_SHELL ?? "bash";
const configureHost =
	process.platform === "darwin"
		? `${process.arch === "arm64" ? "aarch64" : "x86_64"}-apple-darwin`
		: process.platform === "win32"
			? "x86_64-w64-mingw32"
			: undefined;
for (const [name, item] of Object.entries(catalog)) {
	const archive = path.join(archiveDir, item.archive);
	if (
		!existsSync(archive) ||
		createHash("sha256").update(readFileSync(archive)).digest("hex") !== item.sha256
	) {
		console.log(`Downloading pinned ${name} source`);
		const response = await fetch(item.url, { signal: AbortSignal.timeout(120000) });
		if (!response.ok) throw new Error(`${item.url}: HTTP ${response.status}`);
		const bytes = Buffer.from(await response.arrayBuffer());
		if (createHash("sha256").update(bytes).digest("hex") !== item.sha256)
			throw new Error(`${name} source checksum mismatch`);
		writeFileSync(archive, bytes);
	}
	const directory = path.join(cache, name);
	if (!existsSync(directory)) {
		mkdirSync(directory);
		run("tar", ["-xf", archive, "--strip-components=1", "-C", directory], cache);
	}
}
if (
	!existsSync(marker) ||
	readFileSync(marker, "utf8") !== key ||
	!existsSync(executable("ffmpeg")) ||
	!existsSync(executable("ffprobe"))
) {
	const x264 = path.join(cache, "x264"),
		davs2 = path.join(cache, "davs2/build/linux"),
		uavs3d = path.join(cache, "uavs3d"),
		ffmpeg = path.join(cache, "ffmpeg");
	run(
		shell,
		[
			"./configure",
			`--prefix=${prefix}`,
			"--enable-static",
			"--disable-cli",
			"--disable-opencl",
			"--disable-asm",
			"--enable-pic",
			...(configureHost ? [`--host=${configureHost}`] : []),
		],
		x264,
	);
	run("make", [`-j${jobs}`], x264);
	run("make", ["install"], x264);
	run(
		shell,
		[
			"./configure",
			`--prefix=${prefix}`,
			"--disable-cli",
			"--disable-asm",
			"--enable-pic",
			"--bit-depth=8",
			...(configureHost ? [`--host=${configureHost}`] : []),
		],
		davs2,
	);
	run("make", [`-j${jobs}`], davs2);
	run("make", ["install"], davs2);
	// Build the portable upstream C implementation so no unsupported CPU assembly is selected.
	const header = path.join(uavs3d, "source/decore/com_util.h");
	let source = readFileSync(header, "utf8");
	const start = source.indexOf("/* function selection define based on platforms */");
	if (start >= 0) {
		const end = source.indexOf("#endif", start) + 6;
		source =
			source.slice(0, start) +
			"/* CubeOffice portable C dispatch. */\n#define ENABLE_FUNCTION_C 1\n" +
			source.slice(end);
		writeFileSync(header, source);
	}
	writeFileSync(
		path.join(uavs3d, "version.h"),
		`#define VER_MAJOR 1\n#define VER_MINOR 2\n#define VER_BUILD 0\n#define VERSION_TYPE "release"\n#define VERSION_STR "1.2.0"\n#define VERSION_SHA1 "${catalog.uavs3d.revision}"\n`,
	);
	const files = ["decoder", "decore"].flatMap((dir) =>
		readdirSync(path.join(uavs3d, "source", dir))
			.filter((name) => name.endsWith(".c"))
			.map((name) => ({
				file: `source/${dir}/${name}`,
				object: `obj/${dir}-${name.slice(0, -2)}.o`,
			})),
	);
	const make = [
		`CC ?= cc`,
		`CFLAGS = -O2 -fPIC -std=c99 -DCOMPILE_10BIT=1 -Isource/decore`,
		"all: libuavs3d.a",
		`libuavs3d.a: ${files.map((f) => f.object).join(" ")}`,
		"\tar rcs $@ $^",
	];
	for (const f of files)
		make.push(`${f.object}: ${f.file}`, "\tmkdir -p obj", "\t$(CC) $(CFLAGS) -c $< -o $@");
	writeFileSync(path.join(uavs3d, "Makefile.cubeoffice"), make.join("\n") + "\n");
	run("make", ["-f", "Makefile.cubeoffice", `-j${jobs}`], uavs3d);
	mkdirSync(path.join(prefix, "lib/pkgconfig"), { recursive: true });
	mkdirSync(path.join(prefix, "include"), { recursive: true });
	copyFileSync(path.join(uavs3d, "libuavs3d.a"), path.join(prefix, "lib/libuavs3d.a"));
	copyFileSync(
		path.join(uavs3d, "source/decoder/uavs3d.h"),
		path.join(prefix, "include/uavs3d.h"),
	);
	writeFileSync(
		path.join(prefix, "lib/pkgconfig/uavs3d.pc"),
		`prefix=${prefix}\nlibdir=\${prefix}/lib\nincludedir=\${prefix}/include\nName: uavs3d\nDescription: Portable AVS3 decoder\nVersion: 1.2.0\nLibs: -L\${libdir} -luavs3d -lm -lpthread\nCflags: -I\${includedir}\n`,
	);
	const flags = [
		`--prefix=${prefix}`,
		"--disable-everything",
		"--disable-doc",
		"--disable-debug",
		"--disable-network",
		"--disable-autodetect",
		"--disable-asm",
		"--enable-small",
		"--enable-static",
		"--disable-shared",
		"--enable-gpl",
		"--enable-libx264",
		"--enable-libdavs2",
		"--enable-libuavs3d",
		"--pkg-config-flags=--static",
		`--extra-cflags=-I${prefix}/include`,
		`--extra-ldflags=-L${prefix}/lib`,
		...(process.platform === "darwin" ? ["--extra-libs=-lc++"] : ["--extra-libs=-lstdc++"]),
		"--enable-protocol=file,pipe,fd",
		"--enable-demuxer=mov,matroska,avi,mpegps,mpegts,mp3,wav,aac,flac,ogg,cavsvideo,avs2,avs3",
		"--enable-decoder=h264,hevc,av1,vp8,vp9,mpeg4,mpeg2video,mjpeg,mp3,aac,pcm_s16le,pcm_s16be,opus,vorbis,flac,cavs,libdavs2,libuavs3d",
		"--enable-encoder=libx264,aac,pcm_s16le",
		"--enable-muxer=mp4,wav",
		"--enable-filter=scale,pad,format,aformat,null,anull,aresample,testsrc2,sine",
		"--enable-parser=h264,hevc,av1,vp8,vp9,mpeg4video,mpegaudio,aac,opus,vorbis,cavsvideo,avs2,avs3",
		"--enable-indev=lavfi",
	];
	run(shell, ["./configure", ...flags], ffmpeg, {
		PKG_CONFIG_PATH: path.join(prefix, "lib/pkgconfig"),
	});
	run("make", [`-j${jobs}`], ffmpeg);
	run("make", ["install"], ffmpeg);
	writeFileSync(path.join(cache, "build-flags.json"), JSON.stringify({ key, flags }, null, 2));
	writeFileSync(marker, key);
}
const notice = path.join(cache, "source-offer");
mkdirSync(notice, { recursive: true });
for (const item of Object.values(catalog))
	copyFileSync(path.join(archiveDir, item.archive), path.join(notice, item.archive));
for (const file of ["sources.json", "build-media.mjs"])
	copyFileSync(path.join(here, file), path.join(notice, file));
for (const [name, file] of [
	["ffmpeg", "COPYING.GPLv2"],
	["x264", "COPYING"],
	["davs2", "COPYING"],
	["uavs3d", "LICENSE"],
]) {
	const source = path.join(cache, name, file);
	if (existsSync(source)) copyFileSync(source, path.join(notice, `${name}-LICENSE`));
}
writeFileSync(
	path.join(notice, "README.txt"),
	"CubeOffice media tools are separate GPL executables. Corresponding source archives and the exact build recipe are included here. The uavs3d recipe uses portable C dispatch.\n",
);
console.log(JSON.stringify({ binDir: path.dirname(executable("ffmpeg")), sourceDir: notice, key }));
