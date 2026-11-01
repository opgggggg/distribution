import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decodeBmp, decodeTiff } from "../dist/codecs.js";
import { readOfdDocument, openOfdPackage } from "../dist/index.js";
import { zipSync, strToU8 } from "fflate";
import { rawPng } from "./png.mjs";
const fixture = JSON.parse(
	await readFile(new URL("./fixtures/rust-codecs.json", import.meta.url), "utf8"),
);
for (const item of fixture.cases)
	test(`Rust image decoding retains original pixels: ${item.name}`, async (t) => {
		const decode = item.format === "BMP" ? decodeBmp : decodeTiff,
			input = Buffer.from(item.bytes, "base64");
		if (item.error) {
			await assert.rejects(decode(input));
			return;
		}
		const png = rawPng(await decode(input));
		assert.equal(png.width, item.expected.width);
		assert.equal(png.height, item.expected.height);
		const actual = Buffer.from(png.rgba, "base64"),
			expected = Buffer.from(item.expected.rgba, "base64");
		let max = 0,
			total = 0;
		for (let i = 0; i < actual.length; i++) {
			const delta = Math.abs(actual[i] - expected[i]);
			max = Math.max(max, delta);
			total += delta;
		}
		t.diagnostic(`maximum channel delta ${max}, mean ${total / actual.length}`);
		assert.ok(
			max <= (item.lossy ? 3 : 0),
			`${item.name}: maximum ${max}, actual ${actual.toString("hex")}, expected ${expected.toString("hex")}`,
		);
	});
test("production OFD rendering decodes embedded compressed images without changing their original parts", async () => {
	for (const name of ["bmp-rle8", "tiff-orientation-6"]) {
		const item = fixture.cases.find((c) => c.name === name),
			image = Buffer.from(item.bytes, "base64"),
			ns = 'xmlns:o="http://www.ofdspec.org/2016"';
		const input = zipSync(
			{
				"OFD.xml": strToU8(
					`<o:OFD ${ns}><o:DocBody><o:DocRoot>Doc.xml</o:DocRoot></o:DocBody></o:OFD>`,
				),
				"Doc.xml": strToU8(
					`<o:Document ${ns}><o:CommonData><o:DocumentRes>Res.xml</o:DocumentRes></o:CommonData><o:Pages><o:Page ID="1" BaseLoc="Page.xml"/></o:Pages></o:Document>`,
				),
				"Res.xml": strToU8(
					`<o:Res ${ns}><o:MultiMedias><o:MultiMedia ID="1" Type="Image"><o:MediaFile>image</o:MediaFile></o:MultiMedia></o:MultiMedias></o:Res>`,
				),
				"Page.xml": strToU8(
					`<o:Page ${ns}><o:Content><o:Layer ID="2"><o:ImageObject ID="3" ResourceID="1" Boundary="0 0 10 10"/></o:Layer></o:Content></o:Page>`,
				),
				image: image,
			},
			{ level: 0 },
		);
		const document = await readOfdDocument(input),
			encoded = document.pages[0].svg.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)[1],
			decoded = rawPng(Buffer.from(encoded, "base64"));
		assert.deepEqual(decoded, item.expected);
		const pkg = await openOfdPackage(input);
		assert.deepEqual(pkg.read("image"), new Uint8Array(image));
		assert.deepEqual(new Uint8Array(await pkg.write().arrayBuffer()), input);
	}
});

test("image editor TIFF page selection retains all original pages and source bytes", async () => {
	const { FormatsKernel, loadFormatsKernel } = await import("@cubexp/kernels");
	await loadFormatsKernel();
	const documents = JSON.parse(
		await readFile(new URL("./fixtures/rust-tiff-pages.json", import.meta.url), "utf8"),
	);
	for (const item of documents.cases) {
		const bytes = Buffer.from(item.bytes, "base64"),
			core = new FormatsKernel("ofd");
		try {
			core.request({ op: "initParts" });
			core.setPart("image", bytes);
			for (const page of [2, 0, 1, 2]) {
				const metadata = core.request({ op: "decodeTiffPage", path: "image", page });
				assert.equal(metadata.kernel, "rust");
				assert.equal(metadata.pages, item.pages.length);
				assert.deepEqual(rawPng(core.save()), item.pages[page]);
				assert.equal(metadata.width, item.pages[page].width);
				assert.equal(metadata.height, item.pages[page].height);
			}
			for (const page of [-1, 1.5, 3])
				assert.throws(
					() => core.request({ op: "decodeTiffPage", path: "image", page }),
					/page/i,
				);
			core.request({ op: "decodeTiffPage", path: "image", page: 1 });
			assert.deepEqual(rawPng(core.save()), item.pages[1]);
			core.request({ op: "part", path: "image" });
			assert.deepEqual(core.save(), new Uint8Array(bytes));
		} finally {
			core.close();
		}
	}
});
