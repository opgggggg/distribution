//! Native selection, sweep erasing and geometric manipulation. No UI/browser dependencies.
use crate::{
    native::InputSample,
    render::{self, Bounds},
    Result,
};
use serde_json::{json, Value};
use std::collections::HashSet;
fn xy(p: &Value) -> (f64, f64) {
    (p["x"].as_f64().unwrap(), p["y"].as_f64().unwrap())
}
fn dist(p: (f64, f64), a: (f64, f64), b: (f64, f64)) -> f64 {
    let dx = b.0 - a.0;
    let dy = b.1 - a.1;
    let t = if dx * dx + dy * dy > 0.0 {
        ((p.0 - a.0) * dx + (p.1 - a.1) * dy) / (dx * dx + dy * dy)
    } else {
        0.0
    }
    .clamp(0.0, 1.0);
    (p.0 - a.0 - t * dx).hypot(p.1 - a.1 - t * dy)
}
fn cross(a: (f64, f64), b: (f64, f64), c: (f64, f64)) -> f64 {
    (b.0 - a.0) * (c.1 - a.1) - (b.1 - a.1) * (c.0 - a.0)
}
fn segment_distance(a: (f64, f64), b: (f64, f64), c: (f64, f64), d: (f64, f64)) -> f64 {
    if cross(a, b, c) * cross(a, b, d) < 0.0 && cross(c, d, a) * cross(c, d, b) < 0.0 {
        return 0.0;
    }
    dist(a, c, d)
        .min(dist(b, c, d))
        .min(dist(c, a, b))
        .min(dist(d, a, b))
}
pub fn contains(b: Bounds, x: f64, y: f64) -> bool {
    x >= b.x && y >= b.y && x <= b.x + b.width && y <= b.y + b.height
}
fn inside(p: (f64, f64), polygon: &[InputSample]) -> bool {
    let mut hit = false;
    if polygon.len() < 3 {
        return false;
    }
    let mut j = polygon.len() - 1;
    for i in 0..polygon.len() {
        let a = polygon[i];
        let b = polygon[j];
        if (a.y > p.1) != (b.y > p.1) && p.0 < (b.x - a.x) * (p.1 - a.y) / (b.y - a.y) + a.x {
            hit = !hit
        }
        j = i;
    }
    hit
}
fn covers(e: &Value, a: (f64, f64), b: (f64, f64), inset: f64) -> bool {
    let rx = e["width"].as_f64().unwrap() / 2.0;
    let ry = e["height"].as_f64().unwrap_or(rx * 2.0) / 2.0;
    let ps = e["points"].as_array().unwrap();
    ps.iter().enumerate().any(|(i, q)| {
        let p = &ps[i.saturating_sub(1)];
        let p = xy(p);
        let q = xy(q);
        let p = (p.0 / rx, p.1 / ry);
        let q = (q.0 / rx, q.1 / ry);
        dist((a.0 / rx, a.1 / ry), p, q) <= 1.0 - inset / rx.min(ry) + 1e-7
            && dist((b.0 / rx, b.1 / ry), p, q) <= 1.0 - inset / rx.min(ry) + 1e-7
    })
}
fn hit(e: &Value, a: (f64, f64), b: (f64, f64), radius: f64) -> bool {
    if e["kind"] != "stroke" {
        return render::bounds(e).is_ok_and(|r| {
            contains(
                Bounds {
                    x: r.x - radius,
                    y: r.y - radius,
                    width: r.width + radius * 2.0,
                    height: r.height + radius * 2.0,
                },
                b.0,
                b.1,
            )
        });
    }
    if e["erasures"]
        .as_array()
        .is_some_and(|es| es.iter().any(|e| covers(e, a, b, radius)))
    {
        return false;
    }
    let Ok(stroke) = <crate::brushes::Stroke as serde::Deserialize>::deserialize(e) else {
        return false;
    };
    stroke.points.iter().enumerate().any(|(i, p)| {
        let q = &stroke.points[i.saturating_sub(1)];
        segment_distance(a, b, (p.x, p.y), (q.x, q.y))
            <= radius + stroke.width_at(p).max(stroke.width_at(q)) / 2.0
    })
}

