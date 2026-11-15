/**
 * The PSD AI runtime: `createPsdAiApi` binds a `PsdEditorSession` and a host
 * adapter into a bounded, manifest-driven command API.
 *
 * Dispatch order per batch: size checks → save gate → classify → forbidden
 * fields → validate every write → permission for every write → revision guard
 * → execute in order (writes flush before any following read). A refusal at
 * any step leaves the document untouched.
 */

import {
	AI_DEFAULT_MAX_RESPONSE_BYTES,
	AI_SAVE_COMMAND_TYPE,
	createAiPersistenceGate,
	validateAiSchemaValue,
	type AiPersistHandler,
	type AiPersistenceReport,
} from "@yaochn/als-office-ooxml-core";
import { PsdAiResources, encodePsdPng } from "./ai-resources";
import { composePsdRegion } from "./render/tile-cache";
import { scaleBitmap } from "./render/raster-ops";
import { writePsd } from "./codec/write";
import { psdBytesToBase64 } from "./codec/base64";
import type { PsdBitmap } from "./codec/document";
import { PsdAiError, psdUnknownCommandError } from "./ai-errors";
import {
	PSD_AI_COMMANDS,
	PSD_AI_DEFAULT_PAGE_SIZE,
	PSD_AI_MAX_COMMANDS,
	PSD_AI_MAX_REQUEST_BYTES,
	PSD_AI_SCHEMA_DEFS,
	psdAiCommandDescriptor,
	type PsdAiCommandDescriptor,
} from "./ai-manifest";
import {
	assertNoForbiddenAiFields,
	assertReadWithinBudget,
	budgetedPage,
	resolveManifestQuery,
	type PsdAiManifestResult,
	type PsdManifestQuery,
} from "./ai-guards";
import { aiResponseByteLength } from "@yaochn/als-office-ooxml-core";
import {
	walkPsdLayers,
	type PsdDocument,
	type PsdGroupLayer,
	type PsdLayerNode,
} from "./codec/document";
import { samplePixel } from "./render/raster-ops";
import { describeSelection, type PsdSelectionState } from "./render/selection";
import { PsdActionError, validatePsdAction, type PsdEditorAction } from "./editor/actions";
import {
	PsdRevisionConflictError,
	type PsdEditorSession,
	type PsdTransactionResult,
} from "./editor/session";

export interface PsdAiSelection {
	layerIds: string[];
	marquee?: { x: number; y: number; width: number; height: number } | null;
}

export interface PsdAiHostAdapter {
	foregroundMask?(bitmap: PsdBitmap, settings: {advanced:boolean;refineEdges:number;shiftEdge:number;contrast:number}): Promise<Uint8Array>;
	/** Require a current revision for all writes in an automation host. */
	requireRevision?: boolean;
	session: PsdEditorSession;
	document(): PsdDocument;
	getSelection?(): PsdAiSelection;
	setSelection?(selection: PsdAiSelection): void;
	revealLayer?(layerId: string): void;
	readOnly?: boolean | (() => boolean);
	/** Called for every write after validation and before any execution. */
	permission?(action: PsdEditorAction): boolean | Promise<boolean>;
	persist?: AiPersistHandler<PsdAiContext>;
	maxResponseBytes?: number;
	documentName?: string;
}

export interface PsdAiContext {
	editorKind: "psd";
	access: "read" | "read-write";
	revision: number;
	documentName?: string;
	canvas: { width: number; height: number; colorMode: string; resolutionPpi?: number };
	layerCount: number;
	selection: PsdAiSelection;
	history: { canUndo: boolean; canRedo: boolean };
	capabilities: { write: boolean; text: boolean; paint: boolean; backgroundRemoval: boolean; backgroundRemovalUnavailableReason?: string; preview: boolean; export: boolean; save: boolean };
	openWarnings: string[];
}

export interface PsdAiExecuteOptions {
	/** Optimistic concurrency; a mismatch refuses before anything runs. */
	requestId?: string;
	operationId?: string;
	baseRevision?: number;
	/** Display-only description passed to the host on persistence. */
	summary?: string;
}

