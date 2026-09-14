import { captureDocumentPreview as captureOfficePreview } from "../../../als-office/packages/editor-ui/src/document-preview";
import { captureTextPreview } from "@cubexp/text/thumbnail";
export { createDocumentPreviewCache } from "../../../als-office/packages/editor-ui/src/document-preview";

/** Distribution-owned formats extend the shared persistent recent-file preview pipeline. */
export async function captureDocumentPreview(surface: HTMLElement): Promise<string | undefined> {
	if (surface.matches(".cubexp-text-shell, .cubexp-text-editor, .cubexp-text-large") || surface.querySelector(".cubexp-text-shell, .cubexp-text-editor, .cubexp-text-large")) {
		return captureTextPreview(surface);
	}
	return captureOfficePreview(surface);
}
