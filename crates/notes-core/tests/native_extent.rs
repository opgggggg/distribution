#![cfg(feature = "native-renderer")]
use cubeoffice_notes_core::{
    codec, model,
    native::{InputSample, Surface},
    render::Bounds,
};
use serde_json::json;
fn point(x: f64, y: f64, time_ms: f64) -> InputSample {
    InputSample {
        x,
        y,
        pressure: 0.6,
        time_ms,
    }
}
fn paged() -> Surface {
    let mut source = Surface::new();
    source
        .change(&json!({"kind":"infinite","value":false}))
        .unwrap();
    let bytes = codec::write(&source.snapshot(), &model::builtin_brushes()).unwrap();
    let mut surface = Surface::new();
    surface.open(&bytes).unwrap();
    surface
}
#[test]
fn loaded_paged_boards_extend_when_any_native_pen_crosses_the_old_paper_edges() {
    for style in 0..=10 {
        for (a, b) in [
            (point(580., 830., 0.), point(760., 980., 20.)),
            (point(-80., -60., 0.), point(-30., -20., 20.)),
            (point(12000., 14000., 0.), point(12030., 14020., 20.)),
        ] {
            let mut surface = paged();
            surface.action(style).unwrap();
            let before = surface.snapshot();
            surface.begin(-42, true, a).unwrap();
            surface.append(-42, &[b]).unwrap();
            let preview = surface.capture();
            let points = preview.overlay.as_ref().unwrap()["points"]
                .as_array()
                .unwrap();
            assert_eq!(
                points[0]["x"],
                json!(a.x),
                "style {style}: initial x was clamped"
            );
            assert_eq!(
                points[0]["y"],
                json!(a.y),
                "style {style}: initial y was clamped"
            );
            assert_eq!(
                points.last().unwrap()["x"],
                json!(b.x),
                "style {style}: last x was clamped"
            );
            assert_eq!(
                points.last().unwrap()["y"],
                json!(b.y),
                "style {style}: last y was clamped"
            );
            assert_eq!(
                surface.snapshot().revision,
                before.revision,
                "Preview modified the document"
            );
            surface.end(-42, true).unwrap();
            let saved = surface.snapshot();
            assert_eq!(saved.document.pages[0]["infinite"], true);
            assert_eq!(saved.history.past.len(), before.history.past.len() + 1);
            let bytes = codec::write(&saved, &model::builtin_brushes()).unwrap();
            let (reopened, _) = codec::read(&bytes, &model::builtin_brushes()).unwrap();
            assert_eq!(
                reopened.pages[0]["layers"][0]["elements"][0]["points"],
                json!(points)
            );
            surface.action(100).unwrap();
            assert_eq!(surface.snapshot().document.pages[0]["infinite"], false);
            assert_eq!(
                surface.snapshot().document.pages[0]["layers"][0]["elements"],
                json!([])
            );
            surface.action(101).unwrap();
            assert_eq!(surface.snapshot().document.pages[0]["infinite"], true);
        }
    }
}
#[test]
fn cancellation_readonly_and_in_bounds_strokes_do_not_change_the_paper_mode() {
    let mut surface = paged();
    let before = surface.snapshot();
    surface.begin(1, true, point(900., 1000., 0.)).unwrap();
    surface.end(1, false).unwrap();
    assert_eq!(surface.snapshot().revision, before.revision);
    assert_eq!(surface.snapshot().document.pages[0]["infinite"], false);
    surface.session.set_readonly(true);
    assert!(surface.begin(2, true, point(900., 1000., 0.)).is_err());
    assert_eq!(surface.snapshot().revision, before.revision);
    surface.session.set_readonly(false);
    surface.begin(3, true, point(10., 20., 0.)).unwrap();
    surface.append(3, &[point(30., 40., 20.)]).unwrap();
    surface.end(3, true).unwrap();
    assert_eq!(surface.snapshot().document.pages[0]["infinite"], false);
}
#[test]
fn zoomed_and_panned_board_preserves_off_page_world_coordinates() {
    let mut surface = paged();
    surface.resize_canvas(1133., 680.).unwrap();
    surface
        .camera(Bounds {
            x: -400.,
            y: 900.,
            width: 566.5,
            height: 340.,
        })
        .unwrap();
    surface
        .input(0, -5, true, &[point(-200., 1000., 0.)])
        .unwrap();
    surface
        .input(2, -5, true, &[point(100., 1100., 20.)])
        .unwrap();
    let page = &surface.snapshot().document.pages[0];
    assert_eq!(page["infinite"], true);
    assert_eq!(page["layers"][0]["elements"][0]["points"][0]["x"], -200.);
    assert_eq!(
        surface.viewport,
        Bounds {
            x: -400.,
            y: 900.,
            width: 566.5,
            height: 340.
        }
    );
}

