import { OFFICE_WASM_URLS } from "../../../profiles/cubeoffice/wasm-assets";
import { transformMobileImage } from "../../../apps/harmony/web/src/mobile/image-kernel";
import { createMarkdownEditor } from "@yaochn/als-office-markdown";
import { PDFDocument } from "pdf-lib";
import { PdfKernelDocument, compilePdfKernel } from "@yaochn/als-office-pdf";
import { editPdfDocument, readPdfEditingSnapshot } from "@yaochn/als-office-pdf/processing";

export async function verifyKernels() {
	const assets = [];
	for (const [name, url] of Object.entries(OFFICE_WASM_URLS)) {
		const response = await fetch(url);
		if (!response.ok) throw Error(`${name}: ${response.status}`);
		const bytes = await response.arrayBuffer();
		await WebAssembly.compile(bytes);
		assets.push({ name, bytes: bytes.byteLength });
	}
	const markdown = createMarkdownEditor({ content: "# Native\n\nOriginal" });
	await markdown.ready();
	markdown.apply([{ type: "setContent", content: "# Native\n\nChanged" }]);
	if (!markdown.getDocument().content.includes("Changed"))
		throw Error("Markdown native edit failed");
	markdown.undo();
	if (!markdown.getDocument().content.includes("Original"))
		throw Error("Markdown native undo failed");
	markdown.redo();
	if (!markdown.getDocument().content.includes("Changed"))
		throw Error("Markdown native redo failed");
	markdown.dispose();
	const c = document.createElement("canvas");
	c.width = 80;
	c.height = 40;
	const context = c.getContext("2d")!;
	context.fillStyle = "#e02030";
	context.fillRect(0, 0, 40, 40);
	const source = await new Promise<Blob>((resolve) => c.toBlob((blob) => resolve(blob!)));
	const images = [];
	for (const commands of [
		[{ type: "image.transform", rotation: 90 }],
		[{ type: "image.crop.set", crop: { left: 0, top: 0, right: 0.5, bottom: 0 } }],
		[{ type: "output.settings.set", maxDimension: 20 }],
	] as const) {
		const result = await transformMobileImage(source, commands);
		if (result.kernel !== "wasm") throw Error("Image fell back to JavaScript");
		const image = await createImageBitmap(result.blob);
		images.push([image.width, image.height]);
		image.close();
	}
	const pdf = await PDFDocument.create();
	const page = pdf.addPage([200, 200]),
		field = pdf.getForm().createTextField("name");
	field.setText("Before");
	field.addToPage(page, { x: 20, y: 50, width: 120, height: 30 });
	const bytes = await pdf.save(),
		loaded = await PdfKernelDocument.open(await compilePdfKernel(), bytes);
	if (!loaded.pageCount) throw Error("Rust PDF did not load pages");
	loaded.dispose();
	const edited = await editPdfDocument(bytes, { fields: [{ name: "name", value: "After" }] });
	const state = await readPdfEditingSnapshot(new Uint8Array(await edited.arrayBuffer()));
	if (state.fields[0].value !== "After") throw Error("Rust PDF write did not persist");
	return { assets, images, markdown: "wasm", pdf: "wasm" };
}
