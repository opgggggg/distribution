import { restoreEmbeddedEditable } from "./embedded-editable";
import { restoreLayerExtensions } from "./layer-extensions";
/**
 * PSD reader. Parses the five file sections, decodes 8-bit RGB/grayscale
 * layer pixels (Raw + RLE), builds the layer tree from 'lsct' dividers, and
 * carries every unparsed byte range through the document model so saves can
 * re-emit them verbatim.
 */

import { PsdByteReader, PsdReadError } from "./binary";
import { decodePackBitsRow } from "./packbits";
import {
	createEmptyLocks,
	createPsdBitmap,
	psdBlendModeFromKey,
	PSD_COLOR_MODES,
	PSD_COLOR_MODE_CODES,
	type PsdBitmap,
	type PsdColorMode,
	type PsdDocument,
	type PsdGroupLayer,
	type PsdLayerLocks,
	type PsdLayerMask,
	type PsdLayerNode,
	type PsdPreservedBlock,
	type PsdPreservedResource,
	type PsdTextContent,
	type PsdTextStyle,
} from "./document";
import { extractTyShText } from "./descriptor";
import { decodePsdTextStyle, PSD_TEXT_STYLE_BLOCK_KEY } from "./text-style";

const RESOLUTION_RESOURCE_ID = 1005;

interface RawChannel {
	id: number;
	compression: number;
	data: Uint8Array;
}

interface RawLayerRecord {
	top: number;
	left: number;
	bottom: number;
	right: number;
	channels: Array<{ id: number; length: number }>;
	blendKey: string;
	opacity: number;
	clipping: boolean;
	hidden: boolean;
	transparencyProtected: boolean;
	mask?: {
		top: number;
		left: number;
		bottom: number;
		right: number;
		defaultColor: number;
		disabled: boolean;
	};
	legacyName: string;
	unicodeName?: string;
	layerId?: number;
	locks?: PsdLayerLocks;
	sectionType?: number;
	sectionBlendKey?: string;
	text?: PsdTextContent;
	textStyle?: PsdTextStyle;
	textStyleBlock?: PsdPreservedBlock;
	preservedBlocks: PsdPreservedBlock[];
	channelData: RawChannel[];
}

export interface ReadPsdOptions {
	/** Skip decoding the flattened composite (layer pixels still decode). */
	skipComposite?: boolean;
}

