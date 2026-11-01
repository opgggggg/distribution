use cubeoffice_notes_core::{browser::NotesKernel, ffi::*, model};
use serde_json::{json, Value};
fn book() -> Value {
    json!({"format":"cubeoffice-notebook","version":1,"title":"Original","pages":[{"id":"page","infinite":true,"width":595.28,"height":841.89,"paper":"grid","color":"#fffdf7","bookmarked":false,"layers":[{"id":"ink","name":"Ink","visible":true,"elements":[]}]}]})
}
#[test]
fn native_transactions_are_atomic_readonly_and_revision_checked() {
    let mut k = NotesKernel::default();
    k.command(json!({"op":"init","document":book()})).unwrap();
    let mut edit = book();
    edit["title"] = json!("Changed");
    assert!(k
        .command(json!({"op":"replace","document":edit,"baseRevision":8}))
        .is_err());
    assert_eq!(k.command(json!({"op":"state"})).unwrap()["revision"], 0);
    k.command(json!({"op":"replace","document":edit,"baseRevision":0}))
        .unwrap();
    let snapshot = k.session.as_ref().unwrap().snapshot();
    k.command(json!({"op":"undo","baseRevision":1})).unwrap();
    k.command(json!({"op":"markSaved","revision":1})).unwrap();
    assert!(k.session.as_ref().unwrap().dirty());
    assert_eq!(snapshot.document.title(), "Changed");
    assert_eq!(k.session.as_ref().unwrap().document.title(), "Original");
    k.command(json!({"op":"readonly","value":true})).unwrap();
    assert_eq!(
        k.command(json!({"op":"redo","baseRevision":2}))
            .unwrap_err()
            .code,
        "ReadOnly"
    );
    assert_eq!(snapshot.document.title(), "Changed");
}
#[test]
fn history_is_bounded_and_noops_do_not_destroy_redo() {
    let mut k = NotesKernel::default();
    k.command(json!({"op":"init","document":book()})).unwrap();
    for i in 0..210 {
        let mut edit = book();
        edit["title"] = json!(format!("Revision {i}"));
        k.command(json!({"op":"replace","document":edit,"baseRevision":i}))
            .unwrap();
    }
    assert_eq!(k.session.as_ref().unwrap().history.past.len(), 200);
    k.command(json!({"op":"undo","baseRevision":210})).unwrap();
    let state = k.command(json!({"op":"state"})).unwrap();
    let noop = k
        .command(json!({"op":"replace","document":state["document"],"baseRevision":211}))
        .unwrap();
    assert_eq!(noop["revision"], 211);
    assert_eq!(noop["future"].as_array().unwrap().len(), 1);
}
#[test]
fn strict_validation_preserves_the_previous_document_on_failure() {
    let mut k = NotesKernel::default();
    k.command(json!({"op":"init","document":book()})).unwrap();
    let mut edit = book();
    edit["pages"][0]["layers"][0]["id"] = json!("page");
    assert!(k
        .command(json!({"op":"replace","document":edit,"baseRevision":0}))
        .is_err());
    assert_eq!(k.command(json!({"op":"state"})).unwrap()["revision"], 0);
    assert!(model::validate(&book(), &model::builtin_brushes()).is_ok());
}

