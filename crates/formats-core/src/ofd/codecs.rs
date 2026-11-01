//! Bounded raster decoders used by both the portable renderer and host compatibility APIs.
use crate::{error, Result};
use std::io::Cursor;
fn invalid(message: &str) -> office_browser_abi::KernelError {
    error("InvalidImage", message)
}
fn dimensions(w: usize, h: usize) -> Result<()> {
    if w == 0 || h == 0 || w > 20000 || h > 20000 || w.checked_mul(h).is_none_or(|n| n > 40_000_000)
    {
        return Err(error(
            "LimitExceeded",
            "Image exceeds the OFD pixel budget.",
        ));
    }
    Ok(())
}
pub fn png(width: usize, height: usize, pixels: &[u8]) -> Result<Vec<u8>> {
    if width == 0
        || height == 0
        || width
            .checked_mul(height)
            .is_none_or(|n| n > 40_000_000 || n.checked_mul(4) != Some(pixels.len()))
    {
        return Err(error("LimitExceeded", "Invalid PNG raster dimensions."));
    }
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width as u32, height as u32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_filter(png::FilterType::NoFilter);
        encoder.set_compression(png::Compression::Default);
        let mut writer = encoder
            .write_header()
            .map_err(|e| invalid(&e.to_string()))?;
        writer
            .write_image_data(pixels)
            .map_err(|e| invalid(&e.to_string()))?;
    }
    Ok(out)
}
struct Bytes<'a> {
    bytes: &'a [u8],
}
impl Bytes<'_> {
    fn at<const N: usize>(&self, n: usize) -> Result<[u8; N]> {
        self.bytes
            .get(
                n..n.checked_add(N)
                    .ok_or_else(|| invalid("Image offset overflow."))?,
            )
            .and_then(|b| b.try_into().ok())
            .ok_or_else(|| invalid("Truncated image data."))
    }
    fn u16(&self, n: usize) -> Result<u16> {
        Ok(u16::from_le_bytes(self.at(n)?))
    }
    fn u32(&self, n: usize) -> Result<u32> {
        Ok(u32::from_le_bytes(self.at(n)?))
    }
    fn i32(&self, n: usize) -> Result<i32> {
        Ok(i32::from_le_bytes(self.at(n)?))
    }
}
pub fn bmp(bytes: &[u8]) -> Result<Vec<u8>> {
    if bytes.len() < 26 || !bytes.starts_with(b"BM") {
        return Err(invalid("Invalid BMP header."));
    }
    let v = Bytes { bytes };
    let offset = v.u32(10)? as usize;
    let header = v.u32(14)? as usize;
    let core = header == 12;
    if !core && header < 40 {
        return Err(invalid("Unsupported BMP DIB header."));
    }
    let width = if core {
        v.u16(18)? as i64
    } else {
        v.i32(18)? as i64
    };
    let signed_height = if core {
        v.u16(20)? as i64
    } else {
        v.i32(22)? as i64
    };
    if width <= 0 {
        return Err(error(
            "LimitExceeded",
            "Image exceeds the OFD pixel budget.",
        ));
    }
    let (w, h) = (width as usize, signed_height.unsigned_abs() as usize);
    dimensions(w, h)?;
    let depth = v.u16(if core { 24 } else { 28 })? as usize;
    let compression = if core { 0 } else { v.u32(30)? };
    if ![1, 4, 8, 16, 24, 32].contains(&depth)
        || ![0, 1, 2, 3, 6].contains(&compression)
        || (compression == 1 && depth != 8)
        || (compression == 2 && depth != 4)
    {
        return Err(invalid("Unsupported BMP encoding."));
    }
    let mut palette_offset = 14 + header;
    let mut masks = if depth == 16 {
        [0x7c00, 0x3e0, 0x1f, 0]
    } else {
        [0xff0000, 0xff00, 0xff, 0]
    };
    if compression == 3 || compression == 6 {
        masks = [
            v.u32(54)?,
            v.u32(58)?,
            v.u32(62)?,
            if header >= 56 || compression == 6 {
                v.u32(66)?
            } else {
                0
            },
        ];
        if header == 40 {
            palette_offset += if compression == 6 { 16 } else { 12 };
        }
    }
    let mut palette = Vec::new();
    if depth <= 8 {
        let count = if core {
            1 << depth
        } else {
            let c = v.u32(46)? as usize;
            if c == 0 {
                1 << depth
            } else {
                c
            }
        };
        let size = if core { 3 } else { 4 };
        if count > 256
            || palette_offset
                .checked_add(count * size)
                .is_none_or(|n| n > offset || n > bytes.len())
        {
            return Err(invalid("Invalid BMP palette."));
        }
        for i in 0..count {
            let p = palette_offset + i * size;
            palette.push([bytes[p + 2], bytes[p + 1], bytes[p], 255]);
        }
    }
    let mut pixels = vec![0_u8; w * h * 4];
    for p in pixels.chunks_exact_mut(4) {
        p[3] = 255;
    }
    let mut put = |x: usize, y: usize, rgba: [u8; 4]| -> Result<()> {
        if x >= w || y >= h {
            return Err(invalid("BMP pixel is outside its image."));
        }
        let y = if signed_height > 0 { h - 1 - y } else { y };
        pixels[(y * w + x) * 4..(y * w + x + 1) * 4].copy_from_slice(&rgba);
        Ok(())
    };
    let indexed = |i: usize| {
        palette
            .get(i)
            .copied()
            .ok_or_else(|| invalid("Invalid BMP palette index."))
    };
    if compression == 1 || compression == 2 {
        let (mut p, mut x, mut y) = (offset, 0, 0);
        while p < bytes.len() {
            let count = bytes[p] as usize;
            let value = *bytes
                .get(p + 1)
                .ok_or_else(|| invalid("Truncated BMP run."))?;
            p += 2;
            if count > 0 {
                for i in 0..count {
                    put(
                        x,
                        y,
                        indexed(if compression == 1 {
                            value as usize
                        } else if i % 2 == 1 {
                            (value & 15) as usize
                        } else {
                            (value >> 4) as usize
                        })?,
                    )?;
                    x += 1;
                }
            } else if value == 0 {
                x = 0;
                y += 1;
            } else if value == 1 {
                break;
            } else if value == 2 {
                x += *bytes
                    .get(p)
                    .ok_or_else(|| invalid("Truncated BMP delta."))? as usize;
                y += *bytes
                    .get(p + 1)
                    .ok_or_else(|| invalid("Truncated BMP delta."))? as usize;
                p += 2;
            } else {
                let n = value as usize;
                let size = if compression == 1 { n } else { n.div_ceil(2) };
                if p.checked_add(size).is_none_or(|n| n > bytes.len()) {
                    return Err(invalid("Truncated BMP literal run."));
                }
                for i in 0..n {
                    let index = if compression == 1 {
                        bytes[p + i]
                    } else if i % 2 == 1 {
                        bytes[p + i / 2] & 15
                    } else {
                        bytes[p + i / 2] >> 4
                    };
                    put(x, y, indexed(index as usize)?)?;
                    x += 1;
                }
                p += size + (size & 1);
            }
        }
    } else {
        let stride = (w * depth).div_ceil(32) * 4;
        if offset
            .checked_add(stride * h)
            .is_none_or(|n| n > bytes.len())
        {
            return Err(invalid("Truncated BMP pixel data."));
        }
        let component = |value: u32, mask: u32, fallback: u8| {
            if mask == 0 {
                return fallback;
            }
            let shift = mask.trailing_zeros();
            let max = mask >> shift;
            (((value & mask) >> shift) as f64 * 255.0 / max as f64).round() as u8
        };
        for y in 0..h {
            for x in 0..w {
                let p = offset + y * stride + x * depth / 8;
                let rgba = if depth <= 8 {
                    let shift = 8 - depth - (x * depth % 8);
                    indexed(((bytes[p] >> shift) as usize) & ((1 << depth) - 1))?
                } else if depth == 24 {
                    [bytes[p + 2], bytes[p + 1], bytes[p], 255]
                } else {
                    let value = if depth == 16 {
                        v.u16(p)? as u32
                    } else {
                        v.u32(p)?
                    };
                    [
                        component(value, masks[0], 0),
                        component(value, masks[1], 0),
                        component(value, masks[2], 0),
                        component(value, masks[3], 255),
                    ]
                };
                put(x, y, rgba)?;
            }
        }
    }
    png(w, h, &pixels)
}
fn scalar_tag_copy(bytes: &[u8], tag: u16, target: u16) -> Result<Vec<u8>> {
    let little = bytes.starts_with(b"II");
    let read16 = |p: usize| -> Result<u16> {
        let b = Bytes { bytes }.at::<2>(p)?;
        Ok(if little {
            u16::from_le_bytes(b)
        } else {
            u16::from_be_bytes(b)
        })
    };
    let read32 = |p: usize| -> Result<u32> {
        let b = Bytes { bytes }.at::<4>(p)?;
        Ok(if little {
            u32::from_le_bytes(b)
        } else {
            u32::from_be_bytes(b)
        })
    };
    if read16(2)? != 42 {
        return Err(invalid("Unsupported TIFF photometric header."));
    }
    let ifd = read32(4)? as usize;
    let count = read16(ifd)? as usize;
    for i in 0..count {
        let p = ifd + 2 + i * 12;
        if read16(p)? == tag {
            if read16(p + 2)? != 3 || read32(p + 4)? != 1 {
                return Err(invalid("Invalid TIFF photometric tag."));
            }
            let mut copy = bytes.to_vec();
            copy[p + 8..p + 10].copy_from_slice(&if little {
                target.to_le_bytes()
            } else {
                target.to_be_bytes()
            });
            return Ok(copy);
        }
    }
    Err(invalid("Missing TIFF photometric tag."))
}
pub fn tiff(bytes: &[u8]) -> Result<Vec<u8>> {
    use tiff::{
        decoder::{Decoder, DecodingResult, Limits},
        tags::Tag,
    };
    let map = |e: tiff::TiffError| invalid(&e.to_string());
    let mut decoder = Decoder::new(Cursor::new(bytes)).map_err(map)?;
    let photo = decoder
        .get_tag_u32(Tag::PhotometricInterpretation)
        .unwrap_or(2);
    // Ask the decoder for raw gray samples for white-is-zero and palette images;
    // the legacy interpretation/alpha rules are applied once below.
    let mut patched = if photo == 0 || photo == 3 {
        Some(scalar_tag_copy(bytes, 262, 1)?)
    } else {
        None
    };
    // The TIFF crate's Fax4 reader consumes MSB-first bits. Normalize only the
    // compressed payload on a private copy when the source specifies LSB-first.
    if decoder.get_tag_u32(Tag::Compression).unwrap_or(1) == 4
        && decoder.get_tag_u32(Tag::FillOrder).unwrap_or(1) == 2
    {
        let offsets = decoder
            .get_tag_u32_vec(Tag::StripOffsets)
            .or_else(|_| decoder.get_tag_u32_vec(Tag::TileOffsets))
            .map_err(map)?;
        let counts = decoder
            .get_tag_u32_vec(Tag::StripByteCounts)
            .or_else(|_| decoder.get_tag_u32_vec(Tag::TileByteCounts))
            .map_err(map)?;
        if offsets.len() != counts.len() {
            return Err(invalid("Invalid CCITT strip layout."));
        }
        let mut copy = patched.take().unwrap_or_else(|| bytes.to_vec());
        for (offset, count) in offsets.into_iter().zip(counts) {
            let start = offset as usize;
            let end = start
                .checked_add(count as usize)
                .ok_or_else(|| invalid("TIFF strip offset overflow."))?;
            for byte in copy
                .get_mut(start..end)
                .ok_or_else(|| invalid("Truncated TIFF strip."))?
            {
                *byte = byte.reverse_bits();
            }
        }
        patched = Some(scalar_tag_copy(&copy, 266, 1)?);
    }
    if let Some(patched) = &patched {
        decoder = Decoder::new(Cursor::new(patched.as_slice())).map_err(map)?;
    }
    if decoder.more_images() {
        return Err(invalid(
            "OFD TIFF resources must contain exactly one image.",
        ));
    }
    let (width, height) = decoder.dimensions().map_err(map)?;
    let (w, h) = (width as usize, height as usize);
    dimensions(w, h)?;
    let orientation = decoder.get_tag_u32(Tag::Orientation).unwrap_or(1);
    if !(1..=8).contains(&orientation) {
        return Err(invalid("Invalid TIFF orientation."));
    }
    let bits = decoder
        .get_tag_u32_vec(Tag::BitsPerSample)
        .unwrap_or_else(|_| vec![1]);
    let bps = bits.first().copied().unwrap_or(1).min(32) as usize;
    let samples = bits.len();
    let compression = decoder.get_tag_u32(Tag::Compression).unwrap_or(1);
    let palette = if photo == 3 {
        decoder.get_tag_u32_vec(Tag::ColorMap).map_err(map)?
    } else {
        Vec::new()
    };
    let mut limits = Limits::default();
    limits.decoding_buffer_size = 320 * 1024 * 1024;
    limits.intermediate_buffer_size = 160 * 1024 * 1024;
    limits.ifd_value_size = 16 * 1024 * 1024;
    decoder = decoder.with_limits(limits);
    let offsets = decoder
        .get_tag_u32_vec(Tag::StripOffsets)
        .unwrap_or_default();
    let counts = decoder
        .get_tag_u32_vec(Tag::StripByteCounts)
        .unwrap_or_default();
    let legacy_row = w
        .checked_mul(bps)
        .and_then(|n| n.checked_mul(samples))
        .ok_or_else(|| invalid("TIFF sample layout overflow."))?
        .div_ceil(8);
    let legacy_size = h
        .checked_mul(legacy_row)
        .ok_or_else(|| invalid("TIFF image layout overflow."))?;
    let raw_shortcut = offsets.len() == 1
        && counts.first().copied() == Some(legacy_size as u32)
        && compression != 1
        && compression != 32767;
    // The original decoder copies a same-sized compressed strip literally. Keep
    // that established tiny-image behavior rather than silently changing saved art.
    let mut raw: Vec<u8> = if raw_shortcut {
        let start = offsets[0] as usize;
        bytes
            .get(
                start
                    ..start
                        .checked_add(legacy_size)
                        .ok_or_else(|| invalid("TIFF strip offset overflow."))?,
            )
            .ok_or_else(|| invalid("Truncated TIFF strip."))?
            .to_vec()
    } else if compression == 3 {
        let rows = decoder.get_tag_u32(Tag::RowsPerStrip).unwrap_or(height) as usize;
        let options = decoder.get_tag_u32(Tag::Unknown(292)).unwrap_or(0);
        let fill_order = decoder.get_tag_u32(Tag::FillOrder).unwrap_or(1);
        if bps != 1 || rows == 0 || offsets.len() != counts.len() {
            return Err(invalid("Invalid CCITT strip layout."));
        }
        let mut out = Vec::new();
        let mut remaining = h;
        for (offset, count) in offsets.iter().zip(&counts) {
            let start = *offset as usize;
            let count = *count as usize;
            let strip = bytes
                .get(
                    start
                        ..start
                            .checked_add(count)
                            .ok_or_else(|| invalid("TIFF strip offset overflow."))?,
                )
                .ok_or_else(|| invalid("Truncated TIFF strip."))?;
            let n = rows.min(remaining);
            if n == 0 {
                break;
            }
            out.extend(super::fax::group3(
                strip,
                w,
                n,
                options & 1 != 0,
                fill_order,
            )?);
            remaining -= n;
        }
        if remaining != 0 {
            return Err(invalid("Missing CCITT image rows."));
        }
        out
    } else {
        let mut data = DecodingResult::U8(Vec::new());
        let layout = decoder.read_image_to_buffer(&mut data).map_err(map)?;
        let raw = match data {
            DecodingResult::U8(b) => b,
            DecodingResult::U16(b) => b.into_iter().flat_map(u16::to_le_bytes).collect(),
            DecodingResult::U32(b) => b.into_iter().flat_map(u32::to_le_bytes).collect(),
            DecodingResult::U64(b) => b.into_iter().flat_map(u64::to_le_bytes).collect(),
            DecodingResult::I8(b) => b.into_iter().map(|n| n as u8).collect(),
            DecodingResult::I16(b) => b.into_iter().flat_map(i16::to_le_bytes).collect(),
            DecodingResult::I32(b) => b.into_iter().flat_map(i32::to_le_bytes).collect(),
            DecodingResult::I64(b) => b.into_iter().flat_map(i64::to_le_bytes).collect(),
            DecodingResult::F16(b) => b
                .into_iter()
                .flat_map(|v| v.to_bits().to_le_bytes())
                .collect(),
            DecodingResult::F32(b) => b.into_iter().flat_map(f32::to_le_bytes).collect(),
            DecodingResult::F64(b) => b.into_iter().flat_map(f64::to_le_bytes).collect(),
        };
        if raw.len() < layout.complete_len {
            return Err(error(
                "LimitExceeded",
                "TIFF decoded planes exceed the raster budget.",
            ));
        }
        raw
    };
    if raw_shortcut {
        // UTIF still applied byte-order normalization and horizontal prediction
        // after its same-sized-strip copy. The normal Rust decoder already
        // performs both steps; this compatibility path must do them explicitly.
        if bps == 16 && bytes.starts_with(b"MM") {
            for pair in raw.chunks_exact_mut(2) {
                pair.swap(0, 1);
            }
        }
        if decoder.get_tag_u32(Tag::Predictor).unwrap_or(1) == 2 {
            let components = decoder.get_tag_u32(Tag::SamplesPerPixel).unwrap_or(1) as usize;
            let pixel_bits = bps
                .checked_mul(components)
                .ok_or_else(|| invalid("TIFF pixel layout overflow."))?;
            let stride = w
                .checked_mul(pixel_bits)
                .ok_or_else(|| invalid("TIFF row layout overflow."))?
                .div_ceil(8);
            let pixel = pixel_bits / 8;
            if stride > 0 {
                for row in raw.chunks_mut(stride) {
                    if bps == 16 {
                        for i in (pixel..row.len().saturating_sub(1)).step_by(2) {
                            let value = u16::from_le_bytes([row[i], row[i + 1]]).wrapping_add(
                                u16::from_le_bytes([row[i - pixel], row[i - pixel + 1]]),
                            );
                            row[i..i + 2].copy_from_slice(&value.to_le_bytes());
                        }
                    } else {
                        for i in pixel..row.len() {
                            row[i] = row[i].wrapping_add(row[i - pixel]);
                        }
                    }
                }
            }
        }
    }
    let jpeg = compression == 6 || compression == 7;
    let raw = if jpeg && !raw_shortcut && (samples == 3 || samples == 4) {
        // Match the original JPEG provider's default color transform, including
        // explicit Adobe APP14 transform flags, before applying TIFF channels.
        let adobe = bytes
            .windows(9)
            .position(|s| s[0] == 255 && s[1] == 238 && &s[4..9] == b"Adobe")
            .and_then(|p| bytes.get(p + 15))
            .copied();
        let transform = adobe.map_or(samples == 3, |value| value != 0);
        if transform {
            let mut converted = raw;
            for pixel in converted.chunks_exact_mut(samples) {
                let (y, cb, cr) = (pixel[0] as f64, pixel[1] as f64, pixel[2] as f64);
                let values = if samples == 3 {
                    [
                        y - 179.456 + 1.402 * cr,
                        y + 135.459 - 0.344 * cb - 0.714 * cr,
                        y - 226.816 + 1.772 * cb,
                    ]
                } else {
                    [
                        434.456 - y - 1.402 * cr,
                        119.541 - y + 0.344 * cb + 0.714 * cr,
                        481.816 - y - 1.772 * cb,
                    ]
                };
                for k in 0..3 {
                    pixel[k] = values[k].clamp(0.0, 255.0).round_ties_even() as u8;
                }
            }
            converted
        } else {
            raw
        }
    } else {
        raw
    };
    let effective_photo = if photo == 6 && jpeg && !raw_shortcut {
        2
    } else {
        photo
    };
    let mut rgba = vec![0_u8; w * h * 4];
    let get = |i: usize| raw.get(i).copied().unwrap_or(0);
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            let out = &mut rgba[i * 4..i * 4 + 4];
            match effective_photo {
                0 | 1 => {
                    let supported = if photo == 0 {
                        [1, 4, 8].contains(&bps)
                    } else {
                        [1, 2, 8, 16].contains(&bps)
                    };
                    if !supported {
                        continue;
                    }
                    let row = (w * bps).div_ceil(8);
                    let sample = if bps < 8 {
                        (get(y * row + x * bps / 8) >> (8 - bps - x * bps % 8)) & ((1 << bps) - 1)
                    } else if bps == 8 {
                        get(y * row + x)
                    } else {
                        get(y * row + x * 2 + 1)
                    };
                    let value = if bps < 8 {
                        sample as u32 * 255 / ((1_u32 << bps) - 1)
                    } else {
                        sample as u32
                    };
                    let value = if photo == 0 { 255 - value } else { value } as u8;
                    out.copy_from_slice(&[value, value, value, 255]);
                }
                2 => {
                    if samples != 3 && samples != 4 {
                        continue;
                    }
                    let stride = if bps == 8 { samples } else { samples * 2 };
                    let index = i * stride + if bps == 8 { 0 } else { 1 };
                    let step = if bps == 8 { 1 } else { 2 };
                    out.copy_from_slice(&[
                        get(index),
                        get(index + step),
                        get(index + step * 2),
                        if samples == 4 {
                            get(index + step * 3)
                        } else {
                            255
                        },
                    ]);
                }
                3 => {
                    let index = get(i) as usize;
                    out.copy_from_slice(&[
                        (palette.get(index).copied().unwrap_or(0) >> 8) as u8,
                        (palette.get(256 + index).copied().unwrap_or(0) >> 8) as u8,
                        (palette.get(512 + index).copied().unwrap_or(0) >> 8) as u8,
                        255,
                    ]);
                }
                5 => {
                    let index = i * samples;
                    let k = (255 - get(index + 3)) as f64 / 255.0;
                    out.copy_from_slice(&[
                        ((255 - get(index)) as f64 * k).round() as u8,
                        ((255 - get(index + 1)) as f64 * k).round() as u8,
                        ((255 - get(index + 2)) as f64 * k).round() as u8,
                        if samples > 4 {
                            get(index + 4)
                        } else if index + 4 >= raw.len() {
                            0
                        } else {
                            255
                        },
                    ]);
                }
                6 if compression == 6 || compression == 7 => {
                    let index = i * 3;
                    let yy = get(index) as f64;
                    let cb = get(index + 1) as f64 - 128.0;
                    let cr = get(index + 2) as f64 - 128.0;
                    out.copy_from_slice(&[
                        (yy + 1.402 * cr).clamp(0.0, 255.0) as u8,
                        (yy - 0.3441363 * cb - 0.71413636 * cr).clamp(0.0, 255.0) as u8,
                        (yy + 1.772 * cb).clamp(0.0, 255.0) as u8,
                        255,
                    ]);
                }
                _ => {}
            }
        }
    }
    if orientation == 1 {
        return png(w, h, &rgba);
    }
    let (ow, oh) = if orientation >= 5 { (h, w) } else { (w, h) };
    let mut output = vec![0; rgba.len()];
    for y in 0..h {
        for x in 0..w {
            let (dx, dy) = match orientation {
                2 => (w - 1 - x, y),
                3 => (w - 1 - x, h - 1 - y),
                4 => (x, h - 1 - y),
                5 => (y, x),
                6 => (h - 1 - y, x),
                7 => (h - 1 - y, w - 1 - x),
                _ => (y, w - 1 - x),
            };
            output[(dy * ow + dx) * 4..(dy * ow + dx + 1) * 4]
                .copy_from_slice(&rgba[(y * w + x) * 4..(y * w + x + 1) * 4]);
        }
    }
    png(ow, oh, &output)
}
pub fn decode(bytes: &[u8], format: &str) -> Result<Vec<u8>> {
    match format.to_ascii_uppercase().as_str() {
        "BMP" => bmp(bytes),
        "TIF" | "TIFF" => tiff(bytes),
        _ => Err(invalid("Unsupported built-in image decoder.")),
    }
}

