#![cfg(all(feature = "gpu-renderer", target_vendor = "apple"))]
use cubeoffice_notes_core::{
    gpu::GpuCanvas,
    history::Document,
    model,
    native::Frame,
    render::{Bounds, Renderer},
};
use serde_json::{json, Value};
fn book(elements: Vec<Value>) -> Document {
    Document::from_value(json!({"format":"cubeoffice-notebook","version":1,"title":"GPU QA","pages":[{"id":"page","infinite":true,"width":400,"height":400,"paper":"plain","color":"#ffffff","bookmarked":false,"layers":[{"id":"ink","name":"Ink","visible":true,"elements":elements}]}]}),&model::builtin_brushes()).unwrap()
}
fn stroke(style: &str) -> Value {
    json!({"id":"s","kind":"stroke","tool":"pen","penStyle":style,"brushVersion":if ["ballpoint","fountain","reed"].contains(&style){1}else{2},"width":18,"opacity":0.8,"pressure":true,"color":"#da6030","points":(0..90).map(|i|json!({"x":30.+i as f64*3.5,"y":150.+(i as f64*0.08).sin()*80.,"pressure":0.3+i as f64/150.})).collect::<Vec<_>>()})
}
fn frame(d: &Document) -> Frame {
    Frame {
        page: d.pages[0].clone(),
        viewport: Bounds {
            x: 0.,
            y: 0.,
            width: 400.,
            height: 400.,
        },
        overlay: None,
    }
}
#[test]
fn gpu_all_brushes_masks_and_camera_are_retained() {
    let mut gpu = unsafe { GpuCanvas::new(std::ptr::null_mut()) }.unwrap();
    let cpu = Renderer::new([]);
    for style in [
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
    ] {
        let mut e = stroke(style);
        if style == "highlighter" {
            e["tool"] = json!("highlighter");
            e.as_object_mut().unwrap().remove("penStyle");
            e.as_object_mut().unwrap().remove("brushVersion");
        }
        e["erasures"] = json!([{"width":30,"points":[{"x":180,"y":0},{"x":180,"y":400}]}]);
        e["cutouts"] =
            json!([[{"x":250,"y":0},{"x":280,"y":0},{"x":280,"y":400},{"x":250,"y":400}]]);
        let d = book(vec![e.clone()]);
        let mut f = frame(&d);
        gpu.draw(&f, 800, 800, true).unwrap();
        let reference = cpu.render_native(&f.page, f.viewport, 800, 800).unwrap();
        let mean = gpu
            .output
            .iter()
            .zip(reference.data())
            .map(|(a, b)| (*a as f64 - *b as f64).abs())
            .sum::<f64>()
            / gpu.output.len() as f64
            / 255.;
        println!("GPU {style} mean-channel-error={mean:.5} {}", gpu.report());
        assert!(mean < 0.015, "{style} changed appearance: {mean}");
        for x in [360, 520] {
            let i = (300 * 800 + x) * 4;
            assert_eq!(&gpu.output[i..i + 4], &[255; 4], "{style} mask missing");
        }
        let committed = gpu.output.clone();
        let empty = book(vec![]);
        let mut live = frame(&empty);
        live.overlay = Some(e);
        gpu.draw(&live, 800, 800, true).unwrap();
        let live_error = gpu
            .output
            .iter()
            .zip(&committed)
            .map(|(a, b)| (*a as f64 - *b as f64).abs())
            .sum::<f64>()
            / committed.len() as f64
            / 255.;
        assert!(
            live_error < 0.0005,
            "{style} live and committed GPU paths diverged: {live_error}"
        );
        gpu.draw(&f, 800, 800, true).unwrap();
        let uploads = gpu.stats.uploads;
        f.viewport = Bounds {
            x: 70.,
            y: 50.,
            width: 220.,
            height: 220.,
        };
        gpu.draw(&f, 800, 800, true).unwrap();
        assert_eq!(gpu.stats.uploads, uploads, "Zoom rebuilt geometry");
    }
}
#[test]
fn gpu_eraser_keeps_geometry_and_reveals_lower_object() {
    let mut gpu = unsafe { GpuCanvas::new(std::ptr::null_mut()) }.unwrap();
    let mut e = stroke("ballpoint");
    e["opacity"] = json!(1);
    e["color"] = json!("#ff0000");
    e["points"] = json!([{"x":30,"y":150,"pressure":0.5},{"x":360,"y":150,"pressure":0.5}]);
    let mut lower = e.clone();
    lower["id"] = json!("lower");
    lower["color"] = json!("#0000ff");
    let first = book(vec![lower.clone(), e.clone()]);
    gpu.draw(&frame(&first), 400, 400, true).unwrap();
    assert_eq!(
        &gpu.output[(150 * 400 + 150) * 4..(150 * 400 + 150) * 4 + 4],
        &[255, 0, 0, 255]
    );
    e["erasures"] = json!([{"width":30,"points":[{"x":150,"y":100},{"x":150,"y":200}]}]);
    let second = book(vec![lower, e]);
    let before = gpu.stats.uploads;
    gpu.draw(&frame(&second), 400, 400, true).unwrap();
    assert_eq!(
        before, gpu.stats.uploads,
        "Eraser rebuilt unchanged brush geometry"
    );
    assert_eq!(
        &gpu.output[(150 * 400 + 150) * 4..(150 * 400 + 150) * 4 + 4],
        &[0, 0, 255, 255]
    );
}

