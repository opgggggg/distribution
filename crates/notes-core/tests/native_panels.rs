#![cfg(feature = "native-renderer")]
use cubeoffice_notes_core::{native_ffi::*, native_ui};
use serde_json::{json, Value};
struct Host(*mut NativeSurface);
impl Drop for Host {
    fn drop(&mut self) {
        unsafe { cube_surface_free(self.0) }
    }
}
impl Host {
    fn new() -> Self {
        Self(cube_surface_new())
    }
    fn request(&self, v: Value) -> Value {
        unsafe {
            let bytes = serde_json::to_vec(&v).unwrap();
            let code = cube_surface_request(self.0, bytes.as_ptr(), bytes.len());
            let result: Value = serde_json::from_slice(std::slice::from_raw_parts(
                cube_surface_output_ptr(self.0),
                cube_surface_output_len(self.0),
            ))
            .unwrap();
            assert_eq!(code, 0, "{v}: {result}");
            result
        }
    }
}
#[test]
fn native_cards_commands_keep_edit_dimensions_separate_from_layout() {
    let h = Host::new();
    for name in [
        "tools",
        "document",
        "page",
        "paper",
        "layers",
        "view",
        "selection",
        "tape",
        "colors",
        "shapes",
        "eraser",
    ] {
        let s = h.request(json!({"op":"panel","name":name,"layoutWidth":744,"layoutHeight":1000}));
        assert!(s["panel"]["rows"].as_array().unwrap().len() > 0);
        assert_eq!(s["panel"]["name"], name);
    }
    h.request(json!({"op":"change","kind":"tape","action":"add"}));
    let s=h.request(json!({"op":"change","kind":"tape","action":"update","width":123,"height":38,"layoutWidth":744,"layoutHeight":1000}));
    assert_eq!(s["tapes"][0]["width"], 123);
    assert_eq!(s["tapes"][0]["height"], 38);
    assert_eq!(s["body"]["width"], 744.0);
    let s=h.request(json!({"op":"panel","name":"tip","anchorX":720,"anchorY":450,"layoutWidth":744,"layoutHeight":1000}));
    assert_eq!(s["panel"]["frame"]["x"], 468.0);
    assert_eq!(s["panel"]["frame"]["y"], 207.0);
    assert_eq!(s["panel"]["rows"].as_array().unwrap().len(), 14);
    h.request(json!({"op":"readonly","value":true}));
    let s = h.request(json!({"op":"panel","name":"page"}));
    assert!(s["panel"]["rows"]
        .as_array()
        .unwrap()
        .iter()
        .all(|r| r["enabled"] == false));
}
#[test]
fn canvas_palette_deduplicates_visible_ink_and_ignores_hidden_and_transparent_content() {
    let h = Host::new();
    for (id, color) in [(1, "#ef1234"), (2, "#EF1234"), (3, "#456789")] {
        h.request(json!({"op":"color","color":color}));
        let p = cubeoffice_notes_core::native::InputSample {
            x: 50.0,
            y: 50.0,
            pressure: 0.5,
            time_ms: 0.0,
        };
        unsafe {
            assert_eq!(cube_surface_input(h.0, 0, id, 1, &p, 1), 0);
            assert_eq!(cube_surface_input(h.0, 2, id, 1, &p, 1), 0);
        }
    }
    let s = h.request(json!({"op":"panel","name":"colors","layoutWidth":744,"layoutHeight":1000}));
    let rows = s["panel"]["rows"].as_array().unwrap();
    let index = rows.iter().position(|r| r["title"] == "画布颜色").unwrap();
    let colors = rows[index + 1..]
        .iter()
        .take_while(|r| r["type"] == "swatch")
        .map(|r| r["color"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(colors, vec!["#ef1234", "#456789"]);
    h.request(json!({"op":"change","kind":"layer","action":"toggle","index":0}));
    let s = h.request(json!({"op":"panel","name":"colors"}));
    assert_eq!(
        s["panel"]["rows"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|r| r["type"] == "swatch")
            .count(),
        8
    );
}
#[test]
fn source_chrome_icons_and_all_thirteen_tools_have_visible_rgba() {
    for readonly in [false, true] {
        for id in [
            100, 101, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 214, 215, 216, 217, 218,
            219,
        ] {
            let pixels = native_ui::render_chrome(id, readonly, 48, 48).unwrap();
            assert_eq!(pixels.len(), 48 * 48 * 4);
            assert!(pixels.chunks_exact(4).any(|p| p[3] > 0), "{id}");
        }
    }
    for style in ["highlighter", "eraser", "lasso"] {
        assert!(native_ui::render_pen(style, "#ff6600", 80, 164)
            .unwrap()
            .chunks_exact(4)
            .any(|p| p[3] > 0));
    }
}
#[test]
fn gallery_geometry_matches_original_tablet_grid_and_new_document_changes_epoch() {
    let h = Host::new();
    for (w, columns) in [(375, 1), (744, 3), (1133, 5)] {
        let s=h.request(json!({"op":"library","items":[{"id":"one.cubenote","title":"Sketch"}],"layoutWidth":w,"layoutHeight":1000}));
        assert_eq!(s["library"]["columns"], columns);
        let cw = s["library"]["cardWidth"].as_f64().unwrap();
        assert!((cw * columns as f64 + (columns - 1) as f64 * 24.0 + 48.0 - w as f64).abs() < 1e-6);
    }
    let a = h.request(json!({"op":"state"}));
    let b = h.request(json!({"op":"new"}));
    assert!(b["documentEpoch"].as_u64().unwrap() > a["documentEpoch"].as_u64().unwrap());
    assert_eq!(b["dirty"], false);
}
#[test]
fn native_timing_window_is_bounded_rejects_invalid_values_and_retains_lifetime_counters() {
    let h = Host::new();
    unsafe {
        for n in 1..=1000 {
            assert_eq!(cube_surface_metric(h.0, 0, n as f64), 0);
        }
        assert_eq!(cube_surface_metric(h.0, 0, f64::NAN), 1);
        assert_eq!(cube_surface_metric(h.0, 0, -1.0), 1);
        assert_eq!(cube_surface_metric(h.0, 12, 2.0), 1);
        assert_eq!(cube_surface_metrics(h.0), 0);
        let metrics: Value = serde_json::from_slice(std::slice::from_raw_parts(
            cube_surface_output_ptr(h.0),
            cube_surface_output_len(h.0),
        ))
        .unwrap();
        let c = &metrics["channels"]["inputBatchMs"];
        assert_eq!(c["count"], 1000);
        assert_eq!(c["windowCount"], 512);
        assert_eq!(c["p50"], 744.0);
        assert_eq!(c["p95"], 975.0);
        assert_eq!(c["mean"], 500.5);
        assert_eq!(c["over100ms"], 900);
        assert_eq!(metrics["channels"]["rasterMs"]["p95"], Value::Null);
    }
    assert_eq!(h.request(json!({"op":"state"}))["dirty"], false);
}
