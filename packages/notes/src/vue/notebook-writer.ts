import NotebookSaveWorker from "./notebook-save-worker.js?worker&inline";
import { customBrushMetadata } from "../kernel/history.js";
import { compileNotesKernel } from "../kernel/loader.js";
import { NotesRustKernel } from "../kernel/runtime.js";
import { NOTES_MIME_TYPE } from "../formats.js";
import type { Notebook } from "../model.js";
import type { NoteHistoryState } from "../history.js";
import type { NotebookSaveRequest } from "./notebook-save-worker.js";
/** Rust archive/history encoding runs off-thread; the live document stays editable. */
export async function writeNotebookInBackground(
	document: Notebook,
	history: NoteHistoryState,
	signal?: AbortSignal,
): Promise<Blob> {
	signal?.throwIfAborted();
	const request: NotebookSaveRequest = {
		document,
		history,
		plugins: customBrushMetadata(),
		module: await compileNotesKernel(),
	};
	signal?.throwIfAborted();
	const nativeFallback = () => {
		const core = new NotesRustKernel(request.module, request.plugins);
		try {
			core.request({ op: "initSave", document, history });
			return new Blob([core.save() as BlobPart], { type: NOTES_MIME_TYPE });
		} finally {
			core.close();
		}
	};
	// Hosts without Worker support still use the same Rust authority.
	if (typeof Worker === "undefined") return nativeFallback();
	return new Promise<Blob>((resolve, reject) => {
		let worker: Worker;
		try {
			worker = new NotebookSaveWorker({ name: "cubeoffice-notebook-save" });
		} catch {
			resolve(nativeFallback());
			return;
		}
		const finish = () => {
			worker.terminate();
			signal?.removeEventListener("abort", abort);
		};
		const abort = () => {
			finish();
			reject(signal?.reason ?? new DOMException("Save cancelled", "AbortError"));
		};
		signal?.addEventListener("abort", abort, { once: true });
		worker.onmessage = ({ data }: MessageEvent<{ blob?: Blob; error?: string }>) => {
			finish();
			if (data.blob) resolve(data.blob);
			else reject(Error(data.error || "Notebook save failed."));
		};
		worker.onerror = (event) => {
			event.preventDefault();
			finish();
			reject(Error(event.message || "Notebook save worker failed."));
		};
		try {
			worker.postMessage(request);
		} catch (reason) {
			finish();
			reject(reason);
		}
	});
}