export interface PsdAiExecuteResult {
	success: true;
	revision: number;
	values: unknown[];
	createdIds?: string[];
	affectedIds?: string[];
	deletedIds?: string[];
	diagnostics?: string[];
	noop?: boolean;
	persistence?: AiPersistenceReport;
}

export type PsdAiChangeReason = "transaction" | "history" | "external";

export interface PsdAiApi {
	getContext(): PsdAiContext;
	getManifest(query?: PsdManifestQuery): PsdAiManifestResult;
	execute(
		commands: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>,
		options?: PsdAiExecuteOptions,
	): Promise<PsdAiExecuteResult>;
	subscribe(listener: (reason: PsdAiChangeReason) => void): () => void;
	destroy(): void;
}

interface LayerSummary {
	mask?: { disabled: boolean; linked: boolean };
	curves?: import("./render/curves").PsdCurves;
	adjustment?: import("./render/adjustment-layers").PsdLiveAdjustment;
	transformSource?: { width: number; height: number };
	id: string;
	kind: PsdLayerNode["kind"];
	name: string;
	visible: boolean;
	opacity: number;
	blendMode: string;
	blendModeFallback?: string;
	locked: boolean;
	clipping: boolean;
	parentId: string | null;
	depth: number;
	bounds?: { x: number; y: number; width: number; height: number };
	childCount?: number;
	textPreview?: string;
}

function summarizeLayer(
	layer: PsdLayerNode,
	parent: PsdGroupLayer | null,
	depth: number,
): LayerSummary {
	const summary: LayerSummary = {
		id: layer.id,
		kind: layer.kind,
		name: layer.name,
		visible: layer.visible,
		opacity: Number(layer.opacity.toFixed(3)),
		blendMode: layer.blendMode,
		locked: layer.locks.all || layer.locks.composite,
		clipping: layer.clipping,
		parentId: parent?.id ?? null,
		depth,
	};
	if (layer.mask)
		summary.mask = { disabled: !!layer.mask.disabled, linked: layer.mask.linked !== false };
	if (layer.kind !== "group") {
		if (layer.adjustment) summary.adjustment = JSON.parse(JSON.stringify(layer.adjustment));
		if (layer.curves) summary.curves = JSON.parse(JSON.stringify(layer.curves));
		if (layer.sourceTransform?.rendered === layer.bitmap)
			summary.transformSource = {
				width: layer.sourceTransform.source.width,
				height: layer.sourceTransform.source.height,
			};
	}
	if (layer.blendModeFallback) summary.blendModeFallback = layer.blendModeFallback;
	if (layer.kind === "group") {
		summary.childCount = layer.children.length;
	} else {
		summary.bounds = {
			x: layer.left,
			y: layer.top,
			width: layer.bitmap.width,
			height: layer.bitmap.height,
		};
	}
	if (layer.kind === "text") {
		summary.textPreview =
			layer.text.text.length > 200 ? `${layer.text.text.slice(0, 200)}…` : layer.text.text;
	}
	return summary;
}

/** Depth-first, top-of-stack first — the order a layers panel shows. */
function flattenForListing(
	document: PsdDocument,
): Array<{ layer: PsdLayerNode; parent: PsdGroupLayer | null; depth: number }> {
	const rows: Array<{ layer: PsdLayerNode; parent: PsdGroupLayer | null; depth: number }> = [];
	const visit = (
		layers: readonly PsdLayerNode[],
		parent: PsdGroupLayer | null,
		depth: number,
	): void => {
		for (let index = layers.length - 1; index >= 0; index--) {
			const layer = layers[index];
			rows.push({ layer, parent, depth });
			if (layer.kind === "group") visit(layer.children, layer, depth + 1);
		}
	};
	visit(document.layers, null, 0);
	return rows;
}

