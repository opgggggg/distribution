//! Reproduce viewport refinement followed by multiple commits, without editing an archive.
#[cfg(feature = "native-renderer")]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    use cubeoffice_notes_core::{
        native::{FrameRenderer, InputSample, Surface},
        render::Bounds,
    };
    let path = std::env::args()
        .nth(1)
        .ok_or("Usage: native_camera <archive>")?;
    let mut surface = Surface::new();
    surface.resize_canvas(744.0, 1017.0)?;
    surface.open(&std::fs::read(path)?)?;
    let mut renderer = FrameRenderer::new();
    let start = std::time::Instant::now();
    renderer.render_layers(&surface.capture(), 1860, 2542)?;
    println!(
        "initial exact viewport: {:.1} ms",
        start.elapsed().as_secs_f64() * 1000.0
    );
    let base = surface.viewport;
    let scale = 3.4;
    surface.camera(Bounds {
        x: base.x + base.width * (1.0 - 1.0 / scale) / 2.0,
        y: base.y + base.height * (1.0 - 1.0 / scale) / 2.0,
        width: base.width / scale,
        height: base.height / scale,
    })?;
    let start = std::time::Instant::now();
    renderer.render_layers(&surface.capture(), 1860, 2542)?;
    println!(
        "deep zoom refinement: {:.1} ms",
        start.elapsed().as_secs_f64() * 1000.0
    );
    surface.action(0)?;
    for id in 1..=4 {
        let sample = |x, y, time_ms| InputSample {
            x,
            y,
            pressure: 0.5,
            time_ms,
        };
        let v = surface.viewport;
        surface.begin(id, true, sample(v.x + 20.0, v.y + 20.0 + id as f64, 0.0))?;
        surface.append(id, &[sample(v.x + 60.0, v.y + 40.0, 10.0)])?;
        surface.end(id, true)?;
    }
    let start = std::time::Instant::now();
    renderer.render_layers(&surface.capture(), 1860, 2542)?;
    println!(
        "four commits merged: {:.1} ms",
        start.elapsed().as_secs_f64() * 1000.0
    );
    Ok(())
}
#[cfg(not(feature = "native-renderer"))]
fn main() {
    panic!("Build with --features native-renderer");
}
