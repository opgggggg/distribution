use cubeoffice_formats_core::{
    text::{decode_page, TextSession},
    FormatsKernel,
};
use office_browser_abi::BrowserKernel;
use serde_json::json;

#[test]
fn unicode_changes_are_atomic_and_history_is_owned_by_rust() {
    let mut s = TextSession::open("a😀中\r\nb".as_bytes().to_vec(), "utf-8").unwrap();
    s.request(json!({"op":"changes","changes":[{"from":3,"to":4,"insert":"水"}]}))
        .unwrap();
    assert_eq!(
        s.request(json!({"op":"text"})).unwrap()["text"],
        "a😀水\r\nb"
    );
    assert!(s
        .request(json!({"op":"changes","changes":[{"from":2,"to":3,"insert":"invalid"}]}))
        .is_err());
    assert_eq!(s.projection()["revision"], 1);
    s.request(json!({"op":"undo"})).unwrap();
    assert_eq!(s.projection()["dirty"], false);
    s.request(json!({"op":"redo"})).unwrap();
    assert_eq!(s.projection()["dirty"], true);
    s.request(json!({"op":"readonly","value":true})).unwrap();
    assert!(s.request(json!({"op":"undo"})).is_err());
}
#[test]
fn detached_saves_do_not_acknowledge_new_edits_or_stale_delivery() {
    let mut s = TextSession::open(b"original".to_vec(), "utf-8").unwrap();
    s.request(json!({"op":"set","text":"first"})).unwrap();
    let first = s.request(json!({"op":"snapshot"})).unwrap()["token"].clone();
    s.request(json!({"op":"set","text":"second"})).unwrap();
    let second = s.request(json!({"op":"snapshot"})).unwrap()["token"].clone();
    s.request(json!({"op":"encodeSnapshot","token":first}))
        .unwrap();
    assert_eq!(s.encode().unwrap(), b"first");
    s.request(json!({"op":"acknowledge","token":first}))
        .unwrap();
    assert_eq!(s.projection()["dirty"], true);
    s.request(json!({"op":"acknowledge","token":second}))
        .unwrap();
    assert_eq!(s.projection()["dirty"], false);
    assert_eq!(
        s.request(json!({"op":"acknowledge","token":first}))
            .unwrap_err()
            .code,
        "StaleSave"
    );
    s.request(json!({"op":"undo"})).unwrap();
    assert_eq!(s.projection()["dirty"], true);
}
#[test]
fn mixed_newlines_original_bytes_and_utf16_bom_survive() {
    let bytes = b"one\r\ntwo\nthree\r".to_vec();
    let mut s = TextSession::open(bytes.clone(), "utf-8").unwrap();
    assert_eq!(s.encode().unwrap(), bytes);
    s.request(json!({"op":"set","text":"changed"})).unwrap();
    s.request(json!({"op":"undo"})).unwrap();
    assert_eq!(s.encode().unwrap(), bytes);
    for (bytes, expected) in [
        (vec![255, 254, 65, 0], vec![255, 254, 0x2d, 0x4e]),
        (vec![254, 255, 0, 65], vec![254, 255, 0x4e, 0x2d]),
    ] {
        let mut s = TextSession::open(bytes, "utf-8").unwrap();
        s.request(json!({"op":"set","text":"中"})).unwrap();
        assert_eq!(s.encode().unwrap(), expected);
    }
}
#[test]
fn legacy_encoding_is_readable_without_lossy_save() {
    let mut s = TextSession::open(vec![0xd6, 0xd0], "gb18030").unwrap();
    assert_eq!(s.request(json!({"op":"text"})).unwrap()["text"], "中");
    assert_eq!(s.encode().unwrap(), vec![0xd6, 0xd0]);
    s.request(json!({"op":"set","text":"文"})).unwrap();
    assert_eq!(s.encode().unwrap_err().code, "UnsupportedEncoding");
    assert!(TextSession::open(vec![255], "utf-8").is_err());
    assert!(TextSession::open(vec![0], "utf-8").is_err());
}
#[test]
fn history_is_bounded_and_branches_after_undo() {
    let mut s = TextSession::open(Vec::new(), "utf-8").unwrap();
    for n in 0..205 {
        s.request(json!({"op":"set","text":format!("{n}")}))
            .unwrap();
    }
    for _ in 0..200 {
        s.request(json!({"op":"undo"})).unwrap();
    }
    assert_eq!(s.projection()["canUndo"], false);
    assert_eq!(s.request(json!({"op":"text"})).unwrap()["text"], "4");
    s.request(json!({"op":"set","text":"new branch"})).unwrap();
    assert_eq!(s.projection()["canRedo"], false);
}
#[test]
fn paged_offsets_stay_64_bit_and_keep_unicode_boundaries() {
    let start = 5 * 1024_u64.pow(3);
    let p=decode_page("😀中文abc".as_bytes(),&json!({"paged":true,"head":[65],"offset":start,"readStart":start,"size":start+100,"budget":8})).unwrap();
    assert_eq!(p["start"], start);
    assert_eq!(p["end"], start + 7);
    assert_eq!(p["text"], "😀中");
    let p = decode_page(
        &[0x3d, 0xd8, 0, 0xde, 65, 0],
        &json!({"paged":true,"head":[255,254],"offset":100,"readStart":100,"size":106,"budget":3}),
    )
    .unwrap();
    assert_eq!(p["text"], "");
    assert_eq!(p["end"], 100);
    assert!(decode_page(&[255], &json!({})).is_err());
}
#[test]
fn search_reports_original_offsets_for_case_expansion_emoji_and_final_sigma() {
    let mut k = FormatsKernel::default();
    let matches = k
        .request(json!({"op":"search","text":"😀İ BIRD ΟΣ","query":"bird"}))
        .unwrap();
    assert_eq!(matches, json!([{"from":4,"to":8}]));
    assert_eq!(
        k.request(json!({"op":"search","text":"😀İx","query":"x"}))
            .unwrap(),
        json!([{"from":3,"to":4}])
    );
    assert_eq!(
        k.request(json!({"op":"search","text":"ΟΣ","query":"ος"}))
            .unwrap(),
        json!([{"from":0,"to":2}])
    );
}
#[test]
fn abi_format_switch_and_failed_open_are_atomic() {
    let mut k = FormatsKernel::default();
    assert!(k.open(Vec::new()).is_err());
    k.request(json!({"op":"configure","format":"text"}))
        .unwrap();
    k.open(b"keep".to_vec()).unwrap();
    assert!(k.open(vec![255]).is_err());
    assert_eq!(k.request(json!({"op":"text"})).unwrap()["text"], "keep");
    k.request(json!({"op":"configure","format":"epub"}))
        .unwrap();
    assert!(k.save().is_err());
    assert!(k.open(vec![1, 2, 3]).is_err());
}

