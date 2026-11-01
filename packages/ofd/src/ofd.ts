import { Archive, attr, descendants, resolvePath } from "./archive.js";
import { abort, type OfdDocument, type ReadOptions } from "./types.js";
/** Batch traversal/layout/paint happens in Rust; platform services keep their public contracts. */
export function readOfd(
	archive: Archive,
	options: ReadOptions,
	resources: ReadonlySet<string> = new Set(),
): OfdDocument {
	abort(options.signal);
	// Prefetch provider profiles before entering Rust. A provider never re-enters a borrowed core.
	const profiles = new Map<string, Uint8Array>();
	if (options.colorConverter)
		for (const path of resources) {
			if (!archive.files[path]) continue;
			const root = archive.xml(path),
				base = attr(root, "BaseLoc");
			for (const space of descendants(root, "ColorSpace")) {
				const ref = attr(space, "Profile");
				if (!ref) continue;
				const file = resolvePath(
					path,
					ref.startsWith("/") || !base ? ref : `${base}/${ref}`,
				);
				const bytes = archive.files[file];
				if (bytes) profiles.set(file, bytes);
			}
		}
	const core = archive.core();
	const started = core.request<{ hostVersion: number }>({ op: "renderBegin" });
	if (started.hostVersion !== 1) throw Error("Unsupported OFD render host version.");
	try {
		for (const [path, bytes] of archive.renderOverrides) core.setPart(path, bytes, true);
		for (const [key, bytes] of Object.entries(options.fonts ?? {}))
			core.setRenderAsset(key, bytes);
		if (options.colorConverter)
			core.setColorProvider((request) =>
				options.colorConverter!(request.components, {
					type: request.type,
					bitsPerComponent: request.bitsPerComponent,
					profile: request.profilePath ? profiles.get(request.profilePath) : undefined,
				}),
			);
		const result = core.request<OfdDocument>({
			op: "render",
			options: {
				...Object.fromEntries(
					Object.entries(options).filter(([key]) => key.startsWith("max")),
				),
				paintScale: options.paintScale,
				useImageSubstitutions: options.useImageSubstitutions,
				documentIndex: options.documentIndex,
				version: options.version,
				intent: options.intent,
				colorConverter: !!options.colorConverter,
			},
		});
		abort(options.signal);
		return result;
	} finally {
		core.setColorProvider();
		core.request({ op: "renderEnd" });
	}
}
