/**
 * Minimal Photoshop descriptor codec, used only for 'TySh' (type tool) blocks:
 * extracting the text content on read, and rewriting the 'Txt ' value (plus a
 * best-effort engine-data patch) when the editor changes a text layer's
 * content. Unknown value types abort the rewrite so the original block is
 * kept rather than risking a corrupt one.
 */

import { PsdByteReader, PsdByteWriter } from "./binary";

type DescriptorValue =
	| { type: "TEXT"; text: string }
	| { type: "long"; value: number }
	| { type: "doub"; value: number }
	| { type: "bool"; value: number }
	| { type: "UntF"; unit: string; value: number }
	| { type: "enum"; enumType: Uint8Array; enumValue: Uint8Array }
	| { type: "Objc" | "GlbO"; descriptor: Descriptor }
	| { type: "VlLs"; items: DescriptorValue[] }
	| { type: "type" | "GlbC"; name: string; classId: Uint8Array }
	| { type: "alis" | "tdta"; data: Uint8Array }
	| { type: "comp"; data: Uint8Array };

interface DescriptorItem {
	key: Uint8Array;
	value: DescriptorValue;
}

interface Descriptor {
	name: string;
	classId: Uint8Array;
	items: DescriptorItem[];
}

class UnsupportedDescriptorError extends Error {}

function readLengthPrefixedId(reader: PsdByteReader): Uint8Array {
	const length = reader.u32();
	return reader.bytesCopy(length === 0 ? 4 : length);
}

function writeLengthPrefixedId(writer: PsdByteWriter, id: Uint8Array): void {
	if (id.length === 4) {
		writer.u32(0);
		writer.bytes(id);
	} else {
		writer.u32(id.length);
		writer.bytes(id);
	}
}

function readDescriptor(reader: PsdByteReader): Descriptor {
	const name = reader.unicodeString();
	const classId = readLengthPrefixedId(reader);
	const count = reader.u32();
	const items: DescriptorItem[] = [];
	for (let i = 0; i < count; i++) {
		const key = readLengthPrefixedId(reader);
		items.push({ key, value: readValue(reader) });
	}
	return { name, classId, items };
}

function readValue(reader: PsdByteReader): DescriptorValue {
	const type = reader.signature();
	switch (type) {
		case "TEXT": {
			const length = reader.u32();
			let text = "";
			let terminated = false;
			for (let i = 0; i < length; i++) {
				const code = reader.u16();
				if (code === 0 && i === length - 1) terminated = true;
				else text += String.fromCharCode(code);
			}
			void terminated;
			return { type: "TEXT", text };
		}
		case "long":
			return { type: "long", value: reader.i32() };
		case "doub":
			return { type: "doub", value: reader.f64() };
		case "bool":
			return { type: "bool", value: reader.u8() };
		case "UntF":
			return { type: "UntF", unit: reader.signature(), value: reader.f64() };
		case "enum":
			return {
				type: "enum",
				enumType: readLengthPrefixedId(reader),
				enumValue: readLengthPrefixedId(reader),
			};
		case "Objc":
		case "GlbO":
			return { type, descriptor: readDescriptor(reader) };
		case "VlLs": {
			const count = reader.u32();
			const items: DescriptorValue[] = [];
			for (let i = 0; i < count; i++) items.push(readValue(reader));
			return { type: "VlLs", items };
		}
		case "type":
		case "GlbC":
			return { type, name: reader.unicodeString(), classId: readLengthPrefixedId(reader) };
		case "alis":
		case "tdta": {
			const length = reader.u32();
			return { type, data: reader.bytesCopy(length) };
		}
		case "comp":
			return { type: "comp", data: reader.bytesCopy(8) };
		default:
			throw new UnsupportedDescriptorError(`Unsupported descriptor value type '${type}'`);
	}
}

function writeDescriptorString(writer: PsdByteWriter, text: string): void {
	// Photoshop stores the terminating null in the character count.
	writer.u32(text.length + 1);
	for (let i = 0; i < text.length; i++) writer.u16(text.charCodeAt(i));
	writer.u16(0);
}

