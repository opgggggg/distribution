#![cfg(feature = "native-renderer")]
use cubeoffice_notes_core::{
    native::{Frame, FrameRenderer, InputSample, Surface},
    render::{Bounds, Renderer},
};
fn finish(r: &mut FrameRenderer) -> (usize, usize) {
    let (mut count, mut hits) = (0, 0);
    while let Some(t) = r.next_tile().unwrap() {
        count += 1;
        hits += usize::from(t.cached);
    }
    (count, hits)
}
#[test]
fn tiles_reuse_world_coordinates_and_invalidate_edits_without_publishing_cancelled_frames() {
    let mut s = Surface::new();
    s.resize_canvas(600.0, 800.0).unwrap();
    let mut r = FrameRenderer::new();
    let f = s.capture();
    let plan = r.begin_tiles(&f, 600, 800).unwrap();
    let (count, _) = finish(&mut r);
    assert!(count > 0 && count <= plan.count as usize);
    let initial = r.base().unwrap().data().to_vec();
    r.begin_tiles(&f, 600, 800).unwrap();
    let (n, hits) = finish(&mut r);
    assert_eq!(n, hits);
    s.camera(Bounds {
        x: plan.viewport.x + plan.viewport.width - f.viewport.width + 1.0,
        ..f.viewport
    })
    .unwrap();
    r.begin_tiles(&s.capture(), 600, 800).unwrap();
    let (n, hits) = finish(&mut r);
    assert!(hits > 0);
    assert!(n > hits);
    let before = r.base().unwrap().data().to_vec();
    s.camera(Bounds {
        x: 1000.0,
        ..f.viewport
    })
    .unwrap();
    r.begin_tiles(&s.capture(), 600, 800).unwrap();
    r.next_tile().unwrap();
    r.cancel_tiles();
    assert_eq!(r.base().unwrap().data(), before);
    s.camera(f.viewport).unwrap();
    s.begin(
        1,
        true,
        InputSample {
            x: 10.0,
            y: 10.0,
            pressure: 0.5,
            time_ms: 0.0,
        },
    )
    .unwrap();
    s.append(
        1,
        &[InputSample {
            x: 40.0,
            y: 30.0,
            pressure: 0.5,
            time_ms: 10.0,
        }],
    )
    .unwrap();
    s.end(1, true).unwrap();
    r.begin_tiles(&s.capture(), 600, 800).unwrap();
    let (n, hits) = finish(&mut r);
    assert!(hits > 0);
    assert!(n > hits);
    assert_ne!(r.base().unwrap().data(), initial);
    assert!(r.tile_cache_bytes() <= 32 * 1024 * 1024);
    s.session.undo(s.session.revision()).unwrap();
    r.begin_tiles(&s.capture(), 600, 800).unwrap();
    let (_, hits) = finish(&mut r);
    assert!(hits > 0, "Undo should retain unaffected tiles");
    assert_eq!(r.base().unwrap().data(), initial);
}
#[test]
fn assembled_tiles_match_single_native_raster_at_seams_for_every_brush() {
    for (index, style) in [
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
    ]
    .into_iter()
    .enumerate()
    {
        let mut s = Surface::new();
        s.resize_canvas(700.0, 600.0).unwrap();
        s.action(index as u32).unwrap();
        s.begin(
            1,
            true,
            InputSample {
                x: 10.0,
                y: 10.0,
                pressure: 0.3,
                time_ms: 0.0,
            },
        )
        .unwrap();
        s.append(
            1,
            &[
                InputSample {
                    x: 560.0,
                    y: 490.0,
                    pressure: 0.8,
                    time_ms: 10.0,
                },
                InputSample {
                    x: 80.0,
                    y: 500.0,
                    pressure: 0.5,
                    time_ms: 20.0,
                },
            ],
        )
        .unwrap();
        s.end(1, true).unwrap();
        let mut f = s.capture();
        f.viewport = Bounds {
            x: -27.3,
            y: -13.7,
            width: 700.0,
            height: 600.0,
        };
        let mut r = FrameRenderer::new();
        let p = r.begin_tiles(&f, 700, 600).unwrap();
        finish(&mut r);
        let exact = Renderer::new([])
            .render_native(&f.page, p.viewport, p.width, p.height)
            .unwrap();
        assert_pixels(r.base().unwrap(), &exact, style);
        // At a second LOD and fractional camera origin the grid phase must stay fixed.
        let f = Frame {
            page: f.page,
            viewport: Bounds {
                x: 100.3,
                y: 90.7,
                width: 250.0,
                height: 210.0,
            },
            overlay: None,
        };
        let p = r.begin_tiles(&f, 700, 600).unwrap();
        finish(&mut r);
        let exact = Renderer::new([])
            .render_native(&f.page, p.viewport, p.width, p.height)
            .unwrap();
        assert_pixels(r.base().unwrap(), &exact, style);
        // Cross just one cache edge, forcing a real tile update beside pixels
        // cropped from the previous one-pass refinement. Reject boundary seams.
        let pan = Frame {
            viewport: Bounds {
                x: p.viewport.x + p.viewport.width - f.viewport.width + 1.0,
                ..f.viewport
            },
            ..f
        };
        let p = r.begin_tiles(&pan, 700, 600).unwrap();
        let (count, hits) = finish(&mut r);
        assert!(
            hits > 0 && hits < count,
            "{style} did not exercise partial tile reuse"
        );
        let exact = Renderer::new([])
            .render_native(&pan.page, p.viewport, p.width, p.height)
            .unwrap();
        assert_pixels(r.base().unwrap(), &exact, style);
    }
}
fn assert_pixels(actual: &resvg::tiny_skia::Pixmap, exact: &resvg::tiny_skia::Pixmap, style: &str) {
    let mut sum = 0u64;
    let mut large = 0usize;
    let mut seam_sum = 0u64;
    let mut seam_count = 0usize;
    for (i, (a, b)) in actual
        .data()
        .chunks_exact(4)
        .zip(exact.data().chunks_exact(4))
        .enumerate()
    {
        let difference = a.iter().zip(b).map(|(a, b)| a.abs_diff(*b)).max().unwrap();
        sum += a
            .iter()
            .zip(b)
            .map(|(a, b)| u64::from(a.abs_diff(*b)))
            .sum::<u64>();
        large += usize::from(difference > 2);
        let x = i % actual.width() as usize;
        let y = i / actual.width() as usize;
        if x % 384 <= 1 || x % 384 >= 382 || y % 384 <= 1 || y % 384 >= 382 {
            seam_sum += u64::from(difference);
            seam_count += 1;
        }
    }
    let mean = sum as f64 / actual.data().len() as f64;
    // tiny-skia's local f32 curve clipping can change isolated edge samples.
    // Bound total error and separately reject any visible tile-boundary discontinuity.
    assert!(mean < 0.01, "{style} mean channel error {mean}");
    assert!(
        large < actual.data().len() / 4 / 1000,
        "{style} changed {large} edge pixels"
    );
    let seam_mean = seam_sum as f64 / seam_count as f64;
    assert!(seam_mean < 0.02, "{style} mean seam error {seam_mean}");
}

