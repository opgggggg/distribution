import type { PsdChannelDescriptor, PsdColorMode, PsdDocument, PsdLayer, PsdRaster } from "./types";

const PSD_SIGNATURE = "8BPS";
const MAX_RASTER_PIXELS = 80_000_000;

export class PsdParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PsdParseError";
	}
}

class PsdReader {
	position = 0;
	readonly view: DataView;

	constructor(readonly bytes: Uint8Array) {
		this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	}

	ensure(length: number): void {
		if (length < 0 || this.position + length > this.bytes.byteLength) {
			throw new PsdParseError("The PSD ended before its declared data was complete.");
		}
	}

	seek(position: number): void {
		if (!Number.isSafeInteger(position) || position < 0 || position > this.bytes.byteLength) {
			throw new PsdParseError("The PSD contains an invalid section offset.");
		}
		this.position = position;
	}

	skip(length: number): void {
		this.ensure(length);
		this.position += length;
	}

	u8(): number {
		this.ensure(1);
		return this.view.getUint8(this.position++);
	}

	u16(): number {
		this.ensure(2);
		const value = this.view.getUint16(this.position, false);
		this.position += 2;
		return value;
	}

	i16(): number {
		this.ensure(2);
		const value = this.view.getInt16(this.position, false);
		this.position += 2;
		return value;
	}

	u32(): number {
		this.ensure(4);
		const value = this.view.getUint32(this.position, false);
		this.position += 4;
		return value;
	}

	i32(): number {
		this.ensure(4);
		const value = this.view.getInt32(this.position, false);
		this.position += 4;
		return value;
	}

	ascii(length: number): string {
		this.ensure(length);
		let value = "";
		for (let index = 0; index < length; index++) {
			value += String.fromCharCode(this.bytes[this.position + index] ?? 0);
		}
		this.position += length;
		return value;
	}
}

interface ParsedLayerRecord {
	layer: PsdLayer;
	channelLengths: readonly { id: number; length: number }[];
}

function colorModeName(code: number): PsdColorMode {
	return (
		(
			{
				0: "bitmap",
				1: "grayscale",
				2: "indexed",
				3: "rgb",
				4: "cmyk",
				7: "multichannel",
				8: "duotone",
				9: "lab",
			} as Record<number, PsdColorMode>
		)[code] ?? "unknown"
	);
}

function checkedSectionEnd(reader: PsdReader, length: number, label: string): number {
	const end = reader.position + length;
	if (!Number.isSafeInteger(end) || end > reader.bytes.byteLength) {
		throw new PsdParseError(`The PSD ${label} section exceeds the file size.`);
	}
	return end;
}

function decodeLegacyName(bytes: Uint8Array): string {
	return new TextDecoder("windows-1252").decode(bytes).replace(/\0+$/u, "").trim();
}

function readPascalName(reader: PsdReader, extraEnd: number): string {
	if (reader.position >= extraEnd) return "";
	const start = reader.position;
	const length = reader.u8();
	reader.ensure(length);
	const value = decodeLegacyName(
		reader.bytes.subarray(reader.position, reader.position + length),
	);
	reader.skip(length);
	const consumed = reader.position - start;
	const padding = (4 - (consumed % 4)) % 4;
	reader.seek(Math.min(extraEnd, reader.position + padding));
	return value;
}

function readUnicodeLayerName(reader: PsdReader, dataEnd: number): string | undefined {
	if (reader.position + 4 > dataEnd) return undefined;
	const length = reader.u32();
	if (length > (dataEnd - reader.position) / 2) return undefined;
	let value = "";
	for (let index = 0; index < length; index++) {
		value += String.fromCharCode(reader.u16());
	}
	return value.replace(/\0+$/u, "").trim() || undefined;
}

