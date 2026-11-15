/** Typed errors for the PSD AI surface. */

import { suggestAiCommandTypes } from "@yaochn/als-office-ooxml-core";

export type PsdAiErrorCode =
	| "InvalidArgument"
	| "LimitExceeded"
	| "ReadOnly"
	| "NotSupported"
	| "PermissionDenied"
	| "RevisionConflict";

export class PsdAiError extends Error {
	readonly code: PsdAiErrorCode;
	readonly commandIndex?: number;
	readonly path?: string;
	readonly details?: Record<string, unknown>;

	constructor(
		code: PsdAiErrorCode,
		message: string,
		options: { commandIndex?: number; path?: string; details?: Record<string, unknown> } = {},
	) {
		super(message);
		this.name = "PsdAiError";
		this.code = code;
		this.commandIndex = options.commandIndex;
		this.path = options.path;
		this.details = options.details;
	}
}

const WRITE_SHAPED =
	/(?:set|add|update|delete|write|save|apply|move|scale|crop|resize|merge|group|rename|duplicate|reorder)/i;

/** Unknown command → did-you-mean, and a ReadOnly hint for write-shaped types. */
export function psdUnknownCommandError(
	type: string,
	commandIndex: number,
	allTypes: Iterable<string>,
	context: { readOnly: boolean },
): PsdAiError {
	const suggestions = suggestAiCommandTypes(type, allTypes);
	if (context.readOnly && WRITE_SHAPED.test(type)) {
		return new PsdAiError(
			"ReadOnly",
			`'${type}' is unavailable: this session is read-only. Write commands are hidden from the manifest.`,
			{ commandIndex },
		);
	}
	const hint = suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : "";
	return new PsdAiError("NotSupported", `Unknown command type '${type}'.${hint}`, {
		commandIndex,
		details: suggestions.length ? { suggestions } : undefined,
	});
}
