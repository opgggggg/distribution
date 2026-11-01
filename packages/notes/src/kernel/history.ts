import { clone, inkWidth, type Notebook, type NotePage } from "../model.js";
import { listBrushPlugins } from "../brushes.js";
import type { NoteHistoryState } from "../history.js";
import { compileNotesKernel } from "./loader.js";
import { NotesRustKernel } from "./runtime.js";
interface Projection {
	kernel: "rust";
	revision: number;
	dirty: boolean;
	document: Notebook;
	current: number;
	past: number[];
	future: number[];
	frames?: { id: number; document: Notebook }[];
}
export function customBrushMetadata() {
	return listBrushPlugins()
		.filter((p) => p.id.includes(":"))
		.map(({ render, pressureFactor, ...metadata }) => metadata);
}
/** Rust owns transactions/history; this class only caches immutable UI projections. */
export class RustNoteHistory {
	readonly kernel = "rust";
	document!: Notebook;
	private state!: Projection;
	private frames = new Map<number, Notebook>();
	private listeners = new Set<() => void>();
	private constructor(private core: NotesRustKernel) {}
	static async create(document: Notebook, state?: NoteHistoryState): Promise<RustNoteHistory> {
		const result = new RustNoteHistory(
			new NotesRustKernel(await compileNotesKernel(), customBrushMetadata()),
		);
		try {
			result.install(
				result.core.request({
					op: "init",
					document,
					...(state ? { history: state } : {}),
					includeFrames: true,
				}),
			);
			return result;
		} catch (error) {
			result.close();
			throw error;
		}
	}
	static async open(bytes: Uint8Array, fileName = "Imported notebook"): Promise<RustNoteHistory> {
		const result = new RustNoteHistory(
			new NotesRustKernel(await compileNotesKernel(), customBrushMetadata()),
		);
		result.core.request({ op: "configure", plugins: customBrushMetadata(), fileName });
		try {
			result.install(result.core.open<Projection>(bytes));
			return result;
		} catch (error) {
			result.close();
			throw error;
		}
	}
	private install(state: Projection) {
		for (const frame of state.frames ?? []) this.frames.set(frame.id, frame.document);
		let next = this.frames.get(state.current);
		if (!next) {
			next = state.document;
			const previous = this.document;
			if (previous)
				next.pages = next.pages.map((p) => {
					const old = previous.pages.find((v) => v.id === p.id);
					if (!old) return p;
					if (old === p) return old;
					if (
						p.background &&
						JSON.stringify(p.background) === JSON.stringify(old.background)
					)
						p.background = old.background;
					const elements = new Map(
						old.layers.flatMap((l) => l.elements.map((e) => [e.id, e] as const)),
					);
					for (const l of p.layers)
						l.elements = l.elements.map((e) => {
							const original = elements.get(e.id);
							return original &&
								(original === e || JSON.stringify(original) === JSON.stringify(e))
								? original
								: e;
						});
					return p;
				});
			this.frames.set(state.current, next);
		}
		this.document = next;
		this.state = state;
		const retained = new Set([state.current, ...state.past, ...state.future]);
		for (const id of this.frames.keys()) if (!retained.has(id)) this.frames.delete(id);
		for (const listener of this.listeners) listener();
	}
	private command(op: string, parameters: Record<string, unknown> = {}): boolean {
		const before = this.state.revision;
		this.install(this.core.request<Projection>({ op, baseRevision: before, ...parameters }));
		return this.state.revision !== before;
	}
	getRevision() {
		return this.state.revision;
	}
	isDirty() {
		return this.state.dirty;
	}
	canUndo() {
		return this.state.past.length > 0;
	}
	canRedo() {
		return this.state.future.length > 0;
	}
	capture(document?: Notebook): NoteHistoryState {
		const past = this.state.past.map((id) => this.frames.get(id)!);
		if (document && JSON.stringify(document) !== JSON.stringify(this.document))
			return { past: [...past, this.document].slice(-200), future: [] };
		return { past, future: this.state.future.map((id) => this.frames.get(id)!) };
	}
	commit(change: (draft: Notebook) => void): boolean {
		const document = clone(this.document);
		change(document);
		this.core.request({ op: "configure", plugins: customBrushMetadata() });
		return this.command("replace", { document });
	}
	commitPage(pageId: string, change: (draft: NotePage) => void): boolean {
		const source = this.document.pages.find((p) => p.id === pageId);
		if (!source) throw Error("Notebook page was removed.");
		const page = clone(source);
		change(page);
		// Plugins may register after the editor opens.
		this.core.request({ op: "configure", plugins: customBrushMetadata() });
		return this.command("replacePage", { pageId, page });
	}
	undo() {
		this.command("undo");
	}
	redo() {
		this.command("redo");
	}
	markSaved(revision: number) {
		this.command("markSaved", { revision });
	}
	setReadonly(value: boolean) {
		this.command("readonly", { value });
	}
	async exportXopp(document = this.document, signal?: AbortSignal): Promise<Blob> {
		signal?.throwIfAborted();
		// Existing JS plugins may define arbitrary pressure curves. Materialize their
		// widths for interchange until those plugins supply native Rust renderers.
		if (
			document.pages.some((p) =>
				p.layers.some((l) =>
					l.elements.some((e) => e.kind === "stroke" && e.penStyle?.includes(":")),
				),
			)
		) {
			document = clone(document);
			for (const p of document.pages)
				for (const l of p.layers)
					for (const e of l.elements)
						if (e.kind === "stroke" && e.penStyle?.includes(":"))
							for (const point of e.points) point.width ??= inkWidth(e, point);
		}
		const core = new NotesRustKernel(await compileNotesKernel(), customBrushMetadata());
		try {
			signal?.throwIfAborted();
			core.request({ op: "initSave", document });
			core.request({ op: "exportFormat", format: "xopp" });
			return new Blob([core.save() as BlobPart], { type: "application/x-xopp" });
		} finally {
			core.close();
		}
	}
	async exportNotebook(signal?: AbortSignal): Promise<Blob> {
		const document = this.document,
			history = this.capture();
		signal?.throwIfAborted();
		const core = new NotesRustKernel(await compileNotesKernel(), customBrushMetadata());
		try {
			signal?.throwIfAborted();
			core.request({ op: "initSave", document, history });
			return new Blob([core.save() as BlobPart], {
				type: "application/vnd.cubexp.notebook+zip",
			});
		} finally {
			core.close();
		}
	}
	subscribe(listener: () => void) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	close() {
		this.listeners.clear();
		this.frames.clear();
		this.core.close();
	}
}