#[test]
fn tiles_preserve_rotated_background_grid_text_and_path_erasure() {
    use base64::Engine;
    use serde_json::json;
    let mut photo = resvg::tiny_skia::Pixmap::new(16, 16).unwrap();
    for (i, p) in photo.data_mut().chunks_exact_mut(4).enumerate() {
        p.copy_from_slice(if (i / 16 + i % 16) % 2 == 0 {
            &[240, 80, 30, 255]
        } else {
            &[30, 80, 240, 255]
        });
    }
    let src = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(photo.encode_png().unwrap())
    );
    let mut s = Surface::new();
    s.resize_canvas(600.0, 800.0).unwrap();
    s.change(
        &json!({"kind":"photo","src":src,"pixelWidth":400,"pixelHeight":300,"background":true}),
    )
    .unwrap();
    s.change(&json!({"kind":"background","scale":1.2,"angle":37,"opacity":0.7}))
        .unwrap();
    s.begin(
        1,
        true,
        InputSample {
            x: 10.0,
            y: 10.0,
            pressure: 0.5,
            time_ms: 0.0,
        },
    )
    .unwrap();
    s.append(
        1,
        &[InputSample {
            x: 580.0,
            y: 760.0,
            pressure: 0.5,
            time_ms: 10.0,
        }],
    )
    .unwrap();
    s.end(1, true).unwrap();
    s.edit_page(|p| {
        let e = &mut p["layers"][0]["elements"][0];
        e["width"] = json!(24);
        e["erasures"] = json!([{"width":45,"points":[{"x":200,"y":300},{"x":400,"y":500}]}]);
    })
    .unwrap();
    s.insert_text("Drawing 描边").unwrap();
    let f = s.capture();
    let mut r = FrameRenderer::new();
    let font = std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../apps/ios/App/Resources/NotesFonts/NotoSansCJKsc-Regular.otf"
    ))
    .unwrap();
    r.renderer.add_font(font.clone()).unwrap();
    let exact = Renderer::new([font]);
    let plan = r.begin_tiles(&f, 600, 800).unwrap();
    finish(&mut r);
    let image = exact
        .render_native(&f.page, plan.viewport, plan.width, plan.height)
        .unwrap();
    assert_pixels(r.base().unwrap(), &image, "background, text, erasure");
    // Reusing background/text roots after a large camera move must remain correct.
    let f = Frame {
        viewport: Bounds {
            x: 127.0,
            y: 95.0,
            width: 300.0,
            height: 400.0,
        },
        ..f
    };
    let p = r.begin_tiles(&f, 600, 800).unwrap();
    finish(&mut r);
    let image = exact
        .render_native(&f.page, p.viewport, p.width, p.height)
        .unwrap();
    assert_pixels(
        r.base().unwrap(),
        &image,
        "zoomed background, text, erasure",
    );
    s.change(&json!({"kind":"background","angle":90,"opacity":0.3}))
        .unwrap();
    r.begin_tiles(&s.capture(), 600, 800).unwrap();
    let (_, hits) = finish(&mut r);
    assert_eq!(hits, 0, "Old background tiles survived an edit");
}

