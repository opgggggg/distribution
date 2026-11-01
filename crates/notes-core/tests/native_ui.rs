#![cfg(feature = "native-renderer")]
use cubeoffice_notes_core::{
    native::{InputSample, Surface},
    native_ui,
};
use serde_json::json;
#[test]
fn brush_presets_survive_switching_and_invalid_settings_are_atomic() {
    let mut s = Surface::new();
    s.action(2).unwrap();
    s.color("#e65023", 0.7).unwrap();
    s.tool_settings(9.0, 0.4, false, json!({"dryness":70}))
        .unwrap();
    s.action(4).unwrap();
    assert_eq!(s.state(744.0, 1000.0)["width"], 24.0);
    s.action(2).unwrap();
    let state = s.state(744.0, 1000.0);
    assert_eq!(state["width"], 9.0);
    assert_eq!(state["color"], "#e65023");
    assert_eq!(state["opacity"], 0.4);
    assert_eq!(state["settings"]["dryness"], 70);
    assert_eq!(state["pressure"], false);
    assert!(s
        .tool_settings(25.0, 1.0, true, json!({"dryness":70}))
        .is_err());
    assert!(s
        .tool_settings(4.0, 1.0, true, json!({"dryness":101}))
        .is_err());
    assert_eq!(s.state(744.0, 1000.0), state);
    s.begin(
        1,
        true,
        InputSample {
            x: 10.0,
            y: 10.0,
            pressure: 0.2,
            time_ms: 0.0,
        },
    )
    .unwrap();
    s.end(1, true).unwrap();
    let p = &s.session.document.pages[0]["layers"][0]["elements"][0];
    assert_eq!(p["width"], 9.0);
    assert_eq!(p["pressure"], false);
    assert_eq!(p["brushSettings"]["dryness"], 70);
}
#[test]
fn page_overlay_commands_preserve_history_and_readonly_navigation() {
    let mut s = Surface::new();
    s.add_page().unwrap();
    assert_eq!(s.state(744.0, 1000.0)["pageIndex"], 1);
    s.action(100).unwrap(); // Undoing a new page must not leave an invalid selected page.
    assert_eq!(s.capture().page["id"], "page");
    s.action(101).unwrap();
    assert_eq!(s.state(744.0, 1000.0)["pages"].as_array().unwrap().len(), 2);
    s.session.set_readonly(true);
    s.select_page(1).unwrap();
    assert!(s.add_page().is_err());
    assert_eq!(s.state(744.0, 1000.0)["pageIndex"], 1);
    assert!(s.select_page(2).is_err());
    assert_eq!(s.state(744.0, 1000.0)["pageIndex"], 1);
}
#[test]
fn chrome_has_touch_sized_targets_and_stays_inside_phone_and_tablet_bounds() {
    for (w, h) in [
        (375.0, 684.0),
        (744.0, 1000.0),
        (1133.0, 680.0),
        (812.0, 320.0),
    ] {
        let mut s = Surface::new();
        for (x, y) in [(0.0, 0.0), (-9000.0, -9000.0), (9000.0, 9000.0)] {
            s.move_tray(x, y).unwrap();
            let state = s.state(w, h);
            let t = &state["tray"];
            let number = |v: &serde_json::Value, k: &str| v[k].as_f64().unwrap();
            assert!(number(t, "x") >= 12.0);
            assert!(number(t, "y") >= 72.0);
            assert!(number(t, "x") + number(t, "width") <= w - 12.0 + 0.01);
            assert!(number(t, "y") + number(t, "height") <= h - 12.0 + 0.01);
            for c in state["controls"].as_array().unwrap() {
                assert!(number(c, "width") >= 44.0 && number(c, "height") >= 44.0);
                assert!(
                    number(c, "x") >= 0.0
                        && number(c, "x") + number(c, "width") <= number(t, "width")
                );
            }
            for c in state["topControls"].as_array().unwrap() {
                assert!(number(c, "width") >= 44.0 && number(c, "height") >= 44.0);
                assert!(number(c, "x") >= 0.0 && number(c, "x") + number(c, "width") <= w);
            }
            assert_eq!(state["buttons"].as_array().unwrap().len(), 13);
            assert_eq!(state["body"]["height"], h - 64.0); // Tray overlays instead of reducing the canvas.
        }
    }
}
#[test]
fn all_native_pen_heads_have_visible_distinct_silhouettes_and_bounded_rasters() {
    let styles = [
        "ballpoint",
        "fountain",
        "brush",
        "pencil",
        "watercolor",
        "marker",
        "crayon",
        "reed",
        "spray",
        "oil",
    ];
    let mut heads = std::collections::HashSet::new();
    for style in styles {
        let rgba = native_ui::render_pen(style, "#222b40", 88, 240).unwrap();
        assert_eq!(rgba.len(), 88 * 240 * 4);
        let head = rgba[..88 * 82 * 4].to_vec();
        assert!(
            head.chunks_exact(4).filter(|p| p[3] > 100).count() > 25,
            "{style} has no visible tip"
        );
        assert!(heads.insert(head), "{style} reuses another tip");
    }
    assert!(native_ui::render_pen("oil", "#fff", 257, 240).is_err());
    assert!(native_ui::render_pen("missing", "#fff", 88, 240).is_err());
    assert!(native_ui::render_pen("oil", "\"/><script/>", 88, 240).is_err());
}

