import type { ArtifactConverterPlugin } from "@yaochn/als-office-editor-core";
import { convertDocument, conversionTargets } from "./convert.js";
import {
	OFD_MIME_TYPES,
	type ConversionFormat,
	type ConversionResult,
	type ConvertOptions,
} from "./types.js";
const mimeTypes: Partial<Record<ConversionFormat, string>> = {
	...OFD_MIME_TYPES,
	pdf: "application/pdf",
	png: "image/png",
	jpeg: "image/jpeg",
	svg: "image/svg+xml",
	html: "text/html",
	txt: "text/plain",
	md: "text/markdown",

	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
export type DocumentConversionBackend = (
	source: Blob,
	from: ConversionFormat,
	to: ConversionFormat,
	options: ConvertOptions,
) => Promise<ConversionResult>;
/** Adapt multi-file-aware conversion to the host's single-Blob contract. */
export function createDocumentConverters(
	backend: DocumentConversionBackend,
	node = false,
): ArtifactConverterPlugin[] {
	const converters: ArtifactConverterPlugin[] = [];
	for (const [source, targets] of Object.entries(conversionTargets))
		for (const target of targets ?? []) {
			const from = source as ConversionFormat;
			const native = from === "ofd";
			const local =
				(native && !["docx", "xlsx", "pptx"].includes(target)) ||
				(from === "ofd" && target === "docx");
			if (!node && !local) continue;
			const endpoint = (format: ConversionFormat) => ({
				format,
				extensions:
					format === "jpeg"
						? ["jpg", "jpeg"]
						: format === "html"
							? ["html", "htm"]
							: format === "md"
								? ["md", "markdown"]
								: [format],
				mimeTypes: mimeTypes[format] ? [mimeTypes[format]!] : [],
			});
			converters.push({
				manifest: {
					id: `${from}-to-${target}`,
					label: `${from.toUpperCase()} as ${target.toUpperCase()}`,
					source: endpoint(from),
					target: endpoint(target),
					accepts: "bytes",
					environment:
						!node && ["pdf", "png", "jpeg"].includes(target) ? "dom" : "headless",
					lossiness: "lossy",
				},
				async convert(input, context) {
					if (input.kind !== "bytes")
						throw new TypeError("OfdDocument converters require raw bytes.");
					const page = context?.options?.page;
					if (page !== undefined && typeof page !== "number")
						throw new TypeError("The page/sheet option must be a number.");
					const result = await backend(input.blob, from, target, {
						fileName: input.fileName,
						signal: context?.signal,
						...(page !== undefined ? { page } : {}),
					});
					if (result.files.length !== 1)
						throw new Error(
							"This export produces multiple files. Select a zero-based page/sheet through options.page, or use the multi-file conversion API.",
						);
					return result.files[0].blob;
				},
			});
		}
	return converters;
}
export const OFD_ARTIFACT_CONVERTERS: readonly ArtifactConverterPlugin[] =
	createDocumentConverters(convertDocument);
