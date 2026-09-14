import { escapeXml as e, zip, rasterMime } from "./archive.js";
import { OFD_MIME_TYPES, blob, type ConversionFormat, type DocumentPage } from "./types.js";
export function writeDocx(pages: DocumentPage[]): Blob {
	const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
	const body = pages
		.map(
			(page, i) =>
				(i ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : "") +
				page.text
					.split("\n")
					.map(
						(line) =>
							`<w:p><w:r><w:t xml:space="preserve">${e(line)}</w:t></w:r></w:p>`,
					)
					.join(""),
		)
		.join("");
	return blob(
		zip({
			"[Content_Types].xml":
				'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
			"_rels/.rels":
				'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
			"word/document.xml": `<w:document xmlns:w="${ns}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`,
		}),
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	);
}
export interface OfdImagePage {
	bytes: Uint8Array;
	width: number;
	height: number;
}
export function writeImageOfd(pages: OfdImagePage[]): Blob {
	if (!pages.length) throw new Error("OFD requires at least one page.");
	if (pages.length > 1000) throw new RangeError("Too many OFD pages.");
	const ns = 'xmlns:ofd="http://www.ofdspec.org/2016"';
	const parts: Record<string, string | Uint8Array> = {};
	let resources = "",
		refs = "";
	pages.forEach((page, i) => {
		const mime = rasterMime(page.bytes);
		if (!mime) throw new Error("OFD image pages require PNG or JPEG bytes.");
		if (!(
			page.width > 0 &&
			page.height > 0 &&
			page.width < (10000 * 96) / 25.4 &&
			page.height < (10000 * 96) / 25.4
		))
			throw new RangeError("Invalid OFD image dimensions.");
		const width = (page.width * 25.4) / 96,
			height = (page.height * 25.4) / 96,
			ext = mime === "image/png" ? "png" : "jpg",
			id = i * 3 + 1;
		parts[`Doc_0/Res/image_${i}.${ext}`] = page.bytes;
		resources += `<ofd:MultiMedia ID="${id}" Type="Image" Format="${mime === "image/png" ? "PNG" : "JPEG"}"><ofd:MediaFile>image_${i}.${ext}</ofd:MediaFile></ofd:MultiMedia>`;
		refs += `<ofd:Page ID="${id + 1}" BaseLoc="Pages/Page_${i}/Content.xml"/>`;
		parts[`Doc_0/Pages/Page_${i}/Content.xml`] =
			`<ofd:Page ${ns}><ofd:Area><ofd:PhysicalBox>0 0 ${width} ${height}</ofd:PhysicalBox></ofd:Area><ofd:Content><ofd:Layer ID="${100000 + i}"><ofd:ImageObject ID="${id + 2}" ResourceID="${id}" Boundary="0 0 ${width} ${height}" CTM="${width} 0 0 ${height} 0 0"/></ofd:Layer></ofd:Content></ofd:Page>`;
	});
	parts["OFD.xml"] =
		`<ofd:OFD ${ns} Version="1.0" DocType="OFD"><ofd:DocBody><ofd:DocInfo><ofd:DocID>${crypto.randomUUID().replace(/-/g, "")}</ofd:DocID></ofd:DocInfo><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>`;
	parts["Doc_0/Document.xml"] =
		`<ofd:Document ${ns}><ofd:CommonData><ofd:MaxUnitID>${100000 + pages.length}</ofd:MaxUnitID><ofd:PageArea><ofd:PhysicalBox>0 0 ${(pages[0].width * 25.4) / 96} ${(pages[0].height * 25.4) / 96}</ofd:PhysicalBox></ofd:PageArea><ofd:DocumentRes>DocumentRes.xml</ofd:DocumentRes></ofd:CommonData><ofd:Pages>${refs}</ofd:Pages></ofd:Document>`;
	parts["Doc_0/DocumentRes.xml"] =
		`<ofd:Res ${ns} BaseLoc="Res"><ofd:MultiMedias>${resources}</ofd:MultiMedias></ofd:Res>`;
	return blob(zip(parts), OFD_MIME_TYPES.ofd);
}
export function extension(format: ConversionFormat): string {
	return format === "jpeg" ? "jpg" : format;
}
