import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareFonts } from "../prepare-cubeoffice-fonts.mjs";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("mirrors fonts, licenses and source archives with pinned integrity and resumable files", async () => {
	const output = await mkdtemp(path.join(os.tmpdir(), "cubeoffice-fonts-"));
	try {
		const base = "https://gitlab.example/release/";
		const font = Buffer.from("font fixture");
		const license = Buffer.from("license fixture");
		const sourceArchive = Buffer.from("source fixture");
		const fontUrl = `${base}${hash(font)}-face.ttf`;
		const licenseUrl = `${base}${hash(license)}-LICENSE.txt`;
		const archiveUrl = `${base}${hash(sourceArchive)}-source.zip`;
		const manifest = Buffer.from(
			JSON.stringify({
				version: "1.0.0",
				fonts: [
					{
						url: fontUrl,
						bytes: font.length,
						integrity: `sha256-${Buffer.from(hash(font), "hex").toString("base64")}`,
						licenseUrl,
					},
				],
				resources: [{ url: archiveUrl }],
			}),
		);
		const source = { manifestUrl: base + "manifest.json", manifestSha256: hash(manifest) };
		const responses = new Map([
			[source.manifestUrl, manifest],
			[fontUrl, font],
			[licenseUrl, license],
			[archiveUrl, sourceArchive],
		]);
		let calls = 0;
		const fetcher = async (url) => {
			calls++;
			assert.ok(responses.has(url));
			return new Response(responses.get(url));
		};
		const result = await prepareFonts({ source, output, fetcher });
		assert.equal(result.files, 3);
		assert.equal(calls, 4);
		const published = await readFile(path.join(result.directory, "office-fonts-manifest.json"));
		assert.equal(hash(published), result.config.manifestSha256);
		assert.ok(!published.toString().includes("gitlab.example"));
		assert.match(
			JSON.parse(published).fonts[0].url,
			/^https:\/\/cubexp.com\/fonts\/releases\//,
		);
		await prepareFonts({ source, output, fetcher });
		assert.equal(calls, 5);
		await assert.rejects(
			prepareFonts({
				source: { ...source, manifestSha256: "0".repeat(64) },
				output,
				fetcher,
			}),
			/catalog integrity/,
		);
		await rm(result.directory, { recursive: true });
		await assert.rejects(
			prepareFonts({
				source,
				output,
				fetcher: async (url) =>
					new Response(url === source.manifestUrl ? manifest : "tampered"),
			}),
			/resource integrity/,
		);
	} finally {
		await rm(output, { recursive: true, force: true });
	}
});
