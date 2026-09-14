import { Text } from '@codemirror/state';
import { type TextOptions, type TextSource } from './index.js';
import { TEXT_EXTENSIONS } from './formats.js';
import { EDITABLE_TEXT_MAX_BYTES, textSourceSize } from './large-file.js';

export interface TextSaveOptions { signal?: AbortSignal; deliver?: (blob: Blob) => Promise<void>; }

/** Persistent CodeMirror trees avoid materializing the entire file on each keystroke. */
export class TextBuffer {
	private doc: Text;
	private cleanDoc: Text;
	private original: Blob;
	private dirty = false;
	private listeners = new Set<() => void>();
	private revision = 0;
	readonly lineSeparator: string;
	constructor(text: string, original: Uint8Array | Blob, readonly encoding: string, private readonly bom = false) {
		this.doc = this.cleanDoc = Text.of(text.split(/\r\n|\r|\n/));
		this.original = original instanceof Blob ? original : new Blob([original.slice().buffer as ArrayBuffer]);
		this.lineSeparator = text.match(/\r\n|\r|\n/)?.[0] ?? '\n';
	}
	getDocument() { return this.doc; }
	getText() { return this.doc.sliceString(0, this.doc.length, this.lineSeparator); }
	getPrefix(length = 24_000) { return this.doc.sliceString(0, Math.min(this.doc.length, length), this.lineSeparator); }
	getRevision() { return this.revision; }
	isDirty() { return this.dirty; }
	subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
	private notify() { for (const listener of this.listeners) listener(); }
	setText(text: string) { this.setDocument(Text.of(text.split(/\r\n|\r|\n/))); }
	setDocument(doc: Text) {
		if (doc === this.doc) return;
		this.doc = doc; this.revision++;
		this.dirty = !doc.eq(this.cleanDoc);
		this.notify();
	}
	private async encode(snapshot: Text, signal?: AbortSignal): Promise<Blob> {
		signal?.throwIfAborted();
		if (snapshot === this.cleanDoc || snapshot.eq(this.cleanDoc)) return this.original;
		const utf16 = this.encoding === 'utf-16le' || this.encoding === 'utf-16be';
		if (!utf16 && !['unicode', 'utf-8'].includes(this.encoding)) throw new Error(`Editing ${this.encoding} files is not supported; convert the file to UTF-8 first.`);
		const parts: BlobPart[] = [];
		if (this.bom) parts.push(new Uint8Array(utf16 ? this.encoding === 'utf-16le' ? [255,254] : [254,255] : [239,187,191]));
		for (let from = 0; from < snapshot.length;) {
			let to = Math.min(snapshot.length, from + 256 * 1024);
			const last = snapshot.sliceString(to - 1, to).charCodeAt(0);
			if (to < snapshot.length && last >= 0xd800 && last <= 0xdbff) to--;
			const text = snapshot.sliceString(from, to, this.lineSeparator);
			if (utf16) {
				const bytes = new Uint8Array(text.length * 2), view = new DataView(bytes.buffer);
				for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), this.encoding === 'utf-16le');
				parts.push(bytes);
			} else parts.push(new TextEncoder().encode(text));
			from = to;
			if (from < snapshot.length) { await new Promise(resolve => setTimeout(resolve, 0)); signal?.throwIfAborted(); }
		}
		return new Blob(parts, { type: 'text/plain' });
	}
	async exportFile(format?: string, options: TextSaveOptions = {}): Promise<Blob> {
		if (format && format !== 'text' && !(TEXT_EXTENSIONS as readonly string[]).includes(format)) throw new Error('Text conversion is not supported.');
		return this.encode(this.doc, options.signal);
	}
	async saveFile(options: TextSaveOptions = {}): Promise<Blob> {
		const snapshot = this.doc;
		const blob = await this.encode(snapshot, options.signal);
		await options.deliver?.(blob); options.signal?.throwIfAborted();
		this.cleanDoc = snapshot; this.original = blob; this.dirty = !this.doc.eq(snapshot); this.notify();
		return blob;
	}
}

export async function createTextBuffer(source: TextSource, options: TextOptions = {}): Promise<TextBuffer> {
	options.signal?.throwIfAborted();
	const maxBytes = options.maxBytes ?? EDITABLE_TEXT_MAX_BYTES;
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('Invalid maxBytes.');
	if (textSourceSize(source) > maxBytes) throw new RangeError(`File exceeds the ${maxBytes}-byte editing budget; use paged browsing.`);
	const blob = source instanceof Blob ? source : new Blob([typeof source === 'string' ? source : source instanceof Uint8Array ? source.slice().buffer as ArrayBuffer : source]);
	if (blob.size > maxBytes) throw new RangeError(`File exceeds the ${maxBytes}-byte editing budget; use paged browsing.`);
	const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
	const utf8Bom = head[0] === 239 && head[1] === 187 && head[2] === 191;
	const little = head[0] === 255 && head[1] === 254, big = head[0] === 254 && head[1] === 255;
	const decoder = new TextDecoder(utf8Bom ? 'utf-8' : little ? 'utf-16le' : big ? 'utf-16be' : options.encoding ?? 'utf-8', { fatal: true });
	const chunks: string[] = [];
	for (let start = 0; start < blob.size; start += 256 * 1024) {
		options.signal?.throwIfAborted();
		const bytes = await blob.slice(start, start + 256 * 1024).arrayBuffer();
		const text = decoder.decode(bytes, { stream: true });
		if (text.includes('\0')) throw new TypeError('The file contains binary data.');
		chunks.push(text);
		if (blob.size > 1024 * 1024) await new Promise(resolve => setTimeout(resolve, 0));
	}
	chunks.push(decoder.decode()); options.signal?.throwIfAborted();
	return new TextBuffer(chunks.join(''), blob, decoder.encoding, utf8Bom || little || big);
}
