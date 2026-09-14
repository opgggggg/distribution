import { EDITABLE_TEXT_MAX_BYTES } from "./large-file.js";
import { artifactSourceToUint8Array, type ArtifactPlugin, type ArtifactSession } from "@yaochn/als-office-editor-core";
import { TEXT_FORMAT_MANIFEST } from "./formats.js";
import { createTextBuffer } from "./buffer.js";

export interface TextArtifactSession extends ArtifactSession {
	getText(): string;
	setText(text: string): void;
}

export const TEXT_ARTIFACT_PLUGIN: ArtifactPlugin = {
	manifest: TEXT_FORMAT_MANIFEST,
	async open(input, context): Promise<TextArtifactSession> {
		if (input.source === undefined) throw new Error("A text file is required.");
		context?.signal?.throwIfAborted();
		if (input.source instanceof Blob && input.source.size > EDITABLE_TEXT_MAX_BYTES) throw new RangeError("Use readTextPage or the paged viewer for large files.");
		const buffer = await createTextBuffer(await artifactSourceToUint8Array(input.source), { fileName: input.fileName, signal: context?.signal });
		const readonly = input.access === "read";
		const capabilities = { ...TEXT_FORMAT_MANIFEST.capabilities, edit: !readonly };
		let closed = false;
		const undo: string[] = [], redo: string[] = [];
		function writable() {
			if (closed) throw new Error("The text session is closed.");
			if (readonly) throw new Error("The text session is read-only.");
		}
		const getState = () => ({ revision: buffer.getRevision(), dirty: buffer.isDirty(), readonly });
		return {
			format: "text", artifactId: input.artifactId ?? input.fileName ?? crypto.randomUUID(), capabilities,
			getState, getText: () => buffer.getText(),
			subscribe: listener => buffer.subscribe(() => listener(getState())),
			setText(text) {
				writable();
				if (text === buffer.getText()) return;
				undo.push(buffer.getText()); redo.length = 0; buffer.setText(text);
			},
			undo() { writable(); if (undo.length) { redo.push(buffer.getText()); buffer.setText(undo.pop()!); } },
			redo() { writable(); if (redo.length) { undo.push(buffer.getText()); buffer.setText(redo.pop()!); } },
			async export(request) {
				if (closed) throw new Error("The text session is closed.");
				if (request?.format && !["text", ...TEXT_FORMAT_MANIFEST.extensions].includes(request.format)) throw new Error("Text conversion is not supported.");
				return buffer.exportFile(request?.format, request);
			},
			close() { closed = true; },
		};
	},
};
