//! Portable brush geometry. Native hosts consume these passes without a DOM or canvas.
pub(crate) mod marks;
#[cfg(feature = "native-renderer")]
pub(crate) mod native;
mod outline;
mod spray;
use crate::{model, Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
#[derive(Clone, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
    pub pressure: f64,
    pub width: Option<f64>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stroke {
    pub id: String,
    pub color: String,
    pub width: f64,
    pub opacity: f64,
    pub pressure: bool,
    pub points: Vec<Point>,
    #[serde(rename = "penStyle", default)]
    pub style: String,
    #[serde(default = "version")]
    pub brush_version: u32,
    pub brush_seed: Option<u32>,
    #[serde(default)]
    pub brush_settings: HashMap<String, f64>,
}
fn version() -> u32 {
    1
}
impl Stroke {
    pub fn setting(&self, id: &str, default: f64) -> f64 {
        self.brush_settings.get(id).copied().unwrap_or(default)
    }
    pub fn width_at(&self, p: &Point) -> f64 {
        if let Some(w) = p.width {
            return w;
        }
        self.width
            * if !self.pressure || self.style == "ballpoint" {
                1.0
            } else {
                match self.style.as_str() {
                    "fountain" => 0.6 + 0.8 * p.pressure,
                    "brush" => 0.1 + 1.8 * p.pressure,
                    "pencil" => 0.7 + 0.6 * p.pressure,
                    "watercolor" | "reed" => 0.65 + 0.7 * p.pressure,
                    "marker" => 0.85 + 0.3 * p.pressure,
                    "crayon" | "oil" => 0.6 + 0.8 * p.pressure,
                    "spray" => 0.7 + 0.6 * p.pressure,
                    _ => 0.3 + 1.4 * p.pressure,
                }
            }
    }
    pub(crate) fn seed(&self) -> u32 {
        self.brush_seed.unwrap_or_else(|| {
            let mut seed = 2166136261u32;
            // JS for-of iterates code points; charCodeAt(0) reads the first UTF-16 unit.
            for c in self.id.chars() {
                let mut units = [0; 2];
                seed = (seed ^ c.encode_utf16(&mut units)[0] as u32).wrapping_mul(16777619);
            }
            seed
        })
    }
    fn tone(&self) -> f64 {
        if !self.pressure {
            return 0.5;
        }
        let (mut weight, mut pressure) = (0.0, 0.0);
        for pair in self.points.windows(2) {
            let a = &pair[0];
            let b = &pair[1];
            let d = (b.x - a.x).hypot(b.y - a.y);
            weight += d;
            pressure += d * (a.pressure + b.pressure) / 2.0;
        }
        if weight > 0.0 {
            pressure / weight
        } else {
            self.points[0].pressure
        }
    }
    pub fn path(&self, scale: f64) -> String {
        polygon(&outline::outline(self, scale))
    }
}
#[derive(Clone, Serialize, Debug)]
pub struct Pass {
    pub path: String,
    pub opacity: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grain: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub texture: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clip: Option<String>,
}
impl Pass {
    pub fn new(path: String, opacity: f64) -> Self {
        Self {
            path,
            opacity,
            color: None,
            grain: None,
            texture: None,
            clip: None,
        }
    }
    pub fn grain(mut self, texture: Option<&'static str>) -> Self {
        self.grain = Some(true);
        self.texture = texture;
        self
    }
    pub fn color(mut self, color: String) -> Self {
        self.color = Some(color);
        self
    }
    pub fn clip(mut self, path: String) -> Self {
        self.clip = Some(path);
        self
    }
}
fn fixed(n: f64) -> String {
    let value = format!("{n:.2}");
    if value == "-0.00" && n >= 0.0 {
        "0.00".into()
    } else {
        value
    }
}
fn polygon(points: &[[f64; 2]]) -> String {
    if points.is_empty() {
        return String::new();
    }
    format!(
        "M{}Z",
        points
            .iter()
            .map(|p| format!("{},{}", fixed(p[0]), fixed(p[1])))
            .collect::<Vec<_>>()
            .join("L")
    )
}
/// Entry point for untrusted host requests; native live-input uses the validated typed form.
pub fn render(value: &Value) -> Result<Vec<Pass>> {
    model::require(value["kind"] == "stroke" && value["tool"] == "pen")?;
    let style = value["penStyle"].as_str().unwrap_or("");
    if style.contains(':') {
        return Err(Error::new(
            "MissingNativeBrush",
            format!("Native renderer unavailable for {style}."),
        ));
    }
    let id = value["id"].as_str().unwrap_or("");
    let page_id = if id == "native-geometry-page" {
        "native-geometry-page-2"
    } else {
        "native-geometry-page"
    };
    let layer_id = if id == "native-geometry-layer" {
        "native-geometry-layer-2"
    } else {
        "native-geometry-layer"
    };
    let page = json!({"id":page_id,"infinite":true,"width":595.28,"height":841.89,"paper":"plain","color":"#ffffff","bookmarked":false,"layers":[{"id":layer_id,"name":"Ink","visible":true,"elements":[value]}]});
    model::validate_page(&page, &model::builtin_brushes())?;
    let stroke: Stroke = serde_json::from_value(value.clone())?;
    Ok(render_validated(&stroke))
}
pub fn render_validated(s: &Stroke) -> Vec<Pass> {
    match s.style.as_str() {
        "brush" if s.brush_version >= 2 => marks::chinese(s),
        "pencil" if s.brush_version >= 2 => marks::graphite(s),
        "watercolor" if s.brush_version >= 2 => marks::wash(s),
        "marker" if s.brush_version >= 2 => {
            vec![Pass::new(marks::chisel(s, 35.0, 0.3, false), s.opacity)]
        }
        "crayon" if s.brush_version >= 2 => marks::wax(s),
        "reed" => vec![Pass::new(
            marks::chisel(s, s.setting("angle", 45.0), 0.12, true),
            s.opacity,
        )],
        "spray" => spray::render(s),
        "oil" if s.brush_version >= 2 => marks::oil(s),
        "brush" => {
            let dry = s.setting("dryness", 0.0) / 100.0;
            if dry == 0.0 {
                return vec![Pass::new(s.path(1.0), s.opacity)];
            }
            let path = s.path(1.0);
            vec![
                Pass::new(path.clone(), s.opacity * (1.0 - dry * 0.8)),
                Pass::new(path, s.opacity * dry).grain(None),
            ]
        }
        "pencil" => {
            let t = s.tone();
            let path = s.path(1.0);
            vec![
                Pass::new(path.clone(), s.opacity * (0.045 + t * 0.14)),
                Pass::new(path, s.opacity * (0.3 + t * 0.7)).grain(None),
            ]
        }
        "watercolor" => {
            let mut passes = Vec::new();
            for (scale, opacity) in [
                (1.0, 0.015),
                (0.98, 0.025),
                (0.94, 0.04),
                (0.9, 0.06),
                (0.86, 0.09),
                (0.81, 0.14),
                (0.75, 0.19),
                (0.68, 0.24),
            ] {
                passes.push(Pass::new(s.path(scale), s.opacity * opacity));
            }
            passes.push(Pass::new(s.path(0.86), s.opacity * 0.1).grain(None));
            passes
        }
        "crayon" => {
            let t = s.tone();
            let path = s.path(1.0);
            vec![
                Pass::new(path.clone(), s.opacity * (0.16 + t * 0.24)),
                Pass::new(path, s.opacity * (0.4 + t * 0.55)).grain(None),
                Pass::new(s.path(0.7), s.opacity * 0.16).grain(None),
            ]
        }
        "oil" => marks::legacy_oil(s),
        _ => vec![Pass::new(s.path(1.0), s.opacity)],
    }
}