#[test]
fn native_shapes_extend_as_one_edit_and_can_be_cancelled() {
    for tool in ["line", "rectangle", "ellipse"] {
        let mut surface = paged();
        surface.set_tool(tool).unwrap();
        surface
            .input(0, 7, true, &[point(12000., 14000., 0.)])
            .unwrap();
        surface
            .input(1, 7, true, &[point(12100., 14100., 10.)])
            .unwrap();
        assert_eq!(surface.capture().page["infinite"], true);
        surface.input(3, 7, true, &[]).unwrap();
        assert_eq!(surface.snapshot().document.pages[0]["infinite"], false);
        let steps = surface.snapshot().history.past.len();
        surface
            .input(0, 8, true, &[point(12000., 14000., 0.)])
            .unwrap();
        surface
            .input(2, 8, true, &[point(12100., 14100., 10.)])
            .unwrap();
        assert_eq!(surface.snapshot().document.pages[0]["infinite"], true);
        assert_eq!(surface.snapshot().history.past.len(), steps + 1);
        surface.action(100).unwrap();
        assert_eq!(surface.snapshot().document.pages[0]["infinite"], false);
    }
}

#[cfg(all(feature = "gpu-renderer", target_vendor = "apple"))]
#[test]
fn native_gpu_paints_live_and_committed_ink_on_both_sides_of_old_page_bounds() {
    use cubeoffice_notes_core::gpu::GpuCanvas;
    let mut gpu = unsafe { GpuCanvas::new(std::ptr::null_mut()) }.unwrap();
    for (x, y) in [(700., 950.), (-200., -160.), (12000., 14000.)] {
        let mut surface = paged();
        surface
            .camera(Bounds {
                x: x - 40.,
                y: y - 40.,
                width: 160.,
                height: 160.,
            })
            .unwrap();
        surface.color("#df2040", 1.).unwrap();
        surface.begin(-100, true, point(x, y, 0.)).unwrap();
        surface
            .append(-100, &[point(x + 60., y + 60., 20.)])
            .unwrap();
        let live = surface.capture();
        gpu.draw(&live, 320, 320, true).unwrap();
        let count = |pixels: &[u8]| {
            pixels
                .chunks_exact(4)
                .filter(|p| p[0] as u16 > p[1] as u16 + 40 && p[0] as u16 > p[2] as u16 + 40)
                .count()
        };
        // Red pigment must cover a real diagonal region, not only a dot clamped
        // to the old page edge or an empty paper frame.
        let live_pixels = count(&gpu.output);
        assert!(
            live_pixels > 80,
            "live ink missing at ({x},{y}): {live_pixels}"
        );
        surface.end(-100, true).unwrap();
        gpu.draw(&surface.capture(), 320, 320, true).unwrap();
        assert_eq!(
            count(&gpu.output),
            live_pixels,
            "Committed ink changed at ({x},{y})"
        );
    }
}

#[test]
fn legacy_missing_canvas_mode_keeps_infinite_semantics_when_fitting_and_adding_pages() {
    let mut original = Surface::new();
    let mut value = original.session.document.value();
    value["pages"][0]
        .as_object_mut()
        .unwrap()
        .remove("infinite");
    original
        .session
        .replace(value, original.session.revision())
        .unwrap();
    let bytes = codec::write(&original.snapshot(), &model::builtin_brushes()).unwrap();
    let mut surface = Surface::new();
    surface.resize_canvas(1133., 680.).unwrap();
    surface.open(&bytes).unwrap();
    assert_eq!(surface.viewport.width, 1133.);
    surface.add_page().unwrap();
    assert_eq!(surface.snapshot().document.pages[1]["infinite"], true);
    assert_eq!(surface.viewport.width, 1133.);
}
