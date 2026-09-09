import { toJpeg } from "html-to-image";

/** Capture the already-rendered first page once; never mount an editor for the library. */
export async function captureDocumentPreview(surface: HTMLElement): Promise<string | undefined> {
	const page = surface.querySelector<HTMLElement>(
		"#viewer .als-ofs-pptx-slide, .als-ofs-docx-word-page, .als-ofs-pdf-viewer__page-grid .als-ofs-pdf-page-canvas, .als-ofs-xlsx-workspace, .als-ofs-ui-markdown-editor__preview-pane, .als-ofs-vsdx-viewer__page",
	);
	const target = page ?? surface.querySelector<HTMLElement>("[data-workspace-region='stage']");
	if (!target || !target.getBoundingClientRect().width) return;
	const pdfCanvas = target.matches(".als-ofs-pdf-page-canvas")
		? target.querySelector<HTMLCanvasElement>("canvas")
		: null;
	if (pdfCanvas && pdfCanvas.dataset.rendered !== "true") {
		await new Promise<void>((resolve) => {
			const observer = new MutationObserver(() => {
				if (pdfCanvas.dataset.rendered === "true") finish();
			});
			const timer = setTimeout(finish, 10000);
			function finish() {
				clearTimeout(timer);
				observer.disconnect();
				resolve();
			}
			observer.observe(pdfCanvas, { attributes: true, attributeFilter: ["data-rendered"] });
		});
		if (pdfCanvas.dataset.rendered !== "true") return;
	}
	const width = target.offsetWidth;
	const height = Math.min(target.offsetHeight, width * 1.4);
	if (!width || !height) return;
	const existingCanvas = target.querySelector<HTMLCanvasElement>(
		"canvas[data-editor-model-canvas], .als-ofs-pdf-page-canvas > canvas",
	);
	if (existingCanvas?.width && existingCanvas.height) {
		const thumbnail = document.createElement("canvas");
		thumbnail.width = 240;
		thumbnail.height = Math.round((240 * existingCanvas.height) / existingCanvas.width);
		thumbnail
			.getContext("2d")!
			.drawImage(existingCanvas, 0, 0, thumbnail.width, thumbnail.height);
		return thumbnail.toDataURL("image/jpeg", 0.75);
	}
	return toJpeg(target, {
		width,
		height,
		canvasWidth: 240,
		canvasHeight: Math.round((240 * height) / width),
		pixelRatio: 1,
		quality: 0.75,
		backgroundColor:
			getComputedStyle(target).backgroundColor === "rgba(0, 0, 0, 0)"
				? "#ffffff"
				: getComputedStyle(target).backgroundColor,
		skipFonts: true,
		style: { transform: "none", margin: "0", overflow: "hidden" },
		filter: (node) =>
			!(node instanceof Element) ||
			!node.matches(
				".als-ofs-pptx-editor-selection-overlay-host, .als-ofs-ui-selection-overlay, .als-ofs-xlsx-selection-outline",
			),
	});
}
