#![cfg(feature = "native-renderer")]
use cubeoffice_notes_core::native::{FrameRenderer, InputSample, Surface};
use serde_json::{json, Value};
use std::time::Instant;
const STYLES: [&str; 11] = [
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
    "highlighter",
];
fn point(i: usize) -> Value {
    let t = i as f64 * 0.006;
    json!({"x":300.0+220.0*(t*0.31).sin(),"y":350.0+250.0*t.sin(),"pressure":0.5+0.3*(t*0.7).sin()})
}
fn stroke(style: &str, id: &str, n: usize) -> Value {
    let mut value = json!({"id":id,"kind":"stroke","tool":if style=="highlighter" {"highlighter"} else {"pen"},"penStyle":if style=="highlighter"{"ballpoint"}else{style},"brushVersion":if ["ballpoint","fountain","reed","highlighter"].contains(&style){1}else{2},"width":if ["spray","oil","watercolor"].contains(&style){24.0}else{4.0},"opacity":if style=="highlighter"{0.35}else{1.0},"pressure":true,"color":"#3175ae","points":(0..n).map(point).collect::<Vec<_>>()});
    if style == "highlighter" {
        value.as_object_mut().unwrap().remove("penStyle");
        value.as_object_mut().unwrap().remove("brushVersion");
    }
    value
}
#[test]
fn all_brushes_short_long_and_growing_tail_profile() {
    for style in STYLES {
        let mut frame = Surface::new().capture();
        let renderer = FrameRenderer::new();
        for n in [64, 512, 2048, 8192] {
            frame.overlay = Some(stroke(style, style, n));
            let start = Instant::now();
            renderer.render_ink(&frame, 1024, 1024).unwrap();
            let full = start.elapsed().as_secs_f64() * 1000.0;
            for i in n..n + 16 {
                frame.overlay.as_mut().unwrap()["points"]
                    .as_array_mut()
                    .unwrap()
                    .push(point(i));
            }
            let start = Instant::now();
            renderer.render_ink(&frame, 1024, 1024).unwrap();
            println!(
                "TOOL PROFILE {style} n={n} catchup={full:.2} tail16={:.2} ms",
                start.elapsed().as_secs_f64() * 1000.0
            );
        }
    }
}
#[test]
fn both_erasers_input_and_pixels_on_mixed_dense_board() {
    for mode in ["path", "stroke"] {
        let mut s = Surface::new();
        s.edit_page(|page| {
            page["layers"][0]["elements"] = json!((0..33)
                .map(|i| {
                    let mut e = stroke(STYLES[i % 11], &format!("stroke-{i}"), 512);
                    for p in e["points"].as_array_mut().unwrap() {
                        p["x"] = json!(p["x"].as_f64().unwrap() + (i / 11) as f64 * 10.0);
                    }
                    e
                })
                .collect::<Vec<_>>());
        })
        .unwrap();
        s.set_tool("eraser").unwrap();
        s.eraser_mode(mode).unwrap();
        let sample = |i: usize| InputSample {
            x: 80.0 + i as f64 * 8.0,
            y: 200.0 + i as f64 * 5.0,
            pressure: 0.5,
            time_ms: i as f64 * 8.0,
        };
        let mut renderer = FrameRenderer::new();
        let frame = s.capture();
        renderer.begin_tiles(&frame, 1024, 1024).unwrap();
        while renderer.next_tile().unwrap().is_some() {}
        for batch in 0..12 {
            let start = Instant::now();
            s.input(if batch == 0 { 0 } else { 1 }, -501, true, &[sample(batch)])
                .unwrap();
            let input = start.elapsed().as_secs_f64() * 1000.0;
            let start = Instant::now();
            let frame = s.capture();
            renderer.begin_tiles(&frame, 1024, 1024).unwrap();
            while renderer.next_tile().unwrap().is_some() {}
            println!(
                "ERASER PROFILE {mode} batch={batch} input={input:.2} pixels={:.2} ms",
                start.elapsed().as_secs_f64() * 1000.0
            );
        }
        s.input(2, -501, true, &[]).unwrap();
        s.action(100).unwrap();
        s.action(101).unwrap();
    }
}

