//! World-aligned, bounded raster tiles. Camera changes reuse overlapping tiles;
//! publishing one tile never requires waiting for the rest of the viewport.
use crate::{
    native::{Frame, FrameRenderer},
    page::Page,
    render::Bounds,
    Error, Result,
};
use resvg::tiny_skia::{Pixmap, PixmapPaint, Transform};
use std::{collections::HashMap, sync::Arc};
const EDGE: u32 = 384;
const BUDGET: usize = 32 * 1024 * 1024;
type Key = (i32, i64, i64);
#[derive(Default)]
pub(crate) struct TileCache {
    page: Option<Arc<Page>>,
    entries: HashMap<Key, (Pixmap, u64)>,
    clock: u64,
}
impl TileCache {
    pub fn clear(&mut self) {
        self.entries.clear();
        self.page = None;
    }
    fn insert(&mut self, key: Key, pixels: Pixmap) {
        self.clock += 1;
        while !self.entries.contains_key(&key)
            && (self.entries.len() + 1) * EDGE as usize * EDGE as usize * 4 > BUDGET
        {
            if let Some(old) = self
                .entries
                .iter()
                .min_by_key(|(_, (_, stamp))| *stamp)
                .map(|(key, _)| *key)
            {
                self.entries.remove(&old);
            } else {
                break;
            }
        }
        self.entries.insert(key, (pixels, self.clock));
    }
    fn prepare(&mut self, page: &Arc<Page>) -> Result<()> {
        if let Some(old) = &self.page {
            if Arc::ptr_eq(old, page) {
                return Ok(());
            }
            if let Some(dirty) = changed_regions(old, page)? {
                self.entries.retain(|&(level, x, y), _| {
                    let span = EDGE as f64 / scale(level);
                    !dirty.iter().any(|b| {
                        b.x < (x + 1) as f64 * span
                            && b.y < (y + 1) as f64 * span
                            && b.x + b.width > x as f64 * span
                            && b.y + b.height > y as f64 * span
                    })
                });
            } else {
                self.entries.clear();
            }
        }
        self.page = Some(page.clone());
        Ok(())
    }
}
/// Conservative pixel damage for ordinary object edits. Global paper, image,
/// layer-compositing or ordering changes retain the full-invalidation fallback.
fn changed_regions(old: &Page, new: &Page) -> Result<Option<Vec<Bounds>>> {
    use serde_json::Value;
    let head = |p: &Page| {
        p.raw
            .as_object()
            .unwrap()
            .iter()
            .filter(|(k, _)| !["layers", "scenes", "bookmarked"].contains(&k.as_str()))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect::<serde_json::Map<_, _>>()
    };
    if head(old) != head(new)
        || old.photos.len() != new.photos.len()
        || old
            .photos
            .iter()
            .zip(&new.photos)
            .any(|(a, b)| !Arc::ptr_eq(a, b))
    {
        return Ok(None);
    }
    let before = old["layers"].as_array().unwrap();
    let after = new["layers"].as_array().unwrap();
    if before.len() != after.len() {
        return Ok(None);
    }
    let mut dirty = vec![];
    for (a, b) in before.iter().zip(after) {
        let props = |l: &Value| {
            l.as_object()
                .unwrap()
                .iter()
                .filter(|(k, _)| k.as_str() != "elements")
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect::<serde_json::Map<_, _>>()
        };
        if props(a) != props(b) {
            return Ok(None);
        }
        if a["visible"] != true {
            continue;
        }
        let left = a["elements"].as_array().unwrap();
        let right = b["elements"].as_array().unwrap();
        let old_ids = left
            .iter()
            .map(|e| (e["id"].as_str().unwrap(), e))
            .collect::<HashMap<_, _>>();
        let new_ids = right
            .iter()
            .map(|e| (e["id"].as_str().unwrap(), e))
            .collect::<HashMap<_, _>>();
        let common_old = left
            .iter()
            .filter(|e| new_ids.contains_key(e["id"].as_str().unwrap()))
            .map(|e| e["id"].as_str().unwrap());
        let common_new = right
            .iter()
            .filter(|e| old_ids.contains_key(e["id"].as_str().unwrap()))
            .map(|e| e["id"].as_str().unwrap());
        if !common_old.eq(common_new) {
            return Ok(None);
        }
        for (elements, other) in [(left, &new_ids), (right, &old_ids)] {
            for element in elements {
                if other
                    .get(element["id"].as_str().unwrap())
                    .is_some_and(|e| *e == element)
                {
                    continue;
                }
                if let Some(other) = other.get(element["id"].as_str().unwrap()) {
                    if let Some(regions) = erasure_damage(element, other) {
                        dirty.extend(regions);
                        continue;
                    }
                }
                // Fonts can extend outside the estimated text box. Keep their
                // conservative full-invalidation behavior until layout bounds exist.
                if element["kind"] == "text" {
                    return Ok(None);
                }
                let mut bounds = crate::render::bounds(element)?;
                let margin = element["width"].as_f64().unwrap_or(0.0) * 3.0 + 2.0;
                bounds.x -= margin;
                bounds.y -= margin;
                bounds.width += 2.0 * margin;
                bounds.height += 2.0 * margin;
                dirty.push(bounds);
            }
        }
    }
    Ok(Some(dirty))
}

