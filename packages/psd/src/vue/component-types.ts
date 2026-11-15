import type { PsdImageServices } from "./image-services";
import type {
	PsdAiApi,
	PsdAiExecuteOptions,
	PsdAiExecuteResult,
	PsdAiManifestResult,
	PsdDocument,
	PsdEditorAction,
	PsdEditorSession,
	PsdTransactionResult,
	PsdManifestQuery,
} from "@cubexp/psd";
export type PsdSource = string | Blob | ArrayBuffer | Uint8Array;
export type PsdEditorAppearance = "light" | "dark";
export type PsdEditorExportFormat = "psd" | "png" | "jpeg" | "webp";

export type PsdToolId =
	| "move"
	| "marquee"
	| "lasso"
	| "wand"
	| "crop"
	| "eyedropper"
	| "brush"
	| "eraser"
	| "heal"
	| "blur"
	| "clone"
	| "dodge"
	| "burn"
	| "gradient"
	| "bucket"
	| "shape"
	| "text"
	| "hand"
	| "zoom";

/** Parameter dialogs the ribbon can open. */
export type PsdDialogKind =
	| "levels"
	| "brightness-contrast"
	| "hue-saturation"
	| "color-balance"
	| "exposure"
	| "vibrance"
	| "black-white"
	| "gaussian-blur"
	| "motion-blur"
	| "lens-correction"
	| "sharpen"
	| "noise"
	| "pixelate"
	| "threshold"
	| "posterize"
	| "canvas-size"
	| "image-resize"
	| "export"
	| "rotate-layer"
	| "transform-selection"
	| "remove-background"
	| "drop-shadow"
	| "stroke-effect"
	| "outer-glow";

export type PsdPersistHandler = (blob: Blob, context: {fileName:string;revision:number}) => Promise<{persisted:boolean;reason?:string;versionId?:string}>;

export interface PsdEditorProps {
	persistPsd?: PsdPersistHandler;
	projectId?: string;
	imageServices?: PsdImageServices;
	/** URL, Blob, or raw bytes. Omit to start from a blank document. */
	source?: PsdSource | null;
	fileName?: string;
	readonly?: boolean;
	/** Titlebar + status bar. */
	chrome?: boolean;
	/** Shared-host chrome mode. Compact hides the local titlebar but keeps editor status. */
	headerMode?: "default" | "compact" | "hidden";
	ribbon?: boolean;
	/** Controlled shared-shell color scheme. Omit to use the persisted shell preference. */
	appearance?: PsdEditorAppearance;
	/** Reactive host appearance for embedded workspaces. */
	getAppearance?: () => PsdEditorAppearance;
	/** Show the shared-shell light/dark toggle in the titlebar. */
	showAppearanceToggle?: boolean;
	/** Show the label along the bottom of every Ribbon group. */
	showRibbonGroupLabels?: boolean;
	showNewDocument?: boolean;
	leftPanel?: boolean;
	rightPanel?: boolean;
	/** @deprecated The built-in AI panel has been removed. */
	ai?: boolean;
}

export interface PsdEditorApi {
	session(): PsdEditorSession | null;
	document(): PsdDocument | null;
	aiApi(): PsdAiApi | null;
	apply(actions: PsdEditorAction[], label?: string): PsdTransactionResult | null;
	openFile(file: Blob, name?: string): Promise<void>;
	newFile(): Promise<void>;
	copyMerged(): Promise<Blob>;
	pasteImage(file: Blob): Promise<void>;
	/** Export without changing the editor's persisted/dirty state. */
	exportFile(format: PsdEditorExportFormat, options?: { signal?: AbortSignal }): Promise<Blob>;
	/** Native save hook used by the shared artifact Host. */
	saveFile(options?: { signal?: AbortSignal }): Promise<Blob>;
	isDirty(): boolean;
	isReadonly(): boolean;
	getRevision(): number;
	executeCommands(
		commands: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>,
		options?: PsdAiExecuteOptions,
	): Promise<PsdAiExecuteResult>;
	getCommandManifest(query?: PsdManifestQuery): PsdAiManifestResult;
	/** Host acknowledgement after it has durably written an exported PSD. */
	markSaved(): void;
	savePsd(): void;
	exportPng(): void;
	undo(): void;
	redo(): void;
}

export interface PsdEditorEmits {
	(event: "loaded"): void;
	(event: "error", error: Error): void;
	(event: "change", result: PsdTransactionResult): void;
	(event: "update:appearance", appearance: PsdEditorAppearance): void;
}
