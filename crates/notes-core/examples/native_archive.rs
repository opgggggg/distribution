//! Render an existing archive for local compatibility QA without changing its bytes.
#[cfg(feature = "native-renderer")]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    use cubeoffice_notes_core::{
        codec, model,
        render::{content_bounds, Renderer},
    };
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() < 2 {
        return Err("Usage: native_archive <archive> <output-dir> [font-files...]".into());
    }
    let start = std::time::Instant::now();
    let bytes = std::fs::read(&args[0])?;
    println!(
        "file read: {:.1} ms",
        start.elapsed().as_secs_f64() * 1000.0
    );
    let start = std::time::Instant::now();
    let (document, history) = codec::read(&bytes, &model::builtin_brushes())?;
    println!(
        "archive/history decode: {:.1} ms",
        start.elapsed().as_secs_f64() * 1000.0
    );
    let fonts = args[2..]
        .iter()
        .map(std::fs::read)
        .collect::<Result<Vec<_>, _>>()?;
    let renderer = Renderer::new(fonts);
    std::fs::create_dir_all(&args[1])?;
    for (index, page) in document.pages.iter().enumerate() {
        let start = std::time::Instant::now();
        let area = content_bounds(&page.external())?;
        let width = 600;
        let height = (width as f64 * area.height / area.width)
            .round()
            .clamp(1.0, 1600.0) as u32;
        let image = renderer.preview(page, area, width, height)?;
        image
            .save_png(std::path::Path::new(&args[1]).join(format!("preview-{}.png", index + 1)))?;
        println!(
            "preview {}: {:.1} ms",
            index + 1,
            start.elapsed().as_secs_f64() * 1000.0
        );
        let start = std::time::Instant::now();
        let image = renderer.render(page, area, width, height)?;
        image.save_png(std::path::Path::new(&args[1]).join(format!("page-{}.png", index + 1)))?;
        renderer
            .render_native(page, area, width, height)?
            .save_png(std::path::Path::new(&args[1]).join(format!("native-{}.png", index + 1)))?;
        println!(
            "page {}: {}x{}, {:.1} ms",
            index + 1,
            width,
            height,
            start.elapsed().as_secs_f64() * 1000.0
        );
        let start = std::time::Instant::now();
        let camera = cubeoffice_notes_core::render::Bounds {
            x: area.x + area.width * 0.05,
            y: area.y + area.height * 0.05,
            width: area.width * 0.8,
            height: area.height * 0.8,
        };
        let image = renderer.render(page, camera, width, height)?;
        println!(
            "zoom {}: {:.1} ms, geometry cache {:?}",
            index + 1,
            start.elapsed().as_secs_f64() * 1000.0,
            renderer.geometry_cache_stats()
        );
        image.save_png(std::path::Path::new(&args[1]).join(format!("zoom-{}.png", index + 1)))?;
        let start = std::time::Instant::now();
        let deep = cubeoffice_notes_core::render::Bounds {
            x: area.x + area.width * (1.0 - 1.0 / 3.4) / 2.0,
            y: area.y + area.height * (1.0 - 1.0 / 3.4) / 2.0,
            width: area.width / 3.4,
            height: area.height / 3.4,
        };
        let image = renderer.render(page, deep, width * 2, (height * 2).min(2048))?;
        println!(
            "deep zoom {}: {:.1} ms",
            index + 1,
            start.elapsed().as_secs_f64() * 1000.0
        );
        image.save_png(std::path::Path::new(&args[1]).join(format!("deep-{}.png", index + 1)))?;
    }
    println!(
        "archive unchanged; {} undo / {} redo steps",
        history.past.len(),
        history.future.len()
    );
    Ok(())
}
#[cfg(not(feature = "native-renderer"))]
fn main() {
    panic!("Build with --features native-renderer");
}
