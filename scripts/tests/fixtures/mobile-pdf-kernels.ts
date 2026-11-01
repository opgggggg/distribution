import { writePdfImages } from "@cubexp/kernels";
import { PDFDocument, PDFName } from "pdf-lib";
import {
	changePdfPages,
	addPdfSignature,
	imageToPdf,
} from "../../../apps/harmony/web/src/mobile/pdf-operations";
import fixtures from "../../../packages/kernels/tests/fixtures/mobile-pdf.json";
const bytes = (value?: string) => {
	if (!value) throw Error("Missing PDF test input");
	return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
};
async function structure(data: Uint8Array) {
	const doc = await PDFDocument.load(data, { updateMetadata: false });
	return {
		title: doc.getTitle(),
		author: doc.getAuthor(),
		fields: doc
			.getForm()
			.getFields()
			.map((field) => ({
				name: field.getName(),
				value: "getText" in field ? (field.getText as () => string)() : undefined,
			})),
		pages: doc.getPages().map((page) => ({
			width: page.getWidth(),
			height: page.getHeight(),
			rotation: page.getRotation().angle,
			annotations: page.node.Annots()?.size() ?? 0,
		})),
		opaque: doc.catalog.get(PDFName.of("CubeOpaque"))?.toString(),
	};
}
export async function verifyMobilePdf() {
	for (const item of fixtures.cases) {
		let output: Uint8Array;
		if (item.kind === "images") {
			output = await writePdfImages(
				item.pages!.map((page) => ({
					...page,
					mime: page.mime as "image/png" | "image/jpeg",
					bytes: bytes(page.image),
				})),
			);
		} else if (item.kind === "image") {
			const pdf = await imageToPdf(new Blob([bytes(item.image)]), item.mime!);
			if (pdf.type !== "application/pdf") throw Error("PDF MIME changed");
			output = new Uint8Array(await pdf.arrayBuffer());
		} else if (item.kind === "pages") {
			output = await changePdfPages(
				bytes(item.input),
				item.operation as Parameters<typeof changePdfPages>[1],
			);
		} else
			output = await addPdfSignature(
				bytes(item.input),
				bytes(item.image),
				item.page!,
				item.box!,
			);
		const actual = await structure(output);
		let expected;
		if (item.name === "inherited-move-1") {
			expected = await structure(bytes(item.input));
			expected.pages.push(expected.pages.shift()!);
		} else expected = await structure(bytes(item.expected));
		if (JSON.stringify(actual) !== JSON.stringify(expected))
			throw Error(`PDF structure changed: ${item.name}`);
	}
	const one = fixtures.cases.find((item) => item.name === "signature-0")!;
	let rejected = false;
	try {
		await changePdfPages(bytes(one.input), { type: "delete", page: 1 });
	} catch {
		rejected = true;
	}
	if (!rejected) throw Error("Invalid page deletion accepted");
	const recovered = await changePdfPages(bytes(one.input), { type: "rotate", page: 1 });
	if ((await structure(recovered)).pages[0].rotation !== 90)
		throw Error("PDF operation did not recover");
	const mutable = bytes(one.input),
		pending = changePdfPages(mutable, { type: "rotate", page: 1 });
	mutable.fill(0);
	if ((await structure(await pending)).pages[0].rotation !== 90)
		throw Error("PDF source was not snapshotted before kernel loading");
	const source = bytes(one.input),
		ink = bytes(one.image),
		signing = addPdfSignature(source, ink, one.page!, one.box!);
	source.fill(0);
	ink.fill(0);
	if ((await structure(await signing)).pages.length !== 1)
		throw Error("Signature inputs were not snapshotted before kernel loading");

	return true;
}