/// One immutable segment inventory per eraser gesture. Pointer updates query
/// bounds/segments instead of deserializing every source stroke again.
pub(crate) struct EraserIndex {
    strokes: std::collections::HashMap<String, Vec<(Bounds, Vec<(InputSample, f64)>)>>,
}
impl EraserIndex {
    pub(crate) fn new(page: &Value) -> Self {
        use serde::Deserialize;
        let mut strokes = std::collections::HashMap::new();
        for layer in page["layers"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|l| l["visible"] == true)
        {
            for e in layer["elements"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|e| e["kind"] == "stroke")
            {
                let Ok(s) = crate::brushes::Stroke::deserialize(e) else {
                    continue;
                };
                let ps = s
                    .points
                    .iter()
                    .map(|p| {
                        (
                            InputSample {
                                x: p.x,
                                y: p.y,
                                pressure: p.pressure,
                                time_ms: 0.0,
                            },
                            s.width_at(p) / 2.0,
                        )
                    })
                    .collect::<Vec<_>>();
                let mut blocks = vec![];
                for first in (0..ps.len()).step_by(64) {
                    let points = ps[first.saturating_sub(1)..(first + 64).min(ps.len())].to_vec();
                    let mut left = f64::INFINITY;
                    let mut top = f64::INFINITY;
                    let mut right = f64::NEG_INFINITY;
                    let mut bottom = f64::NEG_INFINITY;
                    for (p, r) in &points {
                        left = left.min(p.x - r);
                        top = top.min(p.y - r);
                        right = right.max(p.x + r);
                        bottom = bottom.max(p.y + r);
                    }
                    blocks.push((
                        Bounds {
                            x: left,
                            y: top,
                            width: right - left,
                            height: bottom - top,
                        },
                        points,
                    ));
                }
                strokes.insert(s.id, blocks);
            }
        }
        Self { strokes }
    }
    fn hit(&self, e: &Value, a: InputSample, b: InputSample, radius: f64) -> bool {
        if e["erasures"]
            .as_array()
            .is_some_and(|m| m.iter().any(|m| covers(m, (a.x, a.y), (b.x, b.y), radius)))
        {
            return false;
        }
        self.strokes
            .get(e["id"].as_str().unwrap())
            .is_some_and(|blocks| {
                blocks.iter().any(|(bounds, points)| {
                    if a.x.max(b.x) + radius < bounds.x
                        || a.x.min(b.x) - radius > bounds.x + bounds.width
                        || a.y.max(b.y) + radius < bounds.y
                        || a.y.min(b.y) - radius > bounds.y + bounds.height
                    {
                        return false;
                    }
                    points.iter().enumerate().any(|(i, (p, r))| {
                        let (q, qr) = points[i.saturating_sub(1)];
                        segment_distance((a.x, a.y), (b.x, b.y), (p.x, p.y), (q.x, q.y))
                            <= radius + r.max(qr)
                    })
                })
            })
    }
}
pub fn select(page: &Value, points: &[InputSample], radius: f64) -> Vec<String> {
    let Some(last) = points.last() else {
        return vec![];
    };
    let tap = points.len() < 3
        || points
            .iter()
            .all(|p| (p.x - points[0].x).hypot(p.y - points[0].y) < radius);
    let mut ids = vec![];
    for layer in page["layers"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|l| l["visible"] == true)
    {
        for e in layer["elements"].as_array().unwrap() {
            let selected = if tap {
                hit(e, (last.x, last.y), (last.x, last.y), radius)
            } else if e["kind"] == "stroke" {
                let ps = e["points"].as_array().unwrap();
                ps.iter().enumerate().any(|(i, p)| {
                    inside(xy(p), points)
                        || points.iter().enumerate().any(|(j, v)| {
                            let w = points[(j + 1) % points.len()];
                            segment_distance(
                                xy(&ps[i.saturating_sub(1)]),
                                xy(p),
                                (v.x, v.y),
                                (w.x, w.y),
                            ) < 1e-7
                        })
                })
            } else {
                render::bounds(e)
                    .is_ok_and(|b| inside((b.x + b.width / 2.0, b.y + b.height / 2.0), points))
            };
            if selected {
                ids.push(e["id"].as_str().unwrap().into());
            }
        }
    }
    if tap {
        ids.into_iter().rev().take(1).collect()
    } else {
        ids
    }
}
pub fn selection_bounds(page: &Value, ids: &[String]) -> Option<Bounds> {
    let mut r: Option<Bounds> = None;
    for l in page["layers"].as_array()? {
        if l["visible"] != true {
            continue;
        }
        for e in l["elements"].as_array()? {
            if !ids.iter().any(|id| e["id"] == id.as_str()) {
                continue;
            }
            let Ok(b) = render::bounds(e) else { continue };
            r = Some(match r {
                None => b,
                Some(a) => {
                    let x = a.x.min(b.x);
                    let y = a.y.min(b.y);
                    Bounds {
                        x,
                        y,
                        width: (a.x + a.width).max(b.x + b.width) - x,
                        height: (a.y + a.height).max(b.y + b.height) - y,
                    }
                }
            });
        }
    }
    r
}
/// Original selection-card alignment, excluding attached connectors from spacing.
pub fn arrange(page: &mut Value, selected: &[String], action: &str) -> Result<()> {
    crate::model::require(["left", "center", "top", "horizontal", "vertical"].contains(&action))?;
    let mut boxes = vec![];
    for l in page["layers"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|l| l["visible"] == true)
    {
        for e in l["elements"].as_array().unwrap() {
            if selected.iter().any(|id| e["id"] == id.as_str()) && e.get("connector").is_none() {
                boxes.push((e["id"].as_str().unwrap().to_owned(), render::bounds(e)?));
            }
        }
    }
    let spacing = ["horizontal", "vertical"].contains(&action);
    crate::model::require(boxes.len() >= if spacing { 3 } else { 2 })?;
    let ids = boxes.iter().map(|b| b.0.clone()).collect::<Vec<_>>();
    let bounds = selection_bounds(page, &ids).unwrap();
    let horizontal = action == "horizontal";
    let axis = |b: Bounds| if horizontal { b.x } else { b.y };
    let length = |b: Bounds| if horizontal { b.width } else { b.height };
    boxes.sort_by(|a, b| axis(a.1).total_cmp(&axis(b.1)));
    let gap = (length(bounds) - boxes.iter().map(|b| length(b.1)).sum::<f64>())
        / (boxes.len() - 1) as f64;
    let mut cursor = axis(bounds);
    for (id, b) in boxes {
        let (dx, dy) = if spacing {
            let delta = cursor - axis(b);
            cursor += length(b) + gap;
            if horizontal {
                (delta, 0.0)
            } else {
                (0.0, delta)
            }
        } else {
            match action {
                "left" => (bounds.x - b.x, 0.0),
                "center" => (bounds.x + bounds.width / 2.0 - b.x - b.width / 2.0, 0.0),
                _ => (0.0, bounds.y - b.y),
            }
        };
        transform(page, &[id], b, dx, dy, 1.0, 1.0);
    }
    Ok(())
}

