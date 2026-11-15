import { probeGraphicsSource } from "@cubexp/graphics";
import {
	artifactSourceToUint8Array,
	type ArtifactFormatManifest,
	type ArtifactPlugin,
	type ArtifactSource,
} from "@yaochn/als-office-editor-core";
import {
	createUiArtifactSurfaceHandle,
	type UiArtifactFormatContribution,
} from "@yaochn/als-office-editor-ui/vue";
import { createPdfArtifactPlugin } from "@yaochn/als-office-pdf";
import workerUrl from "@yaochn/als-office-pdf/pdf.worker.min.mjs?url";
import { exportVectorProject } from "./illustrator/export";
import {
	LEGACY_AI_HEADER_BYTES,
	isLegacyIllustrator,
	readLegacyIllustrator,
} from "./illustrator/legacy-ai";
import { MAX_INPUT_BYTES } from "./illustrator/import";
import IllustratorEditor from "./illustrator/IllustratorEditor.vue";

export { requireIllustratorSource } from "./illustrator/import";

const mimeTypes = ["application/illustrator"];
const pdf = createPdfArtifactPlugin({ workerSrc: workerUrl });
const manifest = {
	id: "ai",
	label: "Adobe Illustrator document",
	extensions: ["ai"],
	mimeTypes,
	capabilities: pdf.manifest.capabilities,
} satisfies ArtifactFormatManifest;

const plugin: ArtifactPlugin = {
	manifest,
	async canOpen(input) {
		if (!/\.ai$/i.test(input.fileName ?? "") || input.source === undefined) return false;
		const bytes = await artifactSourceToUint8Array(
			input.source instanceof Blob
				? input.source.slice(0, LEGACY_AI_HEADER_BYTES)
				: input.source,
		).catch(() => null);
		return (
			bytes !== null && (probeGraphicsSource(bytes) === "pdf" || isLegacyIllustrator(bytes))
		);
	},
	async open(input, context) {
		const source = input.source;
		if (source !== undefined) {
			const header =
				source instanceof Blob
					? await artifactSourceToUint8Array(source.slice(0, LEGACY_AI_HEADER_BYTES))
					: await artifactSourceToUint8Array(source);
			if (isLegacyIllustrator(header)) {
				const bytes =
					source instanceof Blob ? await artifactSourceToUint8Array(source) : header;
				if (bytes.length > MAX_INPUT_BYTES)
					throw new Error("This Illustrator file exceeds the 128 MiB editing limit.");
				const project = readLegacyIllustrator(bytes, context?.signal);
				const preview = await exportVectorProject(
					project,
					input.fileName ?? "Artwork",
					"pdf",
					0,
					context?.signal,
				);
				const session = await pdf.open({ ...input, source: preview }, context);
				return { ...session, format: "ai" };
			}
		}
		const session = await pdf.open(input, context);
		return { ...session, format: "ai" };
	},
};

const editorManifest: ArtifactFormatManifest = {
	...manifest,
	capabilities: { edit: true, "undo-redo": true, "pdf-export": true },
};

export const CUBEOFFICE_ILLUSTRATOR_CONTRIBUTION: UiArtifactFormatContribution = {
	plugin,
	createBinding(input) {
		return {
			component: IllustratorEditor,
			props: {
				source: input.source as ArtifactSource,
				fileName: input.fileName,
				readonly: input.readonly || input.role === "viewer",
			},
		};
	},
	adaptExposed(exposed, input) {
		const engine = exposed as
			| { waitReady?: (signal?: AbortSignal) => Promise<void> }
			| undefined;
		const surface = createUiArtifactSurfaceHandle(editorManifest, exposed, {
			nativeExportFormat: "ai",
			role: input.role ?? "editor",
			readonly: input.readonly || input.role === "viewer",
		});
		if (!surface || !engine?.waitReady) return null;
		return { ...surface, ready: (signal) => engine.waitReady!(signal) };
	},
};
