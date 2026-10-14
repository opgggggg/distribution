import {
	artifactSourceToUint8Array,
	type ArtifactPlugin,
	type ArtifactSession,
} from "@yaochn/als-office-editor-core";
import { readNotebookState, writeNotebook, writeXopp } from "./codec.js";
import { NOTES_FORMAT_MANIFEST, nativeNotesFormat } from "./formats.js";
import { NoteHistory, type NoteHistoryState } from "./history.js";
import { clone, createNotebook, type Notebook } from "./model.js";

export interface NotesArtifactSession extends ArtifactSession {
	getNotebook(): Notebook;
	update(change: (draft: Notebook) => void): void;
}
function session(
	book: Notebook,
	input: { fileName?: string; artifactId?: string; access?: string },
	state?: NoteHistoryState,
): NotesArtifactSession {
	const readonly = input.access === "read",
		history = new NoteHistory(book, readonly, state);
	let closed = false;
	const ensureOpen = () => {
		if (closed) throw new Error("The notebook session is closed.");
	};
	const getState = () => ({
		revision: history.getRevision(),
		dirty: history.isDirty(),
		readonly,
	});
	return {
		format: "notes",
		artifactId: input.artifactId ?? crypto.randomUUID(),
		capabilities: {
			...NOTES_FORMAT_MANIFEST.capabilities,
			edit: !readonly,
			"pdf-export": false,
		},
		getState,
		subscribe: (listener) => history.subscribe(() => listener(getState())),
		getNotebook() {
			ensureOpen();
			return clone(history.document);
		},
		update(change) {
			ensureOpen();
			history.commit(change);
		},
		undo() {
			ensureOpen();
			history.undo();
		},
		redo() {
			ensureOpen();
			history.redo();
		},
		async export(request) {
			ensureOpen();
			request?.signal?.throwIfAborted();
			const format = request?.format ?? nativeNotesFormat(input.fileName);
			if (["notes", "cubenote"].includes(format))
				return writeNotebook(history.document, history.capture());
			if (["xopp", "xoj"].includes(format)) return writeXopp(history.document);
			throw new Error(`Notebook export to ${format} requires a graphical surface.`);
		},
		close() {
			closed = true;
			history.close();
		},
	};
}
export const NOTES_ARTIFACT_PLUGIN: ArtifactPlugin = {
	manifest: NOTES_FORMAT_MANIFEST,
	async create(input, context) {
		context?.signal?.throwIfAborted();
		return session(createNotebook(input.fileName?.replace(/\.cubenote$/i, ""), true), input);
	},
	async open(input, context) {
		context?.signal?.throwIfAborted();
		const restored =
			input.source === undefined
				? { document: createNotebook(undefined, true) }
				: readNotebookState(await artifactSourceToUint8Array(input.source), input.fileName);
		context?.signal?.throwIfAborted();
		return session(restored.document, input, restored.history);
	},
};
