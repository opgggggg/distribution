#![cfg(feature = "native-renderer")]
use cubeoffice_notes_core::native::{FrameRenderer, Layers, Surface};
use resvg::tiny_skia as skia;
use serde_json::{json, Value};
use std::time::Instant;

fn point(i: usize) -> Value {
    let t = i as f64 * 0.035;
    json!({"x":300.0+220.0*(t*0.31).sin(),"y":350.0+250.0*t.sin(),"pressure":0.5+0.3*(t*0.7).sin()})
}

#[test]
fn oil_live_length_profile() {
    let surface = Surface::new();
    let mut frame = surface.capture();
    let renderer = FrameRenderer::new();
    for count in [64, 512, 2048, 8192] {
        frame.overlay = Some(
            json!({"id":"long-oil","kind":"stroke","tool":"pen","penStyle":"oil","brushVersion":2,"width":24,"opacity":1,"pressure":true,"color":"#ab541c","points":(0..count).map(point).collect::<Vec<_>>()}),
        );
        let start = Instant::now();
        let image = renderer.render_ink(&frame, 1024, 1024).unwrap();
        assert!(image.patch.is_some());
        println!(
            "OIL LIVE {count} samples: {:.2} ms",
            start.elapsed().as_secs_f64() * 1000.0
        );
        for i in count..count + 8 {
            frame.overlay.as_mut().unwrap()["points"]
                .as_array_mut()
                .unwrap()
                .push(point(i));
        }
        let start = Instant::now();
        renderer.render_ink(&frame, 1024, 1024).unwrap();
        println!(
            "OIL LIVE {count}+8 update: {:.2} ms; work {:?}",
            start.elapsed().as_secs_f64() * 1000.0,
            renderer.live_oil_work()
        );
    }
}

fn pixels(layers: Layers, w: u32, h: u32) -> skia::Pixmap {
    let mut image = skia::Pixmap::new(w, h).unwrap();
    if let Some(patch) = layers.patch {
        image.draw_pixmap(
            layers.x as i32,
            layers.y as i32,
            patch.as_ref(),
            &skia::PixmapPaint::default(),
            skia::Transform::identity(),
            None,
        );
    }
    image
}

#[test]
fn oil_incremental_pixels_match_full_ribbons_at_crossings_trims_and_tile_edges() {
    let mut frame = Surface::new().capture();
    let renderer = FrameRenderer::new();
    let mut reference = FrameRenderer::new();
    for (color, width, opacity, bristles) in [
        ("#ab541c", 24.0, 1.0, 65.0),
        ("#24a0be", 47.0, 0.47, 100.0),
        ("#f3b62e", 9.0, 0.8, 0.0),
    ] {
        frame.overlay = Some(
            json!({"id":color,"kind":"stroke","tool":"pen","penStyle":"oil","brushVersion":2,"width":width,"opacity":opacity,"pressure":true,"brushSettings":{"bristles":bristles},"color":color,"points":[]}),
        );
        let mut count = 0;
        for next in [1, 2, 5, 33, 70, 135, 260, 519, 1700, 2600, 5200] {
            for i in count..next {
                frame.overlay.as_mut().unwrap()["points"]
                    .as_array_mut()
                    .unwrap()
                    .push(point(i));
            }
            count = next;
            let incremental = pixels(renderer.render_ink(&frame, 768, 768).unwrap(), 768, 768);
            let original = pixels(reference.render_layers(&frame, 768, 768).unwrap(), 768, 768);
            let differences = incremental
                .data()
                .iter()
                .zip(original.data())
                .map(|(a, b)| a.abs_diff(*b) as usize)
                .collect::<Vec<_>>();
            let mean = differences.iter().sum::<usize>() as f64 / differences.len() as f64;
            let severe = differences.iter().filter(|d| **d > 16).count();
            println!("OIL PARITY {color} {next}: mean {mean:.5}, severe {severe}");
            assert!(
                mean < 0.06 && severe < 160,
                "Oil changed at {next} samples ({color}): mean {mean}, severe {severe}"
            );
        }
    }
}

#[test]
fn oil_updates_keep_geometry_work_bounded_after_thousands_of_samples() {
    let mut frame = Surface::new().capture();
    let renderer = FrameRenderer::new();
    // Dense Pencil samples, rather than a discontinuous imported sparse path.
    let dense = |i: usize| {
        let t = i as f64 * 0.006;
        json!({"x":300.0+220.0*(t*0.31).sin(),"y":350.0+250.0*t.sin(),"pressure":0.5+0.3*(t*0.7).sin()})
    };
    frame.overlay = Some(
        json!({"id":"dense-oil","kind":"stroke","tool":"pen","penStyle":"oil","brushVersion":2,"width":24,"opacity":1,"pressure":true,"color":"#ab541c","points":[]}),
    );
    for batch in 0..512 {
        for i in batch * 16..(batch + 1) * 16 {
            frame.overlay.as_mut().unwrap()["points"]
                .as_array_mut()
                .unwrap()
                .push(dense(i));
        }
        let start = Instant::now();
        renderer.render_ink(&frame, 1024, 1024).unwrap();
        let (sections, tiles) = renderer.live_oil_work();
        assert!(
            sections <= 29 * 17,
            "Rebuilt historical oil ribbons at batch {batch}: {sections}"
        );
        assert!(tiles <= 9, "Repainted the whole ink surface: {tiles} tiles");
        if batch % 128 == 127 {
            println!(
                "OIL DENSE {}: {:.2} ms; {sections} sections, {tiles} tiles",
                (batch + 1) * 16,
                start.elapsed().as_secs_f64() * 1000.0
            );
        }
    }
    // A changed historical point, camera, color or new stroke cannot reuse stale pixels.
    frame.overlay.as_mut().unwrap()["points"][0]["x"] = json!(550.0);
    let changed = pixels(renderer.render_ink(&frame, 1024, 1024).unwrap(), 1024, 1024);
    let fresh = pixels(
        FrameRenderer::new().render_ink(&frame, 1024, 1024).unwrap(),
        1024,
        1024,
    );
    assert_eq!(changed.data(), fresh.data());
    frame.viewport.x += 80.0;
    frame.overlay.as_mut().unwrap()["color"] = json!("#1166dd");
    let changed = pixels(renderer.render_ink(&frame, 512, 512).unwrap(), 512, 512);
    let fresh = pixels(
        FrameRenderer::new().render_ink(&frame, 512, 512).unwrap(),
        512,
        512,
    );
    assert_eq!(changed.data(), fresh.data());
    frame.overlay = None;
    renderer.render_ink(&frame, 512, 512).unwrap();
    assert_eq!(renderer.live_oil_work(), (0, 0));
}
