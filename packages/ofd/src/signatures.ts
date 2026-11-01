import { Archive } from "./archive.js";
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
interface VerifyPlanEntry {
	id: string;
	digestMethod: string;
	references: { path: string; missing: boolean }[];
	context?: {
		id: string;
		method: string;
		descriptorPath: string;
		valuePath: string;
		sealPath?: string;
		signedAt?: string;
	} | null;
}
/** The provider owns crypto/trust; Rust owns package paths, digest comparison and results. */
export async function verifyOfdSignatures(
	source: Blob | Uint8Array | ArrayBuffer,
	options: VerifySignatureOptions = {},
): Promise<OfdSignatureVerification[]> {
	const archive = await Archive.open(source, options),
		core = archive.core();
	const read = (path: string): Uint8Array => {
		core.request({ op: "part", path });
		return core.save();
	};
	try {
		const plan = core.request<VerifyPlanEntry[]>({ op: "verifyPlan" });
		const digests: Record<string, unknown>[] = [],
			providers: Record<string, unknown>[] = [];
		for (const [entry, item] of plan.entries()) {
			for (const [reference, ref] of item.references.entries()) {
				abort(options.signal);
				if (ref.missing) continue;
				try {
					const digest = await (options.digest ?? webDigest)(
						item.digestMethod,
						read(ref.path),
					);
					digests.push({ entry, reference, path: ref.path, digest: base64(digest) });
				} catch (error) {
					abort(options.signal);
					digests.push({ entry, reference, path: ref.path, error: String(error) });
				}
			}
			if (item.context && options.verifySignedValue) {
				const c = item.context;
				try {
					const result = await options.verifySignedValue({
						id: c.id,
						method: c.method,
						descriptor: read(c.descriptorPath),
						signedValue: read(c.valuePath),
						...(c.sealPath ? { seal: read(c.sealPath) } : {}),
						signedAt: c.signedAt,
					});
					providers.push({
						entry,
						valid: result.valid,
						...(result.trusted === undefined ? {} : { trusted: result.trusted }),
					});
				} catch (error) {
					abort(options.signal);
					providers.push({
						entry,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
		}
		abort(options.signal);
		return core.request({ op: "verifyFinish", digests, providers });
	} finally {
		core.close();
	}
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
		core = archive.core();
	try {
		const plan = core.request<{
			paths: string[];
			descriptorPath: string;
			valuePath: string;
			sealPath?: string | null;
			digestMethod: string;
		}>({
			op: "signBegin",
			documentIndex: options.documentIndex,
			digestMethod: options.digestMethod,
			signatureMethod: options.signatureMethod,
			provider: options.provider,
			signedAt: options.signedAt,
			stamps: options.stamps,
			hasSeal: !!options.seal,
			nonce: crypto.randomUUID(),
			indexNonce: crypto.randomUUID(),
		});
		if (plan.sealPath && options.seal) core.setPart(plan.sealPath, options.seal);
		const hashes: Record<string, string> = Object.create(null);
		for (const path of plan.paths) {
			abort(options.signal);
			core.request({ op: "part", path });
			hashes[path] = base64(
				await (options.digest ?? webDigest)(plan.digestMethod, core.save()),
			);
		}
		core.request({ op: "signDescriptor", hashes });
		const value = await options.sign(core.save());
		abort(options.signal);
		core.setPart(plan.valuePath, value);
		core.request({ op: "write", allowInvalidSignatures: true });
		return blob(core.save(), "application/ofd");
	} finally {
		core.close();
	}
}
