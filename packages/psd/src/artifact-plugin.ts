import { probeGraphicsSource } from "@cubexp/graphics";
import type {
	ArtifactCommandResult,
	ArtifactCreateInput,
	ArtifactInput,
	ArtifactPlugin,
	ArtifactSession,
	ArtifactSessionState,
} from "@yaochn/als-office-editor-core";
import { artifactSourceToUint8Array } from "@yaochn/als-office-editor-core";

import { encodePsdPng } from "./ai-resources";
import { composePsdDocument } from "./render/compose";
import { createPsdAiApi } from "./ai";
import { readPsd } from "./codec/read";
import { writePsd } from "./codec/write";
import { createBlankPsdDocument, type CreateBlankPsdDocumentOptions } from "./create-document";
import { PsdEditorSession } from "./editor/session";
import { PSD_FORMAT_MANIFEST } from "./format-manifest";

function artifactId(input: Pick<ArtifactInput, "artifactId" | "fileName">): string {
	return input.artifactId ?? input.fileName ?? `psd-${Date.now().toString(36)}`;
}

function psdBlob(session: PsdEditorSession): Blob {
	const bytes = writePsd(session.peekDocument());
	return new Blob([bytes.slice().buffer as ArrayBuffer], {
		type: PSD_FORMAT_MANIFEST.mimeTypes[0],
	});
}

function createOptions(input: ArtifactCreateInput): CreateBlankPsdDocumentOptions {
	if (input.options === undefined) return {};
	if (!input.options || typeof input.options !== "object" || Array.isArray(input.options)) {
		throw new TypeError("PSD create options must be an object.");
	}
	const value = input.options as Record<string, unknown>;
	const options: CreateBlankPsdDocumentOptions = {};
	for (const key of ["width", "height", "resolutionPpi"] as const) {
		if (value[key] !== undefined) {
			if (typeof value[key] !== "number") throw new TypeError(`PSD ${key} must be a number.`);
			options[key] = value[key];
		}
	}
	return options;
}

function psdSession(input: ArtifactInput, document: ReturnType<typeof readPsd>): ArtifactSession {
	if (input.access === "read" || !document.editable) document.editable = false;
	const native = new PsdEditorSession(document);
	const api = createPsdAiApi({
		session: native,
		requireRevision: true,
		document: () => native.peekDocument(),
		readOnly: () => !native.peekDocument().editable,
		documentName: input.fileName,
	});
	const session: ArtifactSession = {
		format: "psd",
		artifactId: artifactId(input),
		capabilities: PSD_FORMAT_MANIFEST.capabilities,
		getState: (): ArtifactSessionState => ({
			revision: native.getRevision(),
			dirty: native.getStateId() !== 0,
			readonly: !native.peekDocument().editable,
		}),
		getCommandManifest: () => api.getManifest(),
		subscribe(listener) {
			return native.subscribe(() => listener(session.getState()));
		},
		async execute(request): Promise<ArtifactCommandResult> {
			const before = native.getRevision();
			const result = await api.execute(
				request.commands as readonly Record<string, unknown>[],
				{
					baseRevision:
						typeof request.baseRevision === "number" ? request.baseRevision : undefined,
					summary: request.summary,
					requestId: request.operationId,
				},
			);
			const revision = native.getRevision();
			const wrote = revision !== before;
			return { result, revision, wrote, noop: !wrote || result.noop === true };
		},
		undo: () => native.undo(),
		redo: () => native.redo(),
		// The CLI persists the exported PSD after every write. No duplicate binary
		// model is needed in session.json; this marker leaves room for UI state later.
		serializeState: () => ({ schemaVersion: 1 }),
		export: async (request = {}) => {
			const format = (request.format ?? "psd").toLocaleLowerCase();
			if (format === "png") {
                const doc = native.peekDocument();
                if (doc.width*doc.height > 16_000_000) throw new Error("PNG export exceeds 16 megapixels; use document.preview with a region");
                const png = await encodePsdPng(composePsdDocument(doc));
                if (request.signal?.aborted) throw new DOMException("Export aborted", "AbortError");
                return new Blob([png.slice().buffer as ArrayBuffer],{type:"image/png"});
            }
            if (format !== "psd") {
				throw new Error(
					`Headless PSD sessions cannot export ${format}; use the Vue surface for bitmap export.`,
				);
			}
			if (request.signal?.aborted) throw new DOMException("Export aborted", "AbortError");
			return psdBlob(native);
		},
		close: () => api.destroy(),
	};
	return session;
}

export const PSD_ARTIFACT_PLUGIN: ArtifactPlugin = {
	manifest: PSD_FORMAT_MANIFEST,
	async canOpen(input) {
		if (input.source === undefined) return false;
		try {
			const bytes = await artifactSourceToUint8Array(
				input.source instanceof Blob ? input.source.slice(0, 6) : input.source,
			);
			return probeGraphicsSource(bytes) === "psd" && bytes[4] === 0 && bytes[5] === 1;
		} catch {
			return false;
		}
	},
	async create(input) {
		return psdSession(input, createBlankPsdDocument(createOptions(input)));
	},
	async open(input) {
		if (input.source === undefined) throw new TypeError("PSD source is required.");
		return psdSession(input, readPsd(await artifactSourceToUint8Array(input.source)));
	},
};