pub fn transform(
    page: &mut Value,
    ids: &[String],
    origin: Bounds,
    dx: f64,
    dy: f64,
    sx: f64,
    sy: f64,
) {
    let point = |p: &mut Value| {
        p["x"] = json!(origin.x + (p["x"].as_f64().unwrap() - origin.x) * sx + dx);
        p["y"] = json!(origin.y + (p["y"].as_f64().unwrap() - origin.y) * sy + dy);
    };
    for l in page["layers"].as_array_mut().unwrap() {
        for e in l["elements"].as_array_mut().unwrap() {
            if !ids.iter().any(|id| e["id"] == id.as_str()) {
                continue;
            }
            if e["kind"] == "stroke" {
                if e.get("connector").is_some() {
                    continue;
                }
                for p in e["points"].as_array_mut().unwrap() {
                    point(p);
                }
                for k in ["cutouts", "erasures"] {
                    if let Some(items) = e.get_mut(k).and_then(Value::as_array_mut) {
                        for item in items {
                            if k == "cutouts" {
                                for p in item.as_array_mut().unwrap() {
                                    point(p)
                                }
                            } else {
                                for p in item["points"].as_array_mut().unwrap() {
                                    point(p)
                                }
                                let height = item["height"]
                                    .as_f64()
                                    .unwrap_or_else(|| item["width"].as_f64().unwrap());
                                item["height"] =
                                    json!((height * sy.abs()).clamp(0.01, 1_000_000.0));
                                item["width"] = json!((item["width"].as_f64().unwrap() * sx.abs())
                                    .clamp(0.01, 1_000_000.0));
                            }
                        }
                    }
                }
            } else {
                point(e);
                if e["kind"] == "image" {
                    e["width"] =
                        json!((e["width"].as_f64().unwrap() * sx.abs()).clamp(0.01, 1_000_000.0));
                    e["height"] =
                        json!((e["height"].as_f64().unwrap() * sy.abs()).clamp(0.01, 1_000_000.0));
                } else {
                    e["size"] =
                        json!((e["size"].as_f64().unwrap() * sx.abs().min(sy.abs()))
                            .clamp(1.0, 200.0));
                }
            }
        }
    }
}
pub fn anchor(bounds: Bounds, side: &str) -> (f64, f64) {
    (
        bounds.x
            + match side {
                "left" => 0.0,
                "right" => bounds.width,
                _ => bounds.width / 2.0,
            },
        bounds.y
            + match side {
                "top" => 0.0,
                "bottom" => bounds.height,
                _ => bounds.height / 2.0,
            },
    )
}
/// Original editor snapping: object edges/centers, equal spacing, then the optional 20pt grid.
pub fn snap_move(
    page: &Value,
    ids: &[String],
    mut dx: f64,
    mut dy: f64,
    threshold: f64,
    grid: bool,
    align: bool,
) -> (f64, f64, Vec<Value>) {
    let eligible = |e: &&Value| e.get("connector").is_none();
    let all = page["layers"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|l| l["visible"] == true)
        .flat_map(|l| l["elements"].as_array().unwrap())
        .filter(eligible)
        .collect::<Vec<_>>();
    let selected = all
        .iter()
        .filter(|e| ids.iter().any(|id| e["id"] == id.as_str()))
        .map(|e| e["id"].as_str().unwrap().to_owned())
        .collect::<Vec<_>>();
    let Some(box_) = selection_bounds(page, &selected) else {
        return (dx, dy, vec![]);
    };
    let others = all
        .iter()
        .filter(|e| !ids.iter().any(|id| e["id"] == id.as_str()))
        .filter_map(|e| render::bounds(e).ok())
        .collect::<Vec<_>>();
    let mut guides = vec![];
    for horizontal in [true, false] {
        let components = |b: Bounds| {
            if horizontal {
                (b.x, b.width, b.y, b.height)
            } else {
                (b.y, b.height, b.x, b.width)
            }
        };
        let (position, size, cross, cross_size) = components(box_);
        let origin = position + if horizontal { dx } else { dy };
        let axis = if horizontal { "x" } else { "y" };
        let mut correction = f64::INFINITY;
        let mut guide = None;
        if align {
            for other in &others {
                let (pos, len, c, cl) = components(*other);
                for offset in [0.0, size / 2.0, size] {
                    for dest in [pos, pos + len / 2.0, pos + len] {
                        let value = dest - origin - offset;
                        if value.abs() <= threshold && value.abs() < correction.abs() {
                            correction = value;
                            guide = Some(
                                json!({"axis":axis,"position":dest,"start":cross.min(c)-12.0,"end":(cross+cross_size).max(c+cl)+12.0}),
                            );
                        }
                    }
                }
            }
            let mut low = f64::NEG_INFINITY;
            let mut high = f64::INFINITY;
            for other in &others {
                let (pos, len, c, cl) = components(*other);
                if cross + cross_size < c || cross > c + cl {
                    continue;
                }
                if pos + len <= origin + threshold {
                    low = low.max(pos + len);
                }
                if pos >= origin + size - threshold {
                    high = high.min(pos);
                }
            }
            if low.is_finite() && high.is_finite() && high - low >= size {
                let value = (low + high - size) / 2.0 - origin;
                if value.abs() <= threshold && value.abs() < correction.abs() {
                    correction = value;
                    guide = Some(
                        json!({"axis":if horizontal {"y"}else{"x"},"position":cross+cross_size/2.0,"start":low,"end":high,"label":format!("{} pt",((high-low-size)/2.0).round())}),
                    );
                }
            }
        }
        if !correction.is_finite() && grid {
            correction = (origin / 20.0 + 0.5).floor() * 20.0 - origin;
            guide = Some(
                json!({"axis":axis,"position":origin+correction,"start":0,"end":page[if horizontal {"height"}else{"width"}]}),
            );
        }
        if correction.is_finite() {
            if horizontal {
                dx += correction;
            } else {
                dy += correction;
            }
            if let Some(guide) = guide {
                guides.push(guide);
            }
        }
    }
    if page["infinite"] == false {
        dx = dx
            .min(page["width"].as_f64().unwrap() - box_.x - box_.width)
            .max(-box_.x);
        dy = dy
            .min(page["height"].as_f64().unwrap() - box_.y - box_.height)
            .max(-box_.y);
    }
    (dx, dy, guides)
}
pub fn connector_points(a: (f64, f64), b: (f64, f64)) -> Value {
    let angle = (b.1 - a.1).atan2(b.0 - a.0);
    let size = 9.0f64.min((b.0 - a.0).hypot(b.1 - a.1) / 3.0);
    json!([
        a,
        b,
        (
            b.0 - size * (angle - 0.48).cos(),
            b.1 - size * (angle - 0.48).sin()
        ),
        b,
        (
            b.0 - size * (angle + 0.48).cos(),
            b.1 - size * (angle + 0.48).sin()
        )
    ]
    .map(|(x, y)| json!({"x":x,"y":y,"pressure":0.5})))
}
/// Keep attached arrows synchronized across visible and hidden layers, as in the original editor.
pub fn refresh_connections(page: &mut Value) {
    let targets = page["layers"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|l| l["elements"].as_array().unwrap())
        .filter(|e| {
            e["kind"] == "stroke" && matches!(e["shape"].as_str(), Some("rectangle" | "ellipse"))
        })
        .filter_map(|e| {
            render::bounds(e)
                .ok()
                .map(|b| (e["id"].as_str().unwrap().to_owned(), b))
        })
        .collect::<std::collections::HashMap<_, _>>();
    for layer in page["layers"].as_array_mut().unwrap() {
        layer["elements"].as_array_mut().unwrap().retain_mut(|e| {
            let Some(c) = e.get("connector") else {
                return true;
            };
            let (Some(a), Some(b)) = (
                targets.get(c["from"]["elementId"].as_str().unwrap_or("")),
                targets.get(c["to"]["elementId"].as_str().unwrap_or("")),
            ) else {
                return false;
            };
            let points = connector_points(
                anchor(*a, c["from"]["side"].as_str().unwrap_or("right")),
                anchor(*b, c["to"]["side"].as_str().unwrap_or("left")),
            );
            e["points"] = points;
            true
        });
    }
}
pub fn erase(
    page: &mut Value,
    a: InputSample,
    b: InputSample,
    width: f64,
    path: bool,
    index: &EraserIndex,
) -> Result<()> {
    let mut full = false;
    let mut removed = vec![];
    for l in page["layers"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .filter(|l| l["visible"] == true)
    {
        l["elements"].as_array_mut().unwrap().retain_mut(|e| {
            if e["kind"] != "stroke" || !index.hit(e, a, b, width / 2.0) {
                return true;
            }
            if !path {
                removed.push(e["id"].as_str().unwrap().to_owned());
                return false;
            }
            if e.get("erasures").is_none() {
                e["erasures"] = json!([])
            }
            let masks = e["erasures"].as_array_mut().unwrap();
            if let Some(last) = masks.last_mut().filter(|m| {
                m["width"] == width
                    && m.get("height").is_none()
                    && m["points"]
                        .as_array()
                        .and_then(|p| p.last())
                        .is_some_and(|p| xy(p) == (a.x, a.y))
            }) {
                let points = last["points"].as_array_mut().unwrap();
                if xy(points.last().unwrap()) != (b.x, b.y) {
                    points.push(json!({"x":b.x,"y":b.y}));
                }
            } else if masks.len() < 10000 {
                masks.push(json!({"width":width,"points":[{"x":a.x,"y":a.y},{"x":b.x,"y":b.y}]}));
            } else {
                full = true;
            }
            true
        });
    }
    if !removed.is_empty() {
        remove(page, &removed);
    }
    if full {
        return Err(crate::Error::new(
            "EraseLimit",
            "This stroke has reached the eraser mask limit.",
        ));
    }
    Ok(())
}
pub fn remove(page: &mut Value, ids: &[String]) {
    let ids: HashSet<_> = ids.iter().map(String::as_str).collect();
    for l in page["layers"].as_array_mut().unwrap() {
        l["elements"].as_array_mut().unwrap().retain(|e| {
            !ids.contains(e["id"].as_str().unwrap())
                && !ids.contains(e["connector"]["from"]["elementId"].as_str().unwrap_or(""))
                && !ids.contains(e["connector"]["to"]["elementId"].as_str().unwrap_or(""))
        });
    }
}
pub fn shape(tool: &str, a: InputSample, b: InputSample) -> Value {
    let p = |x, y| json!({"x":x,"y":y,"pressure":0.5});
    match tool {
        "line" => json!([p(a.x, a.y), p(b.x, b.y)]),
        "rectangle" => json!([
            p(a.x, a.y),
            p(b.x, a.y),
            p(b.x, b.y),
            p(a.x, b.y),
            p(a.x, a.y)
        ]),
        _ => json!((0..65)
            .map(|i| {
                let t = i as f64 * std::f64::consts::PI / 32.0;
                p(
                    (a.x + b.x) / 2.0 + (b.x - a.x).abs() / 2.0 * t.cos(),
                    (a.y + b.y) / 2.0 + (b.y - a.y).abs() / 2.0 * t.sin(),
                )
            })
            .collect::<Vec<_>>()),
    }
}
pub fn checked_preview(
    mut raw: Value,
    original: &crate::page::Page,
    brushes: &crate::model::BrushCatalog,
) -> Result<std::sync::Arc<crate::page::Page>> {
    // Validate model values without copying raster sources; preview is never installed as a history page.
    refresh_connections(&mut raw);
    let mut p = original.clone();
    p.raw = raw;
    crate::model::validate_page(&p.external(), brushes)?;
    Ok(std::sync::Arc::new(p))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn snap_matches_original_editor_for_alignment_spacing_grid_zoom_and_finite_bounds() {
        let fixtures: Vec<Value> =
            serde_json::from_str(include_str!("../tests/fixtures/native-manipulation.json"))
                .unwrap();
        assert_eq!(fixtures.len(), 32);
        for (index, f) in fixtures.iter().enumerate() {
            let ids: Vec<String> = serde_json::from_value(f["ids"].clone()).unwrap();
            let (dx, dy, guides) = snap_move(
                &f["page"],
                &ids,
                f["dx"].as_f64().unwrap(),
                f["dy"].as_f64().unwrap(),
                f["threshold"].as_f64().unwrap(),
                f["grid"].as_bool().unwrap(),
                f["align"].as_bool().unwrap(),
            );
            assert!(
                (dx - f["expected"]["dx"].as_f64().unwrap()).abs() < 1e-8,
                "fixture {index}: dx"
            );
            assert!(
                (dy - f["expected"]["dy"].as_f64().unwrap()).abs() < 1e-8,
                "fixture {index}: dy"
            );
            let expected = f["expected"]["guides"].as_array().unwrap();
            assert_eq!(guides.len(), expected.len(), "fixture {index}: guide count");
            for (a, b) in guides.iter().zip(expected) {
                for key in ["axis", "label"] {
                    assert_eq!(a[key], b[key], "fixture {index}: {key}");
                }
                for key in ["position", "start", "end"] {
                    assert!(
                        (a[key].as_f64().unwrap() - b[key].as_f64().unwrap()).abs() < 1e-8,
                        "fixture {index}: {key}"
                    );
                }
            }
        }
    }
}
