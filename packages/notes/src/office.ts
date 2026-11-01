import {
	artifactSourceToUint8Array,
	type ArtifactPlugin,
	type ArtifactSession,
} from "@yaochn/als-office-editor-core";
import { NOTES_FORMAT_MANIFEST, nativeNotesFormat } from "./formats.js";
import { RustNoteHistory } from "./kernel/history.js";
import { clone, createNotebook, type Notebook } from "./model.js";

export interface NotesArtifactSession extends ArtifactSession {
	getNotebook(): Notebook;
	update(change: (draft: Notebook) => void): void;
}
function session(
	history: RustNoteHistory,
	input: { fileName?: string; artifactId?: string; access?: string },
): NotesArtifactSession {
	const readonly = input.access === "read";
	history.setReadonly(readonly);
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
			if (!readonly) history.undo();
		},
		redo() {
			ensureOpen();
			if (!readonly) history.redo();
		},
		async export(request) {
			ensureOpen();
			request?.signal?.throwIfAborted();
			const format = request?.format ?? nativeNotesFormat(input.fileName);
			if (["notes", "cubenote"].includes(format))
				return history.exportNotebook(request?.signal);
			if (["xopp", "xoj"].includes(format))
				return history.exportXopp(undefined, request?.signal);
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
		const history = await RustNoteHistory.create(
			createNotebook(input.fileName?.replace(/\.cubenote$/i, ""), true),
		);
		if (context?.signal?.aborted) {
			history.close();
			context.signal.throwIfAborted();
		}
		return session(history, input);
	},
	async open(input, context) {
		context?.signal?.throwIfAborted();
		const history =
			input.source === undefined
				? await RustNoteHistory.create(createNotebook(undefined, true))
				: await RustNoteHistory.open(
						await artifactSourceToUint8Array(input.source),
						input.fileName,
					);
		if (context?.signal?.aborted) {
			history.close();
			context.signal.throwIfAborted();
		}
		return session(history, input);
	},
};
