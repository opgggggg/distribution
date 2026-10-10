export const EPUB_EXTENSIONS = ["epub"] as const;

export const EPUB_MIME_TYPE = "application/epub+zip";

export const EPUB_FORMAT_MANIFEST = {
	id: "epub",
	label: "EPUB",
	extensions: EPUB_EXTENSIONS,
	mimeTypes: [EPUB_MIME_TYPE],
	capabilities: { edit: false, search: true, clipboard: true },
} as const;