#[test]
fn gpu_incremental_oil_matches_exact_paths_after_long_growth() {
    let mut gpu = unsafe { GpuCanvas::new(std::ptr::null_mut()) }.unwrap();
    let mut exact_gpu = unsafe { GpuCanvas::new(std::ptr::null_mut()) }.unwrap();
    let mut f = frame(&book(vec![]));
    let mut e = stroke("oil");
    for n in [1, 64, 80, 512, 528, 2048, 2064, 8192, 8208] {
        e["points"]=json!((0..n).map(|i| {let t=i as f64*0.006;json!({"x":200.+150.*(t*0.31).sin(),"y":200.+150.*t.sin(),"pressure":0.5+0.3*(t*0.7).sin()})}).collect::<Vec<_>>());
        f.overlay = Some(e.clone());
        gpu.draw(&f, 400, 400, true).unwrap();
        exact_gpu
            .draw(&frame(&book(vec![e.clone()])), 400, 400, true)
            .unwrap();
        let reference = &exact_gpu.output;
        let mean = gpu
            .output
            .iter()
            .zip(reference)
            .map(|(a, b)| (*a as f64 - *b as f64).abs())
            .sum::<f64>()
            / gpu.output.len() as f64
            / 255.;
        println!("GPU incremental oil n={n} mean={mean:.5} {}", gpu.report());
        assert!(
            mean < 0.0005,
            "Incremental oil changed pigment/overlap at {n}: {mean}"
        );
    }
}
#[test]
fn gpu_photos_text_paper_and_image_transforms_remain_compatible() {
    use base64::Engine;
    let mut gpu = unsafe { GpuCanvas::new(std::ptr::null_mut()) }.unwrap();
    let font = std::fs::read(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../apps/ios/App/Resources/NotesFonts/NotoSansCJKsc-Regular.otf"),
    )
    .unwrap();
    gpu.add_font(font.clone()).unwrap();
    let cpu = Renderer::new([font]);
    let mut photo = resvg::tiny_skia::Pixmap::new(32, 32).unwrap();
    for (i, p) in photo.data_mut().chunks_exact_mut(4).enumerate() {
        p.copy_from_slice(if (i / 32 + i % 32) % 2 == 0 {
            &[255, 0, 0, 255]
        } else {
            &[0, 0, 255, 255]
        });
    }
    let src = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(photo.encode_png().unwrap())
    );
    let mut v=book(vec![json!({"id":"text","kind":"text","text":"学习绘画\nCubeOffice","x":55,"y":300,"size":20,"color":"#222b40"})]).value();
    v["pages"][0]["background"] = json!({"id":"photo","kind":"image","src":src,"x":50,"y":30,"width":230,"height":200,"angle":25,"opacity":0.6});
    for paper in ["plain", "grid", "ruled", "dotted"] {
        v["pages"][0]["paper"] = json!(paper);
        let d = Document::from_value(v.clone(), &model::builtin_brushes()).unwrap();
        let f = frame(&d);
        gpu.draw(&f, 800, 800, true).unwrap();
        let reference = cpu.render_native(&f.page, f.viewport, 800, 800).unwrap();
        let mean = gpu
            .output
            .iter()
            .zip(reference.data())
            .map(|(a, b)| (*a as f64 - *b as f64).abs())
            .sum::<f64>()
            / gpu.output.len() as f64
            / 255.;
        println!("GPU photo/text/paper {paper} mean={mean:.5}");
        assert!(mean < 0.012, "{paper} changed photos/text: {mean}");
    }
    let uploads = gpu.stats.uploads;
    v["pages"][0]["background"]["angle"] = json!(90);
    v["pages"][0]["background"]["width"] = json!(160);
    let d = Document::from_value(v, &model::builtin_brushes()).unwrap();
    gpu.draw(&frame(&d), 800, 800, true).unwrap();
    assert_eq!(
        gpu.stats.uploads,
        uploads + 1,
        "Image transform decoded/uploaded the source texture again"
    );
    let mut invalid = frame(&d);
    invalid.viewport.width = f64::NAN;
    assert!(gpu.draw(&invalid, 800, 800, false).is_err());
}