#[test]
fn typing_groups_restore_selection_and_undo_breaks_the_group() {
    let mut s = TextSession::open(b"a".to_vec(), "utf-8").unwrap();
    let sel = |at| json!({"ranges":[{"anchor":at,"head":at}],"main":0});
    for at in 1..4 {
        s.request(json!({"op":"changes","changes":[{"from":at,"to":at,"insert":"b"}],"group":"typing","selectionBefore":sel(at),"selectionAfter":sel(at+1)})).unwrap();
    }
    s.request(json!({"op":"undo"})).unwrap();
    assert_eq!(s.request(json!({"op":"text"})).unwrap()["text"], "a");
    assert_eq!(s.projection()["selection"], sel(1));
    s.request(json!({"op":"redo"})).unwrap();
    assert_eq!(s.request(json!({"op":"text"})).unwrap()["text"], "abbb");
    assert_eq!(s.projection()["selection"], sel(4));
    let revision = s.projection()["revision"].clone();
    assert!(s.request(json!({"op":"changes","changes":[{"from":4,"to":4,"insert":"x"}],"selectionAfter":sel(999)})).is_err());
    assert_eq!(s.projection()["revision"], revision);
}

#[test]
fn native_epub_metadata_fallback_nav_resources_and_original_export() {
    use std::io::{Cursor, Write};
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (name,text) in [
        ("META-INF/container.xml","<container><rootfiles><rootfile full-path=\"OEBPS/book.opf\"/></rootfiles></container>"),
        ("OEBPS/book.opf","<package><metadata><title>Native &amp; 书</title><meta property=\"rendition:layout\">pre-paginated</meta></metadata><manifest><item id=\"foreign\" href=\"unsupported.bin\" media-type=\"application/unknown\" fallback=\"one\"/><item id=\"one\" href=\"one.xhtml\" media-type=\"application/xhtml+xml\"/><item id=\"nav\" href=\"nav.xhtml\" properties=\"nav\"/></manifest><spine page-progression-direction=\"rtl\"><itemref idref=\"foreign\"/></spine></package>"),
        ("OEBPS/one.xhtml","<html><body>中文</body></html>"),
        ("OEBPS/nav.xhtml","<nav epub:type=\"toc\"><ol><li><a href=\"one.xhtml#s2\">One&nbsp;chapter</a></li></ol></nav>"),
    ] {zip.start_file(name,zip::write::SimpleFileOptions::default()).unwrap();zip.write_all(text.as_bytes()).unwrap();}
    let bytes = zip.finish().unwrap().into_inner();
    let mut k = FormatsKernel::default();
    k.request(json!({"op":"configure","format":"epub"}))
        .unwrap();
    let book = k.open(bytes.clone()).unwrap();
    assert_eq!(book["metadata"]["title"], "Native & 书");
    assert_eq!(book["spine"][0]["id"], "one");
    assert_eq!(book["layout"], "pre-paginated");
    assert_eq!(book["direction"], "rtl");
    assert_eq!(book["toc"][0]["label"], "One chapter");
    assert_eq!(book["toc"][0]["fragment"], "s2");
    assert_eq!(k.save().unwrap(), bytes);
    assert_eq!(
        k.request(json!({"op":"resource","path":"oebps/ONE.xhtml"}))
            .unwrap()["found"],
        true
    );
    assert_eq!(
        k.save().unwrap(),
        "<html><body>中文</body></html>".as_bytes()
    );
    k.request(json!({"op":"source"})).unwrap();
    assert_eq!(k.save().unwrap(), bytes);
}
