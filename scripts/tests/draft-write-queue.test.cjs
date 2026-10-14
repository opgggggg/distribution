const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const source = fs.readFileSync(
	require("node:path").join(__dirname, "../../apps/harmony/web/src/draft-write-queue.ts"),
	"utf8",
);
const moduleScope = { exports: {} };
vm.runInNewContext(
	ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
	}).outputText,
	{ exports: moduleScope.exports, Map, Promise },
);
const { DraftWriteQueue } = moduleScope.exports;
test("a slow old export cannot replace a newer durable draft", async () => {
	const queue = new DraftWriteQueue();
	const old = queue.capture(),
		fresh = queue.capture();
	let disk = "";
	assert.equal(
		await queue.write("document", fresh, async () => {
			disk = "new edits";
		}),
		true,
	);
	assert.equal(
		await queue.write("document", old, async () => {
			disk = "old export";
		}),
		false,
	);
	assert.equal(disk, "new edits");
});
test("a failed write does not poison retries; writes to one document stay serialized", async () => {
	const queue = new DraftWriteQueue();
	let disk = "";
	let release;
	await assert.rejects(
		queue.write("document", queue.capture(), async () => {
			throw new Error("quota");
		}),
		/quota/,
	);
	const gate = new Promise((resolve) => (release = resolve));
	const first = queue.write("document", queue.capture(), async () => {
		await gate;
		disk = "first";
	});
	const second = queue.write("document", queue.capture(), async () => {
		disk = "second";
	});
	await Promise.resolve();
	assert.equal(disk, "");
	release();
	await Promise.all([first, second]);
	assert.equal(disk, "second");
});