// Measured from the shipped Vue tray in WebKit at the same logical viewport.
#[test]
fn migrated_tray_geometry_matches_the_original_ipad_and_phone() {
    let s = Surface::new();
    for (w, h, tx, ty, tw, strip_width) in [
        (744.0, 1000.0, 12.0, 862.0, 720.0, 418.0),
        (1024.0, 704.0, 52.0, 566.0, 920.0, 618.0),
        (375.0, 684.0, 12.0, 546.0, 351.0, 137.0),
    ] {
        let state = s.state(w, h);
        assert_eq!(
            state["tray"],
            json!({"x":tx,"y":ty,"width":tw,"height":124.0})
        );
        assert_eq!(
            state["strip"],
            json!({"x":107,"y":23.0,"width":strip_width,"height":94.0,"contentWidth":602})
        );
        let undo = &state["controls"][0];
        assert_eq!(undo["x"], 11.0);
        assert_eq!(undo["y"], 48.0);
        let pen = &state["buttons"][1];
        assert_eq!(pen["x"], 48.0);
        assert_eq!(pen["y"], 8);
        assert_eq!(pen["height"], 86.0);
    }
}

#[test]
fn settings_card_matches_original_anchors_and_previews_every_brush() {
    let mut s = Surface::new();
    let layout = native_ui::settings_layout(&s, 744.0, 1000.0, 189.0);
    assert_eq!(
        layout["frame"],
        json!({"x":12.0,"y":474.0,"width":360.0,"height":375.5})
    );
    s.action(2).unwrap();
    let layout = native_ui::settings_layout(&s, 744.0, 1000.0, 235.0);
    assert_eq!(
        layout["frame"],
        json!({"x":55.0,"y":416.0,"width":360.0,"height":433.5})
    );
    assert_eq!(layout["footerY"], 372.5);
    assert_eq!(layout["rows"][1]["label"], "飞白");
    for i in 0..10 {
        s.action(i).unwrap();
        let image = native_ui::brush_preview(&s, 480, 120).unwrap();
        assert_eq!(image.len(), 480 * 120 * 4);
        assert!(image.chunks_exact(4).any(|p| p[3] > 0));
    }
    assert!(native_ui::brush_preview(&s, 1201, 120).is_err());
    let short = native_ui::settings_layout(&s, 812.0, 320.0, 700.0);
    assert!(short["frame"]["y"].as_f64().unwrap() >= 76.0);
    assert!(short["frame"]["height"].as_f64().unwrap() < short["contentHeight"].as_f64().unwrap());
}

#[test]
fn infinite_board_starts_at_one_to_one_and_resizing_preserves_zoom() {
    let mut s = Surface::new();
    s.resize_canvas(744.0, 1000.0).unwrap();
    assert_eq!(s.viewport.width, 744.0);
    assert_eq!(s.viewport.height, 1000.0);
    s.camera(cubeoffice_notes_core::render::Bounds {
        x: -20.0,
        y: 80.0,
        width: 372.0,
        height: 500.0,
    })
    .unwrap();
    s.resize_canvas(1133.0, 680.0).unwrap();
    assert_eq!(s.viewport.width, 566.5);
    assert_eq!(s.viewport.height, 340.0);
    assert_eq!(s.viewport.x, -20.0);
    assert_eq!(s.viewport.y, 80.0);
    s.add_page().unwrap();
    assert_eq!(s.viewport.width, 1133.0);
    s.select_page(0).unwrap();
    assert_eq!(s.viewport.width, 1133.0);
    let before = s.viewport;
    assert!(s.resize_canvas(f64::NAN, 100.0).is_err());
    assert_eq!(s.viewport, before);
}
