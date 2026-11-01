use cubeoffice_formats_core::{
    ofd::{resolve_path, xml, Package},
    FormatsKernel,
};
use office_browser_abi::BrowserKernel;
use serde_json::{json, Value};
use std::io::{Cursor, Write};

fn archive(extra: &[(&str, &[u8])]) -> Vec<u8> {
    let root=b"<o:OFD xmlns:o='urn:ofd'><o:DocBody><o:DocRoot>Doc/Document.xml</o:DocRoot></o:DocBody></o:OFD>";
    let doc=b"<o:Document xmlns:o='urn:ofd'><o:Pages><o:Page ID='1' BaseLoc='Page.xml'/></o:Pages><o:Permissions><o:Print Copies='0'/></o:Permissions></o:Document>";
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let mut parts = vec![
        ("OFD.xml", root.as_slice()),
        ("Doc/Document.xml", doc.as_slice()),
        ("Doc/Page.xml", b"<Page/>".as_slice()),
    ];
    for (name, bytes) in extra {
        if let Some(old) = parts.iter_mut().find(|p| p.0 == *name) {
            old.1 = bytes;
        } else {
            parts.push((name, bytes));
        }
    }
    for (name, data) in parts {
        zip.start_file(name, zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(data).unwrap();
    }
    zip.finish().unwrap().into_inner()
}
#[test]
fn original_bytes_opaque_extensions_and_part_edits_survive() {
    let source = archive(&[
        ("Doc/opaque.bin", &[0, 1, 255]),
        (
            "Doc/extension.xml",
            b"<x:X xmlns:x='urn:extension'><![CDATA[untouched<&]]></x:X>",
        ),
    ]);
    let mut p = Package::open(source.clone(), &Value::Null).unwrap();
    assert_eq!(p.write(false).unwrap(), source);
    p.begin_edit().unwrap();
    p.prepare_part("Doc/new.bin").unwrap();
    p.upload(vec![5, 6]).unwrap();
    let edited = p.write(false).unwrap();
    let mut reopened = Package::open(edited, &Value::Null).unwrap();
    assert_eq!(reopened.read("Doc/opaque.bin").unwrap(), vec![0, 1, 255]);
    assert_eq!(
        reopened.read("Doc/extension.xml").unwrap(),
        b"<x:X xmlns:x='urn:extension'><![CDATA[untouched<&]]></x:X>"
    );
    assert_eq!(reopened.read("Doc/new.bin").unwrap(), vec![5, 6]);
    assert_eq!(p.original().unwrap(), source);
    let mut read = reopened.read("Doc/opaque.bin").unwrap();
    read[0] = 99;
    assert_eq!(reopened.read("Doc/opaque.bin").unwrap()[0], 0);
}
#[test]
fn signed_file_consent_is_enforced_by_the_rust_authority() {
    let source=archive(&[("OFD.xml",b"<OFD><DocBody><DocRoot>Doc/Document.xml</DocRoot><Signatures>Signatures.xml</Signatures></DocBody></OFD>"),("Signatures.xml",b"<Signatures/>")]);
    let mut p = Package::open(source.clone(), &Value::Null).unwrap();
    p.prepare_part("Doc/new.bin").unwrap();
    p.upload(vec![1]).unwrap();
    assert_eq!(p.write(false).unwrap_err().code, "SignedPackage");
    assert!(p.write(true).is_ok());
    assert_eq!(p.original().unwrap(), source);
    p.remove("Signatures.xml").unwrap();
    assert_eq!(p.write(false).unwrap_err().code, "SignedPackage");
}
#[test]
fn xml_inspection_preserves_prefixes_entities_cdata_and_text_boundaries() {
    let node=xml::inspect("<x:Root xmlns:x='urn:x' A='a&#10;b'>one&amp;two<![CDATA[<raw>]]>after<!--c-->tail<x:Item x:flag='yes'/></x:Root>").unwrap();
    assert_eq!(
        node,
        json!({"name":"x:Root","namespace":"urn:x","attributes":{"xmlns:x":"urn:x","A":"a\nb"},"children":["one&two","<raw>","after","tail",{"name":"x:Item","namespace":"urn:x","attributes":{"x:flag":"yes"},"children":[]}]})
    );
    assert!(xml::inspect("<!DOCTYPE x><x/>").is_err());
    assert!(xml::inspect("<x><bad></x>").is_err());
    assert!(xml::inspect(&format!("{}{}", "<x>".repeat(258), "</x>".repeat(258))).is_err());
}
#[test]
fn paths_budgets_and_failed_uploads_are_atomic() {
    assert_eq!(
        resolve_path("Doc/Page.xml", "../asset.bin").unwrap(),
        "asset.bin"
    );
    for bad in ["../x", "C:/x", "\\x", "https://host/a", "a\0b"] {
        assert!(resolve_path("", bad).is_err());
    }
    let source = archive(&[]);
    assert!(Package::open(source.clone(), &json!({"maxEntries":1})).is_err());
    assert!(Package::open(source.clone(), &json!({"maxExpandedBytes":1})).is_err());
    let mut p = Package::open(source.clone(), &json!({"maxExpandedBytes":500})).unwrap();
    p.prepare_part("Doc/stale.bin").unwrap();
    assert!(p.prepare_part("../escape.bin").is_err());
    assert!(p.upload(vec![9]).is_err());
    assert!(!p.has("Doc/stale.bin"));
    p.prepare_part("Doc/huge.bin").unwrap();
    assert!(p.upload(vec![0; 1000]).is_err());
    assert_eq!(p.state()["dirty"], false);
    assert_eq!(p.original().unwrap(), source);
}
#[test]
fn metadata_open_is_lazy_and_versions_do_not_mutate_the_source() {
    let source = archive(&[("attachments/opaque.bin", &vec![0; 1024 * 1024])]);
    let mut p = Package::open(source.clone(), &Value::Null).unwrap();
    assert_eq!(p.state()["cacheBytes"], 0);
    let docs = p.describe(&Value::Null).unwrap();
    assert_eq!(docs[0]["pages"][0]["path"], "Doc/Page.xml");
    assert_eq!(docs[0]["policy"]["print"]["allowed"], false);
    assert!(p.state()["cacheBytes"].as_u64().unwrap() < 10000);
    assert!(p.describe(&json!({"version":"missing"})).is_err());
    assert_eq!(p.original().unwrap(), source);
}
#[test]
fn isolated_kernels_keep_original_and_edited_part_outputs_separate() {
    let source = archive(&[]);
    let mut a = FormatsKernel::default();
    let mut b = FormatsKernel::default();
    for k in [&mut a, &mut b] {
        k.request(json!({"op":"configure","format":"ofd"})).unwrap();
        assert_eq!(k.open(source.clone()).unwrap()["kernel"], "rust");
    }
    a.request(json!({"op":"remove","path":"Doc/Page.xml"}))
        .unwrap();
    assert!(a
        .request(json!({"op":"part","path":"Doc/Page.xml"}))
        .is_err());
    b.request(json!({"op":"part","path":"Doc/Page.xml"}))
        .unwrap();
    assert_eq!(b.save().unwrap(), b"<Page/>");
    a.request(json!({"op":"source"})).unwrap();
    assert_eq!(a.save().unwrap(), source);
}

#[test]
fn native_save_snapshot_runs_independently_while_the_live_package_changes() {
    let mut live = Package::open(archive(&[]), &Value::Null).unwrap();
    live.prepare_part("Doc/Page.xml").unwrap();
    live.upload(b"<Page>before save</Page>".to_vec()).unwrap();
    let mut frozen = live.snapshot();
    let worker = std::thread::spawn(move || frozen.write(false).unwrap());
    live.prepare_part("Doc/Page.xml").unwrap();
    live.upload(b"<Page>new live edit</Page>".to_vec()).unwrap();
    let mut saved = Package::open(worker.join().unwrap(), &Value::Null).unwrap();
    assert_eq!(
        saved.text("Doc/Page.xml").unwrap(),
        "<Page>before save</Page>"
    );
    assert_eq!(
        live.text("Doc/Page.xml").unwrap(),
        "<Page>new live edit</Page>"
    );
    assert_eq!(live.state()["dirty"], true);
}

#[test]
fn signatures_from_the_original_writer_keep_integrity_crypto_and_trust_separate() {
    use base64::{engine::general_purpose::STANDARD, Engine};
    use cubeoffice_formats_core::ofd::signatures::VerificationPlan;
    use sha1::{Digest, Sha1};
    let fixtures: Value = serde_json::from_str(include_str!(
        "../../../packages/ofd/tests/fixtures/rust-signatures.json"
    ))
    .unwrap();
    for fixture in fixtures["cases"].as_array().unwrap() {
        let mut p = Package::open(
            STANDARD.decode(fixture["bytes"].as_str().unwrap()).unwrap(),
            &Value::Null,
        )
        .unwrap();
        let plan = VerificationPlan::new(&mut p).unwrap();
        let mut replies = Vec::new();
        let mut providers = Vec::new();
        for (i, item) in plan.projection().as_array().unwrap().iter().enumerate() {
            for (j, reference) in item["references"].as_array().unwrap().iter().enumerate() {
                if reference["missing"] == true {
                    continue;
                }
                let bytes = p.read(reference["path"].as_str().unwrap()).unwrap();
                replies.push(json!({"entry":i,"reference":j,"path":reference["path"],"digest":STANDARD.encode(Sha1::digest(&bytes))}));
            }
            if let Some(c) = item["context"].as_object() {
                let descriptor = p.read(c["descriptorPath"].as_str().unwrap()).unwrap();
                let value = p.read(c["valuePath"].as_str().unwrap()).unwrap();
                providers.push(json!({"entry":i,"valid":Sha1::digest(descriptor).as_slice()==value,"trusted":false}));
            }
        }
        assert_eq!(
            plan.finish(&json!(replies), &json!(providers)).unwrap(),
            fixture["expected"],
            "{}",
            fixture["name"]
        );
    }
}
#[test]
fn signing_stages_preserve_the_source_and_invalid_nonce_is_atomic() {
    use cubeoffice_formats_core::ofd::signatures::Signing;
    let source = archive(&[("Doc/opaque.bin", &[0, 255, 2])]);
    let p = Package::open(source.clone(), &Value::Null).unwrap();
    assert!(Signing::begin(&p, &json!({"nonce":"../bad","indexNonce":"safe"})).is_err());
    let(mut staged,plan)=Signing::begin(&p,&json!({"nonce":"test1","indexNonce":"index1","provider":{"name":"Test"},"signedAt":"2026-10-25","signatureMethod":"custom"})).unwrap();
    assert_eq!(p.original().unwrap(), source);
    assert_eq!(p.state()["dirty"], false);
    assert_eq!(staged.read("Doc/opaque.bin").unwrap(), [0, 255, 2]);
    assert!(plan.descriptor(&json!({})).is_err());
    assert!(Signing::begin(
        &p,
        &json!({"documentIndex":-1,"nonce":"test","indexNonce":"index"})
    )
    .is_err());
}
#[test]
fn portable_image_and_docx_writers_retain_dimensions_resources_and_text() {
    use cubeoffice_formats_core::ofd::write::{self, ImagePage};
    let image = [137, 80, 78, 71, 0, 1, 255];
    let bytes = write::image_ofd(
        &[ImagePage {
            bytes: &image,
            width: 320.5,
            height: 240.0,
        }],
        "fixed-id",
    )
    .unwrap();
    let mut p = Package::open(bytes, &Value::Null).unwrap();
    assert_eq!(
        p.describe(&Value::Null).unwrap()[0]["pages"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(p.read("Doc_0/Res/image_0.png").unwrap(), image);
    assert!(p
        .text("Doc_0/Pages/Page_0/Content.xml")
        .unwrap()
        .contains("84.79895833333333"));
    assert!(write::image_ofd(&[], "id").is_err());
    assert!(write::image_ofd(
        &[ImagePage {
            bytes: &image,
            width: f64::INFINITY,
            height: 1.0
        }],
        "id"
    )
    .is_err());
    let docx = write::docx(&["中文<&\n😀".into(), "page 2\u{0}".into()]).unwrap();
    let mut zip = zip::ZipArchive::new(Cursor::new(docx)).unwrap();
    let mut xml = String::new();
    std::io::Read::read_to_string(&mut zip.by_name("word/document.xml").unwrap(), &mut xml)
        .unwrap();
    assert!(xml.contains("中文&lt;&amp;"));
    assert!(xml.contains("type=\"page\""));
    assert!(xml.contains("😀"));
    assert!(xml.contains("page 2\u{fffd}"));
}

#[test]
fn appending_signatures_preserves_namespaced_index_extension_attributes() {
    use base64::{engine::general_purpose::STANDARD, Engine};
    use cubeoffice_formats_core::ofd::signatures::Signing;
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../packages/ofd/tests/fixtures/rust-signatures.json"
    ))
    .unwrap();
    let mut p = Package::open(
        STANDARD
            .decode(fixture["cases"][0]["bytes"].as_str().unwrap())
            .unwrap(),
        &Value::Null,
    )
    .unwrap();
    let index = p
        .paths()
        .into_iter()
        .find(|s| s.ends_with("/Signatures.xml"))
        .unwrap();
    let original = p.text(&index).unwrap().replacen(
        "<ofd:Signatures ",
        "<ofd:Signatures xmlns:x='urn:opaque' x:MaxSignId='keep' ",
        1,
    );
    p.set(&index, original.into_bytes()).unwrap();
    let (mut appended, _) = Signing::begin(
        &p,
        &json!({"nonce":"next","indexNonce":"unused","provider":{"name":"Test"}}),
    )
    .unwrap();
    let text = appended.text(&index).unwrap();
    let doc = xml::parse(&text).unwrap();
    let root = doc.root_element();
    assert_eq!(root.attribute(("urn:opaque", "MaxSignId")), Some("keep"));
    assert_eq!(root.attribute("MaxSignId"), Some("snext"));
    assert_eq!(xml::children(root, "Signature").len(), 2);
}

#[test]
fn signing_utf16_xml_updates_its_encoding_declaration_without_reencoding_other_parts() {
    use cubeoffice_formats_core::ofd::signatures::Signing;
    let xml="<?xml version='1.0' encoding = 'UTF-16'?><OFD><DocBody><DocRoot>Doc/Document.xml</DocRoot></DocBody></OFD>";
    let bytes = [
        vec![255, 254],
        xml.encode_utf16().flat_map(u16::to_le_bytes).collect(),
    ]
    .concat();
    let source = archive(&[("OFD.xml", &bytes), ("Doc/original-utf16.xml", &bytes)]);
    let original = Package::open(source.clone(), &Value::Null).unwrap();
    let (mut p, _) =
        Signing::begin(&original, &json!({"nonce":"next","indexNonce":"index"})).unwrap();
    assert!(p.text("OFD.xml").unwrap().contains("encoding = 'UTF-8'"));
    assert_eq!(p.read("Doc/original-utf16.xml").unwrap(), bytes);
    assert_eq!(original.original().unwrap(), source);
}