/// Appending/removing an eraser mask changes pixels only near its new/removed
/// tail, even when the source stroke spans the whole board. Works for undo too.
fn erasure_damage(a: &serde_json::Value, b: &serde_json::Value) -> Option<Vec<Bounds>> {
    fn same_except(a: &serde_json::Value, b: &serde_json::Value, key: &str) -> bool {
        a.as_object()
            .unwrap()
            .iter()
            .filter(|(k, _)| k.as_str() != key)
            .eq(b
                .as_object()
                .unwrap()
                .iter()
                .filter(|(k, _)| k.as_str() != key))
    }
    if !same_except(a, b, "erasures") {
        return None;
    }
    let empty = vec![];
    let left = a["erasures"].as_array().unwrap_or(&empty);
    let right = b["erasures"].as_array().unwrap_or(&empty);
    let mut regions = vec![];
    let mut add = |mask: &serde_json::Value, from: usize| -> Option<()> {
        let ps = mask["points"].as_array()?;
        let rx = mask["width"].as_f64()? / 2.0 + 2.0;
        let ry = mask["height"].as_f64().unwrap_or(mask["width"].as_f64()?) / 2.0 + 2.0;
        for first in (from.saturating_sub(1)..ps.len()).step_by(64) {
            let pair = &ps[first.saturating_sub(1)..(first + 64).min(ps.len())];
            let mut x = f64::INFINITY;
            let mut y = f64::INFINITY;
            let mut r = f64::NEG_INFINITY;
            let mut d = f64::NEG_INFINITY;
            for p in pair {
                x = x.min(p["x"].as_f64()?);
                y = y.min(p["y"].as_f64()?);
                r = r.max(p["x"].as_f64()?);
                d = d.max(p["y"].as_f64()?);
            }
            regions.push(Bounds {
                x: x - rx,
                y: y - ry,
                width: r - x + 2.0 * rx,
                height: d - y + 2.0 * ry,
            });
        }
        Some(())
    };
    for i in 0..left.len().max(right.len()) {
        match (left.get(i), right.get(i)) {
            (Some(a), Some(b)) if a == b => {}
            (Some(a), Some(b)) => {
                if !same_except(a, b, "points") {
                    return None;
                }
                let ap = a["points"].as_array()?;
                let bp = b["points"].as_array()?;
                if ap.starts_with(bp) {
                    add(a, bp.len())?;
                } else if bp.starts_with(ap) {
                    add(b, ap.len())?;
                } else {
                    return None;
                }
            }
            (Some(a), None) => add(a, 0)?,
            (None, Some(b)) => add(b, 0)?,
            _ => {}
        }
    }
    Some(regions)
}

