use super::{allocate, dict, editable, inherited, invalid, map, page_index, save};
use crate::{error, Result};
use flate2::{write::ZlibEncoder, Compression};
use pdf_core::{
    object::{File, Object, Ref},
    Document,
};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    io::{Cursor, Write},
};
fn number(value: f64) -> Object {
    Object::Number(value)
}
fn array(values: &[f64]) -> Object {
    Object::Array(values.iter().copied().map(number).collect())
}
fn deflate(bytes: &[u8]) -> Result<Vec<u8>> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(bytes)
        .map_err(|e| error("InvalidImage", e.to_string()))?;
    encoder
        .finish()
        .map_err(|e| error("InvalidImage", e.to_string()))
}
pub(super) struct Image {
    width: u32,
    height: u32,
    bits: u8,
    channels: u8,
    data: Vec<u8>,
    alpha: Option<Vec<u8>>,
    jpeg: bool,
}
impl Image {
    pub fn read(bytes: &[u8], mime: &str) -> Result<Self> {
        if bytes.len() > 128 * 1024 * 1024 {
            return Err(error("LimitExceeded", "Image exceeds its byte budget."));
        }
        if mime == "image/jpeg" {
            if bytes.get(..2) != Some(&[255, 216]) {
                return Err(invalid("Invalid JPEG signature."));
            }
            let mut p = 2;
            while p + 4 <= bytes.len() {
                if bytes[p] != 255 {
                    return Err(invalid("Invalid JPEG marker."));
                }
                while bytes.get(p) == Some(&255) {
                    p += 1;
                }
                let marker = *bytes
                    .get(p)
                    .ok_or_else(|| invalid("Truncated JPEG marker."))?;
                p += 1;
                if marker == 217 || marker == 218 {
                    break;
                }
                if (208..=215).contains(&marker) || marker == 1 {
                    continue;
                }
                let len = bytes
                    .get(p..p + 2)
                    .map(|b| u16::from_be_bytes([b[0], b[1]]) as usize)
                    .ok_or_else(|| invalid("Truncated JPEG segment."))?;
                let segment = bytes
                    .get(
                        p..p.checked_add(len)
                            .ok_or_else(|| invalid("JPEG offset overflow."))?,
                    )
                    .ok_or_else(|| invalid("Truncated JPEG segment."))?;
                if len < 2 {
                    return Err(invalid("Invalid JPEG segment length."));
                }
                if [
                    192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
                ]
                .contains(&marker)
                {
                    if segment.len() < 8 {
                        return Err(invalid("Truncated JPEG frame."));
                    }
                    let (height, width) = (
                        u16::from_be_bytes([segment[3], segment[4]]) as u32,
                        u16::from_be_bytes([segment[5], segment[6]]) as u32,
                    );
                    dimensions(width, height)?;
                    let channels = segment[7];
                    if ![1, 3, 4].contains(&channels) {
                        return Err(invalid("Unsupported JPEG channel count."));
                    }
                    return Ok(Self {
                        width,
                        height,
                        bits: segment[2],
                        channels,
                        data: bytes.to_vec(),
                        alpha: None,
                        jpeg: true,
                    });
                }
                p += len;
            }
            return Err(invalid("JPEG has no supported frame."));
        }
        let mut decoder = png::Decoder::new(Cursor::new(bytes));
        decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
        decoder.set_limits(png::Limits {
            bytes: 320 * 1024 * 1024,
        });
        let mut reader = decoder
            .read_info()
            .map_err(|e| error("InvalidImage", e.to_string()))?;
        dimensions(reader.info().width, reader.info().height)?;
        let mut raw = vec![0; reader.output_buffer_size()];
        let info = reader
            .next_frame(&mut raw)
            .map_err(|e| error("InvalidImage", e.to_string()))?;
        raw.truncate(info.buffer_size());
        let channels = match info.color_type {
            png::ColorType::Grayscale => 1,
            png::ColorType::GrayscaleAlpha => 2,
            png::ColorType::Rgb => 3,
            png::ColorType::Rgba => 4,
            _ => return Err(invalid("Unsupported PNG color type.")),
        };
        let mut rgb = Vec::with_capacity(info.width as usize * info.height as usize * 3);
        let mut alpha = Vec::with_capacity(info.width as usize * info.height as usize);
        for pixel in raw.chunks_exact(channels) {
            if channels <= 2 {
                rgb.extend_from_slice(&[pixel[0]; 3]);
            } else {
                rgb.extend_from_slice(&pixel[..3]);
            }
            alpha.push(if channels == 2 {
                pixel[1]
            } else if channels == 4 {
                pixel[3]
            } else {
                255
            });
        }
        Ok(Self {
            width: info.width,
            height: info.height,
            bits: 8,
            channels: 3,
            data: deflate(&rgb)?,
            alpha: if alpha.iter().any(|a| *a != 255) {
                Some(deflate(&alpha)?)
            } else {
                None
            },
            jpeg: false,
        })
    }
    fn embed(&self, file: &mut File) -> Result<Ref> {
        let mut d = BTreeMap::from([
            ("Type".into(), Object::Name("XObject".into())),
            ("Subtype".into(), Object::Name("Image".into())),
            ("Width".into(), number(self.width as f64)),
            ("Height".into(), number(self.height as f64)),
            ("BitsPerComponent".into(), number(self.bits as f64)),
            (
                "ColorSpace".into(),
                Object::Name(
                    match self.channels {
                        1 => "DeviceGray",
                        4 => "DeviceCMYK",
                        _ => "DeviceRGB",
                    }
                    .into(),
                ),
            ),
            (
                "Filter".into(),
                Object::Name(
                    if self.jpeg {
                        "DCTDecode"
                    } else {
                        "FlateDecode"
                    }
                    .into(),
                ),
            ),
        ]);
        if self.channels == 4 {
            d.insert("Decode".into(), array(&[1., 0., 1., 0., 1., 0., 1., 0.]));
        }
        if let Some(alpha) = &self.alpha {
            let mask = allocate(
                file,
                Object::Stream {
                    dict: BTreeMap::from([
                        ("Type".into(), Object::Name("XObject".into())),
                        ("Subtype".into(), Object::Name("Image".into())),
                        ("Width".into(), number(self.width as f64)),
                        ("Height".into(), number(self.height as f64)),
                        ("BitsPerComponent".into(), number(8.)),
                        ("ColorSpace".into(), Object::Name("DeviceGray".into())),
                        ("Filter".into(), Object::Name("FlateDecode".into())),
                    ]),
                    data: alpha.clone(),
                },
            )?;
            d.insert("SMask".into(), Object::Reference(mask));
        }
        allocate(
            file,
            Object::Stream {
                dict: d,
                data: self.data.clone(),
            },
        )
    }
}
fn dimensions(w: u32, h: u32) -> Result<()> {
    if w == 0 || h == 0 || w > 20000 || h > 20000 || w as u64 * h as u64 > 40_000_000 {
        Err(error(
            "LimitExceeded",
            "Image dimensions exceed the raster budget.",
        ))
    } else {
        Ok(())
    }
}
fn content(file: &mut File, text: String) -> Result<Ref> {
    allocate(
        file,
        Object::Stream {
            dict: BTreeMap::from([("Filter".into(), Object::Name("FlateDecode".into()))]),
            data: deflate(text.as_bytes())?,
        },
    )
}
fn blank() -> Result<File> {
    let mut bytes = b"%PDF-1.7\n".to_vec();
    let mut offsets = vec![0];
    for (i, object) in [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] >>",
    ]
    .iter()
    .enumerate()
    {
        offsets.push(bytes.len());
        bytes.extend_from_slice(format!("{} 0 obj\n{object}\nendobj\n", i + 1).as_bytes());
    }
    let start = bytes.len();
    bytes.extend_from_slice(b"xref\n0 4\n0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        bytes.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    bytes.extend_from_slice(
        format!("trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n").as_bytes(),
    );
    File::open(&bytes).map_err(map)
}
pub(super) fn document(bytes: &[u8], mime: &str) -> Result<Vec<u8>> {
    let image = Image::read(bytes, mime)?;
    let mut file = blank()?;
    let object = image.embed(&mut file)?;
    let (w, h) = (image.width as f64, image.height as f64);
    let stream = content(&mut file, format!("q\n{w} 0 0 {h} 0 0 cm\n/Image0 Do\nQ\n"))?;
    file.set(
        (3, 0),
        Object::Dict(BTreeMap::from([
            ("Type".into(), Object::Name("Page".into())),
            ("Parent".into(), Object::Reference((2, 0))),
            ("MediaBox".into(), array(&[0., 0., w, h])),
            (
                "Resources".into(),
                Object::Dict(BTreeMap::from([(
                    "XObject".into(),
                    Object::Dict(BTreeMap::from([(
                        "Image0".into(),
                        Object::Reference(object),
                    )])),
                )])),
            ),
            ("Contents".into(), Object::Reference(stream)),
        ])),
    );
    save(file)
}
pub(super) fn signature(document: &Document, image: &Image, r: &Value) -> Result<Vec<u8>> {
    editable(&document.file)?;
    let index = page_index(&r["page"], document.pages.len(), "页码超出范围。")?;
    let values =
        ["x", "y", "width", "height"].map(|key| r["box"][key].as_f64().unwrap_or(f64::NAN));
    let [x, y, width, height] = values;
    if !values.iter().all(|v| v.is_finite())
        || x < 0.
        || y < 0.
        || width <= 0.
        || height <= 0.
        || x + width > 1.
        || y + height > 1.
    {
        return Err(invalid("签名位置必须在页面内。"));
    }
    let page = &document.pages[index];
    let reference = page.reference.ok_or_else(|| {
        error(
            "NotSupported",
            "Direct PDF page dictionaries are not supported for signatures.",
        )
    })?;
    let mut file = document.file.clone();
    let mut d = dict(&page.object)?;
    let media = file
        .resolve(&inherited(&file, &page.object, "MediaBox")?)
        .array()
        .to_vec();
    if media.len() != 4 {
        return Err(invalid("Invalid PDF MediaBox."));
    }
    let (raw_w, raw_h) = (
        media[2].number() - media[0].number(),
        media[3].number() - media[1].number(),
    );
    let rotation = file
        .resolve(&inherited(&file, &page.object, "Rotate")?)
        .number()
        .rem_euclid(360.);
    let swapped = rotation == 90. || rotation == 270.;
    let (w, h) = if swapped {
        (raw_h, raw_w)
    } else {
        (raw_w, raw_h)
    };
    let (left, bottom) = (x * w, (1. - y - height) * h);
    let (tx, ty) = if rotation == 90. {
        (raw_w - bottom, left)
    } else if rotation == 180. {
        (raw_w - left, raw_h - bottom)
    } else if rotation == 270. {
        (bottom, raw_h - left)
    } else if rotation == 0. {
        (left, bottom)
    } else {
        return Err(invalid("Invalid PDF page rotation."));
    };
    let mut resources =
        dict(file.resolve(&inherited(&file, &page.object, "Resources")?)).unwrap_or_default();
    let mut objects = match resources.get("XObject") {
        Some(value) => dict(file.resolve(value))?,
        None => BTreeMap::new(),
    };
    let mut n = 0;
    let name = loop {
        let candidate = format!("CubeSignature{n}");
        if !objects.contains_key(&candidate) {
            break candidate;
        }
        n += 1;
    };
    objects.insert(name.clone(), Object::Reference(image.embed(&mut file)?));
    resources.insert("XObject".into(), Object::Dict(objects));
    d.insert("Resources".into(), Object::Dict(resources));
    let angle = rotation.to_radians();
    let (c, s) = (angle.cos(), angle.sin());
    let (dw, dh) = (width * w, height * h);
    let stream = content(
        &mut file,
        format!(
            "q\n{c} {s} {} {c} {tx} {ty} cm\n{dw} 0 0 {dh} 0 0 cm\n/{name} Do\nQ\n",
            -s
        ),
    )?;
    let old = page.object.get("Contents");
    let mut contents = if matches!(old, Object::Null) {
        Vec::new()
    } else {
        let old = if let Object::Array(a) = file.resolve(old) {
            a.clone()
        } else {
            vec![old.clone()]
        };
        let before = content(&mut file, "q\n".into())?;
        let after = content(&mut file, "Q\n".into())?;
        let mut list = vec![Object::Reference(before)];
        list.extend(old);
        list.push(Object::Reference(after));
        list
    };
    contents.push(Object::Reference(stream));
    d.insert("Contents".into(), Object::Array(contents));
    file.set(reference, Object::Dict(d));
    save(file)
}

