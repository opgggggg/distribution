import assert from "node:assert/strict";
import { test } from "node:test";
import { readTextDocument, highlightText, detectTextLanguage } from "../dist/index.js";

test("reads File, Blob, strings and sliced buffers without changing whitespace", async () => {
	const text = "中文\r\n\tconst x = 1;\r\n";
	const bytes = new TextEncoder().encode(text);
	const padded = new Uint8Array(bytes.length + 4);
	padded.set(bytes, 2);
	for (const source of [text, new Blob([text]), bytes.buffer, padded.subarray(2, -2)]) {
		const result = await readTextDocument(source);
		assert.equal(result.text, text);
		assert.equal(result.lineCount, 3);
	}
	const file = await readTextDocument(new File(["const x = 1;"], "EXAMPLE.JS"));
	assert.equal(file.language, "javascript");
	assert.equal(file.fileName, "EXAMPLE.JS");
	assert.match(file.html, /hljs-keyword/);
	assert.equal((await readTextDocument("https://example.com/file.txt")).text, "https://example.com/file.txt");
});

test("BOM encoding detection and explicit Chinese encoding", async () => {
	assert.equal((await readTextDocument(new Uint8Array([0xff, 0xfe, 0x2d, 0x4e]), { encoding: "utf-8" })).text, "中");
	assert.equal((await readTextDocument(new Uint8Array([0xfe, 0xff, 0x4e, 0x2d]))).text, "中");
	assert.equal((await readTextDocument(new Uint8Array([0xef, 0xbb, 0xbf, 65]))).text, "A");
	assert.equal((await readTextDocument(new Uint8Array([0xd6, 0xd0]), { encoding: "gb18030" })).text, "中");
	await assert.rejects(readTextDocument(new Uint8Array([0xff])), TypeError);
	await assert.rejects(readTextDocument(new Uint8Array([0, 1, 2])), /binary/);
});

test("language mapping, explicit override, HTML escaping and large-text fallback", () => {
	assert.equal(detectTextLanguage("C:\\src\\INDEX.TS"), "typescript");
	assert.equal(detectTextLanguage("unknown.blah"), "plaintext");
	assert.match(highlightText('{"a":true}', { language: "json" }).html, /hljs-attr/);
	for (const options of [{ language: "does-not-exist" }, { language: "xml" }, { language: "xml", maxHighlightLength: 0 }]) {
		const result = highlightText('<script>alert("x")</script>', options);
		assert.ok(!result.html.includes("<script>"));
		assert.match(result.html, /&lt;/);
	}
	assert.equal(highlightText("const x = 1", { language: "javascript", maxHighlightLength: 2 }).highlighted, false);
	assert.equal(highlightText("const x = 1", { fileName: "a.js", language: "plaintext" }).highlighted, false);
});

test("size limits, cancellation and empty input", async () => {
	for (const source of ["中文", new Blob(["中文"]), new TextEncoder().encode("中文")]) {
		await assert.rejects(readTextDocument(source, { maxBytes: 5 }), RangeError);
	}
	await assert.rejects(readTextDocument("x", { signal: AbortSignal.abort() }), { name: "AbortError" });
	await assert.rejects(readTextDocument("", { maxBytes: -1 }), RangeError);
	assert.equal((await readTextDocument("", { maxBytes: 0 })).text, "");
});
