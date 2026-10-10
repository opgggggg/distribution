import type { UiArtifactFormatContribution } from "@yaochn/als-office-editor-ui/vue";
import { SpreadsheetWorkbook } from "@yaochn/als-office-xlsx";

type ArtifactConverter = NonNullable<UiArtifactFormatContribution["converters"]>[number];

// The same budget the upstream CSV importer applies to delimited text.
const MAX_TSV_SOURCE_BYTES = 64 * 1024 * 1024;

/**
 * Opens tab-separated text as a workbook. The spreadsheet engine exports TSV but only
 * imports CSV; its delimited reader takes any delimiter, so the import is the CSV
 * path with a tab. Loaded with the spreadsheet engine chunk, never eagerly.
 */
export const TSV_TO_XLSX_CONVERTER: ArtifactConverter = {
	manifest: {
		id: "tsv-to-xlsx",
		label: "TSV data as Excel workbook",
		source: {
			format: "tsv",
			extensions: ["tsv"],
			mimeTypes: ["text/tab-separated-values"],
		},
		target: {
			format: "xlsx",
			extensions: ["xlsx"],
			mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
		},
		accepts: "bytes",
		environment: "headless",
		lossiness: "lossy",
	},
	async canConvert(input) {
		return input.kind === "bytes" && input.blob.size <= MAX_TSV_SOURCE_BYTES;
	},
	async convert(input, context) {
		if (input.kind !== "bytes") throw new TypeError("tsv-to-xlsx converts raw TSV bytes.");
		if (input.blob.size > MAX_TSV_SOURCE_BYTES) {
			throw new RangeError("TSV source exceeds the 64 MiB import budget.");
		}
		if (context?.signal?.aborted) throw new DOMException("Import aborted", "AbortError");
		const workbook = await SpreadsheetWorkbook.fromDelimited(input.blob, {
			delimiter: "\t",
			encoding: await delimitedEncoding(input.blob),
			allowFormulas: false,
			sheetName: sheetName(input.fileName),
		});
		if (context?.signal?.aborted) throw new DOMException("Import aborted", "AbortError");
		return workbook.toBlob();
	},
};

async function delimitedEncoding(blob: Blob): Promise<"utf-8" | "utf-16le" | "utf-16be"> {
	const prefix = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
	if (prefix[0] === 0xff && prefix[1] === 0xfe) return "utf-16le";
	if (prefix[0] === 0xfe && prefix[1] === 0xff) return "utf-16be";
	return "utf-8";
}

function sheetName(fileName: string | undefined): string {
	return (
		fileName
			?.replace(/\.[^.]+$/u, "")
			.replace(/[\\/?*:[\]]/gu, " ")
			.trim()
			.slice(0, 31) || "Imported"
	);
}
