import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { DOMParser } from "@xmldom/xmldom";
import {
	signOfdDocument,
	verifyOfdSignatures,
	createOfdPackage,
	openOfdPackage,
} from "../dist/index.js";
import { FormatsKernel, loadFormatsKernel } from "@cubexp/kernels";
import { ofd } from "./fixtures.mjs";
const fixtures = JSON.parse(
	await readFile(new URL("./fixtures/rust-signatures.json", import.meta.url), "utf8"),
);
const digest = async (_method, data) => new Uint8Array(createHash("sha1").update(data).digest());
const provider = async (context) => ({
	valid: Buffer.from(await digest("", context.descriptor)).equals(
		Buffer.from(context.signedValue),
	),
	trusted: false,
});
const options = {
	digestMethod: "SHA1",
	signatureMethod: "test-provider-sha1",
	provider: { name: "Test & 中文" },
	signedAt: "2026-10-25T00:00:00Z",
	digest,
	sign: (bytes) => digest("", bytes),
};
for (const item of fixtures.cases)
	test(`Rust verifies original signature semantics: ${item.name}`, async () => {
		assert.deepEqual(
			await verifyOfdSignatures(Buffer.from(item.bytes, "base64"), {
				digest,
				verifySignedValue: provider,
			}),
			item.expected,
		);
	});
test("Rust-generated append signatures retain independent file hashes, opaque resources and original signed bytes", async () => {
	const input = Buffer.from(
		fixtures.cases.find((c) => c.name === "original-seal-stamp").bytes,
		"base64",
	);
	const before = unzipSync(input);
	const output = await signOfdDocument(input, {
		...options,
		seal: new Uint8Array([9, 8, 7]),
		stamps: [{ id: "a&b", pageId: "2", boundary: [1, 2, 3, 4], clip: [0, 1, 2, 3] }],
	});
	const result = await verifyOfdSignatures(output, { digest, verifySignedValue: provider });
	assert.equal(result.length, 2);
	assert.ok(result.every((r) => r.integrity === "valid" && r.cryptographicValidity === "valid"));
	const after = unzipSync(new Uint8Array(await output.arrayBuffer()));
	for (const path of Object.keys(before).filter((p) => !p.endsWith("/Signatures.xml")))
		assert.deepEqual(after[path], before[path]);
	const descriptor = Object.keys(after).find((p) => p.endsWith("/Signature.xml") && !before[p]);
	const doc = new DOMParser().parseFromString(strFromU8(after[descriptor]), "application/xml");
	for (const ref of doc.getElementsByTagNameNS("*", "Reference")) {
		const path = ref.getAttribute("FileRef").slice(1),
			expected = ref.getElementsByTagNameNS("*", "CheckValue")[0].textContent;
		assert.equal(Buffer.from(await digest("", after[path])).toString("base64"), expected);
	}
	assert.equal(doc.getElementsByTagNameNS("*", "StampAnnot")[0].getAttribute("ID"), "a&b");
});
test("security providers cannot mutate source bytes and abort/rejection does not save a partial signature", async () => {
	const source = new Uint8Array(await ofd().arrayBuffer()),
		copy = source.slice();
	await assert.rejects(
		signOfdDocument(source, {
			...options,
			sign: async (data) => {
				data.fill(0);
				throw Error("provider rejected");
			},
		}),
		/provider rejected/,
	);
	assert.deepEqual(source, copy);
	const abort = new AbortController();
	await assert.rejects(
		signOfdDocument(source, {
			...options,
			signal: abort.signal,
			sign: async (data) => {
				abort.abort();
				return digest("", data);
			},
		}),
		{ name: "AbortError" },
	);
	assert.deepEqual(source, copy);
	const signed = await signOfdDocument(source, options);
	const results = await verifyOfdSignatures(signed, {
		digest,
		verifySignedValue: async (context) => {
			context.descriptor.fill(0);
			throw Error("unavailable");
		},
	});
	assert.equal(results[0].integrity, "valid");
	assert.equal(results[0].cryptographicValidity, "unverified");
	assert.equal(results[0].error, "unavailable");
});
test("Rust refuses to append to a protected signature index", async () => {
	const source = Buffer.from(fixtures.cases[0].bytes, "base64"),
		pkg = await openOfdPackage(source);
	const descriptor = pkg.paths.find((p) => p.endsWith("/Signature.xml")),
		index = pkg.paths.find((p) => p.endsWith("/Signatures.xml"));
	const text = new TextDecoder()
		.decode(pkg.read(descriptor))
		.replace(
			"</ofd:References>",
			`<ofd:Reference FileRef="/${index}"><ofd:CheckValue>AA==</ofd:CheckValue></ofd:Reference></ofd:References>`,
		);
	pkg.set(descriptor, new TextEncoder().encode(text));
	await assert.rejects(
		signOfdDocument(pkg.write({ allowInvalidSignatures: true }), options),
		/index is protected/,
	);
});
test("verification reply routing rejects missing, duplicated and mismatched provider output", async () => {
	await loadFormatsKernel();
	const core = new FormatsKernel("ofd");
	try {
		core.open(Buffer.from(fixtures.cases[0].bytes, "base64"));
		const plan = core.request({ op: "verifyPlan" });
		assert.throws(
			() => core.request({ op: "verifyFinish", digests: [], providers: [] }),
			/Missing digest reply/,
		);
		const replies = [];
		for (const [entry, item] of plan.entries())
			for (const [reference, ref] of item.references.entries()) {
				core.request({ op: "part", path: ref.path });
				replies.push({
					entry,
					reference,
					path: ref.path,
					digest: Buffer.from(await digest("", core.save())).toString("base64"),
				});
			}
		assert.throws(
			() =>
				core.request({
					op: "verifyFinish",
					digests: [...replies, replies[0]],
					providers: [],
				}),
			/Duplicate/,
		);
		assert.throws(
			() =>
				core.request({
					op: "verifyFinish",
					digests: [{ ...replies[0], path: "wrong" }, ...replies.slice(1)],
					providers: [],
				}),
			/mismatched/,
		);
		assert.throws(
			() =>
				core.request({
					op: "verifyFinish",
					digests: replies,
					providers: [{ entry: 0, valid: "yes" }],
				}),
			/Invalid security provider/,
		);
		assert.equal(
			core.request({ op: "verifyFinish", digests: replies, providers: [] })[0].integrity,
			"valid",
		);
	} finally {
		core.close();
	}
});
test("new package creation goes through Rust and reopens clean with original extension bytes", async () => {
	const source = unzipSync(new Uint8Array(await ofd().arrayBuffer()));
	const opaque = new Uint8Array([0, 255, 128, 42]);
	const pkg = await createOfdPackage({ ...source, "Doc/opaque.bin": opaque });
	assert.equal(pkg.dirty, false);
	assert.deepEqual(pkg.read("Doc/opaque.bin"), opaque);
	const reopened = await openOfdPackage(pkg.write());
	assert.deepEqual(reopened.read("Doc/opaque.bin"), opaque);
});

