/**
 * PsdEditorSession: revision counter, undo/redo stacks, and transactional
 * application of validated actions. Snapshots are structural clones — layer
 * nodes are copied but their immutable bitmaps are shared — so history is
 * cheap even for large documents.
 */

import {
	countPsdLayers,
	walkPsdLayers,
	type PsdBitmap,
	type PsdDocument,
	type PsdLayerNode,
	type PsdTextLayer,
} from "../codec/document";
import { validatePsdAction, PsdActionError, type PsdEditorAction } from "./actions";
import { applyPsdActions, type PsdApplyResult } from "./reducer";

export type PsdTransactionSource = "user" | "ai" | "collaboration" | "system";

export interface PsdTransactionOptions {
	/** Optimistic concurrency: the revision the caller based its edit on. */
	baseRevision?: number;
	source?: PsdTransactionSource;
	/** Host-supplied identity for audit; never model-supplied. */
	actorId?: string;
	/** History panel label; defaults to the first action's type. */
	label?: string;
}

export interface PsdTransactionResult {
	revision: number;
	affectedIds: string[];
	createdIds: string[];
	deletedIds: string[];
	noop: boolean;
	diagnostics: string[];
	source: PsdTransactionSource;
	actorId?: string;
}

export interface PsdEditorSnapshot {
	revision: number;
	/** Stable identity of the document state; undo/redo restores prior ids. */
	stateId: number;
	document: PsdDocument;
}

export interface PsdHistoryEntry {
	stateId: number;
	label: string;
}

export type PsdSessionListener = (
	snapshot: PsdEditorSnapshot,
	result?: PsdTransactionResult,
) => void;

export class PsdRevisionConflictError extends Error {
	constructor(
		readonly expected: number,
		readonly actual: number,
	) {
		super(`Revision conflict: expected ${expected} but the session is at ${actual}`);
		this.name = "PsdRevisionConflictError";
	}
}

export interface PsdSessionOptions {
	/** Canvas-backed text rasterizer, injected by the Vue host. */
	rasterizeText?(layer: PsdTextLayer, text: string): PsdBitmap | null;
}

interface HistoryState {
	document: PsdDocument;
	stateId: number;
	label: string;
}

const MAX_HISTORY = 50;

export class PsdEditorSession {
	private document: PsdDocument;
	private revision = 0;
	private stateId = 0;
	private nextStateId = 1;
	private past: HistoryState[] = [];
	private future: HistoryState[] = [];
	private currentLabel = "Open";
	private listeners = new Set<PsdSessionListener>();
	private atomicResults: PsdTransactionResult[] | null = null;
	private idCounter = 1;

	constructor(
		document: PsdDocument,
		private readonly options: PsdSessionOptions = {},
	) {
		this.document = cloneDocumentStructure(document);
		this.seedIdCounter();
	}

	private seedIdCounter(): void {
		walkPsdLayers(this.document.layers, (layer) => {
			const match = /^L(\d+)$/.exec(layer.id);
			if (match) this.idCounter = Math.max(this.idCounter, Number(match[1]) + 1);
		});
	}

	getRevision(): number {
		return this.revision;
	}

	getStateId(): number {
		return this.stateId;
	}

	getSnapshot(): PsdEditorSnapshot {
		return {
			revision: this.revision,
			stateId: this.stateId,
			document: cloneDocumentStructure(this.document),
		};
	}

	/** Direct read access for rendering; treat the result as immutable. */
	peekDocument(): PsdDocument {
		return this.document;
	}

	layerCount(): number {
		return countPsdLayers(this.document.layers);
	}

