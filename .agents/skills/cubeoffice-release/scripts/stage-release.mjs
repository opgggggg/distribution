#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
	access,
	copyFile,
	mkdir,
	open,
	readFile,
	readdir,
	stat,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const requiredFlags = [
	"version",
	"notes",
	"output",
	"mac-dmg",
	"mac-updater",
	"windows",
	"linux-appimage",
	"linux-deb",
];
const allowedFlags = new Set([...requiredFlags, "pub-date"]);

function usage() {
	return `Stage one complete CubeOffice desktop release.

Usage:
  node stage-release.mjs \\
    --version <semver> --notes <text> --output <empty-directory> \\
    --mac-dmg <path> --mac-updater <path> --windows <path> \\
    --linux-appimage <path> --linux-deb <path> [--pub-date <ISO-8601>]

Each updater artifact must have a non-empty sibling file named <artifact>.sig.
The output directory may be absent or empty; non-empty directories are rejected.`;
}

function parseArgs(argv) {
	const options = {};
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--help" || argument === "-h") return { help: true };
		if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
		const name = argument.slice(2);
		if (!allowedFlags.has(name)) throw new Error(`Unknown option: ${argument}`);
		if (options[name] !== undefined) throw new Error(`Duplicate option: ${argument}`);
		const value = argv[index + 1];
		if (!value || value.startsWith("--")) throw new Error(`${argument} needs a value.`);
		options[name] = value;
		index += 1;
	}
	for (const flag of requiredFlags) {
		if (!options[flag]?.trim()) throw new Error(`--${flag} is required.`);
	}
	return options;
}

function validateVersion(version) {
	if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
		throw new Error(`Invalid release version: ${version}`);
	}
}

async function ensureEmptyOutput(output) {
	try {
		const entries = await readdir(output);
		if (entries.length) throw new Error(`Output directory is not empty: ${output}`);
	} catch (cause) {
		if (cause?.code !== "ENOENT") throw cause;
		await mkdir(output, { recursive: true });
	}
}

async function readPrefix(file, length, position = 0) {
	const handle = await open(file, "r");
	try {
		const buffer = Buffer.alloc(length);
		const { bytesRead } = await handle.read(buffer, 0, length, position);
		return buffer.subarray(0, bytesRead);
	} finally {
		await handle.close();
	}
}

async function validateFile(label, file) {
	await access(file);
	const details = await stat(file);
	if (!details.isFile() || details.size === 0) {
		throw new Error(`${label} is empty or not a file: ${file}`);
	}
	return details;
}

async function validatePrefix(label, file, magic) {
	await validateFile(label, file);
	const prefix = await readPrefix(file, magic.length);
	if (!prefix.equals(magic)) throw new Error(`${label} has unexpected file magic: ${file}`);
}

async function validateDmg(file) {
	const details = await validateFile("macOS DMG", file);
	if (details.size < 512) throw new Error(`macOS DMG is too small: ${file}`);
	const trailer = await readPrefix(file, 4, details.size - 512);
	if (!trailer.equals(Buffer.from("koly"))) {
		throw new Error(`macOS DMG has unexpected trailer: ${file}`);
	}
}

async function readSignature(artifact) {
	const signaturePath = `${artifact}.sig`;
	await validateFile("Updater signature", signaturePath);
	const signature = (await readFile(signaturePath, "utf8")).trim();
	if (!signature) throw new Error(`Updater signature is empty: ${signaturePath}`);
	return { signature, signaturePath };
}

async function sha256(file) {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(file)) hash.update(chunk);
	return hash.digest("hex");
}

