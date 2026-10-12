/** Existing host recent-files pipeline captures the notebook's active paper canvas. */
export function captureNotesPreview(surface: Element): string | undefined {
	const paper = surface.querySelector<HTMLCanvasElement>(".cube-notes__paper-canvas");
	if (!paper?.width) return undefined;
	const canvas = document.createElement("canvas");
	canvas.width = 480;
	canvas.height = 360;
	const ctx = canvas.getContext("2d");
	if (!ctx) return undefined;
	ctx.fillStyle = "#edf0f7";
	ctx.fillRect(0, 0, 480, 360);
	const ratio = Math.min(300 / paper.height, 420 / paper.width),
		width = paper.width * ratio,
		height = paper.height * ratio;
	ctx.shadowColor = "#17243c30";
	ctx.shadowBlur = 12;
	ctx.shadowOffsetY = 4;
	ctx.drawImage(paper, (480 - width) / 2, (360 - height) / 2, width, height);
	return canvas.toDataURL("image/png");
}
