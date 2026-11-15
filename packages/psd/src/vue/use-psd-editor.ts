import { rememberPsdClipboard, psdClipboardOrigin } from "./psd-clipboard-origin";
import type { PsdImageServices } from "./image-services";
/**
 * The PSD editor controller: session lifecycle, tool state, selection, zoom,
 * colors, and the AI surface. Sub-components inject it via
 * `psd-editor-context.ts` instead of prop drilling.
 */

import {
	computed,
	shallowRef,
	ref,
	triggerRef,
	type ComputedRef,
	type Ref,
	type ShallowRef,
} from "vue";
import {
	createBlankPsdDocument,
	psdBytesToBase64,
	decodePsdTiff,
	createPsdAiApi,
	composePsdDocument,
	composePsdRegion,
	copyPsdMerged,
	copyPsdLayer,
	psdClipboardRegion,
	readPsd,
	writePsd,
	PsdEditorSession,
	samplePixel,
	selectionBounds,
	walkPsdLayers,
	type PsdAiApi,
	type PsdBitmap,
	type PsdBlendMode,
	type PsdDocument,
	type PsdDocumentSelection,
	type PsdEditorAction,
	type PsdLayerNode,
	type PsdTextLayer,
	type PsdTextStyle,
	type PsdTransactionResult,
} from "@cubexp/psd";
import type { PsdPersistHandler, PsdDialogKind, PsdEditorExportFormat, PsdSource, PsdToolId } from "./component-types";
import { exportPsdBitmap } from "./psd-bitmap-export";

export interface PsdRgb {
	r: number;
	g: number;
	b: number;
}

export interface PsdMarquee {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PsdCanvasPointerInfo {
	x: number;
	y: number;
	color: PsdRgb | null;
}

export interface PsdLayerRow {
	layer: PsdLayerNode;
	parentId: string | null;
	depth: number;
}

export interface PsdLayerVisualPreview {
	layerId: string;
	x: number;
	y: number;
	width: number;
	height: number;
	opacity: number;
	committed?: boolean;
}

export interface PsdEditorController {
	imageServices: ComputedRef<PsdImageServices | undefined>;
	// document lifecycle
	session: ShallowRef<PsdEditorSession | null>;
	document: ShallowRef<PsdDocument | null>;
	revision: Ref<number>;
	loading: Ref<boolean>;
	loadError: ShallowRef<Error | null>;
	fileName: Ref<string>;
	dirty: Ref<boolean>;
	readonly: ComputedRef<boolean>;
	load(source: PsdSource | null, name?: string): Promise<void>;

	editTarget: Ref<"image" | "mask">;
	maskPaint: Ref<"hide" | "reveal">;
	previewDocument: ShallowRef<PsdDocument | null>;
	// editing
	apply(actions: PsdEditorAction[], label?: string): PsdTransactionResult | null;
	undo(): void;
	redo(): void;
	canUndo: Ref<boolean>;
	canRedo: Ref<boolean>;
	lastError: Ref<string>;

	// selection
	selectedLayerIds: Ref<string[]>;
	activeLayer: ComputedRef<PsdLayerNode | null>;
	/** The document's active selection (undo-tracked, set via actions). */
	selection: ComputedRef<PsdDocumentSelection | null>;
	/** Canvas-space bounds of the selection, for crop/fill affordances. */
	marquee: ComputedRef<PsdMarquee | null>;
	selectLayer(id: string, additive?: boolean): void;

