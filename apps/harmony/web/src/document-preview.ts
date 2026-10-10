import { captureDocumentPreview as captureOfficePreview } from "@yaochn/als-office-editor-ui/document-preview";
import { captureEpubPreview, isEpubSurface } from "@cubexp/epub/thumbnail";

// Rendering logic belongs to ALS Office; distribution-owned formats add their own.
export async function captureDocumentPreview(surface: HTMLElement): Promise<string | undefined> {
	if (isEpubSurface(surface)) return captureEpubPreview(surface);
	return captureOfficePreview(surface);
}