#[test]
fn gpu_dense_chisel_live_union_matches_full_nonzero_geometry() {
    let mut gpu = unsafe { GpuCanvas::new(std::ptr::null_mut()) }.unwrap();
    let mut exact = unsafe { GpuCanvas::new(std::ptr::null_mut()) }.unwrap();
    for style in ["marker", "reed"] {
        let mut e = stroke(style);
        e["points"]=json!((0..8208).map(|i| {let t=i as f64*0.006;json!({"x":200.+150.*(t*0.31).sin(),"y":200.+150.*t.sin(),"pressure":0.5+0.3*(t*0.7).sin()})}).collect::<Vec<_>>());
        let mut f = frame(&book(vec![]));
        f.overlay = Some(e.clone());
        gpu.draw(&f, 800, 800, true).unwrap();
        exact.draw(&frame(&book(vec![e])), 800, 800, true).unwrap();
        let mean = gpu
            .output
            .iter()
            .zip(&exact.output)
            .map(|(a, b)| (*a as f64 - *b as f64).abs())
            .sum::<f64>()
            / gpu.output.len() as f64
            / 255.;
        println!("GPU dense chisel {style} mean={mean:.6} {}", gpu.report());
        assert!(mean < 0.0005, "{style} union changed dense nib coverage");
    }
}

#[test]
fn gpu_paper_strength_matches_existing_grid_and_rules() {
    let mut gpu = unsafe { GpuCanvas::new(std::ptr::null_mut()) }.unwrap();
    let cpu = Renderer::new([]);
    for paper in ["plain", "grid", "ruled", "dotted"] {
        let mut value = book(vec![]).value();
        value["pages"][0]["paper"] = json!(paper);
        let d = Document::from_value(value, &model::builtin_brushes()).unwrap();
        let f = frame(&d);
        gpu.draw(&f, 800, 800, true).unwrap();
        let reference = cpu.render_native(&f.page, f.viewport, 800, 800).unwrap();
        let mean = gpu
            .output
            .iter()
            .zip(reference.data())
            .map(|(a, b)| (*a as f64 - *b as f64).abs())
            .sum::<f64>()
            / gpu.output.len() as f64
            / 255.;
        let row = (36..44)
            .map(|x| {
                let i = (20 * 800 + x) * 4;
                (gpu.output[i], reference.data()[i])
            })
            .collect::<Vec<_>>();
        println!("PAPER {paper} mean={mean:.6} row={row:?}");
        assert!(mean < 0.001, "GPU paper strength changed for {paper}");
    }
}

