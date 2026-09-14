export * from "./types.js";
export { convertDocument, exportDocument, conversionTargets } from "./convert.js";
export { writeImageOfd } from "./write.js";
export type { OfdImagePage } from "./write.js";
export { readOfdDocument } from "./read.js";

export { openOfdPackage, createOfdPackage, OfdPackage } from "./package.js";
export type {
	OfdXmlNode,
	OfdAction,
	OfdEmbeddedFile,
	OfdPackageDocument,
	OfdOutline,
} from "./package.js";
export { verifyOfdSignatures, signOfdDocument } from "./signatures.js";
export type {
	OfdSignatureContext,
	OfdSignatureVerification,
	OfdDigest,
	VerifySignatureOptions,
	SignOfdOptions,
} from "./signatures.js";
export { executeOfdActions, readDestination } from "./actions.js";
export type { OfdActionHost, OfdDestination } from "./actions.js";

export { assertOfdPermission } from "./policy.js";
export type { OfdPermissions, OfdViewPreferences } from "./policy.js";
