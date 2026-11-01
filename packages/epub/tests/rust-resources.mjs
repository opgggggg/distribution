import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { zipSync, unzipSync, strToU8 } from "fflate";
import { buildEpub } from "./fixture.mjs";
import { openEpub } from "../dist/book.js";
import { searchText } from "@cubexp/kernels";

test("EPUB opens without DOMParser and the Rust archive retains original bytes", async () => {
	const old = globalThis.DOMParser;
	delete globalThis.DOMParser;
	try {
		const bytes = buildEpub();
		const book = await openEpub(bytes);
		assert.equal(book.metadata.title, "测试之书");
		assert.deepEqual(book.archive.source(), bytes);
		assert.equal(book.archive.bookProjection.kernel, "rust");
		assert.match(book.readText(book.spine[1].href), /BIRD/);
		book.archive.close();
	} finally {
		if (old) globalThis.DOMParser = old;
	}
});
test("IDPF and Adobe font obfuscation is removed only from resources", async () => {
	const identifier = "urn:uuid:12345678-1234-1234-1234-123456789abc";
	for (const [algorithm, key, limit] of [
		[
			"http://www.idpf.org/2008/embedding",
			createHash("sha1").update(identifier).digest(),
			1040,
		],
		[
			"http://ns.adobe.com/pdf/enc#RC",
			Buffer.from("12345678123412341234123456789abc", "hex"),
			1024,
		],
	]) {
		const files = unzipSync(buildEpub()),
			plain = Uint8Array.from({ length: 1500 }, (_, i) => i % 251),
			encrypted = plain.slice();
		for (let i = 0; i < limit; i++) encrypted[i] ^= key[i % key.length];
        if(algorithm.includes('adobe')) files['OEBPS/content.opf']=strToU8(new TextDecoder().decode(files['OEBPS/content.opf']).replace(identifier,identifier.toUpperCase()));
		files["OEBPS/fonts/body.otf"] = encrypted;
		files["META-INF/encryption.xml"] = strToU8(
			`<encryption><EncryptedData><EncryptionMethod Algorithm="${algorithm}"/><CipherData><CipherReference URI="OEBPS/fonts/body.otf"/></CipherData></EncryptedData></encryption>`,
		);
		const bytes = zipSync(files),
			book = await openEpub(bytes);
		assert.deepEqual(book.read("oebps/fonts/BODY.otf"), plain);
		assert.deepEqual(book.archive.read("OEBPS/fonts/body.otf"), encrypted);
		assert.deepEqual(book.archive.source(), bytes);
		const mutated = book.read("OEBPS/fonts/body.otf");
		mutated[0] = 99;
		assert.deepEqual(
			book.read("OEBPS/fonts/body.otf"),
			plain,
			"resource callers cannot corrupt the cache",
		);
		book.archive.close();
	}
});
test("Unicode search returns original coordinates after expanding lowercase", async () => {
	const book = await openEpub(buildEpub());
	assert.deepEqual(searchText("😀İx BIRD", "bird"), [{ from: 5, to: 9 }]);
	assert.deepEqual(searchText("ΟΣ", "ος"), [{ from: 0, to: 2 }]);
	book.archive.close();
});