#[test]
fn local_object_edits_keep_unchanged_tiles_and_geometry_with_fresh_pixel_parity() {
    let mut s = Surface::new();
    s.resize_canvas(1200.0, 800.0).unwrap();
    for (id, x) in [(1, 50.0), (2, 600.0), (3, 1000.0)] {
        let p = |x, y| InputSample {
            x,
            y,
            pressure: 0.5,
            time_ms: 0.0,
        };
        s.begin(id, true, p(x, 100.0)).unwrap();
        s.append(id, &[p(x + 80.0, 140.0)]).unwrap();
        s.end(id, true).unwrap();
    }
    let mut r = FrameRenderer::new();
    r.begin_tiles(&s.capture(), 1200, 800).unwrap();
    finish(&mut r);
    s.set_tool("lasso").unwrap();
    let p = InputSample {
        x: 90.0,
        y: 120.0,
        pressure: 0.5,
        time_ms: 0.0,
    };
    s.input(0, 10, true, &[p]).unwrap();
    s.input(2, 10, true, &[p]).unwrap();
    assert_eq!(
        s.state(1200.0, 800.0)["selectionIDs"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    for command in [
        serde_json::json!({"kind":"selectionWidth","value":6.0}),
        serde_json::json!({"kind":"selectionScale","value":1.1}),
        serde_json::json!({"kind":"selectionColor","color":"#dc3658"}),
    ] {
        s.change(&command).unwrap();
        let f = s.capture();
        let plan = r.begin_tiles(&f, 1200, 800).unwrap();
        let (count, hits) = finish(&mut r);
        assert!(
            hits > 0 && hits < count,
            "A local edit discarded every tile"
        );
        assert!(
            r.renderer.native_geometry_cache_stats().0 >= 3,
            "Unchanged stroke geometry was discarded"
        );
        let fresh = Renderer::new([])
            .render_native(&f.page, plan.viewport, plan.width, plan.height)
            .unwrap();
        assert_pixels(r.base().unwrap(), &fresh, "local edit");
    }
    for action in ["delete", "undo", "redo"] {
        if action == "delete" {
            s.selection_action("delete").unwrap();
        } else {
            s.action(if action == "undo" { 100 } else { 101 }).unwrap();
        }
        let f = s.capture();
        let plan = r.begin_tiles(&f, 1200, 800).unwrap();
        let (count, hits) = finish(&mut r);
        assert!(
            hits > 0 && hits < count,
            "Delete/undo/redo discarded unaffected tiles"
        );
        let fresh = Renderer::new([])
            .render_native(&f.page, plan.viewport, plan.width, plan.height)
            .unwrap();
        assert_pixels(r.base().unwrap(), &fresh, action);
    }
}