#[test]
fn gpu_incremental_chinese_bristles_preserve_dryness_pressure_clips_and_tail() {
    let mut gpu = unsafe { GpuCanvas::new(std::ptr::null_mut()) }.unwrap();
    let mut exact = unsafe { GpuCanvas::new(std::ptr::null_mut()) }.unwrap();
    let mut f = frame(&book(vec![]));
    for (dry, pressure) in [(0, true), (40, true), (100, true), (40, false)] {
        let mut e = stroke("brush");
        e["brushSettings"] = json!({"dryness":dry});
        e["pressure"] = json!(pressure);
        for n in [1, 2, 64, 80, 512, 528, 2048, 2064, 8192, 8208] {
            e["points"]=json!((0..n).map(|i|{let t=i as f64*0.006;json!({"x":200.+150.*(t*0.31).sin(),"y":200.+150.*t.sin(),"pressure":0.5+0.3*(t*0.7).sin()})}).collect::<Vec<_>>());
            f.overlay = Some(e.clone());
            gpu.draw(&f, 400, 400, true).unwrap();
            let sections = gpu.stats.bristle_sections_updated;
            let bytes = gpu.stats.bristle_bytes_uploaded;
            let preparation = gpu.stats.prepare_ms;
            exact
                .draw(&frame(&book(vec![e.clone()])), 400, 400, true)
                .unwrap();
            let mean = gpu
                .output
                .iter()
                .zip(&exact.output)
                .map(|(a, b)| (*a as f64 - *b as f64).abs())
                .sum::<f64>()
                / gpu.output.len() as f64
                / 255.;
            assert!(
                mean < 0.0005,
                "Chinese brush dry={dry} pressure={pressure} n={n} changed coverage: {mean}"
            );
            if dry > 0 && n == 8208 {
                assert!(
                    sections <= 17 * 18,
                    "Recomputed old bristle sections: {sections}"
                );
                // This length crosses a buffer-capacity boundary: count the
                // necessary growth upload, but ensure the math stays incremental.
            }
            println!("CHINESE PARITY dry={dry} pressure={pressure} n={n} mean={mean:.6} prepare={preparation:.2} sections={sections} uploaded={bytes}");
        }
        // Masks and tape cutouts still apply to the base, clipped bristles and grain.
        e["erasures"] =
            json!([{"width":24,"height":40,"points":[{"x":200,"y":20},{"x":200,"y":380}]}]);
        e["cutouts"] =
            json!([[{"x":260,"y":0},{"x":280,"y":0},{"x":280,"y":400},{"x":260,"y":400}]]);
        f.overlay = Some(e.clone());
        gpu.draw(&f, 400, 400, true).unwrap();
        exact.draw(&frame(&book(vec![e])), 400, 400, true).unwrap();
        let mean = gpu
            .output
            .iter()
            .zip(&exact.output)
            .map(|(a, b)| (*a as f64 - *b as f64).abs())
            .sum::<f64>()
            / gpu.output.len() as f64
            / 255.;
        assert!(mean < 0.0005, "Chinese masks changed old ink: {mean}");
        // Cancellation clears the overlay; a new style/settings sequence rebuilds
        // only its own sections and cannot retain a previous stroke's pigment.
        f.overlay = None;
        gpu.draw(&f, 400, 400, true).unwrap();
        assert!(gpu.output.iter().all(|v| *v == 255));
    }
}