enum BandMessage {
    Pixels { x: u32, y: u32, pixels: Pixmap },
    Geometry(crate::render::Renderer),
    Failed(Error),
}
struct BandJob {
    receiver: std::sync::mpsc::Receiver<BandMessage>,
    workers: Vec<std::thread::JoinHandle<()>>,
    stop: Arc<std::sync::atomic::AtomicBool>,
    remaining: usize,
    running: usize,
}
impl Drop for BandJob {
    fn drop(&mut self) {
        if self.remaining > 0 {
            self.stop.store(true, std::sync::atomic::Ordering::Relaxed);
        }
        for worker in self.workers.drain(..) {
            let _ = worker.join();
        }
    }
}
/// Publish complete tile rows as workers finish. A camera/edit cancellation can
/// stop between rows, rather than waiting for an uncached whole-camera raster.
fn start_bands(
    renderer: &crate::render::Renderer,
    page: serde_json::Value,
    plan: TilePlan,
) -> BandJob {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Mutex,
    };
    let vertical = plan.height >= plan.width;
    let count = if vertical {
        plan.height / EDGE
    } else {
        plan.width / EDGE
    };
    let workers = std::thread::available_parallelism()
        .map_or(1, |n| n.get().min(4))
        .min(count as usize);
    let mut regions = (0..count)
        .map(|index| {
            if vertical {
                (0, index * EDGE, plan.width, EDGE)
            } else {
                (index * EDGE, 0, EDGE, plan.height)
            }
        })
        .collect::<Vec<_>>();
    regions.sort_by_key(|(x, y, w, h)| {
        (i64::from(2 * x + w) - i64::from(plan.width)).pow(2)
            + (i64::from(2 * y + h) - i64::from(plan.height)).pow(2)
    });
    regions.reverse();
    let queue = Arc::new(Mutex::new(regions));
    let page = Arc::new(page);
    let stop = renderer
        .cancellation
        .clone()
        .unwrap_or_else(|| Arc::new(AtomicBool::new(false)));
    let (sender, receiver) = mpsc::channel();
    let mut handles = vec![];
    for _ in 0..workers {
        let worker = renderer.fork_for_tile();
        let queue = queue.clone();
        let page = page.clone();
        let stop = stop.clone();
        let sender = sender.clone();
        handles.push(std::thread::spawn(move || {
            while !stop.load(Ordering::Relaxed) {
                let Some((x, y, width, height)) = queue.lock().unwrap().pop() else {
                    break;
                };
                let left = x.saturating_sub(3);
                let top = y.saturating_sub(3);
                let right = (x + width + 3).min(plan.width);
                let bottom = (y + height + 3).min(plan.height);
                let area = Bounds {
                    x: plan.viewport.x + left as f64 / plan.width as f64 * plan.viewport.width,
                    y: plan.viewport.y + top as f64 / plan.height as f64 * plan.viewport.height,
                    width: (right - left) as f64 / plan.width as f64 * plan.viewport.width,
                    height: (bottom - top) as f64 / plan.height as f64 * plan.viewport.height,
                };
                match worker.render_external_native(&page, area, right - left, bottom - top) {
                    Ok(pixels) => {
                        let pixels = pixels
                            .clone_rect(
                                resvg::tiny_skia::IntRect::from_xywh(
                                    (x - left) as i32,
                                    (y - top) as i32,
                                    width,
                                    height,
                                )
                                .unwrap(),
                            )
                            .unwrap();
                        if sender.send(BandMessage::Pixels { x, y, pixels }).is_err() {
                            return;
                        }
                    }
                    Err(error) => {
                        let _ = sender.send(BandMessage::Failed(error));
                        break;
                    }
                }
            }
            let _ = sender.send(BandMessage::Geometry(worker));
        }));
    }
    BandJob {
        receiver,
        workers: handles,
        stop,
        remaining: count as usize,
        running: workers,
    }
}

