import { FormatsKernel, loadFormatsKernel } from "@cubexp/kernels";
export type PdfPageOperation = {
	type: "rotate" | "delete" | "move";
	page: number;
	target?: number;
};
/** Detached mutations preserve the existing host revision/history contract. */
export async function changePdfPages(
	bytes: Uint8Array,
	operation: PdfPageOperation,
): Promise<Uint8Array> {
	const input = new Uint8Array(bytes);
	await loadFormatsKernel();
	const core = new FormatsKernel("pdf");
	try {
		core.open(input);
		core.request({ op: "pageOperation", operation });
		return core.save();
	} finally {
		core.close();
	}
}
export async function addPdfSignature(
	bytes: Uint8Array,
	png: Uint8Array,
	page: number,
	box: { x: number; y: number; width: number; height: number },
): Promise<Uint8Array> {
	const input = new Uint8Array(bytes),
		signature = new Uint8Array(png);
	await loadFormatsKernel();
	const core = new FormatsKernel("pdf");
	try {
		core.open(input);
		core.setPdfImage(signature);
		core.request({ op: "signature", page, box });
		return core.save();
	} finally {
		core.close();
	}
}
export async function imageToPdf(blob: Blob, mime: string): Promise<Blob> {
	await loadFormatsKernel();
	const core = new FormatsKernel("pdf", "utf-8", { imageMime: mime });
	try {
		core.open(new Uint8Array(await blob.arrayBuffer()));
		return new Blob([core.save()], { type: "application/pdf" });
	} finally {
		core.close();
	}
}
