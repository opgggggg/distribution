import { readFileSync } from "node:fs";

/**
 * The single list of document formats the mobile hosts open. Every host artefact
 * that names extensions or MIME types — the Web shell's picker and engine routing,
 * Android's intent filters and picker, the HarmonyOS skills and picker, the iOS
 * picker and imported type declarations — is generated from this file by
 * `scripts/sync-open-formats.mjs`. Edit here, then run `npm run profile:sync`.
 *
 * A format belongs here only when the Web shell can actually open it: either an
 * engine claims the extension, or an import converter registered with that engine
 * does. `engine` names the lazily loaded engine chunk in the Web shell (`null`
 * means "load every engine and decide by content"); `openAs` opens the file
 * directly as another engine format when the engine reads it natively but does not
 * list the extension. The first MIME type is the one a host offers when saving.
 */

// `@cubexp/text` owns its extension list; the hosts follow it. Parsed rather than
// imported because the source is TypeScript and the sync runs before any build.
const textFormatsSource = readFileSync(
	new URL("../packages/text/src/formats.ts", import.meta.url),
	"utf8",
);
const textExtensionsLiteral = /export const TEXT_EXTENSIONS = \[([\s\S]*?)\] as const;/.exec(
	textFormatsSource,
)?.[1];
if (!textExtensionsLiteral) {
	throw new Error("packages/text/src/formats.ts: TEXT_EXTENSIONS was not found");
}
const TEXT_EXTENSIONS = [...textExtensionsLiteral.matchAll(/"([^"]*)"/g)].map(([, value]) => value);
if (TEXT_EXTENSIONS.length === 0 || TEXT_EXTENSIONS.some((value) => !/^[a-z0-9]+$/.test(value))) {
	throw new Error("packages/text/src/formats.ts: TEXT_EXTENSIONS could not be parsed");
}

const VISIO_UTI = {
	identifier: "com.microsoft.visio.drawing",
	description: "Visio Drawing",
	conformsTo: ["public.data"],
};

