export type PsdColorMode =
	| "bitmap"
	| "grayscale"
	| "indexed"
	| "rgb"
	| "cmyk"
	| "multichannel"
	| "duotone"
	| "lab"
	| "unknown";

export interface PsdChannelDescriptor {
	/** Photoshop channel id: -1 alpha, 0 red/gray, 1 green, 2 blue. */
	readonly id: number;
	readonly length: number;
	readonly dataOffset: number;
}

export interface PsdLayer {
	readonly id: string;
	readonly index: number;
	readonly name: string;
	readonly top: number;
	readonly left: number;
	readonly bottom: number;
	readonly right: number;
	readonly width: number;
	readonly height: number;
	readonly blendMode: string;
	readonly clipping: number;
	visible: boolean;
	opacity: number;
	readonly channels: readonly PsdChannelDescriptor[];
	/** Internal source offsets used by source-preserving property edits. */
	readonly sourceOffsets: {
		readonly opacity: number;
		readonly flags: number;
	};
}

export interface PsdDocument {
	readonly width: number;
	readonly height: number;
	readonly channels: number;
	readonly depth: number;
	readonly colorMode: PsdColorMode;
	readonly colorModeCode: number;
	readonly layers: PsdLayer[];
	readonly compositeOffset: number;
	readonly source: Uint8Array;
}

export interface PsdRaster {
	readonly width: number;
	readonly height: number;
	readonly pixels: Uint8ClampedArray;
}

export interface PsdEditorState {
	readonly revision: number;
	readonly dirty: boolean;
	readonly readonly: boolean;
	readonly document: PsdDocument;
}

export type PsdEditorCommand =
	| { readonly type: "context.get" }
	| { readonly type: "layers.list" }
	| { readonly type: "layer.setVisibility"; readonly layerId: string; readonly visible: boolean }
	| { readonly type: "layer.setOpacity"; readonly layerId: string; readonly opacity: number };

export interface PsdEditorExecuteResult {
	readonly results: readonly unknown[];
	readonly revision: number;
	readonly wrote: boolean;
	readonly noop: boolean;
}
