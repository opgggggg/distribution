import { createBlankPsd, parsePsd } from "./psd";
import type {
	PsdDocument,
	PsdEditorCommand,
	PsdEditorExecuteResult,
	PsdEditorState,
	PsdLayer,
} from "./types";

type PsdLayerEdit =
	| {
			readonly property: "visible";
			readonly layerId: string;
			readonly before: boolean;
			readonly after: boolean;
	  }
	| {
			readonly property: "opacity";
			readonly layerId: string;
			readonly before: number;
			readonly after: number;
	  };

export interface CreatePsdEditorOptions {
	readonly source?: Uint8Array | ArrayBuffer;
	readonly readonly?: boolean;
	readonly width?: number;
	readonly height?: number;
}

export interface PsdEditorExecuteOptions {
	readonly baseRevision?: number | string;
}

export const PSD_ACTION_MANIFEST = {
	format: "psd",
	version: 1,
	actions: [
		{
			type: "context.get",
			effect: "read",
			description: "Read canvas metadata and the active layer summary.",
		},
		{
			type: "layers.list",
			effect: "read",
			description: "List PSD layers in visual stacking order.",
		},
		{
			type: "layer.setVisibility",
			effect: "write",
			description: "Show or hide one PSD layer without rewriting unrelated source data.",
		},
		{
			type: "layer.setOpacity",
			effect: "write",
			description: "Set a layer opacity from 0 through 255.",
		},
	],
} as const;

