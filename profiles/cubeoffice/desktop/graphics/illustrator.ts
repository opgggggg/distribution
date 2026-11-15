import { probeGraphicsSource } from "@cubexp/graphics";
import {
	artifactSourceToUint8Array,
	type ArtifactPlugin,
	type ArtifactSource,
} from "@yaochn/als-office-editor-core";
import {
	createUiArtifactSurfaceHandle,
	type UiArtifactFormatContribution,
} from "@yaochn/als-office-editor-ui/vue";
import { PDF_ARTIFACT_PLUGIN } from "@yaochn/als-office-pdf";
import { PDF_VUE_FORMAT_CONTRIBUTION } from "@yaochn/als-office-pdf/vue";

const manifest = {
	id: "ai",
	label: "Adobe Illustrator document",
	extensions: ["ai"],
	mimeTypes: ["application/illustrator"],
	capabilities: PDF_ARTIFACT_PLUGIN.manifest.capabilities,
};

export function requireIllustratorPreview(bytes: Uint8Array): void {
	if (probeGraphicsSource(bytes) !== "pdf") {
		throw new Error(
			"An Illustrator preview is unavailable. Save the .ai file in Illustrator with Create PDF Compatible File enabled.",
		);
	}
}

async function exportIllustratorPdf(source: ArtifactSource, signal?: AbortSignal): Promise<Blob> {
	const bytes = await artifactSourceToUint8Array(source);
	requireIllustratorPreview(bytes);
	const { compilePdfKernel, PdfKernelDocument } = await import("@yaochn/als-office-pdf");
	const pdf = await PdfKernelDocument.open(await compilePdfKernel(), bytes, { signal });
	try {
		signal?.throwIfAborted();
		pdf.extractPages(Array.from({ length: pdf.pageCount }, (_, i) => i + 1));
		signal?.throwIfAborted();
		return new Blob([new Uint8Array(pdf.save())], { type: "application/pdf" });
	} finally {
		pdf.dispose();
	}
}

const plugin: ArtifactPlugin = {
	manifest,
	async canOpen(input) {
		if (!/\.ai$/i.test(input.fileName ?? "") || input.source === undefined) return false;
		const bytes = await artifactSourceToUint8Array(
			input.source instanceof Blob ? input.source.slice(0, 8) : input.source,
		).catch(() => null);
		return bytes !== null && probeGraphicsSource(bytes) === "pdf";
	},
	async open(input, context) {
		if (input.source === undefined) throw new TypeError("Illustrator source is required.");
		const bytes = await artifactSourceToUint8Array(input.source);
		requireIllustratorPreview(bytes);
		const session = await PDF_ARTIFACT_PLUGIN.open({ ...input, source: bytes }, context);
		return {
			...session,
			format: "ai",
			export: (request) => exportIllustratorPdf(bytes, request?.signal),
		};
	},
};

export const CUBEOFFICE_ILLUSTRATOR_CONTRIBUTION: UiArtifactFormatContribution = {
	plugin,
	createBinding(input) {
		const binding = PDF_VUE_FORMAT_CONTRIBUTION.createBinding(input);
		return {
			...binding,
			props: {
				...binding.props,
				class: "cubeoffice-illustrator-preview",
				editable: false,
				redactable: false,
				comments: false,
				enableScripting: false,
			},
		};
	},
	adaptExposed(exposed, input) {
		const surface = createUiArtifactSurfaceHandle(manifest, exposed, {
			nativeExportFormat: "pdf",
			role: "viewer",
			readonly: true,
		});
		const source = input.source;
		if (
			!surface ||
			!(
				typeof source === "string" ||
				source instanceof Blob ||
				source instanceof ArrayBuffer ||
				source instanceof Uint8Array
			)
		)
			return surface;
		return {
			...surface,
			export: (request) => exportIllustratorPdf(source, request?.signal),
		};
	},
};