export function readPsd(
	source: ArrayBuffer | Uint8Array,
	options: ReadPsdOptions = {},
): PsdDocument {
	return readPsdInternal(source, options, true);
}
function readPsdInternal(
	source: ArrayBuffer | Uint8Array,
	options: ReadPsdOptions,
	allowEmbedded: boolean,
): PsdDocument {
	const reader = new PsdByteReader(source);

	// --- header ---
	reader.expectSignature("8BPS");
	const version = reader.u16();
	if (version === 2) {
		throw new PsdReadError(
			"PSB is not supported. Save a copy as an 8-bit RGB PSD in Photoshop.",
			4,
		);
	}
	if (version !== 1) {
		throw new PsdReadError(`Unsupported PSD version ${version}`, reader.offset);
	}
	reader.skip(6);
	const channels = reader.u16();
	const height = reader.u32();
	const width = reader.u32();
	const bitsPerChannel = reader.u16();
	const colorModeIndex = reader.u16();
	const colorMode = PSD_COLOR_MODES.find((mode) => PSD_COLOR_MODE_CODES[mode] === colorModeIndex);
	if (!colorMode) throw new PsdReadError(`Invalid color mode ${colorModeIndex}`, 24);
	if (bitsPerChannel !== 8) {
		throw new PsdReadError(
			`${bitsPerChannel}-bit PSD is not supported. Save a copy as an 8-bit RGB PSD in Photoshop.`,
			22,
		);
	}
	if (!["rgb", "grayscale", "cmyk"].includes(colorMode)) {
		throw new PsdReadError(
			`${colorMode.toUpperCase()} preview is not supported. Save a copy as an 8-bit RGB PSD in Photoshop.`,
			24,
		);
	}
	if (width <= 0 || height <= 0 || width > 30000 || height > 30000) {
		throw new PsdReadError(`Invalid canvas size ${width}x${height}`, reader.offset);
	}
	if (channels < 1 || channels > 56) {
		throw new PsdReadError(`Invalid channel count ${channels}`, reader.offset);
	}

	const openWarnings: string[] = [];
	let editable = true;
	if (colorMode !== "rgb" && colorMode !== "grayscale") {
		editable = false;
		openWarnings.push(`${colorMode.toUpperCase()} documents open read-only.`);
	}

	// --- color mode data ---
	const colorModeData = reader.section(1, (body, length) => body.bytesCopy(length));

	// --- image resources ---
	let resolutionPpi: number | undefined;
	const preservedResources: PsdPreservedResource[] = [];
	reader.section(1, (body) => {
		while (body.remaining() >= 12) {
			body.expectSignature("8BIM");
			const id = body.u16();
			const name = body.pascalString(2);
			body.section(2, (block, blockLength) => {
				// Every resource block is preserved verbatim; resource 1005 is
				// additionally parsed for the horizontal resolution (16.16 fixed
				// point pixels per inch).
				const data = block.bytesCopy(blockLength);
				if (id === RESOLUTION_RESOURCE_ID && blockLength >= 4) {
					resolutionPpi = new PsdByteReader(data).u32() / 0x10000;
				}
				preservedResources.push({ id, name, data });
			});
		}
	});

	// --- layer and mask info ---
	let globalAlpha = false;
	let rawLayers: RawLayerRecord[] = [];
	let globalLayerMaskInfo: Uint8Array = new Uint8Array(0);
	const preservedGlobalBlocks: PsdPreservedBlock[] = [];
	reader.section(1, (body) => {
		// Layer info sub-section (rounded to 4 by convention in v1 files).
		if (body.remaining() === 0) return;
		body.section(2, (layerInfo) => {
			if (layerInfo.remaining() < 2) return;
			let layerCount = layerInfo.i16();
			if (layerCount < 0) {
				globalAlpha = true;
				layerCount = -layerCount;
			}
			rawLayers = [];
			for (let i = 0; i < layerCount; i++) {
				rawLayers.push(readLayerRecord(layerInfo));
			}
			for (const record of rawLayers) {
				for (const channel of record.channels) {
					record.channelData.push(readChannelData(layerInfo, channel));
				}
			}
			layerInfo.skip(layerInfo.remaining());
		});

		if (body.remaining() >= 4) {
			globalLayerMaskInfo = body.section(1, (info, length) => info.bytesCopy(length));
		}

		while (body.remaining() > 0 && body.peekU8() === 0) body.skip(1);
		while (body.remaining() >= 12) {
			preservedGlobalBlocks.push(readAdditionalBlock(body));
			while (body.remaining() > 0 && body.peekU8() === 0) body.skip(1);
		}
		body.skip(body.remaining());
	});

	// --- composite image data ---
	let composite: PsdBitmap | null = null;
	if (!options.skipComposite && reader.remaining() >= 2) {
		try {
			composite = readCompositeImage(
				reader,
				width,
				height,
				channels,
				bitsPerChannel,
				colorMode,
				globalAlpha,
			);
		} catch (error) {
			openWarnings.push(
				`The flattened preview could not be decoded: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	// --- build the layer tree ---
	const usedIds = new Set<string>();
	const warningsBeforeLayers = openWarnings.length;
	const layers = buildLayerTree(
		rawLayers,
		bitsPerChannel,
		colorMode,
		editable,
		usedIds,
		openWarnings,
	);

	if (openWarnings.length > warningsBeforeLayers) {
		editable = false;
		openWarnings.push(
			"Some layer data could not be decoded. Editing and PSD export are disabled to avoid losing source data.",
		);
	}
	if (editable && layers.length === 0 && composite) {
		layers.push({
			kind: "raster",
			id: "L1",
			name: "Background",
			visible: true,
			opacity: 1,
			blendMode: "normal",
			clipping: false,
			locks: createEmptyLocks(),
			preservedBlocks: [],
			top: 0,
			left: 0,
			bitmap: composite,
		});
	}
	if (!editable && !composite) {
		throw new PsdReadError(
			`This PSD cannot be safely displayed: ${openWarnings.join(" ")}`,
			reader.offset,
		);
	}

	return restoreEmbeddedEditable(
		{
			width,
			height,
			colorMode,
			bitsPerChannel,
			resolutionPpi,
			layers,
			editable,
			composite,
			openWarnings,
			colorModeData,
			preservedResources,
			globalLayerMaskInfo,
			preservedGlobalBlocks,
		},
		(bytes) => readPsdInternal(bytes, options, false),
		allowEmbedded,
	);
}

function readLayerRecord(reader: PsdByteReader): RawLayerRecord {
	const top = reader.i32();
	const left = reader.i32();
	const bottom = reader.i32();
	const right = reader.i32();
	const channelCount = reader.u16();
	const channels: Array<{ id: number; length: number }> = [];
	for (let i = 0; i < channelCount; i++) {
		const id = reader.i16();
		const length = reader.u32();
		channels.push({ id, length });
	}

	reader.expectSignature("8BIM");
	const blendKey = reader.signature();
	const opacity = reader.u8() / 0xff;
	const clipping = reader.u8() === 1;
	const flags = reader.u8();
	const transparencyProtected = (flags & 0x01) !== 0;
	const hidden = (flags & 0x02) !== 0;
	reader.skip(1);

	const record: RawLayerRecord = {
		top,
		left,
		bottom,
		right,
		channels,
		blendKey,
		opacity,
		clipping,
		hidden,
		transparencyProtected,
		legacyName: "",
		preservedBlocks: [],
		channelData: [],
	};

	reader.section(1, (extra) => {
		// Layer mask data.
		extra.section(1, (mask, maskLength) => {
			if (maskLength < 18) {
				mask.skip(mask.remaining());
				return;
			}
			const maskTop = mask.i32();
			const maskLeft = mask.i32();
			const maskBottom = mask.i32();
			const maskRight = mask.i32();
			const defaultColor = mask.u8();
			const maskFlags = mask.u8();
			record.mask = {
				top: maskTop,
				left: maskLeft,
				bottom: maskBottom,
				right: maskRight,
				defaultColor,
				disabled: (maskFlags & 0x02) !== 0,
			};
			mask.skip(mask.remaining());
		});

		// Blending ranges: not interpreted, regenerated on save.
		extra.section(1, (ranges) => ranges.skip(ranges.remaining()));

		record.legacyName = extra.pascalString(4);

		while (extra.remaining() >= 12) {
			const block = readAdditionalBlock(extra);
			applyAdditionalBlock(record, block);
		}
		extra.skip(extra.remaining());
	});

	return record;
}

function readAdditionalBlock(reader: PsdByteReader): PsdPreservedBlock {
	const signature = reader.signature();
	if (signature !== "8BIM" && signature !== "8B64") {
		throw new PsdReadError(`Invalid additional info signature '${signature}'`, reader.offset);
	}
	const key = reader.signature();
	const data = reader.section(2, (body, length) => body.bytesCopy(length));
	return { signature, key, data };
}

function applyAdditionalBlock(record: RawLayerRecord, block: PsdPreservedBlock): void {
	const body = new PsdByteReader(block.data);
	switch (block.key) {
		case "luni":
			if (body.remaining() >= 4) record.unicodeName = body.unicodeString();
			return;
		case "lyid":
			if (body.remaining() >= 4) record.layerId = body.u32();
			return;
		case "lspf": {
			if (body.remaining() >= 4) {
				const flags = body.u32();
				record.locks = {
					transparency: (flags & 0x01) !== 0,
					composite: (flags & 0x02) !== 0,
					position: (flags & 0x04) !== 0,
					all: (flags & 0x80000000) !== 0 || (flags & 0x07) === 0x07,
				};
			}
			return;
		}
		case "lsct":
		case "lsdk": {
			if (body.remaining() >= 4) record.sectionType = body.u32();
			if (body.remaining() >= 8) {
				body.expectSignature("8BIM");
				record.sectionBlendKey = body.signature();
			}
			return;
		}
		case "TySh": {
			const text = extractTyShText(block.data);
			record.text = { text: text ?? "", raw: block.data };
			// Keep the raw block out of preservedBlocks: the writer re-emits it
			// from `record.text.raw` so content edits replace one copy only.
			return;
		}
		case PSD_TEXT_STYLE_BLOCK_KEY: {
			const style = decodePsdTextStyle(block.data);
			if (style) {
				if (record.textStyleBlock) record.preservedBlocks.push(record.textStyleBlock);
				record.textStyle = style;
				record.textStyleBlock = block;
			} else record.preservedBlocks.push(block);
			return;
		}
		default:
			record.preservedBlocks.push(block);
	}
}

function readChannelData(
	reader: PsdByteReader,
	channel: { id: number; length: number },
): RawChannel {
	if (channel.length === 0) {
		return { id: channel.id, compression: 0, data: new Uint8Array(0) };
	}
	const compression = reader.u16();
	const data = reader.bytesCopy(Math.max(0, channel.length - 2));
	return { id: channel.id, compression, data };
}

/** Decodes one channel plane into `plane` (one byte per pixel). */
function decodePlane(channel: RawChannel, width: number, height: number, plane: Uint8Array): void {
	if (width <= 0 || height <= 0) return;
	if (channel.compression === 0) {
		if (channel.data.length !== width * height) {
			throw new PsdReadError("Raw channel length does not match layer dimensions", 0);
		}
		plane.set(channel.data);
	} else if (channel.compression === 1) {
		const body = new PsdByteReader(channel.data);
		const rowLengths: number[] = [];
		for (let y = 0; y < height; y++) rowLengths.push(body.u16());
		for (let y = 0; y < height; y++) {
			decodePackBitsRow(body.bytesView(rowLengths[y]), plane, y * width, width);
		}
	} else {
		throw new PsdReadError(`Unsupported channel compression ${channel.compression}`, 0);
	}
}

function decodeLayerBitmap(
	record: RawLayerRecord,
	colorMode: PsdColorMode,
	warnings: string[],
): PsdBitmap {
	const width = Math.max(0, record.right - record.left);
	const height = Math.max(0, record.bottom - record.top);
	const bitmap = createPsdBitmap(width, height);
	if (!width || !height) return bitmap;

	const pixels = bitmap.data;
	// Straight alpha default: opaque until a transparency channel says otherwise.
	for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;

	const plane = new Uint8Array(width * height);
	for (const channel of record.channelData) {
		let offset: number;
		if (channel.id === 0) offset = 0;
		else if (channel.id === 1 && colorMode === "rgb") offset = 1;
		else if (channel.id === 2 && colorMode === "rgb") offset = 2;
		else if (channel.id === -1) offset = 3;
		else continue; // mask channels are decoded separately; exotic channels skipped
		try {
			decodePlane(channel, width, height, plane);
		} catch (error) {
			warnings.push(
				`Layer "${record.unicodeName || record.legacyName}" channel ${channel.id} could not be decoded: ${error instanceof Error ? error.message : String(error)}`,
			);
			continue;
		}
		for (let p = 0, q = offset; p < plane.length; p++, q += 4) pixels[q] = plane[p];
	}

	if (colorMode === "grayscale") {
		for (let i = 0; i < pixels.length; i += 4) {
			pixels[i + 1] = pixels[i];
			pixels[i + 2] = pixels[i];
		}
	}

	return bitmap;
}

function decodeLayerMask(record: RawLayerRecord, warnings: string[]): PsdLayerMask | undefined {
	if (!record.mask) return undefined;
	const width = Math.max(0, record.mask.right - record.mask.left);
	const height = Math.max(0, record.mask.bottom - record.mask.top);
	const channel = record.channelData.find((candidate) => candidate.id === -2);
	if (!channel || !width || !height) return undefined;
	const data = new Uint8Array(width * height);
	try {
		decodePlane(channel, width, height, data);
	} catch (error) {
		warnings.push(
			`Layer "${record.unicodeName || record.legacyName}" mask could not be decoded: ${error instanceof Error ? error.message : String(error)}`,
		);
		return undefined;
	}
	return { ...record.mask, data };
}

function buildLayerTree(
	rawLayers: RawLayerRecord[],
	bitsPerChannel: number,
	colorMode: PsdColorMode,
	decodePixels: boolean,
	usedIds: Set<string>,
	warnings: string[],
): PsdLayerNode[] {
	const root: PsdLayerNode[] = [];
	// PSD stores records bottom-most first; group ranges are delimited from the
	// top down, so walk top-most first with a group stack, prepending children.
	const stack: PsdLayerNode[][] = [root];
	const groupStack: PsdGroupLayer[] = [];

	for (let i = rawLayers.length - 1; i >= 0; i--) {
		const record = rawLayers[i];
		const sectionType = record.sectionType ?? 0;
		const name = record.unicodeName || record.legacyName;
		const id = uniqueLayerId(record.layerId, usedIds);
		const blendMode = psdBlendModeFromKey(record.blendKey);
		if (!record.text && record.textStyleBlock) {
			record.preservedBlocks.push(record.textStyleBlock);
		}
		const common = {
			id,
			name,
			visible: !record.hidden,
			opacity: record.opacity,
			blendMode: blendMode ?? ("normal" as const),
			...(blendMode ? {} : { blendModeFallback: record.blendKey.trim() }),
			clipping: record.clipping,
			locks:
				record.locks ??
				(record.transparencyProtected
					? { ...createEmptyLocks(), transparency: true }
					: createEmptyLocks()),
			mask: decodePixels ? decodeLayerMask(record, warnings) : undefined,
			preservedBlocks: record.preservedBlocks,
		};

		if (sectionType === 1 || sectionType === 2) {
			const group: PsdGroupLayer = {
				...common,
				kind: "group",
				open: sectionType === 1,
				children: [],
			};
			const groupBlend = record.sectionBlendKey
				? psdBlendModeFromKey(record.sectionBlendKey)
				: undefined;
			if (groupBlend) group.blendMode = groupBlend;
			stack[stack.length - 1].unshift(group);
			stack.push(group.children);
			groupStack.push(group);
		} else if (sectionType === 3) {
			if (stack.length > 1) {
				stack.pop();
				groupStack.pop();
			}
		} else {
			const bitmap = decodePixels
				? decodeLayerBitmap(record, colorMode, warnings)
				: createPsdBitmap(
						Math.max(0, record.right - record.left),
						Math.max(0, record.bottom - record.top),
					);
			const base = {
				...common,
				top: record.top,
				left: record.left,
				bitmap,
			};
			stack[stack.length - 1].unshift(
				record.text
					? {
							...base,
							kind: "text" as const,
							text: {
								...record.text,
								...(record.textStyle ? { style: record.textStyle } : {}),
							},
						}
					: { ...base, kind: "raster" as const },
			);
		}
	}

	void bitsPerChannel;
	restoreLayerExtensions(root, warnings);
	return root;
}

function uniqueLayerId(fileId: number | undefined, used: Set<string>): string {
	let id = fileId !== undefined ? `L${fileId}` : `L${used.size + 1}`;
	while (used.has(id)) id = `${id}x`;
	used.add(id);
	return id;
}

function readCompositeImage(
	reader: PsdByteReader,
	width: number,
	height: number,
	channels: number,
	bitsPerChannel: number,
	colorMode: PsdColorMode,
	globalAlpha: boolean,
): PsdBitmap | null {
	const compression = reader.u16();
	if (compression !== 0 && compression !== 1) {
		throw new PsdReadError(`Unsupported composite compression ${compression}`, reader.offset);
	}
	if (bitsPerChannel !== 8) {
		throw new PsdReadError(`Unsupported composite bit depth ${bitsPerChannel}`, reader.offset);
	}

	// Planes appear in file order: color channels first, then alpha when the
	// layer count was negative (global alpha) or the header declares extras.
	let planeCount: number;
	if (colorMode === "rgb") {
		planeCount = globalAlpha || channels >= 4 ? 4 : 3;
	} else if (colorMode === "grayscale") {
		planeCount = globalAlpha || channels >= 2 ? 2 : 1;
	} else if (colorMode === "cmyk") {
		planeCount = globalAlpha || channels >= 5 ? 5 : 4;
	} else {
		throw new PsdReadError(`Unsupported composite color mode ${colorMode}`, reader.offset);
	}
	planeCount = Math.min(channels, planeCount);

	const planes: Uint8Array[] = [];
	if (compression === 0) {
		for (let c = 0; c < planeCount; c++) {
			const plane = new Uint8Array(width * height);
			plane.set(reader.bytesView(width * height));
			planes.push(plane);
		}
	} else {
		const rowLengths: number[] = [];
		for (let c = 0; c < planeCount; c++) {
			for (let y = 0; y < height; y++) rowLengths.push(reader.u16());
		}
		for (let c = 0; c < planeCount; c++) {
			const plane = new Uint8Array(width * height);
			for (let y = 0; y < height; y++) {
				decodePackBitsRow(
					reader.bytesView(rowLengths[c * height + y]),
					plane,
					y * width,
					width,
				);
			}
			planes.push(plane);
		}
	}

	const bitmap = createPsdBitmap(width, height);
	const pixels = bitmap.data;
	if (colorMode === "cmyk") {
		const [c, m, yPlane, k, a] = [planes[0], planes[1], planes[2], planes[3], planes[4]];
		for (let p = 0, q = 0; p < width * height; p++, q += 4) {
			// PSD stores CMYK inverted (255 = no ink), so value * K collapses
			// straight to RGB; composite alpha is stored inverted as well.
			const kv = k ? k[p] : 255;
			pixels[q] = ((c[p] * kv) / 255) | 0;
			pixels[q + 1] = ((m[p] * kv) / 255) | 0;
			pixels[q + 2] = ((yPlane[p] * kv) / 255) | 0;
			pixels[q + 3] = a ? 255 - a[p] : 255;
		}
	} else {
		for (let p = 0, q = 0; p < width * height; p++, q += 4) {
			if (colorMode === "grayscale") {
				pixels[q] = planes[0][p];
				pixels[q + 1] = planes[0][p];
				pixels[q + 2] = planes[0][p];
				pixels[q + 3] = planes[1] ? planes[1][p] : 255;
			} else {
				pixels[q] = planes[0][p];
				pixels[q + 1] = planes[1] ? planes[1][p] : 0;
				pixels[q + 2] = planes[2] ? planes[2][p] : 0;
				pixels[q + 3] = planes[3] ? planes[3][p] : 255;
			}
		}
	}
	return bitmap;
}
