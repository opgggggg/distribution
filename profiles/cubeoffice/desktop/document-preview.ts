import { captureDocumentPreview as captureOfficePreview } from "../../../als-office/packages/editor-ui/src/document-preview";
import { captureTextPreview } from "@cubexp/text/thumbnail";
import { captureEpubPreview, isEpubSurface } from "@cubexp/epub/thumbnail";
export { createDocumentPreviewCache } from "../../../als-office/packages/editor-ui/src/document-preview";

/** Distribution-owned formats extend the shared persistent recent-file preview pipeline. */
export async function captureDocumentPreview(surface: HTMLElement): Promise<string | undefined> {
	if (isEpubSurface(surface)) return captureEpubPreview(surface);
	if (surface.matches(".cubexp-text-shell, .cubexp-text-editor, .cubexp-text-large") || surface.querySelector(".cubexp-text-shell, .cubexp-text-editor, .cubexp-text-large")) {
		return captureTextPreview(surface);
	}
	return captureOfficePreview(surface);
}
