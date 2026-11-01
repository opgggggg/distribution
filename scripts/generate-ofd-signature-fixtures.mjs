import { originalOfdModule } from "./ofd-render-oracle.mjs";
/** Independent interoperability oracle; always uses the pinned pre-migration source. */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { ofd } from "../packages/ofd/tests/fixtures.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const sourceCommit = "43022d3584827e6adb89c18f1d7fa5b50ed17b21";
const { signOfdDocument, verifyOfdSignatures } = await originalOfdModule("signatures");
const digest = async (_method, data) => new Uint8Array(createHash("sha1").update(data).digest());
const provider = async (context) => ({
	valid: Buffer.from(await digest("", context.descriptor)).equals(
		Buffer.from(context.signedValue),
	),
	trusted: false,
});
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
let sequence = 0;
Object.defineProperty(globalThis, "crypto", {
	configurable: true,
	value: {
		subtle: crypto.subtle,
		randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
	},
});
try {
	const cases = [];
	const add = async (name, source) => {
		const bytes = new Uint8Array(source instanceof Blob ? await source.arrayBuffer() : source);
		cases.push({
			name,
			bytes: Buffer.from(bytes).toString("base64"),
			expected: await verifyOfdSignatures(bytes, { digest, verifySignedValue: provider }),
		});
		return bytes;
	};
	const options = {
		digestMethod: "SHA1",
		signatureMethod: "test-provider-sha1",
		provider: { name: "Test & 中文", company: "C<o>", version: "1" },
		signedAt: "2026-10-25T00:00:00Z",
		digest,
		sign: (data) => digest("", data),
	};
	const first = await add("original-single", await signOfdDocument(ofd(), options));
	await add("original-append", await signOfdDocument(first, options));
	await add(
		"original-seal-stamp",
		await signOfdDocument(ofd(), {
			...options,
			seal: new Uint8Array([1, 2, 255, 0]),
			stamps: [{ pageId: "1", boundary: [1.25, 2, 3, 4], clip: [0, 0, 2, 2] }],
		}),
	);
	const parts = unzipSync(first);
	const descriptor = Object.keys(parts).find((p) => p.endsWith("/Signature.xml"));
	const vary = async (name, mutate) => {
		const copy = Object.fromEntries(Object.entries(parts).map(([p, b]) => [p, b.slice()]));
		mutate(copy);
		await add(name, zipSync(copy, { level: 0 }));
	};
	await vary("tampered-file", (p) => (p["Doc/Pages/1.xml"] = strToU8("<Page/>")));
	await vary("missing-protected-file", (p) => delete p["Doc/Pages/1.xml"]);
	await vary(
		"missing-signed-value",
		(p) => delete p[descriptor.replace("Signature.xml", "SignedValue.dat")],
	);
	await vary(
		"malformed-digest",
		(p) =>
			(p[descriptor] = strToU8(
				strFromU8(p[descriptor]).replace(
					/<ofd:CheckValue>[^<]*/,
					"<ofd:CheckValue>!invalid",
				),
			)),
	);
	await vary(
		"relative-file-ref",
		(p) =>
			(p[descriptor] = strToU8(
				strFromU8(p[descriptor]).replace(
					'FileRef="/Doc/Pages/1.xml"',
					'FileRef="Doc/Pages/1.xml"',
				),
			)),
	);
	await vary(
		"empty-references",
		(p) =>
			(p[descriptor] = strToU8(
				strFromU8(p[descriptor]).replace(/<ofd:Reference .*?<\/ofd:Reference>/g, ""),
			)),
	);
	await vary("ECMAScript-base64-whitespace", (p) => {
		p[descriptor] = strToU8(
			strFromU8(p[descriptor]).replaceAll("<ofd:CheckValue>", "<ofd:CheckValue>\ufeff \n"),
		);
	});
	await writeFile(
		path.join(root, "packages/ofd/tests/fixtures/rust-signatures.json"),
		JSON.stringify(
			{ oracle: "original TypeScript signature writer/verifier", sourceCommit, cases },
			null,
			2,
		) + "\n",
	);
	console.log(`Generated ${cases.length} independent signature fixtures from ${sourceCommit}`);
	const originalWriter = await originalOfdModule("write");
	const id = "00000000000040008000000000000001";
	crypto.randomUUID = () => "00000000-0000-4000-8000-000000000001";
	const pages = [
		{ bytes: new Uint8Array([137, 80, 78, 71, 0, 128, 255]), width: 320.5, height: 240 },
		{ bytes: new Uint8Array([255, 216, 255, 42]), width: 640, height: 480 },
	];
	const texts = ["中文<&\u0000\n😀", "line 1\r\nline 2\t'"];
	const writerParts = async (blob) =>
		Object.fromEntries(
			Object.entries(unzipSync(new Uint8Array(await blob.arrayBuffer()))).map(
				([path, bytes]) => [path, Buffer.from(bytes).toString("base64")],
			),
		);
	await writeFile(
		path.join(root, "packages/ofd/tests/fixtures/rust-writers.json"),
		JSON.stringify(
			{
				oracle: "original synchronous TypeScript writers",
				sourceCommit,
				id,
				pages: pages.map((p) => ({ ...p, bytes: Buffer.from(p.bytes).toString("base64") })),
				texts,
				imageParts: await writerParts(originalWriter.writeImageOfd(pages)),
				docxParts: await writerParts(
					originalWriter.writeDocx(texts.map((text) => ({ text }))),
				),
			},
			null,
			2,
		) + "\n",
	);
} finally {
	if (originalCrypto) Object.defineProperty(globalThis, "crypto", originalCrypto);
	else delete globalThis.crypto;
}
