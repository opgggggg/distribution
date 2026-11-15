export const PSD_FORMAT_MANIFEST = {
	id: "psd",
	label: "Photoshop document",
	extensions: ["psd"],
	mimeTypes: ["image/vnd.adobe.photoshop", "image/x-photoshop", "application/x-photoshop"],
	capabilities: {
		edit: true,
		"undo-redo": true,
		clipboard: true,
		"ai-read": true,
		"ai-write": true,
		"layer-editing": true,
		"pixel-editing": true,
	},
} as const;