	subscribe(listener: PsdSessionListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	canUndo(): boolean {
		return this.past.length > 0;
	}

	canRedo(): boolean {
		return this.future.length > 0;
	}

	historyEntries(): {
		past: PsdHistoryEntry[];
		current: PsdHistoryEntry;
		future: PsdHistoryEntry[];
	} {
		return {
			past: this.past.map((state) => ({ stateId: state.stateId, label: state.label })),
			current: { stateId: this.stateId, label: this.currentLabel },
			future: this.future
				.map((state) => ({ stateId: state.stateId, label: state.label }))
				.reverse(),
		};
	}

	/**
	 * Validates and applies a batch atomically: actions run against a working
	 * clone, so a failing action leaves the session untouched.
	 */
	apply(actions: readonly unknown[], options: PsdTransactionOptions = {}): PsdTransactionResult {
		if (!actions.length) {
			throw new PsdActionError("At least one action is required");
		}
		if (options.baseRevision !== undefined && options.baseRevision !== this.revision) {
			throw new PsdRevisionConflictError(options.baseRevision, this.revision);
		}
		if (!this.document.editable) {
			throw new PsdActionError("This document opened read-only and cannot be edited.");
		}
		for (const action of actions) validatePsdAction(action);
		const validated = actions as readonly PsdEditorAction[];

		const working = cloneDocumentStructure(this.document);
		const applyResult: PsdApplyResult = applyPsdActions(working, validated, {
			allocateLayerId: () => `L${this.idCounter++}`,
			rasterizeText: this.options.rasterizeText,
		});

		const source = options.source ?? "user";
		if (
			!applyResult.changed &&
			!applyResult.createdIds.length &&
			!applyResult.deletedIds.length
		) {
			return {
				revision: this.revision,
				affectedIds: applyResult.affectedIds,
				createdIds: [],
				deletedIds: [],
				noop: true,
				diagnostics: applyResult.diagnostics,
				source,
				actorId: options.actorId,
			};
		}

		this.past.push({
			document: this.document,
			stateId: this.stateId,
			label: this.currentLabel,
		});
		if (this.past.length > MAX_HISTORY) this.past.shift();
		this.future = [];
		this.document = working;
		this.stateId = this.nextStateId++;
		this.currentLabel = options.label ?? validated[0].type;
		this.revision++;

		const result: PsdTransactionResult = {
			revision: this.revision,
			affectedIds: applyResult.affectedIds,
			createdIds: applyResult.createdIds,
			deletedIds: applyResult.deletedIds,
			noop: false,
			diagnostics: applyResult.diagnostics,
			source,
			actorId: options.actorId,
		};
		this.notify(result);
		return result;
	}

	/** Synchronous transaction boundary for interleaved reads and writes. */
	atomic<T>(run: () => T): T {
		if (this.atomicResults) throw new Error("Nested transactions are not supported");
		const saved = { document: this.document, revision: this.revision, stateId: this.stateId,
			nextStateId: this.nextStateId, past: [...this.past], future: [...this.future],
			currentLabel: this.currentLabel, idCounter: this.idCounter };
		const results: PsdTransactionResult[] = [];
		this.atomicResults = results;
		let value: T;
		try { value = run(); }
		catch (error) { Object.assign(this, saved); this.atomicResults = null; throw error; }
		this.atomicResults = null;
		if (results.length) {
			this.past = [...saved.past, {document: saved.document, stateId: saved.stateId, label: saved.currentLabel}].slice(-MAX_HISTORY);
			const merged = {...results[results.length - 1]};
			for (const key of ["affectedIds", "createdIds", "deletedIds", "diagnostics"] as const)
				merged[key] = [...new Set(results.flatMap(result => result[key]))];
			this.notify(merged);
		}
		return value;
	}

	undo(): boolean {
		const previous = this.past.pop();
		if (!previous) return false;
		this.future.push({
			document: this.document,
			stateId: this.stateId,
			label: this.currentLabel,
		});
		this.document = previous.document;
		this.stateId = previous.stateId;
		this.currentLabel = previous.label;
		this.revision++;
		this.notify();
		return true;
	}

	redo(): boolean {
		const next = this.future.pop();
		if (!next) return false;
		this.past.push({
			document: this.document,
			stateId: this.stateId,
			label: this.currentLabel,
		});
		this.document = next.document;
		this.stateId = next.stateId;
		this.currentLabel = next.label;
		this.revision++;
		this.notify();
		return true;
	}

	/** Jump to a state visible in the history panel. */
	goToState(stateId: number): boolean {
		if (stateId === this.stateId) return true;
		const inPast = this.past.findIndex((state) => state.stateId === stateId);
		if (inPast >= 0) {
			let ok = true;
			while (ok && this.stateId !== stateId) ok = this.undo();
			return ok;
		}
		const inFuture = this.future.findIndex((state) => state.stateId === stateId);
		if (inFuture >= 0) {
			let ok = true;
			while (ok && this.stateId !== stateId) ok = this.redo();
			return ok;
		}
		return false;
	}

	private notify(result?: PsdTransactionResult): void {
		if (this.atomicResults) { if (result) this.atomicResults.push(result); return; }
		const snapshot: PsdEditorSnapshot = {
			revision: this.revision,
			stateId: this.stateId,
			document: this.document,
		};
		for (const listener of this.listeners) listener(snapshot, result);
	}
}

/**
 * Clones the document's mutable structure while sharing immutable payloads
 * (bitmaps, preserved byte ranges).
 */
export function cloneDocumentStructure(document: PsdDocument): PsdDocument {
	return {
		...document,
		openWarnings: [...document.openWarnings],
		layers: document.layers.map(cloneNode),
		...(document.selection ? { selection: cloneSelection(document.selection) } : {}),
		...(document.savedSelections
			? {
					savedSelections: document.savedSelections.map((entry) => ({
						name: entry.name,
						selection: cloneSelection(entry.selection),
					})),
				}
			: {}),
	};
}

function cloneSelection(
	selection: NonNullable<PsdDocument["selection"]>,
): NonNullable<PsdDocument["selection"]> {
	const shape = selection.shape;
	return {
		...selection,
		shape:
			shape.kind === "polygon"
				? { kind: "polygon", points: shape.points.map((point) => ({ ...point })) }
				: shape.kind === "pixels"
					? { ...shape, mask: new Uint8Array(shape.mask) }
					: { ...shape },
	};
}

function cloneNode(layer: PsdLayerNode): PsdLayerNode {
	if (layer.kind === "group") {
		return {
			...layer,
			locks: { ...layer.locks },
			children: layer.children.map(cloneNode),
		};
	}
	if (layer.kind === "text") {
		return {
			...layer,
			locks: { ...layer.locks },
			text: {
				...layer.text,
				...(layer.text.style
					? { style: { ...layer.text.style, color: { ...layer.text.style.color } } }
					: {}),
			},
		};
	}
	return { ...layer, locks: { ...layer.locks } };
}
