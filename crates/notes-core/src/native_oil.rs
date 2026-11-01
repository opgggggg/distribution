//! Incremental, spatially indexed live oil paint. All 29 original passes retain
//! their global travel/noise/pressure and are composited once in the same order.
//! A ribbon is split into adjacent closed contours in ONE winding fill per pass;
//! shared internal edges cancel, including at self intersections. Rendering
//! chunks independently with source-over would darken their joins and crossings.
use crate::{
    brushes::{
        marks::{self, OilRibbon},
        Point, Stroke,
    },
    native::Layers,
    render::Bounds,
    Error, Result,
};
use resvg::tiny_skia as skia;
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeSet;

const CHUNK: usize = 64;
const TILE: u32 = 128;
type Section = [[f32; 2]; 2];

#[derive(Clone, Copy)]
struct Rect {
    left: f32,
    top: f32,
    right: f32,
    bottom: f32,
}
impl Rect {
    fn section(p: Section) -> Self {
        Self {
            left: p[0][0].min(p[1][0]),
            top: p[0][1].min(p[1][1]),
            right: p[0][0].max(p[1][0]),
            bottom: p[0][1].max(p[1][1]),
        }
    }
    fn union(self, b: Self) -> Self {
        Self {
            left: self.left.min(b.left),
            top: self.top.min(b.top),
            right: self.right.max(b.right),
            bottom: self.bottom.max(b.bottom),
        }
    }
    fn intersects(self, b: Self) -> bool {
        self.left <= b.right && self.right >= b.left && self.top <= b.bottom && self.bottom >= b.top
    }
}
struct Ribbon {
    spec: OilRibbon,
    sections: Vec<Section>,
    chunks: Vec<Rect>,
    eligible: (usize, usize),
    color: skia::Color,
}
pub(crate) struct LiveOil {
    metadata: Value,
    gpu_only: bool,
    gpu_changed: usize,
    raw_points: Vec<Value>,
    stroke: Stroke,
    samples: Vec<(Point, f64)>,
    ribbons: Vec<Ribbon>,
    viewport: Bounds,
    raster: skia::Pixmap,
    bounds: Option<Rect>,
    pub(crate) updated_sections: usize,
    pub(crate) repainted_tiles: usize,
}
impl LiveOil {
    pub(crate) fn supported(stroke: &Value) -> bool {
        stroke["tool"] == "pen"
            && stroke["penStyle"] == "oil"
            && stroke["brushVersion"].as_u64().unwrap_or(1) >= 2
            && !stroke["cutouts"].as_array().is_some_and(|v| !v.is_empty())
            && !stroke["erasures"].as_array().is_some_and(|v| !v.is_empty())
    }
    fn metadata(stroke: &Value) -> Value {
        Value::Object(
            stroke
                .as_object()
                .unwrap()
                .iter()
                .filter(|(k, _)| k.as_str() != "points")
                .map(|(k, v)| (k.clone(), v.clone()))
                .chain([("points".into(), Value::Array(vec![]))])
                .collect(),
        )
    }
    pub(crate) fn matches(
        &self,
        stroke: &Value,
        viewport: Bounds,
        width: u32,
        height: u32,
    ) -> bool {
        let points = stroke["points"].as_array().unwrap();
        self.viewport == viewport
            && self.raster.width() == width
            && self.raster.height() == height
            && self.metadata == Self::metadata(stroke)
            && points.starts_with(&self.raw_points)
    }
    pub(crate) fn new(stroke: &Value, viewport: Bounds, width: u32, height: u32) -> Result<Self> {
        let metadata = Self::metadata(stroke);
        let typed = Stroke::deserialize(&metadata)?;
        Self::with_ribbons(stroke, viewport, width, height, marks::oil_ribbons(&typed))
    }
    fn with_ribbons(
        stroke: &Value,
        viewport: Bounds,
        width: u32,
        height: u32,
        specs: Vec<OilRibbon>,
    ) -> Result<Self> {
        let metadata = Self::metadata(stroke);
        let typed = Stroke::deserialize(&metadata)?;
        let ribbons = specs
            .into_iter()
            .map(|spec| {
                let rgb = u32::from_str_radix(&spec.color[1..], 16).unwrap();
                let color = skia::Color::from_rgba(
                    ((rgb >> 16) & 255) as f32 / 255.0,
                    ((rgb >> 8) & 255) as f32 / 255.0,
                    (rgb & 255) as f32 / 255.0,
                    spec.opacity as f32,
                )
                .unwrap();
                Ribbon {
                    spec,
                    sections: vec![],
                    chunks: vec![],
                    eligible: (0, 0),
                    color,
                }
            })
            .collect();
        Ok(Self {
            metadata,
            gpu_only: false,
            gpu_changed: 0,
            raw_points: vec![],
            stroke: typed,
            samples: vec![],
            ribbons,
            viewport,
            raster: skia::Pixmap::new(width, height)
                .ok_or_else(|| Error::new("RenderLimit", "Cannot allocate live oil surface."))?,
            bounds: None,
            updated_sections: 0,
            repainted_tiles: 0,
        })
    }
    fn dirty_rect(&self, rect: Rect, dirty: &mut BTreeSet<(u32, u32)>) {
        if self.gpu_only {
            return;
        }
        let sx = self.raster.width() as f64 / self.viewport.width;
        let sy = self.raster.height() as f64 / self.viewport.height;
        let left = (((rect.left as f64 - self.viewport.x) * sx).floor() - 3.0)
            .clamp(0.0, self.raster.width() as f64) as u32;
        let top = (((rect.top as f64 - self.viewport.y) * sy).floor() - 3.0)
            .clamp(0.0, self.raster.height() as f64) as u32;
        let right = (((rect.right as f64 - self.viewport.x) * sx).ceil() + 3.0)
            .clamp(0.0, self.raster.width() as f64) as u32;
        let bottom = (((rect.bottom as f64 - self.viewport.y) * sy).ceil() + 3.0)
            .clamp(0.0, self.raster.height() as f64) as u32;
        if left < right && top < bottom {
            for y in top / TILE..=(bottom - 1) / TILE {
                for x in left / TILE..=(right - 1) / TILE {
                    dirty.insert((x, y));
                }
            }
        }
    }
    pub(crate) fn update(&mut self, value: &Value) -> Result<Layers> {
        let points = value["points"].as_array().unwrap();
        let before = self.raw_points.len();
        self.updated_sections = 0;
        self.repainted_tiles = 0;
        if before == points.len() {
            return self.output();
        }
        for p in &points[before..] {
            self.stroke.points.push(Point::deserialize(p)?);
            self.raw_points.push(p.clone());
        }
        // The existing interchange algorithm caps interpolation by source count.
        // A cap change only affects prior segments whose spacing exceeded it.
        let cap = (5000 / points.len()).clamp(1, 64);
        let old_cap = if before == 0 {
            cap
        } else {
            (5000 / before).clamp(1, 64)
        };
        let rebuild = before == 0
            || (cap != old_cap
                && self.stroke.points[..before]
                    .windows(2)
                    .any(|p| ((p[1].x - p[0].x).hypot(p[1].y - p[0].y) / 3.0).ceil() > cap as f64));
        let old_len = self.samples.len();
        let mut dirty = BTreeSet::new();
        // Erase old trailing geometry too: both its tangent and its trim can change.
        for ribbon in &self.ribbons {
            let (start, end) = ribbon.eligible;
            let from = if rebuild {
                start
            } else {
                end.saturating_sub(2)
                    .min(old_len.saturating_sub(2))
                    .max(start)
            };
            for pair in ribbon.sections[from..end].windows(2) {
                self.dirty_rect(
                    Rect::section(pair[0]).union(Rect::section(pair[1])),
                    &mut dirty,
                );
            }
        }
        if before == 1 {
            if let Some(b) = self.bounds {
                self.dirty_rect(b, &mut dirty);
            }
        }
        if rebuild {
            self.samples = marks::ribbon_samples(&self.stroke);
        } else {
            marks::extend_ribbon_samples(&self.stroke, before, &mut self.samples);
        }
        let changed = if rebuild {
            0
        } else {
            old_len.saturating_sub(1)
        };
        self.gpu_changed = changed;
        let travel = self.samples.last().unwrap().1;
        let mut new_dirty = vec![];
        let mut all_bounds = self.bounds;
        for ribbon in &mut self.ribbons {
            let old_end = ribbon.eligible.1;
            ribbon.sections.truncate(changed);
            let p = &ribbon.spec;
            for i in changed..self.samples.len() {
                let section = marks::ribbon_section(
                    &self.stroke,
                    &self.samples,
                    i,
                    p.offset,
                    p.thickness,
                    p.roughness,
                    p.seed,
                )
                .map(|p| p.map(|n| format!("{n:.2}").parse::<f32>().unwrap()));
                ribbon.sections.push(section);
                self.updated_sections += 1;
            }
            let start = self.samples.partition_point(|p| p.1 < ribbon.spec.trim);
            let end = self
                .samples
                .partition_point(|p| p.1 <= travel - ribbon.spec.trim * 0.7)
                .max(start);
            ribbon.eligible = (start, end);
            let from = if rebuild {
                start
            } else {
                changed.min(old_end.saturating_sub(1)).max(start)
            };
            for pair in ribbon.sections[from..end].windows(2) {
                new_dirty.push(Rect::section(pair[0]).union(Rect::section(pair[1])));
            }
            // Bounds per overlapping block of 64 segments make a long stroke's
            // dirty tile query visit local contours, not all historical points.
            let block = changed.saturating_sub(1) / CHUNK;
            ribbon.chunks.truncate(block);
            for first in (block * CHUNK..ribbon.sections.len().saturating_sub(1)).step_by(CHUNK) {
                let last = (first + CHUNK + 1).min(ribbon.sections.len());
                let b = ribbon.sections[first..last]
                    .iter()
                    .copied()
                    .map(Rect::section)
                    .reduce(Rect::union)
                    .unwrap();
                ribbon.chunks.push(b);
            }
        }
        if self.samples.len() == 1 {
            let p = &self.samples[0].0;
            let w = self.stroke.width_at(p);
            for ribbon in &self.ribbons {
                let top = p.y + (ribbon.spec.offset - ribbon.spec.thickness / 2.0) * w;
                new_dirty.push(Rect {
                    left: (p.x - w * 0.12) as f32,
                    top: top as f32,
                    right: (p.x + w * 0.12) as f32,
                    bottom: (top + ribbon.spec.thickness * w) as f32,
                });
            }
        }
        for rect in new_dirty {
            all_bounds = Some(all_bounds.map_or(rect, |b| b.union(rect)));
            self.dirty_rect(rect, &mut dirty);
        }
        self.bounds = all_bounds;
        self.repainted_tiles = dirty.len();
        for (x, y) in dirty {
            self.paint_tile(x * TILE, y * TILE)?;
        }
        self.output()
    }
    #[cfg(feature = "gpu-renderer")]
    pub(crate) fn gpu_sections(
        &mut self,
        value: &Value,
    ) -> Result<Vec<(&[[[f32; 2]; 2]], (usize, usize), usize, &str, f64)>> {
        self.update(value)?;
        Ok(self
            .ribbons
            .iter()
            .map(|r| {
                (
                    r.sections.as_slice(),
                    r.eligible,
                    self.gpu_changed,
                    r.spec.color.as_str(),
                    r.spec.opacity,
                )
            })
            .collect())
    }
    #[cfg(feature = "gpu-renderer")]
    pub(crate) fn new_gpu(stroke: &Value) -> Result<Self> {
        let mut geometry = Self::new(
            stroke,
            Bounds {
                x: 0.,
                y: 0.,
                width: 1.,
                height: 1.,
            },
            1,
            1,
        )?;
        geometry.gpu_only = true;
        Ok(geometry)
    }
    #[cfg(feature = "gpu-renderer")]
    pub(crate) fn new_gpu_chinese(stroke: &Value) -> Result<Self> {
        let typed = Stroke::deserialize(&Self::metadata(stroke))?;
        let mut geometry = Self::with_ribbons(
            stroke,
            Bounds {
                x: 0.,
                y: 0.,
                width: 1.,
                height: 1.,
            },
            1,
            1,
            marks::chinese_ribbons(&typed),
        )?;
        geometry.gpu_only = true;
        Ok(geometry)
    }
    /// Reuse incremental pressure/travel/bristle sections without rasterizing
    /// pixels. GPU winding fills each complete ribbon once, including overlaps.
    #[cfg(feature = "gpu-renderer")]
    pub(crate) fn gpu_paths(
        &mut self,
        value: &Value,
    ) -> Result<Vec<crate::brushes::native::PreparedPass>> {
        self.update(value)?;
        if self.samples.len() == 1 {
            return crate::brushes::native::render(&self.stroke);
        }
        let mut passes = vec![];
        for ribbon in &self.ribbons {
            let (start, end) = ribbon.eligible;
            if start >= end {
                continue;
            }
            let mut path = skia::PathBuilder::new();
            let p = ribbon.sections[start][0];
            path.move_to(p[0], p[1]);
            for section in &ribbon.sections[start + 1..end] {
                let p = section[0];
                path.line_to(p[0], p[1]);
            }
            for section in ribbon.sections[start..end].iter().rev() {
                let p = section[1];
                path.line_to(p[0], p[1]);
            }
            path.close();
            if let Some(path) = path.finish() {
                passes.push(crate::brushes::native::PreparedPass {
                    path,
                    color: ribbon.spec.color.clone(),
                    opacity: ribbon.spec.opacity,
                    grain: None,
                    clip: false,
                });
            }
        }
        Ok(passes)
    }
    fn paint_tile(&mut self, x: u32, y: u32) -> Result<()> {
        let right = (x + TILE).min(self.raster.width());
        let bottom = (y + TILE).min(self.raster.height());
        let left = x.saturating_sub(2);
        let top = y.saturating_sub(2);
        let w = (right + 2).min(self.raster.width()) - left;
        let h = (bottom + 2).min(self.raster.height()) - top;
        let mut tile = skia::Pixmap::new(w, h)
            .ok_or_else(|| Error::new("RenderLimit", "Cannot allocate oil tile."))?;
        let sx = self.raster.width() as f64 / self.viewport.width;
        let sy = self.raster.height() as f64 / self.viewport.height;
        let region = Rect {
            left: (self.viewport.x + left as f64 / sx) as f32,
            top: (self.viewport.y + top as f64 / sy) as f32,
            right: (self.viewport.x + (left + w) as f64 / sx) as f32,
            bottom: (self.viewport.y + (top + h) as f64 / sy) as f32,
        };
        let transform = skia::Transform::from_row(
            sx as f32,
            0.0,
            0.0,
            sy as f32,
            (-self.viewport.x * sx - left as f64) as f32,
            (-self.viewport.y * sy - top as f64) as f32,
        );
        for ribbon in &self.ribbons {
            let mut path = skia::PathBuilder::new();
            if self.samples.len() == 1 {
                let p = &self.samples[0].0;
                let w = self.stroke.width_at(p);
                let px = p.x - w * 0.12;
                let py = p.y + (ribbon.spec.offset - ribbon.spec.thickness / 2.0) * w;
                // Match the original single-point SVG's relative h/v commands.
                let rect = skia::Rect::from_xywh(
                    px as f32,
                    py as f32,
                    (w * 0.24) as f32,
                    (ribbon.spec.thickness * w) as f32,
                );
                if let Some(rect) = rect {
                    path.push_rect(rect);
                }
            } else {
                let (start, end) = ribbon.eligible;
                for (i, bounds) in ribbon.chunks.iter().enumerate() {
                    if !bounds.intersects(region) {
                        continue;
                    }
                    let first = (i * CHUNK).max(start);
                    let last = ((i + 1) * CHUNK).min(end.saturating_sub(1));
                    if first >= last {
                        continue;
                    }
                    let p = ribbon.sections[first][0];
                    path.move_to(p[0], p[1]);
                    for section in &ribbon.sections[first + 1..=last] {
                        let p = section[0];
                        path.line_to(p[0], p[1]);
                    }
                    for section in ribbon.sections[first..=last].iter().rev() {
                        let p = section[1];
                        path.line_to(p[0], p[1]);
                    }
                    path.close();
                }
            }
            if let Some(path) = path.finish() {
                let mut paint = skia::Paint::default();
                paint.set_color(ribbon.color);
                tile.fill_path(&path, &paint, skia::FillRule::Winding, transform, None);
            }
        }
        let stride = self.raster.width() as usize * 4;
        for row in y..bottom {
            let from = ((row - top) * w + x - left) as usize * 4;
            let to = row as usize * stride + x as usize * 4;
            self.raster.data_mut()[to..to + (right - x) as usize * 4]
                .copy_from_slice(&tile.data()[from..from + (right - x) as usize * 4]);
        }
        Ok(())
    }
    fn output(&self) -> Result<Layers> {
        if self.gpu_only {
            return Ok(Layers {
                base_changed: false,
                x: 0,
                y: 0,
                patch: None,
            });
        }
        let Some(b) = self.bounds else {
            return Ok(Layers {
                base_changed: false,
                x: 0,
                y: 0,
                patch: None,
            });
        };
        let sx = self.raster.width() as f64 / self.viewport.width;
        let sy = self.raster.height() as f64 / self.viewport.height;
        let x = (((b.left as f64 - self.viewport.x) * sx).floor() - 3.0)
            .clamp(0.0, self.raster.width() as f64) as u32;
        let y = (((b.top as f64 - self.viewport.y) * sy).floor() - 3.0)
            .clamp(0.0, self.raster.height() as f64) as u32;
        let right = (((b.right as f64 - self.viewport.x) * sx).ceil() + 3.0)
            .clamp(0.0, self.raster.width() as f64) as u32;
        let bottom = (((b.bottom as f64 - self.viewport.y) * sy).ceil() + 3.0)
            .clamp(0.0, self.raster.height() as f64) as u32;
        let patch = if right > x && bottom > y {
            self.raster.clone_rect(
                skia::IntRect::from_xywh(x as i32, y as i32, right - x, bottom - y).unwrap(),
            )
        } else {
            None
        };
        Ok(Layers {
            base_changed: false,
            x,
            y,
            patch,
        })
    }
}
