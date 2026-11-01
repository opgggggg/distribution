import { loadFormatsKernel, FormatsKernel } from "@cubexp/kernels";
import type { OfdPermissions, OfdViewPreferences } from "./policy.js";
import {
	Archive,
	attr,
	children,
	first,
	descendants,
	resolvePath,
	type XmlElement,
} from "./archive.js";
import { abort, blob, type ReadOptions } from "./types.js";
import { regionPath } from "./geometry.js";

/** XML inspection view; the package separately retains each original part byte-for-byte. */
export interface OfdXmlNode {
	name: string;
	namespace: string | null;
	attributes: Record<string, string>;
	children: (OfdXmlNode | string)[];
}
export function xmlNode(node: XmlElement, depth = 0): OfdXmlNode {
	if (depth > 256) throw new RangeError("OFD XML inspection depth exceeds the budget.");
	return {
		name: node.tagName,
		namespace: node.namespaceURI,
		attributes: Object.fromEntries(Array.from(node.attributes).map((a) => [a.name, a.value])),
		children: Array.from(node.childNodes).flatMap((child): (OfdXmlNode | string)[] =>
			child.nodeType === 1
				? [xmlNode(child as XmlElement, depth + 1)]
				: child.nodeType === 3 || child.nodeType === 4
					? [child.nodeValue ?? ""]
					: [],
		),
	};
}
export interface OfdAction {
	event: string;
	type: "Goto" | "GotoA" | "URI" | "Sound" | "Movie" | "Unknown";
	parameters: OfdXmlNode;
	/** Closed SVG path in the owning object's coordinate system. */
	region?: string;
}
export function readActions(node: XmlElement): OfdAction[] {
	const actions = children(node, "Actions")[0];
	return actions
		? children(actions, "Action").map((action) => {
				const value = children(action).find((child) =>
					["Goto", "GotoA", "URI", "Sound", "Movie"].includes(child.localName ?? ""),
				);
				const region = children(action, "Region")[0];
				return {
					event: attr(action, "Event"),
					type: (value?.localName ?? "Unknown") as OfdAction["type"],
					parameters: xmlNode(value ?? action),
					...(region ? { region: regionPath(region) } : {}),
				};
			})
		: [];
}
export interface OfdEmbeddedFile {
	id: string;
	name: string;
	path: string;
	mediaType?: string;
	metadata: OfdXmlNode;
}
export interface OfdOutline {
	title: string;
	expanded: boolean;
	actions: OfdAction[];
	children: OfdOutline[];
}
export interface OfdPackageDocument {
	policy: OfdPermissions;
	view: OfdViewPreferences;
	outlineItems: OfdOutline[];
	path: string;
	info?: OfdXmlNode;
	root: OfdXmlNode;
	pages: { id: string; path: string }[];
	outlines: OfdXmlNode[];
	bookmarks: OfdXmlNode[];
	permissions?: OfdXmlNode;
	actions: OfdAction[];
	attachments: OfdEmbeddedFile[];
	customTags?: { path: string; xml: OfdXmlNode };
	extensions?: { path: string; xml: OfdXmlNode };
	annotations?: { path: string; xml: OfdXmlNode };
	signatures?: { path: string; xml: OfdXmlNode };
	versions: { id: string; path: string; current: boolean; xml?: OfdXmlNode }[];
}
/** Select the explicitly requested version, or the version marked Current. */
export function documentPath(archive: Archive, body: XmlElement, version?: string): string {
	const parent = body.parentNode as XmlElement | null;
	const index = parent ? children(parent, "DocBody").indexOf(body) : -1;
	if (index < 0) throw Error("Unknown OFD document.");
	return archive.core().request<{ path: string }>({ op: "documentPath", index, version }).path;
}
export function describePackage(archive: Archive, options: ReadOptions = {}): OfdPackageDocument[] {
	return archive.core().request({
		op: "describe",
		documentIndex: options.documentIndex,
		version: options.version,
	});
}

/** Package editing keeps every untouched part byte-for-byte, including extensions. */
export class OfdPackage {
	private readonly kernel: FormatsKernel;
	get documents(): OfdPackageDocument[] {
		return this.kernel.request({ op: "describe" });
	}
	constructor(archive: Archive, _original?: Uint8Array) {
		this.kernel = archive.core();
		this.kernel.request({ op: "beginEdit" });
	}
	private currentArchive(): Archive {
		return Archive.fromKernel(this.kernel);
	}
	get paths(): string[] {
		return this.kernel.request<{ paths: string[] }>({ op: "state" }).paths;
	}
	get dirty(): boolean {
		return this.kernel.request<{ dirty: boolean }>({ op: "state" }).dirty;
	}
	read(path: string): Uint8Array {
		this.kernel.request({ op: "part", path });
		return this.kernel.save();
	}

