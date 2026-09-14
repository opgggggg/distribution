import { createHash, verify, type KeyLike, type VerifyKeyObjectInput } from "node:crypto";
import {
	verifyOfdSignatures,
	signOfdDocument,
	type OfdDigest,
	type VerifySignatureOptions,
	type SignOfdOptions,
	type OfdSignatureContext,
} from "./signatures.js";
const hashes: Record<string, string> = {
	"1.2.156.10197.1.401": "sm3",
	SM3: "sm3",
	"1.3.14.3.2.26": "sha1",
	"2.16.840.1.101.3.4.2.1": "sha256",
	"2.16.840.1.101.3.4.2.2": "sha384",
	"2.16.840.1.101.3.4.2.3": "sha512",
};
export const nodeOfdDigest: OfdDigest = async (method, data) =>
	new Uint8Array(
		createHash(hashes[method] ?? method.toLowerCase().replace(/-/g, ""))
			.update(data)
			.digest(),
	);
export const verifyOfdSignaturesNode = (
	source: Blob | Uint8Array | ArrayBuffer,
	options: VerifySignatureOptions = {},
) => verifyOfdSignatures(source, { ...options, digest: options.digest ?? nodeOfdDigest });
export const signOfdDocumentNode = (
	source: Blob | Uint8Array | ArrayBuffer,
	options: SignOfdOptions,
) => signOfdDocument(source, { ...options, digest: options.digest ?? nodeOfdDigest });
/** Raw RSA/ECDSA SignedValue profile. CMS/SES envelopes belong to their security provider. */
export function rawSignatureVerifier(
	publicKey: KeyLike | VerifyKeyObjectInput,
	algorithm: string,
	trusted?: boolean,
) {
	return async (context: OfdSignatureContext) => ({
		valid: verify(algorithm, context.descriptor, publicKey, context.signedValue),
		trusted,
	});
}
