import { clone, validateNotebook, type Notebook, type NotePage } from "./model.js";

export const HISTORY_LIMITS = { steps: 200, bytes: 32 * 1024 * 1024 };
export interface NoteHistoryState {
	readonly past: readonly Notebook[];
	readonly future: readonly Notebook[];
}
function snapshotWeight(value: unknown) {
	return (
		JSON.stringify(value, (key, value) =>
			key === "src" && typeof value === "string" ? "embedded-photo" : value,
		).length * 3
	);
}
function photoMemory(books: Notebook[]) {
	const sources = new Set<string>();
	for (const book of books)
		for (const p of book.pages) {
			if (p.background) sources.add(p.background.src);
			for (const l of p.layers)
				for (const e of l.elements) if (e.kind === "image") sources.add(e.src);
		}
	return [...sources].reduce((total, src) => total + src.length * 2, 0);
}
function restoredWeight(before: Notebook, after: Notebook): number {
	const changed = before.pages.filter((page, i) => page !== after.pages[i]);
	return snapshotWeight({ ...before, pages: changed });
}

/** One transaction per gesture; cancelling never commits incomplete ink. */
export class NoteHistory {
	private past: Notebook[] = [];
	private future: Notebook[] = [];
	private pastWeights: number[] = [];
	private futureWeights: number[] = [];
	private revision = 0;
	private cleanDocument: Notebook;
	private cleanPast: number[];
	private cleanFuture: number[];
	private identities = new WeakMap<Notebook, number>();
	private nextIdentity = 0;
	private listeners = new Set<() => void>();
	constructor(
		public document: Notebook,
		private readonly readonly = false,
		state?: NoteHistoryState,
	) {
		this.past = [...(state?.past ?? [])];
		this.future = [...(state?.future ?? [])];
		this.pastWeights = this.past.map((before, i) =>
			restoredWeight(before, this.past[i + 1] ?? document),
		);
		this.futureWeights = this.future.map((after, i) =>
			restoredWeight(this.future[i + 1] ?? document, after),
		);
		this.cleanDocument = document;
		this.cleanPast = this.past.map((d) => this.identity(d));
		this.cleanFuture = this.future.map((d) => this.identity(d));
	}
	private identity(document: Notebook): number {
		let id = this.identities.get(document);
		if (id === undefined) {
			id = ++this.nextIdentity;
			this.identities.set(document, id);
		}
		return id;
	}
	private sameStack(stack: readonly Notebook[], saved: readonly number[]): boolean {
		return (
			stack.length === saved.length && stack.every((d, i) => this.identity(d) === saved[i])
		);
	}
	getRevision() {
		return this.revision;
	}
	isDirty() {
		return (
			this.document !== this.cleanDocument ||
			!this.sameStack(this.past, this.cleanPast) ||
			!this.sameStack(this.future, this.cleanFuture)
		);
	}
	canUndo() {
		return this.past.length > 0;
	}
	canRedo() {
		return this.future.length > 0;
	}
	/** Snapshot references are immutable; a pending text edit is one extra transaction. */
	capture(document?: Notebook): NoteHistoryState {
		if (document && JSON.stringify(document) !== JSON.stringify(this.document))
			return { past: [...this.past, this.document].slice(-HISTORY_LIMITS.steps), future: [] };
		return { past: [...this.past], future: [...this.future] };
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
	commit(change: (draft: Notebook) => void): boolean {
		if (this.readonly) throw new Error("This notebook is read-only.");
		const next = clone(this.document);
		change(next);
		validateNotebook(next);
		const before = JSON.stringify(this.document);
		if (JSON.stringify(next) === before) return false;
		return this.install(next, snapshotWeight(this.document));
	}
	/** Ink changes clone their page only; other pages share immutable snapshots. */
	commitPage(pageId: string, change: (draft: NotePage) => void): boolean {
		if (this.readonly) throw new Error("This notebook is read-only.");
		const index = this.document.pages.findIndex((p) => p.id === pageId);
		if (index < 0) throw new Error("Notebook page was removed.");
		const page = clone(this.document.pages[index]);
		change(page);
		const originalBackground = this.document.pages[index].background;
		if (
			page.background &&
			originalBackground &&
			["id", "src", "x", "y", "width", "height", "opacity", "angle"].every(
				(key) => (page.background as any)[key] === (originalBackground as any)[key],
			)
		)
			page.background = originalBackground;
		const before = JSON.stringify(this.document.pages[index]);
		if (JSON.stringify(page) === before) return false;
		// Preserve immutable ink references across page transactions. Adding one pen
		// stroke should not invalidate the renderer's geometry for all older strokes.
		const originals = new Map(
			this.document.pages[index].layers.flatMap((layer) =>
				layer.elements.map((element) => [element.id, element] as const),
			),
		);
		for (const layer of page.layers)
			layer.elements = layer.elements.map((element) => {
				const original = originals.get(element.id);
				return original && JSON.stringify(original) === JSON.stringify(element)
					? original
					: element;
			});
		const pages = [...this.document.pages];
		pages[index] = page;
		const next: Notebook = { ...this.document, pages };
		validateNotebook(next);
		return this.install(next, snapshotWeight(this.document.pages[index]));
	}
	private install(next: Notebook, weight: number): boolean {
		this.past.push(this.document);
		this.pastWeights.push(weight);
		// Bound retained snapshots as well as count, keeping at least the last
		// gesture undoable even when a single page exceeds the history budget.
		while (
			this.past.length > 1 &&
			(this.past.length > HISTORY_LIMITS.steps ||
				this.pastWeights.reduce((a, b) => a + b, 0) + photoMemory([...this.past, next]) >
					HISTORY_LIMITS.bytes)
		) {
			this.past.shift();
			this.pastWeights.shift();
		}
		this.document = next;
		this.future = [];
		this.futureWeights = [];
		this.revision++;
		this.notify();
		return true;
	}
	undo() {
		if (this.readonly || !this.past.length) return;
		this.future.push(this.document);
		this.futureWeights.push(this.pastWeights.pop()!);
		this.document = this.past.pop()!;
		this.revision++;
		this.notify();
	}
	redo() {
		if (this.readonly || !this.future.length) return;
		this.past.push(this.document);
		this.pastWeights.push(this.futureWeights.pop()!);
		this.document = this.future.pop()!;
		this.revision++;
		this.notify();
	}
	/** Acknowledges only the snapshot actually delivered by the host. */
	markSaved(revision: number) {
		if (revision === this.revision) {
			this.cleanDocument = this.document;
			this.cleanPast = this.past.map((d) => this.identity(d));
			this.cleanFuture = this.future.map((d) => this.identity(d));
			this.notify();
		}
	}
	close() {
		this.listeners.clear();
		this.past = [];
		this.future = [];
		this.pastWeights = [];
		this.futureWeights = [];
		this.cleanPast = [];
		this.cleanFuture = [];
	}
}
