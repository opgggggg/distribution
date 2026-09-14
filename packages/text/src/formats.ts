/** Text formats owned by this viewer; Markdown, CSV and SVG keep their native viewers. */
export const TEXT_EXTENSIONS = [
	"txt", "log", "java", "js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx",
	"json", "jsonl", "jsonc", "xml", "html", "htm", "css", "scss", "less", "vue",
	"py", "pyw", "rb", "sh", "bash", "zsh", "yml", "yaml", "toml", "ini", "conf",
	"cfg", "properties", "env", "c", "h", "cpp", "hpp", "cc", "cxx", "cs", "go",
	"rs", "sql", "php", "swift", "kt", "kts", "diff", "patch", "gradle", "groovy",
	"dockerfile", "makefile",
] as const;

export const TEXT_FORMAT_MANIFEST = {
	id: "text",
	label: "Text / source code",
	extensions: TEXT_EXTENSIONS,
	mimeTypes: ["text/plain", "text/x-java-source", "text/javascript", "application/javascript",
		"application/json", "application/xml", "text/xml", "text/html", "text/css",
		"text/x-python", "text/x-shellscript", "application/yaml", "text/yaml"],
	capabilities: { edit: true, "undo-redo": true, search: true, clipboard: true },
} as const;
