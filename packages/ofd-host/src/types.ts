export interface NativePolicy {
	edit: boolean;
	export: boolean;
	sign: boolean;
	annotate: boolean;
	print: boolean;
	copies: number | null;
	printScreen: boolean;
	validFrom: number | null;
	validUntil: number | null;
}
export interface NativeDocument {
	index: number;
	path: string;
	title: string;
	pageIds: string[];
	policy: NativePolicy;
}
export interface NativeSession {
	id: string;
	hash: string;
	name: string;
	documents: NativeDocument[];
	size: number;
}
export interface NativeCapabilities {
	media: {
		available: boolean;
		version: string;
		decoders: string[];
		avs: boolean;
		avs2: boolean;
		avs3: boolean;
		reason: string | null;
		profileNotes: string[];
	};
	printing: { available: boolean; backend: string; format: "png" | "pdf" };
	signatures: { cms: boolean; ses: number[]; sm2: boolean; sm3: boolean };
	sourceLimit: number;
}
export interface TrustAnchor {
	fingerprint: string;
	subject: string;
	pem: string;
	addedAt: number;
}
export interface TrustConfig {
	revision: number;
	systemRoots: boolean;
	onlineRevocation: boolean;
	requireRevocation: boolean;
	anchors: TrustAnchor[];
}
export interface Certificate {
	fingerprint: string;
	subject: string;
	issuer: string;
	validFrom: number;
	validUntil: number;
	pem: string;
}
export interface Revocation {
	status: "good" | "revoked" | "unknown";
	source: string | null;
	detail: string;
	validUntil: number | null;
}
export interface Signer {
	certificate: Certificate;
	chain: Certificate[];
	chainValid: boolean;
	usageValid: boolean;
	revocation: Revocation[];
	detail: string | null;
}
export interface SignatureResult {
	id: string;
	documentIndex: number;
	format: string;
	provider: string;
	claimedTime: string;
	integrity: string;
	cryptographicValidity: string;
	trust: "trusted" | "invalid" | "untrusted" | "unknown";
	references: { path: string; valid: boolean; error: string | null }[];
	signers: Signer[];
	sealValid: boolean | null;
	sealChainValid: boolean | null;
	timestamp: { status: string; time: number | null; detail: string } | null;
	issues: string[];
}
export interface VerificationReport {
	documentHash: string;
	trustRevision: number;
	checkedAt: number;
	recheckAfter: number;
	signatures: SignatureResult[];
}
export interface PreparedMedia {
	path: string;
	mime: string;
	kind: "audio" | "video";
	probe: unknown;
}
export interface PrintJob {
	id: string;
	documentHash: string;
	documentIndex: number;
	copies: number;
	status: "reserved" | "submitted" | "unknown" | "failed";
	printerJob: string | null;
	detail: string | null;
	createdAt: number;
}
export interface PrintStatus {
	remaining: number | null;
	jobs: PrintJob[];
	capability: NativeCapabilities["printing"];
}
