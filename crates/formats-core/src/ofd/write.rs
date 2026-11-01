//! Stateless compatibility writers, shared by native Rust and the small synchronous WASM entry.
use crate::{error, Result};
use std::{
    collections::BTreeMap,
    io::{Cursor, Write},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};
pub const MAX_BYTES: usize = 128 * 1024 * 1024;
pub fn escape(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '&' => "&amp;".into(),
            '<' => "&lt;".into(),
            '>' => "&gt;".into(),
            '"' => "&quot;".into(),
            '\'' => "&apos;".into(),
            '\u{0}'..='\u{8}' | '\u{b}' | '\u{c}' | '\u{e}'..='\u{1f}' => "\u{fffd}".into(),
            _ => c.to_string(),
        })
        .collect()
}
pub fn zip(parts: BTreeMap<String, Vec<u8>>) -> Result<Vec<u8>> {
    let size = parts
        .values()
        .try_fold(0_usize, |n, b| n.checked_add(b.len()))
        .ok_or_else(|| error("LimitExceeded", "Writer size overflow."))?;
    if size > MAX_BYTES {
        return Err(error(
            "LimitExceeded",
            "Writer output exceeds the archive budget.",
        ));
    }
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    for (path, data) in parts {
        zip.start_file(
            path,
            SimpleFileOptions::default().compression_method(CompressionMethod::Stored),
        )
        .map_err(|e| error("InvalidArchive", e.to_string()))?;
        zip.write_all(&data)
            .map_err(|e| error("InvalidArchive", e.to_string()))?;
    }
    Ok(zip
        .finish()
        .map_err(|e| error("InvalidArchive", e.to_string()))?
        .into_inner())
}
pub struct ImagePage<'a> {
    pub bytes: &'a [u8],
    pub width: f64,
    pub height: f64,
}
pub fn image_ofd(pages: &[ImagePage<'_>], id: &str) -> Result<Vec<u8>> {
    if pages.is_empty() {
        return Err(error("InvalidArgument", "OFD requires at least one page."));
    }
    if pages.len() > 1000 {
        return Err(error("LimitExceeded", "Too many OFD pages."));
    }
    let ns = "xmlns:ofd=\"http://www.ofdspec.org/2016\"";
    let mut parts = BTreeMap::new();
    let mut resources = String::new();
    let mut refs = String::new();
    let mut total = 0_usize;
    for (i, page) in pages.iter().enumerate() {
        let (ext, format) = if page.bytes.starts_with(&[137, 80, 78, 71]) {
            ("png", "PNG")
        } else if page.bytes.starts_with(&[255, 216, 255]) {
            ("jpg", "JPEG")
        } else {
            return Err(error(
                "InvalidArgument",
                "OFD image pages require PNG or JPEG bytes.",
            ));
        };
        if !(page.width > 0.0
            && page.height > 0.0
            && page.width < 10000.0 * 96.0 / 25.4
            && page.height < 10000.0 * 96.0 / 25.4)
        {
            return Err(error("LimitExceeded", "Invalid OFD image dimensions."));
        }
        total = total
            .checked_add(page.bytes.len())
            .ok_or_else(|| error("LimitExceeded", "Writer size overflow."))?;
        if total > MAX_BYTES {
            return Err(error(
                "LimitExceeded",
                "Writer output exceeds the archive budget.",
            ));
        }
        let w = page.width * 25.4 / 96.0;
        let h = page.height * 25.4 / 96.0;
        let unit = i * 3 + 1;
        parts.insert(format!("Doc_0/Res/image_{i}.{ext}"), page.bytes.to_vec());
        resources.push_str(&format!("<ofd:MultiMedia ID=\"{unit}\" Type=\"Image\" Format=\"{format}\"><ofd:MediaFile>image_{i}.{ext}</ofd:MediaFile></ofd:MultiMedia>"));
        refs.push_str(&format!(
            "<ofd:Page ID=\"{}\" BaseLoc=\"Pages/Page_{i}/Content.xml\"/>",
            unit + 1
        ));
        parts.insert(format!("Doc_0/Pages/Page_{i}/Content.xml"),format!("<ofd:Page {ns}><ofd:Area><ofd:PhysicalBox>0 0 {w} {h}</ofd:PhysicalBox></ofd:Area><ofd:Content><ofd:Layer ID=\"{}\"><ofd:ImageObject ID=\"{}\" ResourceID=\"{unit}\" Boundary=\"0 0 {w} {h}\" CTM=\"{w} 0 0 {h} 0 0\"/></ofd:Layer></ofd:Content></ofd:Page>",100000+i,unit+2).into_bytes());
    }
    parts.insert("OFD.xml".into(),format!("<ofd:OFD {ns} Version=\"1.0\" DocType=\"OFD\"><ofd:DocBody><ofd:DocInfo><ofd:DocID>{}</ofd:DocID></ofd:DocInfo><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>",escape(id)).into_bytes());
    parts.insert("Doc_0/Document.xml".into(),format!("<ofd:Document {ns}><ofd:CommonData><ofd:MaxUnitID>{}</ofd:MaxUnitID><ofd:PageArea><ofd:PhysicalBox>0 0 {} {}</ofd:PhysicalBox></ofd:PageArea><ofd:DocumentRes>DocumentRes.xml</ofd:DocumentRes></ofd:CommonData><ofd:Pages>{refs}</ofd:Pages></ofd:Document>",100000+pages.len(),pages[0].width*25.4/96.0,pages[0].height*25.4/96.0).into_bytes());
    parts.insert("Doc_0/DocumentRes.xml".into(),format!("<ofd:Res {ns} BaseLoc=\"Res\"><ofd:MultiMedias>{resources}</ofd:MultiMedias></ofd:Res>").into_bytes());
    zip(parts)
}
pub fn docx(pages: &[String]) -> Result<Vec<u8>> {
    if pages
        .iter()
        .try_fold(0_usize, |n, t| n.checked_add(t.len()))
        .unwrap_or(usize::MAX)
        > MAX_BYTES
    {
        return Err(error(
            "LimitExceeded",
            "Text writer exceeds its size budget.",
        ));
    }
    let mut body = String::new();
    for (i, page) in pages.iter().enumerate() {
        if i > 0 {
            body.push_str("<w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>");
        }
        for line in page.split('\n') {
            let escaped_len = line
                .chars()
                .try_fold(0_usize, |n, c| {
                    n.checked_add(match c {
                        '&' => 5,
                        '<' | '>' => 4,
                        '\'' | '"' => 6,
                        '\u{0}'..='\u{8}' | '\u{b}' | '\u{c}' | '\u{e}'..='\u{1f}' => 3,
                        _ => c.len_utf8(),
                    })
                })
                .unwrap_or(usize::MAX);
            if escaped_len > MAX_BYTES.saturating_sub(body.len()).saturating_sub(128) {
                return Err(error(
                    "LimitExceeded",
                    "Text writer exceeds its size budget.",
                ));
            }
            body.push_str(&format!(
                "<w:p><w:r><w:t xml:space=\"preserve\">{}</w:t></w:r></w:p>",
                escape(line)
            ));
        }
    }
    zip(BTreeMap::from([
        ("[Content_Types].xml".into(),b"<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>".to_vec()),
        ("_rels/.rels".into(),b"<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>".to_vec()),
        ("word/document.xml".into(),format!("<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>{body}<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/></w:sectPr></w:body></w:document>").into_bytes()),
    ]))
}