/// Batch raster-PDF serialization. All images share one object graph and one
/// final write; processing a long document does not reopen every prior page.
pub(super) fn pages_frame(bytes: &[u8]) -> Result<Vec<u8>> {
    if bytes.len() < 4 || bytes.len() > 128 * 1024 * 1024 {
        return Err(error("LimitExceeded", "Invalid PDF image frame size."));
    }
    let size = u32::from_le_bytes(bytes[..4].try_into().unwrap()) as usize;
    let end = size
        .checked_add(4)
        .filter(|n| *n <= bytes.len() && *n <= 1024 * 1024)
        .ok_or_else(|| invalid("Invalid PDF image frame header."))?;
    let config: Value =
        serde_json::from_slice(&bytes[4..end]).map_err(|e| invalid(&e.to_string()))?;
    let pages = config["pages"]
        .as_array()
        .filter(|p| p.len() <= 1000)
        .ok_or_else(|| invalid("Select at most 1000 image pages."))?;
    let mut file = blank()?;
    // pdf-lib's empty writer added one default A4 page. Retain that behavior
    // for OFD packages with no selected pages, while validating the raw frame.
    if pages.is_empty() {
        if end != bytes.len() {
            return Err(invalid("Unexpected trailing image bytes."));
        }
        let mut page = dict(file.resolve(&Object::Reference((3, 0))))?;
        page.insert("MediaBox".into(), array(&[0., 0., 595.28, 841.89]));
        file.set((3, 0), Object::Dict(page));
        return save(file);
    }
    file.objects.remove(&(3, 0));
    let mut offset = end;
    let mut kids = Vec::new();
    for page in pages {
        let length = page["length"]
            .as_u64()
            .and_then(|n| usize::try_from(n).ok())
            .ok_or_else(|| invalid("Invalid image byte length."))?;
        let next = offset
            .checked_add(length)
            .filter(|n| *n <= bytes.len())
            .ok_or_else(|| invalid("Truncated PDF image frame."))?;
        let image = Image::read(
            &bytes[offset..next],
            page["mime"].as_str().unwrap_or("image/png"),
        )?;
        offset = next;
        let (w, h) = (
            page["width"].as_f64().unwrap_or(f64::NAN),
            page["height"].as_f64().unwrap_or(f64::NAN),
        );
        if !w.is_finite()
            || !h.is_finite()
            || w <= 0.
            || h <= 0.
            || w > 1_000_000.
            || h > 1_000_000.
        {
            return Err(invalid("Invalid PDF page dimensions."));
        }
        let image = image.embed(&mut file)?;
        let stream = content(&mut file, format!("q\n{w} 0 0 {h} 0 0 cm\n/Image0 Do\nQ\n"))?;
        let leaf = allocate(
            &mut file,
            Object::Dict(BTreeMap::from([
                ("Type".into(), Object::Name("Page".into())),
                ("Parent".into(), Object::Reference((2, 0))),
                ("MediaBox".into(), array(&[0., 0., w, h])),
                (
                    "Resources".into(),
                    Object::Dict(BTreeMap::from([(
                        "XObject".into(),
                        Object::Dict(BTreeMap::from([(
                            "Image0".into(),
                            Object::Reference(image),
                        )])),
                    )])),
                ),
                ("Contents".into(), Object::Reference(stream)),
            ])),
        )?;
        kids.push(Object::Reference(leaf));
    }
    if offset != bytes.len() {
        return Err(invalid("Unexpected trailing image bytes."));
    }
    file.set(
        (2, 0),
        Object::Dict(BTreeMap::from([
            ("Type".into(), Object::Name("Pages".into())),
            ("Count".into(), number(kids.len() as f64)),
            ("Kids".into(), Object::Array(kids)),
        ])),
    );
    save(file)
}
