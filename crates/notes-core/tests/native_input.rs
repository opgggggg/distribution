#![cfg(feature = "native-renderer")]
use cubeoffice_notes_core::{
    codec, model,
    native::{FrameRenderer, InputSample, Surface},
};
fn sample(x: f64, y: f64, pressure: f64, time_ms: f64) -> InputSample {
    InputSample {
        x,
        y,
        pressure,
        time_ms,
    }
}
#[test]
fn independent_ink_renderer_never_rasterizes_or_caches_the_committed_page() {
    let mut s = Surface::new();
    s.begin(-10, true, sample(10.0, 20.0, 0.5, 0.0)).unwrap();
    s.append(-10, &[sample(100.0, 80.0, 0.8, 10.0)]).unwrap();
    let frame = s.capture();
    let mut ink = FrameRenderer::new();
    let patch = ink.render_ink(&frame, 600, 850).unwrap();
    assert!(!patch.base_changed);
    assert!(patch
        .patch
        .as_ref()
        .unwrap()
        .data()
        .chunks_exact(4)
        .any(|p| p[3] > 0));
    assert!(ink.base().is_none());
    let mut full = FrameRenderer::new();
    let expected = full.render_layers(&frame, 600, 850).unwrap();
    assert_eq!((patch.x, patch.y), (expected.x, expected.y));
    assert_eq!(patch.patch.unwrap().data(), expected.patch.unwrap().data());
    s.end(-10, true).unwrap();
    assert!(ink
        .render_ink(&s.capture(), 600, 850)
        .unwrap()
        .patch
        .is_none());
    assert!(ink.base().is_none());
}

