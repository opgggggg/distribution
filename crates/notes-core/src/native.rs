//! Platform-independent native editor state, direct sampled input and frame snapshots.
//! The OS adapter supplies events/pixels/widgets; it does not own document or tool behavior.
use crate::{
    history::{Document, HistoryState, NotesSession, SaveSnapshot},
    model,
    page::Page,
    render::{Bounds, Renderer},
    Error, Result,
};
use serde_json::{json, Value};
use std::sync::Arc;
pub(crate) const STYLES: [&str; 10] = [
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
];
#[repr(C)]
#[derive(Clone, Copy)]
pub struct InputSample {
    pub x: f64,
    pub y: f64,
    pub pressure: f64,
    pub time_ms: f64,
}
struct Gesture {
    token: i64,
    stylus: bool,
    stroke: Value,
    last: InputSample,
    pressure: f64,
    revision: u64,
}
struct EditGesture {
    token: i64,
    tool: String,
    id: String,
    points: Vec<InputSample>,
    revision: u64,
    original: Arc<Page>,
    preview: Arc<Page>,
    operation: String,
    origin: Option<Bounds>,
    camera: Bounds,
    guides: Vec<Value>,
    eraser_index: Option<crate::native_edit::EraserIndex>,
}
pub struct Surface {
    pub session: NotesSession,
    document_epoch: u64,
    pub(crate) page: usize,
    pub(crate) active_layer: usize,
    pub(crate) style: usize,
    pub(crate) tool: String,
    pub(crate) rail_tab: String,
    pub(crate) bookmarks_only: bool,
    pub(crate) rotation: u32,
    pub(crate) finger_draw: bool,
    pub(crate) snap_grid: bool,
    pub(crate) align_guides: bool,
    pub(crate) aux: Value,
    pub(crate) selected: Vec<String>,
    pub(crate) pending_text: Option<InputSample>,
    edit_gesture: Option<EditGesture>,
    pub(crate) color: String,
    pub(crate) opacity: f64,
    pub(crate) width: f64,
    pub(crate) pressure: bool,
    pub(crate) settings: serde_json::Map<String, Value>,
    pub(crate) presets: Vec<Value>,
    pub(crate) tray_offset: [f64; 2],
    canvas_size: [f64; 2],
    gesture: Option<Gesture>,
    next_id: u64,
    pub viewport: Bounds,
}
pub struct Frame {
    pub page: Arc<Page>,
    pub viewport: Bounds,
    pub overlay: Option<Value>,
}
pub struct FrameRenderer {
    pub renderer: Renderer,
    pub(crate) cache: Option<(Arc<Page>, Bounds, u32, u32, resvg::tiny_skia::Pixmap)>,
    full_rasters: u64,
    pub(crate) tiles: crate::native_tiles::TileCache,
    pub(crate) tile_job: Option<crate::native_tiles::TileJob>,
    live_oil: std::cell::RefCell<Option<crate::native_oil::LiveOil>>,
    live_raster: std::cell::RefCell<Option<crate::render::LiveRaster>>,
}
pub struct Layers {
    pub base_changed: bool,
    pub x: u32,
    pub y: u32,
    pub patch: Option<resvg::tiny_skia::Pixmap>,
}
pub(crate) fn appended_strokes<'a>(before: &Page, after: &'a Page) -> Option<&'a [Value]> {
    if before.photos.len() != after.photos.len()
        || !before
            .photos
            .iter()
            .zip(&after.photos)
            .all(|(a, b)| Arc::ptr_eq(a, b))
    {
        return None;
    }
    let old = before.raw.as_object()?;
    let next = after.raw.as_object()?;
    if old.len() != next.len()
        || old
            .iter()
            .any(|(k, v)| k != "layers" && next.get(k) != Some(v))
    {
        return None;
    }
    let old = before["layers"].as_array()?;
    let next = after["layers"].as_array()?;
    if old.len() != next.len() {
        return None;
    }
    let mut found = None;
    for (a, b) in old.iter().zip(next) {
        if a == b {
            if found.is_some() && b["visible"] == true && !b["elements"].as_array()?.is_empty() {
                return None;
            }
            continue;
        }
        if found.is_some() || b["visible"] != true {
            return None;
        }
        let am = a.as_object()?;
        let bm = b.as_object()?;
        if am.len() != bm.len()
            || am
                .iter()
                .any(|(k, v)| k != "elements" && bm.get(k) != Some(v))
        {
            return None;
        }
        let ae = a["elements"].as_array()?;
        let be = b["elements"].as_array()?;
        if be.len() <= ae.len() || be[..ae.len()] != ae[..] {
            return None;
        }
        let strokes = &be[ae.len()..];
        if strokes
            .iter()
            .any(|stroke| stroke["kind"] != "stroke" || stroke["tool"] != "pen")
        {
            return None;
        }
        found = Some(strokes);
    }
    found
}
impl Surface {
    pub fn new() -> Self {
        let b = json!({"format":"cubeoffice-notebook","version":1,"title":"Native notebook","pages":[{"id":"page","infinite":true,"width":595.28,"height":841.89,"paper":"grid","color":"#fffdf7","bookmarked":false,"layers":[{"id":"ink","name":"Ink","visible":true,"elements":[]}]}]});
        let brushes = model::builtin_brushes();
        let presets = STYLES
            .iter()
            .map(|id| {
                let p = &brushes[*id];
                let mut preset = p["defaults"].clone();
                preset["settings"] = p["parameters"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|p| (p["id"].as_str().unwrap().to_owned(), p["default"].clone()))
                    .collect::<serde_json::Map<_, _>>()
                    .into();
                preset
            })
            .collect();
        Self {
            session: NotesSession::new(
                Document::from_value(b, &brushes).unwrap(),
                HistoryState::default(),
                brushes,
                false,
            ),
            document_epoch: 1,
            page: 0,
            active_layer: 0,
            style: 1,
            tool: "pen".into(),
            rail_tab: "pages".into(),
            bookmarks_only: false,
            rotation: 0,
            finger_draw: true,
            snap_grid: false,
            align_guides: true,
            aux: json!({"highlighter":{"color":"#facc15","width":14,"opacity":0.35},"eraser":{"width":10,"mode":"path"}}),
            selected: vec![],
            pending_text: None,
            edit_gesture: None,
            color: "#222b40".into(),
            opacity: 1.0,
            width: 2.0,
            pressure: true,
            settings: serde_json::Map::new(),
            presets,
            tray_offset: [0.0, 0.0],
            canvas_size: [0.0, 0.0],
            gesture: None,
            next_id: 0,
            viewport: Bounds {
                x: 0.0,
                y: 0.0,
                width: 595.28,
                height: 841.89,
            },
        }
    }
    pub fn new_document(&mut self) {
        let mut next = Self::new();
        next.document_epoch = self.document_epoch + 1;
        next.canvas_size = self.canvas_size;
        *self = next;
        self.fit();
    }
    pub fn open(&mut self, bytes: &[u8]) -> Result<()> {
        let (doc, history) = crate::codec::read(bytes, &self.session.brushes)?;
        self.document_epoch += 1;
        self.session = NotesSession::new(doc, history, self.session.brushes.clone(), false);
        self.page = 0;
        self.active_layer = 0;
        self.selected.clear();
        self.pending_text = None;
        self.rotation = 0;
        self.gesture = None;
        self.edit_gesture = None;
        self.fit();
        Ok(())
    }
    fn fit(&mut self) {
        let page = &self.session.document.pages[self.page];
        let width = if page["infinite"] != false && self.canvas_size[0] > 0.0 {
            self.canvas_size[0]
        } else {
            page["width"].as_f64().unwrap()
        };
        self.viewport = Bounds {
            x: 0.0,
            y: 0.0,
            width,
            height: if self.canvas_size[0] > 0.0 {
                width * self.canvas_size[1] / self.canvas_size[0]
            } else {
                page["height"].as_f64().unwrap()
            },
        };
    }
    /// Resizing chrome must preserve world-units per screen point, including after rotation.
    pub fn resize_canvas(&mut self, width: f64, height: f64) -> Result<()> {
        model::require(
            width.is_finite()
                && height.is_finite()
                && width >= 1.0
                && height >= 1.0
                && width <= 16384.0
                && height <= 16384.0,
        )?;
        let world_width = if self.canvas_size[0] > 0.0 {
            self.viewport.width * width / self.canvas_size[0]
        } else if self.session.document.pages[self.page]["infinite"] != false {
            width
        } else {
            self.viewport.width
        };
        self.camera(Bounds {
            width: world_width,
            height: world_width * height / width,
            ..self.viewport
        })?;
        self.canvas_size = [width, height];
        Ok(())
    }
    pub fn camera(&mut self, viewport: Bounds) -> Result<()> {
        model::require(
            [viewport.x, viewport.y, viewport.width, viewport.height]
                .iter()
                .all(|v| v.is_finite())
                && viewport.x.abs() <= 1e9
                && viewport.y.abs() <= 1e9
                && viewport.width >= 1.0
                && viewport.width <= 1e7
                && viewport.height >= 1.0
                && viewport.height <= 1e7,
        )?;
        self.gesture = None;
        self.edit_gesture = None;
        self.viewport = viewport;
        Ok(())
    }
    pub fn color(&mut self, color: &str, opacity: f64) -> Result<()> {
        self.select_color(color, Some(opacity))
    }
    pub fn select_color(&mut self, color: &str, opacity: Option<f64>) -> Result<()> {
        model::require(
            model::color(&json!(color))
                && opacity.is_none_or(|n| n.is_finite() && (0.0..=1.0).contains(&n)),
        )?;
        let color = color.to_lowercase();
        if !self.selected.is_empty() {
            let mut command = json!({"kind":"selectionColor","color":color});
            if let Some(opacity) = opacity {
                command["opacity"] = json!(opacity);
            }
            self.change(&command)?;
        }
        self.gesture = None;
        self.edit_gesture = None;
        if self.tool == "highlighter" {
            self.aux["highlighter"]["color"] = json!(color);
            if let Some(opacity) = opacity {
                self.aux["highlighter"]["opacity"] = json!(opacity);
            }
        } else {
            self.color = color;
            if let Some(opacity) = opacity {
                self.opacity = opacity;
            }
        }
        Ok(())
    }
    pub fn move_tray(&mut self, x: f64, y: f64) -> Result<()> {
        model::require(x.is_finite() && y.is_finite() && x.abs() < 1e6 && y.abs() < 1e6)?;
        self.gesture = None;
        self.edit_gesture = None;
        self.tray_offset = [x, y];
        Ok(())
    }
    pub fn action(&mut self, action: u32) -> Result<()> {
        model::require(matches!(action,0..=12|100..=103))?;
        self.gesture = None;
        self.edit_gesture = None;
        match action {
            0..=9 => {
                self.tool = "pen".into();
                self.selected.clear();
                self.presets[self.style] = json!({"color":self.color,"width":self.width,"opacity":self.opacity,"pressure":self.pressure,"settings":self.settings});
                self.style = action as usize;
                let preset = &self.presets[self.style];
                self.color = preset["color"].as_str().unwrap().into();
                self.width = preset["width"].as_f64().unwrap();
                self.opacity = preset["opacity"].as_f64().unwrap();
                self.pressure = preset["pressure"].as_bool().unwrap();
                self.settings = preset["settings"].as_object().unwrap().clone();
            }
            10 => {
                self.tool = "highlighter".into();
                self.selected.clear();
            }
            11 => {
                self.tool = "eraser".into();
                self.selected.clear();
            }
            12 => {
                self.tool = "lasso".into();
            }
            100 => {
                self.selected.clear();
                self.session.undo(self.session.revision())?;
            }
            101 => {
                self.selected.clear();
                self.session.redo(self.session.revision())?;
            }
            102 => self.fit(),
            103 => {
                self.page = (self.page + 1) % self.session.document.pages.len();
                self.fit();
            }
            _ => {
                return Err(Error::new(
                    "UnknownAction",
                    "Unsupported native editor action.",
                ))
            }
        };
        if self.page >= self.session.document.pages.len() {
            self.page = self.session.document.pages.len() - 1;
            self.fit();
        }
        let layers = self.session.document.pages[self.page]["layers"]
            .as_array()
            .unwrap();
        if !layers
            .get(self.active_layer)
            .is_some_and(|l| l["visible"] == true)
        {
            self.active_layer = layers
                .iter()
                .position(|l| l["visible"] == true)
                .unwrap_or(0);
        }
        Ok(())
    }
    pub fn tool_settings(
        &mut self,
        width: f64,
        opacity: f64,
        pressure: bool,
        settings: Value,
    ) -> Result<()> {
        if self.tool == "highlighter" || self.tool == "eraser" {
            model::require(
                width.is_finite()
                    && width >= 0.5
                    && width <= if self.tool == "eraser" { 100.0 } else { 30.0 }
                    && opacity.is_finite()
                    && (0.0..=1.0).contains(&opacity),
            )?;
            self.gesture = None;
            self.edit_gesture = None;
            let tool = self.tool.clone();
            self.aux[&tool]["width"] = json!(width);
            if tool == "highlighter" {
                self.aux[&tool]["opacity"] = json!(opacity)
            }
            return Ok(());
        }
        let brush = &self.session.brushes[STYLES[self.style]];
        model::require(
            width.is_finite()
                && width >= 0.1
                && width <= brush["maxWidth"].as_f64().unwrap()
                && opacity.is_finite()
                && (0.0..=1.0).contains(&opacity)
                && (!pressure || brush["supportsPressure"] == true),
        )?;
        let parameters = brush["parameters"].as_array().unwrap();
        let values = settings
            .as_object()
            .ok_or_else(|| Error::new("InvalidInput", "Invalid brush settings."))?;
        model::require(values.len() == parameters.len())?;
        for p in parameters {
            let n = values
                .get(p["id"].as_str().unwrap())
                .and_then(Value::as_f64);
            model::require(n.is_some_and(|n| {
                n.is_finite() && n >= p["min"].as_f64().unwrap() && n <= p["max"].as_f64().unwrap()
            }))?;
        }
        self.gesture = None;
        self.edit_gesture = None;
        self.width = width;
        self.opacity = opacity;
        self.pressure = pressure;
        self.settings = values.clone();
        Ok(())
    }
    pub fn select_page(&mut self, page: usize) -> Result<()> {
        model::require(page < self.session.document.pages.len())?;
        self.gesture = None;
        self.edit_gesture = None;
        self.page = page;
        self.active_layer = 0;
        self.selected.clear();
        self.fit();
        Ok(())
    }
    pub fn add_page(&mut self) -> Result<()> {
        let mut document = self.session.document.value();
        let id = loop {
            self.next_id += 1;
            let id = format!("native-page-{}", self.next_id);
            let layer = format!("{id}-ink");
            if !self
                .session
                .document
                .pages
                .iter()
                .any(|p| p.ids.iter().any(|v| v == &id || v == &layer))
            {
                break id;
            }
        };
        let current = &self.session.document.pages[self.page];
        let page = json!({"id":id,"infinite":current["infinite"]!=false,"width":current["width"],"height":current["height"],"paper":current["paper"],"color":current["color"],"bookmarked":false,"layers":[{"id":format!("{id}-ink"),"name":"Ink","visible":true,"elements":[]}]});
        document["pages"].as_array_mut().unwrap().push(page);
        self.session.replace(document, self.session.revision())?;
        self.gesture = None;
        self.edit_gesture = None;
        self.select_page(self.session.document.pages.len() - 1)
    }
    fn checked(sample: InputSample) -> Result<InputSample> {
        model::require(
            [sample.x, sample.y, sample.pressure, sample.time_ms]
                .iter()
                .all(|v| v.is_finite())
                && sample.x.abs() <= 1e9
                && sample.y.abs() <= 1e9
                && (0.0..=1.0).contains(&sample.pressure),
        )?;
        Ok(sample)
    }
    /// The native editor presents a full-body board even for legacy paged files.
    /// Preserve world samples and extend only when committing ink outside the
    /// old paper. Mode and ink share one undo step; open/cancel remain lossless.
    fn extend_for_ink(page: &mut Value, stroke: &Value) {
        if page["infinite"] == false {
            let width = page["width"].as_f64().unwrap();
            let height = page["height"].as_f64().unwrap();
            if stroke["points"].as_array().unwrap().iter().any(|p| {
                let x = p["x"].as_f64().unwrap();
                let y = p["y"].as_f64().unwrap();
                x < 0.0 || y < 0.0 || x > width || y > height
            }) {
                page["infinite"] = json!(true);
            }
        }
    }
    pub fn begin(&mut self, token: i64, stylus: bool, sample: InputSample) -> Result<()> {
        let sample = Self::checked(sample)?;
        if self.session.readonly() {
            return Err(Error::new("ReadOnly", "This notebook is read-only."));
        }
        if self.gesture.is_some() {
            return Err(Error::new(
                "GestureActive",
                "Finish or cancel the current input first.",
            ));
        }
        let page = &self.session.document.pages[self.page];
        if !page["layers"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|l| l["visible"] == true)
        {
            return Err(Error::new("MissingLayer", "No visible drawing layer."));
        }
        let id = loop {
            self.next_id += 1;
            let id = format!("native-ink-{}", self.next_id);
            if !self
                .session
                .document
                .pages
                .iter()
                .any(|p| p["id"] == id || p.ids.iter().any(|v| v == &id))
            {
                break id;
            }
        };
        let style = STYLES[self.style];
        let plugin = &self.session.brushes[style];
        let pressure = if stylus { sample.pressure } else { 0.5 };
        let stroke = json!({"id":id,"kind":"stroke","tool":"pen","penStyle":style,"brushVersion":plugin["version"].as_u64().unwrap_or(1),"brushSettings":self.settings,"color":self.color,"width":self.width,"opacity":self.opacity,"pressure":self.pressure,"points":[{"x":sample.x,"y":sample.y,"pressure":pressure}]});
        let stroke = if self.tool == "highlighter" {
            json!({"id":id,"kind":"stroke","tool":"highlighter","color":self.active_color(),"width":self.active_width(),"opacity":self.active_opacity(),"pressure":false,"points":[{"x":sample.x,"y":sample.y,"pressure":0.5}]})
        } else {
            stroke
        };
        self.gesture = Some(Gesture {
            token,
            stylus,
            stroke,
            last: sample,
            pressure,
            revision: self.session.revision(),
        });
        Ok(())
    }
    /// One batch of coalesced OS samples, with no JSON serialization or history projection.
    pub fn append(&mut self, token: i64, samples: &[InputSample]) -> Result<()> {
        // Check the complete batch before mutating: invalid input never half-applies.
        for sample in samples {
            Self::checked(*sample)?;
        }
        let gesture = self
            .gesture
            .as_mut()
            .ok_or_else(|| Error::new("MissingGesture", "No input is active."))?;
        model::require(gesture.token == token)?;
        model::require(
            gesture.stroke["points"].as_array().unwrap().len() + samples.len() <= 100000,
        )?;
        for &sample in samples {
            let distance = (sample.x - gesture.last.x).hypot(sample.y - gesture.last.y);
            if gesture.stylus {
                gesture.pressure = sample.pressure;
            } else if distance >= 0.01 {
                let dt = sample.time_ms - gesture.last.time_ms;
                let dt = if dt > 0.0 { dt.min(100.0) } else { 8.0 };
                let speed = distance / dt;
                let target = 0.12 + 0.8 / (1.0 + (speed / 0.45).powi(2));
                gesture.pressure += (target - gesture.pressure) * (1.0 - (-dt / 35.0).exp());
            }
            gesture.last = sample;
            let p = json!({"x":sample.x,"y":sample.y,"pressure":gesture.pressure});
            let points = gesture.stroke["points"].as_array_mut().unwrap();
            if points.last() != Some(&p) {
                points.push(p);
            }
        }
        Ok(())
    }
    pub fn input(
        &mut self,
        phase: u32,
        token: i64,
        stylus: bool,
        samples: &[InputSample],
    ) -> Result<()> {
        model::require(phase <= 3 && samples.len() <= 100000)?;
        for sample in samples {
            Self::checked(*sample)?;
        }
        if !["pen", "highlighter"].contains(&self.tool.as_str()) {
            return self.edit_input(phase, token, samples);
        }
        match phase {
            0 => {
                let first = samples
                    .first()
                    .ok_or_else(|| Error::new("InvalidInput", "Missing initial sample."))?;
                self.begin(token, stylus, *first)?;
                self.append(token, &samples[1..])
            }
            1 => self.append(token, samples),
            2 => {
                self.append(token, samples)?;
                self.end(token, true)
            }
            _ => self.end(token, false),
        }
    }
    pub fn end(&mut self, token: i64, commit: bool) -> Result<()> {
        let gesture = self
            .gesture
            .as_ref()
            .ok_or_else(|| Error::new("MissingGesture", "No input is active."))?;
        model::require(gesture.token == token)?;
        if !commit {
            self.gesture = None;
            self.edit_gesture = None;
            return Ok(());
        }
        let layer_index = self
            .drawing_layer()
            .ok_or_else(|| Error::new("MissingLayer", "No visible drawing layer."))?;
        let mut page = self.session.document.pages[self.page].external();
        Self::extend_for_ink(&mut page, &gesture.stroke);
        let layer = &mut page["layers"][layer_index];
        let mut stroke = gesture.stroke.clone();
        let cutouts =
            crate::native_commands::tape_polygons(&self.session.document.pages[self.page].raw);
        if !cutouts.is_empty() {
            stroke["cutouts"] = json!(cutouts);
        }
        layer["elements"].as_array_mut().unwrap().push(stroke);
        let id = page["id"].as_str().unwrap().to_string();
        self.session.replace_page(&id, page, gesture.revision)?;
        self.gesture = None;
        self.edit_gesture = None;
        Ok(())
    }
    pub fn capture(&self) -> Frame {
        Frame {
            page: self
                .edit_gesture
                .as_ref()
                .map(|g| g.preview.clone())
                .unwrap_or_else(|| self.session.document.pages[self.page].clone()),
            viewport: self.viewport,
            overlay: self.gesture.as_ref().map(|g| g.stroke.clone()),
        }
    }
    pub fn selection_operation(&self) -> Option<&str> {
        self.edit_gesture
            .as_ref()
            .map(|g| g.operation.as_str())
            .filter(|op| *op == "move" || op.starts_with("resize"))
    }
    pub fn selection_origin(&self) -> Option<Bounds> {
        self.edit_gesture
            .as_ref()
            .filter(|_| self.selection_operation().is_some())
            .and_then(|g| g.origin)
            .or_else(|| self.selection_bounds())
    }
    /// Independently owned, cropped selection layers. The replacement patch
    /// restores everything underneath the original objects; the transparent
    /// foreground can then follow the pointer without rerasterizing the page.
    pub fn selection_frame(&self, foreground: bool) -> Option<Frame> {
        if self.selected.is_empty() {
            return None;
        }
        let original = self
            .edit_gesture
            .as_ref()
            .filter(|_| self.selection_operation().is_some())
            .map(|g| &g.original)
            .unwrap_or(&self.session.document.pages[self.page]);
        let bounds = crate::native_edit::selection_bounds(&original.raw, &self.selected)?;
        let margin = 8.0
            * if self.canvas_size[0] > 0.0 {
                self.viewport.width / self.canvas_size[0]
            } else {
                1.0
            };
        let viewport = Bounds {
            x: bounds.x - margin,
            y: bounds.y - margin,
            width: bounds.width + 2.0 * margin,
            height: bounds.height + 2.0 * margin,
        };
        let mut raw = original.external();
        for layer in raw["layers"].as_array_mut().unwrap() {
            layer["elements"]
                .as_array_mut()
                .unwrap()
                .retain(|e| self.selected.iter().any(|id| e["id"] == *id) == foreground);
        }
        if foreground {
            raw["paper"] = json!("plain");
            raw["color"] = json!("none");
            raw.as_object_mut().unwrap().remove("background");
        }
        Some(Frame {
            page: Arc::new(Page::from_validated(raw)),
            viewport,
            overlay: None,
        })
    }
    pub fn fresh_id(&mut self, prefix: &str) -> String {
        loop {
            self.next_id += 1;
            let id = format!("native-{prefix}-{}", self.next_id);
            if !self
                .session
                .document
                .pages
                .iter()
                .any(|p| p.ids.iter().any(|s| s == &id))
            {
                return id;
            }
        }
    }
    pub fn rotate(&mut self) {
        self.gesture = None;
        self.edit_gesture = None;
        self.rotation = (self.rotation + 1) % 4;
    }
    pub fn background_frame(&self) -> Frame {
        let mut page = (*self.session.document.pages[self.page]).clone();
        page.raw["paper"] = json!("plain");
        for l in page.raw["layers"].as_array_mut().unwrap() {
            l["elements"] = json!([])
        }
        Frame {
            page: Arc::new(page),
            viewport: self.viewport,
            overlay: None,
        }
    }
    pub fn rail(&mut self, tab: &str, bookmarks: bool) -> Result<()> {
        model::require(["pages", "scenes"].contains(&tab))?;
        self.rail_tab = tab.into();
        self.bookmarks_only = bookmarks;
        Ok(())
    }
    pub fn bookmark(&mut self) -> Result<()> {
        self.edit_page(|p| p["bookmarked"] = json!(p["bookmarked"] != true))
    }
    pub fn scene(&mut self, name: &str, index: Option<usize>) -> Result<()> {
        if let Some(i) = index {
            let scenes = self.session.document.pages[self.page]["scenes"]
                .as_array()
                .ok_or_else(|| Error::new("MissingScene", "No saved scenes."))?;
            let scene = scenes
                .get(i)
                .ok_or_else(|| Error::new("MissingScene", "No such scene."))?;
            return self.camera(serde_json::from_value(scene.clone())?);
        }
        model::require(!name.trim().is_empty() && name.chars().count() <= 256)?;
        let id = self.fresh_id("scene");
        let v = self.selection_bounds().unwrap_or(self.viewport);
        self.edit_page(|p| {
            if !p["scenes"].is_array() {
                p["scenes"] = json!([])
            }
            p["scenes"].as_array_mut().unwrap().push(
                json!({"id":id,"name":name,"x":v.x,"y":v.y,"width":v.width,"height":v.height}),
            );
        })
    }
    pub(crate) fn drawing_layer(&self) -> Option<usize> {
        let layers = self.session.document.pages[self.page]["layers"]
            .as_array()
            .unwrap();
        if layers
            .get(self.active_layer)
            .is_some_and(|l| l["visible"] == true)
        {
            Some(self.active_layer)
        } else {
            layers.iter().position(|l| l["visible"] == true)
        }
    }
    pub fn active_color(&self) -> &str {
        if self.tool == "highlighter" {
            self.aux["highlighter"]["color"].as_str().unwrap()
        } else {
            &self.color
        }
    }
    pub fn active_width(&self) -> f64 {
        if ["highlighter", "eraser"].contains(&self.tool.as_str()) {
            self.aux[&self.tool]["width"].as_f64().unwrap()
        } else {
            self.width
        }
    }
    pub fn active_opacity(&self) -> f64 {
        if self.tool == "highlighter" {
            self.aux["highlighter"]["opacity"].as_f64().unwrap()
        } else {
            self.opacity
        }
    }
    pub fn set_tool(&mut self, tool: &str) -> Result<()> {
        model::require(
            [
                "pen",
                "highlighter",
                "eraser",
                "lasso",
                "hand",
                "text",
                "line",
                "rectangle",
                "ellipse",
                "tape",
                "background",
            ]
            .contains(&tool),
        )?;
        self.gesture = None;
        self.edit_gesture = None;
        self.tool = tool.into();
        self.pending_text = None;
        if tool != "lasso" {
            self.selected.clear()
        }
        Ok(())
    }
    pub fn eraser_mode(&mut self, mode: &str) -> Result<()> {
        model::require(["path", "stroke"].contains(&mode))?;
        self.aux["eraser"]["mode"] = json!(mode);
        self.edit_gesture = None;
        Ok(())
    }
    pub fn selection_bounds(&self) -> Option<Bounds> {
        crate::native_edit::selection_bounds(&self.capture().page.raw, &self.selected)
    }
    pub fn lasso_path(&self) -> Value {
        self.edit_gesture
            .as_ref()
            .filter(|g| g.operation == "select")
            .map(|g| {
                json!(g
                    .points
                    .iter()
                    .map(|p| json!({"x":p.x,"y":p.y}))
                    .collect::<Vec<_>>())
            })
            .unwrap_or(json!([]))
    }
    pub fn guides(&self) -> Value {
        self.edit_gesture
            .as_ref()
            .map(|g| json!(g.guides))
            .unwrap_or(json!([]))
    }
    pub fn set_guides(&mut self, grid: bool, align: bool) {
        self.gesture = None;
        self.edit_gesture = None;
        self.snap_grid = grid;
        self.align_guides = align;
    }
    fn edit_input(&mut self, phase: u32, token: i64, samples: &[InputSample]) -> Result<()> {
        use crate::native_edit as edit;
        if self.session.readonly() && self.tool != "hand" {
            return Err(Error::new("ReadOnly", "This notebook is read-only."));
        }
        if phase == 0 {
            model::require(self.edit_gesture.is_none())?;
            let p = *samples
                .first()
                .ok_or_else(|| Error::new("InvalidInput", "Missing initial sample."))?;
            let original = self.session.document.pages[self.page].clone();
            let origin = edit::selection_bounds(&original.raw, &self.selected);
            let radius = 10.0 * self.viewport.width
                / if self.canvas_size[0] > 0.0 {
                    self.canvas_size[0]
                } else {
                    self.viewport.width
                };
            let operation = if self.tool == "lasso" {
                let corner = origin.and_then(|r| {
                    [
                        (r.x, r.y, "resizeTL"),
                        (r.x + r.width, r.y, "resizeTR"),
                        (r.x, r.y + r.height, "resizeBL"),
                        (r.x + r.width, r.y + r.height, "resizeBR"),
                    ]
                    .into_iter()
                    .find(|(x, y, _)| (p.x - x).hypot(p.y - y) < radius)
                    .map(|(_, _, op)| op)
                });
                corner.unwrap_or_else(|| {
                    if origin.is_some_and(|r| edit::contains(r, p.x, p.y)) {
                        "move"
                    } else {
                        "select"
                    }
                })
            } else {
                self.tool.as_str()
            }
            .to_owned();
            let id = self.fresh_id("shape");
            let eraser_index = if self.tool == "eraser" {
                Some(edit::EraserIndex::new(&original.raw))
            } else {
                None
            };
            self.edit_gesture = Some(EditGesture {
                token,
                tool: self.tool.clone(),
                id,
                points: vec![p],
                revision: self.session.revision(),
                preview: original.clone(),
                original,
                operation: operation.into(),
                origin,
                camera: self.viewport,
                guides: vec![],
                eraser_index,
            });
        }
        if phase == 0 && self.tool == "tape" {
            let g = self.edit_gesture.as_mut().unwrap();
            let p = g.points[0];
            let radius = 18.0 * self.viewport.width
                / if self.canvas_size[0] > 0.0 {
                    self.canvas_size[0]
                } else {
                    self.viewport.width
                };
            g.operation = "none".into();
            for t in self.session.document.pages[self.page]["tapes"]
                .as_array()
                .into_iter()
                .flatten()
                .rev()
            {
                let (cx, cy, w, h, a) = (
                    t["x"].as_f64().unwrap(),
                    t["y"].as_f64().unwrap(),
                    t["width"].as_f64().unwrap(),
                    t["height"].as_f64().unwrap(),
                    t["angle"].as_f64().unwrap().to_radians(),
                );
                let x = (p.x - cx) * a.cos() + (p.y - cy) * a.sin();
                let y = -(p.x - cx) * a.sin() + (p.y - cy) * a.cos();
                let mode = if x.hypot(y - h / 2.0 - 32.0) < radius {
                    "tapeRotate"
                } else if (x + w / 2.0).hypot(y) < radius {
                    "tapeLeft"
                } else if (x - w / 2.0).hypot(y) < radius {
                    "tapeRight"
                } else if x.abs() <= w / 2.0 && y.abs() <= h / 2.0 + radius {
                    "tapeMove"
                } else {
                    continue;
                };
                g.id = t["id"].as_str().unwrap().into();
                g.operation = mode.into();
                break;
            }
        }
        let layer_index = self.drawing_layer();
        let g = self
            .edit_gesture
            .as_mut()
            .ok_or_else(|| Error::new("MissingGesture", "No edit gesture is active."))?;
        model::require(g.token == token && g.points.len() + samples.len() <= 100000)?;
        if phase == 3 {
            self.edit_gesture = None;
            return Ok(());
        }
        g.points.extend(samples.iter().copied());
        let a = g.points[0];
        let b = *g.points.last().unwrap();
        if g.operation.starts_with("tape") {
            let mut raw = g.original.raw.clone();
            if let Some(t) = raw["tapes"]
                .as_array_mut()
                .into_iter()
                .flatten()
                .find(|t| t["id"] == g.id)
            {
                if g.operation == "tapeMove" {
                    t["x"] = json!(t["x"].as_f64().unwrap() + b.x - a.x);
                    t["y"] = json!(t["y"].as_f64().unwrap() + b.y - a.y);
                } else if g.operation == "tapeRotate" {
                    let cx = t["x"].as_f64().unwrap();
                    let cy = t["y"].as_f64().unwrap();
                    let angle = t["angle"].as_f64().unwrap()
                        + ((b.y - cy).atan2(b.x - cx) - (a.y - cy).atan2(a.x - cx)).to_degrees();
                    let angle = (angle + 180.0).rem_euclid(360.0) - 180.0;
                    let snap = (angle / 45.0).round() * 45.0;
                    t["angle"] = json!(if (angle - snap).abs() < 3.0 {
                        snap
                    } else {
                        angle
                    });
                } else {
                    let angle = t["angle"].as_f64().unwrap().to_radians();
                    let sign = if g.operation == "tapeLeft" { -1.0 } else { 1.0 };
                    let w = t["width"].as_f64().unwrap();
                    let fx = t["x"].as_f64().unwrap() - sign * angle.cos() * w / 2.0;
                    let fy = t["y"].as_f64().unwrap() - sign * angle.sin() * w / 2.0;
                    let length = (sign * ((b.x - fx) * angle.cos() + (b.y - fy) * angle.sin()))
                        .clamp(24.0, 5000.0);
                    t["width"] = json!(length);
                    t["x"] = json!(fx + sign * angle.cos() * length / 2.0);
                    t["y"] = json!(fy + sign * angle.sin() * length / 2.0);
                }
            }
            g.preview = edit::checked_preview(raw, &g.original, &self.session.brushes)?;
        } else if g.operation == "background" {
            let mut raw = g.original.raw.clone();
            if let Some(bg) = raw.get_mut("background") {
                bg["x"] = json!(bg["x"].as_f64().unwrap() + b.x - a.x);
                bg["y"] = json!(bg["y"].as_f64().unwrap() + b.y - a.y);
                g.preview = edit::checked_preview(raw, &g.original, &self.session.brushes)?;
            }
        } else if g.operation == "hand" {
            self.viewport = Bounds {
                x: g.camera.x + a.x - b.x,
                y: g.camera.y + a.y - b.y,
                ..g.camera
            };
        } else if g.operation == "move" || g.operation.starts_with("resize") {
            let mut raw = g.original.raw.clone();
            let r = g.origin.unwrap();
            let (dx, dy, sx, sy) = if g.operation == "move" {
                let threshold = 6.0 * self.viewport.width
                    / if self.canvas_size[0] > 0.0 {
                        self.canvas_size[0]
                    } else {
                        self.viewport.width
                    };
                let (dx, dy, guides) = edit::snap_move(
                    &raw,
                    &self.selected,
                    b.x - a.x,
                    b.y - a.y,
                    threshold,
                    self.snap_grid,
                    self.align_guides,
                );
                g.guides = guides;
                (dx, dy, 1.0, 1.0)
            } else {
                let left = g.operation.ends_with("TL") || g.operation.ends_with("BL");
                let top = g.operation.ends_with("TL") || g.operation.ends_with("TR");
                let sx = (1.0 + (b.x - a.x) / r.width.max(0.1) * if left { -1.0 } else { 1.0 })
                    .clamp(0.05, 20.0);
                let sy = (1.0 + (b.y - a.y) / r.height.max(0.1) * if top { -1.0 } else { 1.0 })
                    .clamp(0.05, 20.0);
                (
                    if left { r.width * (1.0 - sx) } else { 0.0 },
                    if top { r.height * (1.0 - sy) } else { 0.0 },
                    sx,
                    sy,
                )
            };
            edit::transform(&mut raw, &self.selected, r, dx, dy, sx, sy);
            g.preview = edit::checked_preview(raw, &g.original, &self.session.brushes)?;
        } else if g.tool == "eraser" {
            // Copy-on-write only when a render snapshot still owns this page.
            // Eraser mutations are native-generated/checked; full model validation
            // remains at commit, rather than walking the entire notebook per sample.
            let page = Arc::make_mut(&mut g.preview);
            let start = g.points.len().saturating_sub(samples.len() + 1);
            for i in start..g.points.len() {
                edit::erase(
                    &mut page.raw,
                    g.points[i.saturating_sub(1)],
                    g.points[i],
                    self.aux["eraser"]["width"].as_f64().unwrap(),
                    self.aux["eraser"]["mode"] == "path",
                    g.eraser_index.as_ref().unwrap(),
                )?;
            }
        } else if ["line", "rectangle", "ellipse"].contains(&g.tool.as_str()) {
            let mut raw = g.original.raw.clone();
            let id = g.id.clone();
            let stroke = json!({"id":id,"kind":"stroke","tool":"pen","penStyle":"ballpoint","shape":g.tool,"color":self.color,"width":self.width.min(24.0),"opacity":self.opacity,"pressure":false,"points":edit::shape(&g.tool,a,b)});
            Self::extend_for_ink(&mut raw, &stroke);
            raw["layers"]
                [layer_index.ok_or_else(|| Error::new("MissingLayer", "No visible layer."))?]
                ["elements"]
                .as_array_mut()
                .unwrap()
                .push(stroke);
            g.preview = edit::checked_preview(raw, &g.original, &self.session.brushes)?;
        }
        if phase == 2 {
            let g = self.edit_gesture.take().unwrap();
            if g.operation == "select" {
                self.selected = edit::select(
                    &g.original.raw,
                    &g.points,
                    6.0 * self.viewport.width
                        / if self.canvas_size[0] > 0.0 {
                            self.canvas_size[0]
                        } else {
                            self.viewport.width
                        },
                );
            } else if g.tool == "text" {
                self.pending_text = Some(b)
            } else if g.operation != "hand" && g.operation != "none" {
                let page = g.preview.external();
                let id = page["id"].as_str().unwrap().to_owned();
                self.session.replace_page(&id, page, g.revision)?;
                if ["line", "rectangle", "ellipse"].contains(&g.tool.as_str()) {
                    self.selected = vec![g.id];
                    self.tool = "lasso".into();
                }
                self.next_id += 1;
            }
        }
        Ok(())
    }
    pub fn page_frame(&self, index: usize) -> Result<Frame> {
        let page = self
            .session
            .document
            .pages
            .get(index)
            .ok_or_else(|| Error::new("MissingPage", "No such page."))?
            .clone();
        let viewport = crate::render::content_bounds(&page.external())?;
        Ok(Frame {
            page,
            viewport,
            overlay: None,
        })
    }
    pub fn edit_page(&mut self, mut edit: impl FnMut(&mut Value)) -> Result<()> {
        let mut page = self.session.document.pages[self.page].external();
        edit(&mut page);
        crate::native_edit::refresh_connections(&mut page);
        let id = page["id"].as_str().unwrap().to_owned();
        self.session
            .replace_page(&id, page, self.session.revision())?;
        self.gesture = None;
        self.edit_gesture = None;
        Ok(())
    }
    pub fn selection_action(&mut self, action: &str) -> Result<()> {
        model::require(["delete", "duplicate", "clear", "selectAll", "connect"].contains(&action))?;
        if action == "connect" {
            return self.quick_connect();
        }
        if action == "clear" {
            self.selected.clear();
            return Ok(());
        }
        if action == "selectAll" {
            self.selected = self.session.document.pages[self.page]["layers"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|l| l["visible"] == true)
                .flat_map(|l| l["elements"].as_array().unwrap())
                .map(|e| e["id"].as_str().unwrap().into())
                .collect();
            return Ok(());
        }
        let ids = self.selected.clone();
        if action == "delete" {
            self.edit_page(|p| crate::native_edit::remove(p, &ids))?;
            self.selected.clear();
        } else {
            let mut doc = self.session.document.pages[self.page].external();
            let mut selected = vec![];
            let mut remap = std::collections::HashMap::new();
            for l in doc["layers"].as_array_mut().unwrap() {
                let mut copies = vec![];
                for e in l["elements"].as_array().unwrap() {
                    if ids.iter().any(|id| e["id"] == id.as_str()) {
                        let mut e = e.clone();
                        if e["kind"] == "stroke"
                            && e.get("penStyle").is_some()
                            && e.get("brushSeed").is_none()
                        {
                            let stroke: crate::brushes::Stroke = serde_json::from_value(e.clone())
                                .map_err(|_| {
                                    Error::new("InvalidInput", "Invalid copied stroke.")
                                })?;
                            e["brushSeed"] = json!(stroke.seed());
                        }
                        let id = self.fresh_id("copy");
                        remap.insert(e["id"].as_str().unwrap().to_owned(), id.clone());
                        e["id"] = json!(id);
                        selected.push(id);
                        copies.push(e)
                    }
                }
                l["elements"].as_array_mut().unwrap().extend(copies);
            }
            for l in doc["layers"].as_array_mut().unwrap() {
                for e in l["elements"].as_array_mut().unwrap() {
                    if !selected.iter().any(|id| e["id"] == id.as_str()) {
                        continue;
                    }
                    if let Some(connector) = e.get_mut("connector") {
                        for side in ["from", "to"] {
                            if let Some(id) = connector[side]["elementId"]
                                .as_str()
                                .and_then(|id| remap.get(id))
                            {
                                connector[side]["elementId"] = json!(id);
                            }
                        }
                    }
                }
            }
            crate::native_edit::transform(
                &mut doc,
                &selected,
                Bounds {
                    x: 0.0,
                    y: 0.0,
                    width: 1.0,
                    height: 1.0,
                },
                12.0,
                12.0,
                1.0,
                1.0,
            );
            self.edit_page(|p| *p = doc.clone())?;
            self.selected = selected;
        }
        Ok(())
    }
    fn quick_connect(&mut self) -> Result<()> {
        model::require(self.selected.len() == 1)?;
        let page = self.session.document.pages[self.page].external();
        let source = page["layers"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|l| l["visible"] == true)
            .flat_map(|l| l["elements"].as_array().unwrap())
            .find(|e| {
                e["id"] == self.selected[0]
                    && matches!(e["shape"].as_str(), Some("rectangle" | "ellipse"))
            })
            .ok_or_else(|| Error::new("InvalidInput", "Select one rectangle or ellipse."))?;
        let bounds = crate::render::bounds(source)?;
        let width = source["width"].as_f64().unwrap();
        let infinite = page["infinite"] != false;
        let w = (bounds.width - width).max(24.0).min(if infinite {
            f64::INFINITY
        } else {
            page["width"].as_f64().unwrap() - 4.0
        });
        let h = (bounds.height - width).max(24.0).min(if infinite {
            f64::INFINITY
        } else {
            page["height"].as_f64().unwrap() - 4.0
        });
        let x = bounds.x + bounds.width + 50.0 + width / 2.0;
        let y = bounds.y + bounds.height / 2.0 - h / 2.0;
        let x = if infinite {
            x
        } else {
            x.max(2.0).min(page["width"].as_f64().unwrap() - w - 2.0)
        };
        let y = if infinite {
            y
        } else {
            y.max(2.0).min(page["height"].as_f64().unwrap() - h - 2.0)
        };
        let mut target = source.clone();
        let id = self.fresh_id("shape");
        target["id"] = json!(id);
        target["points"] = crate::native_edit::shape(
            source["shape"].as_str().unwrap(),
            InputSample {
                x,
                y,
                pressure: 0.5,
                time_ms: 0.0,
            },
            InputSample {
                x: x + w,
                y: y + h,
                pressure: 0.5,
                time_ms: 0.0,
            },
        );
        let target_bounds = crate::render::bounds(&target)?;
        let from = crate::native_edit::anchor(bounds, "right");
        let side = ["top", "right", "bottom", "left"]
            .into_iter()
            .min_by(|a, b| {
                let a = crate::native_edit::anchor(target_bounds, a);
                let b = crate::native_edit::anchor(target_bounds, b);
                (a.0 - from.0)
                    .hypot(a.1 - from.1)
                    .total_cmp(&(b.0 - from.0).hypot(b.1 - from.1))
            })
            .unwrap();
        let connector = json!({"id":self.fresh_id("connector"),"kind":"stroke","tool":"pen","color":source["color"],"width":width,"pressure":false,"opacity":1.0,
            "connector":{"from":{"elementId":source["id"],"side":"right"},"to":{"elementId":id,"side":side}},
            "points":crate::native_edit::connector_points(from,crate::native_edit::anchor(target_bounds,side))});
        let layer = self
            .drawing_layer()
            .ok_or_else(|| Error::new("MissingLayer", "No visible layer."))?;
        self.edit_page(|p| {
            p["layers"][layer]["elements"]
                .as_array_mut()
                .unwrap()
                .extend([target.clone(), connector.clone()])
        })?;
        self.selected = vec![id];
        self.tool = "lasso".into();
        Ok(())
    }
    pub fn insert_text(&mut self, text: &str) -> Result<()> {
        model::require(!text.is_empty() && text.chars().count() <= 100000)?;
        let p = self.pending_text.unwrap_or(InputSample {
            x: self.viewport.x + 40.0,
            y: self.viewport.y + 60.0,
            pressure: 0.5,
            time_ms: 0.0,
        });
        let id = self.fresh_id("text");
        let element = json!({"id":id,"kind":"text","x":p.x,"y":p.y,"text":text,"size":24,"color":self.color,"font":"sans-serif"});
        let layer = self
            .drawing_layer()
            .ok_or_else(|| Error::new("MissingLayer", "No visible drawing layer."))?;
        self.edit_page(|page| {
            page["layers"][layer]["elements"]
                .as_array_mut()
                .unwrap()
                .push(element.clone());
        })?;
        self.pending_text = None;
        Ok(())
    }
    pub fn snapshot(&self) -> SaveSnapshot {
        self.session.snapshot()
    }
    pub fn document_epoch(&self) -> u64 {
        self.document_epoch
    }
    pub fn mark_saved(&mut self, epoch: u64, revision: u64) -> bool {
        epoch == self.document_epoch && self.session.mark_saved(revision)
    }
    pub fn state(&self, width: f64, height: f64) -> Value {
        crate::native_ui::state(self, width, height)
    }
}
impl Default for Surface {
    fn default() -> Self {
        Self::new()
    }
}
impl FrameRenderer {
    pub fn trim_geometry(&mut self) {
        self.renderer.clear_geometry_cache();
        self.tiles.clear();
        self.live_oil.get_mut().take();
        self.live_raster.get_mut().take();
    }
    pub fn new() -> Self {
        Self {
            renderer: Renderer::new([]),
            cache: None,
            full_rasters: 0,
            tiles: Default::default(),
            tile_job: None,
            live_oil: Default::default(),
            live_raster: Default::default(),
        }
    }
    pub fn full_raster_count(&self) -> u64 {
        self.full_rasters
    }
    pub fn render(
        &mut self,
        frame: &Frame,
        width: u32,
        height: u32,
    ) -> Result<resvg::tiny_skia::Pixmap> {
        self.ensure_base(frame, width, height)?;
        let mut image = self.cache.as_ref().unwrap().4.clone();
        if let Some(stroke) = &frame.overlay {
            let overlay = self
                .renderer
                .overlay(stroke, frame.viewport, width, height)?;
            image.draw_pixmap(
                0,
                0,
                overlay.as_ref(),
                &resvg::tiny_skia::PixmapPaint::default(),
                resvg::tiny_skia::Transform::identity(),
                None,
            );
        }
        Ok(image)
    }
    /// Does not populate the exact committed cache with preview-quality pixels.
    pub fn render_preview(
        &self,
        frame: &Frame,
        width: u32,
        height: u32,
    ) -> Result<resvg::tiny_skia::Pixmap> {
        self.renderer
            .preview(&frame.page, frame.viewport, width, height)
    }
    fn ensure_base(&mut self, frame: &Frame, width: u32, height: u32) -> Result<bool> {
        if let Some((before, v, w, h, _)) = &self.cache {
            if *v == frame.viewport && *w == width && *h == height {
                if let Some(strokes) = appended_strokes(before, &frame.page) {
                    // Multiple short strokes can commit while a slow camera raster
                    // is running. Merge the complete append-only suffix atomically
                    // rather than rebuilding the existing scene for the whole batch.
                    let mut image = self.cache.as_ref().unwrap().4.clone();
                    for stroke in strokes {
                        let layers = self.patch(stroke, frame.viewport, width, height)?;
                        if let Some(patch) = layers.patch {
                            image.draw_pixmap(
                                layers.x as i32,
                                layers.y as i32,
                                patch.as_ref(),
                                &resvg::tiny_skia::PixmapPaint::default(),
                                resvg::tiny_skia::Transform::identity(),
                                None,
                            );
                        }
                    }
                    let cache = self.cache.as_mut().unwrap();
                    cache.4 = image;
                    cache.0 = frame.page.clone();
                    return Ok(true);
                }
            }
        }
        if !self.cache.as_ref().is_some_and(|(p, v, w, h, _)| {
            Arc::ptr_eq(p, &frame.page) && *v == frame.viewport && *w == width && *h == height
        }) {
            self.full_rasters += 1;
            let image = self
                .renderer
                .render_native(&frame.page, frame.viewport, width, height)?;
            self.cache = Some((frame.page.clone(), frame.viewport, width, height, image));
            return Ok(true);
        }
        Ok(false)
    }
    pub fn base(&self) -> Option<&resvg::tiny_skia::Pixmap> {
        self.cache.as_ref().map(|c| &c.4)
    }
    /// Retain the full committed scene on the platform layer. Only rasterize the live ink bounds.
    pub fn render_layers(&mut self, frame: &Frame, width: u32, height: u32) -> Result<Layers> {
        let base_changed = self.ensure_base(frame, width, height)?;
        let mut result = if let Some(stroke) = &frame.overlay {
            self.patch(stroke, frame.viewport, width, height)?
        } else {
            Layers {
                base_changed: false,
                x: 0,
                y: 0,
                patch: None,
            }
        };
        result.base_changed = base_changed;
        Ok(result)
    }
    /// Live ink must not wait for a committed scene or camera refinement.
    /// This renderer can be independently owned by the platform's ink worker.
    pub fn render_ink(&self, frame: &Frame, width: u32, height: u32) -> Result<Layers> {
        model::require(
            width > 0 && height > 0 && u64::from(width) * u64::from(height) <= 16_000_000,
        )?;
        let mut oil = self.live_oil.borrow_mut();
        if let Some(stroke) = frame
            .overlay
            .as_ref()
            .filter(|s| crate::native_oil::LiveOil::supported(s))
        {
            if !oil
                .as_ref()
                .is_some_and(|o| o.matches(stroke, frame.viewport, width, height))
            {
                *oil = Some(crate::native_oil::LiveOil::new(
                    stroke,
                    frame.viewport,
                    width,
                    height,
                )?);
            }
            return oil.as_mut().unwrap().update(stroke);
        }
        *oil = None;
        if let Some(stroke) = frame.overlay.as_ref().filter(|s| {
            s["tool"] == "pen"
                && !s["cutouts"].as_array().is_some_and(|v| !v.is_empty())
                && !s["erasures"].as_array().is_some_and(|v| !v.is_empty())
        }) {
            return self.renderer.live_ink(
                &mut self.live_raster.borrow_mut(),
                stroke,
                frame.viewport,
                width,
                height,
            );
        }
        *self.live_raster.borrow_mut() = None;
        match &frame.overlay {
            Some(stroke) => self.patch(stroke, frame.viewport, width, height),
            None => Ok(Layers {
                base_changed: false,
                x: 0,
                y: 0,
                patch: None,
            }),
        }
    }
    /// Work in the most recent live oil update, for bounded-work regressions.
    pub fn live_oil_work(&self) -> (usize, usize) {
        self.live_oil
            .borrow()
            .as_ref()
            .map_or((0, 0), |o| (o.updated_sections, o.repainted_tiles))
    }
    fn patch(&self, stroke: &Value, viewport: Bounds, width: u32, height: u32) -> Result<Layers> {
        let mut result = Layers {
            base_changed: false,
            x: 0,
            y: 0,
            patch: None,
        };
        {
            let bounds = crate::render::bounds(stroke)?;
            let margin = stroke["width"].as_f64().unwrap() * 3.0;
            let sx = width as f64 / viewport.width;
            let sy = height as f64 / viewport.height;
            let x = ((bounds.x - margin - viewport.x) * sx)
                .floor()
                .clamp(0.0, width as f64) as u32;
            let y = ((bounds.y - margin - viewport.y) * sy)
                .floor()
                .clamp(0.0, height as f64) as u32;
            let right = ((bounds.x + bounds.width + margin - viewport.x) * sx)
                .ceil()
                .clamp(0.0, width as f64) as u32;
            let bottom = ((bounds.y + bounds.height + margin - viewport.y) * sy)
                .ceil()
                .clamp(0.0, height as f64) as u32;
            if right > x && bottom > y {
                let viewport = Bounds {
                    x: viewport.x + x as f64 / sx,
                    y: viewport.y + y as f64 / sy,
                    width: (right - x) as f64 / sx,
                    height: (bottom - y) as f64 / sy,
                };
                result.patch =
                    Some(
                        self.renderer
                            .overlay(stroke, viewport, right - x, bottom - y)?,
                    );
                result.x = x;
                result.y = y;
            }
        }
        Ok(result)
    }
}
impl Default for FrameRenderer {
    fn default() -> Self {
        Self::new()
    }
}
