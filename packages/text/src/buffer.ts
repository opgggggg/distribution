import { Text } from "@codemirror/state";
import { FormatsKernel, loadFormatsKernel } from "@cubexp/kernels";
import { type TextOptions, type TextSource } from "./index.js";
import { TEXT_EXTENSIONS } from "./formats.js";
import { EDITABLE_TEXT_MAX_BYTES, textSourceSize } from "./large-file.js";

export interface TextSaveOptions {
	signal?: AbortSignal;
	deliver?: (blob: Blob) => Promise<void>;
}
interface State {
	revision: number;
	dirty: boolean;
	encoding: string;
	lineSeparator: string;
	canUndo: boolean;
	canRedo: boolean;
	selection: unknown;
	patch?: { from: number; to: number; insert: string };
}
/** Rust owns the buffer, history, encoding and save snapshots. CodeMirror is a view projection. */
export class TextBuffer {
	private doc?: Text;
	private listeners = new Set<() => void>();
	private state: State;
	private kernel: FormatsKernel;
	private saves?: Promise<unknown>;
	readonly lineSeparator: string;
	readonly encoding: string;
	constructor(
		text: string,
		original: Uint8Array | Blob,
		encoding: string,
		_bom = false,
		kernel?: FormatsKernel,
		state?: State,
	) {
		if (!kernel && original instanceof Blob)
			throw Error("Use createTextBuffer() for Blob sources.");
		this.kernel = kernel ?? new FormatsKernel("text", encoding);
		this.state = state ?? this.kernel.open<State>(original as Uint8Array);
		this.encoding = this.state.encoding;
		this.lineSeparator = this.state.lineSeparator;
	}
	getDocument() {
		return (this.doc ??= Text.of(
			this.kernel.request<{ text: string }>({ op: "text" }).text.split(/\r\n|\r|\n/),
		));
	}
	getText() {
		return this.kernel.request<{ text: string }>({ op: "text" }).text;
	}
	getPrefix(length = 24000) {
		return this.kernel.request<{ text: string }>({ op: "prefix", length }).text;
	}
	getRevision() {
		return this.state.revision;
	}
	isDirty() {
		return this.state.dirty;
	}
	canUndo() {
		return this.state.canUndo;
	}
	canRedo() {
		return this.state.canRedo;
	}
	subscribe(listener: () => void) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	private notify() {
		for (const listener of this.listeners) listener();
	}
	private update(request: unknown, doc?: Text) {
		const revision = this.state.revision;
		this.state = this.kernel.request<State>(request);
		if (revision !== this.state.revision) {
			this.doc =
				doc ??
				(this.state.patch && this.doc
					? this.doc.replace(
							this.state.patch.from,
							this.state.patch.to,
							Text.of(this.state.patch.insert.split("\n")),
						)
					: undefined);
			this.notify();
		}
	}
	setText(text: string) {
		this.update({ op: "set", text });
	}
	setDocument(doc: Text) {
		if (doc === this.doc) return;
		const old = this.getDocument();
		let prefix = 0,
			suffix = 0;
		// Compare bounded tree slices; never build two complete file strings.
		const limit = Math.min(old.length, doc.length);
		while (prefix < limit) {
			const size = Math.min(4096, limit - prefix);
			const a = old.sliceString(prefix, prefix + size),
				b = doc.sliceString(prefix, prefix + size);
			if (a === b) {
				prefix += size;
				continue;
			}
			let i = 0;
			while (i < size && a.charCodeAt(i) === b.charCodeAt(i)) i++;
			prefix += i;
			break;
		}
		while (suffix < limit - prefix) {
			const size = Math.min(4096, limit - prefix - suffix);
			const a = old.sliceString(old.length - suffix - size, old.length - suffix),
				b = doc.sliceString(doc.length - suffix - size, doc.length - suffix);
			if (a === b) {
				suffix += size;
				continue;
			}
			let i = 0;
			while (i < size && a.charCodeAt(size - i - 1) === b.charCodeAt(size - i - 1)) i++;
			suffix += i;
			break;
		}
		// Never cut a surrogate pair at either side of the replacement.
		if (
			prefix > 0 &&
			prefix < old.length &&
			/[\uDC00-\uDFFF]/.test(old.sliceString(prefix, prefix + 1))
		)
			prefix--;
		if (
			suffix > 0 &&
			/[\uD800-\uDBFF]/.test(old.sliceString(old.length - suffix - 1, old.length - suffix))
		)
			suffix--;
		this.applyChanges(
			[
				{
					from: prefix,
					to: old.length - suffix,
					insert: doc.sliceString(prefix, doc.length - suffix, "\n"),
				},
			],
			doc,
		);
	}
	applyChanges(
		changes: { from: number; to: number; insert: string }[],
		doc: Text,
		options: Record<string, unknown> = {},
	) {
		this.update({ op: "changes", changes, ...options }, doc);
	}
	validateChanges(changes: { from: number; to: number; insert: string }[]) {
		this.kernel.request({ op: "changes", changes, validateOnly: true });
	}
	getSelection() {
		return this.state.selection;
	}
	adoptViewDocument(doc: Text) {
		this.doc = doc;
	}
	undo() {
		this.update({ op: "undo" });
		return this.state.patch;
	}
	redo() {
		this.update({ op: "redo" });
		return this.state.patch;
	}
	setReadonly(value: boolean) {
		this.state = this.kernel.request<State>({ op: "readonly", value });
	}
	private capture() {
		return this.kernel.request<{ token: number }>({ op: "snapshot" }).token;
	}
	private async encode(token: number, signal?: AbortSignal): Promise<Blob> {
		const parts: BlobPart[] = [];
		let from = 0;
		for (;;) {
			signal?.throwIfAborted();
			const chunk = this.kernel.request<{ next: number; done: boolean }>({
				op: "encodeChunk",
				token,
				from,
			});
			parts.push(this.kernel.save());
			if (chunk.done) break;
			from = chunk.next;
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
		signal?.throwIfAborted();
		return new Blob(parts, { type: "text/plain" });
	}
	async exportFile(format?: string, options: TextSaveOptions = {}): Promise<Blob> {
		if (format && format !== "text" && !(TEXT_EXTENSIONS as readonly string[]).includes(format))
			throw Error("Text conversion is not supported.");
		const token = this.capture();
		try {
			return await this.encode(token, options.signal);
		} finally {
			this.kernel.request({ op: "release", token });
		}
	}
	async saveFile(options: TextSaveOptions = {}): Promise<Blob> {
		// Capture now, before waiting for the destination queue. Edits remain available.
		options.signal?.throwIfAborted();
		const token = this.capture();
		const execute = async () => {
			try {
				const blob = await this.encode(token, options.signal);
				await options.deliver?.(blob);
				options.signal?.throwIfAborted();
				this.state = this.kernel.request<State>({ op: "acknowledge", token });
				this.notify();
				return blob;
			} finally {
				this.kernel.request({ op: "release", token });
			}
		};
		const save = this.saves ? this.saves.then(execute) : execute();
		const completion = save.catch(() => {});
		this.saves = completion;
		void completion.then(() => {
			if (this.saves === completion) this.saves = undefined;
		});
		return save;
	}
	close() {
		this.kernel.close();
		this.listeners.clear();
	}
}
export async function createTextBuffer(
	source: TextSource,
	options: TextOptions = {},
): Promise<TextBuffer> {
	options.signal?.throwIfAborted();
	const maxBytes = options.maxBytes ?? EDITABLE_TEXT_MAX_BYTES;
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError("Invalid maxBytes.");
	if (textSourceSize(source) > maxBytes)
		throw new RangeError(
			`File exceeds the ${maxBytes}-byte editing budget; use paged browsing.`,
		);
	await loadFormatsKernel();
	options.signal?.throwIfAborted();
	const bytes =
		typeof source === "string"
			? new TextEncoder().encode(source)
			: source instanceof Uint8Array
				? source
				: new Uint8Array(source instanceof Blob ? await source.arrayBuffer() : source);
	if (bytes.length > maxBytes) throw new RangeError("Text exceeds the editing budget.");
	options.signal?.throwIfAborted();
	const kernel = new FormatsKernel("text", options.encoding, { maxBytes });
	try {
		const state = kernel.open<State>(bytes);
		return new TextBuffer("", bytes, state.encoding, false, kernel, state);
	} catch (error) {
		kernel.close();
		throw error;
	}
}
