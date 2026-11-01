use base64::{engine::general_purpose::STANDARD, Engine};
use cubeoffice_formats_core::pdf::Session;
use pdf_core::{
    render::{self, Fonts},
    Document,
};
use serde_json::{json, Value};
struct Standard(Vec<u8>);
impl Fonts for Standard {
    fn standard(&self, _: &str) -> Option<&[u8]> {
        Some(&self.0)
    }
}
fn fixtures() -> Value {
    serde_json::from_str(include_str!(
        "../../../packages/kernels/tests/fixtures/mobile-pdf.json"
    ))
    .unwrap()
}
fn decode(value: &Value) -> Vec<u8> {
    STANDARD.decode(value.as_str().unwrap()).unwrap()
}
fn image_frame(item: &Value) -> Vec<u8> {
    let pages = item["pages"].as_array().unwrap();
    let images: Vec<Vec<u8>> = pages.iter().map(|p| decode(&p["image"])).collect();
    let header=serde_json::to_vec(&json!({"pages":pages.iter().zip(&images).map(|(p,b)|json!({"length":b.len(),"mime":p["mime"],"width":p["width"],"height":p["height"]})).collect::<Vec<_>>()})).unwrap();
    let mut frame = (header.len() as u32).to_le_bytes().to_vec();
    frame.extend(header);
    for image in images {
        frame.extend(image);
    }
    frame
}
#[test]
fn native_pdf_mutations_retain_original_pages_and_pixels() {
    let font = Standard(
        std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf"
        ))
        .unwrap(),
    );
    for item in fixtures()["cases"].as_array().unwrap() {
        let name = item["name"].as_str().unwrap();
        let mut session = if item["kind"] == "images" {
            Session::image_pages(&image_frame(item)).unwrap()
        } else if item["kind"] == "image" {
            Session::open(decode(&item["image"]), item["mime"].as_str()).unwrap()
        } else {
            Session::open(decode(&item["input"]), None).unwrap()
        };
        if item["kind"] == "pages" {
            session
                .request(&json!({"op":"pageOperation","operation":item["operation"]}))
                .unwrap();
        } else if item["kind"] == "signature" {
            session.upload_image(&decode(&item["image"])).unwrap();
            session
                .request(&json!({"op":"signature","page":item["page"],"box":item["box"]}))
                .unwrap();
        }
        let actual = Document::open(&session.save().unwrap()).unwrap();
        let mut expected = if name == "inherited-move-1" {
            Document::open(&decode(&item["input"])).unwrap()
        } else {
            Document::open(&decode(&item["expected"])).unwrap()
        };
        if name == "inherited-move-1" {
            expected.pages.rotate_left(1);
        }
        assert_eq!(actual.pages.len(), expected.pages.len(), "{name}");
        for (index, (a, b)) in actual.pages.iter().zip(&expected.pages).enumerate() {
            assert_eq!(
                (a.width, a.height, a.rotation),
                (b.width, b.height, b.rotation),
                "{name}: {index}"
            );
            let command = json!({"page":index+1,"dpi":72});
            let a =
                render::capture(&actual, &command, &font).unwrap_or_else(|e| panic!("{name}: {e}"));
            let b = render::capture(&expected, &command, &font)
                .unwrap_or_else(|e| panic!("{name}: {e}"));
            assert_eq!(a.rgba, b.rgba, "{name}: native pixels");
        }
    }
}
#[test]
fn failed_pdf_mutations_do_not_change_the_previous_source() {
    let fixture = fixtures();
    let item = fixture["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["name"] == "signature-0")
        .unwrap();
    let source = decode(&item["input"]);
    let mut session = Session::open(source.clone(), None).unwrap();
    assert!(session
        .request(&json!({"op":"pageOperation","operation":{"type":"delete","page":1}}))
        .is_err());
    assert_eq!(session.save().unwrap(), source);
    assert!(session.upload_image(b"not PNG").is_err());
    assert_eq!(session.save().unwrap(), source);
    session.upload_image(&decode(&item["image"])).unwrap();
    assert!(session
        .request(&json!({"op":"signature","page":1,"box":{"x":1,"y":0,"width":0.5,"height":0.5}}))
        .is_err());
    assert_eq!(session.save().unwrap(), source);
    session
        .request(&json!({"op":"signature","page":1,"box":item["box"]}))
        .unwrap();
    assert_ne!(session.save().unwrap(), source);
}
#[test]
fn malformed_raster_frames_are_rejected() {
    let fixture = fixtures();
    let item = fixture["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["name"] == "raster-pages-2")
        .unwrap();
    let frame = image_frame(item);
    for bytes in [&b""[..], &frame[..3], &frame[..frame.len() - 1]] {
        assert!(Session::image_pages(bytes).is_err());
    }
    let mut trailing = frame.clone();
    trailing.push(1);
    assert!(Session::image_pages(&trailing).is_err());
    let mut bad_header = frame.clone();
    bad_header[..4].copy_from_slice(&u32::MAX.to_le_bytes());
    assert!(Session::image_pages(&bad_header).is_err());
    assert_eq!(
        Session::image_pages(&frame).unwrap().state()["pageCount"],
        2
    );
}
#[test]
fn opaque_trailer_references_survive_a_pdf_mutation() {
    use pdf_core::object::Object;
    let fixture = fixtures();
    let item = fixture["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["name"] == "signature-0")
        .unwrap();
    let mut source = Document::open(&decode(&item["input"])).unwrap().file;
    source.set((999, 0), Object::String(b"opaque trailer payload".to_vec()));
    if let Object::Dict(trailer) = &mut source.trailer {
        trailer.insert("CubeOpaqueTrailer".into(), Object::Reference((999, 0)));
    } else {
        panic!("Expected trailer dictionary");
    }
    let mut session = Session::open(source.save().unwrap(), None).unwrap();
    session
        .request(&json!({"op":"pageOperation","operation":{"type":"rotate","page":1}}))
        .unwrap();
    let output = Document::open(&session.save().unwrap()).unwrap();
    assert_eq!(
        output
            .file
            .resolve(output.file.trailer.get("CubeOpaqueTrailer"))
            .bytes(),
        b"opaque trailer payload"
    );
}
