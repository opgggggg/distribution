/** Frozen provider pixel reference for the image editor's multi-page imports. */
import UTIF from "utif";
import { readFile, writeFile } from "node:fs/promises";
import { OFD_ORACLE_COMMIT } from "./ofd-render-oracle.mjs";
const cases = JSON.parse(
	await readFile(
		new URL("../.cache/notes-qa/tiff-document-inputs.json", import.meta.url),
		"utf8",
	),
);
for (const item of cases) {
	const bytes = new Uint8Array(Buffer.from(item.bytes, "base64"));
	item.pages = UTIF.decode(bytes.buffer).map((page) => {
		UTIF.decodeImage(bytes.buffer, page);
		return {
			width: page.width,
			height: page.height,
			rgba: Buffer.from(UTIF.toRGBA8(page)).toString("base64"),
		};
	});
}
await writeFile(
	new URL("../packages/ofd/tests/fixtures/rust-tiff-pages.json", import.meta.url),
	JSON.stringify(
		{
			provider: "UTIF 3.1.0 (original image import provider)",
			sourceCommit: OFD_ORACLE_COMMIT,
			cases,
		},
		null,
		2,
	) + "\n",
);
console.log(`Recorded ${cases.length} multi-page TIFF documents`);
