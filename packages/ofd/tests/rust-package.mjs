import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createOfdPackage, openOfdPackage } from "../dist/package.js";
import { Archive } from "../dist/archive.js";
import { FormatsKernel, loadFormatsKernel } from "@cubexp/kernels";
const fixtures = JSON.parse(
	await readFile(new URL("./fixtures/rust-package-projection.json", import.meta.url), "utf8"),
);
for (const item of fixtures.cases)
	test(`Rust package projection matches original TypeScript: ${item.name}`, async () => {
		const pkg = await createOfdPackage(item.parts);
		const bytes = new Uint8Array(await pkg.write().arrayBuffer());
		const archive = await Archive.open(bytes);
		const actual = archive.core().request({ op: "describe", ...item.options });
		assert.deepEqual(actual, item.expected);
	});
test("raw binary uploads remain isolated from input arrays and original package bytes", async () => {
	const pkg = await createOfdPackage(fixtures.cases[1].parts);
	const original = new Uint8Array(await pkg.write().arrayBuffer());
	const data = Uint8Array.from({ length: 1024 * 1024 }, (_, i) => i % 251),
		expected = data.slice();
	pkg.set("Doc/raw.bin", data);
	data.fill(9);
	assert.deepEqual(pkg.read("Doc/raw.bin"), expected);
	const read = pkg.read("Doc/raw.bin");
	read.fill(8);
	assert.deepEqual(pkg.read("Doc/raw.bin"), expected);
	const reopened = await openOfdPackage(pkg.write());
	assert.deepEqual(reopened.read("Doc/raw.bin"), expected);
	const core = new FormatsKernel("ofd");
	core.open(original);
	assert.equal(core.request({ op: "state" }).cacheBytes, 0);
	core.request({ op: "source" });
	assert.deepEqual(core.save(), original);
	core.close();
});
test("metadata inspection never inflates an unrelated attachment", async () => {
	await loadFormatsKernel();
	const parts = {
		...fixtures.cases[1].parts,
		"Doc/large-attachment.bin": new Uint8Array(1024 * 1024),
	};
	const pkg = await createOfdPackage(parts),
		core = new FormatsKernel("ofd");
	core.open(new Uint8Array(await pkg.write().arrayBuffer()));
	assert.equal(core.request({ op: "state" }).cacheBytes, 0);
	core.request({ op: "describe" });
	assert.ok(core.request({ op: "state" }).cacheBytes < 20000);
	core.close();
});
