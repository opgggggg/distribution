import { XMLSerializer } from "@xmldom/xmldom";
import {
	Archive,
	attr,
	children,
	first,
	descendants,
	resolvePath,
	escapeXml as e,
	zip,
	parseXml,
} from "./archive.js";
import { abort, blob, type ReadOptions } from "./types.js";
export interface OfdSignatureContext {
	id: string;
	method: string;
	descriptor: Uint8Array;
	signedValue: Uint8Array;
	seal?: Uint8Array;
	signedAt?: string;
}
export interface OfdSignatureVerification {
	id: string;
	references: { path: string; valid: boolean; error?: string }[];
	/** Reference hashes alone never establish a valid digital signature. */
	integrity: "valid" | "invalid" | "unsupported";
	cryptographicValidity: "valid" | "invalid" | "unverified";
	trust: "trusted" | "untrusted" | "unknown";
	error?: string;
}
export type OfdDigest = (method: string, data: Uint8Array) => Promise<Uint8Array>;
export interface VerifySignatureOptions extends ReadOptions {
	digest?: OfdDigest;
	/** GB/T 33190 delegates SignedValue encoding and cryptography to the security provider. */
	verifySignedValue?: (
		context: OfdSignatureContext,
	) => Promise<{ valid: boolean; trusted?: boolean }>;
}
const hashNames: Record<string, string> = {
	"SHA-1": "SHA-1",
	SHA1: "SHA-1",
	"1.3.14.3.2.26": "SHA-1",
	"SHA-256": "SHA-256",
	SHA256: "SHA-256",
	"2.16.840.1.101.3.4.2.1": "SHA-256",
	"SHA-384": "SHA-384",
	SHA384: "SHA-384",
	"2.16.840.1.101.3.4.2.2": "SHA-384",
	"SHA-512": "SHA-512",
	SHA512: "SHA-512",
	"2.16.840.1.101.3.4.2.3": "SHA-512",
};
export const webDigest: OfdDigest = async (method, data) => {
	const name = hashNames[method] ?? hashNames[method.toUpperCase()];
	if (!name) throw new Error(`Unsupported digest algorithm: ${method}.`);
	return new Uint8Array(await crypto.subtle.digest(name, data.slice().buffer));
};
const base64 = (data: Uint8Array) => {
	let value = "";
	for (let i = 0; i < data.length; i += 8192)
		value += String.fromCharCode(...data.subarray(i, i + 8192));
	return btoa(value);
};
function decode(value: string): Uint8Array {
	const clean = value.replace(/\s+/g, "");
	if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(clean))
		throw new Error("Invalid signature digest encoding.");
	return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
}
function equal(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}
export async function verifyOfdSignatures(
	source: Blob | Uint8Array | ArrayBuffer,
	options: VerifySignatureOptions = {},
): Promise<OfdSignatureVerification[]> {
	const archive = await Archive.open(source, options),
		ofd = archive.xml("OFD.xml"),
		results: OfdSignatureVerification[] = [];
	for (const body of children(ofd, "DocBody")) {
		const reference = children(body, "Signatures")[0]?.textContent?.trim();
		if (!reference) continue;
		const indexPath = resolvePath("OFD.xml", reference);
		for (const entry of children(archive.xml(indexPath), "Signature")) {
			abort(options.signal);
			const result: OfdSignatureVerification = {
				id: attr(entry, "ID"),
				references: [],
				integrity: "invalid",
				cryptographicValidity: "unverified",
				trust: "unknown",
			};
			results.push(result);
			try {
				const path = resolvePath(indexPath, attr(entry, "BaseLoc")),
					root = archive.xml(path),
					signedInfo = children(root, "SignedInfo")[0];
				if (!signedInfo) throw new Error("Signature is missing SignedInfo.");
				const refs = children(signedInfo, "References")[0];
				if (!refs || !children(refs, "Reference").length)
					throw new Error("Signature has no protected file references.");
				const method = attr(refs, "CheckMethod");
				for (const ref of children(refs, "Reference")) {
					abort(options.signal);
					const file = attr(ref, "FileRef");
					if (!file.startsWith("/"))
						throw new Error("Signature FileRef must be an absolute package path.");
					const location = resolvePath("", file),
						data = archive.files[location];
					if (!data) {
						result.references.push({
							path: location,
							valid: false,
							error: "Missing protected file.",
						});
						continue;
					}
					try {
						result.references.push({
							path: location,
							valid: equal(
								await (options.digest ?? webDigest)(method, data),
								decode(first(ref, "CheckValue")?.textContent ?? ""),
							),
						});
					} catch (error) {
						result.integrity = "unsupported";
						result.references.push({
							path: location,
							valid: false,
							error: String(error),
						});
					}
				}
				if (result.integrity !== "unsupported")
					result.integrity = result.references.every((ref) => ref.valid)
						? "valid"
						: "invalid";
				const valuePath = resolvePath(
						path,
						first(root, "SignedValue")?.textContent?.trim() ?? "",
					),
					signedValue = archive.files[valuePath];
				if (!signedValue) throw new Error("Missing SignedValue.");
				const seal = children(signedInfo, "Seal")[0],
					sealRef = seal && first(seal, "BaseLoc")?.textContent?.trim();
				if (options.verifySignedValue) {
					const verification = await options.verifySignedValue({
						id: result.id,
						method: first(signedInfo, "SignatureMethod")?.textContent?.trim() ?? "",
						descriptor: archive.files[path].slice(),
						signedValue: signedValue.slice(),
						...(sealRef
							? { seal: archive.files[resolvePath(path, sealRef)]?.slice() }
							: {}),
						signedAt: first(signedInfo, "SignatureDateTime")?.textContent ?? undefined,
					});
					result.cryptographicValidity = verification.valid ? "valid" : "invalid";
					result.trust =
						verification.trusted === undefined
							? "unknown"
							: verification.trusted
								? "trusted"
								: "untrusted";
				}
			} catch (error) {
				abort(options.signal);
				result.error = error instanceof Error ? error.message : String(error);
			}
		}
	}
	abort(options.signal);
	return results;
}
export interface SignOfdOptions extends ReadOptions {
	documentIndex?: number;
	digestMethod?: string;
	digest?: OfdDigest;
	signatureMethod: string;
	provider: { name: string; company?: string; version?: string };
	signedAt: string;
	seal?: Uint8Array;
	stamps?: {
		id?: string;
		pageId: string;
		boundary: [number, number, number, number];
		clip?: [number, number, number, number];
	}[];
	sign: (descriptor: Uint8Array) => Promise<Uint8Array>;
}
export async function signOfdDocument(
	source: Blob | Uint8Array | ArrayBuffer,
	options: SignOfdOptions,
): Promise<Blob> {
	const archive = await Archive.open(source, options),
		parts = { ...archive.files },
		ofd = archive.xml("OFD.xml"),
		body = children(ofd, "DocBody")[options.documentIndex ?? 0];
	if (!body) throw new RangeError("Document index is outside the OFD package.");
	const serializer = new XMLSerializer(),
		encode = (s: string) => new TextEncoder().encode(s);
	const ns = ofd.namespaceURI || "http://www.ofdspec.org/2016",
		namespace = `xmlns:ofd="${e(ns)}"`;
	let reference = children(body, "Signatures")[0];
	const indexPath = reference
		? resolvePath("OFD.xml", reference.textContent?.trim() ?? "")
		: `Signatures-${crypto.randomUUID()}/Signatures.xml`;
	let index = parts[indexPath]
		? archive.xml(indexPath)
		: parseXml(`<ofd:Signatures ${namespace}/>`);
	// Appending must not invalidate an existing signature that protects the index.
	for (const ref of children(index, "Signature")) {
		const sigPath = resolvePath(indexPath, attr(ref, "BaseLoc")),
			signature = archive.xml(sigPath);
		if (
			descendants(signature, "Reference").some(
				(r) => resolvePath("", attr(r, "FileRef")) === indexPath,
			)
		)
			throw new Error(
				"The signature index is protected; appending would invalidate an existing signature.",
			);
	}
	if (!reference) {
		reference = ofd.ownerDocument!.createElementNS(ns, "ofd:Signatures");
		reference.textContent = indexPath;
		body.appendChild(reference);
		parts["OFD.xml"] = encode(serializer.serializeToString(ofd.ownerDocument!));
	}
	const id = `s${crypto.randomUUID().replace(/-/g, "")}`,
		directory = resolvePath(indexPath, `${id}/placeholder`).replace(/placeholder$/, ""),
		descriptorPath = `${directory}Signature.xml`,
		valuePath = `${directory}SignedValue.dat`;
	const entry = index.ownerDocument!.createElementNS(ns, "ofd:Signature");
	entry.setAttribute("ID", id);
	entry.setAttribute("Type", options.seal ? "Seal" : "Sign");
	entry.setAttribute("BaseLoc", `/${descriptorPath}`);
	index.appendChild(entry);
	index.setAttribute("MaxSignId", id);
	parts[indexPath] = encode(serializer.serializeToString(index));
	if (options.seal) parts[`${directory}Seal.esl`] = options.seal.slice();
	const digestMethod = options.digestMethod ?? "SHA256",
		refs: string[] = [];
	for (const path of Object.keys(parts).sort()) {
		abort(options.signal);
		if (path === indexPath) continue;
		refs.push(
			`<ofd:Reference FileRef="/${e(path)}"><ofd:CheckValue>${base64(await (options.digest ?? webDigest)(digestMethod, parts[path]))}</ofd:CheckValue></ofd:Reference>`,
		);
	}
	const stamps = (options.stamps ?? [])
		.map(
			(s, i) =>
				`<ofd:StampAnnot ID="${e(s.id ?? `${id}-${i}`)}" PageRef="${e(s.pageId)}" Boundary="${s.boundary.join(" ")}"${s.clip ? ` Clip="${s.clip.join(" ")}"` : ""}/>`,
		)
		.join("");
	parts[descriptorPath] = encode(
		`<?xml version="1.0" encoding="UTF-8"?><ofd:Signature ${namespace}><ofd:SignedInfo><ofd:Provider ProviderName="${e(options.provider.name)}"${options.provider.company ? ` Company="${e(options.provider.company)}"` : ""}${options.provider.version ? ` Version="${e(options.provider.version)}"` : ""}/><ofd:SignatureMethod>${e(options.signatureMethod)}</ofd:SignatureMethod><ofd:SignatureDateTime>${e(options.signedAt)}</ofd:SignatureDateTime><ofd:References CheckMethod="${e(digestMethod)}">${refs.join("")}</ofd:References>${stamps}${options.seal ? "<ofd:Seal><ofd:BaseLoc>Seal.esl</ofd:BaseLoc></ofd:Seal>" : ""}</ofd:SignedInfo><ofd:SignedValue>SignedValue.dat</ofd:SignedValue></ofd:Signature>`,
	);
	parts[valuePath] = (await options.sign(parts[descriptorPath].slice())).slice();
	abort(options.signal);
	return blob(zip(parts), "application/ofd");
}