	// view
	zoom: Ref<number>;
	tool: Ref<PsdToolId>;
	toolOptionsOpen: Ref<boolean>;
	spacePanActive: Ref<boolean>;
	viewCommand: Ref<"fit" | "actual" | "center" | null>;
	moveAutoSelect: Ref<boolean>;
	showTransformControls: Ref<boolean>;
	showPixelGrid: Ref<boolean>;
	panelCommand: Ref<"curves" | "repair" | null>;
	exportFormat: Ref<"png" | "jpeg" | "webp">;
	transformMode: Ref<"scale" | "distort">;
	selectionMode: Ref<"replace" | "add" | "subtract" | "intersect">;
	/** Separates selection-border movement from anchor editing to avoid gesture conflicts. */
	selectionInteraction: Ref<"move" | "edit">;
	/** Feather radius used by new selections, in canvas pixels. */
	selectionFeather: Ref<number>;
	/** Pointer interaction used by the Lasso tool. */
	lassoMode: Ref<"freehand" | "bezier">;
	layerVisualPreview: Ref<PsdLayerVisualPreview | null>;
	/** Live canvas probe used by Photoshop-style information panels. */
	canvasPointer: Ref<PsdCanvasPointerInfo | null>;
	/** Live bounds for an in-progress selection, crop, shape, move, or resize. */
	canvasMeasurement: Ref<PsdMarquee | null>;
	brushSize: Ref<number>;
	blurRadius: Ref<number>;
	retouchSampleMerged: Ref<boolean>;
	brushHardness: Ref<number>;
	brushOpacity: Ref<number>;
	bucketTolerance: Ref<number>;
	bucketOpacity: Ref<number>;
	bucketContiguous: Ref<boolean>;
	wandTolerance: Ref<number>;
	wandContiguous: Ref<boolean>;
	marqueeShape: Ref<"rectangle" | "ellipse">;
	cropAspect: Ref<"free" | "original" | "1:1" | "4:3" | "16:9">;
	eyedropperSample: Ref<"all" | "current">;
	gradientType: Ref<"linear" | "radial">;
	gradientOpacity: Ref<number>;
	gradientReverse: Ref<boolean>;
	shapeKind: Ref<"rectangle" | "rounded-rectangle" | "ellipse" | "line">;
	shapeStrokeWidth: Ref<number>;
	shapeCornerRadius: Ref<number>;
	shapeOpacity: Ref<number>;
	shapeFillEnabled: Ref<boolean>;
	shapeStrokeEnabled: Ref<boolean>;
	textSize: Ref<number>;
	dodgeBurnRange: Ref<"shadows" | "midtones" | "highlights">;
	dodgeBurnExposure: Ref<number>;
	cloneSource: Ref<{ x: number; y: number } | null>;
	cloneAligned: Ref<boolean>;
	cloneSampleMerged: Ref<boolean>;
	cloneOffset: Ref<{ dx: number; dy: number } | null>;
	dialog: Ref<PsdDialogKind | null>;
	foreground: Ref<string>;
	background: Ref<string>;
	swapColors(): void;
	revealRequest: Ref<string | null>;

	// derived
	layerRows: ComputedRef<PsdLayerRow[]>;
	composite(): PsdBitmap | null;
	sampleCompositePixel(x: number, y: number): PsdRgb | null;

	// io
	savePsd(name?: string): void;
	saveAsOpen: Ref<boolean>;
	exportPng(): void;
	copyMerged(): Promise<Blob>;
	copyLayer(): Promise<Blob>;
	pasteImage(file: Blob): Promise<void>;
	exportFile(format: PsdEditorExportFormat, options?: { signal?: AbortSignal }): Promise<Blob>;
	markSaved(): void;

