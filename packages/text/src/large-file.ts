/** Above this budget the UI opens an explicitly read-only, bounded range viewer. */
export const EDITABLE_TEXT_MAX_BYTES = 8 * 1024 * 1024;
export const TEXT_PAGE_BYTES = 128 * 1024;
export const TEXT_THUMBNAIL_BYTES = 96 * 1024;

export function textSourceSize(source: string | Blob | ArrayBuffer | Uint8Array): number {
	if (typeof source !== 'string') return source instanceof Blob ? source.size : source.byteLength;
	let bytes = 0;
	for (let i = 0; i < source.length; i++) {
		const code = source.charCodeAt(i);
		if (code < 0x80) bytes++;
		else if (code < 0x800) bytes += 2;
		else if (code >= 0xd800 && code <= 0xdbff && i + 1 < source.length && source.charCodeAt(i + 1) >= 0xdc00 && source.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
		else bytes += 3;
	}
	return bytes;
}

export type ReadTextRange = (start: number, end: number, signal?: AbortSignal) => Promise<Uint8Array>;

/** A Blob-compatible range source. Desktop callers supply native seek/read, without loading the file. */
export class RangeTextBlob extends Blob {
	constructor(private readonly readRange: ReadTextRange, private readonly length: number, private readonly base = 0) {
		super([], { type: 'text/plain' });
		if (!Number.isSafeInteger(length) || length < 0) throw new RangeError('Invalid text file size.');
	}
	override get size() { return this.length; }
	override slice(start = 0, end = this.size): RangeTextBlob {
		const normalize = (value: number) => { value = Math.trunc(value) || 0; return Math.min(this.size, Math.max(0, value < 0 ? this.size + value : value)); };
		const from = normalize(start), to = Math.max(from, normalize(end));
		return new RangeTextBlob(this.readRange, to - from, this.base + from);
	}
	override async arrayBuffer(): Promise<ArrayBuffer> {
		if (this.size > 1024 * 1024) throw new RangeError('Use bounded slices or stream() for large text files.');
		const bytes = await this.readRange(this.base, this.base + this.size);
		if (bytes.byteLength !== this.size) throw new Error('The file changed or the range read was incomplete.');
		return bytes.slice().buffer as ArrayBuffer;
	}
	override async text() { return new TextDecoder().decode(await this.arrayBuffer()); }
	override stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
		let offset = 0;
		const controller = new AbortController();
		return new ReadableStream({
			pull: async stream => {
				try {
					if (offset >= this.size) { stream.close(); return; }
					const end = Math.min(this.size, offset + TEXT_PAGE_BYTES);
					const bytes = await this.readRange(this.base + offset, this.base + end, controller.signal);
					controller.signal.throwIfAborted();
					if (bytes.length !== end - offset) throw new Error('Incomplete text range.');
					offset = end; stream.enqueue(bytes.slice() as Uint8Array<ArrayBuffer>);
				} catch (error) { if (!controller.signal.aborted) stream.error(error); }
			},
			cancel: () => controller.abort(),
		});
	}
}

export interface TextPage {
	text: string;
	start: number;
	end: number;
	size: number;
	encoding: string;
}

/** Read complete Unicode characters at a byte position. Page boundaries need not be line boundaries. */
export async function readTextPage(source: Blob, offset = 0, options: { pageBytes?: number; encoding?: string; signal?: AbortSignal } = {}): Promise<TextPage> {
	const budget = options.pageBytes ?? TEXT_PAGE_BYTES;
	if (!Number.isInteger(budget) || budget < 8 || budget > 1024 * 1024) throw new RangeError('pageBytes must be between 8 and 1048576.');
	if (!Number.isSafeInteger(offset) || offset < 0 || offset > source.size) throw new RangeError('Invalid file position.');
	options.signal?.throwIfAborted();
	const head = new Uint8Array(await source.slice(0, 4).arrayBuffer());
	const label = head[0] === 0xff && head[1] === 0xfe ? 'utf-16le'
		: head[0] === 0xfe && head[1] === 0xff ? 'utf-16be'
		: head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf ? 'utf-8' : options.encoding ?? 'utf-8';
	const decoder = new TextDecoder(label, { fatal: true, ignoreBOM: offset !== 0 });
	const utf16 = decoder.encoding.startsWith('utf-16');
	if (!utf16 && decoder.encoding !== 'utf-8') throw new Error('Paged browsing supports UTF-8 and UTF-16. Convert other encodings to UTF-8 first.');
	const from = utf16 ? offset - offset % 2 : offset;
	const bytes = new Uint8Array(await source.slice(from, Math.min(source.size, from + budget + 4)).arrayBuffer());
	options.signal?.throwIfAborted();
	let start = 0, end = Math.min(budget, bytes.length);
	if (utf16) {
		const word = (at: number) => decoder.encoding === 'utf-16le' ? bytes[at] | bytes[at + 1] << 8 : bytes[at] << 8 | bytes[at + 1];
		if (from && bytes.length >= 2 && word(0) >= 0xdc00 && word(0) <= 0xdfff) start = 2;
		if (from + end < source.size) {
			end -= end % 2;
			if (end >= 2 && word(end - 2) >= 0xd800 && word(end - 2) <= 0xdbff) end -= 2;
		}
	} else {
		while (start < Math.min(4, bytes.length) && (bytes[start] & 0xc0) === 0x80) start++;
		if (start === 4) throw new TypeError('Invalid UTF-8 at this file position.');
		if (from + end < source.size) while (end > start && (bytes[end] & 0xc0) === 0x80) end--;
	}
	const text = decoder.decode(bytes.subarray(start, end));
	if (text.includes('\0')) throw new TypeError('The file contains binary data.');
	return { text, start: from + start, end: from + end, size: source.size, encoding: decoder.encoding };
}

/** Decode only the prefix; streaming decode tolerates a final partial character. */
export async function readTextPrefix(source: Blob, options: { encoding?: string; signal?: AbortSignal; bytes?: number } = {}): Promise<string> {
	options.signal?.throwIfAborted();
	const limit = options.bytes ?? TEXT_THUMBNAIL_BYTES;
	const bytes = new Uint8Array(await source.slice(0, limit).arrayBuffer());
	options.signal?.throwIfAborted();
	const label = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le' : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be'
		: bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191 ? 'utf-8' : options.encoding ?? 'utf-8';
	const text = new TextDecoder(label, { fatal: true }).decode(bytes, { stream: source.size > limit });
	if (text.includes('\0')) throw new TypeError('The file contains binary data.');
	return text;
}
