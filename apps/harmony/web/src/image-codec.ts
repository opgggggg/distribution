import { FormatsKernel, loadFormatsKernel } from "@cubexp/kernels";
/** The full TIFF remains the source document; only the selected page is decoded. */
export async function decodeTiffPage(
	input: ArrayBuffer,
	page = 0,
): Promise<{ blob: Blob; pages: number; width: number; height: number }> {
	const bytes = new Uint8Array(input.slice(0));
	await loadFormatsKernel();
	const core = new FormatsKernel("ofd");
	try {
		core.request({ op: "initParts" });
		core.setPart("image", bytes);
		const metadata = core.request<{ pages: number; width: number; height: number }>({
			op: "decodeTiffPage",
			path: "image",
			page,
		});
		return { ...metadata, blob: new Blob([core.save()], { type: "image/png" }) };
	} finally {
		core.close();
	}
}