function writeDescriptor(writer: PsdByteWriter, descriptor: Descriptor): void {
	writeDescriptorString(writer, descriptor.name);
	writeLengthPrefixedId(writer, descriptor.classId);
	writer.u32(descriptor.items.length);
	for (const item of descriptor.items) {
		writeLengthPrefixedId(writer, item.key);
		writeValue(writer, item.value);
	}
}

function writeValue(writer: PsdByteWriter, value: DescriptorValue): void {
	writer.signature(value.type);
	switch (value.type) {
		case "TEXT":
			writeDescriptorString(writer, value.text);
			return;
		case "long":
			writer.i32(value.value);
			return;
		case "doub":
			writer.f64(value.value);
			return;
		case "bool":
			writer.u8(value.value);
			return;
		case "UntF":
			writer.signature(value.unit);
			writer.f64(value.value);
			return;
		case "enum":
			writeLengthPrefixedId(writer, value.enumType);
			writeLengthPrefixedId(writer, value.enumValue);
			return;
		case "Objc":
		case "GlbO":
			writeDescriptor(writer, value.descriptor);
			return;
		case "VlLs":
			writer.u32(value.items.length);
			for (const item of value.items) writeValue(writer, item);
			return;
		case "type":
		case "GlbC":
			writeDescriptorString(writer, value.name);
			writeLengthPrefixedId(writer, value.classId);
			return;
		case "alis":
		case "tdta":
			writer.u32(value.data.length);
			writer.bytes(value.data);
			return;
		case "comp":
			writer.bytes(value.data);
			return;
	}
}

function idToString(id: Uint8Array): string {
	let text = "";
	for (const byte of id) text += String.fromCharCode(byte);
	return text;
}

interface ParsedTySh {
	/** Bytes before the text descriptor: version, transform, text version, descriptor version. */
	head: Uint8Array;
	descriptor: Descriptor;
	/** Bytes after the text descriptor: warp descriptor and bounds. */
	tail: Uint8Array;
}

function parseTySh(raw: Uint8Array): ParsedTySh | undefined {
	try {
		const reader = new PsdByteReader(raw);
		const version = reader.i16();
		if (version !== 1) return undefined;
		reader.skip(6 * 8); // transform
		const textVersion = reader.i16();
		if (textVersion !== 50) return undefined;
		const descriptorVersion = reader.u32();
		if (descriptorVersion !== 16) return undefined;
		const headLength = reader.offset;
		const descriptor = readDescriptor(reader);
		return {
			head: raw.slice(0, headLength),
			descriptor,
			tail: raw.slice(reader.offset),
		};
	} catch {
		return undefined;
	}
}

function findTextItem(descriptor: Descriptor): DescriptorItem | undefined {
	return descriptor.items.find(
		(item) => idToString(item.key) === "Txt " && item.value.type === "TEXT",
	);
}

/** Extracts the text content from a raw 'TySh' block ('\n' line breaks). */
export function extractTyShText(raw: Uint8Array): string | undefined {
	const parsed = parseTySh(raw);
	if (!parsed) return undefined;
	const item = findTextItem(parsed.descriptor);
	if (!item || item.value.type !== "TEXT") return undefined;
	return item.value.text.replace(/\r/g, "\n");
}

function utf16be(text: string): Uint8Array {
	const bytes = new Uint8Array(text.length * 2);
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		bytes[i * 2] = code >> 8;
		bytes[i * 2 + 1] = code & 0xff;
	}
	return bytes;
}

/** Escapes '(' ')' '\' bytes the way engine-data string literals require. */
function escapeEngineBytes(bytes: Uint8Array): Uint8Array {
	let extra = 0;
	for (const byte of bytes) if (byte === 0x28 || byte === 0x29 || byte === 0x5c) extra++;
	const out = new Uint8Array(bytes.length + extra);
	let at = 0;
	for (const byte of bytes) {
		if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out[at++] = 0x5c;
		out[at++] = byte;
	}
	return out;
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
	if (!needle.length || needle.length > haystack.length) return -1;
	outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
		for (let j = 0; j < needle.length; j++) {
			if (haystack[i + j] !== needle[j]) continue outer;
		}
		return i;
	}
	return -1;
}

