import { prepareImages } from "./codecs.js";
import { Archive, descendants } from "./archive.js";
import { readOfd } from "./ofd.js";
import type { OfdDocument, ReadOptions } from "./types.js";
export async function readOfdDocument(
	source: Blob | Uint8Array | ArrayBuffer,
	options: ReadOptions = {},
): Promise<OfdDocument> {
	const archive = await Archive.open(source, options);
	if (!archive.files["OFD.xml"]) throw new Error("The source is not an OFD document.");
	const resources = await prepareImages(archive, options);
	const hasProfiles = [...resources].some(
		(path) =>
			archive.files[path] &&
			descendants(archive.xml(path), "ColorSpace").some((space) =>
				space.hasAttribute("Profile"),
			),
	);
	if (hasProfiles && !options.colorConverter) {
		const { createIccConverter } = await import("./icc.js"),
			context = await createIccConverter();
		try {
			return readOfd(archive, { ...options, colorConverter: context.convert });
		} finally {
			context.dispose();
		}
	}
	return readOfd(archive, options);
}