#[test]
fn several_commits_during_a_frame_merge_as_one_append_only_batch() {
    let mut s = Surface::new();
    let mut renderer = FrameRenderer::new();
    renderer.render_layers(&s.capture(), 600, 850).unwrap();
    for index in 0..4 {
        s.action(0).unwrap();
        s.color(if index % 2 == 0 { "#ff0000" } else { "#0000ff" }, 0.5)
            .unwrap();
        s.begin(
            index,
            true,
            sample(50.0, 80.0 + index as f64 * 3.0, 0.5, 0.0),
        )
        .unwrap();
        s.append(index, &[sample(250.0, 80.0, 0.5, 10.0)]).unwrap();
        s.end(index, true).unwrap();
    }
    let frame = s.capture();
    assert!(
        renderer
            .render_layers(&frame, 600, 850)
            .unwrap()
            .base_changed
    );
    assert_eq!(
        renderer.full_raster_count(),
        1,
        "Batch appends rebuilt the committed scene instead of merging ink patches"
    );
    let cached = renderer.base().unwrap();
    let exact = FrameRenderer::new().render(&frame, 600, 850).unwrap();
    let delta = cached
        .data()
        .iter()
        .zip(exact.data())
        .map(|(a, b)| a.abs_diff(*b))
        .max()
        .unwrap();
    assert!(
        delta <= 2,
        "Batch compositing changed opacity/order by {delta}"
    );
    assert!(
        !renderer
            .render_layers(&frame, 600, 850)
            .unwrap()
            .base_changed
    );
    assert_eq!(s.snapshot().history.past.len(), 4);
}
#[test]
fn first_paint_preview_never_replaces_the_exact_committed_cache() {
    let mut surface = Surface::new();
    surface.action(2).unwrap();
    surface
        .input(0, -7, true, &[sample(10.0, 20.0, 0.2, 0.0)])
        .unwrap();
    surface
        .input(2, -7, true, &[sample(150.0, 120.0, 0.9, 10.0)])
        .unwrap();
    let frame = surface.capture();
    let mut renderer = FrameRenderer::new();
    let preview = renderer.render_preview(&frame, 300, 400).unwrap();
    assert_eq!((preview.width(), preview.height()), (300, 400));
    assert!(renderer.base().is_none());
    assert!(
        renderer
            .render_layers(&frame, 600, 800)
            .unwrap()
            .base_changed
    );
    let exact = renderer.base().unwrap().clone();
    renderer.render_preview(&frame, 100, 150).unwrap();
    assert_eq!(renderer.base().unwrap().data(), exact.data());
    assert!(
        !renderer
            .render_layers(&frame, 600, 800)
            .unwrap()
            .base_changed
    );
    assert_eq!(surface.snapshot().history.past.len(), 1);
}
#[test]
fn direct_input_accepts_negative_tokens_and_commits_once() {
    let mut s = Surface::new();
    s.action(2).unwrap();
    s.begin(-19, true, sample(10.0, 20.0, 0.1, 0.0)).unwrap();
    let frame = s.capture();
    assert!(s.snapshot().history.past.is_empty());
    s.append(
        -19,
        &[sample(30.0, 25.0, 0.8, 8.0), sample(60.0, 30.0, 0.5, 16.0)],
    )
    .unwrap();
    s.end(-19, true).unwrap();
    assert_eq!(s.snapshot().history.past.len(), 1);
    assert_eq!(
        frame.overlay.unwrap()["points"].as_array().unwrap().len(),
        1
    );
    let saved = codec::write(&s.snapshot(), &model::builtin_brushes()).unwrap();
    let (book, history) = codec::read(&saved, &model::builtin_brushes()).unwrap();
    assert_eq!(history.past.len(), 1);
    let stroke = &book.value()["pages"][0]["layers"][0]["elements"][0];
    assert_eq!(stroke["penStyle"], "brush");
    assert_eq!(stroke["points"][1]["pressure"], 0.8);
    s.action(100).unwrap();
    assert!(s.session.document.pages[0]["layers"][0]["elements"]
        .as_array()
        .unwrap()
        .is_empty());
    s.action(101).unwrap();
    assert_eq!(
        s.session.document.pages[0]["layers"][0]["elements"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}
#[test]
fn invalid_batches_are_atomic_camera_cancels_pending_ink_and_readonly_blocks_input() {
    let mut s = Surface::new();
    s.input(0, -1, true, &[sample(1.0, 1.0, 0.5, 0.0)]).unwrap();
    assert!(s
        .input(
            1,
            -1,
            true,
            &[sample(2.0, 1.0, 0.5, 1.0), sample(f64::NAN, 2.0, 0.5, 2.0)]
        )
        .is_err());
    assert_eq!(
        s.capture().overlay.unwrap()["points"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(s.end(8, true).is_err());
    s.camera(s.viewport).unwrap();
    assert!(s.capture().overlay.is_none());
    assert!(s.snapshot().history.past.is_empty());
    s.session.set_readonly(true);
    assert_eq!(
        s.begin(-1, true, sample(0.0, 0.0, 0.5, 0.0))
            .unwrap_err()
            .code,
        "ReadOnly"
    );
}
#[test]
fn finger_pressure_is_speed_based_and_sample_buffers_have_independent_render_snapshots() {
    let mut slow = Surface::new();
    let mut fast = Surface::new();
    for (surface, dt) in [(&mut slow, 30.0), (&mut fast, 1.0)] {
        surface.action(2).unwrap();
        surface
            .begin(0, false, sample(10.0, 20.0, 0.0, 0.0))
            .unwrap();
        surface
            .append(
                0,
                &(1..20)
                    .map(|i| sample(10.0 + i as f64 * 2.0, 20.0, 0.0, i as f64 * dt))
                    .collect::<Vec<_>>(),
            )
            .unwrap();
    }
    let a = slow.capture();
    let b = fast.capture();
    let pressure = |v: &serde_json::Value| {
        v["points"].as_array().unwrap().last().unwrap()["pressure"]
            .as_f64()
            .unwrap()
    };
    assert!(pressure(a.overlay.as_ref().unwrap()) > pressure(b.overlay.as_ref().unwrap()) + 0.15);
    let mut renderer = FrameRenderer::new();
    let before = renderer.render(&a, 300, 400).unwrap();
    slow.end(0, false).unwrap();
    assert!(slow.capture().overlay.is_none());
    assert_eq!(renderer.render(&a, 300, 400).unwrap().data(), before.data());
}
#[test]
fn every_builtin_brush_can_be_drawn_through_the_native_surface() {
    let mut s = Surface::new();
    let mut renderer = FrameRenderer::new();
    for brush in 0..10 {
        s.action(brush).unwrap();
        s.begin(-1, true, sample(30.0, 30.0 + brush as f64 * 40.0, 0.2, 0.0))
            .unwrap();
        s.append(-1, &[sample(200.0, 50.0 + brush as f64 * 40.0, 0.8, 12.0)])
            .unwrap();
        assert!(renderer.render(&s.capture(), 300, 400).is_ok());
        s.end(-1, true).unwrap();
    }
    assert_eq!(s.snapshot().history.past.len(), 10);
}

#[test]
fn live_ink_reuses_committed_pixels_and_crops_the_overlay_without_visual_loss() {
    let mut surface = Surface::new();
    surface.action(2).unwrap();
    surface
        .begin(-1, true, sample(60.0, 80.0, 0.4, 0.0))
        .unwrap();
    let mut renderer = FrameRenderer::new();
    let initial = renderer
        .render_layers(&surface.capture(), 1000, 1400)
        .unwrap();
    assert!(initial.base_changed);
    surface
        .append(-1, &[sample(180.0, 100.0, 0.8, 8.0)])
        .unwrap();
    let frame = surface.capture();
    let layers = renderer.render_layers(&frame, 1000, 1400).unwrap();
    assert!(!layers.base_changed);
    let patch = layers.patch.unwrap();
    assert!(patch.data().len() < 1000 * 1400 * 4 / 10);
    let mut combined = renderer.base().unwrap().clone();
    combined.draw_pixmap(
        layers.x as i32,
        layers.y as i32,
        patch.as_ref(),
        &resvg::tiny_skia::PixmapPaint::default(),
        resvg::tiny_skia::Transform::identity(),
        None,
    );
    let full = renderer.render(&frame, 1000, 1400).unwrap();
    let changed = combined
        .data()
        .iter()
        .zip(full.data())
        .filter(|(a, b)| a.abs_diff(**b) > 2)
        .count();
    assert!(changed < 100, "Cropped preview changed {changed} channels");
    surface.end(-1, true).unwrap();
    let committed = renderer
        .render_layers(&surface.capture(), 1000, 1400)
        .unwrap();
    assert!(committed.base_changed);
    assert!(committed.patch.is_none());
}

#[test]
fn optimized_native_preview_matches_the_committed_scene_for_every_brush() {
    for brush in 0..10 {
        let mut surface = Surface::new();
        surface.action(brush).unwrap();
        surface
            .begin(-5, true, sample(80.0, 80.0, 0.2, 0.0))
            .unwrap();
        surface
            .append(
                -5,
                &(1..20)
                    .map(|i| {
                        sample(
                            80.0 + i as f64 * 10.0,
                            80.0 + (i as f64 * 0.4).sin() * 25.0,
                            0.1 + (i % 9) as f64 * 0.1,
                            i as f64 * 8.0,
                        )
                    })
                    .collect::<Vec<_>>(),
            )
            .unwrap();
        let mut renderer = FrameRenderer::new();
        let preview = renderer.render(&surface.capture(), 600, 850).unwrap();
        surface.end(-5, true).unwrap();
        let frame = surface.capture();
        let committed = cubeoffice_notes_core::render::Renderer::new([])
            .render_native(&frame.page, frame.viewport, 600, 850)
            .unwrap();
        let incremental = renderer.render(&frame, 600, 850).unwrap();
        // SVG is the interchange reference. Native path antialiasing can differ
        // locally, but a commit must match the native pixels displayed while drawing.
        let reference = cubeoffice_notes_core::render::Renderer::new([])
            .render(&frame.page, frame.viewport, 600, 850)
            .unwrap();
        let mean = committed
            .data()
            .iter()
            .zip(reference.data())
            .map(|(a, b)| f64::from(a.abs_diff(*b)))
            .sum::<f64>()
            / committed.data().len() as f64;
        assert!(
            mean < 0.1,
            "Brush {brush} native/SVG mean channel error {mean}"
        );
        let incremental_changed = incremental
            .data()
            .iter()
            .zip(committed.data())
            .filter(|(a, b)| a.abs_diff(**b) > 3)
            .count();
        assert!(
            incremental_changed < 300,
            "Brush {brush} incremental commit differed at {incremental_changed} channels"
        );
        let changed = preview
            .data()
            .iter()
            .zip(committed.data())
            .filter(|(a, b)| a.abs_diff(**b) > 3)
            .count();
        assert!(
            changed < 300,
            "Brush {brush} preview/commit differed at {changed} channels"
        );
    }
}

#[test]
fn incremental_cache_preserves_foreground_layers() {
    use cubeoffice_notes_core::history::{Document, NotesSession};
    use serde_json::json;
    let mut surface = Surface::new();
    let mut document = surface.session.document.value();
    document["pages"][0]["layers"].as_array_mut().unwrap().push(json!({"id":"foreground","name":"Above ink","visible":true,"elements":[{"id":"blue","kind":"stroke","tool":"pen","penStyle":"ballpoint","color":"#0000ff","width":12,"opacity":1,"pressure":false,"points":[{"x":60,"y":80,"pressure":0.5},{"x":300,"y":80,"pressure":0.5}]}]}));
    let brushes = model::builtin_brushes();
    surface.session = NotesSession::new(
        Document::from_value(document, &brushes).unwrap(),
        Default::default(),
        brushes,
        false,
    );
    let mut renderer = FrameRenderer::new();
    renderer
        .render_layers(&surface.capture(), 600, 850)
        .unwrap();
    surface.action(5).unwrap();
    surface.color("#ff0000", 1.0).unwrap();
    surface
        .begin(-1, true, sample(60.0, 80.0, 0.5, 0.0))
        .unwrap();
    surface
        .append(-1, &[sample(300.0, 80.0, 0.5, 10.0)])
        .unwrap();
    surface.end(-1, true).unwrap();
    renderer
        .render_layers(&surface.capture(), 600, 850)
        .unwrap();
    let frame = surface.capture();
    let fresh = cubeoffice_notes_core::render::Renderer::new([])
        .render(&frame.page, frame.viewport, 600, 850)
        .unwrap();
    assert_eq!(
        renderer.base().unwrap().data(),
        fresh.data(),
        "New ink below a foreground layer must not be composited on top"
    );
}

#[test]
fn a_late_save_acknowledgment_cannot_clean_a_different_document_at_the_same_revision() {
    let mut surface = Surface::new();
    let original = codec::write(&surface.snapshot(), &model::builtin_brushes()).unwrap();
    surface.begin(-1, true, sample(1.0, 1.0, 0.5, 0.0)).unwrap();
    surface.end(-1, true).unwrap();
    let epoch = surface.document_epoch();
    let revision = surface.session.revision();
    surface.open(&original).unwrap();
    surface.begin(-1, true, sample(2.0, 2.0, 0.5, 0.0)).unwrap();
    surface.end(-1, true).unwrap();
    assert_eq!(surface.session.revision(), revision);
    assert!(!surface.mark_saved(epoch, revision));
    assert!(surface.session.dirty());
    assert!(surface.mark_saved(surface.document_epoch(), revision));
    assert!(!surface.session.dirty());
}
