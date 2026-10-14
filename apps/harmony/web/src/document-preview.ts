import { captureDocumentPreview as captureOfficePreview } from "@yaochn/als-office-editor-ui/document-preview";
import { captureEpubPreview, isEpubSurface } from "@cubexp/epub/thumbnail";

// Rendering logic belongs to ALS Office; distribution-owned formats add their own.
export async function captureDocumentPreview(surface: HTMLElement): Promise<string | undefined> {
	const mobileImage = surface.querySelector<HTMLImageElement>(".mobile-image__picture img");
	if (mobileImage?.naturalWidth) {
		const canvas = document.createElement("canvas"),
			ratio = Math.min(480 / mobileImage.naturalWidth, 672 / mobileImage.naturalHeight);
		canvas.width = Math.max(1, Math.round(mobileImage.naturalWidth * ratio));
		canvas.height = Math.max(1, Math.round(mobileImage.naturalHeight * ratio));
		const context = canvas.getContext("2d")!;
		context.fillStyle = "#fff";
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.drawImage(mobileImage, 0, 0, canvas.width, canvas.height);
		return canvas.toDataURL("image/jpeg", 0.8);
	}
	if (surface.matches(".cube-notes") || surface.querySelector(".cube-notes")) {
		return (await import("@cubexp/notes/thumbnail")).captureNotesPreview(surface);
	}
	if (isEpubSurface(surface)) return captureEpubPreview(surface);
	return captureOfficePreview(surface);
}