	// ai
	aiApi: ShallowRef<PsdAiApi | null>;
}

export function hexToRgb(hex: string): PsdRgb {
	const normalized = hex.replace("#", "");
	const value = Number.parseInt(
		normalized.length === 3
			? normalized
					.split("")
					.map((ch) => ch + ch)
					.join("")
			: normalized,
		16,
	);
	if (Number.isNaN(value)) return { r: 0, g: 0, b: 0 };
	return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

export function rgbToHex(rgb: PsdRgb): string {
	const part = (v: number) => Math.round(v).toString(16).padStart(2, "0");
	return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`;
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const buffer = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(buffer).set(bytes);
	return buffer;
}

function hasPsdSignature(bytes: Uint8Array): boolean {
	return (
		bytes.length >= 4 &&
		bytes[0] === 0x38 &&
		bytes[1] === 0x42 &&
		bytes[2] === 0x50 &&
		bytes[3] === 0x53
	);
}

function normalizedMimeType(value?: string | null): string {
	return (value ?? "").split(";", 1)[0].trim().toLowerCase();
}

function imageMimeFromName(name?: string): string | null {
	const cleanName = (name ?? "").split(/[?#]/, 1)[0].toLowerCase();
	if (/\.tiff?$/.test(cleanName)) return "image/tiff";
	if (/\.hei[cf]$/.test(cleanName)) return "image/heic";
	if (/\.png$/.test(cleanName)) return "image/png";
	if (/\.(?:jpe?g|jfif)$/.test(cleanName)) return "image/jpeg";
	if (/\.webp$/.test(cleanName)) return "image/webp";
	if (/\.gif$/.test(cleanName)) return "image/gif";
	if (/\.bmp$/.test(cleanName)) return "image/bmp";
	if (/\.avif$/.test(cleanName)) return "image/avif";
	return null;
}

function sniffImageMime(bytes: Uint8Array): string | null {
	if (
		bytes.length >= 4 &&
		((bytes[0] === 73 && bytes[1] === 73 && bytes[2] === 42 && bytes[3] === 0) ||
			(bytes[0] === 77 && bytes[1] === 77 && bytes[2] === 0 && bytes[3] === 42))
	)
		return "image/tiff";
	if (
		bytes.length >= 8 &&
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	)
		return "image/png";
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
		return "image/jpeg";
	if (
		bytes.length >= 6 &&
		bytes[0] === 0x47 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x38 &&
		(bytes[4] === 0x37 || bytes[4] === 0x39) &&
		bytes[5] === 0x61
	)
		return "image/gif";
	if (
		bytes.length >= 12 &&
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	)
		return "image/webp";
	if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
	return null;
}

function fileStem(name?: string): string {
	const cleanName = (name ?? "").split(/[?#]/, 1)[0];
	const leaf = cleanName.split(/[\\/]/).pop() ?? "";
	return leaf.replace(/\.[^.]+$/, "").trim() || "Image";
}

function replaceFileExtension(name: string, extension: string): string {
	const stem = name.replace(/\.[^./\\]+$/, "");
	return `${stem || "untitled"}${extension}`;
}

function imageDocument(bitmap: PsdBitmap, name?: string): PsdDocument {
	return {
		width: bitmap.width,
		height: bitmap.height,
		colorMode: "rgb",
		bitsPerChannel: 8,
		resolutionPpi: 72,
		layers: [
			{
				kind: "raster",
				id: "L1",
				name: fileStem(name),
				visible: true,
				opacity: 1,
				blendMode: "normal",
				clipping: false,
				locks: { transparency: false, composite: false, position: false, all: false },
				preservedBlocks: [],
				top: 0,
				left: 0,
				bitmap,
			},
		],
		editable: true,
		composite: null,
		openWarnings: [],
		colorModeData: new Uint8Array(0),
		preservedResources: [],
		globalLayerMaskInfo: new Uint8Array(0),
		preservedGlobalBlocks: [],
	};
}

async function decodeImageDocument(
	bytes: Uint8Array,
	mimeType: string,
	name?: string,
): Promise<PsdDocument> {
	if (mimeType === "image/tiff") return imageDocument(decodePsdTiff(bytes), name);
	if (typeof globalThis.document === "undefined")
		throw new Error("Image files can only be opened in a browser.");
	const blob = new Blob([bytesToArrayBuffer(bytes)], { type: mimeType });
	const canvas = globalThis.document.createElement("canvas");
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) throw new Error("The browser could not create an image canvas.");

	if (typeof globalThis.createImageBitmap === "function") {
		let source: ImageBitmap;
		try {
			source = await globalThis.createImageBitmap(blob);
		} catch {
			throw new Error(
				`The browser could not decode this ${mimeType.replace("image/", "").toUpperCase()} image.`,
			);
		}
		try {
			if (!source.width || !source.height)
				throw new Error("The image has no visible dimensions.");
			canvas.width = source.width;
			canvas.height = source.height;
			canvas.getContext("2d", { willReadFrequently: true })!.drawImage(source, 0, 0);
		} finally {
			source.close();
		}
	} else {
		const source = globalThis.document.createElement("img");
		const objectUrl = URL.createObjectURL(blob);
		try {
			source.src = objectUrl;
			await new Promise<void>((resolve, reject) => {
				source.onload = () => resolve();
				source.onerror = () =>
					reject(new Error("The browser could not decode this image."));
			});
			if (!source.naturalWidth || !source.naturalHeight)
				throw new Error("The image has no visible dimensions.");
			canvas.width = source.naturalWidth;
			canvas.height = source.naturalHeight;
			canvas.getContext("2d", { willReadFrequently: true })!.drawImage(source, 0, 0);
		} finally {
			URL.revokeObjectURL(objectUrl);
		}
	}

	const imageData = canvas
		.getContext("2d", { willReadFrequently: true })!
		.getImageData(0, 0, canvas.width, canvas.height);
	return imageDocument(
		{
			width: imageData.width,
			height: imageData.height,
			data: new Uint8ClampedArray(imageData.data),
		},
		name,
	);
}

export function resolvedPsdTextStyle(layer: PsdTextLayer): PsdTextStyle {
	if (layer.text.style) {
		return {
			...layer.text.style,
			color: { ...layer.text.style.color },
		};
	}
	const lineHeight = 1.25;
	const lineCount = Math.max(1, layer.text.text.split("\n").length);
	let color = { r: 255, g: 255, b: 255 };
	for (let p = 3; p < layer.bitmap.data.length; p += 4) {
		if (layer.bitmap.data[p] > 0) {
			color = {
				r: layer.bitmap.data[p - 3],
				g: layer.bitmap.data[p - 2],
				b: layer.bitmap.data[p - 1],
			};
			break;
		}
	}
	return {
		fontFamily: "Arial",
		fontSize: Math.max(8, Math.round(layer.bitmap.height / lineCount / lineHeight || 24)),
		bold: false,
		italic: false,
		underline: false,
		strikethrough: false,
		color,
	};
}

/** Canvas-backed approximate re-rasterization for edited text layers. */
function rasterizeTextLayer(layer: PsdTextLayer, text: string): PsdBitmap | null {
	if (typeof globalThis.document === "undefined") return null;
	const lineHeight = 1.25;
	const lines = text.split("\n");
	const style = resolvedPsdTextStyle(layer);
	const fontSize = style.fontSize;
	const escapedFamily = style.fontFamily.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
	const font = `${style.italic ? "italic " : ""}${style.bold ? "700" : "400"} ${fontSize}px "${escapedFamily}", sans-serif`;
	const canvas = globalThis.document.createElement("canvas");
	const context = canvas.getContext("2d");
	if (!context) return null;
	context.font = font;
	const measurements = lines.map((line) => context.measureText(line));
	const leftPadding = Math.max(
		0,
		Math.ceil(Math.max(...measurements.map((entry) => entry.actualBoundingBoxLeft || 0))),
	);
	const width = Math.max(
		1,
		leftPadding +
			Math.ceil(
				Math.max(
					...measurements.map((entry) => entry.actualBoundingBoxRight || entry.width),
					1,
				),
			),
	);
	const height = Math.max(1, Math.ceil(fontSize * lineHeight * lines.length));
	canvas.width = width;
	canvas.height = height;
	const draw = canvas.getContext("2d")!;
	draw.font = font;
	draw.textBaseline = "top";
	draw.fillStyle = rgbToHex(style.color);
	const decorationThickness = Math.max(1, Math.round(fontSize / 14));
	lines.forEach((line, index) => {
		const lineTop = Math.round(index * fontSize * lineHeight);
		draw.fillText(line, leftPadding, lineTop);
		const lineWidth = measurements[index]?.width ?? 0;
		if (style.underline) {
			draw.fillRect(
				leftPadding,
				Math.min(height - decorationThickness, Math.round(lineTop + fontSize * 1.05)),
				lineWidth,
				decorationThickness,
			);
		}
		if (style.strikethrough) {
			draw.fillRect(
				leftPadding,
				Math.round(lineTop + fontSize * 0.55),
				lineWidth,
				decorationThickness,
			);
		}
	});
	const imageData = draw.getImageData(0, 0, width, height);
	return { width, height, data: new Uint8ClampedArray(imageData.data) };
}

export function usePsdEditor(options: {
	persistPsd?: () => PsdPersistHandler | undefined;
	readonly: () => boolean;
	imageServices?: () => PsdImageServices | undefined;
	onChange?: (result: PsdTransactionResult) => void;
	onLoaded?: () => void;
	onError?: (error: Error) => void;
}): PsdEditorController {
	const imageServices = computed(() => options.imageServices?.());
	const session = shallowRef<PsdEditorSession | null>(null);
	const documentRef = shallowRef<PsdDocument | null>(null);
	const revision = ref(0);
	const editTarget = ref<"image" | "mask">("image");
	const maskPaint = ref<"hide" | "reveal">("hide");
	const previewDocument = shallowRef<PsdDocument | null>(null);
	const loading = ref(false);
	const loadError = shallowRef<Error | null>(null);
	const fileName = ref("untitled.psd");
	const dirty = ref(false);
	let savedStateId = 0;
	const canUndo = ref(false);
	const canRedo = ref(false);
	const lastError = ref("");
	const selectedLayerIds = ref<string[]>([]);
	const zoom = ref(1);
	const saveAsOpen = ref(false);
	const tool = ref<PsdToolId>("move");
	const toolOptionsOpen = ref(false);
	const spacePanActive = ref(false);
	const viewCommand = ref<"fit" | "actual" | "center" | null>(null);
	const moveAutoSelect = ref(true);
	const transformMode = ref<"scale" | "distort">("scale");
	const showTransformControls = ref(true);
	const showPixelGrid = ref(true);
	const panelCommand = ref<"curves" | "repair" | null>(null);
	const exportFormat = ref<"png" | "jpeg" | "webp">("png");
	const selectionMode = ref<"replace" | "add" | "subtract" | "intersect">("replace");
	const selectionInteraction = ref<"move" | "edit">("move");
	const selectionFeather = ref(0);
	const lassoMode = ref<"freehand" | "bezier">("freehand");
	const layerVisualPreview = ref<PsdLayerVisualPreview | null>(null);
	const canvasPointer = ref<PsdCanvasPointerInfo | null>(null);
	const canvasMeasurement = ref<PsdMarquee | null>(null);
	const brushSize = ref(24);
	const blurRadius = ref(3),
		retouchSampleMerged = ref(false);
	const brushHardness = ref(0.8);
	const brushOpacity = ref(1);
	const bucketTolerance = ref(32);
	const bucketOpacity = ref(1);
	const bucketContiguous = ref(true);
	const wandTolerance = ref(32);
	const wandContiguous = ref(true);
	const marqueeShape = ref<"rectangle" | "ellipse">("rectangle");
	const cropAspect = ref<"free" | "original" | "1:1" | "4:3" | "16:9">("free");
	const eyedropperSample = ref<"all" | "current">("all");
	const gradientType = ref<"linear" | "radial">("linear");
	const gradientOpacity = ref(1);
	const gradientReverse = ref(false);
	const shapeKind = ref<"rectangle" | "rounded-rectangle" | "ellipse" | "line">("rectangle");
	const shapeCornerRadius = ref(12);
	const shapeStrokeWidth = ref(3);
	const shapeOpacity = ref(1);
	const shapeFillEnabled = ref(true);
	const shapeStrokeEnabled = ref(false);
	const textSize = ref(32);
	const dodgeBurnRange = ref<"shadows" | "midtones" | "highlights">("midtones");
	const dodgeBurnExposure = ref(0.5);
	const cloneSource = ref<{ x: number; y: number } | null>(null);
	const cloneAligned = ref(true),
		cloneSampleMerged = ref(false),
		cloneOffset = ref<{ dx: number; dy: number } | null>(null);
	const dialog = ref<PsdDialogKind | null>(null);
	const foreground = ref("#1d9bf0");
	const background = ref("#ffffff");
	const revealRequest = ref<string | null>(null);
	const aiApi = shallowRef<PsdAiApi | null>(null);
	const selectionByStateId = new Map<number, string[]>();

	const selection = computed<PsdDocumentSelection | null>(() => {
		void revision.value;
		return documentRef.value?.selection ?? null;
	});

	const marquee = computed<PsdMarquee | null>(() => {
		const active = selection.value;
		if (!active || active.inverted) return null;
		const bounds = selectionBounds(active.shape);
		return bounds.width > 0 && bounds.height > 0 ? bounds : null;
	});

	let sessionUnsubscribe: (() => void) | null = null;

	const readonly = computed(() => options.readonly() || !(documentRef.value?.editable ?? true));

	const layerRows = computed<PsdLayerRow[]>(() => {
		void revision.value;
		const document = documentRef.value;
		if (!document) return [];
		const rows: PsdLayerRow[] = [];
		const visit = (layers: readonly PsdLayerNode[], parentId: string | null, depth: number) => {
			for (let index = layers.length - 1; index >= 0; index--) {
				const layer = layers[index];
				rows.push({ layer, parentId, depth });
				if (layer.kind === "group" && layer.open)
					visit(layer.children, layer.id, depth + 1);
			}
		};
		visit(document.layers, null, 0);
		return rows;
	});

	const activeLayer = computed<PsdLayerNode | null>(() => {
		void revision.value;
		const id = selectedLayerIds.value[0];
		if (!id || !documentRef.value) return null;
		let found: PsdLayerNode | null = null;
		walkPsdLayers(documentRef.value.layers, (layer) => {
			if (!found && layer.id === id) found = layer;
		});
		return found;
	});

	function bindSession(next: PsdEditorSession): void {
		sessionUnsubscribe?.();
		aiApi.value?.destroy();
		selectionByStateId.clear();
		session.value = next;
		savedStateId = next.getStateId();
		documentRef.value = next.peekDocument();
		revision.value = next.getRevision();
		canUndo.value = next.canUndo();
		canRedo.value = next.canRedo();
		sessionUnsubscribe = next.subscribe((snapshot, result) => {
			documentRef.value = snapshot.document;
			revision.value = snapshot.revision;
			canUndo.value = next.canUndo();
			canRedo.value = next.canRedo();
			dirty.value = snapshot.stateId !== savedStateId;
			// Layer selection is UI state, but it must follow document history. A
			// stable state id lets undo/redo restore the layer that was active at
			// that point instead of leaving a dangling id after undoing creation.
			const stillThere = new Set<string>();
			walkPsdLayers(snapshot.document.layers, (layer) => stillThere.add(layer.id));
			const remembered = result
				? selectedLayerIds.value
				: selectionByStateId.get(snapshot.stateId);
			selectedLayerIds.value = (remembered ?? selectedLayerIds.value).filter((id) =>
				stillThere.has(id),
			);
			selectionByStateId.set(snapshot.stateId, [...selectedLayerIds.value]);
			const history = next.historyEntries();
			const retainedStateIds = new Set([
				...history.past.map((entry) => entry.stateId),
				history.current.stateId,
				...history.future.map((entry) => entry.stateId),
			]);
			for (const stateId of selectionByStateId.keys()) {
				if (!retainedStateIds.has(stateId)) selectionByStateId.delete(stateId);
			}
			triggerRef(documentRef);
			if (result) options.onChange?.(result);
		});
		aiApi.value = createPsdAiApi({
            requireRevision: true,
            ...(imageServices.value?.foregroundMask ? {foregroundMask: imageServices.value.foregroundMask.bind(imageServices.value)} : {}),
            ...(options.persistPsd?.() ? {persist: async (request: {trigger:string;revision:number}) => {
                if (request.trigger !== "save") return {persisted:false,reason:"Use document.save to persist edits explicitly"};
                const stateId = next.getStateId();
                const bytes = writePsd(next.peekDocument());
                const response = await options.persistPsd!()!(new Blob([bytesToArrayBuffer(bytes)],{type:"image/vnd.adobe.photoshop"}),{fileName:fileName.value,revision:request.revision});
                if (response.persisted && session.value === next) {savedStateId = stateId; dirty.value = next.getStateId() !== stateId;}
                return response;
            }} : {}),
			session: next,
			document: () => next.peekDocument(),
			getSelection: () => ({
				layerIds: [...selectedLayerIds.value],
				marquee: marquee.value ? { ...marquee.value } : null,
			}),
			setSelection: (selection) => {
				selectedLayerIds.value = [...selection.layerIds];
				selectionByStateId.set(next.getStateId(), [...selectedLayerIds.value]);
			},
			revealLayer: (layerId) => {
				selectedLayerIds.value = [layerId];
				selectionByStateId.set(next.getStateId(), [...selectedLayerIds.value]);
				revealRequest.value = layerId;
			},
			readOnly: () => readonly.value,
			documentName: fileName.value,
		});
	}

	async function load(source: PsdSource | null, name?: string): Promise<void> {
		editTarget.value = "image";
		previewDocument.value = null;
		loading.value = true;
		loadError.value = null;
		try {
			let document: PsdDocument;
			if (source == null) {
				document = createBlankPsdDocument();
			} else {
				let bytes: Uint8Array;
				let mimeType = "";
				if (typeof source === "string") {
					const response = await fetch(source);
					if (!response.ok)
						throw new Error(`Failed to fetch ${source}: ${response.status}`);
					mimeType = normalizedMimeType(response.headers.get("content-type"));
					bytes = new Uint8Array(await response.arrayBuffer());
				} else if (source instanceof Blob) {
					mimeType = normalizedMimeType(source.type);
					bytes = new Uint8Array(await source.arrayBuffer());
				} else if (source instanceof ArrayBuffer) {
					bytes = new Uint8Array(source);
				} else {
					bytes = source;
				}
				const sourceName = name ?? (typeof source === "string" ? source : undefined);
				const imageMime =
					sniffImageMime(bytes) ||
					(mimeType.startsWith("image/") && mimeType !== "image/vnd.adobe.photoshop"
						? mimeType
						: null) ||
					imageMimeFromName(sourceName);
				if (hasPsdSignature(bytes) || /\.psd(?:$|[?#])/i.test(sourceName ?? "")) {
					document = readPsd(bytes);
				} else if (imageMime) {
					try {
						document = await decodeImageDocument(bytes, imageMime, sourceName);
					} catch (error) {
						if (!imageServices.value?.decodeImage) throw error;
						document = imageDocument(
							await imageServices.value.decodeImage(bytes, imageMime),
							sourceName,
						);
					}
				} else {
					// Preserve the prior raw-byte behavior so callers still receive the
					// codec's detailed validation error for malformed/unknown PSD input.
					document = readPsd(bytes);
				}
			}
			if (name) fileName.value = name;
			bindSession(new PsdEditorSession(document, { rasterizeText: rasterizeTextLayer }));
			dirty.value = false;
			selectedLayerIds.value = layerRows.value.length ? [layerRows.value[0].layer.id] : [];
			if (session.value)
				selectionByStateId.set(session.value.getStateId(), [...selectedLayerIds.value]);
			cloneSource.value = null;
			cloneOffset.value = null;
			layerVisualPreview.value = null;
			options.onLoaded?.();
		} catch (cause) {
			const error = cause instanceof Error ? cause : new Error(String(cause));
			loadError.value = error;
			options.onError?.(error);
		} finally {
			loading.value = false;
		}
	}

	function apply(actions: PsdEditorAction[], label?: string): PsdTransactionResult | null {
		const active = session.value;
		if (!active) return null;
		if (
			editTarget.value === "mask" &&
			actions.some((a) =>
				[
					"fill.apply",
					"adjustment.apply",
					"filter.apply",
					"effect.apply",
					"gradient.apply",
					"shape.apply",
					"bucket.apply",
					"layer.scale",
					"transform.apply",
					"layer.move",
					"layer.clearSelected",
				].includes(a.type),
			)
		) {
			lastError.value =
				"The mask is selected. Use the mask controls, or select the image thumbnail to edit image pixels.";
			return null;
		}
		lastError.value = "";
		try {
			selectionByStateId.set(active.getStateId(), [...selectedLayerIds.value]);
			return active.apply(actions, { source: "user", label });
		} catch (cause) {
			lastError.value = cause instanceof Error ? cause.message : String(cause);
			return null;
		}
	}

	function undo(): void {
		session.value?.undo();
	}

	function redo(): void {
		session.value?.redo();
	}

	function selectLayer(id: string, additive = false): void {
		editTarget.value = "image";
		if (additive) {
			selectedLayerIds.value = selectedLayerIds.value.includes(id)
				? selectedLayerIds.value.filter((existing) => existing !== id)
				: [...selectedLayerIds.value, id];
		} else {
			selectedLayerIds.value = [id];
		}
		if (session.value)
			selectionByStateId.set(session.value.getStateId(), [...selectedLayerIds.value]);
	}

	function swapColors(): void {
		const front = foreground.value;
		foreground.value = background.value;
		background.value = front;
	}

	let compositeCache: {
		document: PsdDocument;
		revision: number;
		bitmap: PsdBitmap;
	} | null = null;

	function composite(): PsdBitmap | null {
		const document = documentRef.value;
		if (!document) return null;
		if (compositeCache?.document === document && compositeCache.revision === revision.value)
			return compositeCache.bitmap;
		const bitmap = composePsdDocument(document);
		compositeCache = { document, revision: revision.value, bitmap };
		return bitmap;
	}

	function sampleCompositePixel(x: number, y: number): PsdRgb | null {
		const doc = documentRef.value;
		if(doc && doc.width*doc.height>=2_000_000){
			const px=Math.round(x),py=Math.round(y);
			if(px<0||py<0||px>=doc.width||py>=doc.height)return null;
			const pixel=composePsdRegion(doc,{x:px,y:py,width:1,height:1}).data;
			return {r:pixel[0],g:pixel[1],b:pixel[2]};
		}
		const flattened = composite();
		if (!flattened) return null;
		const sample = samplePixel(flattened, Math.round(x), Math.round(y));
		return sample ? { r: sample.r, g: sample.g, b: sample.b } : null;
	}

	function download(blob: Blob, name: string): boolean {
		const anchor = globalThis.document.createElement("a");
		anchor.href = URL.createObjectURL(blob);
		anchor.download = name;
		anchor.style.display = "none";
		globalThis.document.body.appendChild(anchor);
		let prevented = false;
		anchor.addEventListener(
			"click",
			(event) => {
				prevented = event.defaultPrevented;
			},
			{ once: true },
		);
		anchor.click();
		anchor.remove();
		setTimeout(() => URL.revokeObjectURL(anchor.href), 1_000);
		return !prevented;
	}

	async function exportFile(
		format: PsdEditorExportFormat,
		options: { signal?: AbortSignal } = {},
	): Promise<Blob> {
		if (options.signal?.aborted) throw new DOMException("Export aborted", "AbortError");
		if (format === "psd") {
			const document = documentRef.value;
			if (!document) throw new Error("No PSD document is open.");
			const bytes = writePsd(document);
			if (options.signal?.aborted) throw new DOMException("Export aborted", "AbortError");
			return new Blob([bytesToArrayBuffer(bytes)], { type: "image/vnd.adobe.photoshop" });
		}

		const flattened = composite();
		if (!flattened) throw new Error("No PSD document is open.");
		const blob = await exportPsdBitmap(flattened, {
			format,
			width: flattened.width,
			height: flattened.height,
			quality: 0.92,
			...(format === "jpeg" ? { matte: background.value } : {}),
		});
		if (options.signal?.aborted) throw new DOMException("Export aborted", "AbortError");
		return blob;
	}

	function markSaved(): void {
		savedStateId = session.value?.getStateId() ?? 0;
		dirty.value = false;
	}

	function savePsd(name?: string): void {
		const savingSession = session.value, savingStateId = savingSession?.getStateId();
		const destination = replaceFileExtension((name || fileName.value).trim(), ".psd");
		void exportFile("psd")
			.then((blob) => {
				// A native host prevents the link's default action and acknowledges
				// persistence only after its save dialog and filesystem write succeed.
				if (download(blob, destination) && session.value === savingSession && savingStateId !== undefined) {
					fileName.value = destination;
					savedStateId = savingStateId;
					dirty.value = savingSession?.getStateId() !== savingStateId;
				}
			})
			.catch((cause) => {
				lastError.value = cause instanceof Error ? cause.message : String(cause);
			});
	}

	async function pasteImage(file: Blob): Promise<void> {
		const originalSession = session.value;
		if (!originalSession || readonly.value) throw Error("The document is not editable");
		const bytes = new Uint8Array(await file.arrayBuffer());
		const origin = psdClipboardOrigin(bytes);
		const pasted = await decodeImageDocument(bytes, file.type || "image/png", "Pasted image");
		if (session.value !== originalSession) throw Error("The document changed while pasting");
		const doc = documentRef.value!;
		for (const layer of pasted.layers) {
			if (layer.kind !== "group") {
				layer.left = origin?.x ?? Math.round((doc.width - pasted.width) / 2);
				layer.top = origin?.y ?? Math.round((doc.height - pasted.height) / 2);
			}
		}
		const oldIds = new Set(layerRows.value.map(row => row.layer.id));
		const result = apply([{ type: "layer.import", psdBase64: psdBytesToBase64(writePsd(pasted)) }], "Paste Image");
		if (!result) throw Error(lastError.value || "Could not paste image");
		const added = layerRows.value.find(row => !oldIds.has(row.layer.id));
		if (added) selectLayer(added.layer.id);
	}
	async function copyLayer(): Promise<Blob> {
		if (!documentRef.value || !activeLayer.value) throw Error("Select a layer to copy");
		const bitmap = copyPsdLayer(documentRef.value, activeLayer.value, editTarget.value);
		const origin = psdClipboardRegion(documentRef.value);
		return rememberPsdClipboard(await exportPsdBitmap(bitmap, { format: "png", width: bitmap.width, height: bitmap.height }), origin);
	}
	async function copyMerged(): Promise<Blob> {
		if (!documentRef.value) throw Error("No document is open");
		const bitmap = copyPsdMerged(documentRef.value);
		const origin = psdClipboardRegion(documentRef.value);
		return rememberPsdClipboard(await exportPsdBitmap(bitmap, {
			format: "png", width: bitmap.width, height: bitmap.height,
		}), origin);
	}
	function exportPng(): void {
		void exportFile("png")
			.then((blob) => download(blob, replaceFileExtension(fileName.value, ".png")))
			.catch((cause) => {
				lastError.value = cause instanceof Error ? cause.message : String(cause);
			});
	}

	return {
		imageServices,
		session,
		editTarget,
		maskPaint,
		previewDocument,
		document: documentRef,
		revision,
		loading,
		loadError,
		fileName,
		dirty,
		readonly,
		load,
		apply,
		undo,
		redo,
		canUndo,
		canRedo,
		lastError,
		selectedLayerIds,
		activeLayer,
		selection,
		marquee,
		selectLayer,
		zoom,
		tool,
		toolOptionsOpen,
		spacePanActive,
		viewCommand,
		moveAutoSelect,
		showTransformControls,
		showPixelGrid,
		panelCommand,
		exportFormat,
		transformMode,
		selectionMode,
		selectionInteraction,
		selectionFeather,
		lassoMode,
		layerVisualPreview,
		canvasPointer,
		canvasMeasurement,
		brushSize,
		blurRadius,
		retouchSampleMerged,
		brushHardness,
		brushOpacity,
		bucketTolerance,
		bucketOpacity,
		bucketContiguous,
		wandTolerance,
		wandContiguous,
		marqueeShape,
		cropAspect,
		eyedropperSample,
		gradientType,
		gradientOpacity,
		gradientReverse,
		shapeKind,
		shapeStrokeWidth,
		shapeCornerRadius,
		shapeOpacity,
		shapeFillEnabled,
		shapeStrokeEnabled,
		textSize,
		dodgeBurnRange,
		dodgeBurnExposure,
		cloneSource,
		cloneAligned,
		cloneSampleMerged,
		cloneOffset,
		dialog,
		foreground,
		background,
		swapColors,
		revealRequest,
		layerRows,
		composite,
		sampleCompositePixel,
		savePsd,
		saveAsOpen,
		copyMerged,
		copyLayer,
		pasteImage,
		exportPng,
		exportFile,
		markSaved,
		aiApi,
	};
}

export const PSD_BLEND_MODE_OPTIONS: Array<{ value: PsdBlendMode; label: string }> = [
	{ value: "normal", label: "Normal" },
	{ value: "dissolve", label: "Dissolve" },
	{ value: "darken", label: "Darken" },
	{ value: "multiply", label: "Multiply" },
	{ value: "color-burn", label: "Color Burn" },
	{ value: "linear-burn", label: "Linear Burn" },
	{ value: "lighten", label: "Lighten" },
	{ value: "screen", label: "Screen" },
	{ value: "color-dodge", label: "Color Dodge" },
	{ value: "linear-dodge", label: "Linear Dodge (Add)" },
	{ value: "overlay", label: "Overlay" },
	{ value: "soft-light", label: "Soft Light" },
	{ value: "hard-light", label: "Hard Light" },
	{ value: "difference", label: "Difference" },
	{ value: "exclusion", label: "Exclusion" },
	{ value: "hue", label: "Hue" },
	{ value: "saturation", label: "Saturation" },
	{ value: "color", label: "Color" },
	{ value: "luminosity", label: "Luminosity" },
];