function layerSummary(layer: PsdLayer): Record<string, unknown> {
	return {
		id: layer.id,
		name: layer.name,
		index: layer.index,
		bounds: {
			top: layer.top,
			left: layer.left,
			bottom: layer.bottom,
			right: layer.right,
		},
		visible: layer.visible,
		opacity: layer.opacity,
		blendMode: layer.blendMode.trim() || "norm",
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseCommand(command: unknown): PsdEditorCommand {
	if (!isRecord(command) || typeof command.type !== "string") {
		throw new TypeError("PSD commands must be objects with a type.");
	}
	if (command.type === "context.get" || command.type === "layers.list") {
		return { type: command.type };
	}
	if (command.type === "layer.setVisibility") {
		if (typeof command.layerId !== "string" || typeof command.visible !== "boolean") {
			throw new TypeError("layer.setVisibility requires layerId and visible.");
		}
		return {
			type: command.type,
			layerId: command.layerId,
			visible: command.visible,
		};
	}
	if (command.type === "layer.setOpacity") {
		if (
			typeof command.layerId !== "string" ||
			typeof command.opacity !== "number" ||
			!Number.isInteger(command.opacity) ||
			command.opacity < 0 ||
			command.opacity > 255
		) {
			throw new TypeError("layer.setOpacity requires layerId and an integer opacity 0–255.");
		}
		return { type: command.type, layerId: command.layerId, opacity: command.opacity };
	}
	throw new TypeError(`Unsupported PSD command: ${command.type}`);
}

/** Mutable source-preserving PSD session used by both headless and Vue surfaces. */
export class PsdEditorModel {
	private documentValue: PsdDocument;
	private revisionValue = 0;
	private history: PsdLayerEdit[] = [];
	private historyCursor = 0;
	private savedCursor = 0;
	private readonly listeners = new Set<(state: PsdEditorState) => void>();
	readonly readonly: boolean;

	constructor(options: CreatePsdEditorOptions = {}) {
		this.readonly = options.readonly ?? false;
		const source = options.source
			? options.source instanceof Uint8Array
				? options.source.slice()
				: new Uint8Array(options.source).slice()
			: createBlankPsd(options.width, options.height);
		this.documentValue = parsePsd(source);
	}

	get document(): PsdDocument {
		return this.documentValue;
	}

	get revision(): number {
		return this.revisionValue;
	}

	get dirty(): boolean {
		return this.savedCursor < 0 || this.historyCursor !== this.savedCursor;
	}

	getState(): PsdEditorState {
		return {
			revision: this.revision,
			dirty: this.dirty,
			readonly: this.readonly,
			document: this.document,
		};
	}

	subscribe(listener: (state: PsdEditorState) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private emit(): void {
		const state = this.getState();
		for (const listener of this.listeners) listener(state);
	}

	private requireLayer(layerId: string): PsdLayer {
		const layer = this.document.layers.find((candidate) => candidate.id === layerId);
		if (!layer) throw new RangeError(`PSD layer not found: ${layerId}`);
		return layer;
	}

	private applyEdit(edit: PsdLayerEdit, direction: "before" | "after"): void {
		const layer = this.requireLayer(edit.layerId);
		if (edit.property === "visible") {
			const value = edit[direction];
			const flagsOffset = layer.sourceOffsets.flags;
			const current = this.document.source[flagsOffset] ?? 0;
			this.document.source[flagsOffset] = value ? current & ~0x02 : current | 0x02;
			layer.visible = value;
		} else {
			const value = edit[direction];
			this.document.source[layer.sourceOffsets.opacity] = value;
			layer.opacity = value;
		}
	}

	private commit(edit: PsdLayerEdit): boolean {
		if (this.readonly) throw new Error("This PSD is read-only.");
		if (edit.before === edit.after) return false;
		if (this.historyCursor < this.history.length) {
			this.history = this.history.slice(0, this.historyCursor);
			if (this.savedCursor > this.historyCursor) this.savedCursor = -1;
		}
		this.applyEdit(edit, "after");
		this.history.push(edit);
		this.historyCursor++;
		this.revisionValue++;
		this.emit();
		return true;
	}

	setLayerVisibility(layerId: string, visible: boolean): boolean {
		const layer = this.requireLayer(layerId);
		return this.commit({
			property: "visible",
			layerId,
			before: layer.visible,
			after: visible,
		});
	}

	setLayerOpacity(layerId: string, opacity: number): boolean {
		if (!Number.isInteger(opacity) || opacity < 0 || opacity > 255) {
			throw new RangeError("PSD layer opacity must be an integer from 0 through 255.");
		}
		const layer = this.requireLayer(layerId);
		return this.commit({
			property: "opacity",
			layerId,
			before: layer.opacity,
			after: opacity,
		});
	}

	undo(): boolean {
		if (this.readonly || this.historyCursor === 0) return false;
		const edit = this.history[this.historyCursor - 1];
		if (!edit) return false;
		this.applyEdit(edit, "before");
		this.historyCursor--;
		this.revisionValue++;
		this.emit();
		return true;
	}

	redo(): boolean {
		if (this.readonly || this.historyCursor >= this.history.length) return false;
		const edit = this.history[this.historyCursor];
		if (!edit) return false;
		this.applyEdit(edit, "after");
		this.historyCursor++;
		this.revisionValue++;
		this.emit();
		return true;
	}

	markSaved(): void {
		this.savedCursor = this.historyCursor;
		this.emit();
	}

	exportPsd(): Blob {
		return new Blob([this.document.source.slice().buffer], {
			type: "image/vnd.adobe.photoshop",
		});
	}

	getCommandManifest(): typeof PSD_ACTION_MANIFEST {
		return PSD_ACTION_MANIFEST;
	}

	executeCommands(
		commands: readonly unknown[],
		options: PsdEditorExecuteOptions = {},
	): PsdEditorExecuteResult {
		if (
			options.baseRevision !== undefined &&
			String(options.baseRevision) !== String(this.revision)
		) {
			throw new Error(
				`PSD revision conflict: expected ${options.baseRevision}, current ${this.revision}.`,
			);
		}
		const parsed = commands.map(parseCommand);
		const writes = parsed.filter(
			(command) =>
				command.type === "layer.setVisibility" || command.type === "layer.setOpacity",
		);
		if (writes.length && writes.length !== parsed.length) {
			throw new Error("PSD read and write commands must be executed separately.");
		}
		let wrote = false;
		const results = parsed.map((command) => {
			if (command.type === "context.get") {
				return {
					format: "psd",
					width: this.document.width,
					height: this.document.height,
					depth: this.document.depth,
					colorMode: this.document.colorMode,
					layerCount: this.document.layers.length,
					revision: this.revision,
					dirty: this.dirty,
				};
			}
			if (command.type === "layers.list") {
				return this.document.layers.map(layerSummary);
			}
			if (command.type === "layer.setVisibility") {
				const changed = this.setLayerVisibility(command.layerId, command.visible);
				wrote ||= changed;
				return { layerId: command.layerId, visible: command.visible, changed };
			}
			const changed = this.setLayerOpacity(command.layerId, command.opacity);
			wrote ||= changed;
			return { layerId: command.layerId, opacity: command.opacity, changed };
		});
		return { results, revision: this.revision, wrote, noop: !wrote };
	}
}