function readLayerRecord(reader: PsdReader, index: number): ParsedLayerRecord {
	const top = reader.i32();
	const left = reader.i32();
	const bottom = reader.i32();
	const right = reader.i32();
	const channelCount = reader.u16();
	if (channelCount > 64) throw new PsdParseError("The PSD layer declares too many channels.");
	const channelLengths: { id: number; length: number }[] = [];
	for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
		channelLengths.push({ id: reader.i16(), length: reader.u32() });
	}
	const blendSignature = reader.ascii(4);
	if (blendSignature !== "8BIM") {
		throw new PsdParseError("The PSD layer has an invalid blend-mode signature.");
	}
	const blendMode = reader.ascii(4);
	const opacityOffset = reader.position;
	const opacity = reader.u8();
	const clipping = reader.u8();
	const flagsOffset = reader.position;
	const flags = reader.u8();
	reader.skip(1);
	const extraLength = reader.u32();
	const extraEnd = checkedSectionEnd(reader, extraLength, "layer extra data");

	const maskLength = reader.u32();
	reader.seek(Math.min(extraEnd, checkedSectionEnd(reader, maskLength, "layer mask")));
	if (reader.position + 4 > extraEnd)
		throw new PsdParseError("The PSD layer data is incomplete.");
	const blendingRangesLength = reader.u32();
	reader.seek(
		Math.min(extraEnd, checkedSectionEnd(reader, blendingRangesLength, "blending ranges")),
	);
	let name = readPascalName(reader, extraEnd) || `Layer ${index + 1}`;
	let numericId: number | undefined;

	while (reader.position + 12 <= extraEnd) {
		const signature = reader.ascii(4);
		const key = reader.ascii(4);
		const length = reader.u32();
		const dataEnd = checkedSectionEnd(reader, length, `additional layer ${key}`);
		if (signature !== "8BIM" && signature !== "8B64") {
			reader.seek(extraEnd);
			break;
		}
		if (key === "luni") name = readUnicodeLayerName(reader, dataEnd) ?? name;
		else if (key === "lyid" && length >= 4) numericId = reader.u32();
		reader.seek(dataEnd);
		if (length % 2 && reader.position < extraEnd) reader.skip(1);
	}
	reader.seek(extraEnd);

	const width = Math.max(0, right - left);
	const height = Math.max(0, bottom - top);
	return {
		layer: {
			id: numericId === undefined ? `layer-${index + 1}` : `layer-${numericId}`,
			index,
			name,
			top,
			left,
			bottom,
			right,
			width,
			height,
			blendMode,
			clipping,
			visible: (flags & 0x02) === 0,
			opacity,
			channels: [],
			sourceOffsets: { opacity: opacityOffset, flags: flagsOffset },
		},
		channelLengths,
	};
}

/** Parse a Photoshop PSD header, layer records, and channel locations without DOM dependencies. */
export function parsePsd(source: Uint8Array | ArrayBuffer): PsdDocument {
	const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
	const reader = new PsdReader(bytes);
	if (reader.ascii(4) !== PSD_SIGNATURE) throw new PsdParseError("This is not a PSD file.");
	if (reader.u16() !== 1) throw new PsdParseError("Only Photoshop PSD version 1 is supported.");
	reader.skip(6);
	const channels = reader.u16();
	const height = reader.u32();
	const width = reader.u32();
	const depth = reader.u16();
	const colorModeCode = reader.u16();
	if (!width || !height || width > 30_000 || height > 30_000) {
		throw new PsdParseError("The PSD canvas dimensions are invalid.");
	}
	if (!channels || channels > 56) throw new PsdParseError("The PSD channel count is invalid.");

	for (const label of ["color mode", "image resources"] as const) {
		const length = reader.u32();
		reader.seek(checkedSectionEnd(reader, length, label));
	}

	const layerMaskLength = reader.u32();
	const layerMaskEnd = checkedSectionEnd(reader, layerMaskLength, "layer and mask");
	const records: ParsedLayerRecord[] = [];
	if (layerMaskLength >= 4) {
		const layerInfoLength = reader.u32();
		const layerInfoEnd = Math.min(
			layerMaskEnd,
			checkedSectionEnd(reader, layerInfoLength, "layer info"),
		);
		if (layerInfoLength >= 2) {
			const layerCount = Math.abs(reader.i16());
			if (layerCount > 20_000) throw new PsdParseError("The PSD declares too many layers.");
			for (let index = 0; index < layerCount; index++) {
				records.push(readLayerRecord(reader, index));
			}
			for (const record of records) {
				const channelDescriptors: PsdChannelDescriptor[] = [];
				for (const channel of record.channelLengths) {
					const dataOffset = reader.position;
					const dataEnd = checkedSectionEnd(reader, channel.length, "layer channel");
					channelDescriptors.push({ ...channel, dataOffset });
					reader.seek(dataEnd);
				}
				record.layer = { ...record.layer, channels: channelDescriptors };
			}
		}
		reader.seek(layerMaskEnd);
	}

	return {
		width,
		height,
		channels,
		depth,
		colorMode: colorModeName(colorModeCode),
		colorModeCode,
		layers: records.map(({ layer }) => layer),
		compositeOffset: layerMaskEnd,
		source: bytes,
	};
}

