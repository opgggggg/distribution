import {
	Archive,
	attr,
	children,
	descendants,
	first,
	resolvePath,
	type XmlElement,
} from "./archive.js";
import { OFD_SCHEMA } from "./schema.js";
import { abort, type ReadOptions } from "./types.js";
export interface OfdValidationIssue {
	code: string;
	message: string;
	path: string;
	line?: number;
	xpath?: string;
}
export interface OfdValidationResult {
	valid: boolean;
	issues: OfdValidationIssue[];
	checkedParts: string[];
}
/** Full Annex-A XSD validation plus container links, numeric geometry and scoped IDs. */
export async function validateOfdPackage(
	source: Blob | Uint8Array | ArrayBuffer,
	options: ReadOptions = {},
): Promise<OfdValidationResult> {
	const archive = await Archive.open(source, options),
		{ XmlDocument, XsdValidator, ParseOption } = await import("libxml2-wasm");
	const schema = XmlDocument.fromString(OFD_SCHEMA),
		validator = XsdValidator.fromDoc(schema),
		issues: OfdValidationIssue[] = [],
		checked = new Set<string>(),
		visited = new Set<string>();
	const queue = [{ path: "OFD.xml", scope: "" }],
		ids = new Map<string, Map<string, string>>(),
		refs: { scope: string; id: string; path: string; expected?: string }[] = [],
		maximum = new Map<string, number>();
	const add = (path: string, code: string, message: string) =>
		issues.push({ path, code, message });
	const scalarRefs: Record<string, string> = {
		Font: "Font",
		DrawParam: "DrawParam",
		ColorSpace: "ColorSpace",
		TemplateID: "TemplatePage",
		PageID: "Page",
		PageRef: "Page",
		ImageMask: "MultiMedia",
		Substitution: "MultiMedia",
		Thumbnail: "MultiMedia",
	};
	const declarations = new Set([
		"Page",
		"TemplatePage",
		"ColorSpace",
		"DrawParam",
		"Font",
		"MultiMedia",
		"CompositeGraphicUnit",
		"Layer",
		"TextObject",
		"ImageObject",
		"PathObject",
		"CompositeObject",
		"PageBlock",
		"Annot",
	]);
	try {
		while (queue.length) {
			abort(options.signal);
			const { path, scope } = queue.shift()!,
				key = `${scope}\0${path}`;
			if (visited.has(key)) continue;
			visited.add(key);
			if (!archive.files[path]) {
				add(path, "missing-part", "Missing referenced OFD part.");
				continue;
			}
			let root: XmlElement;
			try {
				root = archive.xml(path);
			} catch (error) {
				add(path, "xml", String(error));
				continue;
			}
			if (!checked.has(path)) {
				checked.add(path);
				let document: InstanceType<typeof XmlDocument> | undefined;
				try {
					document = XmlDocument.fromBuffer(archive.files[path], {
						option: ParseOption.XML_PARSE_NO_XXE | ParseOption.XML_PARSE_NONET,
					});
					validator.validate(document);
				} catch (error) {
					const details = (
						error as { details?: { message: string; line?: number; xpath?: string }[] }
					).details;
					if (details?.length)
						issues.push(...details.map((detail) => ({ path, code: "xsd", ...detail })));
					else add(path, "xsd", String(error));
				} finally {
					document?.dispose();
				}
			}
			const idMap = ids.get(scope) ?? new Map<string, string>();
			ids.set(scope, idMap);
			const nodes = [root, ...descendants(root, "*")];
			const link = (reference: string, isXml: boolean, nextScope = scope, base = path) => {
				try {
					const target = resolvePath(base, reference);
					if (!archive.files[target])
						add(path, "missing-part", `Missing referenced part ${target}.`);
					else if (isXml) queue.push({ path: target, scope: nextScope || target });
				} catch (error) {
					add(path, "path", String(error));
				}
			};
			for (const node of nodes) {
				if (node.namespaceURI !== "http://www.ofdspec.org/2016") continue;
				const name = node.localName!,
					parent = (node.parentNode as XmlElement)?.localName;
				let ancestor = node.parentNode;
				let external = false;
				while (ancestor?.nodeType === 1) {
					if ((ancestor as XmlElement).localName === "Data") {
						external = true;
						break;
					}
					ancestor = ancestor.parentNode;
				}
				if (external || name === "Data") continue;
				if (scope && declarations.has(name) && node.hasAttribute("ID")) {
					const id = attr(node, "ID");
					if (idMap.has(id))
						add(
							path,
							"duplicate-id",
							`ID ${id} is already declared as ${idMap.get(id)}.`,
						);
					else idMap.set(id, name);
				}
				if (name === "MaxUnitID") maximum.set(scope, Number(node.textContent));
				if (node.hasAttribute("Boundary")) {
					const box = attr(node, "Boundary").trim().split(/\s+/).map(Number);
					if (
						box.length !== 4 ||
						box.some((v) => !Number.isFinite(v)) ||
						box[2] < 0 ||
						box[3] < 0
					)
						add(
							path,
							"boundary",
							"Boundary requires four finite numbers and non-negative dimensions.",
						);
				}
				if (node.hasAttribute("CTM")) {
					const m = attr(node, "CTM").trim().split(/\s+/).map(Number);
					if (m.length !== 6 || m.some((v) => !Number.isFinite(v)))
						add(path, "matrix", "CTM requires six finite numbers.");
				}
				for (const [attribute, expected] of Object.entries(scalarRefs))
					if (node.hasAttribute(attribute))
						refs.push({ scope, id: attr(node, attribute), path, expected });
				if (node.hasAttribute("ResourceID"))
					refs.push({
						scope,
						id: attr(node, "ResourceID"),
						path,
						expected:
							name === "CompositeObject" ? "CompositeGraphicUnit" : "MultiMedia",
					});
				if (name === "DrawParam" && node.hasAttribute("Relative"))
					refs.push({ scope, id: attr(node, "Relative"), path, expected: "DrawParam" });
				if (name === "DefaultCS")
					refs.push({
						scope,
						id: node.textContent?.trim() ?? "",
						path,
						expected: "ColorSpace",
					});
				if (name === "DocRoot") {
					link(node.textContent?.trim() ?? "", true, "");
				} else if (
					[
						"PublicRes",
						"DocumentRes",
						"PageRes",
						"Annotations",
						"CustomTags",
						"Extensions",
						"Attachments",
						"Signatures",
					].includes(name) &&
					!children(node).length
				) {
					let owner: XmlElement | undefined = node;
					while (owner && owner.localName !== "DocBody")
						owner =
							owner.parentNode?.nodeType === 1
								? (owner.parentNode as XmlElement)
								: undefined;
					let ownerScope = scope;
					if (owner) {
						try {
							ownerScope = resolvePath(
								"OFD.xml",
								first(owner, "DocRoot")?.textContent?.trim() ?? "",
							);
						} catch (error) {
							add(path, "path", String(error));
							continue;
						}
					}
					link(node.textContent?.trim() ?? "", true, ownerScope);
				} else if (
					node.hasAttribute("BaseLoc") &&
					["Page", "TemplatePage", "Signature", "Version"].includes(name)
				)
					link(attr(node, "BaseLoc"), true, name === "Version" ? "" : scope);
				else if (["MediaFile", "FontFile"].includes(name)) {
					const base = attr(root, "BaseLoc"),
						ref = node.textContent?.trim() ?? "";
					link(ref.startsWith("/") ? ref : base ? `${base}/${ref}` : ref, false);
				} else if (["FileLoc", "SchemaLoc", "ExtendData", "SignedValue"].includes(name))
					link(node.textContent?.trim() ?? "", name === "FileLoc" && parent === "Page");
				else if (name === "BaseLoc" && parent === "Seal")
					link(node.textContent?.trim() ?? "", false);
				if (name === "Reference" && node.hasAttribute("FileRef"))
					link(attr(node, "FileRef"), false);
				if (name === "File" && parent === "FileList")
					link(node.textContent?.trim() ?? "", false);
				if (name === "ColorSpace" && node.hasAttribute("Profile")) {
					const ref = attr(node, "Profile"),
						base = attr(root, "BaseLoc");
					link(ref.startsWith("/") ? ref : base ? `${base}/${ref}` : ref, false);
				}
			}
		}
		for (const ref of refs) {
			const kind = ids.get(ref.scope)?.get(ref.id);
			if (!kind)
				add(ref.path, "unresolved-id", `Unknown ${ref.expected ?? "object"} ID ${ref.id}.`);
			else if (ref.expected && kind !== ref.expected)
				add(
					ref.path,
					"reference-type",
					`ID ${ref.id} is ${kind}, expected ${ref.expected}.`,
				);
		}
		for (const [scope, declared] of maximum) {
			const actual = [...(ids.get(scope)?.keys() ?? [])].reduce(
				(max, id) => Math.max(max, Number(id)),
				0,
			);
			if (actual > declared)
				add(
					scope,
					"max-unit-id",
					`MaxUnitID ${declared} is less than declared ID ${actual}.`,
				);
		}
	} finally {
		validator.dispose();
		schema.dispose();
	}
	return { valid: issues.length === 0, issues, checkedParts: [...checked] };
}
