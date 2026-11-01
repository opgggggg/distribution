use cubeoffice_formats_core::ofd::strokes;
use serde_json::Value;
#[test]
fn native_device_scale_retains_original_geometry_and_attributes() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../packages/ofd/tests/fixtures/rust-strokes.json"
    ))
    .unwrap();
    let close = |a: f64, b: f64| assert!((a - b).abs() <= 1e-12 * b.abs().max(1.0), "{a} != {b}");
    for item in fixture["matrices"].as_array().unwrap() {
        let matrix: Vec<f64> = item["matrix"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_f64().unwrap())
            .collect();
        close(
            strokes::stroke_scale(matrix.try_into().unwrap()),
            item["expected"].as_f64().unwrap(),
        );
    }
    for item in fixture["widths"].as_array().unwrap() {
        close(
            strokes::line_width(
                item["width"].as_f64().unwrap(),
                item["transformScale"].as_f64().unwrap(),
                item["deviceScale"].as_f64().unwrap(),
            )
            .unwrap(),
            item["expected"].as_f64().unwrap(),
        );
    }
    for item in fixture["cases"].as_array().unwrap() {
        let result = strokes::at_device_scale(
            item["svg"].as_str().unwrap(),
            item["scale"].as_f64().unwrap(),
        )
        .unwrap();
        let actual = roxmltree::Document::parse(&result).unwrap();
        let expected = roxmltree::Document::parse(item["expected"].as_str().unwrap()).unwrap();
        let paths = |doc: &roxmltree::Document| {
            doc.descendants()
                .filter(|n| n.has_tag_name("path"))
                .map(|n| {
                    ["stroke-width", "stroke-miterlimit"]
                        .map(|name| n.attribute(name).unwrap().parse::<f64>().unwrap())
                })
                .collect::<Vec<_>>()
        };
        let (actual, expected) = (paths(&actual), paths(&expected));
        assert_eq!(actual.len(), expected.len());
        for (a, b) in actual.into_iter().zip(expected) {
            close(a[0], b[0]);
            close(a[1], b[1]);
        }
    }
    assert!(strokes::at_device_scale("<svg/>", f64::NAN).is_err());
    assert!(strokes::at_device_scale("<!DOCTYPE svg><svg data-ofd-line-width='1'/>", 1.0).is_err());
}
