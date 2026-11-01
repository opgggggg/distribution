#![cfg(feature = "native-renderer")]
use cubeoffice_notes_core::{
    ffi::*,
    history::Document,
    model,
    render::{Bounds, Renderer},
};
use serde_json::{json, Value};
fn book() -> Value {
    json!({"format":"cubeoffice-notebook","version":1,"title":"Native renderer","pages":[{"id":"page","infinite":false,"width":100,"height":100,"paper":"plain","color":"#ffffff","bookmarked":false,"layers":[{"id":"ink","name":"Ink","visible":true,"elements":[{"id":"line","kind":"stroke","tool":"pen","penStyle":"ballpoint","width":12,"opacity":1,"pressure":false,"color":"#ff0000","points":[{"x":10,"y":50,"pressure":0.5},{"x":90,"y":50,"pressure":0.5}],"erasures":[{"width":12,"points":[{"x":50,"y":30},{"x":50,"y":70}]}]}]}]}]})
}
const AREA: Bounds = Bounds {
    x: 0.0,
    y: 0.0,
    width: 100.0,
    height: 100.0,
};
#[test]
fn native_raster_retains_ink_and_path_eraser() {
    let d = Document::from_value(book(), &model::builtin_brushes()).unwrap();
    let r = Renderer::new([]);
    let image = r.render(&d.pages[0], AREA, 100, 100).unwrap();
    let pixel = |x, y| image.pixel(x, y).unwrap();
    assert_eq!(pixel(30, 50).red(), 255);
    assert_eq!(pixel(30, 50).green(), 0);
    assert_eq!(pixel(50, 50).green(), 255);
    assert_eq!(pixel(0, 0).alpha(), 255);
    assert_eq!(image.data().len(), 40000);
}
#[test]
fn native_renderer_bounds_surfaces_and_requires_font_bytes() {
    let mut b = book();
    let d = Document::from_value(b.clone(), &model::builtin_brushes()).unwrap();
    let r = Renderer::new([]);
    assert_eq!(
        r.render(&d.pages[0], AREA, 8192, 8192).err().unwrap().code,
        "RenderLimit"
    );
    assert!(r
        .render(
            &d.pages[0],
            Bounds {
                width: f64::NAN,
                ..AREA
            },
            100,
            100
        )
        .is_err());
    b["pages"][0]["layers"][0]["elements"].as_array_mut().unwrap().push(json!({"id":"text","kind":"text","x":1,"y":1,"size":20,"text":"学习","color":"#111111"}));
    let d = Document::from_value(b, &model::builtin_brushes()).unwrap();
    assert_eq!(
        r.render(&d.pages[0], AREA, 100, 100).err().unwrap().code,
        "MissingFonts"
    );
}
#[test]
fn native_render_ffi_consumes_a_detached_snapshot() {
    unsafe {
        let h = cube_notes_new();
        let data = serde_json::to_vec(&json!({"op":"init","document":book()})).unwrap();
        assert_eq!(cube_notes_request(h, data.as_ptr(), data.len()), 0);
        let snapshot = cube_notes_snapshot(h);
        let renderer = cube_notes_renderer_new();
        assert_eq!(
            cube_notes_render(
                renderer,
                snapshot,
                b"page".as_ptr(),
                4,
                0.0,
                0.0,
                100.0,
                100.0,
                100,
                100
            ),
            0
        );
        let rgba = std::slice::from_raw_parts(
            cube_notes_renderer_output_ptr(renderer),
            cube_notes_renderer_output_len(renderer),
        );
        assert_eq!(rgba.len(), 40000);
        assert_eq!(
            &rgba[(50 * 100 + 30) * 4..(50 * 100 + 30) * 4 + 4],
            &[255, 0, 0, 255]
        );
        assert_eq!(
            cube_notes_render(
                renderer,
                snapshot,
                b"missing".as_ptr(),
                7,
                0.0,
                0.0,
                100.0,
                100.0,
                100,
                100
            ),
            1
        );
        let error: Value = serde_json::from_slice(std::slice::from_raw_parts(
            cube_notes_renderer_output_ptr(renderer),
            cube_notes_renderer_output_len(renderer),
        ))
        .unwrap();
        assert_eq!(error["code"], "MissingPage");
        cube_notes_renderer_free(renderer);
        cube_notes_snapshot_free(snapshot);
        cube_notes_free(h);
    }
}

