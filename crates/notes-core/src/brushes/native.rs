//! Native paths for validated strokes: no SVG polygon serialization/parsing.
use super::{marks, outline, Stroke};
use crate::{render::native_path, Result};
use resvg::tiny_skia::{Path, PathBuilder};
pub(crate) struct PreparedPass {
    pub path: Path,
    pub opacity: f64,
    pub color: String,
    pub grain: Option<Option<&'static str>>,
    pub clip: bool,
}
fn polygon(builder: &mut PathBuilder, points: &[[f64; 2]]) {
    let q = |v: f64| ((v * 100.0).round() / 100.0) as f32;
    if let Some(p) = points.first() {
        builder.move_to(q(p[0]), q(p[1]));
        for p in &points[1..] {
            builder.line_to(q(p[0]), q(p[1]));
        }
        builder.close();
    }
}
pub(crate) fn outline_path(s: &Stroke, scale: f64) -> Option<Path> {
    let mut p = PathBuilder::new();
    polygon(&mut p, &outline::outline(s, scale));
    p.finish()
}
pub(crate) fn render(s: &Stroke) -> Result<Vec<PreparedPass>> {
    if !s.style.is_empty() && !crate::native::STYLES.contains(&s.style.as_str()) {
        return Err(crate::Error::new(
            "MissingNativeBrush",
            format!("Native renderer unavailable for {}.", s.style),
        ));
    }
    let mut result = vec![];
    let mut add = |path: Option<Path>, opacity: f64, color: String, grain, clip| {
        if let Some(path) = path {
            result.push(PreparedPass {
                path,
                opacity,
                color,
                grain,
                clip,
            });
        }
    };
    let outline = || outline_path(s, 1.0);
    let ribbon = |points: &[(super::Point, f64)],
                  offset: f64,
                  thickness: f64,
                  roughness: f64,
                  seed: f64,
                  trim: f64|
     -> Result<Option<Path>> {
        if points.len() == 1 {
            return native_path(&marks::ribbon(s, offset, thickness, roughness, seed, trim));
        }
        let distance = points.last().map_or(0.0, |p| p.1);
        let mut upper = vec![];
        let mut lower = vec![];
        for (i, (_, travel)) in points.iter().enumerate() {
            if *travel < trim || *travel > distance - trim * 0.7 {
                continue;
            }
            let [a, b] = marks::ribbon_section(s, points, i, offset, thickness, roughness, seed);
            upper.push(a);
            lower.push(b);
        }
        upper.extend(lower.into_iter().rev());
        let mut p = PathBuilder::new();
        polygon(&mut p, &upper);
        Ok(p.finish())
    };
    match s.style.as_str() {
        "oil" if s.brush_version >= 2 => {
            let points = marks::ribbon_samples(s);
            for p in marks::oil_ribbons(s) {
                add(
                    ribbon(&points, p.offset, p.thickness, p.roughness, p.seed, p.trim)?,
                    p.opacity,
                    p.color,
                    None,
                    false,
                );
            }
        }
        "brush" if s.brush_version >= 2 => {
            let dry = s.setting("dryness", 40.0) / 100.0;
            let path = outline();
            add(
                path.clone(),
                if dry == 0.0 {
                    s.opacity
                } else {
                    s.opacity * (1.0 - dry * 0.85)
                },
                s.color.clone(),
                None,
                false,
            );
            if dry != 0.0 {
                let points = marks::ribbon_samples(s);
                for bristle in marks::chinese_ribbons(s) {
                    add(
                        ribbon(
                            &points,
                            bristle.offset,
                            bristle.thickness,
                            bristle.roughness,
                            bristle.seed,
                            bristle.trim,
                        )?,
                        bristle.opacity,
                        bristle.color,
                        None,
                        true,
                    );
                }
                add(
                    path,
                    s.opacity * dry * 0.12,
                    s.color.clone(),
                    Some(None),
                    false,
                );
            }
        }
        "pencil" if s.brush_version >= 2 => {
            let path = outline();
            add(
                path.clone(),
                s.opacity * 0.035,
                s.color.clone(),
                None,
                false,
            );
            add(path, s.opacity * 0.8, s.color.clone(), Some(None), false);
            let points = marks::ribbon_samples(s);
            for (i, offset) in [-0.18, 0.0, 0.19].into_iter().enumerate() {
                add(
                    ribbon(&points, offset, 0.065, 0.8, (i + 4) as f64, 0.0)?,
                    s.opacity * 0.22,
                    s.color.clone(),
                    None,
                    false,
                );
            }
        }
        "watercolor" if s.brush_version >= 2 => {
            let water = s.setting("water", 75.0) / 100.0;
            let points = marks::ribbon_samples(s);
            for (i, scale) in [1.0, 0.96, 0.91, 0.85, 0.78, 0.68].into_iter().enumerate() {
                add(
                    ribbon(&points, 0.0, scale, 0.4 + water * 0.4, 11.0, 0.0)?,
                    s.opacity * (0.018 + i as f64 * 0.012) * (1.3 - water * 0.5),
                    s.color.clone(),
                    None,
                    false,
                );
            }
            add(
                ribbon(&points, 0.0, 0.88, 0.5, 11.0, 0.0)?,
                s.opacity * 0.14,
                s.color.clone(),
                Some(Some("paper")),
                false,
            );
            for offset in [-0.44, 0.44] {
                add(
                    ribbon(&points, offset, 0.035, 0.35, 11.0, 0.0)?,
                    s.opacity * 0.14 * (1.0 - water * 0.5),
                    s.color.clone(),
                    None,
                    false,
                );
            }
        }
        "crayon" if s.brush_version >= 2 => {
            let points = marks::ribbon_samples(s);
            for (offset, thickness, roughness, seed, opacity, grain) in [
                (0.0, 0.98, 0.35, 8.0, 0.2, None),
                (0.0, 1.0, 0.4, 8.0, 0.85, Some(Some("wax"))),
                (-0.12, 0.48, 0.6, 21.0, 0.25, Some(Some("wax"))),
            ] {
                add(
                    ribbon(&points, offset, thickness, roughness, seed, 0.0)?,
                    s.opacity * opacity,
                    s.color.clone(),
                    grain,
                    false,
                );
            }
        }
        "reed" | "marker" if s.style == "reed" || s.brush_version >= 2 => {
            let reed = s.style == "reed";
            let mut p = PathBuilder::new();
            for hull in marks::chisel_hulls(
                s,
                if reed { s.setting("angle", 45.0) } else { 35.0 },
                if reed { 0.12 } else { 0.3 },
                reed,
            ) {
                polygon(&mut p, &hull);
            }
            add(p.finish(), s.opacity, s.color.clone(), None, false);
        }
        "ballpoint" | "fountain" | "" => add(outline(), s.opacity, s.color.clone(), None, false),
        _ => {
            for p in super::render_validated(s) {
                add(
                    native_path(&p.path)?,
                    p.opacity,
                    p.color.unwrap_or_else(|| s.color.clone()),
                    if p.grain == Some(true) {
                        Some(p.texture)
                    } else {
                        None
                    },
                    false,
                );
            }
        }
    }
    Ok(result)
}