export function createPsdAiApi(adapter: PsdAiHostAdapter): PsdAiApi {
	const resources = new PsdAiResources();
 let destroyed = false;
 const requests = new Map<string, {fingerprint:string; status:"pending"|"completed"|"failed"; promise:Promise<PsdAiExecuteResult>; result?:PsdAiExecuteResult; error?:{code:string;message:string;details?:Record<string,unknown>}}> ();
 const maxResponseBytes = adapter.maxResponseBytes ?? AI_DEFAULT_MAX_RESPONSE_BYTES;
	const isReadOnly = (): boolean =>
		typeof adapter.readOnly === "function"
			? adapter.readOnly()
			: (adapter.readOnly ?? !adapter.document().editable);
	const persistGate = adapter.persist ? createAiPersistenceGate(adapter.persist) : undefined;

	const listeners = new Set<(reason: PsdAiChangeReason) => void>();
	const unsubscribe = adapter.session.subscribe((_snapshot, result) => {
		const reason: PsdAiChangeReason = result ? "transaction" : "history";
		for (const listener of listeners) listener(reason);
	});

	const availableCommands = (): readonly PsdAiCommandDescriptor[] => {
		let commands = PSD_AI_COMMANDS;
		if (!adapter.foregroundMask) commands = commands.filter(d => d.type !== "background.remove");
		if (isReadOnly()) {
			commands = commands.filter(
				(descriptor) => descriptor.effect === "read" || descriptor.type === "view.reveal",
			);
		}
		if (!persistGate) {
			commands = commands.filter((descriptor) => descriptor.type !== AI_SAVE_COMMAND_TYPE);
		}
		if (!adapter.revealLayer) {
			commands = commands.filter((descriptor) => descriptor.type !== "view.reveal");
		}
		return commands;
	};

	const getContext = (): PsdAiContext => {
		const document = adapter.document();
		const session = adapter.session;
		let layerCount = 0;
		walkPsdLayers(document.layers, () => layerCount++);
		return {
			editorKind: "psd",
			access: isReadOnly() ? "read" : "read-write",
			revision: session.getRevision(),
			documentName: adapter.documentName,
			canvas: {
				width: document.width,
				height: document.height,
				colorMode: document.colorMode,
				resolutionPpi: document.resolutionPpi,
			},
			layerCount,
			selection: adapter.getSelection?.() ?? { layerIds: [] },
			history: { canUndo: session.canUndo(), canRedo: session.canRedo() },
			capabilities: {
				write: !isReadOnly(),
				text: !isReadOnly(),
				paint: !isReadOnly(),
				backgroundRemoval: !!adapter.foregroundMask && !isReadOnly(),
				backgroundRemovalUnavailableReason: isReadOnly() ? "Document is read-only" : adapter.foregroundMask ? undefined : "Native foreground service is not connected",
				preview: true, export: true, save: !!persistGate,
			},
			openWarnings: document.openWarnings.slice(0, 5),
		};
	};

	const executeRead = (command: Record<string, unknown>, commandIndex: number): unknown => {
		const document = adapter.document();
		switch (command.type) {
			case "context.get":
				return getContext();
			case "manifest.get":
				return resolveManifestQuery(availableCommands(), isReadOnly(), {
					types: command.types as string[] | undefined,
					groups: command.groups as string[] | undefined,
					format: command.format as "signature" | "json-schema" | undefined,
				});
			case "document.get": {
				const rows = flattenForListing(document);
				const value = {
					canvas: {
						width: document.width,
						height: document.height,
						colorMode: document.colorMode,
						bitsPerChannel: document.bitsPerChannel,
						resolutionPpi: document.resolutionPpi,
					},
					layerCount: rows.length,
					layers: rows.map((row) => summarizeLayer(row.layer, row.parent, row.depth)),
				};
				assertReadWithinBudget(
					value,
					maxResponseBytes,
					"Use layers.list with offset/limit to page through large documents.",
					commandIndex,
				);
				return value;
			}
			case "layers.list": {
				const rows = flattenForListing(document);
				const offset = (command.offset as number | undefined) ?? 0;
				const limit = (command.limit as number | undefined) ?? PSD_AI_DEFAULT_PAGE_SIZE;
				const page = rows
					.slice(offset, offset + limit)
					.map((row) => summarizeLayer(row.layer, row.parent, row.depth));
				return budgetedPage(
					page,
					rows.length,
					offset,
					maxResponseBytes,
					"Request a smaller limit or continue from the next offset.",
				);
			}
			case "layer.get": {
				const rows = flattenForListing(document);
				const row = rows.find((candidate) => candidate.layer.id === command.layerId);
				if (!row) {
					throw new PsdAiError(
						"InvalidArgument",
						`No layer with id '${String(command.layerId)}'`,
						{
							commandIndex,
							path: "layerId",
						},
					);
				}
				const summary: Record<string, unknown> = {
					...summarizeLayer(row.layer, row.parent, row.depth),
				};
				if (row.layer.kind === "text") {
					summary.text = row.layer.text.text;
					summary.textStyle = row.layer.text.style
						? {
								...row.layer.text.style,
								color: { ...row.layer.text.style.color },
							}
						: null;
				}
				if (row.layer.kind !== "group" && row.layer.mask) {
					summary.mask = {
						x: row.layer.mask.left,
						y: row.layer.mask.top,
						width: row.layer.mask.right - row.layer.mask.left,
						height: row.layer.mask.bottom - row.layer.mask.top,
						disabled: row.layer.mask.disabled,
					};
				}
				summary.locks = { ...row.layer.locks };
				assertReadWithinBudget(summary, maxResponseBytes, "", commandIndex);
				return summary;
			}
			case "pixel.sample": {
				const x = Math.round(command.x as number);
				const y = Math.round(command.y as number);
				let color: ReturnType<typeof samplePixel>;
				let source: "composite" | { layerId: string } = "composite";
				if (command.layerId === undefined) {
					color = x < 0 || y < 0 || x >= document.width || y >= document.height ? null : samplePixel(composePsdRegion(document, {x,y,width:1,height:1}), 0, 0);
				} else {
					const layerId = String(command.layerId);
					const row = flattenForListing(document).find(
						(candidate) => candidate.layer.id === layerId,
					);
					if (!row) {
						throw new PsdAiError("InvalidArgument", `No layer with id '${layerId}'`, {
							commandIndex,
							path: "layerId",
						});
					}
					if (row.layer.kind === "group") {
						throw new PsdAiError(
							"InvalidArgument",
							"Cannot sample a group layer directly.",
							{
								commandIndex,
								path: "layerId",
							},
						);
					}
					color = samplePixel(row.layer.bitmap, x - row.layer.left, y - row.layer.top);
					source = { layerId };
				}
				if (!color) {
					throw new PsdAiError(
						"InvalidArgument",
						"The canvas-space sample point is outside the requested bitmap.",
						{ commandIndex, path: "x" },
					);
				}
				const hex = `#${[color.r, color.g, color.b]
					.map((channel) => channel.toString(16).padStart(2, "0"))
					.join("")}`.toUpperCase();
				return {
					x,
					y,
					source,
					color,
					hex,
					opacity: Number((color.a / 255).toFixed(3)),
				};
			}
			case "selection.get": {
				const host = adapter.getSelection?.() ?? { layerIds: [] };
				return {
					...host,
					savedSelections: (document.savedSelections ?? []).map((entry) => entry.name),
					area: describeSelection(
						document.selection as PsdSelectionState | null,
						document.width,
						document.height,
					),
				};
			}
			case "history.get": {
				const history = adapter.session.historyEntries();
				const entries = [...history.past, history.current, ...history.future].map(
					(entry) => ({
						stateId: entry.stateId,
						label: entry.label,
						current: entry.stateId === history.current.stateId,
					}),
				);
				const offset = (command.offset as number | undefined) ?? 0;
				const limit = (command.limit as number | undefined) ?? PSD_AI_DEFAULT_PAGE_SIZE;
				return {
					canUndo: adapter.session.canUndo(),
					canRedo: adapter.session.canRedo(),
					...budgetedPage(
						entries.slice(offset, offset + limit),
						entries.length,
						offset,
						maxResponseBytes,
						"Request a smaller limit or continue from the next offset.",
					),
				};
			}
			case "text.find": {
				const query = String(command.query).toLowerCase();
				const offset = (command.offset as number | undefined) ?? 0;
				const limit = (command.limit as number | undefined) ?? PSD_AI_DEFAULT_PAGE_SIZE;
				const rows = flattenForListing(document);
				const matches: Array<Record<string, unknown>> = [];
				for (const row of rows) {
					const layer = row.layer;
					if (layer.name.toLowerCase().includes(query)) {
						matches.push({ layerId: layer.id, field: "name", snippet: layer.name });
						continue;
					}
					if (layer.kind === "text") {
						const at = layer.text.text.toLowerCase().indexOf(query);
						if (at >= 0) {
							const start = Math.max(0, at - 40);
							matches.push({
								layerId: layer.id,
								field: "text",
								snippet: layer.text.text.slice(start, at + query.length + 40),
							});
						}
					}
				}
				return budgetedPage(
					matches.slice(offset, offset + limit),
					matches.length,
					offset,
					maxResponseBytes,
					"Request a smaller limit or continue from the next offset.",
				);
			}
			case "view.reveal": {
				if (!adapter.revealLayer) {
					throw new PsdAiError(
						"NotSupported",
						"This host does not support view.reveal.",
						{
							commandIndex,
						},
					);
				}
				const layerId = String(command.layerId);
				if (!flattenForListing(document).some((row) => row.layer.id === layerId)) {
					throw new PsdAiError("InvalidArgument", `No layer with id '${layerId}'`, {
						commandIndex,
						path: "layerId",
					});
				}
				adapter.revealLayer(layerId);
				return { revealed: true, layerId: command.layerId };
			}
			default:
				throw psdUnknownCommandError(
					String(command.type),
					commandIndex,
					PSD_AI_COMMAND_TYPES_ALL,
					{ readOnly: isReadOnly() },
				);
		}
	};

	const executeOnce = async (
		commandsInput: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>,
		options: PsdAiExecuteOptions = {},
	): Promise<PsdAiExecuteResult> => {
		const commands = Array.isArray(commandsInput) ? commandsInput : [commandsInput];
		if (!commands.length) {
			throw new PsdAiError("InvalidArgument", "At least one command is required.");
		}
		if (commands.length > PSD_AI_MAX_COMMANDS) {
			throw new PsdAiError(
				"LimitExceeded",
				`A call carries at most ${PSD_AI_MAX_COMMANDS} commands (got ${commands.length}).`,
			);
		}
		const requestBytes = aiResponseByteLength(commands);
		if (requestBytes > PSD_AI_MAX_REQUEST_BYTES) {
			throw new PsdAiError(
				"LimitExceeded",
				`The request is ${requestBytes} bytes, over the ${PSD_AI_MAX_REQUEST_BYTES} byte limit.`,
			);
		}

		// --- classify and validate everything before executing anything ---
		const readOnly = isReadOnly();
		const available = availableCommands();
		const classified: Array<{
			command: Record<string, unknown>;
			effect: "read" | "write" | "host";
		}> = [];
		for (let index = 0; index < commands.length; index++) {
			const command = commands[index];
			if (typeof command !== "object" || command === null || Array.isArray(command)) {
				throw new PsdAiError("InvalidArgument", "Each command must be an object.", {
					commandIndex: index,
				});
			}
			assertNoForbiddenAiFields(command, index);
			const type = String(command.type ?? "");
			const descriptor = psdAiCommandDescriptor(type);
			if (!descriptor) {
				throw psdUnknownCommandError(type, index, PSD_AI_COMMAND_TYPES_ALL, { readOnly });
			}
			if (!available.some((candidate) => candidate.type === type)) {
				if (readOnly && descriptor.effect !== "read") {
					throw new PsdAiError(
						"ReadOnly",
						`'${type}' is unavailable in a read-only session.`,
						{ commandIndex: index },
					);
				}
				throw new PsdAiError("NotSupported", `'${type}' is unavailable in this session.`, {
					commandIndex: index,
				});
			}
			if ((!descriptor.batchable || type === "view.reveal") && commands.length > 1) {
				throw new PsdAiError(
					"InvalidArgument",
					`'${type}' must be the only command in a call.`,
					{ commandIndex: index },
				);
			}
			const violation = validateAiSchemaValue(
				command,
				descriptor.schema,
				`commands[${index}]`,
				{
					defs: PSD_AI_SCHEMA_DEFS,
				},
			);
			if (violation) {
				throw new PsdAiError("InvalidArgument", violation.message, {
					commandIndex: index,
					path: violation.path,
				});
			}
			const effect =
				descriptor.effect === "read"
					? "read"
					: descriptor.effect === "write"
						? "write"
						: "host";
			classified.push({ command, effect });
		}

		// --- permission for every write, before any execution ---
		const writeActions = classified.flatMap((entry, index) =>
			entry.effect === "write" ? [toEditorAction(entry.command, index)] : [],
		);
		if (adapter.permission) {
			for (const action of writeActions) {
				const allowed = await adapter.permission(action);
				if (!allowed) {
					throw new PsdAiError(
						"PermissionDenied",
						`The host declined '${action.type}'. The document is untouched.`,
					);
				}
			}
		}

		// --- revision guard ---
		if (
			options.baseRevision !== undefined &&
			options.baseRevision !== adapter.session.getRevision()
		) {
			throw new PsdAiError(
				"RevisionConflict",
				`baseRevision ${options.baseRevision} does not match the session revision ${adapter.session.getRevision()}. Re-read and retry.`,
			);
		}


        const first = classified[0].command;
        const type = String(first.type);
        const resourceWrite = type === "mask.fromResource" || type === "background.remove";
        if ((resourceWrite || (adapter.requireRevision && (writeActions.length > 0 || type === AI_SAVE_COMMAND_TYPE))) && options.baseRevision === undefined)
            throw new PsdAiError("InvalidArgument", "baseRevision is required for this write. Read context.get first.", {path:"baseRevision"});
        const valueResult = (value: unknown): PsdAiExecuteResult => { assertReadWithinBudget(value, maxResponseBytes, "Use a host with a larger response budget for resource chunks.", 0); return {success:true, revision:adapter.session.getRevision(), values:[value]}; };
        if (type === "request.get") {
            const entry = requests.get(String(first.requestId));
            return valueResult(entry ? {status:entry.status, result:entry.result, error:entry.error} : {status:"unknown"});
        }
        if (type === "resource.create") return valueResult(resources.create(first.length as number));
        if (type === "resource.write") return valueResult(resources.write(String(first.resourceId), first.offset as number, String(first.dataBase64)));
        if (type === "resource.read") return valueResult(resources.read(String(first.resourceId), first.offset as number | undefined));
        if (type === "resource.release") return valueResult(resources.release(String(first.resourceId)));
        if (type === "document.preview" || type === "document.export") {
            const document = adapter.document(), revision = adapter.session.getRevision();
            let bytes: Uint8Array, mimeType: string;
            if (type === "document.export" && first.format === "psd") { bytes = writePsd(document); mimeType = "image/vnd.adobe.photoshop"; }
            else {
                const region = {x:Number(first.x ?? 0),y:Number(first.y ?? 0),width:Number(first.width ?? document.width),height:Number(first.height ?? document.height)};
                if (region.width*region.height > 16_000_000) throw new PsdAiError("LimitExceeded", "Render region exceeds 16 megapixels; request a smaller preview region.");
                let bitmap = composePsdRegion(document,region);
                if (type === "document.preview") { const ratio = Math.min(1, Number(first.maxDimension ?? 1024)/Math.max(bitmap.width,bitmap.height)); if (ratio < 1) bitmap=scaleBitmap(bitmap,Math.max(1,Math.round(bitmap.width*ratio)),Math.max(1,Math.round(bitmap.height*ratio))); }
                bytes=await encodePsdPng(bitmap); mimeType="image/png";
            }
            if (destroyed) throw new PsdAiError("NotSupported", "Session closed");
            return {success:true,revision,values:[{...resources.put(bytes,mimeType),revision,persisted:false}]};
        }
        if (resourceWrite) {
            const revision = adapter.session.getRevision();
            const row = flattenForListing(adapter.document()).find(row => row.layer.id === first.layerId);
            if (!row || row.layer.kind === "group" || row.layer.adjustment || row.layer.curves) throw new PsdAiError("InvalidArgument", "Select a pixel layer", {path:"layerId"});
            const bitmap = row.layer.bitmap;
            const width = type === "background.remove" ? bitmap.width : first.width as number;
            const height = type === "background.remove" ? bitmap.height : first.height as number;
            const bytes = type === "background.remove"
                ? await adapter.foregroundMask!({...bitmap,data:bitmap.data.slice()}, {advanced:!!first.advanced,refineEdges:Number(first.refineEdges ?? 4),shiftEdge:Number(first.shiftEdge ?? 0),contrast:Number(first.contrast ?? 0)})
                : resources.get(String(first.resourceId));
            if (destroyed) throw new PsdAiError("NotSupported", "Session closed");
            if (bytes.length !== width*height) throw new PsdAiError("InvalidArgument", "Mask byte length must equal width × height");
            const action: PsdEditorAction = {type:"mask.set",layerId:String(first.layerId),width,height,dataBase64:psdBytesToBase64(bytes),combine:first.combine !== false,respectSelection:first.respectSelection !== false};
            if (adapter.permission && !await adapter.permission(action)) throw new PsdAiError("PermissionDenied", "The host declined the mask write");
            if (isReadOnly()) throw new PsdAiError("ReadOnly", "Session became read-only");
            if (adapter.session.getRevision() !== revision) throw new PsdAiError("RevisionConflict", "Document changed during mask generation; re-read and retry");
            const applied = adapter.session.apply([action], {baseRevision:revision,source:"ai",label:type});
            const result: PsdAiExecuteResult = {success:true,revision:applied.revision,values:[{applied:true}],affectedIds:applied.affectedIds,noop:applied.noop};
            if (persistGate && !applied.noop) result.persistence = await persistGate({revision:result.revision,trigger:"write",summary:options.summary},getContext());
            return result;
        }

		// --- execute in order; writes flush before any following read ---
		const values: unknown[] = [];
		const affectedIds: string[] = [];
		const createdIds: string[] = [];
		const deletedIds: string[] = [];
		const diagnostics: string[] = [];
		let wroteAnything = false;
		let allNoop = true;
		let pendingWrites: PsdEditorAction[] = [];
		let pendingIndexes: number[] = [];

		const flushWrites = (): void => {
			if (!pendingWrites.length) return;
			try {
				const result: PsdTransactionResult = adapter.session.apply(pendingWrites, {
					source: "ai",
					label: options.summary ?? pendingWrites[0].type,
				});
				wroteAnything = true;
				if (!result.noop) allNoop = false;
				for (const id of result.affectedIds) {
					if (!affectedIds.includes(id)) affectedIds.push(id);
				}
				createdIds.push(...result.createdIds);
				deletedIds.push(...result.deletedIds);
				diagnostics.push(...result.diagnostics);
				for (const index of pendingIndexes) values[index] = { applied: true };
			} catch (error) {
				throw translateSessionError(error, pendingIndexes[0]);
			}
			pendingWrites = [];
			pendingIndexes = [];
		};

		adapter.session.atomic(() => {
		for (let index = 0; index < classified.length; index++) {
			const { command, effect } = classified[index];
			if (effect === "write") {
				pendingWrites.push(toEditorAction(command, index));
				pendingIndexes.push(index);
				continue;
			}
			flushWrites();
			if (command.type === AI_SAVE_COMMAND_TYPE) {
				values[index] = { requested: true };
				continue;
			}
			values[index] = executeRead(command, index);
		}
		flushWrites();

		});

		const result: PsdAiExecuteResult = {
			success: true,
			revision: adapter.session.getRevision(),
			values,
		};
		if (wroteAnything) {
			result.affectedIds = affectedIds;
			if (createdIds.length) result.createdIds = createdIds;
			if (deletedIds.length) result.deletedIds = deletedIds;
			if (allNoop) result.noop = true;
		}
		if (diagnostics.length) result.diagnostics = diagnostics;

		// --- persistence: explicit save, or post-commit offer after writes ---
		const askedToSave = classified.some((entry) => entry.command.type === AI_SAVE_COMMAND_TYPE);
		if (askedToSave) {
			if (!persistGate) {
				throw new PsdAiError("NotSupported", "This host does not support document.save.");
			}
			result.persistence = await persistGate(
				{
					revision: result.revision,
					summary: options.summary,
					trigger: "save",
				},
				getContext(),
			);
		} else if (wroteAnything && !allNoop && persistGate) {
			result.persistence = await persistGate(
				{
					revision: result.revision,
					summary: options.summary,
					createdIds,
					affectedIds,
					deletedIds,
					trigger: "write",
				},
				getContext(),
			);
		}
		return result;
	};

    const execute: PsdAiApi["execute"] = (commands, options = {}) => {
        if (destroyed) return Promise.reject(new PsdAiError("NotSupported", "Session closed"));
        const id=options.requestId ?? options.operationId;
        if (!id) return executeOnce(commands,options);
        if (typeof id !== "string" || id.length > 128) return Promise.reject(new PsdAiError("InvalidArgument", "requestId must be 1–128 characters"));
        const fingerprint=JSON.stringify({commands,baseRevision:options.baseRevision,summary:options.summary});
        const previous=requests.get(id);
        if (previous) return previous.fingerprint === fingerprint ? previous.promise.then(value=>structuredClone(value)) : Promise.reject(new PsdAiError("InvalidArgument", "requestId was already used with different input"));
        if (requests.size >= 256) return Promise.reject(new PsdAiError("LimitExceeded", "Request ledger full; open a new session. Retained requests remain queryable."));
        const entry: {fingerprint:string;status:"pending"|"completed"|"failed";promise:Promise<PsdAiExecuteResult>;result?:PsdAiExecuteResult;error?:{code:string;message:string;details?:Record<string,unknown>}} = {fingerprint,status:"pending",promise:Promise.resolve(null as unknown as PsdAiExecuteResult)};
        requests.set(id,entry);
        const before=adapter.session.getRevision();
        entry.promise=Promise.resolve().then(()=>executeOnce(commands,options)).then(result=>{entry.status="completed";entry.result=structuredClone(result);return entry.result;},error=>{
            entry.status="failed";
            entry.error={code:error instanceof PsdAiError ? error.code : "ExecutionFailed",message:error instanceof Error ? error.message : String(error),details:{revision:adapter.session.getRevision(),revisionBefore:before}};
            throw error;
        });
        return entry.promise.then(value=>structuredClone(value));
    };

	return {
		getContext,
		getManifest: (query) => resolveManifestQuery(availableCommands(), isReadOnly(), query),
		execute,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		destroy() {
			destroyed = true; resources.clear(); requests.clear();
			listeners.clear();
			unsubscribe();
		},
	};
}

const PSD_AI_COMMAND_TYPES_ALL: string[] = PSD_AI_COMMANDS.map((descriptor) => descriptor.type);

/**
 * Narrows a schema-validated command to the action union via the action
 * validator, so the boundary stays a checked assertion rather than a cast.
 */
function toEditorAction(command: Record<string, unknown>, commandIndex: number): PsdEditorAction {
	try {
		validatePsdAction(command);
	} catch (error) {
		throw translateSessionError(error, commandIndex);
	}
	return command;
}

function translateSessionError(error: unknown, commandIndex: number): PsdAiError {
	if (error instanceof PsdAiError) return error;
	if (error instanceof PsdRevisionConflictError) {
		return new PsdAiError("RevisionConflict", error.message, { commandIndex });
	}
	if (error instanceof PsdActionError) {
		const message = error.message;
		const code = /read-only/i.test(message)
			? "ReadOnly"
			: /locked/i.test(message)
				? "PermissionDenied"
				: "InvalidArgument";
		return new PsdAiError(code, message, { commandIndex, path: error.path });
	}
	return new PsdAiError(
		"InvalidArgument",
		error instanceof Error ? error.message : String(error),
		{ commandIndex },
	);
}
