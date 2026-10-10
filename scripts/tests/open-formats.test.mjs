import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { OPEN_EXTENSIONS, OPEN_FORMATS, OPEN_MIME_TYPES } from "../open-formats.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (file) => readFileSync(new URL(file, `file://${root}`), "utf8");

test("generated host artefacts match scripts/open-formats.mjs", () => {
	const result = spawnSync(process.execPath, ["scripts/sync-open-formats.mjs", "--check"], {
		cwd: root,
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr);
});

test("every format has an engine route unless it must be resolved by content", () => {
	for (const format of OPEN_FORMATS) {
		if (format.extensions.includes("xml")) assert.equal(format.engine, null);
		else assert.ok(format.engine, `${format.label} has no engine`);
	}
});

test("the three Android intent filters register the same MIME list", () => {
	const manifest = read("apps/android/app/src/main/AndroidManifest.xml");
	const blocks = [
		...manifest.matchAll(/<!-- open-formats:start -->([\s\S]*?)<!-- open-formats:end -->/g),
	].map(([, block]) => [...block.matchAll(/android:mimeType="([^"]+)"/g)].map(([, m]) => m));
	assert.equal(blocks.length, 3);
	for (const block of blocks) assert.deepEqual(block, OPEN_MIME_TYPES);
	assert.equal(OPEN_MIME_TYPES.at(-1), "application/octet-stream");
});