#[test]
fn malformed_history_and_archive_directory_are_rejected_before_indexing() {
    let brushes = model::builtin_brushes();
    let document = cubeoffice_notes_core::history::Document::from_value(book(), &brushes).unwrap();
    let state = serde_json::to_vec(&json!({"format":"cubeoffice-note-history","version":1,"pages":[],"past":[{"title":"Bad","pages":[i64::MIN]}],"future":[]})).unwrap();
    assert!(cubeoffice_notes_core::codec::decode_history(&state, &document, &brushes).is_err());
    let session = cubeoffice_notes_core::history::NotesSession::new(
        document,
        Default::default(),
        brushes.clone(),
        false,
    );
    let mut bytes = cubeoffice_notes_core::codec::write(&session.snapshot(), &brushes).unwrap();
    let end = bytes.len() - 22;
    bytes[end + 10..end + 12].copy_from_slice(&21u16.to_le_bytes());
    assert_eq!(
        cubeoffice_notes_core::codec::read(&bytes, &brushes)
            .unwrap_err()
            .code,
        "InvalidArchive"
    );
}
#[test]
fn native_ffi_handles_are_independent() {
    unsafe {
        let a = cube_notes_new();
        let b = cube_notes_new();
        let command = serde_json::to_vec(&json!({"op":"init","document":book()})).unwrap();
        assert_eq!(cube_notes_request(a, command.as_ptr(), command.len()), 0);
        assert_eq!(cube_notes_request(b, command.as_ptr(), command.len()), 0);
        let saved = cube_notes_snapshot(a);
        let mut edit = book();
        edit["title"] = json!("Only A");
        let change =
            serde_json::to_vec(&json!({"op":"replace","document":edit,"baseRevision":0})).unwrap();
        assert_eq!(cube_notes_request(a, change.as_ptr(), change.len()), 0);
        assert_eq!(cube_notes_snapshot_save(saved), 0);
        let bytes = std::slice::from_raw_parts(
            cube_notes_snapshot_output_ptr(saved),
            cube_notes_snapshot_output_len(saved),
        );
        let (detached, _) =
            cubeoffice_notes_core::codec::read(bytes, &model::builtin_brushes()).unwrap();
        assert_eq!(detached.title(), "Original");
        cube_notes_snapshot_free(saved);
        let state = br#"{"op":"state"}"#;
        assert_eq!(cube_notes_request(b, state.as_ptr(), state.len()), 0);
        let result: Value = serde_json::from_slice(std::slice::from_raw_parts(
            cube_notes_output_ptr(b),
            cube_notes_output_len(b),
        ))
        .unwrap();
        assert_eq!(result["document"]["title"], "Original");
        assert_eq!(cube_notes_save(a), 0);
        assert!(cube_notes_output_len(a) > 0);
        cube_notes_free(a);
        cube_notes_free(b);
    }
}

#[test]
fn raster_history_shares_allocations_and_bridge_only_sends_new_pages() {
    use std::sync::Arc;
    let mut document = book();
    let source = format!("data:image/png;base64,{}", "A".repeat(1024 * 1024));
    document["pages"][0]["background"] = json!({"id":"photo","kind":"image","src":source,"x":0,"y":0,"width":100,"height":100,"rotation":0,"opacity":1});
    let mut kernel = NotesKernel::default();
    let first = kernel
        .command(json!({"op":"init","document":document}))
        .unwrap();
    assert_eq!(first["photos"].as_object().unwrap().len(), 1);
    let source = kernel.session.as_ref().unwrap().document.pages[0].photo_sources()[0].clone();
    let mut page = document["pages"][0].clone();
    // Send the source using the bridge reference, just as the actual host does.
    page["background"]["src"] = json!("@wire-photo:1");
    for revision in 0..120 {
        page["bookmarked"] = json!(revision % 2 == 0);
        let output = kernel
            .command(
                json!({"op":"replacePage","pageId":"page","page":page,"baseRevision":revision}),
            )
            .unwrap();
        assert_eq!(output["photos"], json!({}));
        assert!(serde_json::to_vec(&output).unwrap().len() < 15000);
    }
    let session = kernel.session.as_ref().unwrap();
    assert_eq!(session.history.past.len(), 120);
    for frame in &session.history.past {
        assert!(Arc::ptr_eq(&source, &frame.pages[0].photo_sources()[0]));
    }
    let snapshot = session.snapshot();
    let bytes = cubeoffice_notes_core::codec::write(&snapshot, &model::builtin_brushes()).unwrap();
    let (reopened, history) =
        cubeoffice_notes_core::codec::read(&bytes, &model::builtin_brushes()).unwrap();
    assert_eq!(history.past.len(), 120);
    assert_eq!(
        reopened.value()["pages"][0]["background"]["src"],
        source.as_str()
    );
    assert!(history.past.iter().all(|frame| Arc::ptr_eq(
        &reopened.pages[0].photo_sources()[0],
        &frame.pages[0].photo_sources()[0]
    )));
    let repeated = kernel.command(json!({"op":"state"})).unwrap();
    assert_eq!(repeated["pagePool"], json!({}));
    assert_eq!(repeated["photos"], json!({}));
}

#[test]
fn xopp_reads_all_gzip_members_and_rejects_trailing_garbage() {
    use std::io::Write;
    let xml = br##"<xournal><page width="595.28" height="841.89"><background type="solid" color="#ffffff" style="plain"/><layer/></page></xournal>"##;
    let gzip = |bytes: &[u8]| {
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(bytes).unwrap();
        encoder.finish().unwrap()
    };
    let mut bytes = gzip(&xml[..50]);
    bytes.extend(gzip(&xml[50..]));
    let brushes = model::builtin_brushes();
    assert!(cubeoffice_notes_core::xopp::read(&bytes, "Split", &brushes).is_ok());
    bytes.extend(b"broken gzip member");
    assert!(cubeoffice_notes_core::xopp::read(&bytes, "Broken", &brushes).is_err());
}