/** Picker groups, in the order the HarmonyOS picker shows them. */
export const OPEN_FORMAT_GROUPS = [
	{
		label: "Office documents",
		formats: [
			{
				label: "Word document",
				engine: "docx",
				extensions: ["docx"],
				mimeTypes: [
					"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				],
			},
			{
				label: "Word 97-2003 document",
				engine: "docx",
				extensions: ["doc", "dot"],
				mimeTypes: ["application/msword"],
			},
			{
				label: "PowerPoint presentation",
				engine: "pptx",
				extensions: ["pptx"],
				mimeTypes: [
					"application/vnd.openxmlformats-officedocument.presentationml.presentation",
				],
			},
			{
				label: "PowerPoint 97-2003 presentation",
				engine: "pptx",
				extensions: ["ppt", "pps", "pot"],
				mimeTypes: ["application/vnd.ms-powerpoint"],
			},
			{
				label: "Excel workbook",
				engine: "xlsx",
				extensions: ["xlsx"],
				mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
			},
			{
				// The workbook reader recognises the macro-enabled package and writes it
				// back as one, so the file keeps its .xlsm name and its VBA project.
				label: "Excel macro-enabled workbook",
				engine: "xlsx",
				openAs: "xlsx",
				extensions: ["xlsm"],
				mimeTypes: ["application/vnd.ms-excel.sheet.macroEnabled.12"],
			},
			{
				label: "Excel 97-2003 workbook",
				engine: "xlsx",
				extensions: ["xls", "xlt"],
				mimeTypes: ["application/vnd.ms-excel"],
			},
			{
				label: "CSV",
				engine: "xlsx",
				extensions: ["csv"],
				mimeTypes: ["text/csv"],
			},
			{
				// Imported by apps/harmony/web/src/tsv-import.ts; the engine only exports TSV.
				label: "TSV",
				engine: "xlsx",
				extensions: ["tsv"],
				mimeTypes: ["text/tab-separated-values"],
			},
			{
				label: "JMP data table",
				engine: "xlsx",
				extensions: ["jmp"],
				mimeTypes: ["application/x-jmp-data-table", "application/vnd.sas.jmp", "application/x-jmp"],
				uti: {
					identifier: "com.sas.jmp",
					description: "JMP Data Table",
					conformsTo: ["public.data"],
				},
			},
			{
				label: "Visio drawing",
				engine: "vsdx",
				extensions: ["vsdx"],
				mimeTypes: [
					"application/vnd.ms-visio.drawing",
					"application/vnd.ms-visio.drawing.main+xml",
				],
				uti: VISIO_UTI,
			},
			{
				label: "Visio 2003-2010 drawing",
				engine: "vsdx",
				extensions: ["vsd", "vss", "vst"],
				mimeTypes: ["application/vnd.visio", "application/x-visio"],
				uti: VISIO_UTI,
			},
			{
				label: "draw.io diagram",
				engine: "vsdx",
				extensions: ["drawio"],
				mimeTypes: ["application/vnd.jgraph.mxfile", "application/x-drawio"],
				uti: {
					identifier: "com.jgraph.drawio",
					description: "draw.io Diagram",
					conformsTo: ["public.data"],
				},
			},
		],
	},
	{
		label: "Documents and images",
		formats: [
			{
				label: "PDF document",
				engine: "pdf",
				extensions: ["pdf"],
				mimeTypes: ["application/pdf"],
			},
			{
				label: "OFD document",
				engine: "ofd",
				extensions: ["ofd"],
				mimeTypes: ["application/ofd"],
				uti: {
					identifier: "com.cubexp.ofd",
					description: "OFD Document",
					conformsTo: ["public.data", "public.composite-content"],
				},
			},
			{
				label: "EPUB book",
				engine: "epub",
				extensions: ["epub"],
				mimeTypes: ["application/epub+zip"],
			},
			{
				label: "Markdown document",
				engine: "markdown",
				extensions: ["md", "markdown"],
				mimeTypes: ["text/markdown", "text/x-markdown", "application/x-markdown"],
			},
			{ label: "PNG image", engine: "image", extensions: ["png"], mimeTypes: ["image/png"] },
			{
				label: "JPEG image",
				engine: "image",
				extensions: ["jpg", "jpeg"],
				mimeTypes: ["image/jpeg"],
			},
			{ label: "WebP image", engine: "image", extensions: ["webp"], mimeTypes: ["image/webp"] },
			{
				label: "EMF image",
				engine: "image",
				extensions: ["emf"],
				mimeTypes: ["image/emf", "application/emf", "application/x-emf"],
			},
			{
				label: "WMF image",
				engine: "image",
				extensions: ["wmf"],
				mimeTypes: [
					"image/wmf",
					"application/wmf",
					"application/x-wmf",
					"application/x-msmetafile",
				],
			},
			// The formats below open through apps/harmony/web/src/image-import.ts, which
			// turns them into PNG for the image editor.
			{
				label: "GIF image",
				engine: "image",
				extensions: ["gif"],
				mimeTypes: ["image/gif"],
			},
			{
				label: "BMP image",
				engine: "image",
				extensions: ["bmp", "dib"],
				mimeTypes: ["image/bmp", "image/x-bmp", "image/x-ms-bmp"],
			},
			{
				label: "SVG image",
				engine: "image",
				extensions: ["svg"],
				mimeTypes: ["image/svg+xml"],
			},
			{
				label: "TIFF image",
				engine: "image",
				extensions: ["tif", "tiff"],
				mimeTypes: ["image/tiff", "image/tiff-fx"],
			},
			{
				label: "HEIC photo",
				engine: "image",
				extensions: ["heic", "heif", "hif"],
				mimeTypes: ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"],
			},
		],
	},
	{
		label: "Text and source code",
		formats: [
			{
				label: "Text file",
				engine: "text",
				extensions: TEXT_EXTENSIONS.filter((extension) => extension !== "xml"),
				mimeTypes: [
					"text/plain",
					"text/x-java-source",
					"text/javascript",
					"application/javascript",
					"application/json",
					"text/html",
					"text/css",
					"text/x-python",
					"text/x-shellscript",
					"application/yaml",
					"text/yaml",
				],
			},
			{
				// No engine shortcut: the draw.io importer claims application/xml, so a
				// diagram saved as .xml has to be told apart by content, not extension.
				label: "XML document",
				engine: null,
				extensions: ["xml"],
				mimeTypes: ["application/xml", "text/xml"],
			},
		],
	},
];

export const OPEN_FORMATS = OPEN_FORMAT_GROUPS.flatMap((group) => group.formats);

/** Every openable extension, in group order. */
export const OPEN_EXTENSIONS = OPEN_FORMATS.flatMap((format) => format.extensions);

/**
 * MIME types the native hosts register for. A document from a cloud provider often
 * arrives with no recognisable type at all, so the list ends in octet-stream and the
 * editor decides by content once it is open.
 */
export const OPEN_MIME_TYPES = [
	...new Set([...OPEN_FORMATS.flatMap((format) => format.mimeTypes), "application/octet-stream"]),
];

const seenExtensions = new Set();
for (const format of OPEN_FORMATS) {
	for (const extension of format.extensions) {
		if (!/^[a-z0-9]+$/.test(extension)) throw new Error(`Invalid extension: ${extension}`);
		if (seenExtensions.has(extension)) throw new Error(`Duplicate extension: ${extension}`);
		seenExtensions.add(extension);
	}
	if (format.mimeTypes.length === 0) throw new Error(`${format.label}: no MIME type`);
}
