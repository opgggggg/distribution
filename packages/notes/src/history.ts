import { clone, validateNotebook, type Notebook, type NotePage } from "./model.js";

/** One transaction per gesture; cancelling never commits incomplete ink. */
export class NoteHistory {
	private past: Notebook[] = [];
	private future: Notebook[] = [];
	private pastWeights: number[] = [];
	private futureWeights: number[] = [];
	private revision = 0;
	private cleanDocument: Notebook;
	private listeners = new Set<() => void>();
	constructor(
		public document: Notebook,
		private readonly readonly = false,
	) {
		this.cleanDocument = document;
	}
	getRevision() {
		return this.revision;
	}
	isDirty() {
		return this.document !== this.cleanDocument;
	}
	canUndo() {
		return this.past.length > 0;
	}
	canRedo() {
		return this.future.length > 0;
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
		return this.install(next, before.length * 3);
	}
	/** Ink changes clone their page only; other pages share immutable snapshots. */
	commitPage(pageId: string, change: (draft: NotePage) => void): boolean {
		if (this.readonly) throw new Error("This notebook is read-only.");
		const index = this.document.pages.findIndex((p) => p.id === pageId);
		if (index < 0) throw new Error("Notebook page was removed.");
		const page = clone(this.document.pages[index]);
		change(page);
		const before = JSON.stringify(this.document.pages[index]);
		if (JSON.stringify(page) === before) return false;
		const pages = [...this.document.pages];
		pages[index] = page;
		const next: Notebook = { ...this.document, pages };
		validateNotebook(next);
		return this.install(next, before.length * 3);
	}
	private install(next: Notebook, weight: number): boolean {
		this.past.push(this.document);
		this.pastWeights.push(weight);
		// Bound retained snapshots as well as count, keeping at least the last
		// gesture undoable even when a single page exceeds the history budget.
		while (
			this.past.length > 1 &&
			(this.past.length > 60 ||
				this.pastWeights.reduce((a, b) => a + b, 0) > 32 * 1024 * 1024)
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
			this.notify();
		}
	}
	close() {
		this.listeners.clear();
		this.past = [];
		this.future = [];
		this.pastWeights = [];
		this.futureWeights = [];
	}
}
