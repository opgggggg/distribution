use base64::{engine::general_purpose::STANDARD, Engine};
use cubeoffice_formats_core::{
    ofd::{
        render::{self, Assets, ColorHost, DefaultColorHost},
        Package,
    },
    Result,
};
use serde_json::{json, Value};
use std::sync::Arc;
fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../packages/ofd/tests/fixtures/rust-render.json"
    ))
    .unwrap()
}
fn package(item: &Value) -> Package {
    let mut p = Package::empty(&Value::Null).unwrap();
    for (path, text) in item["parts"].as_object().unwrap() {
        p.set(path, text.as_str().unwrap().as_bytes().to_vec())
            .unwrap();
    }
    if let Some(parts) = item["binaryParts"].as_object() {
        for (path, data) in parts {
            p.set(path, STANDARD.decode(data.as_str().unwrap()).unwrap())
                .unwrap();
        }
    }
    let source = p.write(false).unwrap();
    Package::open(source, &Value::Null).unwrap()
}
fn same(actual: &Value, expected: &Value, key: &str) {
    if key == "svg" || key == "html" {
        return;
    }
    match (actual, expected) {
        (Value::Number(a), Value::Number(b)) => {
            let (a, b) = (a.as_f64().unwrap(), b.as_f64().unwrap());
            assert!(
                (a - b).abs() <= 1e-12 * a.abs().max(b.abs()).max(1.0),
                "{key}: {a} != {b}"
            );
        }
        (Value::Object(a), Value::Object(b)) => {
            assert_eq!(a.len(), b.len(), "{key}: keys");
            for (k, b) in b {
                same(a.get(k).unwrap_or_else(|| panic!("missing {k}")), b, k);
            }
        }
        (Value::Array(a), Value::Array(b)) => {
            assert_eq!(a.len(), b.len(), "{key}: length");
            for (a, b) in a.iter().zip(b) {
                same(a, b, key);
            }
        }
        _ => assert_eq!(actual, expected, "{key}"),
    }
}
struct ProfileHost;
impl ColorHost for ProfileHost {
    fn enabled(&self) -> bool {
        true
    }
    fn convert(
        &self,
        values: &[f64],
        kind: &str,
        bits: f64,
        profile: Option<&str>,
    ) -> Result<[f64; 3]> {
        assert_eq!(kind, "RGB");
        assert_eq!(bits, 8.0);
        assert_eq!(values, [1.0, 0.0, 0.0]);
        assert_eq!(profile, Some("Doc/Res/marker.icc"));
        Ok([12.0, 100.0, 200.0])
    }
}
#[test]
fn complete_native_render_matches_all_original_page_semantics() {
    let fixture = fixture();
    for item in fixture["cases"].as_array().unwrap() {
        let mut package = package(item);
        let original = package.original().unwrap();
        let mut assets = Assets::new();
        if let Some(fonts) = item["fontOverrides"].as_object() {
            let font = std::fs::read(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf"
            ))
            .expect("Install OFD development dependencies before native font parity tests");
            for key in fonts.keys() {
                assets.insert(key.clone(), Arc::from(font.clone()));
            }
        }
        let host: &dyn ColorHost = if item.get("colorProvider").is_some() {
            &ProfileHost
        } else {
            &DefaultColorHost
        };
        let rendered = render::render(&mut package, Value::Null, &assets, host).unwrap();
        same(&rendered, &item["expected"], item["name"].as_str().unwrap());
        assert_eq!(package.state()["dirty"], false);
        assert_eq!(package.original().unwrap(), original);
        assert!(rendered["pages"][0]["svg"]
            .as_str()
            .unwrap()
            .contains("viewBox=\"0 0 "));
    }
}
struct FailedHost;
impl ColorHost for FailedHost {
    fn enabled(&self) -> bool {
        true
    }
    fn convert(&self, _: &[f64], _: &str, _: f64, _: Option<&str>) -> Result<[f64; 3]> {
        Err(cubeoffice_formats_core::error("InvalidColor", "offline"))
    }
}
#[test]
fn native_provider_failures_do_not_mutate_or_poison_the_document() {
    let fixture = fixture();
    let item = fixture["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v.get("colorProvider").is_some())
        .unwrap();
    let mut p = package(item);
    let original = p.original().unwrap();
    assert!(render::render(&mut p, Value::Null, &Assets::new(), &FailedHost).is_err());
    assert_eq!(p.original().unwrap(), original);
    assert_eq!(p.state()["dirty"], false);
    let rendered = render::render(&mut p, Value::Null, &Assets::new(), &ProfileHost).unwrap();
    same(&rendered, &item["expected"], "after provider failure");
}
#[test]
fn budgets_and_rendering_snapshots_are_independent_of_ongoing_part_edits() {
    let fixture = fixture();
    let mut live = package(&fixture["cases"][0]);
    let mut snapshot = live.snapshot();
    live.set(
        "Doc/Page.xml",
        b"<Page><Area><PhysicalBox>0 0 10 10</PhysicalBox></Area><Content/></Page>".to_vec(),
    )
    .unwrap();
    let original = render::render(
        &mut snapshot,
        Value::Null,
        &Assets::new(),
        &DefaultColorHost,
    )
    .unwrap();
    let edited = render::render(&mut live, Value::Null, &Assets::new(), &DefaultColorHost).unwrap();
    assert!(original["pages"][0]["width"].as_f64().unwrap() > 100.0);
    assert!(edited["pages"][0]["width"].as_f64().unwrap() < 40.0);
    assert!(render::render(
        &mut snapshot,
        json!({"maxObjects":1}),
        &Assets::new(),
        &DefaultColorHost
    )
    .is_err());
    assert!(render::render(
        &mut snapshot,
        json!({"maxSvgBytes":16}),
        &Assets::new(),
        &DefaultColorHost
    )
    .is_err());
}
