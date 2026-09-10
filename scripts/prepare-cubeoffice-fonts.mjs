#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Mirror the pinned public release, including licenses and corresponding sources. */
export async function prepareFonts({
	source,
	output,
	fetcher = (url) => fetch(url, { signal: AbortSignal.timeout(120_000), redirect: "error" }),
}) {
	const response = await fetcher(source.manifestUrl);
	if (!response.ok) throw new Error(`Font catalog: HTTP ${response.status}`);
	const original = Buffer.from(await response.arrayBuffer());
	if (digest(original) !== source.manifestSha256)
		throw new Error("Font catalog integrity mismatch");
	const manifest = JSON.parse(original);
	const version = `${manifest.version}-${source.manifestSha256.slice(0, 12)}`;
	if (!/^[a-zA-Z0-9._-]+$/.test(version)) throw new Error("Invalid font release version");
	const base = `https://cubexp.com/fonts/releases/${version}/`;
	const sourceBase = new URL(".", source.manifestUrl).href;
	const directory = path.join(output, version);
	await mkdir(directory, { recursive: true });
	const files = new Map();
	function mirror(url, size, integrity) {
		if (!url.startsWith(sourceBase)) throw new Error("Font resource outside pinned release");
		const name = url.slice(sourceBase.length);
		if (!/^[a-f0-9]{64}-[a-zA-Z0-9._-]+$/.test(name))
			throw new Error("Invalid font resource name");
		const hash = name.slice(0, 64);
		if (integrity && integrity !== `sha256-${Buffer.from(hash, "hex").toString("base64")}`)
			throw new Error("Font resource digest mismatch");
		files.set(name, { url, hash, size });
		return base + name;
	}
	for (const face of manifest.fonts) {
		face.url = mirror(face.url, face.bytes, face.integrity);
		face.licenseUrl = mirror(face.licenseUrl);
	}
	for (const resource of manifest.resources ?? []) resource.url = mirror(resource.url);
	for (const [name, { url, hash, size }] of files) {
		const target = path.join(directory, name);
		let bytes = await readFile(target).catch((error) => {
			if (error.code !== "ENOENT") throw error;
		});
		if (!bytes || digest(bytes) !== hash || (size !== undefined && bytes.length !== size)) {
			const response = await fetcher(url);
			if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
			bytes = Buffer.from(await response.arrayBuffer());
			if (digest(bytes) !== hash || (size !== undefined && bytes.length !== size))
				throw new Error(`Font resource integrity mismatch: ${name}`);
			await writeFile(target, bytes);
		}
	}
	const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
	const config = {
		manifestUrl: base + "office-fonts-manifest.json",
		manifestSha256: digest(bytes),
	};
	await writeFile(path.join(directory, "office-fonts-manifest.json"), bytes);
	return { config, directory, files: files.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const source = JSON.parse(
		await readFile(path.join(root, "als-office/apps/desktop/font-source.json"), "utf8"),
	);
	const result = await prepareFonts({
		source,
		output: path.join(root, "website/fonts/releases"),
	});
	await writeFile(
		path.join(root, "profiles/cubeoffice/desktop/font-source.json"),
		JSON.stringify(result.config, null, "\t") + "\n",
	);
	await writeFile(
		path.join(root, "website/fonts/index.json"),
		JSON.stringify(result.config, null, "\t") + "\n",
	);
	console.log(`Prepared ${result.files} verified resources in ${result.directory}`);
}