function assertRasterSize(width: number, height: number): void {
	if (width * height > MAX_RASTER_PIXELS) {
		throw new PsdParseError("This PSD is too large to preview safely in the current window.");
	}
}

function decodePackBits(
	bytes: Uint8Array,
	start: number,
	end: number,
	expectedLength: number,
): Uint8Array {
	const output = new Uint8Array(expectedLength);
	let input = start;
	let target = 0;
	while (input < end && target < expectedLength) {
		const header = ((bytes[input++] ?? 0) << 24) >> 24;
		if (header >= 0) {
			const count = Math.min(header + 1, end - input, expectedLength - target);
			output.set(bytes.subarray(input, input + count), target);
			input += header + 1;
			target += count;
		} else if (header >= -127) {
			const count = Math.min(1 - header, expectedLength - target);
			const value = bytes[input++] ?? 0;
			output.fill(value, target, target + count);
			target += count;
		}
	}
	return output;
}

function decodeChannel(
	bytes: Uint8Array,
	offset: number,
	length: number,
	width: number,
	height: number,
): Uint8Array | null {
	if (!width || !height || length < 2 || offset + length > bytes.byteLength) return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const compression = view.getUint16(offset, false);
	const pixelCount = width * height;
	if (compression === 0) {
		const start = offset + 2;
		if (start + pixelCount > offset + length) return null;
		return bytes.slice(start, start + pixelCount);
	}
	if (compression !== 1 || offset + 2 + height * 2 > offset + length) return null;
	const output = new Uint8Array(pixelCount);
	let tablePosition = offset + 2;
	let dataPosition = tablePosition + height * 2;
	for (let row = 0; row < height; row++) {
		const rowLength = view.getUint16(tablePosition, false);
		tablePosition += 2;
		const rowEnd = Math.min(offset + length, dataPosition + rowLength);
		output.set(decodePackBits(bytes, dataPosition, rowEnd, width), row * width);
		dataPosition += rowLength;
	}
	return output;
}

function rgbaFromPlanes(
	width: number,
	height: number,
	colorMode: PsdColorMode,
	planes: readonly (Uint8Array | null)[],
): PsdRaster | null {
	const primary = planes[0];
	if (!primary) return null;
	const pixels = new Uint8ClampedArray(width * height * 4);
	for (let index = 0; index < width * height; index++) {
		const target = index * 4;
		if (colorMode === "grayscale" || colorMode === "duotone") {
			const value = primary[index] ?? 0;
			pixels[target] = value;
			pixels[target + 1] = value;
			pixels[target + 2] = value;
			pixels[target + 3] = planes[1]?.[index] ?? 255;
		} else if (colorMode === "rgb") {
			pixels[target] = primary[index] ?? 0;
			pixels[target + 1] = planes[1]?.[index] ?? 0;
			pixels[target + 2] = planes[2]?.[index] ?? 0;
			pixels[target + 3] = planes[3]?.[index] ?? 255;
		} else if (colorMode === "cmyk") {
			const cyan = primary[index] ?? 0;
			const magenta = planes[1]?.[index] ?? 0;
			const yellow = planes[2]?.[index] ?? 0;
			const black = planes[3]?.[index] ?? 0;
			pixels[target] = 255 - Math.min(255, cyan + black);
			pixels[target + 1] = 255 - Math.min(255, magenta + black);
			pixels[target + 2] = 255 - Math.min(255, yellow + black);
			pixels[target + 3] = planes[4]?.[index] ?? 255;
		} else {
			return null;
		}
	}
	return { width, height, pixels };
}

