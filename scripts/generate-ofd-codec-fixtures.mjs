import { originalOfdModule, OFD_ORACLE_COMMIT } from "./ofd-render-oracle.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { rawPng } from "../packages/ofd/tests/png.mjs";
const original = await originalOfdModule("codecs");
const cases = JSON.parse(
	await readFile(new URL("../.cache/notes-qa/ofd-codec-inputs.json", import.meta.url), "utf8"),
);
for (const item of cases) {
	try {
		const png = (item.format === "BMP" ? original.decodeBmp : original.decodeTiff)(
			new Uint8Array(Buffer.from(item.bytes, "base64")),
		);
		item.expected = rawPng(png);
	} catch (error) {
		item.error = error.message;
	}
}
await writeFile(
	new URL("../packages/ofd/tests/fixtures/rust-codecs.json", import.meta.url),
	JSON.stringify(
		{ oracle: "original BMP/TIFF decoders", sourceCommit: OFD_ORACLE_COMMIT, cases },
		null,
		2,
	) + "\n",
);
console.log(`Recorded ${cases.length} original BMP/TIFF decode results`);