	media(
		id: string,
		options: { documentIndex?: number; pageId?: string } = {},
	): { file: OfdEmbeddedFile; blob: Blob } {
		const document = this.documents[options.documentIndex ?? 0];
		if (!document) throw new Error("Unknown OFD document.");
		const current = this.currentArchive();
		const roots = [{ path: document.path, xml: current.xml(document.path) }];
		const page = document.pages.find((page) => page.id === options.pageId);
		if (page) roots.push({ path: page.path, xml: current.xml(page.path) });
		let found: OfdEmbeddedFile | undefined;
		for (const root of roots)
			for (const tag of ["PublicRes", "DocumentRes", "PageRes"])
				for (const ref of descendants(root.xml, tag)) {
					const path = resolvePath(root.path, ref.textContent?.trim() ?? "");
					if (!current.files[path]) continue;
					const res = current.xml(path),
						base = attr(res, "BaseLoc");
					for (const item of descendants(res, "MultiMedia"))
						if (attr(item, "ID") === id) {
							const loc = first(item, "MediaFile")?.textContent?.trim();
							if (loc)
								found = {
									id,
									name: loc.split("/").at(-1)!,
									path: resolvePath(
										path,
										loc.startsWith("/") ? loc : base ? `${base}/${loc}` : loc,
									),
									mediaType: attr(item, "Format"),
									metadata: xmlNode(item),
								};
						}
				}
		if (!found) throw new Error(`Unknown OFD media resource ${id}.`);
		const extension = (found.mediaType || found.name.split(".").at(-1) || "").toLowerCase();
		const types: Record<string, string> = {
			mp4: "video/mp4",
			webm: "video/webm",
			avs: "video/avs",
			mp3: "audio/mpeg",
			wav: "audio/wav",
			ogg: "audio/ogg",
			aac: "audio/aac",
			png: "image/png",
			jpeg: "image/jpeg",
			jpg: "image/jpeg",
			bmp: "image/bmp",
			tif: "image/tiff",
			tiff: "image/tiff",
		};
		return {
			file: found,
			blob: blob(this.read(found.path), types[extension] ?? "application/octet-stream"),
		};
	}
	attachment(id: string, documentIndex = 0): Blob {
		const attachment = this.documents[documentIndex]?.attachments.find(
			(file) => file.id === id,
		);
		if (!attachment) throw new Error(`Unknown OFD attachment ${id}.`);
		const types: Record<string, string> = {
			pdf: "application/pdf",
			ofd: "application/ofd",
			xml: "application/xml",
			txt: "text/plain",
			png: "image/png",
			jpg: "image/jpeg",
			jpeg: "image/jpeg",
		};
		const extension = (
			attachment.mediaType ??
			attachment.name.split(".").at(-1) ??
			""
		).toLowerCase();
		return blob(this.read(attachment.path), types[extension] ?? "application/octet-stream");
	}
	readXml(path: string): OfdXmlNode {
		return this.kernel.request({ op: "xml", path });
	}
	set(path: string, data: Uint8Array | string): void {
		this.kernel.setPart(path, typeof data === "string" ? new TextEncoder().encode(data) : data);
	}
	remove(path: string): void {
		this.kernel.request({ op: "remove", path });
	}
	/** Rust snapshots package parts and enforces the original signed-file policy. */
	write(options: { allowInvalidSignatures?: boolean } = {}): Blob {
		this.kernel.request({
			op: "write",
			allowInvalidSignatures: options.allowInvalidSignatures === true,
		});
		return blob(this.kernel.save(), "application/ofd");
	}
}
export async function openOfdPackage(
	source: Blob | Uint8Array | ArrayBuffer,
	options: ReadOptions = {},
): Promise<OfdPackage> {
	const archive = await Archive.open(source, options);
	abort(options.signal);
	// The Rust archive already owns the original bytes; do not read/copy a Blob twice.
	return new OfdPackage(archive);
}

export async function createOfdPackage(
	parts: Record<string, string | Uint8Array>,
	options: ReadOptions = {},
): Promise<OfdPackage> {
	abort(options.signal);
	await loadFormatsKernel();
	const archive = new Archive(
			Object.fromEntries(
				Object.entries(parts).map(([path, value]) => [
					path,
					typeof value === "string" ? new TextEncoder().encode(value) : value,
				]),
			),
		),
		core = archive.core();
	try {
		core.request({ op: "write" });
		return await openOfdPackage(core.save(), options);
	} finally {
		core.close();
	}
}
