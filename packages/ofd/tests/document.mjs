import { OFD_ARTIFACT_PLUGINS } from "../dist/office.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readOfdDocument, convertDocument, exportDocument, writeImageOfd } from "../dist/index.js";
import { convertDocumentNode } from "../dist/node.js";
import { ofd } from "./fixtures.mjs";
import { PDFDocument } from "pdf-lib";
test("OFD pages, Chinese text, positioning and path commands", async () => {
	const doc = await readOfdDocument(ofd());
	assert.equal(doc.format, "ofd");
	assert.equal(doc.pages.length, 2);
	assert.match(doc.text, /你好 OFD 2/);
	assert.match(doc.pages[0].svg, /C 20 0 0 20 0 0 Z/);
	assert.ok(Math.abs(doc.pages[0].width - 793.7) < 1);
	const txt = await convertDocument(ofd(), "ofd", "txt");
	assert.match(await txt.files[0].blob.text(), /你好/);
	const word = await convertDocument(ofd(), "ofd", "docx");
	assert.equal(
		word.files[0].blob.type,
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	);
	assert.ok(word.diagnostics.some((d) => d.code === "ofd-editable-text"));
});
test("image OFD round-trip retains page dimensions and resources", async () => {
	const png = Uint8Array.from(
		Buffer.from(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
			"base64",
		),
	);
	const file = writeImageOfd([
		{ bytes: png, width: 320, height: 240 },
		{ bytes: png, width: 640, height: 480 },
	]);
	const doc = await readOfdDocument(file);
	assert.equal(doc.pages.length, 2);
	assert.ok(Math.abs(doc.pages[1].width - 640) < 0.01);
	assert.match(doc.pages[0].svg, /data:image\/png;base64/);
	assert.throws(() => writeImageOfd([]), /at least one/);
});
test("OFD bounds, invalid sources and readonly session lifecycle", async () => {
	const source = ofd();
	for (const options of [
		{ maxPages: 1 },
		{ maxSourceBytes: 10 },
		{ maxExpandedBytes: 10 },
		{ maxEntries: 1 },
	])
		await assert.rejects(readOfdDocument(source, options));
	const { archive } = await import("./fixtures.mjs");
	await assert.rejects(readOfdDocument(archive({ "../OFD.xml": "bad" })), /escapes|canonical/);
	await assert.rejects(
		readOfdDocument(
			archive({ "OFD.xml": '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><x/>' }),
		),
		/DTD/,
	);
	await assert.rejects(
		readOfdDocument(archive({ mimetype: "application/vnd.oasis.opendocument.text" })),
		/not an OFD/,
	);
	const abort = new AbortController();
	abort.abort();
	await assert.rejects(readOfdDocument(source, { signal: abort.signal }), { name: "AbortError" });
	const plugin = OFD_ARTIFACT_PLUGINS[0];
	assert.equal(await plugin.canOpen({ source }), true);
	const session = await plugin.open({ source });
	assert.equal(session.getState().readonly, true);
	assert.deepEqual(await (await session.export()).arrayBuffer(), await source.arrayBuffer());
	session.close();
	await assert.rejects(session.export(), /closed/);
	assert.deepEqual(
		OFD_ARTIFACT_PLUGINS.map((p) => p.manifest.id),
		["ofd"],
	);
	await assert.rejects(convertDocument(source, "odt", "pdf"), /Unsupported conversion/);
});