/// Decode one page for the image editor while retaining the entire source TIFF
/// in the host document. OFD resources continue to reject multi-page images.
pub fn tiff_page(bytes: &[u8], page: usize) -> Result<(Vec<u8>, usize)> {
    let little = bytes.get(..2) == Some(b"II");
    if !little && bytes.get(..2) != Some(b"MM") {
        return Err(invalid("Invalid TIFF byte order."));
    }
    let u16_at = |p: usize| -> Result<u16> {
        let b: [u8; 2] = bytes
            .get(
                p..p.checked_add(2)
                    .ok_or_else(|| invalid("TIFF offset overflow."))?,
            )
            .ok_or_else(|| invalid("Truncated TIFF directory."))?
            .try_into()
            .unwrap();
        Ok(if little {
            u16::from_le_bytes(b)
        } else {
            u16::from_be_bytes(b)
        })
    };
    let u32_at = |p: usize| -> Result<u32> {
        let b: [u8; 4] = bytes
            .get(
                p..p.checked_add(4)
                    .ok_or_else(|| invalid("TIFF offset overflow."))?,
            )
            .ok_or_else(|| invalid("Truncated TIFF directory."))?
            .try_into()
            .unwrap();
        Ok(if little {
            u32::from_le_bytes(b)
        } else {
            u32::from_be_bytes(b)
        })
    };
    if u16_at(2)? != 42 {
        return Err(invalid("Unsupported TIFF header."));
    }
    let mut offset = u32_at(4)? as usize;
    let mut directories = Vec::new();
    let mut seen = std::collections::HashSet::new();
    while offset != 0 {
        if directories.len() >= 1000 || !seen.insert(offset) {
            return Err(error("LimitExceeded", "Too many or cyclic TIFF pages."));
        }
        let count = u16_at(offset)? as usize;
        let next = offset
            .checked_add(2 + count * 12)
            .ok_or_else(|| invalid("TIFF directory overflow."))?;
        let following = u32_at(next)? as usize;
        directories.push((offset, next));
        offset = following;
    }
    let (offset, next) = *directories
        .get(page)
        .ok_or_else(|| error("InvalidPage", "TIFF page does not exist."))?;
    let mut isolated = bytes.to_vec();
    isolated[4..8].copy_from_slice(&if little {
        (offset as u32).to_le_bytes()
    } else {
        (offset as u32).to_be_bytes()
    });
    isolated[next..next + 4].fill(0);
    // Image import has always displayed unknown orientation values as upright;
    // the stricter OFD resource decoder retains its existing rejection behavior.
    for index in 0..u16_at(offset)? as usize {
        let p = offset + 2 + index * 12;
        if u16_at(p)? == 274
            && u16_at(p + 2)? == 3
            && u32_at(p + 4)? == 1
            && !(1..=8).contains(&u16_at(p + 8)?)
        {
            isolated[p + 8..p + 10].copy_from_slice(&if little {
                1_u16.to_le_bytes()
            } else {
                1_u16.to_be_bytes()
            });
        }
    }
    Ok((tiff(&isolated)?, directories.len()))
}