#[test]
fn streamed_raster_preserves_all_brushes_masks_and_document_order() {
    let mut value = book();
    let mut elements = Vec::new();
    for (i, style) in [
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
    .iter()
    .enumerate()
    {
        let y = 5.0 + i as f64 * 9.0;
        let version = model::builtin_brushes()[*style]["version"]
            .as_u64()
            .unwrap_or(1);
        elements.push(json!({"id":format!("brush-{i}"),"kind":"stroke","tool":"pen","penStyle":style,"brushVersion":version,"brushSeed":1234,
            "width":4,"opacity":0.7,"pressure":true,"color":"#245fd1","points":[{"x":5,"y":y,"pressure":0.2},{"x":45,"y":y+3.0,"pressure":0.9},{"x":95,"y":y,"pressure":0.4}],
            "erasures":[{"width":3,"points":[{"x":50,"y":0},{"x":50,"y":100}]}]}));
    }
    for (i, mut e) in elements.clone().into_iter().enumerate() {
        e["id"] = json!(format!("unmasked-{i}"));
        e.as_object_mut().unwrap().remove("erasures");
        e["color"] = json!("#e84173");
        e["opacity"] = json!(0.35);
        elements.push(e);
    }
    elements.push(json!({"id":"overlap","kind":"stroke","tool":"highlighter","width":9,"opacity":0.3,"pressure":false,"color":"#e84173","points":[{"x":30,"y":1,"pressure":0.5},{"x":60,"y":99,"pressure":0.5}]}));
    value["pages"][0]["paper"] = json!("grid");
    // A semi-transparent background can extend far outside a deep camera.
    // Its opacity surface must be bounded without changing interpolation/alpha.
    let mut photo = resvg::tiny_skia::Pixmap::new(4, 4).unwrap();
    for (index, pixel) in photo.data_mut().chunks_exact_mut(4).enumerate() {
        pixel.copy_from_slice(&[(index * 13) as u8, (index * 7) as u8, 100, 255]);
    }
    use base64::Engine;
    let src = base64::engine::general_purpose::STANDARD.encode(photo.encode_png().unwrap());
    value["pages"][0]["background"] = json!({"id":"photo", "kind":"image", "src":format!("data:image/png;base64,{src}"),
        "x":-300, "y":-200, "width":1000, "height":1200, "angle":27, "opacity":0.47});
    value["pages"][0]["layers"][0]["elements"] = json!(elements);
    let doc = Document::from_value(value, &model::builtin_brushes()).unwrap();
    for area in [
        AREA,
        Bounds {
            x: -17.25,
            y: 12.7,
            width: 143.4,
            height: 86.2,
        },
        Bounds {
            x: 30.25,
            y: 30.25,
            width: 29.4,
            height: 29.4,
        },
    ] {
        let svg = cubeoffice_notes_core::render::page_svg(&doc.pages[0], Some(area)).unwrap();
        let tree = resvg::usvg::Tree::from_str(&svg, &resvg::usvg::Options::default()).unwrap();
        let mut reference = resvg::tiny_skia::Pixmap::new(200, 200).unwrap();
        resvg::render(
            &tree,
            resvg::tiny_skia::Transform::from_scale(
                200.0 / area.width as f32,
                200.0 / area.height as f32,
            ),
            &mut reference.as_mut(),
        );
        let actual = Renderer::new([])
            .render(&doc.pages[0], area, 200, 200)
            .unwrap();
        let max_delta = actual
            .data()
            .iter()
            .zip(reference.data())
            .map(|(a, b)| a.abs_diff(*b))
            .max()
            .unwrap();
        assert!(
            max_delta <= 1,
            "streamed raster differs by {max_delta} channel levels"
        );
    }
}

#[test]
fn compact_notebook_can_rasterize_when_aggregate_brush_svg_exceeds_64_mib() {
    let points: Vec<_> = (0..500).map(|i| json!({"x":1000.0+i as f64*0.4,"y":1000.0+(i as f64*0.1).sin()*20.0,"pressure":0.2+(i%10) as f64*0.07})).collect();
    let stroke = json!({"id":"texture","kind":"stroke","tool":"pen","penStyle":"brush","brushVersion":2,"brushSeed":1234,"width":12,"opacity":0.8,"pressure":true,"color":"#245fd1","points":points});
    let passes = cubeoffice_notes_core::brushes::render(&stroke).unwrap();
    let geometry_bytes: usize = passes.iter().map(|p| p.path.len()).sum::<usize>()
        + passes
            .iter()
            .filter_map(|p| p.clip.as_deref())
            .collect::<std::collections::HashSet<_>>()
            .iter()
            .map(|s| s.len())
            .sum::<usize>();
    let count = model::MAX_BYTES / geometry_bytes + 2;
    assert!(count * 500 < model::MAX_POINTS);
    let mut value = book();
    value["pages"][0]["infinite"] = json!(true);
    let elements = value["pages"][0]["layers"][0]["elements"]
        .as_array_mut()
        .unwrap();
    for i in 0..count {
        let mut e = stroke.clone();
        e["id"] = json!(format!("texture-{i}"));
        elements.push(e);
    }
    assert!(serde_json::to_vec(&value).unwrap().len() < model::MAX_BYTES);
    let doc = Document::from_value(value, &model::builtin_brushes()).unwrap();
    assert_eq!(
        cubeoffice_notes_core::render::page_svg(&doc.pages[0], Some(AREA))
            .unwrap_err()
            .code,
        "RenderLimit"
    );
    let actual = Renderer::new([])
        .render(&doc.pages[0], AREA, 100, 100)
        .unwrap();
    assert_eq!(
        actual.pixel(30, 50).unwrap().green(),
        0,
        "visible ink remains intact"
    );
    assert_eq!(actual.pixel(0, 0).unwrap().green(), 255);
}

#[test]
fn camera_reuses_geometry_but_stroke_edits_invalidate_it() {
    let mut value = book();
    let renderer = Renderer::new([]);
    let doc = Document::from_value(value.clone(), &model::builtin_brushes()).unwrap();
    renderer.render(&doc.pages[0], AREA, 200, 200).unwrap();
    assert_eq!(renderer.geometry_cache_stats().0, 1);
    let camera = Bounds {
        x: 5.25,
        y: -2.75,
        width: 73.5,
        height: 83.7,
    };
    let cached = renderer.render(&doc.pages[0], camera, 300, 270).unwrap();
    assert_eq!(renderer.geometry_cache_stats().2, 1);
    let fresh = Renderer::new([])
        .render(&doc.pages[0], camera, 300, 270)
        .unwrap();
    assert_eq!(
        cached.data(),
        fresh.data(),
        "Reused geometry changed camera pixels"
    );
    value["pages"][0]["layers"][0]["elements"][0]["color"] = json!("#00ff00");
    let changed = Document::from_value(value, &model::builtin_brushes()).unwrap();
    let edited = renderer
        .render(&changed.pages[0], camera, 300, 270)
        .unwrap();
    assert_eq!(
        renderer.geometry_cache_stats().2,
        1,
        "An edited stroke reused stale geometry"
    );
    assert_ne!(edited.data(), cached.data());
    assert_eq!(
        edited.data(),
        Renderer::new([])
            .render(&changed.pages[0], camera, 300, 270)
            .unwrap()
            .data()
    );
    assert!(renderer.geometry_cache_stats().1 <= 32 * 1024 * 1024);
    renderer.clear_geometry_cache();
    assert_eq!(renderer.geometry_cache_stats(), (0, 0, 0));
}

#[test]
fn native_geometry_reuses_all_brushes_without_stale_pixels_after_color_edits() {
    let catalog = model::builtin_brushes();
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
    ] {
        let mut value = book();
        let e = &mut value["pages"][0]["layers"][0]["elements"][0];
        e.as_object_mut().unwrap().remove("erasures");
        e["penStyle"] = json!(style);
        e["brushVersion"] = json!(catalog[style]["version"].as_u64().unwrap_or(1));
        e["brushSeed"] = json!(1234);
        let doc = Document::from_value(value.clone(), &catalog).unwrap();
        let r = Renderer::new([]);
        r.render_native(&doc.pages[0], AREA, 240, 240).unwrap();
        assert_eq!(
            r.native_geometry_cache_stats().0,
            1,
            "{style} was not cached"
        );
        let camera = Bounds {
            x: 24.25,
            y: 20.75,
            width: 51.5,
            height: 59.75,
        };
        let cached = r.render_native(&doc.pages[0], camera, 250, 270).unwrap();
        let fresh = Renderer::new([])
            .render_native(&doc.pages[0], camera, 250, 270)
            .unwrap();
        assert_eq!(
            cached.data(),
            fresh.data(),
            "{style} changed pixels when reusing compiled paths"
        );
        assert_eq!(r.native_geometry_cache_stats().2, 1);
        value["pages"][0]["layers"][0]["elements"][0]["color"] = json!("#00ff00");
        let edited = Document::from_value(value, &catalog).unwrap();
        let changed = r.render_native(&edited.pages[0], camera, 250, 270).unwrap();
        assert_eq!(
            r.native_geometry_cache_stats().2,
            1,
            "{style} used stale color"
        );
        assert_eq!(
            changed.data(),
            Renderer::new([])
                .render_native(&edited.pages[0], camera, 250, 270)
                .unwrap()
                .data()
        );
        assert!(r.native_geometry_cache_stats().1 + r.geometry_cache_stats().1 <= 32 * 1024 * 1024);
        r.clear_geometry_cache();
        assert_eq!(r.native_geometry_cache_stats(), (0, 0, 0));
    }
}
