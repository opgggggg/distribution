use cubeoffice_ofd_writer::Writer;
use office_browser_abi::BrowserKernel;
use serde_json::json;
fn frame(header: serde_json::Value, body: &[u8]) -> Vec<u8> {
    let json = serde_json::to_vec(&header).unwrap();
    let mut v = (json.len() as u32).to_le_bytes().to_vec();
    v.extend(json);
    v.extend(body);
    v
}
#[test]
fn malformed_frames_do_not_replace_a_successful_output() {
    let mut writer = Writer::default();
    writer
        .request(json!({"op":"docx","pages":["中文\n😀"]}))
        .unwrap();
    let saved = writer.save().unwrap();
    for input in [
        vec![],
        vec![255, 255, 255, 255],
        frame(
            json!({"pages":[{"length":100,"width":1,"height":1}]}),
            &[137, 80, 78, 71],
        ),
        frame(json!({"pages":[]}), &[]),
        frame(
            json!({"pages":[{"length":4,"width":1,"height":1}]}),
            &[137, 80, 78, 71, 255],
        ),
    ] {
        assert!(writer.open(input).is_err());
        assert_eq!(writer.save().unwrap(), saved);
    }
    writer
        .open(frame(
            json!({"id":"fixed","pages":[{"length":4,"width":10,"height":20}]}),
            &[137, 80, 78, 71],
        ))
        .unwrap();
    assert_ne!(writer.save().unwrap(), saved);
}
#[test]
fn text_writer_instances_and_results_are_independent() {
    let (mut a, mut b) = (Writer::default(), Writer::default());
    a.request(json!({"op":"docx","pages":["a"]})).unwrap();
    b.request(json!({"op":"docx","pages":["b"]})).unwrap();
    let before = a.save().unwrap();
    b.request(json!({"op":"docx","pages":["new"]})).unwrap();
    assert_eq!(a.save().unwrap(), before);
    assert_ne!(a.save().unwrap(), b.save().unwrap());
}
