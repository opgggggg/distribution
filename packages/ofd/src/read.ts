import { Archive } from "./archive.js";
import { readOfd } from "./ofd.js";
import type { OfdDocument, ReadOptions } from "./types.js";
export async function readOfdDocument(
	source: Blob | Uint8Array | ArrayBuffer,
	options: ReadOptions = {},
): Promise<OfdDocument> {
	const archive = await Archive.open(source, options);
	if (!archive.files["OFD.xml"]) throw new Error("The source is not an OFD document.");
	return readOfd(archive, options);
}
