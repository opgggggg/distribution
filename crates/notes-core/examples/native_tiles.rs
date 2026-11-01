#[cfg(feature = "native-renderer")]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    use cubeoffice_notes_core::{
        native::{FrameRenderer, Surface},
        render::Bounds,
    };
    let mut s = Surface::new();
    s.resize_canvas(744.0, 1017.0)?;
    s.open(&std::fs::read(
        std::env::args().nth(1).ok_or("archive argument required")?,
    )?)?;
    let mut r = FrameRenderer::new();
    for path in [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "apps/ios/App/Resources/NotesFonts/NotoSansCJKsc-Regular.otf",
    ] {
        if let Ok(b) = std::fs::read(path) {
            r.renderer.add_font(b)?;
        }
    }
    let v = s.viewport;
    for (name, zoom, pan) in [
        ("initial", 1.0, 0.0),
        ("deep", 3.4, 0.0),
        ("pan", 3.4, 80.0),
        ("return", 3.4, 0.0),
    ] {
        s.camera(Bounds {
            x: v.x + v.width * (1.0 - 1.0 / zoom) / 2.0 + pan,
            y: v.y + v.height * (1.0 - 1.0 / zoom) / 2.0,
            width: v.width / zoom,
            height: v.height / zoom,
        })?;
        let start = std::time::Instant::now();
        let p = r.begin_tiles(&s.capture(), 1860, 2542)?;
        let (mut count, mut hits) = (0, 0);
        while let Some(t) = r.next_tile()? {
            count += 1;
            hits += u32::from(t.cached);
            if count == 1 {
                println!(
                    "{name} first tile {:.1}ms",
                    start.elapsed().as_secs_f64() * 1000.0
                );
            }
        }
        println!(
            "native geometry {:?}; svg geometry {:?}",
            r.renderer.native_geometry_cache_stats(),
            r.renderer.geometry_cache_stats()
        );
        println!(
            "{name} {}x{} {count} tiles, {hits} hits, complete {:.1}ms",
            p.width,
            p.height,
            start.elapsed().as_secs_f64() * 1000.0
        );
    }
    Ok(())
}
#[cfg(not(feature = "native-renderer"))]
fn main() {}