fn scale(level: i32) -> f64 {
    2.0f64.powf(level as f64 / 2.0)
}
#[derive(Clone, Copy, Debug)]
pub struct TilePlan {
    pub viewport: Bounds,
    pub width: u32,
    pub height: u32,
    pub count: u32,
}
pub struct Tile {
    pub x: u32,
    pub y: u32,
    pub pixels: Pixmap,
    pub cached: bool,
    pub done: bool,
}
pub(crate) struct TileJob {
    page: Arc<Page>,
    external: serde_json::Value,
    plan: TilePlan,
    keys: Vec<Key>,
    left: i64,
    top: i64,
    image: Pixmap,
    level: i32,
    batch: bool,
    bands: Option<BandJob>,
    started: bool,
}
impl FrameRenderer {
    /// Snapshot only: the document camera is never rounded or modified.
    pub fn begin_tiles(&mut self, frame: &Frame, width: u32, height: u32) -> Result<TilePlan> {
        self.cancel_tiles();
        self.renderer.check_cancellation()?;
        let v = frame.viewport;
        crate::model::require(
            width > 0
                && height > 0
                && width <= 8192
                && height <= 8192
                && v.width >= 1.0
                && v.width <= 1e7
                && v.height >= 1.0
                && v.height <= 1e7
                && v.x.abs() <= 1e9
                && v.y.abs() <= 1e9
                && [v.x, v.y, v.width, v.height].iter().all(|n| n.is_finite()),
        )?;
        let desired = (width as f64 / v.width).max(height as f64 / v.height);
        // Never oversample beyond the requested display density. Half-octave
        // LODs keep at least 71% of native pixel density without doubling work.
        let mut level = (desired.log2() * 2.0).floor().clamp(-40.0, 40.0) as i32;
        let (left, top, right, bottom, s) = loop {
            let s = scale(level);
            let span = EDGE as f64 / s;
            let a = (v.x / span).floor() as i64;
            let b = (v.y / span).floor() as i64;
            let c = ((v.x + v.width) / span).ceil() as i64;
            let d = ((v.y + v.height) / span).ceil() as i64;
            if (c - a) * (d - b) * i64::from(EDGE) * i64::from(EDGE) <= 8_000_000
                && (c - a) * i64::from(EDGE) <= 8192
                && (d - b) * i64::from(EDGE) <= 8192
            {
                break (a, b, c, d, s);
            }
            level -= 1;
            crate::model::require(level >= -40)?;
        };
        let w = (right - left) as u32 * EDGE;
        let h = (bottom - top) as u32 * EDGE;
        let plan = TilePlan {
            viewport: Bounds {
                x: left as f64 * EDGE as f64 / s,
                y: top as f64 * EDGE as f64 / s,
                width: w as f64 / s,
                height: h as f64 / s,
            },
            width: w,
            height: h,
            count: ((right - left) * (bottom - top)) as u32,
        };
        // Element caches compare their immutable content before reuse. A local
        // edit must not evict the compiled geometry of every unchanged stroke.
        self.tiles.prepare(&frame.page)?;
        self.renderer.prepare_tile_geometry();
        let mut keys: Vec<Key> = (top..bottom)
            .flat_map(|y| (left..right).map(move |x| (level, x, y)))
            .collect();
        // Pop central tiles first. Cached tiles cost only a copy and are also
        // published progressively rather than holding the UI for a full frame.
        let cx = (left + right - 1) as f64 / 2.0;
        let cy = (top + bottom - 1) as f64 / 2.0;
        keys.sort_by(|a, b| {
            let distance = |k: &Key| (k.1 as f64 - cx).powi(2) + (k.2 as f64 - cy).powi(2);
            distance(b).total_cmp(&distance(a))
        });
        let misses = keys
            .iter()
            .filter(|key| !self.tiles.entries.contains_key(key))
            .count();
        let batch = misses >= 3 && misses > keys.len() / 3;
        self.tile_job = Some(TileJob {
            page: frame.page.clone(),
            external: frame.page.external(),
            plan,
            keys,
            level,
            batch,
            bands: None,
            started: false,
            left,
            top,
            image: Pixmap::new(w, h)
                .ok_or_else(|| Error::new("RenderLimit", "Cannot allocate tile assembly"))?,
        });
        Ok(plan)
    }
    pub fn cancel_tiles(&mut self) {
        if let Some(mut job) = self.tile_job.take() {
            if let Some(mut bands) = job.bands.take() {
                bands.stop.store(true, std::sync::atomic::Ordering::Relaxed);
                for worker in bands.workers.drain(..) {
                    let _ = worker.join();
                }
                // Cancellation discards stale pixels, not valid immutable path
                // preparation. The next edit/camera can reuse that work safely.
                while let Ok(message) = bands.receiver.try_recv() {
                    if let BandMessage::Geometry(worker) = message {
                        self.renderer.absorb_tile_geometry(worker);
                    }
                }
            }
        }
    }
    pub fn next_tile(&mut self) -> Result<Option<Tile>> {
        self.renderer.check_cancellation()?;
        let Some(job) = &mut self.tile_job else {
            return Ok(None);
        };
        if job.batch && job.started {
            if job.bands.is_none() {
                job.bands = Some(start_bands(
                    &self.renderer,
                    std::mem::take(&mut job.external),
                    job.plan,
                ));
            }
            let bands = job.bands.as_mut().unwrap();
            loop {
                let message = bands.receiver.recv().map_err(|_| {
                    Error::new(
                        "RenderError",
                        "Camera worker stopped before publishing its pixels.",
                    )
                })?;
                match message {
                    BandMessage::Geometry(worker) => {
                        self.renderer.absorb_tile_geometry(worker);
                        bands.running -= 1;
                    }
                    BandMessage::Failed(error) => return Err(error),
                    BandMessage::Pixels { x, y, pixels } => {
                        job.image.draw_pixmap(
                            x as i32,
                            y as i32,
                            pixels.as_ref(),
                            &PixmapPaint::default(),
                            Transform::identity(),
                            None,
                        );
                        bands.remaining -= 1;
                        let done = bands.remaining == 0;
                        if done {
                            while bands.running > 0 {
                                match bands.receiver.recv().map_err(|_| {
                                    Error::new("RenderError", "Camera worker failed.")
                                })? {
                                    BandMessage::Geometry(worker) => {
                                        self.renderer.absorb_tile_geometry(worker);
                                        bands.running -= 1;
                                    }
                                    BandMessage::Failed(error) => return Err(error),
                                    BandMessage::Pixels { .. } => unreachable!(),
                                }
                            }
                            let job = self.tile_job.take().unwrap();
                            for row in 0..job.plan.height / EDGE {
                                for col in 0..job.plan.width / EDGE {
                                    let cell = job
                                        .image
                                        .clone_rect(
                                            resvg::tiny_skia::IntRect::from_xywh(
                                                (col * EDGE) as i32,
                                                (row * EDGE) as i32,
                                                EDGE,
                                                EDGE,
                                            )
                                            .unwrap(),
                                        )
                                        .unwrap();
                                    self.tiles.insert(
                                        (
                                            job.level,
                                            job.left + i64::from(col),
                                            job.top + i64::from(row),
                                        ),
                                        cell,
                                    );
                                }
                            }
                            self.cache = Some((
                                job.page,
                                job.plan.viewport,
                                job.plan.width,
                                job.plan.height,
                                job.image,
                            ));
                        }
                        return Ok(Some(Tile {
                            x,
                            y,
                            pixels,
                            cached: false,
                            done,
                        }));
                    }
                }
            }
        }
        // One small central tile provides early detail and warms shared paths
        // before the wider row workers start. Large rows must not delay first paint.
        job.started = true;
        let Some(key) = job.keys.pop() else {
            return Ok(None);
        };
        self.tiles.clock += 1;
        let cached = self.tiles.entries.contains_key(&key);
        let pixels = if let Some((p, stamp)) = self.tiles.entries.get_mut(&key) {
            *stamp = self.tiles.clock;
            p.clone()
        } else {
            let span = EDGE as f64 / scale(key.0);
            let v = Bounds {
                x: key.1 as f64 * span,
                y: key.2 as f64 * span,
                width: span,
                height: span,
            };
            // Two pixel gutters keep antialiasing/filter support away from tile
            // boundaries. Crop with integer offsets, with no resampling.
            let gutter = 2;
            let unit = span / EDGE as f64;
            let expanded = Bounds {
                x: v.x - gutter as f64 * unit,
                y: v.y - gutter as f64 * unit,
                width: v.width + 2.0 * gutter as f64 * unit,
                height: v.height + 2.0 * gutter as f64 * unit,
            };
            let p = self
                .renderer
                .render_external_native(
                    &job.external,
                    expanded,
                    EDGE + 2 * gutter,
                    EDGE + 2 * gutter,
                )?
                .clone_rect(
                    resvg::tiny_skia::IntRect::from_xywh(gutter as i32, gutter as i32, EDGE, EDGE)
                        .unwrap(),
                )
                .unwrap();
            self.tiles.insert(key, p.clone());
            p
        };
        let x = (key.1 - job.left) as u32 * EDGE;
        let y = (key.2 - job.top) as u32 * EDGE;
        job.image.draw_pixmap(
            x as i32,
            y as i32,
            pixels.as_ref(),
            &PixmapPaint::default(),
            Transform::identity(),
            None,
        );
        let done = job.keys.is_empty();
        if done {
            let job = self.tile_job.take().unwrap();
            self.cache = Some((
                job.page,
                job.plan.viewport,
                job.plan.width,
                job.plan.height,
                job.image,
            ));
        }
        Ok(Some(Tile {
            x,
            y,
            pixels,
            cached,
            done,
        }))
    }
    pub fn tile_cache_bytes(&self) -> usize {
        self.tiles.entries.len() * EDGE as usize * EDGE as usize * 4
    }
}
