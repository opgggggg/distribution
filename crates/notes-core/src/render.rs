//! Rust-owned scene export and native CPU rasterization. No browser APIs.
use crate::{
    brushes::{self, Pass, Stroke},
    model,
    page::Page,
    Error, Result,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
#[derive(Clone, Copy, Serialize, Deserialize, Debug, PartialEq)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
fn n(v: &Value, key: &str) -> f64 {
    v[key].as_f64().unwrap()
}
fn xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
fn visible(page: &Value) -> impl Iterator<Item = &Value> {
    page["layers"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|l| l["visible"] == true)
        .flat_map(|l| l["elements"].as_array().unwrap())
}
#[cfg(feature = "native-renderer")]
pub(crate) fn same_ink_geometry(a: &Value, b: &Value) -> bool {
    a.as_object()
        .unwrap()
        .iter()
        .filter(|(k, _)| !["erasures", "cutouts"].contains(&k.as_str()))
        .eq(b
            .as_object()
            .unwrap()
            .iter()
            .filter(|(k, _)| !["erasures", "cutouts"].contains(&k.as_str())))
}
pub(crate) fn bounds(e: &Value) -> Result<Bounds> {
    if e["kind"] == "image" {
        let w = n(e, "width");
        let h = n(e, "height");
        let angle = e["angle"].as_f64().unwrap_or(0.0) * std::f64::consts::PI / 180.0;
        let width = w * angle.cos().abs() + h * angle.sin().abs();
        let height = w * angle.sin().abs() + h * angle.cos().abs();
        return Ok(Bounds {
            x: n(e, "x") + (w - width) / 2.0,
            y: n(e, "y") + (h - height) / 2.0,
            width,
            height,
        });
    }
    if e["kind"] == "text" {
        let lines = e["text"].as_str().unwrap().split('\n').collect::<Vec<_>>();
        let size = n(e, "size");
        return Ok(Bounds {
            x: n(e, "x"),
            y: n(e, "y"),
            width: lines
                .iter()
                .map(|s| s.chars().count())
                .max()
                .unwrap_or(1)
                .max(1) as f64
                * size,
            height: lines.len() as f64 * size * 1.35,
        });
    }
    let stroke = Stroke::deserialize(e)?;
    let mut radius = 0.0_f64;
    let (mut x, mut y, mut right, mut bottom) = (
        f64::INFINITY,
        f64::INFINITY,
        f64::NEG_INFINITY,
        f64::NEG_INFINITY,
    );
    for p in &stroke.points {
        radius = radius.max(stroke.width_at(p) / 2.0);
        x = x.min(p.x);
        y = y.min(p.y);
        right = right.max(p.x);
        bottom = bottom.max(p.y);
    }
    Ok(Bounds {
        x: x - radius,
        y: y - radius,
        width: right - x + radius * 2.0,
        height: bottom - y + radius * 2.0,
    })
}
pub fn content_bounds(page: &Value) -> Result<Bounds> {
    if page["infinite"] == false {
        return Ok(Bounds {
            x: 0.0,
            y: 0.0,
            width: n(page, "width"),
            height: n(page, "height"),
        });
    }
    let (mut left, mut top, mut right, mut bottom) = (
        f64::INFINITY,
        f64::INFINITY,
        f64::NEG_INFINITY,
        f64::NEG_INFINITY,
    );
    for e in page.get("background").into_iter().chain(visible(page)) {
        let b = bounds(e)?;
        let margin = if e["kind"] == "stroke" {
            n(e, "width") * 2.0
        } else {
            8.0
        };
        left = left.min(b.x - margin);
        top = top.min(b.y - margin);
        right = right.max(b.x + b.width + margin);
        bottom = bottom.max(b.y + b.height + margin);
    }
    Ok(if left.is_finite() {
        Bounds {
            x: left - 24.0,
            y: top - 24.0,
            width: (right - left + 48.0).max(72.0),
            height: (bottom - top + 48.0).max(72.0),
        }
    } else {
        Bounds {
            x: 0.0,
            y: 0.0,
            width: n(page, "width"),
            height: n(page, "height"),
        }
    })
}
fn photo(e: &Value) -> String {
    let x = n(e, "x");
    let y = n(e, "y");
    let w = n(e, "width");
    let h = n(e, "height");
    let angle = e["angle"].as_f64().unwrap_or(0.0);
    format!("<image transform=\"rotate({angle} {} {})\" x=\"{x}\" y=\"{y}\" width=\"{w}\" height=\"{h}\" opacity=\"{}\" href=\"{}\" preserveAspectRatio=\"none\"/>",x+w/2.0,y+h/2.0,n(e,"opacity"),xml(e["src"].as_str().unwrap()))
}
fn text(e: &Value) -> String {
    let x = n(e, "x");
    let y = n(e, "y");
    let size = n(e, "size");
    let mut content = format!(
        "<text x=\"{x}\" y=\"{}\" fill=\"{}\" font-size=\"{size}\" font-family=\"{}\">",
        y + size,
        xml(e["color"].as_str().unwrap()),
        xml(e["font"].as_str().unwrap_or("sans-serif"))
    );
    for (i, line) in e["text"].as_str().unwrap().split('\n').enumerate() {
        content += &format!(
            "<tspan x=\"{x}\" dy=\"{}\">{}</tspan>",
            if i == 0 { 0.0 } else { size * 1.35 },
            xml(line)
        );
    }
    content + "</text>"
}
fn polygon(points: &Value) -> String {
    let p = points
        .as_array()
        .unwrap()
        .iter()
        .map(|p| format!("{},{}", n(p, "x"), n(p, "y")))
        .collect::<Vec<_>>()
        .join("L");
    format!("M{p}Z")
}
fn highlighter(e: &Value) -> Result<String> {
    let points = e["points"].as_array().unwrap();
    let width = n(e, "width");
    let opacity = n(e, "opacity");
    let color = e["color"].as_str().unwrap();
    let shape = if points.len() == 1 {
        format!("<rect x=\"{}\" y=\"{}\" width=\"{width}\" height=\"{width}\" fill=\"{color}\" opacity=\"{opacity}\"/>",n(&points[0],"x")-width/2.0,n(&points[0],"y")-width/2.0)
    } else {
        format!("<polyline points=\"{}\" fill=\"none\" stroke=\"{color}\" stroke-width=\"{width}\" stroke-opacity=\"{opacity}\" stroke-linejoin=\"round\"/>",points.iter().map(|p|format!("{},{}",n(p,"x"),n(p,"y"))).collect::<Vec<_>>().join(" "))
    };
    clipped(e, shape)
}
fn clipped(e: &Value, content: String) -> Result<String> {
    let cutouts = e["cutouts"].as_array();
    let erasures = e["erasures"].as_array();
    if cutouts.is_none_or(Vec::is_empty) && erasures.is_none_or(Vec::is_empty) {
        return Ok(content);
    }
    let b = bounds(e)?;
    let margin = n(e, "width") * 3.0;
    let id = xml(&format!("tape-{}", e["id"].as_str().unwrap()));
    let mut masks = String::new();
    for p in cutouts.into_iter().flatten() {
        masks += &format!("<path d=\"{}\" fill=\"black\"/>", polygon(p));
    }
    for erasure in erasures.into_iter().flatten() {
        let rx = n(erasure, "width") / 2.0;
        let ry = erasure["height"].as_f64().unwrap_or(rx * 2.0) / 2.0;
        let points = erasure["points"].as_array().unwrap();
        if points.len() == 1 {
            masks += &format!(
                "<ellipse cx=\"{}\" cy=\"{}\" rx=\"{rx}\" ry=\"{ry}\" fill=\"black\"/>",
                n(&points[0], "x"),
                n(&points[0], "y")
            );
        } else {
            masks+=&format!("<path d=\"M{}\" fill=\"none\" stroke=\"black\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" transform=\"scale({rx} {ry})\"/>",points.iter().map(|p|format!("{},{}",n(p,"x")/rx,n(p,"y")/ry)).collect::<Vec<_>>().join("L"));
        }
    }
    Ok(format!("<defs><mask id=\"{id}\" maskUnits=\"userSpaceOnUse\" x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" style=\"mask-type:luminance\"><rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" fill=\"white\"/>{masks}</mask></defs><g mask=\"url(#{id})\">{content}</g>",b.x-margin,b.y-margin,b.width+margin*2.0,b.height+margin*2.0,b.x-margin,b.y-margin,b.width+margin*2.0,b.height+margin*2.0))
}
fn grain(color: &str, id: &str, texture: Option<&str>) -> String {
    let (mut seed, count) = match texture {
        Some("wax") => (713u32, 384),
        Some("paper") => (1931u32, 288),
        _ => (173u32, 1024),
    };
    let mut random = || {
        seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
        seed as f64 / 4294967296.0
    };
    let mut marks = String::new();
    for i in 0..count {
        if texture.is_none() {
            let x = (i % 32) as f64 * 1.5 + 0.3 + random() * 0.9;
            let y = (i / 32) as f64 * 1.5 + 0.3 + random() * 0.9;
            let r = 0.14 + random() * 0.48;
            let opacity = 0.4 + random() * 0.6;
            marks += &format!(
                "<circle cx=\"{x:.3}\" cy=\"{y:.3}\" r=\"{r:.3}\" opacity=\"{opacity:.3}\"/>"
            );
        } else {
            let x = random() * 48.0;
            let y = random() * 48.0;
            let r = 0.4 + random() * 2.1;
            let opacity = 0.12 + random() * 0.5;
            let w = 1.2 + random() * 3.2;
            let _h = 0.5 + random() * 1.8;
            if texture == Some("wax") {
                marks+=&format!("<ellipse cx=\"{x:.3}\" cy=\"{y:.3}\" rx=\"{:.3}\" ry=\"{:.3}\" transform=\"rotate({:.3} {x:.3} {y:.3})\" opacity=\"{opacity:.3}\"/>",0.3+r*0.5,0.25+r*0.28,w*0.8*180.0/std::f64::consts::PI);
            } else {
                marks += &format!(
                    "<circle cx=\"{x:.3}\" cy=\"{y:.3}\" r=\"{r:.3}\" opacity=\"{:.3}\"/>",
                    opacity * 0.6
                );
            }
        }
    }
    format!("<pattern id=\"{}\" patternUnits=\"userSpaceOnUse\" width=\"48\" height=\"48\"><g fill=\"{}\">{marks}</g></pattern>",xml(id),xml(color))
}
fn texture_id(color: &str, texture: Option<&str>) -> String {
    format!(
        "ink-{}-grain{}",
        &color[1..],
        texture.map(|s| format!("-{s}")).unwrap_or_default()
    )
}
fn stroke(e: &Value, passes: Vec<Pass>) -> Result<String> {
    let color = e["color"].as_str().unwrap();
    let token = format!("ink-{}", &color[1..]);
    let id = e["id"].as_str().unwrap();
    let mut content = String::new();
    let mut clips = std::collections::HashMap::<String, String>::new();
    for (i, p) in passes.into_iter().enumerate() {
        let clip = p.clip.as_ref().map(|path| {
            if let Some(id) = clips.get(path) {
                return id.clone();
            }
            let clip = format!("{token}-{id}-clip-{i}");
            content += &format!(
                "<defs><clipPath id=\"{}\"><path d=\"{}\"/></clipPath></defs>",
                xml(&clip),
                xml(path)
            );
            clips.insert(path.clone(), clip.clone());
            clip
        });
        let fill = if p.grain == Some(true) {
            format!("url(#{})", texture_id(color, p.texture))
        } else {
            p.color.unwrap_or_else(|| color.into())
        };
        content += &format!(
            "<path d=\"{}\" fill=\"{}\" opacity=\"{}\"{}/>",
            xml(&p.path),
            xml(&fill),
            p.opacity,
            if let Some(clip) = clip {
                format!(" clip-path=\"url(#{})\"", xml(&clip))
            } else {
                String::new()
            }
        );
    }
    clipped(e, content)
}
pub fn page_svg(page: &Page, viewport: Option<Bounds>) -> Result<String> {
    let page = page.external();
    let area = viewport.unwrap_or(content_bounds(&page)?);
    model::require(
        [area.x, area.y, area.width, area.height]
            .iter()
            .all(|n| n.is_finite())
            && area.width > 0.0
            && area.height > 0.0,
    )?;
    let mut textures = BTreeMap::new();
    let mut content = String::new();
    for e in visible(&page) {
        if e["kind"] == "image" {
            content += &photo(e);
        } else if e["kind"] == "text" {
            content += &text(e);
        } else if e["tool"] == "highlighter" {
            content += &highlighter(e)?;
        } else {
            let passes = brushes::render(e)?;
            for pass in &passes {
                if pass.grain == Some(true) {
                    let color = e["color"].as_str().unwrap();
                    let id = texture_id(color, pass.texture);
                    textures
                        .entry(id.clone())
                        .or_insert_with(|| grain(color, &id, pass.texture));
                }
            }
            content += &stroke(e, passes)?;
        }
    }
    let paper=match page["paper"].as_str().unwrap(){"plain"=>String::new(),"dotted"=>"<pattern id=\"paper\" width=\"20\" height=\"20\" patternUnits=\"userSpaceOnUse\"><circle cx=\"10\" cy=\"10\" r=\"0.8\" fill=\"#b8c2d2\"/></pattern>".into(),kind=>format!("<pattern id=\"paper\" width=\"20\" height=\"20\" patternUnits=\"userSpaceOnUse\"><path d=\"M0 20H20{}\" fill=\"none\" stroke=\"#cdd4df\" stroke-width=\"0.5\"/></pattern>",if kind=="grid"{"M20 0V20"}else{""})};
    let rect = |fill: &str| {
        format!(
            "<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" fill=\"{fill}\"/>",
            area.x, area.y, area.width, area.height
        )
    };
    let svg=format!("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"{} {} {} {}\" width=\"{}\" height=\"{}\"><defs>{paper}{}</defs>{}{}{}{content}</svg>",area.x,area.y,area.width,area.height,area.width,area.height,textures.into_values().collect::<String>(),rect(page["color"].as_str().unwrap()),page.get("background").map(photo).unwrap_or_default(),if paper.is_empty(){String::new()}else{rect("url(#paper)")});
    if svg.len() > model::MAX_BYTES {
        return Err(Error::new("RenderLimit", "Rendered scene exceeds 64 MiB."));
    }
    Ok(svg)
}

#[cfg(feature = "native-renderer")]
pub(crate) fn native_path(source: &str) -> Result<Option<resvg::tiny_skia::Path>> {
    use svgtypes::SimplePathSegment as S;
    let mut path = resvg::tiny_skia::PathBuilder::new();
    for segment in svgtypes::SimplifyingPathParser::from(source) {
        match segment.map_err(|e| Error::new("RenderError", e.to_string()))? {
            S::MoveTo { x, y } => path.move_to(x as f32, y as f32),
            S::LineTo { x, y } => path.line_to(x as f32, y as f32),
            S::CurveTo {
                x1,
                y1,
                x2,
                y2,
                x,
                y,
            } => path.cubic_to(
                x1 as f32, y1 as f32, x2 as f32, y2 as f32, x as f32, y as f32,
            ),
            S::Quadratic { x1, y1, x, y } => path.quad_to(x1 as f32, y1 as f32, x as f32, y as f32),
            S::ClosePath => path.close(),
        }
    }
    Ok(path.finish())
}
#[cfg(feature = "native-renderer")]
pub struct Renderer {
    pub(crate) cancellation: Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
    options: resvg::usvg::Options<'static>,
    geometry: std::cell::RefCell<GeometryCache>,
    native_geometry: std::cell::RefCell<NativeGeometryCache>,
    elements: std::cell::RefCell<GeometryCache>,
    geometry_budget: std::cell::Cell<usize>,
    textures: std::cell::RefCell<
        std::collections::HashMap<(String, u32, u32), std::sync::Arc<resvg::tiny_skia::Pixmap>>,
    >,
}
#[cfg(feature = "native-renderer")]
#[derive(Clone, Default)]
struct NativeGeometryCache {
    entries: std::collections::HashMap<String, CachedNativeStroke>,
    weight: usize,
    hits: u64,
}
#[cfg(feature = "native-renderer")]
#[derive(Clone)]
struct CachedNativeStroke {
    stroke: std::sync::Arc<Value>,
    prepared: std::sync::Arc<NativeStroke>,
    weight: usize,
}
#[cfg(feature = "native-renderer")]
pub(crate) struct NativeStroke {
    pub(crate) bounds: Bounds,
    pub(crate) passes: Vec<NativePass>,
    pub(crate) clips: Vec<Option<resvg::tiny_skia::Path>>,
    weight: usize,
}
#[cfg(feature = "native-renderer")]
pub(crate) struct LiveRaster {
    metadata: Value,
    viewport: Bounds,
    pixels: resvg::tiny_skia::Pixmap,
    prepared: Option<std::sync::Arc<NativeStroke>>,
    pub(crate) dirty_pixels: u64,
}
#[cfg(feature = "native-renderer")]
impl LiveRaster {
    fn metadata(v: &Value) -> Value {
        Value::Object(
            v.as_object()
                .unwrap()
                .iter()
                .filter(|(k, _)| k.as_str() != "points")
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect(),
        )
    }
    fn new(v: &Value, viewport: Bounds, width: u32, height: u32) -> Result<Self> {
        Ok(Self {
            metadata: Self::metadata(v),
            viewport,
            pixels: resvg::tiny_skia::Pixmap::new(width, height)
                .ok_or_else(|| Error::new("RenderLimit", "Cannot allocate live ink surface."))?,
            prepared: None,
            dirty_pixels: 0,
        })
    }
}
#[cfg(feature = "native-renderer")]
fn union_bounds(a: Bounds, b: Bounds) -> Bounds {
    let x = a.x.min(b.x);
    let y = a.y.min(b.y);
    Bounds {
        x,
        y,
        width: (a.x + a.width).max(b.x + b.width) - x,
        height: (a.y + a.height).max(b.y + b.height) - y,
    }
}
#[cfg(feature = "native-renderer")]
fn path_bounds(path: &resvg::tiny_skia::Path) -> Bounds {
    let b = path.bounds();
    Bounds {
        x: b.left() as f64,
        y: b.top() as f64,
        width: b.width() as f64,
        height: b.height() as f64,
    }
}
#[cfg(feature = "native-renderer")]
fn path_damage(a: &resvg::tiny_skia::Path, b: &resvg::tiny_skia::Path) -> Option<Bounds> {
    let left = a.points();
    let right = b.points();
    let prefix = left.iter().zip(right).take_while(|(a, b)| a == b).count();
    if prefix == left.len() && prefix == right.len() {
        return if a.verbs() == b.verbs() {
            None
        } else {
            Some(union_bounds(path_bounds(a), path_bounds(b)))
        };
    }
    let suffix = left[prefix..]
        .iter()
        .rev()
        .zip(right[prefix..].iter().rev())
        .take_while(|(a, b)| a == b)
        .count();
    let mut result = None;
    for ps in [left, right] {
        // Include adjacent control points: changed endpoints alter their joining
        // segment, not just the new vertices. All native paths are in world space.
        let start = prefix.saturating_sub(3).min(ps.len());
        let end = (ps.len() - suffix + 3).min(ps.len());
        for p in &ps[start..end] {
            let point = Bounds {
                x: p.x as f64,
                y: p.y as f64,
                width: 0.0,
                height: 0.0,
            };
            result = Some(result.map_or(point, |r| union_bounds(r, point)));
        }
    }
    result
}
#[cfg(feature = "native-renderer")]
pub(crate) enum NativePass {
    Flat {
        path: resvg::tiny_skia::Path,
        color: resvg::tiny_skia::Color,
        clip: Option<usize>,
    },
    Texture {
        path: resvg::tiny_skia::Path,
        clip: Option<usize>,
        color: String,
        texture: Option<&'static str>,
        opacity: f32,
    },
}
#[cfg(feature = "native-renderer")]
#[derive(Clone, Default)]
struct GeometryCache {
    entries: std::collections::HashMap<String, CachedStroke>,
    weight: usize,
    hits: u64,
}
#[cfg(feature = "native-renderer")]
#[derive(Clone)]
struct CachedStroke {
    stroke: std::sync::Arc<Value>,
    tree: std::sync::Arc<resvg::usvg::Tree>,
    viewport: Bounds,
    weight: usize,
}
#[cfg(feature = "native-renderer")]
fn geometry_weight(tree: &resvg::usvg::Tree, stroke: &Value) -> usize {
    fn group(g: &resvg::usvg::Group) -> usize {
        std::mem::size_of::<resvg::usvg::Group>()
            + g.children()
                .iter()
                .map(|node| {
                    std::mem::size_of::<resvg::usvg::Node>()
                        + match node {
                            resvg::usvg::Node::Group(g) => group(g),
                            resvg::usvg::Node::Path(p) => {
                                std::mem::size_of::<resvg::usvg::Path>()
                                    + p.data()
                                        .segments()
                                        .map(|s| {
                                            use resvg::tiny_skia::PathSegment::*;
                                            match s {
                                                MoveTo(_) | LineTo(_) => 9,
                                                QuadTo(_, _) => 17,
                                                CubicTo(_, _, _) => 25,
                                                Close => 1,
                                            }
                                        })
                                        .sum::<usize>()
                            }
                            _ => 0, // This cache contains brush-generated paths only.
                        }
                })
                .sum::<usize>()
    }
    // Account for spare vector capacity and per-node allocation overhead. Shared
    // clip definitions are counted once, rather than charging repeated SVG text.
    let paths = group(tree.root())
        + tree
            .clip_paths()
            .iter()
            .map(|p| group(p.root()))
            .sum::<usize>()
        + tree.masks().iter().map(|p| group(p.root())).sum::<usize>()
        + tree
            .patterns()
            .iter()
            .map(|p| group(p.root()))
            .sum::<usize>();
    paths.saturating_mul(2) + serde_json::to_vec(stroke).map_or(0, |v| v.len().saturating_mul(3))
}
#[cfg(feature = "native-renderer")]
impl Renderer {
    pub(crate) fn live_ink(
        &self,
        slot: &mut Option<LiveRaster>,
        stroke: &Value,
        viewport: Bounds,
        width: u32,
        height: u32,
    ) -> Result<crate::native::Layers> {
        use resvg::tiny_skia as skia;
        if !slot.as_ref().is_some_and(|s| {
            s.metadata == LiveRaster::metadata(stroke)
                && s.viewport == viewport
                && s.pixels.width() == width
                && s.pixels.height() == height
        }) {
            *slot = Some(LiveRaster::new(stroke, viewport, width, height)?);
        }
        let state = slot.as_mut().unwrap();
        let next = self.native_stroke(stroke, false)?;
        let all = |p: &NativeStroke| {
            p.passes
                .iter()
                .map(|p| match p {
                    NativePass::Flat { path, .. } | NativePass::Texture { path, .. } => {
                        path_bounds(path)
                    }
                })
                .fold(p.bounds, union_bounds)
        };
        let mut dirty = None;
        if let Some(old) = &state.prepared {
            if old.passes.len() != next.passes.len() || old.clips.len() != next.clips.len() {
                dirty = Some(union_bounds(all(old), all(&next)));
            } else {
                for (a, b) in old.passes.iter().zip(&next.passes) {
                    let (ap, bp, same) = match (a, b) {
                        (
                            NativePass::Flat {
                                path: a,
                                color: ac,
                                clip: ai,
                            },
                            NativePass::Flat {
                                path: b,
                                color: bc,
                                clip: bi,
                            },
                        ) => (a, b, ac == bc && ai == bi),
                        (
                            NativePass::Texture {
                                path: a,
                                color: ac,
                                texture: at,
                                opacity: ao,
                                clip: ai,
                            },
                            NativePass::Texture {
                                path: b,
                                color: bc,
                                texture: bt,
                                opacity: bo,
                                clip: bi,
                            },
                        ) => (a, b, ac == bc && at == bt && ao == bo && ai == bi),
                        _ => {
                            dirty = Some(union_bounds(all(old), all(&next)));
                            break;
                        }
                    };
                    let d = if same {
                        path_damage(ap, bp)
                    } else {
                        Some(union_bounds(path_bounds(ap), path_bounds(bp)))
                    };
                    if let Some(d) = d {
                        dirty = Some(dirty.map_or(d, |v| union_bounds(v, d)));
                    }
                }
                for (a, b) in old.clips.iter().zip(&next.clips) {
                    let d = match (a, b) {
                        (Some(a), Some(b)) => path_damage(a, b),
                        (None, None) => None,
                        _ => Some(union_bounds(all(old), all(&next))),
                    };
                    if let Some(d) = d {
                        dirty = Some(dirty.map_or(d, |v| union_bounds(v, d)));
                    }
                }
            }
        } else {
            dirty = Some(all(&next));
        }
        let sx = width as f64 / viewport.width;
        let sy = height as f64 / viewport.height;
        let rect = |b: Bounds| {
            let x = (((b.x - viewport.x) * sx).floor() - 3.0).clamp(0.0, width as f64) as u32;
            let y = (((b.y - viewport.y) * sy).floor() - 3.0).clamp(0.0, height as f64) as u32;
            let r =
                (((b.x + b.width - viewport.x) * sx).ceil() + 3.0).clamp(0.0, width as f64) as u32;
            let d = (((b.y + b.height - viewport.y) * sy).ceil() + 3.0).clamp(0.0, height as f64)
                as u32;
            (x, y, r, d)
        };
        state.dirty_pixels = 0;
        if let Some(dirty) = dirty {
            let (x, y, right, bottom) = rect(dirty);
            if right > x && bottom > y {
                state.dirty_pixels = (right - x) as u64 * (bottom - y) as u64;
                let mut patch = skia::Pixmap::new(right - x, bottom - y)
                    .ok_or_else(|| Error::new("RenderLimit", "Cannot allocate dirty ink patch."))?;
                self.paint_native_paths(
                    &next,
                    Bounds {
                        x: viewport.x + x as f64 / sx,
                        y: viewport.y + y as f64 / sy,
                        width: (right - x) as f64 / sx,
                        height: (bottom - y) as f64 / sy,
                    },
                    &mut patch,
                    false,
                )?;
                let stride = width as usize * 4;
                let bytes = (right - x) as usize * 4;
                for row in y..bottom {
                    let dest = row as usize * stride + x as usize * 4;
                    let src = (row - y) as usize * bytes;
                    state.pixels.data_mut()[dest..dest + bytes]
                        .copy_from_slice(&patch.data()[src..src + bytes]);
                }
            }
        }
        // Return the accumulated transparent stroke for the existing UIKit
        // replacement image. Clearing changed pixels first prevents dark seams.
        // Preserve the conservative crop used by the public render_layers API.
        let b = next.bounds;
        let margin = stroke["width"].as_f64().unwrap() * 3.0;
        let x = (((b.x - margin - viewport.x) * sx).floor()).clamp(0.0, width as f64) as u32;
        let y = (((b.y - margin - viewport.y) * sy).floor()).clamp(0.0, height as f64) as u32;
        let right =
            (((b.x + b.width + margin - viewport.x) * sx).ceil()).clamp(0.0, width as f64) as u32;
        let bottom =
            (((b.y + b.height + margin - viewport.y) * sy).ceil()).clamp(0.0, height as f64) as u32;
        state.prepared = Some(next);
        let patch = if right > x && bottom > y {
            state.pixels.clone_rect(
                skia::IntRect::from_xywh(x as i32, y as i32, right - x, bottom - y).unwrap(),
            )
        } else {
            None
        };
        Ok(crate::native::Layers {
            base_changed: false,
            x,
            y,
            patch,
        })
    }
    pub(crate) fn check_cancellation(&self) -> Result<()> {
        if self
            .cancellation
            .as_ref()
            .is_some_and(|flag| flag.load(std::sync::atomic::Ordering::Relaxed))
        {
            Err(Error::new("Cancelled", "Obsolete camera render cancelled."))
        } else {
            Ok(())
        }
    }
    /// Conservative geometry allocation budget, separate from raster surfaces.
    const GEOMETRY_BUDGET: usize = 32 * 1024 * 1024;
    pub(crate) fn prepare_tile_geometry(&self) {
        // A complex old board can exceed the normal 32 MiB geometry cache.
        // Keep its paths once across tiles instead of regenerating the same
        // uncached long strokes for every small surface. Still explicitly bounded.
        self.geometry_budget.set(64 * 1024 * 1024);
    }
    /// Workers share immutable paths, fonts, textures and decoded image trees;
    /// only their small cache inventories and JSON verification values are owned.
    pub(crate) fn fork_for_tile(&self) -> Self {
        let mut worker = Self::new([]);
        worker.cancellation = self.cancellation.clone();
        worker.options.fontdb = self.options.fontdb.clone();
        worker.options.font_family = self.options.font_family.clone();
        worker.geometry_budget.set(self.geometry_budget.get());
        *worker.geometry.borrow_mut() = self.geometry.borrow().clone();
        *worker.native_geometry.borrow_mut() = self.native_geometry.borrow().clone();
        *worker.elements.borrow_mut() = self.elements.borrow().clone();
        *worker.textures.borrow_mut() = self.textures.borrow().clone();
        worker
    }
    pub(crate) fn absorb_tile_geometry(&self, worker: Self) {
        let mut native = self.native_geometry.borrow_mut();
        let mut svg = self.geometry.borrow_mut();
        for (id, entry) in worker.native_geometry.into_inner().entries {
            if native
                .entries
                .get(&id)
                .is_some_and(|old| old.stroke == entry.stroke)
            {
                continue;
            }
            if let Some(old) = native.entries.remove(&id) {
                native.weight -= old.weight;
            }
            if native.weight + svg.weight + entry.weight <= self.geometry_budget.get() {
                native.weight += entry.weight;
                native.entries.insert(id, entry);
            }
        }
        for (id, entry) in worker.geometry.into_inner().entries {
            if svg
                .entries
                .get(&id)
                .is_some_and(|old| old.stroke == entry.stroke)
            {
                continue;
            }
            if let Some(old) = svg.entries.remove(&id) {
                svg.weight -= old.weight;
            }
            if native.weight + svg.weight + entry.weight <= self.geometry_budget.get() {
                svg.weight += entry.weight;
                svg.entries.insert(id, entry);
            }
        }
        let mut elements = self.elements.borrow_mut();
        for (id, entry) in worker.elements.into_inner().entries {
            if !elements.entries.contains_key(&id)
                && elements.weight + entry.weight <= 16 * 1024 * 1024
            {
                elements.weight += entry.weight;
                elements.entries.insert(id, entry);
            }
        }
        let mut textures = self.textures.borrow_mut();
        let mut bytes: usize = textures.values().map(|p| p.data().len()).sum();
        for (key, image) in worker.textures.into_inner() {
            if !textures.contains_key(&key) && bytes + image.data().len() <= 8 * 1024 * 1024 {
                bytes += image.data().len();
                textures.insert(key, image);
            }
        }
    }
    pub fn clear_geometry_cache(&self) {
        self.geometry_budget.set(Self::GEOMETRY_BUDGET);
        *self.geometry.borrow_mut() = GeometryCache::default();
        *self.native_geometry.borrow_mut() = NativeGeometryCache::default();
        *self.elements.borrow_mut() = GeometryCache::default();
        self.textures.borrow_mut().clear();
    }
    pub fn native_geometry_cache_stats(&self) -> (usize, usize, u64) {
        let cache = self.native_geometry.borrow();
        (cache.entries.len(), cache.weight, cache.hits)
    }
    pub fn geometry_cache_stats(&self) -> (usize, usize, u64) {
        let cache = self.geometry.borrow();
        (cache.entries.len(), cache.weight, cache.hits)
    }
    fn paint_committed(
        &self,
        stroke: &Value,
        viewport: Bounds,
        pixmap: &mut resvg::tiny_skia::Pixmap,
    ) -> Result<()> {
        let id = stroke["id"].as_str().unwrap();
        let cached = {
            let cache = self.geometry.borrow();
            cache
                .entries
                .get(id)
                .filter(|entry| entry.stroke.as_ref() == stroke)
                .map(|entry| (entry.tree.clone(), entry.viewport))
        };
        let (tree, source) = if let Some(cached) = cached {
            self.geometry.borrow_mut().hits += 1;
            cached
        } else {
            // Retain the original root transform for the first raster; subsequent
            // cameras map that root into the new viewport without rebuilding it.
            let (tree, _) = self.stroke_tree(stroke, brushes::render(stroke)?, viewport)?;
            let tree = std::sync::Arc::new(tree);
            let weight = geometry_weight(&tree, stroke);
            let mut cache = self.geometry.borrow_mut();
            if let Some(old) = cache.entries.remove(id) {
                cache.weight -= old.weight;
            }
            if weight
                <= self
                    .geometry_budget
                    .get()
                    .saturating_sub(cache.weight + self.native_geometry.borrow().weight)
            {
                cache.entries.insert(
                    id.to_owned(),
                    CachedStroke {
                        stroke: std::sync::Arc::new(stroke.clone()),
                        tree: tree.clone(),
                        viewport,
                        weight,
                    },
                );
                cache.weight += weight;
            }
            (tree, viewport)
        };
        // The simple marker preserves upstream subpixel edge placement. The
        // costly textured/masked brushes use bounded temporary surfaces.
        let render = if stroke["penStyle"] == "marker" {
            resvg::render
        } else {
            resvg::render_clipped
        };
        render(
            &tree,
            resvg::tiny_skia::Transform::from_scale(
                pixmap.width() as f32 / viewport.width as f32,
                pixmap.height() as f32 / viewport.height as f32,
            )
            .pre_translate(
                source.x as f32 - viewport.x as f32,
                source.y as f32 - viewport.y as f32,
            ),
            &mut pixmap.as_mut(),
        );
        Ok(())
    }
    pub(crate) fn overlay(
        &self,
        stroke: &Value,
        viewport: Bounds,
        width: u32,
        height: u32,
    ) -> Result<resvg::tiny_skia::Pixmap> {
        let mut pixmap = resvg::tiny_skia::Pixmap::new(width, height)
            .ok_or_else(|| Error::new("RenderLimit", "Cannot allocate ink overlay."))?;
        self.paint_ink(stroke, viewport, &mut pixmap, false)?;
        Ok(pixmap)
    }
    fn paint_ink(
        &self,
        stroke: &Value,
        viewport: Bounds,
        pixmap: &mut resvg::tiny_skia::Pixmap,
        retained: bool,
    ) -> Result<()> {
        let width = pixmap.width();
        let height = pixmap.height();
        if stroke["cutouts"].as_array().is_some_and(|v| !v.is_empty())
            || stroke["erasures"].as_array().is_some_and(|v| !v.is_empty())
        {
            return self.paint_masked_ink(stroke, viewport, pixmap, retained);
        }
        if stroke["tool"] == "highlighter" {
            let content = highlighter(stroke)?;
            let svg=format!("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{}\" height=\"{}\" viewBox=\"{} {} {} {}\">{content}</svg>",viewport.width,viewport.height,viewport.x,viewport.y,viewport.width,viewport.height);
            let tree = resvg::usvg::Tree::from_str(&svg, &self.options)
                .map_err(|e| Error::new("RenderError", e.to_string()))?;
            resvg::render(
                &tree,
                resvg::tiny_skia::Transform::from_scale(
                    width as f32 / viewport.width as f32,
                    height as f32 / viewport.height as f32,
                ),
                &mut pixmap.as_mut(),
            );
            return Ok(());
        }
        let profile = std::env::var_os("CUBE_NOTES_PROFILE_RENDER").is_some();
        let started = std::time::Instant::now();
        let prepared = self.native_stroke(stroke, retained)?;
        let preparation_ms = started.elapsed().as_secs_f64() * 1000.0;
        self.paint_native_paths(&prepared, viewport, pixmap, true)?;
        if profile && started.elapsed().as_millis() >= 5 {
            eprintln!(
                "PAINT_PROFILE style={} points={} prepare={:.2} paint={:.2} passes={} clips={}",
                stroke["penStyle"].as_str().unwrap_or("default"),
                stroke["points"].as_array().unwrap().len(),
                preparation_ms,
                started.elapsed().as_secs_f64() * 1000.0 - preparation_ms,
                prepared.passes.len(),
                prepared.clips.len()
            );
        }
        Ok(())
    }
    fn paint_masked_ink(
        &self,
        stroke: &Value,
        viewport: Bounds,
        pixmap: &mut resvg::tiny_skia::Pixmap,
        retained: bool,
    ) -> Result<()> {
        use resvg::tiny_skia as skia;
        let width = pixmap.width();
        let height = pixmap.height();
        let mut ink = skia::Pixmap::new(width, height)
            .ok_or_else(|| Error::new("RenderLimit", "Cannot allocate masked ink tile."))?;
        if stroke["tool"] == "highlighter" {
            let mut unmasked = stroke.clone();
            unmasked.as_object_mut().unwrap().remove("erasures");
            unmasked.as_object_mut().unwrap().remove("cutouts");
            self.paint_ink(&unmasked, viewport, &mut ink, retained)?;
        } else {
            let prepared = self.native_stroke(stroke, retained)?;
            self.paint_native_paths(&prepared, viewport, &mut ink, true)?;
        }
        let sx = width as f64 / viewport.width;
        let sy = height as f64 / viewport.height;
        let transform = skia::Transform::from_row(
            sx as f32,
            0.0,
            0.0,
            sy as f32,
            (-viewport.x * sx) as f32,
            (-viewport.y * sy) as f32,
        );
        let mut mask = skia::Mask::new(width, height)
            .ok_or_else(|| Error::new("RenderLimit", "Cannot allocate eraser mask."))?;
        for polygon in stroke["cutouts"].as_array().into_iter().flatten() {
            let mut path = skia::PathBuilder::new();
            for (i, p) in polygon.as_array().unwrap().iter().enumerate() {
                if i == 0 {
                    path.move_to(n(p, "x") as f32, n(p, "y") as f32);
                } else {
                    path.line_to(n(p, "x") as f32, n(p, "y") as f32);
                }
            }
            path.close();
            if let Some(path) = path.finish() {
                mask.fill_path(&path, skia::FillRule::Winding, true, transform);
            }
        }
        for erasure in stroke["erasures"].as_array().into_iter().flatten() {
            let rx = n(erasure, "width") / 2.0;
            let ry = erasure["height"].as_f64().unwrap_or(rx * 2.0) / 2.0;
            let ps = erasure["points"].as_array().unwrap();
            let mut path = skia::PathBuilder::new();
            let dot = ps
                .iter()
                .all(|p| n(p, "x") == n(&ps[0], "x") && n(p, "y") == n(&ps[0], "y"));
            if dot {
                path.push_circle(
                    (n(&ps[0], "x") / rx) as f32,
                    (n(&ps[0], "y") / ry) as f32,
                    1.0,
                );
            } else {
                for (i, p) in ps.iter().enumerate() {
                    let x = (n(p, "x") / rx) as f32;
                    let y = (n(p, "y") / ry) as f32;
                    if i == 0 {
                        path.move_to(x, y);
                    } else {
                        path.line_to(x, y);
                    }
                }
            }
            if let Some(path) = path.finish() {
                let ellipse_transform = transform.pre_scale(rx as f32, ry as f32);
                let path = if dot {
                    Some(path)
                } else {
                    path.stroke(
                        &skia::Stroke {
                            width: 2.0,
                            line_cap: skia::LineCap::Round,
                            line_join: skia::LineJoin::Round,
                            ..Default::default()
                        },
                        (sx * rx).max(sy * ry) as f32,
                    )
                };
                if let Some(path) = path {
                    mask.fill_path(&path, skia::FillRule::Winding, true, ellipse_transform);
                }
            }
        }
        mask.invert();
        ink.apply_mask(&mask);
        pixmap.draw_pixmap(
            0,
            0,
            ink.as_ref(),
            &skia::PixmapPaint::default(),
            skia::Transform::identity(),
            None,
        );
        Ok(())
    }
    fn paint_native_paths(
        &self,
        prepared: &NativeStroke,
        viewport: Bounds,
        pixmap: &mut resvg::tiny_skia::Pixmap,
        crop: bool,
    ) -> Result<()> {
        use resvg::tiny_skia as skia;
        let width = pixmap.width();
        let height = pixmap.height();
        let sx = width as f64 / viewport.width;
        let sy = height as f64 / viewport.height;
        if crop && !prepared.clips.is_empty() {
            // The bristle passes share one outline mask. Limit that mask and all
            // 19 blends to the object's pixel rectangle, not the whole camera.
            let mut b = prepared.bounds;
            // Include control-point bounds as well as logical stroke bounds;
            // curved nib outlines can extend beyond the sampled centerline.
            for pass in &prepared.passes {
                let path = match pass {
                    NativePass::Flat { path, .. } | NativePass::Texture { path, .. } => path,
                };
                let r = path.bounds();
                let x = b.x.min(r.left() as f64);
                let y = b.y.min(r.top() as f64);
                b = Bounds {
                    x,
                    y,
                    width: (b.x + b.width).max(r.right() as f64) - x,
                    height: (b.y + b.height).max(r.bottom() as f64) - y,
                };
            }
            let left = (((b.x - viewport.x) * sx).floor() - 3.0).clamp(0.0, width as f64) as u32;
            let top = (((b.y - viewport.y) * sy).floor() - 3.0).clamp(0.0, height as f64) as u32;
            let right =
                (((b.x + b.width - viewport.x) * sx).ceil() + 3.0).clamp(0.0, width as f64) as u32;
            let bottom = (((b.y + b.height - viewport.y) * sy).ceil() + 3.0)
                .clamp(0.0, height as f64) as u32;
            if right <= left || bottom <= top {
                return Ok(());
            }
            if (right - left) as u64 * (bottom - top) as u64 * 4 < width as u64 * height as u64 * 3
            {
                let mut patch = skia::Pixmap::new(right - left, bottom - top).ok_or_else(|| {
                    Error::new("RenderLimit", "Cannot allocate local brush patch.")
                })?;
                let local = Bounds {
                    x: viewport.x + left as f64 / sx,
                    y: viewport.y + top as f64 / sy,
                    width: (right - left) as f64 / sx,
                    height: (bottom - top) as f64 / sy,
                };
                self.paint_native_paths(prepared, local, &mut patch, false)?;
                pixmap.draw_pixmap(
                    left as i32,
                    top as i32,
                    patch.as_ref(),
                    &skia::PixmapPaint::default(),
                    skia::Transform::identity(),
                    None,
                );
                return Ok(());
            }
        }
        let sx = width as f64 / viewport.width;
        let sy = height as f64 / viewport.height;
        let transform = skia::Transform::from_row(
            sx as f32,
            0.0,
            0.0,
            sy as f32,
            (-viewport.x * sx) as f32,
            (-viewport.y * sy) as f32,
        );
        let mut masks: Vec<Option<skia::Mask>> = (0..prepared.clips.len()).map(|_| None).collect();
        let mut empty_masks = vec![false; prepared.clips.len()];
        for pass in &prepared.passes {
            self.check_cancellation()?;
            let (path, clip) = match pass {
                NativePass::Flat { path, clip, .. } | NativePass::Texture { path, clip, .. } => {
                    (path, clip)
                }
            };
            let mask = if let Some(index) = clip {
                if masks[*index].is_none() {
                    let mut mask = skia::Mask::new(width, height)
                        .ok_or_else(|| Error::new("RenderLimit", "Cannot allocate ink clip."))?;
                    if let Some(path) = &prepared.clips[*index] {
                        mask.fill_path(path, skia::FillRule::Winding, true, transform);
                    }
                    empty_masks[*index] = !mask.data().iter().any(|v| *v != 0);
                    masks[*index] = Some(mask);
                }
                if empty_masks[*index] {
                    continue;
                }
                masks[*index].as_ref()
            } else {
                None
            };
            let mut paint = skia::Paint::default();
            let pattern;
            match pass {
                NativePass::Flat { color, .. } => paint.set_color(*color),
                NativePass::Texture {
                    color,
                    texture,
                    opacity,
                    ..
                } => {
                    pattern = self.grain_raster(color, *texture, sx as f32, sy as f32)?;
                    paint.shader = skia::Pattern::new(
                        pattern.as_ref().as_ref(),
                        skia::SpreadMode::Repeat,
                        skia::FilterQuality::Bicubic,
                        *opacity,
                        skia::Transform::from_scale(
                            if 48.0 * sx as f32 > 2048.0 {
                                48.0 / pattern.width() as f32
                            } else {
                                1.0 / sx as f32
                            },
                            if 48.0 * sy as f32 > 2048.0 {
                                48.0 / pattern.height() as f32
                            } else {
                                1.0 / sy as f32
                            },
                        ),
                    );
                }
            }
            pixmap.fill_path(path, &paint, skia::FillRule::Winding, transform, mask);
        }
        Ok(())
    }
    pub(crate) fn native_stroke(
        &self,
        stroke: &Value,
        retained: bool,
    ) -> Result<std::sync::Arc<NativeStroke>> {
        let id = stroke["id"].as_str().unwrap();
        if retained {
            let cached = self
                .native_geometry
                .borrow()
                .entries
                .get(id)
                .filter(|e| same_ink_geometry(e.stroke.as_ref(), stroke))
                .map(|e| e.prepared.clone());
            if let Some(cached) = cached {
                self.native_geometry.borrow_mut().hits += 1;
                return Ok(cached);
            }
        }
        use resvg::tiny_skia as skia;
        let path_weight = |p: &skia::Path| p.points().len() * 16 + p.verbs().len() * 2 + 128;
        let mut prepared = NativeStroke {
            bounds: bounds(stroke)?,
            passes: vec![],
            clips: vec![],
            weight: 256,
        };
        let typed = Stroke::deserialize(stroke)?;
        for pass in brushes::native::render(&typed)? {
            let path = pass.path;
            prepared.weight += path_weight(&path);
            let clip = if pass.clip {
                if prepared.clips.is_empty() {
                    let path = brushes::native::outline_path(&typed, 1.0);
                    prepared.weight += path.as_ref().map_or(0, path_weight);
                    prepared.clips.push(path);
                }
                Some(0)
            } else {
                None
            };
            if let Some(texture) = pass.grain {
                prepared.passes.push(NativePass::Texture {
                    path,
                    clip,
                    color: stroke["color"].as_str().unwrap().into(),
                    texture,
                    opacity: pass.opacity as f32,
                });
                continue;
            }
            let color = &pass.color;
            let rgb = u32::from_str_radix(&color[1..], 16).unwrap();
            let color = skia::Color::from_rgba(
                ((rgb >> 16) & 255) as f32 / 255.0,
                ((rgb >> 8) & 255) as f32 / 255.0,
                (rgb & 255) as f32 / 255.0,
                pass.opacity as f32,
            )
            .unwrap();
            prepared.passes.push(NativePass::Flat { path, color, clip });
        }
        let prepared = std::sync::Arc::new(prepared);
        if retained {
            let mut cache = self.native_geometry.borrow_mut();
            if let Some(old) = cache.entries.remove(id) {
                cache.weight -= old.weight;
            }
            let weight = prepared.weight
                + serde_json::to_vec(stroke).map_or(0, |v| v.len().saturating_mul(3));
            if weight
                <= self
                    .geometry_budget
                    .get()
                    .saturating_sub(cache.weight + self.geometry.borrow().weight)
            {
                cache.entries.insert(
                    id.into(),
                    CachedNativeStroke {
                        stroke: std::sync::Arc::new(stroke.clone()),
                        prepared: prepared.clone(),
                        weight,
                    },
                );
                cache.weight += weight;
            }
        }
        Ok(prepared)
    }
    pub(crate) fn grain_raster(
        &self,
        color: &str,
        texture: Option<&str>,
        sx: f32,
        sy: f32,
    ) -> Result<std::sync::Arc<resvg::tiny_skia::Pixmap>> {
        let width = (48.0 * sx).round().clamp(1.0, 2048.0) as u32;
        let height = (48.0 * sy).round().clamp(1.0, 2048.0) as u32;
        let key = (texture_id(color, texture), sx.to_bits(), sy.to_bits());
        if let Some(image) = self.textures.borrow().get(&key) {
            return Ok(image.clone());
        }
        let definition = grain(color, "grain", texture);
        let marks = definition
            .split_once('>')
            .unwrap()
            .1
            .rsplit_once("</pattern>")
            .unwrap()
            .0;
        let svg=format!("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"48\" height=\"48\" viewBox=\"0 0 48 48\">{marks}</svg>");
        let tree = resvg::usvg::Tree::from_str(&svg, &self.options)
            .map_err(|e| Error::new("RenderError", e.to_string()))?;
        let mut image = resvg::tiny_skia::Pixmap::new(width, height)
            .ok_or_else(|| Error::new("RenderLimit", "Cannot allocate grain texture"))?;
        resvg::render_clipped(
            &tree,
            resvg::tiny_skia::Transform::from_scale(sx.min(2048.0 / 48.0), sy.min(2048.0 / 48.0)),
            &mut image.as_mut(),
        );
        let image = std::sync::Arc::new(image);
        let mut cache = self.textures.borrow_mut();
        let bytes: usize = cache.values().map(|p| p.data().len()).sum();
        if bytes + image.data().len() > 8 * 1024 * 1024 {
            cache.clear();
        }
        if image.data().len() <= 8 * 1024 * 1024 {
            cache.insert(key, image.clone());
        }
        Ok(image)
    }
    #[cfg(test)]
    fn paint_svg(
        &self,
        stroke: &Value,
        passes: Vec<Pass>,
        viewport: Bounds,
        pixmap: &mut resvg::tiny_skia::Pixmap,
    ) -> Result<()> {
        let (tree, _) = self.stroke_tree(stroke, passes, viewport)?;
        resvg::render(
            &tree,
            resvg::tiny_skia::Transform::from_scale(
                pixmap.width() as f32 / viewport.width as f32,
                pixmap.height() as f32 / viewport.height as f32,
            ),
            &mut pixmap.as_mut(),
        );
        Ok(())
    }
    fn stroke_tree(
        &self,
        stroke: &Value,
        passes: Vec<Pass>,
        viewport: Bounds,
    ) -> Result<(resvg::usvg::Tree, usize)> {
        let mut textures = BTreeMap::new();
        for pass in &passes {
            if pass.grain == Some(true) {
                let color = stroke["color"].as_str().unwrap();
                let id = texture_id(color, pass.texture);
                textures
                    .entry(id.clone())
                    .or_insert_with(|| grain(color, &id, pass.texture));
            }
        }
        let svg=format!("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"{} {} {} {}\" width=\"{}\" height=\"{}\"><defs>{}</defs>{}</svg>",viewport.x,viewport.y,viewport.width,viewport.height,viewport.width,viewport.height,textures.into_values().collect::<String>(),self::stroke(stroke,passes)?);
        if svg.len() > model::MAX_BYTES {
            return Err(Error::new(
                "RenderLimit",
                "A single rendered stroke exceeds 64 MiB.",
            ));
        }
        let tree = resvg::usvg::Tree::from_str(&svg, &self.options)
            .map_err(|e| Error::new("RenderError", e.to_string()))?;
        Ok((tree, svg.len()))
    }
    pub fn add_font(&mut self, bytes: Vec<u8>) -> Result<()> {
        if bytes.len() > 32 * 1024 * 1024 {
            return Err(Error::new("RenderLimit", "Font exceeds 32 MiB."));
        }
        let count = self.options.fontdb.faces().count();
        self.options.fontdb_mut().load_font_data(bytes);
        if self.options.fontdb.faces().count() == count {
            return Err(Error::new("InvalidFont", "Cannot load native font data."));
        }
        if count == 0 {
            self.select_default_font();
        }
        Ok(())
    }
    fn select_default_font(&mut self) {
        let family = self
            .options
            .fontdb
            .faces()
            .find_map(|face| face.families.first().map(|(family, _)| family.clone()));
        if let Some(family) = family {
            self.options
                .fontdb_mut()
                .set_sans_serif_family(family.clone());
            self.options.fontdb_mut().set_serif_family(family.clone());
            self.options
                .fontdb_mut()
                .set_monospace_family(family.clone());
            self.options.font_family = family;
        }
    }
    /// Text layout and embedded-image decoding do not depend on the camera.
    /// Retain the first SVG root and map it into subsequent world-aligned tiles.
    pub(crate) fn paint_element(
        &self,
        element: &Value,
        viewport: Bounds,
        pixmap: &mut resvg::tiny_skia::Pixmap,
    ) -> Result<()> {
        let id = element["id"].as_str().unwrap_or("@background");
        let cached = self
            .elements
            .borrow()
            .entries
            .get(id)
            .filter(|entry| entry.stroke.as_ref() == element)
            .map(|entry| (entry.tree.clone(), entry.viewport));
        let (tree, source) = if let Some(pair) = cached {
            pair
        } else {
            let content = if element["src"].is_string() {
                photo(element)
            } else if element["kind"] == "text" {
                text(element)
            } else {
                highlighter(element)?
            };
            let svg = format!("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"{} {} {} {}\" width=\"{}\" height=\"{}\">{content}</svg>",
                viewport.x, viewport.y, viewport.width, viewport.height, viewport.width, viewport.height);
            let tree = std::sync::Arc::new(
                resvg::usvg::Tree::from_str(&svg, &self.options)
                    .map_err(|e| Error::new("RenderError", e.to_string()))?,
            );
            let mut weight = geometry_weight(&tree, element);
            if let Some(source) = element["src"].as_str() {
                use base64::Engine;
                if let Some((_, encoded)) = source.split_once(',') {
                    if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(encoded) {
                        if let Ok(size) = imagesize::blob_size(&bytes) {
                            weight += size.width * size.height * 4;
                        }
                    }
                }
            }
            let mut cache = self.elements.borrow_mut();
            if let Some(old) = cache.entries.remove(id) {
                cache.weight -= old.weight;
            }
            if cache.weight + weight <= 16 * 1024 * 1024 {
                cache.entries.insert(
                    id.to_owned(),
                    CachedStroke {
                        stroke: std::sync::Arc::new(element.clone()),
                        tree: tree.clone(),
                        viewport,
                        weight,
                    },
                );
                cache.weight += weight;
            }
            (tree, viewport)
        };
        let transform = resvg::tiny_skia::Transform::from_scale(
            pixmap.width() as f32 / viewport.width as f32,
            pixmap.height() as f32 / viewport.height as f32,
        )
        .pre_translate(
            source.x as f32 - viewport.x as f32,
            source.y as f32 - viewport.y as f32,
        );
        if let Some(b) = tree.root().abs_layer_bounding_box().transform(transform) {
            if b.right() < -2.0
                || b.bottom() < -2.0
                || b.x() > pixmap.width() as f32 + 2.0
                || b.y() > pixmap.height() as f32 + 2.0
            {
                return Ok(());
            }
        }
        resvg::render_clipped(&tree, transform, &mut pixmap.as_mut());
        Ok(())
    }
    /// Platform adapters pass bundled/OS font bytes explicitly; no filesystem or network access.
    pub fn new(fonts: impl IntoIterator<Item = Vec<u8>>) -> Self {
        let mut options = resvg::usvg::Options::default();
        for bytes in fonts {
            options.fontdb_mut().load_font_data(bytes);
        }
        options.image_href_resolver = resvg::usvg::ImageHrefResolver {
            resolve_data: resvg::usvg::ImageHrefResolver::default_data_resolver(),
            resolve_string: Box::new(|_, _| None),
        };
        let mut renderer = Self {
            cancellation: None,
            options,
            geometry: Default::default(),
            native_geometry: Default::default(),
            elements: Default::default(),
            geometry_budget: std::cell::Cell::new(Self::GEOMETRY_BUDGET),
            textures: Default::default(),
        };
        renderer.select_default_font();
        renderer
    }
    pub fn render(
        &self,
        page: &Page,
        viewport: Bounds,
        width: u32,
        height: u32,
    ) -> Result<resvg::tiny_skia::Pixmap> {
        self.render_page(page, viewport, width, height, false, false)
    }
    /// Temporary first paint. Point reduction is confined to this preview and
    /// never populates the committed caches or changes the document.
    pub fn preview(
        &self,
        page: &Page,
        viewport: Bounds,
        width: u32,
        height: u32,
    ) -> Result<resvg::tiny_skia::Pixmap> {
        self.render_page(page, viewport, width, height, true, true)
    }
    /// Native committed pixels use the same direct path rasterizer as live ink,
    /// with every original point retained. SVG scene generation is unchanged.
    pub fn render_native(
        &self,
        page: &Page,
        viewport: Bounds,
        width: u32,
        height: u32,
    ) -> Result<resvg::tiny_skia::Pixmap> {
        self.render_page(page, viewport, width, height, true, false)
    }
    fn render_page(
        &self,
        page: &Page,
        viewport: Bounds,
        width: u32,
        height: u32,
        interactive: bool,
        draft: bool,
    ) -> Result<resvg::tiny_skia::Pixmap> {
        self.render_page_value(
            &page.external(),
            viewport,
            width,
            height,
            interactive,
            draft,
        )
    }
    pub(crate) fn render_external_native(
        &self,
        page: &Value,
        viewport: Bounds,
        width: u32,
        height: u32,
    ) -> Result<resvg::tiny_skia::Pixmap> {
        self.render_page_value(page, viewport, width, height, true, false)
    }
    fn render_page_value(
        &self,
        external: &Value,
        viewport: Bounds,
        width: u32,
        height: u32,
        interactive: bool,
        draft: bool,
    ) -> Result<resvg::tiny_skia::Pixmap> {
        self.check_cancellation()?;
        if width == 0
            || height == 0
            || width > 8192
            || height > 8192
            || width as u64 * height as u64 > 16_777_216
        {
            return Err(Error::new(
                "RenderLimit",
                "Raster surface exceeds 16 megapixels.",
            ));
        }
        if self.options.fontdb.faces().next().is_none()
            && visible(external)
                .any(|e| e["kind"] == "text" && !e["text"].as_str().unwrap().is_empty())
        {
            return Err(Error::new(
                "MissingFonts",
                "Native text rendering requires platform font data.",
            ));
        }
        let profile = std::env::var_os("CUBE_NOTES_PROFILE_RENDER").is_some();
        let frame_start = std::time::Instant::now();
        // Compressed byte limits alone cannot prevent a decompression bomb in a raster image.
        // Inspect dimensions before handing embedded data to the SVG image decoder.
        use base64::Engine;
        for photo in external
            .get("background")
            .into_iter()
            .chain(visible(external).filter(|e| e["kind"] == "image"))
        {
            let source = photo["src"].as_str().unwrap();
            // A cached image tree was dimension-validated before insertion.
            // Do not decode the same base64 payload again for every camera tile.
            if self
                .elements
                .borrow()
                .entries
                .get(photo["id"].as_str().unwrap_or("@background"))
                .is_some_and(|entry| entry.stroke["src"].as_str() == Some(source))
            {
                continue;
            }
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(source.split_once(',').unwrap().1)
                .map_err(|_| Error::new("InvalidImage", "Invalid embedded image bytes."))?;
            let size = imagesize::blob_size(&bytes).map_err(|_| {
                Error::new("InvalidImage", "Cannot read embedded raster dimensions.")
            })?;
            if size.width > 8192
                || size.height > 8192
                || size.width as u64 * size.height as u64 > 16_777_216
            {
                return Err(Error::new(
                    "RenderLimit",
                    "Embedded raster exceeds 16 megapixels.",
                ));
            }
        }
        // Rasterize committed elements in document order. A valid compact notebook can
        // expand to far more than 64 MiB of brush SVG; it must not require one giant
        // serialized scene or one giant SVG parse just to open or zoom the board.
        // The paper grid needs no photo payload, element list or history metadata.
        // Previously each tile cloned these values and immediately discarded them.
        let paper = serde_json::json!({"id":"@paper", "paper":external["paper"],
            "color":"none", "width":external["width"], "height":external["height"],"layers":[]});
        let svg = page_svg(&Page::from_validated(paper), Some(viewport))?;
        let tree = resvg::usvg::Tree::from_str(&svg, &self.options)
            .map_err(|e| Error::new("RenderError", e.to_string()))?;
        let mut pixmap = resvg::tiny_skia::Pixmap::new(width, height)
            .ok_or_else(|| Error::new("RenderLimit", "Cannot allocate raster surface."))?;
        let color = external["color"].as_str().unwrap();
        // "none" is reserved for internally constructed selection snapshots;
        // notebook input validation still accepts opaque #RRGGBB paper only.
        if color != "none" {
            let rgb = u32::from_str_radix(&color[1..], 16).unwrap();
            pixmap.fill(resvg::tiny_skia::Color::from_rgba8(
                (rgb >> 16) as u8,
                (rgb >> 8) as u8,
                rgb as u8,
                255,
            ));
        }
        let background_start = std::time::Instant::now();
        if let Some(background) = external.get("background") {
            self.paint_element(background, viewport, &mut pixmap)?;
        }
        let background_ms = background_start.elapsed().as_secs_f64() * 1000.0;
        resvg::render_clipped(
            &tree,
            resvg::tiny_skia::Transform::from_scale(
                width as f32 / viewport.width as f32,
                height as f32 / viewport.height as f32,
            ),
            &mut pixmap.as_mut(),
        );
        for element in visible(external) {
            self.check_cancellation()?;
            let cached_bounds = self
                .native_geometry
                .borrow()
                .entries
                .get(element["id"].as_str().unwrap())
                .filter(|entry| same_ink_geometry(entry.stroke.as_ref(), element))
                .map(|entry| entry.prepared.bounds);
            let b = match cached_bounds {
                Some(b) => b,
                None => bounds(element)?,
            };
            let margin = element["width"].as_f64().unwrap_or(0.0) * 3.0;
            if element["kind"] != "text"
                && (b.x + b.width + margin < viewport.x
                    || b.y + b.height + margin < viewport.y
                    || b.x - margin > viewport.x + viewport.width
                    || b.y - margin > viewport.y + viewport.height)
            {
                continue;
            }
            if element["kind"] == "stroke" && element["tool"] != "highlighter" {
                if interactive {
                    // First paint is temporary. Bound expensive brush geometry
                    // for long strokes; exact pixels replace it in the background.
                    let points = element["points"].as_array().unwrap();
                    if draft && points.len() > 96 {
                        let mut draft = element.clone();
                        draft["points"] = serde_json::json!((0..64)
                            .map(|i| points[i * (points.len() - 1) / 63].clone())
                            .collect::<Vec<_>>());
                        self.paint_ink(&draft, viewport, &mut pixmap, false)?;
                    } else {
                        self.paint_ink(element, viewport, &mut pixmap, !draft)?;
                    }
                } else {
                    self.paint_committed(element, viewport, &mut pixmap)?;
                }
            } else {
                self.paint_element(element, viewport, &mut pixmap)?;
            }
        }
        if profile {
            eprintln!("FRAME_PROFILE {width}x{height} background={background_ms:.2} total={:.2} geometry={:?}",frame_start.elapsed().as_secs_f64()*1000.0,self.native_geometry_cache_stats());
        }
        Ok(pixmap)
    }
}

#[cfg(all(test, feature = "native-renderer"))]
mod local_ink_tests {
    use super::*;
    #[test]
    fn direct_native_paths_do_not_silently_replace_unimplemented_plugins() {
        let stroke = serde_json::json!({"id":"plugin","kind":"stroke","tool":"pen","penStyle":"custom:pastel","width":4,"opacity":1,"pressure":false,"color":"#112233","points":[{"x":1,"y":1,"pressure":0.5}]});
        let typed = Stroke::deserialize(&stroke).unwrap();
        assert_eq!(
            brushes::native::render(&typed).err().unwrap().code,
            "MissingNativeBrush"
        );
    }
    #[test]
    fn direct_native_paths_preserve_all_existing_brush_geometry() {
        for definition in model::builtin_brushes().values() {
            let style = definition["id"].as_str().unwrap();
            for count in [1, 2, 135, 8192] {
                let points=(0..count).map(|i| {let t=i as f64*0.03;serde_json::json!({"x":100.0+70.0*t.sin(),"y":100.0+70.0*(t*0.31).sin(),"pressure":0.2+0.7*(t.sin()+1.0)/2.0})}).collect::<Vec<_>>();
                let stroke = serde_json::json!({"id":"native-path-parity","kind":"stroke","tool":"pen","penStyle":style,"brushVersion":definition["version"].as_u64().unwrap_or(1),"color":"#884422","width":12,"opacity":0.7,"pressure":true,"points":points});
                let typed = Stroke::deserialize(&stroke).unwrap();
                let expected = brushes::render_validated(&typed)
                    .into_iter()
                    .filter_map(|p| native_path(&p.path).unwrap())
                    .collect::<Vec<_>>();
                let actual = brushes::native::render(&typed).unwrap();
                assert_eq!(expected.len(), actual.len(), "{style} {count} pass count");
                for (a, b) in expected.iter().zip(actual) {
                    assert_eq!(a.verbs(), b.path.verbs(), "{style} {count} path topology");
                    assert_eq!(a.points().len(), b.path.points().len());
                    let difference = a
                        .points()
                        .iter()
                        .zip(b.path.points())
                        .map(|(a, b)| (a.x - b.x).abs().max((a.y - b.y).abs()))
                        .fold(0.0_f32, f32::max);
                    assert!(
                        difference < 0.0001,
                        "{style} {count} coordinates changed by {difference}"
                    );
                }
            }
        }
    }
    #[test]
    fn native_eraser_mask_matches_svg_reference_including_taps_and_ellipses() {
        let renderer = Renderer::new([]);
        let viewport = Bounds {
            x: 0.0,
            y: 0.0,
            width: 200.0,
            height: 200.0,
        };
        for mask in [
            serde_json::json!({"width":25,"points":[{"x":100,"y":100},{"x":100,"y":100}]}),
            serde_json::json!({"width":40,"height":15,"points":[{"x":70,"y":80},{"x":130,"y":120}]}),
        ] {
            let stroke = serde_json::json!({"id":"mask-test","kind":"stroke","tool":"pen","penStyle":"ballpoint","width":30,"opacity":0.8,"pressure":false,"color":"#884422","points":[{"x":20,"y":100,"pressure":0.5},{"x":180,"y":100,"pressure":0.5}],"erasures":[mask],"cutouts":[[{"x":35,"y":40},{"x":55,"y":40},{"x":55,"y":160},{"x":35,"y":160}]]});
            let mut reference = resvg::tiny_skia::Pixmap::new(400, 400).unwrap();
            renderer
                .paint_svg(
                    &stroke,
                    brushes::render(&stroke).unwrap(),
                    viewport,
                    &mut reference,
                )
                .unwrap();
            let actual = renderer.overlay(&stroke, viewport, 400, 400).unwrap();
            let errors = actual
                .data()
                .iter()
                .zip(reference.data())
                .map(|(a, b)| a.abs_diff(*b) as usize)
                .collect::<Vec<_>>();
            let mean = errors.iter().sum::<usize>() as f64 / errors.len() as f64;
            let severe = errors.iter().filter(|d| **d > 16).count();
            println!("MASK PARITY mean={mean} severe={severe}");
            assert!(
                mean < 0.06 && severe < 200,
                "Native erase changed pixels: {mean}, {severe}"
            );
            assert_eq!(
                actual.pixel(200, 200).unwrap().alpha(),
                0,
                "Eraser did not cut through the stroke"
            );
            assert_eq!(
                actual.pixel(90, 200).unwrap().alpha(),
                0,
                "Tape cutout disappeared"
            );
        }
    }
    #[test]
    fn cropped_bristles_match_full_surface_on_colored_paper_without_losing_curved_edges() {
        let renderer = Renderer::new([]);
        let stroke = serde_json::json!({"id":"crop-test","kind":"stroke","tool":"pen","penStyle":"brush","brushVersion":2,"width":24,"color":"#884422","opacity":0.7,"pressure":true,"brushSettings":{"dryness":70},"points":[{"x":20,"y":20,"pressure":0.2},{"x":110,"y":25,"pressure":0.9},{"x":25,"y":90,"pressure":0.8},{"x":130,"y":100,"pressure":0.2}]});
        let prepared = renderer.native_stroke(&stroke, true).unwrap();
        let viewport = Bounds {
            x: -27.3,
            y: -13.7,
            width: 300.0,
            height: 300.0,
        };
        let mut local = resvg::tiny_skia::Pixmap::new(600, 600).unwrap();
        local.fill(resvg::tiny_skia::Color::from_rgba8(240, 220, 190, 255));
        let mut full = local.clone();
        renderer
            .paint_native_paths(&prepared, viewport, &mut local, true)
            .unwrap();
        renderer
            .paint_native_paths(&prepared, viewport, &mut full, false)
            .unwrap();
        let diff = local
            .data()
            .iter()
            .zip(full.data())
            .map(|(a, b)| a.abs_diff(*b) as usize)
            .sum::<usize>();
        let severe = local
            .data()
            .iter()
            .zip(full.data())
            .filter(|(a, b)| a.abs_diff(**b) > 8)
            .count();
        assert!(
            diff as f64 / (local.data().len() as f64) < 0.05,
            "Local compositing changed brush appearance"
        );
        assert!(
            severe < 32,
            "A curved edge was clipped or moved: {severe} channels"
        );
    }
}
