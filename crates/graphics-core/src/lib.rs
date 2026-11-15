//! Shared byte-level graphics operations. File parsing and UI are host concerns.

/// Expand one complete PackBits row, rejecting truncated or overlong packets.
pub fn decode_packbits(mut input: &[u8], output: &mut [u8]) -> bool {
    let mut written = 0;
    while let Some((&header, rest)) = input.split_first() {
        input = rest;
        if header == 128 {
            continue;
        }
        let repeat = header > 128;
        let count = if repeat {
            257 - header as usize
        } else {
            header as usize + 1
        };
        let consumed = if repeat { 1 } else { count };
        let (Some(bytes), Some(target)) = (
            input.get(..consumed),
            output.get_mut(written..written + count),
        ) else {
            return false;
        };
        if repeat {
            target.fill(bytes[0]);
        } else {
            target.copy_from_slice(bytes);
        }
        input = &input[consumed..];
        written += count;
    }
    written == output.len()
}

/// Use the same packet boundaries as the existing PSD writer.
pub fn encode_packbits(input: &[u8], output: &mut Vec<u8>) {
    let mut cursor = 0;
    while cursor < input.len() {
        let run = input[cursor..]
            .iter()
            .take(128)
            .take_while(|&&byte| byte == input[cursor])
            .count();
        if run > 1 {
            output.extend_from_slice(&[(257 - run) as u8, input[cursor]]);
            cursor += run;
            continue;
        }
        let mut end = cursor + 1;
        while end < input.len() && end - cursor < 128 {
            if input
                .get(end..end + 3)
                .is_some_and(|v| v[0] == v[1] && v[1] == v[2])
            {
                break;
            }
            end += 1;
        }
        output.push((end - cursor - 1) as u8);
        output.extend_from_slice(&input[cursor..end]);
        cursor = end;
    }
}

/// Composite one row of straight-alpha RGBA pixels with source-over blending.
pub fn blend_normal_rgba(source: &[u8], target: &mut [u8], opacity: f64) {
    let channel = |value: f64| value.round_ties_even() as u8;
    for (src, dst) in source.chunks_exact(4).zip(target.chunks_exact_mut(4)) {
        let alpha = (src[3] as f64 / 255.0) * opacity;
        if alpha <= 0.0 {
            continue;
        }
        if alpha == 1.0 {
            dst.copy_from_slice(src);
            continue;
        }
        let backdrop = dst[3] as f64 / 255.0;
        let output_alpha = alpha + backdrop * (1.0 - alpha);
        for component in 0..3 {
            dst[component] = channel(
                (src[component] as f64 * alpha + dst[component] as f64 * backdrop * (1.0 - alpha))
                    / output_alpha,
            );
        }
        dst[3] = channel(output_alpha * 255.0);
    }
}

/// Identify the container at the start of a graphics source.
pub fn probe(input: &[u8]) -> u32 {
    if input.starts_with(b"8BPS") {
        1
    } else if input.starts_with(b"%PDF-") {
        2
    } else if input.starts_with(b"%!PS") {
        3
    } else {
        0
    }
}

#[cfg(target_arch = "wasm32")]
mod wasm {
    use super::{decode_packbits, encode_packbits};
    use std::cell::RefCell;

    #[derive(Default)]
    struct Buffers {
        input: Vec<u8>,
        output: Vec<u8>,
    }

    thread_local! {
        static BUFFERS: RefCell<Buffers> = RefCell::new(Buffers::default());
    }

    // PSD v1 dimensions and row byte counts fit within these limits.
    const MAX_ROW: usize = 65_535;
    const MAX_IMAGE_BYTES: usize = 64 * 1024 * 1024;

    #[no_mangle]
    pub extern "C" fn graphics_input(length: usize) -> *mut u8 {
        if length > MAX_IMAGE_BYTES {
            return std::ptr::null_mut();
        }
        BUFFERS.with_borrow_mut(|buffers| {
            buffers.input.resize(length, 0);
            buffers.input.as_mut_ptr()
        })
    }

    #[no_mangle]
    pub extern "C" fn graphics_probe() -> u32 {
        BUFFERS.with_borrow(|buffers| super::probe(&buffers.input))
    }

    #[no_mangle]
    pub extern "C" fn graphics_output() -> *const u8 {
        BUFFERS.with_borrow(|buffers| buffers.output.as_ptr())
    }

    #[no_mangle]
    pub extern "C" fn graphics_packbits_decode(width: usize) -> i32 {
        if width > MAX_ROW {
            return -1;
        }
        BUFFERS.with_borrow_mut(|buffers| {
            buffers.output.resize(width, 0);
            if decode_packbits(&buffers.input, &mut buffers.output) {
                width as i32
            } else {
                -1
            }
        })
    }

    #[no_mangle]
    pub extern "C" fn graphics_blend_normal(opacity: f64) {
        BUFFERS.with_borrow_mut(|buffers| {
            let half = buffers.input.len() / 2;
            let (source, target) = buffers.input.split_at_mut(half);
            super::blend_normal_rgba(source, target, opacity);
        });
    }

    #[no_mangle]
    pub extern "C" fn graphics_png(width: u32, height: u32) -> i32 {
        BUFFERS.with_borrow_mut(|buffers| {
            let Some(length) = (u64::from(width) * u64::from(height)).checked_mul(4) else {
                return -1;
            };
            if length != buffers.input.len() as u64
                || length > MAX_IMAGE_BYTES as u64
                || length == 0
            {
                return -1;
            }
            buffers.output.clear();
            let mut encoder = png::Encoder::new(&mut buffers.output, width, height);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let result = encoder.write_header().and_then(|mut writer| {
                writer.write_image_data(&buffers.input)?;
                writer.finish()
            });
            if result.is_ok() {
                buffers.output.len() as i32
            } else {
                -1
            }
        })
    }

    #[no_mangle]
    pub extern "C" fn graphics_packbits_encode() -> usize {
        BUFFERS.with_borrow_mut(|buffers| {
            buffers.output.clear();
            encode_packbits(&buffers.input, &mut buffers.output);
            buffers.output.len()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packbits_checks_actual_output_and_accepts_noop_packets() {
        let mut result = [0; 3];
        assert!(decode_packbits(&[128, 254, 128], &mut result));
        assert_eq!(result, [128; 3]);
        assert!(!decode_packbits(&[2, 1], &mut result));
        assert!(!decode_packbits(&[253, 20], &mut result));
    }

    #[test]
    fn normal_blend_preserves_clear_pixels_and_rounds_half_to_even() {
        let mut target = [1, 3, 5, 255, 7, 9, 11, 20];
        blend_normal_rgba(&[0, 0, 0, 255, 200, 100, 100, 0], &mut target, 0.5);
        assert_eq!(target, [0, 2, 2, 255, 7, 9, 11, 20]);
    }

    #[test]
    fn source_probe_distinguishes_pdf_postscript_and_psd() {
        assert_eq!(probe(b"%PDF-1.7"), 2);
        assert_eq!(probe(b"%!PS-Adobe"), 3);
        assert_eq!(probe(b"8BPS\0\x01"), 1);
        assert_eq!(probe(b"PSD"), 0);
    }
}
