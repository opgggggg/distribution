import {
	permissions,
	viewPreferences,
	type OfdPermissions,
	type OfdViewPreferences,
} from "./policy.js";
import {
	Archive,
	attr,
	children,
	first,
	descendants,
	resolvePath,
	zip,
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
function outline(node: XmlElement): OfdOutline {
	return {
		title: attr(node, "Title"),
		expanded: attr(node, "Expanded", "true") === "true",
		actions: readActions(node),
		children: children(node, "OutlineElem").map(outline),
	};
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
	const versions = children(body, "Versions")[0],
		entries = versions ? children(versions, "Version") : [];
	const chosen =
		version === undefined
			? entries.find((v) => attr(v, "Current") === "true")
			: entries.find((v) => attr(v, "ID") === version);
	if (version !== undefined && !chosen) throw new Error(`Unknown OFD version ${version}.`);
	if (chosen) {
		const path = resolvePath("OFD.xml", attr(chosen, "BaseLoc"));
		return resolvePath(path, first(archive.xml(path), "DocRoot")?.textContent?.trim() ?? "");
	}
	return resolvePath("OFD.xml", first(body, "DocRoot")?.textContent?.trim() ?? "");
}
export function describePackage(archive: Archive, options: ReadOptions = {}): OfdPackageDocument[] {
	const root = archive.xml("OFD.xml");
	if (root.localName !== "OFD") throw new Error("Invalid OFD root element.");
	return children(root, "DocBody").map((body, index) => {
		const path = documentPath(
			archive,
			body,
			options.documentIndex === undefined || options.documentIndex === index
				? options.version
				: undefined,
		);
		const document = archive.xml(path);
		const external = (owner: XmlElement, name: string, base: string) => {
			const reference = children(owner, name)[0]?.textContent?.trim();
			if (!reference) return undefined;
			const location = resolvePath(base, reference);
			return archive.files[location]
				? { path: location, xml: xmlNode(archive.xml(location)) }
				: undefined;
		};
		const attachments: OfdEmbeddedFile[] = [];
		const ref = children(document, "Attachments")[0]?.textContent?.trim();
		if (ref) {
			const location = resolvePath(path, ref);
			if (archive.files[location])
				for (const file of children(archive.xml(location), "Attachment")) {
					const source = first(file, "FileLoc")?.textContent?.trim();
					if (source)
						attachments.push({
							id: attr(file, "ID"),
							name: attr(file, "Name"),
							path: resolvePath(location, source),
							mediaType: attr(file, "Format"),
							metadata: xmlNode(file),
						});
				}
		}
		const versionsNode = children(body, "Versions")[0];
		const versions = versionsNode
			? children(versionsNode, "Version").map((version) => {
					const location = resolvePath("OFD.xml", attr(version, "BaseLoc"));
					return {
						id: attr(version, "ID"),
						path: location,
						current: attr(version, "Current") === "true",
						...(archive.files[location] ? { xml: xmlNode(archive.xml(location)) } : {}),
					};
				})
			: [];
		const info = children(body, "DocInfo")[0],
			permissionNode = children(document, "Permissions")[0];
		return {
			path,
			outlineItems: children(document, "Outlines").flatMap((n) =>
				children(n, "OutlineElem").map(outline),
			),
			root: xmlNode(document),
			...(info ? { info: xmlNode(info) } : {}),
			pages: descendants(document, "Page")
				.filter((p) => p.hasAttribute("BaseLoc"))
				.map((page) => ({
					id: attr(page, "ID"),
					path: resolvePath(path, attr(page, "BaseLoc")),
				})),
			outlines: children(document, "Outlines").flatMap((n) =>
				children(n).map((node) => xmlNode(node)),
			),
			bookmarks: children(document, "Bookmarks").flatMap((n) =>
				children(n).map((node) => xmlNode(node)),
			),
			...(permissionNode ? { permissions: xmlNode(permissionNode) } : {}),
			policy: permissions(permissionNode),
			view: viewPreferences(children(document, "VPreferences")[0]),
			actions: readActions(document),
			attachments,
			customTags: external(document, "CustomTags", path),
			extensions: external(document, "Extensions", path),
			annotations: external(document, "Annotations", path),
			signatures: external(body, "Signatures", "OFD.xml"),
			versions,
		};
	});
}

/** Package editing keeps every untouched part byte-for-byte, including extensions. */
export class OfdPackage {
	private readonly originallySigned: boolean;
	private readonly changes = new Map<string, Uint8Array | null>();
	get documents(): OfdPackageDocument[] {
		return describePackage(this.currentArchive());
	}
	constructor(
		private readonly archive: Archive,
		private readonly original: Uint8Array,
	) {
		this.originallySigned = describePackage(archive).some(
			(doc) => doc.signatures !== undefined,
		);
	}
	private currentArchive(): Archive {
		const files = { ...this.archive.files };
		for (const [path, value] of this.changes) {
			if (value === null) delete files[path];
			else files[path] = value;
		}
		return new Archive(files);
	}
	get paths(): string[] {
		return [...new Set([...Object.keys(this.archive.files), ...this.changes.keys()])].filter(
			(path) => this.changes.get(path) !== null,
		);
	}
	get dirty(): boolean {
		return this.changes.size > 0;
	}
	read(path: string): Uint8Array {
		if (resolvePath("", path) !== path) throw new Error("Package paths must be canonical.");
		const value = this.changes.has(path) ? this.changes.get(path) : this.archive.files[path];
		if (!value) throw new Error(`Missing document part: ${path}`);
		return value.slice();
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
		return xmlNode(new Archive({ [path]: this.read(path) }).xml(path));
	}
	set(path: string, data: Uint8Array | string): void {
		if (resolvePath("", path) !== path) throw new Error("Package paths must be canonical.");
		this.changes.set(
			path,
			typeof data === "string" ? new TextEncoder().encode(data) : data.slice(),
		);
	}
	remove(path: string): void {
		this.read(path);
		this.changes.set(path, null);
	}
	/** Changes to signed packages require explicit acknowledgement or re-signing. */
	write(options: { allowInvalidSignatures?: boolean } = {}): Blob {
		if (!this.dirty) return blob(this.original, "application/ofd");
		if (this.originallySigned && !options.allowInvalidSignatures)
			throw new Error("Editing a signed OFD requires re-signing or allowInvalidSignatures.");
		const parts = this.currentArchive().files;
		describePackage(new Archive(parts));
		return blob(zip(parts), "application/ofd");
	}
}
export async function openOfdPackage(
	source: Blob | Uint8Array | ArrayBuffer,
	options: ReadOptions = {},
): Promise<OfdPackage> {
	const archive = await Archive.open(source, options);
	abort(options.signal);
	const bytes =
		source instanceof Blob
			? new Uint8Array(await source.arrayBuffer())
			: source instanceof Uint8Array
				? source
				: new Uint8Array(source);
	return new OfdPackage(archive, bytes.slice());
}

export async function createOfdPackage(
	parts: Record<string, string | Uint8Array>,
	options: ReadOptions = {},
): Promise<OfdPackage> {
	return openOfdPackage(zip(parts), options);
}