/**
 * Best-effort engine-data patch: replaces the UTF-16 payload of the old text
 * when it occurs exactly once. Anything else leaves the engine data untouched
 * (Photoshop will then still show the original glyph run).
 */
function patchEngineData(data: Uint8Array, oldText: string, newText: string): Uint8Array | null {
	const oldBytes = escapeEngineBytes(utf16be(oldText));
	const newBytes = escapeEngineBytes(utf16be(newText));
	const first = indexOfBytes(data, oldBytes);
	if (first < 0) return null;
	const second = indexOfBytes(data.subarray(first + 1), oldBytes);
	if (second >= 0) return null;
	const out = new Uint8Array(data.length - oldBytes.length + newBytes.length);
	out.set(data.subarray(0, first));
	out.set(newBytes, first);
	out.set(data.subarray(first + oldBytes.length), first + newBytes.length);
	return out;
}

export interface TyShRewriteResult {
	raw: Uint8Array;
	engineDataPatched: boolean;
}

/**
 * Builds a minimal valid 'TySh' block for a newly created text layer:
 * identity transform, a text descriptor carrying only 'Txt ', and an empty
 * warp descriptor. Enough for round trips and for this editor's own reads;
 * Photoshop will restyle on first edit.
 */
export function createTyShBlock(text: string): Uint8Array {
	const writer = new PsdByteWriter();
	writer.i16(1); // version
	for (const value of [1, 0, 0, 1, 0, 0]) writer.f64(value); // transform
	writer.i16(50); // text descriptor version
	writer.u32(16); // descriptor version
	writer.u32(1); // empty unicode name (terminator only)
	writer.u16(0);
	writer.u32(0);
	writer.signature("TxLr");
	writer.u32(1); // one item: 'Txt '
	writer.u32(0);
	writer.signature("Txt ");
	writer.signature("TEXT");
	const stored = text.replace(/\r?\n/g, "\r");
	writer.u32(stored.length + 1);
	for (let i = 0; i < stored.length; i++) writer.u16(stored.charCodeAt(i));
	writer.u16(0);
	writer.i16(1); // warp version
	writer.u32(16); // descriptor version
	writer.u32(1); // empty name
	writer.u16(0);
	writer.u32(0);
	writer.signature("warp");
	writer.u32(0); // no items
	writer.zeros(16); // 4×f32 bounds
	return writer.toBytes();
}

/**
 * Rewrites the 'Txt ' value of a 'TySh' block. Returns undefined when the
 * block uses descriptor features this codec does not model; callers keep the
 * original bytes in that case.
 */
export function rewriteTyShText(raw: Uint8Array, newText: string): TyShRewriteResult | undefined {
	const parsed = parseTySh(raw);
	if (!parsed) return undefined;
	const item = findTextItem(parsed.descriptor);
	if (!item || item.value.type !== "TEXT") return undefined;

	const oldStored = item.value.text;
	const stored = newText.replace(/\r?\n/g, "\r");
	item.value = { type: "TEXT", text: stored };

	let engineDataPatched = false;
	for (const candidate of parsed.descriptor.items) {
		if (idToString(candidate.key) === "EngineData" && candidate.value.type === "tdta") {
			const patched = patchEngineData(candidate.value.data, oldStored, stored);
			if (patched) {
				candidate.value = { type: "tdta", data: patched };
				engineDataPatched = true;
			}
		}
	}

	try {
		const writer = new PsdByteWriter();
		writer.bytes(parsed.head);
		writeDescriptor(writer, parsed.descriptor);
		writer.bytes(parsed.tail);
		return { raw: writer.toBytes(), engineDataPatched };
	} catch {
		return undefined;
	}
}
