export const NOTES_EXTENSIONS = ["cubenote", "xopp", "xoj"] as const;
export const NOTES_MIME_TYPE = "application/vnd.cubexp.notebook+zip";
export const NOTES_FORMAT_MANIFEST = {
	id: "notes",
	label: "CubeOffice Notes",
	extensions: NOTES_EXTENSIONS,
	mimeTypes: [NOTES_MIME_TYPE, "application/x-xopp", "application/x-xoj"],
	capabilities: { edit: true, "undo-redo": true, "pdf-export": true },
} as const;
export function nativeNotesFormat(fileName = ""): "cubenote" | "xopp" | "xoj" {
	const ext = fileName.split(".").pop()?.toLowerCase();
	return ext === "xopp" || ext === "xoj" ? ext : "cubenote";
}