test("synchronous Rust writers match every original XML/resource part on their first call", async () => {
	const fixtures = JSON.parse(
		await readFile(new URL("./fixtures/rust-writers.json", import.meta.url), "utf8"),
	);
	const { spawnSync } = await import("node:child_process");
	const child = spawnSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`
        import { writeOfdImages, writeOfdDocx } from "@cubexp/kernels/sync";
        import { unzipSync } from "fflate";
        import { readFileSync } from "node:fs";
        import assert from "node:assert/strict";
        const fixture=JSON.parse(readFileSync(${JSON.stringify(new URL("./fixtures/rust-writers.json", import.meta.url).pathname)},"utf8"));
        const check=(bytes,expected)=>{
            assert.ok(bytes instanceof Uint8Array);
            const parts=unzipSync(bytes);
            assert.deepEqual(Object.keys(parts).sort(),Object.keys(expected).sort());
            for(const [path,data]of Object.entries(expected)) assert.deepEqual(parts[path],new Uint8Array(Buffer.from(data,"base64")),path);
        };
        check(writeOfdImages(fixture.pages.map(p=>({...p,bytes:Buffer.from(p.bytes,"base64")})),fixture.id),fixture.imageParts);
        check(writeOfdDocx(fixture.texts),fixture.docxParts);
    `,
		],
		{ cwd: new URL("../../../", import.meta.url), encoding: "utf8" },
	);
	assert.equal(child.status, 0, child.stderr);
	assert.equal(fixtures.sourceCommit, "43022d3584827e6adb89c18f1d7fa5b50ed17b21");
});
