use base64::{engine::general_purpose::STANDARD, Engine};
use cubeoffice_formats_core::ofd::codecs;
use serde_json::Value;
use std::io::Cursor;

#[test]
fn original_bmp_tiff_pixels_are_retained_natively() {
    let fixtures: Value = serde_json::from_str(include_str!(
        "../../../packages/ofd/tests/fixtures/rust-codecs.json"
    ))
    .unwrap();
    for case in fixtures["cases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let input = STANDARD.decode(case["bytes"].as_str().unwrap()).unwrap();
        let decoded = codecs::decode(&input, case["format"].as_str().unwrap());
        if case.get("error").is_some() {
            assert!(decoded.is_err(), "{name}");
            continue;
        }
        let encoded = decoded.unwrap_or_else(|error| panic!("{name}: {error:?}"));
        let mut reader = png::Decoder::new(Cursor::new(encoded)).read_info().unwrap();
        let mut rgba = vec![0; reader.output_buffer_size()];
        let info = reader.next_frame(&mut rgba).unwrap();
        assert_eq!(
            info.width as u64,
            case["expected"]["width"].as_u64().unwrap(),
            "{name}"
        );
        assert_eq!(
            info.height as u64,
            case["expected"]["height"].as_u64().unwrap(),
            "{name}"
        );
        rgba.truncate(info.buffer_size());
        let expected = STANDARD
            .decode(case["expected"]["rgba"].as_str().unwrap())
            .unwrap();
        assert_eq!(rgba.len(), expected.len(), "{name}");
        let tolerance = if case["lossy"].as_bool() == Some(true) {
            3
        } else {
            0
        };
        for (pixel, (actual, expected)) in rgba.iter().zip(&expected).enumerate() {
            assert!(
                actual.abs_diff(*expected) <= tolerance,
                "{name}: channel {pixel}: {actual} != {expected}"
            );
        }
    }
}

#[test]
fn malformed_and_oversized_rasters_fail_without_panicking() {
    for bytes in [
        &b""[..],
        &b"II*\0"[..],
        &b"MM\0*\xff\xff\xff\xff"[..],
        &b"BM"[..],
    ] {
        for format in ["BMP", "TIFF"] {
            assert!(codecs::decode(bytes, format).is_err());
        }
    }
    let fixtures: Value = serde_json::from_str(include_str!(
        "../../../packages/ofd/tests/fixtures/rust-codecs.json"
    ))
    .unwrap();
    let case = fixtures["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["name"] == "bmp-RGB")
        .unwrap();
    let mut bytes = STANDARD.decode(case["bytes"].as_str().unwrap()).unwrap();
    bytes[18..22].copy_from_slice(&i32::MAX.to_le_bytes());
    assert!(codecs::decode(&bytes, "BMP").is_err());
    assert!(codecs::decode(&bytes, "not-a-codec").is_err());
}

#[test]
fn selected_tiff_page_is_independent_and_cyclic_directories_are_rejected() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../packages/ofd/tests/fixtures/rust-tiff-pages.json"
    ))
    .unwrap();
    for item in fixture["cases"].as_array().unwrap() {
        let source = STANDARD.decode(item["bytes"].as_str().unwrap()).unwrap();
        for page in [2, 0, 1, 2] {
            let (png, count) = codecs::tiff_page(&source, page).unwrap();
            assert_eq!(count, 3);
            let expected = &item["pages"][page];
            let mut reader = png::Decoder::new(Cursor::new(png)).read_info().unwrap();
            let mut rgba = vec![0; reader.output_buffer_size()];
            let info = reader.next_frame(&mut rgba).unwrap();
            rgba.truncate(info.buffer_size());
            assert_eq!(info.width as u64, expected["width"].as_u64().unwrap());
            assert_eq!(info.height as u64, expected["height"].as_u64().unwrap());
            assert_eq!(
                rgba,
                STANDARD.decode(expected["rgba"].as_str().unwrap()).unwrap()
            );
        }
        assert!(codecs::tiff_page(&source, 3).is_err());
        let little = source[..2] == *b"II";
        let offset = if little {
            u32::from_le_bytes(source[4..8].try_into().unwrap())
        } else {
            u32::from_be_bytes(source[4..8].try_into().unwrap())
        } as usize;
        let count = if little {
            u16::from_le_bytes(source[offset..offset + 2].try_into().unwrap())
        } else {
            u16::from_be_bytes(source[offset..offset + 2].try_into().unwrap())
        } as usize;
        let mut cyclic = source.clone();
        cyclic[offset + 2 + count * 12..offset + 6 + count * 12].copy_from_slice(&source[4..8]);
        assert!(codecs::tiff_page(&cyclic, 0).is_err());
        assert!(codecs::tiff(&source).is_err());
    }
}
