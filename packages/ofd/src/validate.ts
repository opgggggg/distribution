import { Archive } from "./archive.js";
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
/** Rust owns container/geometry/ID validation; the existing engine supplies Annex-A XSD results. */
export async function validateOfdPackage(
	source: Blob | Uint8Array | ArrayBuffer,
	options: ReadOptions = {},
): Promise<OfdValidationResult> {
	const archive = await Archive.open(source, options),
		core = archive.core();
	try {
		const plan = core.request<{ checkedParts: string[] }>({ op: "validationPlan" });
		const { XmlDocument, XsdValidator, ParseOption } = await import("libxml2-wasm");
		const schema = XmlDocument.fromString(OFD_SCHEMA);
		try {
			const validator = XsdValidator.fromDoc(schema);
			try {
				const schemas: { path: string; issues: unknown[] }[] = [];
				for (const path of plan.checkedParts) {
					abort(options.signal);
					let document: InstanceType<typeof XmlDocument> | undefined;
					let issues: unknown[] = [];
					try {
						document = XmlDocument.fromBuffer(archive.files[path], {
							option: ParseOption.XML_PARSE_NO_XXE | ParseOption.XML_PARSE_NONET,
						});
						validator.validate(document);
					} catch (error) {
						const details = (
							error as {
								details?: { message: string; line?: number; xpath?: string }[];
							}
						).details;
						issues = details?.length ? details : [{ message: String(error) }];
					} finally {
						document?.dispose();
					}
					schemas.push({ path, issues });
				}
				abort(options.signal);
				return core.request({ op: "validationFinish", schemas });
			} finally {
				validator.dispose();
			}
		} finally {
			schema.dispose();
		}
	} finally {
		core.close();
	}
}
