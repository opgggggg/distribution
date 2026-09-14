import { readSource } from "./source.js";
import { type ArtifactPlugin } from "@yaochn/als-office-editor-core";
import { readOfdDocument } from "./read.js";
import { exportDocument } from "./convert.js";
import { OFD_MIME_TYPES, blob, type OfdFormat, type ConversionFormat } from "./types.js";
function plugin(format: OfdFormat): ArtifactPlugin {
	const manifest = {
		id: format,
		label: `${format.toUpperCase()} document`,
		extensions: [format],
		mimeTypes: [OFD_MIME_TYPES[format]],
		capabilities: { search: true },
	};
	return {
		manifest,
		async canOpen(input) {
			if (input.source === undefined) return false;
			try {
				return (await readOfdDocument(await readSource(input.source))).format === format;
			} catch {
				return false;
			}
		},
		async open(input, context) {
			if (input.source === undefined) throw new Error("A document source is required.");
			const bytes = await readSource(input.source, { signal: context?.signal }),
				document = await readOfdDocument(bytes, { signal: context?.signal });
			if (document.format !== format)
				throw new Error("The document content does not match the selected format.");
			let closed = false;
			return {
				format,
				artifactId: input.artifactId ?? input.fileName ?? crypto.randomUUID(),
				capabilities: manifest.capabilities,
				getState: () => ({ revision: 0, dirty: false, readonly: true }),
				async export(request) {
					if (closed) throw new Error("The document session is closed.");
					if (!request?.format || request.format === format)
						return blob(bytes, OFD_MIME_TYPES[format]);
					const result = await exportDocument(
						document,
						request.format as ConversionFormat,
						{ signal: request.signal, fileName: input.fileName },
					);
					if (result.files.length !== 1)
						throw new Error("Use exportDocument for a multi-file export.");
					return result.files[0].blob;
				},
				close() {
					closed = true;
				},
			};
		},
	};
}
export const OFD_ARTIFACT_PLUGIN = plugin("ofd");
export const OFD_ARTIFACT_PLUGINS: readonly ArtifactPlugin[] = [OFD_ARTIFACT_PLUGIN];
