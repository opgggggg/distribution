import { artifactSourceToUint8Array, type ArtifactPlugin, type ArtifactSession } from "@yaochn/als-office-editor-core";
import { openEpub, type EpubBook } from "./book.js";
import { EPUB_FORMAT_MANIFEST, EPUB_MIME_TYPE } from "./formats.js";

export interface EpubArtifactSession extends ArtifactSession {
	getBook(): EpubBook;
}

/** Read-only session: EPUB opens for reading and exports its original bytes. */
export const EPUB_ARTIFACT_PLUGIN: ArtifactPlugin = {
	manifest: EPUB_FORMAT_MANIFEST,
	async open(input, context): Promise<EpubArtifactSession> {
		if (input.source === undefined) throw new Error("An EPUB file is required.");
		context?.signal?.throwIfAborted();
		const bytes = await artifactSourceToUint8Array(input.source);
		const book = await openEpub(bytes, { signal: context?.signal });
		const capabilities = { search: true, clipboard: true };
		let closed = false;
		const state = { revision: 0, dirty: false, readonly: true };
		return {
			format: "epub", artifactId: input.artifactId ?? input.fileName ?? book.metadata.identifier ?? crypto.randomUUID(), capabilities,
			getState: () => state,
			subscribe: () => () => undefined,
			getBook: () => book,
			async export(request) {
				if (closed) throw new Error("The EPUB session is closed.");
				if (request?.format && request.format !== "epub") throw new Error("EPUB conversion is not supported.");
				return new Blob([bytes as BlobPart], { type: EPUB_MIME_TYPE });
			},
			close() { closed = true; },
		};
	},
};
