import assert from "node:assert/strict";
import { test } from "node:test";
import { Text } from "@codemirror/state";
import { createTextBuffer } from "../dist/buffer.js";
import { FormatsKernel, loadFormatsKernel } from "@cubexp/kernels";

test("the shipped WASM owns text and incremental Unicode history", async () => {
	await loadFormatsKernel();
	const kernel = new FormatsKernel("text");
	assert.equal(kernel.open(new TextEncoder().encode("😀中")).kernel, "rust");
	kernel.request({ op: "changes", changes: [{ from: 2, to: 3, insert: "水" }] });
	assert.equal(kernel.request({ op: "text" }).text, "😀水");
	assert.throws(
		() => kernel.request({ op: "changes", changes: [{ from: 1, to: 2, insert: "bad" }] }),
		/Unicode/,
	);
	kernel.request({ op: "undo" });
	assert.equal(kernel.request({ op: "text" }).text, "😀中");
	kernel.close();
	assert.throws(() => kernel.save(), /closed/);
});
test("overlapping deliveries are ordered and acknowledge their detached snapshots", async () => {
	const buffer = await createTextBuffer("original");
	buffer.setText("first");
	let release;
	const writes = [];
	const first = buffer.saveFile({
		deliver: (blob) =>
			new Promise((resolve) => {
				writes.push(blob);
				release = resolve;
			}),
	});
	await Promise.resolve();
	buffer.setText("second");
	const second = buffer.saveFile({
		deliver: async (blob) => {
			writes.push(blob);
		},
	});
	buffer.setText("third");
	assert.equal(writes.length, 1);
	release();
	await first;
	await second;
	assert.deepEqual(await Promise.all(writes.map((b) => b.text())), ["first", "second"]);
	assert.equal(buffer.getText(), "third");
	assert.equal(buffer.isDirty(), true);
	buffer.undo();
	assert.equal(buffer.getText(), "second");
	assert.equal(buffer.isDirty(), false);
	buffer.redo();
	assert.equal(buffer.getText(), "third");
	buffer.close();
});
test("incremental edits preserve UTF-16 boundaries and original mixed newlines", async () => {
	const original = "a😀\r\nb\nc\r";
	const buffer = await createTextBuffer(original);
	const doc = buffer.getDocument();
	const changed = doc.replace(3, 3, Text.of(["水"]));
	buffer.setDocument(changed);
	assert.equal(buffer.getText(), "a😀水\r\nb\r\nc\r\n");
	buffer.undo();
	assert.equal(await (await buffer.exportFile()).text(), original);
	buffer.close();
});

test("encoding yields while a detached snapshot remains unchanged", async () => {
	const buffer = await createTextBuffer("a");
	const text = "😀中文\n".repeat(100000);
	buffer.setText(text);
	let turns = 0;
	const timer = setInterval(() => turns++, 0);
	const saving = buffer.saveFile();
	buffer.setText("edited during encoding");
	try {
		const saved = await saving;
		assert.equal(await saved.text(), text);
		assert.equal(buffer.getText(), "edited during encoding");
		assert.equal(buffer.isDirty(), true);
		assert.ok(turns > 0);
	} finally {
		clearInterval(timer);
		buffer.close();
	}
});

test("emoji replacement and empty UTF-16 edits keep complete code points and BOM", async () => {
	const buffer = await createTextBuffer("a😀z");
	buffer.setDocument(Text.of(["a😁z"]));
	assert.equal(buffer.getText(), "a😁z");
	buffer.close();
	for (const bytes of [new Uint8Array([255, 254, 65, 0]), new Uint8Array([254, 255, 0, 65])]) {
		const text = await createTextBuffer(bytes);
		text.setText("");
		assert.deepEqual(
			new Uint8Array(await (await text.exportFile()).arrayBuffer()),
			bytes.slice(0, 2),
		);
		text.close();
	}
});