async function copy(source, destination) {
	await mkdir(path.dirname(destination), { recursive: true });
	await copyFile(source, destination);
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		console.log(usage());
		return;
	}

	const version = options.version.trim();
	validateVersion(version);
	const pubDate = options["pub-date"] || new Date().toISOString();
	if (Number.isNaN(Date.parse(pubDate))) throw new Error(`Invalid --pub-date: ${pubDate}`);
	const output = path.resolve(options.output);
	await ensureEmptyOutput(output);

	const inputs = {
		macDmg: path.resolve(options["mac-dmg"]),
		macUpdater: path.resolve(options["mac-updater"]),
		windows: path.resolve(options.windows),
		linuxAppImage: path.resolve(options["linux-appimage"]),
		linuxDeb: path.resolve(options["linux-deb"]),
	};

	await validateDmg(inputs.macDmg);
	await validatePrefix("macOS updater", inputs.macUpdater, Buffer.from([0x1f, 0x8b]));
	await validatePrefix("Windows installer", inputs.windows, Buffer.from("MZ"));
	await validatePrefix(
		"Linux AppImage",
		inputs.linuxAppImage,
		Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
	);
	await validatePrefix("Linux DEB", inputs.linuxDeb, Buffer.from("!<arch>\n"));

	const signatures = {
		mac: await readSignature(inputs.macUpdater),
		windows: await readSignature(inputs.windows),
		linux: await readSignature(inputs.linuxAppImage),
	};
	const names = {
		macDmg: `CubeOffice-${version}-macOS-arm64.dmg`,
		macUpdater: `CubeOffice-${version}-macOS-arm64.app.tar.gz`,
		windows: `CubeOffice-${version}-Windows-x64-setup.exe`,
		linuxAppImage: `CubeOffice-${version}-Linux-x86_64.AppImage`,
		linuxDeb: `CubeOffice-${version}-Linux-x86_64.deb`,
	};
	const downloads = path.join(output, "downloads");
	const updates = path.join(output, "updates", version);

	for (const key of ["macDmg", "windows", "linuxAppImage", "linuxDeb"]) {
		await copy(inputs[key], path.join(downloads, names[key]));
	}
	await copy(inputs.macUpdater, path.join(updates, names.macUpdater));
	await copy(signatures.mac.signaturePath, path.join(updates, `${names.macUpdater}.sig`));
	await copy(inputs.windows, path.join(updates, names.windows));
	await copy(signatures.windows.signaturePath, path.join(updates, `${names.windows}.sig`));
	await copy(inputs.linuxAppImage, path.join(updates, names.linuxAppImage));
	await copy(signatures.linux.signaturePath, path.join(updates, `${names.linuxAppImage}.sig`));

	const checksumOrder = ["macDmg", "windows", "linuxAppImage", "linuxDeb"];
	const checksums = [];
	for (const key of checksumOrder) {
		const file = path.join(downloads, names[key]);
		checksums.push(`${await sha256(file)}  ${names[key]}`);
	}
	await writeFile(path.join(downloads, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`);

	const manifest = {
		version,
		notes: options.notes,
		pub_date: new Date(pubDate).toISOString(),
		platforms: {
			"darwin-aarch64": {
				signature: signatures.mac.signature,
				url: `https://cubexp.com/updates/${version}/${names.macUpdater}`,
			},
			"windows-x86_64": {
				signature: signatures.windows.signature,
				url: `https://cubexp.com/updates/${version}/${names.windows}`,
			},
			"linux-x86_64": {
				signature: signatures.linux.signature,
				url: `https://cubexp.com/updates/${version}/${names.linuxAppImage}`,
			},
		},
	};
	await mkdir(path.join(output, "updates"), { recursive: true });
	await writeFile(
		path.join(output, "updates", "latest.json"),
		`${JSON.stringify(manifest, null, "\t")}\n`,
	);

	console.log(
		JSON.stringify(
			{
				version,
				output,
				downloads: checksumOrder.map((key) => names[key]),
				updaterPlatforms: Object.keys(manifest.platforms),
				checksums,
			},
			null,
			2,
		),
	);
}

main().catch((cause) => {
	console.error(cause instanceof Error ? cause.message : cause);
	process.exitCode = 1;
});