/** Decode the flattened composite preview for uncompressed and PackBits PSD data. */
export function decodePsdComposite(document: PsdDocument): PsdRaster | null {
	if (document.depth !== 8) return null;
	assertRasterSize(document.width, document.height);
	const { source: bytes } = document;
	if (document.compositeOffset + 2 > bytes.byteLength) return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const compression = view.getUint16(document.compositeOffset, false);
	const pixelCount = document.width * document.height;
	const planes: (Uint8Array | null)[] = [];
	if (compression === 0) {
		let position = document.compositeOffset + 2;
		for (let channel = 0; channel < document.channels; channel++) {
			if (position + pixelCount > bytes.byteLength) return null;
			planes.push(bytes.slice(position, position + pixelCount));
			position += pixelCount;
		}
	} else if (compression === 1) {
		let tablePosition = document.compositeOffset + 2;
		const rowCount = document.channels * document.height;
		if (tablePosition + rowCount * 2 > bytes.byteLength) return null;
		const rowLengths: number[] = [];
		for (let row = 0; row < rowCount; row++) {
			rowLengths.push(view.getUint16(tablePosition, false));
			tablePosition += 2;
		}
		let dataPosition = tablePosition;
		for (let channel = 0; channel < document.channels; channel++) {
			const plane = new Uint8Array(pixelCount);
			for (let row = 0; row < document.height; row++) {
				const rowLength = rowLengths[channel * document.height + row] ?? 0;
				const rowEnd = Math.min(bytes.byteLength, dataPosition + rowLength);
				plane.set(
					decodePackBits(bytes, dataPosition, rowEnd, document.width),
					row * document.width,
				);
				dataPosition += rowLength;
			}
			planes.push(plane);
		}
	} else {
		return null;
	}
	return rgbaFromPlanes(document.width, document.height, document.colorMode, planes);
}

/** Decode a single layer raster. Masks and adjustment-layer effects remain non-destructive metadata. */
export function decodePsdLayer(document: PsdDocument, layer: PsdLayer): PsdRaster | null {
	if (document.depth !== 8 || !layer.width || !layer.height) return null;
	assertRasterSize(layer.width, layer.height);
	const byId = new Map(layer.channels.map((channel) => [channel.id, channel]));
	const read = (id: number): Uint8Array | null => {
		const descriptor = byId.get(id);
		return descriptor
			? decodeChannel(
					document.source,
					descriptor.dataOffset,
					descriptor.length,
					layer.width,
					layer.height,
				)
			: null;
	};
	if (document.colorMode === "grayscale" || document.colorMode === "duotone") {
		return rgbaFromPlanes(layer.width, layer.height, document.colorMode, [read(0), read(-1)]);
	}
	if (document.colorMode === "cmyk") {
		return rgbaFromPlanes(layer.width, layer.height, document.colorMode, [
			read(0),
			read(1),
			read(2),
			read(3),
			read(-1),
		]);
	}
	return rgbaFromPlanes(layer.width, layer.height, document.colorMode, [
		read(0),
		read(1),
		read(2),
		read(-1),
	]);
}

/** Build a standards-compliant flattened RGB PSD for a new blank canvas. */
export function createBlankPsd(width = 1200, height = 800): Uint8Array {
	if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
		throw new TypeError("PSD canvas dimensions must be positive integers.");
	}
	if (width > 30_000 || height > 30_000) {
		throw new RangeError("PSD canvas dimensions cannot exceed 30,000 pixels.");
	}
	const pixels = width * height;
	const bytes = new Uint8Array(40 + pixels * 3);
	const view = new DataView(bytes.buffer);
	bytes.set([0x38, 0x42, 0x50, 0x53], 0);
	view.setUint16(4, 1, false);
	view.setUint16(12, 3, false);
	view.setUint32(14, height, false);
	view.setUint32(18, width, false);
	view.setUint16(22, 8, false);
	view.setUint16(24, 3, false);
	// The three variable metadata sections are empty. Composite compression is raw.
	view.setUint32(26, 0, false);
	view.setUint32(30, 0, false);
	view.setUint32(34, 0, false);
	view.setUint16(38, 0, false);
	bytes.fill(255, 40);
	return bytes;
}
