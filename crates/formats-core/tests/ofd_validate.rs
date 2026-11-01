use base64::{engine::general_purpose::STANDARD, Engine};
use cubeoffice_formats_core::ofd::{validate::ValidationPlan, Package};
use serde_json::{json, Value};
use std::io::{Cursor, Write};
fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../packages/ofd/tests/fixtures/rust-validation.json"
    ))
    .unwrap()
}
fn package(item: &Value) -> Package {
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (path, text) in item["parts"].as_object().unwrap() {
        zip.start_file(path, zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(text.as_str().unwrap().as_bytes()).unwrap();
    }
    if let Some(parts) = item["binaryParts"].as_object() {
        for (path, data) in parts {
            zip.start_file(path, zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(&STANDARD.decode(data.as_str().unwrap()).unwrap())
                .unwrap();
        }
    }
    Package::open(zip.finish().unwrap().into_inner(), &Value::Null).unwrap()
}
#[test]
fn native_structure_and_schema_reply_merging_match_the_original_validator() {
    let fixture = fixture();
    for item in fixture["cases"].as_array().unwrap() {
        let mut p = package(item);
        let original = p.original().unwrap();
        let plan = ValidationPlan::new(&mut p);
        assert_eq!(
            plan.projection()["checkedParts"],
            item["expected"]["checkedParts"],
            "{}",
            item["name"]
        );
        let structural = item["expected"]["issues"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|v| v["code"] != "xsd")
            .cloned()
            .collect::<Vec<_>>();
        assert_eq!(plan.structural_issues(), structural, "{}", item["name"]);
        let replies = plan.projection()["checkedParts"]
            .as_array()
            .unwrap()
            .iter()
            .map(|path| {
                let issues = item["expected"]["issues"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter(|v| v["code"] == "xsd" && v["path"] == *path)
                    .cloned()
                    .collect::<Vec<_>>();
                json!({"path":path,"issues":issues})
            })
            .collect::<Vec<_>>();
        assert_eq!(
            plan.finish(&json!(replies)).unwrap(),
            item["expected"],
            "{}",
            item["name"]
        );
        assert_eq!(p.original().unwrap(), original);
        assert_eq!(p.state()["dirty"], false);
    }
}
#[test]
fn missing_duplicate_and_unknown_schema_replies_are_rejected() {
    let fixture = fixture();
    let mut p = package(&fixture["cases"][0]);
    let plan = ValidationPlan::new(&mut p);
    let first = plan.projection()["checkedParts"][0].clone();
    assert!(plan.finish(&json!([])).is_err());
    assert!(plan
        .finish(&json!([{"path":first,"issues":[]},{"path":first,"issues":[]}]))
        .is_err());
    assert!(plan.finish(&json!([{"path":"wrong","issues":[]}])).is_err());
}
#[test]
fn a_missing_container_root_is_an_explicit_structural_issue() {
    let mut p = Package::empty(&Value::Null).unwrap();
    let plan = ValidationPlan::new(&mut p);
    assert_eq!(plan.projection()["checkedParts"], json!([]));
    let result = plan.finish(&json!([])).unwrap();
    assert_eq!(result["valid"], false);
    assert_eq!(result["issues"][0]["code"], "missing-part");
}
