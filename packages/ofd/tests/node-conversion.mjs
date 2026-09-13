import { OFD_ARTIFACT_PLUGINS } from "../dist/office.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readOfdDocument, convertDocument, exportDocument, writeImageOfd } from "../dist/index.js";
import { convertDocumentNode } from "../dist/node.js";
import { ofd } from "./fixtures.mjs";
import { PDFDocument } from "pdf-lib";
test("OFD to PNG/JPEG/PDF uses actual rendered pages", async () => {
	for (const format of ["png", "jpeg", "pdf"]) {
		const result = await convertDocumentNode(ofd(), "ofd", format, { scale: 0.5 });
		assert.equal(result.files.length, format === "pdf" ? 1 : 2);
		const bytes = new Uint8Array(await result.files[0].blob.arrayBuffer());
		if (format === "pdf") {
			const pdf = await PDFDocument.load(bytes);
			assert.equal(pdf.getPageCount(), 2);
		} else assert.equal(bytes[0], format === "png" ? 137 : 255);
	}
});
test("PDF → OFD page selection and dimensions", async () => {
	const pdf = await PDFDocument.create();
	pdf.addPage([300, 200]);
	pdf.addPage([400, 500]);
	const result = await convertDocumentNode(new Blob([await pdf.save()]), "pdf", "ofd", {
		page: 1,
		scale: 0.5,
	});
	const doc = await readOfdDocument(result.files[0].blob);
	assert.equal(doc.pages.length, 1);
	assert.ok(Math.abs(doc.pages[0].width - (400 * 96) / 72) < 0.01);
});
test("native registry accepts JPEG extension aliases and MIME-only inputs", async () => {
	const { createOfdNodeConverters } = await import("../dist/office-node.js");
	const { ArtifactConversionRegistry } = await import("@yaochn/als-office-editor-core");
	const registry = new ArtifactConversionRegistry(createOfdNodeConverters(), {
		environment: "headless",
	});
	const jpeg = (await convertDocumentNode(ofd(), "ofd", "jpeg", { page: 0, scale: 0.5 })).files[0]
		.blob;
	for (const metadata of [{ fileName: "image.jpeg" }, { mimeType: "image/jpeg" }]) {
		const result = await registry.convert({ kind: "bytes", blob: jpeg, ...metadata }, "ofd");
		assert.equal((await readOfdDocument(result)).pages.length, 1);
	}
});
