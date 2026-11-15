/**
 * Policy for the PSD AI surface, separately testable from dispatch: the
 * forbidden-field assertion, response budgeting, and the whole `manifest.get`
 * query protocol.
 */

import {
	aiResponseByteLength,
	renderAiSchemaSignature,
	shrinkAiResponsePage,
	suggestAiCommandTypes,
} from "@yaochn/als-office-ooxml-core";
import { PsdAiError } from "./ai-errors";
import {
	PSD_AI_COMMAND_GROUPS,
	PSD_AI_COORDINATE_SPACE,
	PSD_AI_FORBIDDEN_FIELDS,
	PSD_AI_MANIFEST_VERSION,
	PSD_AI_SCHEMA_DEFS,
	psdAiManifestHash,
	type PsdAiCommandDescriptor,
} from "./ai-manifest";

export function assertNoForbiddenAiFields(
	command: Record<string, unknown>,
	commandIndex: number,
): void {
	for (const field of Object.keys(command)) {
		if (PSD_AI_FORBIDDEN_FIELDS.has(field)) {
			throw new PsdAiError(
				"InvalidArgument",
				`'${field}' is host-assigned and cannot be supplied by a caller.`,
				{ commandIndex, path: field },
			);
		}
	}
}

/** Refuses (never trims) a single-value read that exceeds the budget. */
export function assertReadWithinBudget(
	value: unknown,
	limit: number,
	hint: string,
	commandIndex: number,
): void {
	const bytes = aiResponseByteLength(value);
	if (bytes > limit) {
		throw new PsdAiError(
			"LimitExceeded",
			`The response is ${bytes} bytes, over the ${limit} byte budget. ${hint}`,
			{ commandIndex },
		);
	}
}

export interface TruncatedPage<T> {
	items: readonly T[];
	returned: number;
	total: number;
	offset: number;
	truncated?: { limit: number; hint: string };
}

/** Pages shrink instead of refusing; the marker keeps the count honest. */
export function budgetedPage<T>(
	items: readonly T[],
	total: number,
	offset: number,
	limit: number,
	hint: string,
): TruncatedPage<T> {
	const full: TruncatedPage<T> = { items, returned: items.length, total, offset };
	if (aiResponseByteLength(full) <= limit) return full;
	const shrunk = shrinkAiResponsePage(items, limit, (kept) => ({
		items: kept,
		returned: kept.length,
		total,
		offset,
		truncated: { limit, hint },
	}));
	if (!shrunk) {
		throw new PsdAiError(
			"LimitExceeded",
			`Even a single entry exceeds the ${limit} byte response budget. ${hint}`,
		);
	}
	return shrunk;
}

export interface PsdManifestQuery {
	types?: string[];
	groups?: string[];
	format?: "signature" | "json-schema";
}

interface ManifestIndexEntry {
	type: string;
	title: string;
	description: string;
	effect: string;
	group: string;
}

export interface PsdAiManifestResult {
	version: number;
	manifestHash: string;
	coordinateSpace: typeof PSD_AI_COORDINATE_SPACE;
	commands?: ManifestIndexEntry[];
	signatures?: string[];
	schemas?: Record<string, unknown>;
	$defs?: Record<string, unknown>;
	/** Present when the session hides commands (read-only). */
	unavailable?: string;
	/** Tolerant group filtering: unknown groups reported, not fatal. */
	unknown?: { groups?: string[]; types?: string[] };
}

/**
 * Resolves a `manifest.get` query. No arguments → discovery index without
 * schemas. Exact `types` → the full contract, TS-style signatures by default
 * ("json-schema" for the machine form). `groups` filters tolerantly.
 */
export function resolveManifestQuery(
	available: readonly PsdAiCommandDescriptor[],
	readOnly: boolean,
	query: PsdManifestQuery = {},
): PsdAiManifestResult {
	const result: PsdAiManifestResult = {
		version: PSD_AI_MANIFEST_VERSION,
		manifestHash: psdAiManifestHash(available),
		coordinateSpace: PSD_AI_COORDINATE_SPACE,
	};
	if (readOnly) {
		result.unavailable =
			"This session is read-only: write commands are omitted rather than advertised and refused.";
	}

	if (query.types?.length) {
		const known = query.types.filter((type) =>
			available.some((descriptor) => descriptor.type === type),
		);
		const unknown = query.types.filter((type) => !known.includes(type));
		if (unknown.length) {
			result.unknown = {
				types: unknown.map((type) => {
					const suggestions = suggestAiCommandTypes(
						type,
						available.map((descriptor) => descriptor.type),
					);
					return suggestions.length ? `${type} (did you mean ${suggestions[0]}?)` : type;
				}),
			};
		}
		const descriptors = available.filter((descriptor) => known.includes(descriptor.type));
		if (query.format === "json-schema") {
			result.schemas = Object.fromEntries(
				descriptors.map((descriptor) => [descriptor.type, descriptor.schema]),
			);
			result.$defs = collectReachableDefs(descriptors);
		} else {
			result.signatures = descriptors.map((descriptor) =>
				renderAiSchemaSignature(descriptor.type, descriptor.schema, {
					defs: PSD_AI_SCHEMA_DEFS,
				}),
			);
		}
		return result;
	}

	let filtered = available;
	if (query.groups?.length) {
		const knownGroups = query.groups.filter((group) => PSD_AI_COMMAND_GROUPS.has(group));
		const unknownGroups = query.groups.filter((group) => !PSD_AI_COMMAND_GROUPS.has(group));
		if (unknownGroups.length) {
			result.unknown = {
				...result.unknown,
				groups: unknownGroups,
			};
		}
		filtered = available.filter((descriptor) => knownGroups.includes(descriptor.group));
	}
	// Discovery index carries no schemas: the byte cost belongs to exact reads.
	result.commands = filtered.map((descriptor) => ({
		type: descriptor.type,
		title: descriptor.title,
		description: descriptor.description,
		effect: descriptor.effect,
		group: descriptor.group,
	}));
	return result;
}

/** Transitive `$defs` closure so a schema response stands on its own. */
function collectReachableDefs(
	descriptors: readonly PsdAiCommandDescriptor[],
): Record<string, unknown> {
	const reached = new Set<string>();
	const visit = (value: unknown): void => {
		if (Array.isArray(value)) {
			for (const entry of value) visit(entry);
			return;
		}
		if (value && typeof value === "object") {
			for (const [key, entry] of Object.entries(value)) {
				if (key === "$ref" && typeof entry === "string") {
					const name = entry.replace("#/$defs/", "");
					if (!reached.has(name) && PSD_AI_SCHEMA_DEFS[name]) {
						reached.add(name);
						visit(PSD_AI_SCHEMA_DEFS[name]);
					}
				} else {
					visit(entry);
				}
			}
		}
	};
	for (const descriptor of descriptors) visit(descriptor.schema);
	return Object.fromEntries([...reached].map((name) => [name, PSD_AI_SCHEMA_DEFS[name]]));
}
