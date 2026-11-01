import { FormatsKernel, loadFormatsKernel } from "@cubexp/kernels";
import { Archive, attr, children, descendants, first, resolvePath, rasterMime } from "./archive.js";
import { documentPath } from "./package.js";
import { abort, type ReadOptions } from "./types.js";
async function decode(bytes: Uint8Array, format: string): Promise<Uint8Array> {
	await loadFormatsKernel();
	const core = new FormatsKernel("ofd");
	try {
		core.request({ op: "initParts" });
		core.setPart("image", bytes);
		core.request({ op: "decodeImage", path: "image", format });
		return core.save();
	} finally {
		core.close();
	}
}
/** Internal compatibility entry points. Production page rendering decodes in the Rust renderer. */
export const decodeBmp = (bytes: Uint8Array) => decode(bytes, "BMP");
export const decodeTiff = (bytes: Uint8Array) => decode(bytes, "TIFF");
/** Resolve only resources reachable from a selected document; attachments are not decoded. */
export async function prepareImages(archive: Archive, options: ReadOptions): Promise<Set<string>> {
	const visited = new Set<string>(),
		resources = new Set<string>(),
		bodies = children(archive.xml("OFD.xml"), "DocBody");
	function visit(path: string): void {
		if (visited.has(path) || !archive.files[path]) return;
		visited.add(path);
		const root = archive.xml(path);
		for (const name of ["PublicRes", "DocumentRes", "PageRes"])
			for (const ref of descendants(root, name))
				resources.add(resolvePath(path, ref.textContent?.trim() ?? ""));
		for (const ref of [...descendants(root, "Page"), ...descendants(root, "TemplatePage")])
			if (ref.hasAttribute("BaseLoc")) visit(resolvePath(path, attr(ref, "BaseLoc")));
	}
	for (const body of options.documentIndex === undefined
		? bodies
		: bodies.slice(options.documentIndex, options.documentIndex + 1))
		visit(documentPath(archive, body, options.version));
	const decoded = new Set<string>();
	for (const path of resources) {
		if (!archive.files[path]) continue;
		const root = archive.xml(path),
			base = attr(root, "BaseLoc");
		for (const media of descendants(root, "MultiMedia")) {
			if (attr(media, "Type", "Image") !== "Image") continue;
			const reference = first(media, "MediaFile")?.textContent?.trim();
			if (!reference) continue;
			const file = resolvePath(
					path,
					reference.startsWith("/")
						? reference
						: base
							? `${base}/${reference}`
							: reference,
				),
				bytes = archive.files[file];
			if (!bytes || decoded.has(file) || rasterMime(bytes)) continue;
			decoded.add(file);
			abort(options.signal);
			// Built-in BMP/TIFF images stay compressed until Rust loads their resource.
			if (
				(bytes[0] === 66 && bytes[1] === 77) ||
				(bytes[0] === 73 && bytes[1] === 73) ||
				(bytes[0] === 77 && bytes[1] === 77)
			)
				continue;
			if (options.decodeImage) {
				const decoded = await options.decodeImage(
					bytes.slice(),
					attr(media, "Format"),
					file,
				);
				if (!rasterMime(decoded))
					throw new Error("decodeImage must return PNG or JPEG bytes.");
				archive.files[file] = decoded.slice();
			}
			abort(options.signal);
		}
	}
	return resources;
}
