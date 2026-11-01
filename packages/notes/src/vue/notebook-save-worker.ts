import { NotesRustKernel } from "../kernel/runtime.js";
import type { BrushPlugin } from "../brushes.js";
import type { Notebook } from "../model.js";
import type { NoteHistoryState } from "../history.js";
import { NOTES_MIME_TYPE } from "../formats.js";
export interface NotebookSaveRequest {
	document: Notebook;
	history: NoteHistoryState;
	plugins: Omit<BrushPlugin, "render" | "pressureFactor">[];
	module: WebAssembly.Module;
}
const scope = globalThis as unknown as {
	onmessage: (event: MessageEvent<NotebookSaveRequest>) => void;
	postMessage: (reply: { blob?: Blob; error?: string }) => void;
};
scope.onmessage = ({ data }) => {
	let core: NotesRustKernel | undefined;
	try {
		core = new NotesRustKernel(data.module, data.plugins);
		core.request({ op: "initSave", document: data.document, history: data.history });
		scope.postMessage({ blob: new Blob([core.save() as BlobPart], { type: NOTES_MIME_TYPE }) });
	} catch (reason) {
		scope.postMessage({ error: reason instanceof Error ? reason.message : String(reason) });
	} finally {
		core?.close();
	}
};
