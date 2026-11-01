//! Reproducible CPU-side preview profile; not a substitute for Pencil-to-display device latency.
#[cfg(feature = "native-renderer")]
fn main() {
    use cubeoffice_notes_core::native::{FrameRenderer, InputSample, Surface};
    use std::time::Instant;
    let mut reports = Vec::new();
    for brush in 0..10 {
        let mut surface = Surface::new();
        surface.action(brush).unwrap();
        let mut renderer = FrameRenderer::new();
        renderer
            .render_layers(&surface.capture(), 1488, 2000)
            .unwrap();
        surface
            .begin(
                -1,
                true,
                InputSample {
                    x: 40.0,
                    y: 100.0,
                    pressure: 0.4,
                    time_ms: 0.0,
                },
            )
            .unwrap();
        let mut times = Vec::new();
        let mut inputs = Vec::new();
        let mut bytes = Vec::new();
        for i in 1..61 {
            let t = Instant::now();
            surface
                .append(
                    -1,
                    &[InputSample {
                        x: 40.0 + i as f64 * 5.0,
                        y: 100.0 + (i as f64 / 7.0).sin() * 35.0,
                        pressure: 0.2 + (i % 8) as f64 / 10.0,
                        time_ms: i as f64 * 8.0,
                    }],
                )
                .unwrap();
            inputs.push(t.elapsed().as_secs_f64() * 1000.0);
            let frame = surface.capture();
            let t = Instant::now();
            let layers = renderer.render_layers(&frame, 1488, 2000).unwrap();
            times.push(t.elapsed().as_secs_f64() * 1000.0);
            bytes.push(layers.patch.map_or(0, |p| p.data().len()));
            assert!(!layers.base_changed);
        }
        times.sort_by(f64::total_cmp);
        inputs.sort_by(f64::total_cmp);
        reports.push(serde_json::json!({"style":surface.state(744.0,1133.0)["style"],"input_p95_ms":inputs[56],"preview_p50_ms":times[29],"preview_p95_ms":times[56],"max_patch_bytes":bytes.iter().max(),"full_frame_bytes":1488*2000*4}));
    }
    println!("{}", serde_json::to_string_pretty(&reports).unwrap());
}
#[cfg(not(feature = "native-renderer"))]
fn main() {
    eprintln!("Enable --features native-renderer.");
    std::process::exit(1);
}
