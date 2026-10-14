import { PDFDocument, degrees } from "pdf-lib";
export type PdfPageOperation = {
	type: "rotate" | "delete" | "move";
	page: number;
	target?: number;
};
/** Detached PDF mutations retain original page objects and form/annotation references. */
export async function changePdfPages(
	bytes: Uint8Array,
	operation: PdfPageOperation,
): Promise<Uint8Array> {
	const doc = await PDFDocument.load(bytes.slice(), { updateMetadata: false });
	const index = operation.page - 1;
	if (!Number.isInteger(index) || index < 0 || index >= doc.getPageCount())
		throw new Error("页码超出范围。");
	if (operation.type === "rotate") {
		const page = doc.getPage(index);
		page.setRotation(degrees((page.getRotation().angle + 90) % 360));
	} else if (operation.type === "delete") {
		if (doc.getPageCount() === 1) throw new Error("至少需要保留一页。");
		doc.removePage(index);
	} else {
		const target = (operation.target ?? 0) - 1;
		if (!Number.isInteger(target) || target < 0 || target >= doc.getPageCount())
			throw new Error("目标页码超出范围。");
		const page = doc.getPage(index);
		doc.removePage(index);
		doc.insertPage(target, page);
	}
	return doc.save({ updateFieldAppearances: false });
}
export async function addPdfSignature(
	bytes: Uint8Array,
	png: Uint8Array,
	page: number,
	box: { x: number; y: number; width: number; height: number },
): Promise<Uint8Array> {
	const doc = await PDFDocument.load(bytes.slice(), { updateMetadata: false });
	if (!Number.isInteger(page) || page < 1 || page > doc.getPageCount())
		throw new Error("页码超出范围。");
	if (
		![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
		box.x < 0 ||
		box.y < 0 ||
		box.width <= 0 ||
		box.height <= 0 ||
		box.x + box.width > 1 ||
		box.y + box.height > 1
	)
		throw new Error("签名位置必须在页面内。");
	const target = doc.getPage(page - 1),
		image = await doc.embedPng(png);
	const rotation = ((target.getRotation().angle % 360) + 360) % 360;
	const { width: rawWidth, height: rawHeight } = target.getSize();
	const width = rotation === 90 || rotation === 270 ? rawHeight : rawWidth;
	const height = rotation === 90 || rotation === 270 ? rawWidth : rawHeight;
	const left = box.x * width,
		bottom = (1 - box.y - box.height) * height;
	const positions: Record<number, { x: number; y: number }> = {
		0: { x: left, y: bottom },
		90: { x: rawWidth - bottom, y: left },
		180: { x: rawWidth - left, y: rawHeight - bottom },
		270: { x: bottom, y: rawHeight - left },
	};
	target.drawImage(image, {
		...positions[rotation],
		width: box.width * width,
		height: box.height * height,
		rotate: degrees(rotation),
	});
	return doc.save({ updateFieldAppearances: false });
}
export async function imageToPdf(blob: Blob, mime: string): Promise<Blob> {
	const doc = await PDFDocument.create(),
		bytes = await blob.arrayBuffer();
	const image = mime === "image/jpeg" ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
	const page = doc.addPage([image.width, image.height]);
	page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
	return new Blob([(await doc.save()) as BlobPart], { type: "application/pdf" });
}
