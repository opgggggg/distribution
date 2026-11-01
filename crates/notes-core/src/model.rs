//! Portable validation. JSON values preserve extension fields and existing wire identities.
use crate::{Error, Result};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
pub const MAX_BYTES: usize = 64 * 1024 * 1024;
pub const MAX_POINTS: usize = 2_000_000;
pub const MAX_ELEMENTS: usize = 100_000;
pub const MAX_PAGES: usize = 1000;
pub const HISTORY_STEPS: usize = 200;
pub const HISTORY_BYTES: usize = 32 * 1024 * 1024;
pub const MIME: &str = "application/vnd.cubexp.notebook+zip";
pub type Notebook = Value;
pub type BrushCatalog = HashMap<String, Value>;
fn invalid() -> Error {
    Error::new(
        "InvalidNotebook",
        "Invalid or unsupported CubeOffice notebook.",
    )
}
pub fn require(test: bool) -> Result<()> {
    if test {
        Ok(())
    } else {
        Err(invalid())
    }
}
pub fn array(v: &Value) -> Result<&Vec<Value>> {
    v.as_array().ok_or_else(invalid)
}
pub fn text(v: &Value, min: usize, max: usize) -> bool {
    v.as_str().is_some_and(|s| {
        let n = s.encode_utf16().count();
        n >= min && n <= max
    })
}
pub fn number(v: &Value, min: f64, max: f64) -> bool {
    v.as_f64()
        .is_some_and(|n| n.is_finite() && n >= min && n <= max)
}
pub fn color(v: &Value) -> bool {
    v.as_str().is_some_and(|s| {
        s.len() == 7 && s.starts_with('#') && s.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
    })
}
fn one(v: &Value, choices: &[&str]) -> bool {
    v.as_str().is_some_and(|s| choices.contains(&s))
}
fn optional(v: &Value, key: &str, check: impl FnOnce(&Value) -> bool) -> bool {
    v.get(key).is_none_or(check)
}
fn integer(v: &Value, min: f64, max: f64) -> bool {
    number(v, min, max) && v.as_f64().unwrap().fract() == 0.0
}
pub fn builtin_brushes() -> BrushCatalog {
    let values: Vec<Value> =
        serde_json::from_str(include_str!("../brushes.json")).expect("checked-in brush catalog");
    values
        .into_iter()
        .map(|v| (v["id"].as_str().unwrap().into(), v))
        .collect()
}
pub fn photo(v: &Value) -> Result<()> {
    let src = v["src"].as_str().ok_or_else(invalid)?;
    let body = src
        .strip_prefix("data:image/png;base64,")
        .or_else(|| src.strip_prefix("data:image/jpeg;base64,"))
        .ok_or_else(invalid)?;
    let data = body.trim_end_matches('=');
    require(
        v["kind"] == "image"
            && src.len() <= 6 * 1024 * 1024
            && !data.is_empty()
            && body.len() - data.len() <= 2
            && data
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'+' || c == b'/')
            && number(&v["x"], -1e9, 1e9)
            && number(&v["y"], -1e9, 1e9)
            && number(&v["width"], 0.01, 1e6)
            && number(&v["height"], 0.01, 1e6)
            && number(&v["opacity"], 0.0, 1.0)
            && optional(v, "angle", |a| number(a, -360.0, 360.0)),
    )
}
struct Validator<'a> {
    ids: HashSet<&'a str>,
    points: usize,
    elements: usize,
    brushes: &'a BrushCatalog,
}
impl<'a> Validator<'a> {
    fn id(&mut self, v: &'a Value) -> Result<()> {
        require(text(v, 1, 128))?;
        require(self.ids.insert(v.as_str().unwrap()))
    }
    fn point(&self, v: &Value, lo: f64, hi: f64) -> bool {
        number(&v["x"], lo, hi) && number(&v["y"], lo, hi)
    }
    fn page(&mut self, p: &'a Value) -> Result<()> {
        require(
            optional(p, "infinite", Value::is_boolean)
                && number(&p["width"], 72.0, 5000.0)
                && number(&p["height"], 72.0, 5000.0)
                && one(&p["paper"], &["plain", "ruled", "grid", "dotted"])
                && color(&p["color"])
                && p["bookmarked"].is_boolean(),
        )?;
        let layers = array(&p["layers"])?;
        require(!layers.is_empty() && layers.len() <= 100)?;
        let infinite = p["infinite"] != false;
        let lo = if infinite { -1e9 } else { 0.0 };
        let hi = if infinite {
            1e9
        } else {
            p["width"].as_f64().unwrap()
        };
        let yhi = if infinite {
            hi
        } else {
            p["height"].as_f64().unwrap()
        };
        let inklo = if infinite { lo } else { -10000.0 };
        let inkhi = if infinite { hi } else { 10000.0 };
        self.id(&p["id"])?;
        if let Some(bg) = p.get("background") {
            photo(bg)?;
            self.id(&bg["id"])?;
        }
        if let Some(tapes) = p.get("tapes") {
            let tapes = array(tapes)?;
            require(tapes.len() <= 24)?;
            for t in tapes {
                require(
                    number(&t["x"], lo, hi)
                        && number(&t["y"], lo, yhi)
                        && number(&t["width"], 4.0, 5000.0)
                        && number(&t["height"], 4.0, 5000.0)
                        && number(&t["angle"], -180.0, 180.0),
                )?;
                self.id(&t["id"])?;
            }
        }
        if let Some(scenes) = p.get("scenes") {
            let scenes = array(scenes)?;
            require(scenes.len() <= 200)?;
            for s in scenes {
                require(
                    text(&s["name"], 1, 256)
                        && !s["name"].as_str().unwrap().trim().is_empty()
                        && number(&s["x"], lo, hi)
                        && number(&s["y"], lo, yhi)
                        && number(&s["width"], 1.0, hi)
                        && number(&s["height"], 1.0, yhi),
                )?;
                if !infinite {
                    require(
                        s["x"].as_f64().unwrap() + s["width"].as_f64().unwrap() <= hi + 0.001
                            && s["y"].as_f64().unwrap() + s["height"].as_f64().unwrap()
                                <= yhi + 0.001,
                    )?;
                }
                self.id(&s["id"])?;
            }
        }
        let mut targets = HashMap::new();
        for l in layers {
            for e in array(&l["elements"])? {
                if let Some(id) = e["id"].as_str() {
                    targets.insert(id, e);
                }
            }
        }
        for l in layers {
            require(text(&l["name"], 0, 4096) && l["visible"].is_boolean())?;
            self.id(&l["id"])?;
            for e in array(&l["elements"])? {
                self.elements += 1;
                require(
                    self.elements <= MAX_ELEMENTS && (e["kind"] == "image" || color(&e["color"])),
                )?;
                self.id(&e["id"])?;
                match e["kind"].as_str() {
                    Some("image") => photo(e)?,
                    Some("text") => require(
                        self.point(e, inklo, inkhi)
                            && number(&e["size"], 1.0, 200.0)
                            && text(&e["text"], 0, 100000)
                            && optional(e, "font", |f| text(f, 0, 256)),
                    )?,
                    Some("stroke") => {
                        require(
                            one(&e["tool"], &["pen", "highlighter"])
                                && number(&e["width"], 0.01, 100.0)
                                && number(&e["opacity"], 0.0, 1.0)
                                && e["pressure"].is_boolean(),
                        )?;
                        let plugin = if let Some(style) = e.get("penStyle") {
                            require(e["tool"] == "pen" && text(style, 1, 128))?;
                            Some(self.brushes.get(style.as_str().unwrap()).ok_or_else(|| {
                                Error::new(
                                    "MissingBrush",
                                    format!("Missing brush plugin {}.", style.as_str().unwrap()),
                                )
                            })?)
                        } else {
                            None
                        };
                        if let Some(settings) = e.get("brushSettings") {
                            let definition = plugin.ok_or_else(invalid)?;
                            let params = array(&definition["parameters"])?;
                            for (key, value) in settings.as_object().ok_or_else(invalid)? {
                                let rule = params
                                    .iter()
                                    .find(|p| p["id"] == key.as_str())
                                    .ok_or_else(invalid)?;
                                require(number(
                                    value,
                                    rule["min"].as_f64().unwrap(),
                                    rule["max"].as_f64().unwrap(),
                                ))?;
                            }
                        }
                        if let Some(version) = e.get("brushVersion") {
                            require(
                                plugin.is_some()
                                    && integer(
                                        version,
                                        1.0,
                                        plugin.and_then(|p| p["version"].as_f64()).unwrap_or(1.0),
                                    ),
                            )?;
                        }
                        if let Some(seed) = e.get("brushSeed") {
                            require(plugin.is_some() && integer(seed, 0.0, u32::MAX as f64))?;
                        }
                        if let Some(shape) = e.get("shape") {
                            require(
                                e["tool"] == "pen" && one(shape, &["line", "rectangle", "ellipse"]),
                            )?;
                        }
                        if let Some(c) = e.get("connector") {
                            require(
                                e.get("shape").is_none() && e["tool"] == "pen" && c.is_object(),
                            )?;
                            for a in [&c["from"], &c["to"]] {
                                require(one(&a["side"], &["top", "right", "bottom", "left"]))?;
                                let target = targets
                                    .get(a["elementId"].as_str().ok_or_else(invalid)?)
                                    .ok_or_else(invalid)?;
                                require(
                                    target["kind"] == "stroke"
                                        && one(&target["shape"], &["rectangle", "ellipse"]),
                                )?;
                            }
                            require(c["from"]["elementId"] != c["to"]["elementId"])?;
                        }
                        if let Some(cutouts) = e.get("cutouts") {
                            let cutouts = array(cutouts)?;
                            require(cutouts.len() <= 24)?;
                            for polygon in cutouts {
                                let polygon = array(polygon)?;
                                require(
                                    polygon.len() == 4
                                        && polygon.iter().all(|p| self.point(p, inklo, inkhi)),
                                )?;
                            }
                        }
                        if let Some(erasures) = e.get("erasures") {
                            let erasures = array(erasures)?;
                            require(erasures.len() <= 10000)?;
                            for erasure in erasures {
                                let points = array(&erasure["points"])?;
                                require(
                                    number(&erasure["width"], 0.01, 1e6)
                                        && optional(erasure, "height", |h| number(h, 0.01, 1e6))
                                        && !points.is_empty()
                                        && points.iter().all(|p| self.point(p, inklo, inkhi)),
                                )?;
                                self.points += points.len();
                            }
                        }
                        let points = array(&e["points"])?;
                        self.points += points.len();
                        require(
                            !points.is_empty()
                                && self.points <= MAX_POINTS
                                && points.iter().all(|p| {
                                    self.point(p, inklo, inkhi)
                                        && number(&p["pressure"], 0.0, 1.0)
                                        && optional(p, "width", |w| number(w, 0.01, 200.0))
                                }),
                        )?;
                    }
                    _ => return Err(invalid()),
                }
            }
        }
        Ok(())
    }
}
pub fn validate<'a>(book: &'a Value, brushes: &'a BrushCatalog) -> Result<()> {
    require(
        book["format"] == "cubeoffice-notebook"
            && book["version"] == 1
            && text(&book["title"], 0, 4096),
    )?;
    let pages = array(&book["pages"])?;
    require(!pages.is_empty() && pages.len() <= MAX_PAGES)?;
    let mut validator = Validator {
        ids: HashSet::new(),
        points: 0,
        elements: 0,
        brushes,
    };
    for p in pages {
        validator.page(p)?;
    }
    Ok(())
}

/// A changed page is validated once; global identity/count checks use cached metadata.
pub fn validate_page(page: &Value, brushes: &BrushCatalog) -> Result<()> {
    Validator {
        ids: HashSet::new(),
        points: 0,
        elements: 0,
        brushes,
    }
    .page(page)
}