fn whole(layers: cubeoffice_notes_core::native::Layers) -> Vec<u8> {
    use resvg::tiny_skia as skia;
    let mut p = skia::Pixmap::new(768, 768).unwrap();
    if let Some(image) = layers.patch {
        p.draw_pixmap(
            layers.x as i32,
            layers.y as i32,
            image.as_ref(),
            &skia::PixmapPaint::default(),
            skia::Transform::identity(),
            None,
        );
    }
    p.take()
}
#[test]
fn every_brush_dirty_preview_matches_a_fresh_complete_stroke() {
    for style in STYLES {
        let mut frame = Surface::new().capture();
        let incremental = FrameRenderer::new();
        let mut reference = FrameRenderer::new();
        for n in [1, 2, 33, 64, 135, 512, 2048, 8192] {
            frame.overlay = Some(stroke(style, style, n));
            let a = whole(incremental.render_ink(&frame, 768, 768).unwrap());
            let b = whole(reference.render_layers(&frame, 768, 768).unwrap());
            let errors = a
                .iter()
                .zip(&b)
                .map(|(a, b)| a.abs_diff(*b) as usize)
                .collect::<Vec<_>>();
            let mean = errors.iter().sum::<usize>() as f64 / errors.len() as f64;
            let severe = errors.iter().filter(|d| **d > 16).count();
            println!("ALL INK PARITY {style} {n} mean={mean:.5} severe={severe}");
            assert!(
                mean < 0.05 && severe < 128,
                "Incremental {style} {n} changed pixels: {mean}, {severe}"
            );
        }
        frame.overlay.as_mut().unwrap()["points"][0]["x"] = json!(40.0);
        let a = whole(incremental.render_ink(&frame, 768, 768).unwrap());
        let b = whole(FrameRenderer::new().render_ink(&frame, 768, 768).unwrap());
        let mean = a
            .iter()
            .zip(&b)
            .map(|(a, b)| a.abs_diff(*b) as usize)
            .sum::<usize>() as f64
            / a.len() as f64;
        assert!(
            mean < 0.05,
            "Historical point edit left stale pixels in {style}: {mean}"
        );
    }
}

#[test]
fn eraser_snapshots_cancel_undo_and_dirty_tiles_preserve_complete_pixels() {
    let mut surface = Surface::new();
    surface
        .edit_page(|p| {
            p["layers"][0]["elements"] = json!((0..10)
                .map(|i| stroke(STYLES[i], &format!("erase-{i}"), 512))
                .collect::<Vec<_>>());
        })
        .unwrap();
    let original = surface.capture();
    let original_document = surface.snapshot().document.value();
    for mode in ["path", "stroke"] {
        surface.set_tool("eraser").unwrap();
        surface.eraser_mode(mode).unwrap();
        let mut renderer = FrameRenderer::new();
        renderer.begin_tiles(&surface.capture(), 768, 768).unwrap();
        while renderer.next_tile().unwrap().is_some() {}
        let input = |x, y| InputSample {
            x,
            y,
            pressure: 0.5,
            time_ms: 0.0,
        };
        surface.input(0, -1, true, &[input(300.0, 350.0)]).unwrap();
        surface
            .input(1, -1, true, &[input(330.0, 390.0), input(360.0, 440.0)])
            .unwrap();
        let preview = surface.capture();
        assert_eq!(
            original.page, surface.session.document.pages[0],
            "Uncommitted erase mutated a history page"
        );
        let plan = renderer.begin_tiles(&preview, 768, 768).unwrap();
        while renderer.next_tile().unwrap().is_some() {}
        let fresh = cubeoffice_notes_core::render::Renderer::new([])
            .render_native(&preview.page, plan.viewport, plan.width, plan.height)
            .unwrap();
        let a = renderer.base().unwrap().data();
        let b = fresh.data();
        let errors = a
            .iter()
            .zip(b)
            .map(|(a, b)| a.abs_diff(*b) as usize)
            .collect::<Vec<_>>();
        let mean = errors.iter().sum::<usize>() as f64 / errors.len() as f64;
        let severe = errors.iter().filter(|d| **d > 16).count();
        println!("ERASE TILE PARITY {mode} mean={mean} severe={severe}");
        assert!(
            mean < 0.03 && severe < 160,
            "Eraser dirty regions lost pixels: {mode} {mean} {severe}"
        );
        surface.input(3, -1, true, &[]).unwrap();
        assert_eq!(surface.snapshot().document.value(), original_document);
        surface.input(0, -2, true, &[input(300.0, 350.0)]).unwrap();
        surface.input(2, -2, true, &[input(330.0, 390.0)]).unwrap();
        let erased = surface.snapshot().document.value();
        assert_ne!(erased, original_document);
        surface.action(100).unwrap();
        assert_eq!(surface.snapshot().document.value(), original_document);
        surface.action(101).unwrap();
        assert_eq!(surface.snapshot().document.value(), erased);
        surface.action(100).unwrap();
    }
}
