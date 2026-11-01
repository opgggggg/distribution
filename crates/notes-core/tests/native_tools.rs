#![cfg(feature = "native-renderer")]
use cubeoffice_notes_core::{
    codec, model,
    native::{FrameRenderer, InputSample, Surface},
};
use serde_json::json;
fn p(x: f64, y: f64) -> InputSample {
    InputSample {
        x,
        y,
        pressure: 0.5,
        time_ms: x + y,
    }
}
fn draw(s: &mut Surface, points: &[InputSample]) {
    s.input(0, -3, true, &points[..1]).unwrap();
    s.input(2, -3, true, &points[1..]).unwrap();
}
#[test]
fn native_drag_projects_guides_and_commits_snapping_once_with_cancel_and_bypass() {
    let mut s = Surface::new();
    for x in [100.0, 400.0] {
        s.set_tool("rectangle").unwrap();
        draw(&mut s, &[p(x, 100.0), p(x + 100.0, 200.0)]);
    }
    let before = elements(&s);
    let steps = s.snapshot().history.past.len();
    s.input(0, -27, true, &[p(450.0, 150.0)]).unwrap();
    s.input(1, -27, true, &[p(477.0, 153.0)]).unwrap();
    assert!(s.state(744.0, 1000.0)["guides"]
        .as_array()
        .unwrap()
        .iter()
        .any(|g| g["axis"] == "y"));
    assert_eq!(s.snapshot().history.past.len(), steps);
    s.input(3, -27, true, &[]).unwrap();
    assert_eq!(s.guides(), json!([]));
    assert_eq!(elements(&s), before);
    draw(&mut s, &[p(450.0, 150.0), p(477.0, 153.0)]);
    assert_eq!(s.snapshot().history.past.len(), steps + 1);
    assert_eq!(
        elements(&s)[1]["points"][0]["y"],
        before[1]["points"][0]["y"]
    );
    assert_eq!(s.guides(), json!([]));
    s.action(100).unwrap();
    s.set_guides(false, false);
    draw(&mut s, &[p(400.0, 150.0)]);
    draw(&mut s, &[p(450.0, 150.0), p(477.0, 153.0)]);
    assert!((elements(&s)[1]["points"][0]["y"].as_f64().unwrap() - 103.0).abs() < 1e-8);
}
fn elements(s: &Surface) -> serde_json::Value {
    s.session.document.pages[0]["layers"][0]["elements"].clone()
}
#[test]
fn selection_color_updates_content_atomically_with_opacity_and_undo() {
    let mut s = Surface::new();
    draw(&mut s, &[p(50.0, 80.0), p(150.0, 90.0)]);
    s.insert_text("颜色").unwrap();
    let before = elements(&s);
    s.action(12).unwrap();
    s.selection_action("selectAll").unwrap();
    let steps = s.snapshot().history.past.len();
    s.color("#AABBCC", 0.4).unwrap();
    assert_eq!(s.active_color(), "#aabbcc");
    assert_eq!(elements(&s)[0]["color"], "#aabbcc");
    assert_eq!(elements(&s)[0]["opacity"], 0.4);
    assert_eq!(elements(&s)[1]["color"], "#aabbcc");
    assert!(elements(&s)[1].get("opacity").is_none());
    assert_eq!(s.snapshot().history.past.len(), steps + 1);
    s.color("#aabbcc", 0.4).unwrap();
    assert_eq!(s.snapshot().history.past.len(), steps + 1);
    let colored = elements(&s);
    assert!(s.color("#123456", f64::NAN).is_err());
    assert_eq!(elements(&s), colored);
    s.session.set_readonly(true);
    assert!(s.color("#123456", 1.0).is_err());
    assert_eq!(s.active_color(), "#aabbcc");
    assert_eq!(elements(&s), colored);
    s.session.set_readonly(false);
    s.action(100).unwrap();
    assert_eq!(elements(&s), before);
    s.action(101).unwrap();
    assert_eq!(elements(&s), colored);
    s.selection_action("selectAll").unwrap();
    s.select_color("#ff1234", None).unwrap();
    assert_eq!(elements(&s)[0]["opacity"], 0.4);
    s.action(100).unwrap();
    assert_eq!(elements(&s), colored);
}
#[test]
fn attached_arrows_follow_moved_shapes_and_delete_with_endpoints_including_hidden_layers() {
    let mut s = Surface::new();
    s.set_tool("rectangle").unwrap();
    draw(&mut s, &[p(20.0, 40.0), p(100.0, 120.0)]);
    assert_eq!(s.state(744.0, 1000.0)["tool"], "lasso");
    assert_eq!(elements(&s)[0]["shape"], "rectangle");
    let steps = s.snapshot().history.past.len();
    s.selection_action("connect").unwrap();
    assert_eq!(elements(&s).as_array().unwrap().len(), 3);
    assert_eq!(s.snapshot().history.past.len(), steps + 1);
    let original = elements(&s);
    let target = &original[1];
    let x = target["points"][0]["x"].as_f64().unwrap() + 40.0;
    let y = target["points"][0]["y"].as_f64().unwrap() + 40.0;
    draw(&mut s, &[p(x, y), p(x + 30.0, y + 50.0)]);
    let moved = elements(&s);
    assert_eq!(moved[2]["points"][0], original[2]["points"][0]);
    assert!(
        (moved[2]["points"][1]["x"].as_f64().unwrap()
            - original[2]["points"][1]["x"].as_f64().unwrap()
            - 30.0)
            .abs()
            < 1e-6
    );
    assert!(
        (moved[2]["points"][1]["y"].as_f64().unwrap()
            - original[2]["points"][1]["y"].as_f64().unwrap()
            - 50.0)
            .abs()
            < 1e-6
    );
    s.change(&json!({"kind":"layer","action":"add"})).unwrap();
    s.edit_page(|page| {
        let arrow = page["layers"][0]["elements"]
            .as_array_mut()
            .unwrap()
            .pop()
            .unwrap();
        page["layers"][1]["elements"]
            .as_array_mut()
            .unwrap()
            .push(arrow);
        page["layers"][1]["visible"] = json!(false);
    })
    .unwrap();
    s.selection_action("delete").unwrap();
    assert_eq!(elements(&s).as_array().unwrap().len(), 1);
    assert_eq!(
        s.session.document.pages[0]["layers"][1]["elements"],
        json!([])
    );
    s.action(100).unwrap();
    assert_eq!(elements(&s).as_array().unwrap().len(), 2);
    assert_eq!(
        s.session.document.pages[0]["layers"][1]["elements"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let before = s.snapshot().document.value();
    s.session.set_readonly(true);
    assert!(s.selection_action("connect").is_err());
    assert_eq!(s.snapshot().document.value(), before);
}
#[test]
fn duplicate_keeps_pigment_and_remaps_copied_connector_targets_in_one_step() {
    let mut s = Surface::new();
    for x in [20.0, 200.0] {
        s.set_tool("rectangle").unwrap();
        draw(&mut s, &[p(x, 40.0), p(x + 80.0, 120.0)]);
    }
    s.action(8).unwrap();
    draw(&mut s, &[p(50.0, 180.0), p(100.0, 190.0)]);
    let initial = elements(&s);
    let mut connector = initial[0].clone();
    connector.as_object_mut().unwrap().remove("shape");
    connector["id"] = json!("connection");
    connector["connector"] = json!({"from":{"elementId":initial[0]["id"],"side":"right"},"to":{"elementId":initial[1]["id"],"side":"left"}});
    s.edit_page(|page| {
        page["layers"][0]["elements"]
            .as_array_mut()
            .unwrap()
            .push(connector.clone())
    })
    .unwrap();
    s.action(12).unwrap();
    s.selection_action("selectAll").unwrap();
    let before = elements(&s);
    let steps = s.snapshot().history.past.len();
    s.selection_action("duplicate").unwrap();
    let copied = elements(&s);
    assert_eq!(copied.as_array().unwrap().len(), 8);
    assert_eq!(s.snapshot().history.past.len(), steps + 1);
    assert_eq!(copied[7]["connector"]["from"]["elementId"], copied[4]["id"]);
    assert_eq!(copied[7]["connector"]["to"]["elementId"], copied[5]["id"]);
    assert_eq!(
        copied[7]["points"][0]["x"].as_f64().unwrap(),
        before[3]["points"][0]["x"].as_f64().unwrap() + 12.0
    );
    let seed = before[2]["id"]
        .as_str()
        .unwrap()
        .chars()
        .fold(2166136261u32, |seed, c| {
            let mut units = [0; 2];
            (seed ^ c.encode_utf16(&mut units)[0] as u32).wrapping_mul(16777619)
        });
    assert_eq!(copied[6]["brushSeed"], seed);
    s.action(100).unwrap();
    assert_eq!(elements(&s), before);
    s.action(101).unwrap();
    assert_eq!(elements(&s), copied);
}
#[test]
fn highlighter_preview_matches_commit_and_switching_keeps_both_presets() {
    let mut s = Surface::new();
    s.color("#123456", 1.0).unwrap();
    s.action(10).unwrap();
    s.color("#facc15", 0.3).unwrap();
    s.tool_settings(20.0, 0.3, false, json!({})).unwrap();
    s.input(0, -8, false, &[p(60.0, 80.0)]).unwrap();
    s.input(1, -8, false, &[p(180.0, 90.0)]).unwrap();
    let preview = FrameRenderer::new().render(&s.capture(), 300, 400).unwrap();
    s.input(2, -8, false, &[p(180.0, 90.0)]).unwrap();
    let committed = FrameRenderer::new().render(&s.capture(), 300, 400).unwrap();
    let max_delta = preview
        .data()
        .iter()
        .zip(committed.data())
        .map(|(a, b)| a.abs_diff(*b))
        .max()
        .unwrap();
    assert!(
        max_delta <= 1,
        "alpha compositing differs by {max_delta} levels"
    );
    assert_eq!(elements(&s)[0]["tool"], "highlighter");
    assert!(elements(&s)[0].get("penStyle").is_none());
    s.action(1).unwrap();
    assert_eq!(s.active_color(), "#123456");
    s.action(10).unwrap();
    assert_eq!(s.active_width(), 20.0);
    assert_eq!(s.active_opacity(), 0.3);
}
#[test]
fn eraser_sweeps_preserve_pigment_and_commit_once_with_cancel_and_redo() {
    let mut s = Surface::new();
    s.action(8).unwrap();
    draw(&mut s, &[p(50.0, 100.0), p(250.0, 100.0)]);
    let original = elements(&s)[0].clone();
    s.action(11).unwrap();
    s.eraser_mode("path").unwrap();
    let history = s.snapshot().history.past.len();
    s.input(0, -1, true, &[p(100.0, 60.0)]).unwrap();
    s.input(1, -1, true, &[p(100.0, 140.0)]).unwrap();
    assert_eq!(s.snapshot().history.past.len(), history);
    assert_ne!(s.capture().page["layers"][0]["elements"][0], original);
    s.input(3, -1, true, &[]).unwrap();
    assert_eq!(elements(&s)[0], original);
    draw(&mut s, &[p(100.0, 60.0), p(100.0, 140.0)]);
    assert_eq!(s.snapshot().history.past.len(), history + 1);
    let erased = elements(&s)[0].clone();
    for k in [
        "id",
        "penStyle",
        "brushVersion",
        "points",
        "brushSettings",
        "color",
    ] {
        assert_eq!(erased[k], original[k]);
    }
    assert!(erased["erasures"].as_array().unwrap().len() > 0);
    s.action(100).unwrap();
    assert_eq!(elements(&s)[0], original);
    s.action(101).unwrap();
    assert_eq!(elements(&s)[0], erased);
    s.action(11).unwrap();
    s.eraser_mode("stroke").unwrap();
    draw(&mut s, &[p(180.0, 80.0), p(180.0, 120.0)]);
    assert_eq!(elements(&s).as_array().unwrap().len(), 0);
    s.action(100).unwrap();
    assert_eq!(elements(&s)[0], erased);
}
#[test]
fn lasso_select_move_resize_duplicate_delete_and_archive_roundtrip() {
    let mut s = Surface::new();
    draw(&mut s, &[p(50.0, 100.0), p(150.0, 100.0)]);
    s.action(12).unwrap();
    draw(
        &mut s,
        &[
            p(40.0, 80.0),
            p(160.0, 80.0),
            p(160.0, 120.0),
            p(40.0, 120.0),
            p(40.0, 80.0),
        ],
    );
    let b = s.selection_bounds().unwrap();
    let before = elements(&s);
    let steps = s.snapshot().history.past.len();
    draw(&mut s, &[p(100.0, 100.0), p(130.0, 140.0)]);
    assert_eq!(s.snapshot().history.past.len(), steps + 1);
    assert!(
        (elements(&s)[0]["points"][0]["x"].as_f64().unwrap()
            - before[0]["points"][0]["x"].as_f64().unwrap()
            - 30.0)
            .abs()
            < 1e-6
    );
    let moved = s.selection_bounds().unwrap();
    assert!((moved.x - b.x - 30.0).abs() < 1e-6);
    s.selection_action("duplicate").unwrap();
    assert_eq!(elements(&s).as_array().unwrap().len(), 2);
    s.selection_action("delete").unwrap();
    assert_eq!(elements(&s).as_array().unwrap().len(), 1);
    s.action(100).unwrap();
    assert_eq!(elements(&s).as_array().unwrap().len(), 2);
    let bytes = codec::write(&s.snapshot(), &model::builtin_brushes()).unwrap();
    let (doc, history) = codec::read(&bytes, &model::builtin_brushes()).unwrap();
    assert_eq!(doc.value(), s.session.document.value());
    assert_eq!(history.past.len(), s.snapshot().history.past.len());
}
#[test]
fn page_panels_commands_photos_layers_and_tape_cutouts_are_real_model_edits() {
    let mut s = Surface::new();
    s.change(&json!({"kind":"paper","paper":"dotted"})).unwrap();
    assert_eq!(s.session.document.pages[0]["paper"], "dotted");
    s.change(&json!({"kind":"layer","action":"add"})).unwrap();
    assert_eq!(
        s.session.document.pages[0]["layers"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    s.change(&json!({"kind":"tape","action":"add"})).unwrap();
    draw(&mut s, &[p(10.0, 100.0), p(300.0, 100.0)]);
    assert_eq!(
        s.session.document.pages[0]["layers"][1]["elements"][0]["cutouts"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    s.set_tool("tape").unwrap();
    let t = s.session.document.pages[0]["tapes"][0].clone();
    let x = t["x"].as_f64().unwrap();
    let y = t["y"].as_f64().unwrap();
    draw(&mut s, &[p(x, y), p(x + 40.0, y + 30.0)]);
    assert_eq!(
        s.session.document.pages[0]["tapes"][0]["x"]
            .as_f64()
            .unwrap(),
        t["x"].as_f64().unwrap() + 40.0
    );
    s.session.set_readonly(true);
    assert!(s.change(&json!({"kind":"paper","paper":"plain"})).is_err());
    s.select_page(0).unwrap();
}
#[test]
fn shapes_and_text_use_collision_free_ids_and_survive_reopen() {
    let mut s = Surface::new();
    for tool in ["line", "rectangle", "ellipse"] {
        s.set_tool(tool).unwrap();
        draw(&mut s, &[p(20.0, 20.0), p(120.0, 120.0)]);
    }
    s.set_tool("text").unwrap();
    draw(&mut s, &[p(100.0, 200.0)]);
    s.insert_text("绘画笔记").unwrap();
    assert_eq!(elements(&s).as_array().unwrap().len(), 4);
    let bytes = codec::write(&s.snapshot(), &model::builtin_brushes()).unwrap();
    s.open(&bytes).unwrap();
    s.set_tool("rectangle").unwrap();
    draw(&mut s, &[p(40.0, 40.0), p(60.0, 60.0)]);
    assert_eq!(elements(&s).as_array().unwrap().len(), 5);
}
#[test]
fn all_four_lasso_corners_scale_around_the_opposite_corner_without_null_masks() {
    for (left, top) in [(true, true), (false, true), (true, false), (false, false)] {
        let mut s = Surface::new();
        s.set_tool("rectangle").unwrap();
        draw(&mut s, &[p(100.0, 100.0), p(200.0, 200.0)]);
        s.selection_action("selectAll").unwrap();
        s.set_tool("lasso").unwrap();
        let before = s.selection_bounds().unwrap();
        let x = before.x + if left { 0.0 } else { before.width };
        let y = before.y + if top { 0.0 } else { before.height };
        draw(
            &mut s,
            &[
                p(x, y),
                p(
                    x + if left { -20.0 } else { 20.0 },
                    y + if top { -20.0 } else { 20.0 },
                ),
            ],
        );
        let after = s.selection_bounds().unwrap();
        assert!(after.width > before.width + 19.0);
        assert!(after.height > before.height + 19.0);
        let e = elements(&s)[0].clone();
        assert_eq!(e["width"], 2.0);
        assert!(e.get("cutouts").is_none());
        assert!(e.get("erasures").is_none());
        let bytes = codec::write(&s.snapshot(), &model::builtin_brushes()).unwrap();
        codec::read(&bytes, &model::builtin_brushes()).unwrap();
    }
}
#[test]
fn tape_center_coordinates_match_the_existing_format_and_can_resize_and_rotate() {
    let mut s = Surface::new();
    s.change(&json!({"kind":"tape","action":"add"})).unwrap();
    s.change(
        &json!({"kind":"tape","action":"update","x":200,"y":200,"width":200,"height":40,"angle":0}),
    )
    .unwrap();
    draw(&mut s, &[p(50.0, 200.0), p(350.0, 200.0)]);
    assert_eq!(
        elements(&s)[0]["cutouts"][0],
        json!([{"x":100.0,"y":180.0},{"x":300.0,"y":180.0},{"x":300.0,"y":220.0},{"x":100.0,"y":220.0}])
    );
    s.set_tool("tape").unwrap();
    draw(&mut s, &[p(300.0, 200.0), p(350.0, 200.0)]);
    assert_eq!(s.state(744.0, 1000.0)["tapes"][0]["width"], 250.0);
    assert_eq!(s.state(744.0, 1000.0)["tapes"][0]["x"], 225.0);
    draw(&mut s, &[p(225.0, 252.0), p(173.0, 200.0)]);
    assert_eq!(s.state(744.0, 1000.0)["tapes"][0]["angle"], 90.0);
    let steps = s.snapshot().history.past.len();
    draw(&mut s, &[p(500.0, 500.0), p(700.0, 700.0)]);
    assert_eq!(s.snapshot().history.past.len(), steps);
}
#[test]
fn native_photo_background_drag_scale_and_rotation_preserve_archive_raster_and_history() {
    let mut s = Surface::new();
    let src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
    s.change(
        &json!({"kind":"photo","src":src,"pixelWidth":400,"pixelHeight":300,"background":true}),
    )
    .unwrap();
    let original = s.session.document.pages[0].external()["background"].clone();
    s.set_tool("background").unwrap();
    draw(&mut s, &[p(200.0, 200.0), p(230.0, 240.0)]);
    let bg = s.session.document.pages[0].external()["background"].clone();
    assert_eq!(bg["src"], src);
    assert_eq!(
        bg["x"].as_f64().unwrap(),
        original["x"].as_f64().unwrap() + 30.0
    );
    s.change(&json!({"kind":"background","scale":1.2,"angle":45,"opacity":0.7}))
        .unwrap();
    assert_eq!(s.session.document.pages[0]["background"]["angle"], 45);
    s.action(100).unwrap();
    assert_eq!(s.session.document.pages[0].external()["background"], bg);
    s.action(101).unwrap();
    let bytes = codec::write(&s.snapshot(), &model::builtin_brushes()).unwrap();
    s.open(&bytes).unwrap();
    assert_eq!(
        s.session.document.pages[0].external()["background"]["src"],
        src
    );
    FrameRenderer::new()
        .render(&s.background_frame(), 300, 400)
        .unwrap();
}
#[test]
fn chosen_layer_receives_ink_text_shapes_and_images_after_switching() {
    let mut s = Surface::new();
    s.change(&json!({"kind":"layer","action":"add"})).unwrap();
    draw(&mut s, &[p(10.0, 20.0), p(50.0, 60.0)]);
    assert_eq!(
        s.session.document.pages[0]["layers"][0]["elements"],
        json!([])
    );
    assert_eq!(
        s.session.document.pages[0]["layers"][1]["elements"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    s.change(&json!({"kind":"layer","action":"select","index":0}))
        .unwrap();
    s.insert_text("第一层").unwrap();
    assert_eq!(elements(&s)[0]["kind"], "text");
    s.set_tool("rectangle").unwrap();
    draw(&mut s, &[p(20.0, 30.0), p(100.0, 120.0)]);
    assert_eq!(elements(&s).as_array().unwrap().len(), 2);
}

#[test]
fn selection_preview_is_transparent_and_restores_the_content_under_the_original_object() {
    let mut s = Surface::new();
    s.tool_settings(16.0, 1.0, false, json!({})).unwrap();
    s.color("#ff0000", 1.0).unwrap();
    draw(&mut s, &[p(100.0, 100.0), p(300.0, 100.0)]);
    s.color("#0000ff", 1.0).unwrap();
    draw(&mut s, &[p(100.0, 80.0), p(100.0, 300.0)]);
    s.action(12).unwrap();
    draw(&mut s, &[p(220.0, 100.0)]);
    let bg = s.selection_frame(false).unwrap();
    let fg = s.selection_frame(true).unwrap();
    assert_eq!(bg.viewport, fg.viewport);
    let w = 400;
    let h = (w as f64 * fg.viewport.height / fg.viewport.width).ceil() as u32;
    let mut r = FrameRenderer::new();
    let back = r.render(&bg, w, h).unwrap();
    let front = r.render(&fg, w, h).unwrap();
    assert_eq!(
        front.pixel(0, 0).unwrap().alpha(),
        0,
        "Selected-object preview was opaque"
    );
    assert!(front
        .data()
        .chunks_exact(4)
        .any(|p| p[0] > 200 && p[3] > 200));
    assert!(
        back.data().chunks_exact(4).any(|p| p[2] > 200 && p[0] < 50),
        "Background replacement erased an unselected overlapping object"
    );
    assert!(
        !back
            .data()
            .chunks_exact(4)
            .any(|p| p[0] > 200 && p[1] < 50 && p[2] < 50),
        "Original selected pixels were not removed"
    );
    let steps = s.snapshot().history.past.len();
    s.input(0, -40, true, &[p(220.0, 100.0)]).unwrap();
    s.input(1, -40, true, &[p(270.0, 150.0)]).unwrap();
    assert_eq!(s.selection_operation(), Some("move"));
    assert_eq!(
        s.state(744.0, 1000.0)["selectionIDs"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(s.selection_bounds().unwrap().x > s.selection_origin().unwrap().x + 30.0);
    let during = s.selection_frame(true).unwrap();
    assert_eq!(
        during.viewport, fg.viewport,
        "Moving recaptured an already-transformed object"
    );
    assert_eq!(*during.page, *fg.page);
    assert_eq!(s.snapshot().history.past.len(), steps);
    s.input(2, -40, true, &[]).unwrap();
    assert!(s.selection_operation().is_none());
    assert_eq!(s.snapshot().history.past.len(), steps + 1);
}

#[test]
fn restored_selection_menu_commands_align_space_resize_and_undo_atomically() {
    let mut s = Surface::new();
    for (x, y, w) in [
        (100.0, 100.0, 80.0),
        (400.0, 300.0, 120.0),
        (900.0, 200.0, 60.0),
    ] {
        s.set_tool("rectangle").unwrap();
        draw(&mut s, &[p(x, y), p(x + w, y + 80.0)]);
    }
    assert_eq!(s.state(744.0, 1000.0)["selectionConnectable"], true);
    s.selection_action("selectAll").unwrap();
    let before = elements(&s);
    let steps = s.snapshot().history.past.len();
    s.change(&json!({"kind":"selectionArrange","action":"left"}))
        .unwrap();
    let rectangle_bounds = |e: &serde_json::Value| {
        let points = e["points"].as_array().unwrap();
        let x = points
            .iter()
            .map(|p| p["x"].as_f64().unwrap())
            .fold(f64::INFINITY, f64::min);
        let max_x = points
            .iter()
            .map(|p| p["x"].as_f64().unwrap())
            .fold(f64::NEG_INFINITY, f64::max);
        let y = points
            .iter()
            .map(|p| p["y"].as_f64().unwrap())
            .fold(f64::INFINITY, f64::min);
        let max_y = points
            .iter()
            .map(|p| p["y"].as_f64().unwrap())
            .fold(f64::NEG_INFINITY, f64::max);
        let width = e["width"].as_f64().unwrap();
        cubeoffice_notes_core::render::Bounds {
            x: x - width / 2.0,
            y: y - width / 2.0,
            width: max_x - x + width,
            height: max_y - y + width,
        }
    };
    let aligned = elements(&s);
    let boxes = aligned
        .as_array()
        .unwrap()
        .iter()
        .map(rectangle_bounds)
        .collect::<Vec<_>>();
    assert!(boxes.iter().all(|b| (b.x - boxes[0].x).abs() < 1e-6));
    assert_eq!(s.snapshot().history.past.len(), steps + 1);
    s.action(100).unwrap();
    assert_eq!(elements(&s), before);
    s.selection_action("selectAll").unwrap();
    s.change(&json!({"kind":"selectionArrange","action":"horizontal"}))
        .unwrap();
    let spaced = elements(&s);
    let boxes = spaced
        .as_array()
        .unwrap()
        .iter()
        .map(rectangle_bounds)
        .collect::<Vec<_>>();
    assert!(
        ((boxes[1].x - boxes[0].x - boxes[0].width) - (boxes[2].x - boxes[1].x - boxes[1].width))
            .abs()
            < 1e-6
    );
    s.change(&json!({"kind":"selectionWidth","value":8.0}))
        .unwrap();
    assert!(elements(&s)
        .as_array()
        .unwrap()
        .iter()
        .all(|e| e["width"] == 8.0));
    let b = s.selection_bounds().unwrap();
    s.change(&json!({"kind":"selectionScale","value":1.1}))
        .unwrap();
    let scaled = s.selection_bounds().unwrap();
    // Original resizing scales the path geometry and retains the stroke width.
    assert!(((scaled.width - 8.0) / (b.width - 8.0) - 1.1).abs() < 1e-6);
    let before_invalid = s.snapshot().history.past.len();
    assert!(s
        .change(&json!({"kind":"selectionArrange","action":"bogus"}))
        .is_err());
    assert!(s
        .change(&json!({"kind":"selectionWidth","value":-1.0}))
        .is_err());
    assert_eq!(s.snapshot().history.past.len(), before_invalid);
}

#[test]
fn restored_selection_menu_edits_text_and_saves_selected_region() {
    let mut s = Surface::new();
    s.insert_text("原文字").unwrap();
    s.selection_action("selectAll").unwrap();
    assert_eq!(s.state(744.0, 1000.0)["selectionText"], "原文字");
    let before = s.snapshot().history.past.len();
    s.change(&json!({"kind":"selectionText","text":"修改后的文字"}))
        .unwrap();
    assert_eq!(elements(&s)[0]["text"], "修改后的文字");
    assert_eq!(s.snapshot().history.past.len(), before + 1);
    let bounds = s.selection_bounds().unwrap();
    s.scene("练习区域", None).unwrap();
    let saved = &s.session.document.pages[0]["scenes"][0];
    assert_eq!(saved["x"], bounds.x);
    assert_eq!(saved["width"], bounds.width);
    assert_eq!(s.state(744.0, 1000.0)["sceneCount"], 1);
    s.action(100).unwrap();
    s.action(100).unwrap();
    assert_eq!(elements(&s)[0]["text"], "原文字");
}
