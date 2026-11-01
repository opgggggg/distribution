use crate::{
    codec,
    history::{Document, HistoryState, NotesSession},
    model::{self, BrushCatalog},
    Error, Result,
};
use office_browser_abi::{BrowserKernel, KernelError};
use serde_json::{json, Value};
use std::sync::Arc;

pub struct NotesKernel {
    pub session: Option<NotesSession>,
    brushes: BrushCatalog,
    frames: Vec<(Arc<Document>, u64)>,
    next_id: u64,
    file_name: String,
    save_xopp: bool,
    wire: crate::wire::Wire,
}
impl Default for NotesKernel {
    fn default() -> Self {
        Self {
            session: None,
            brushes: model::builtin_brushes(),
            frames: Vec::new(),
            next_id: 0,
            file_name: "Imported notebook".into(),
            save_xopp: false,
            wire: Default::default(),
        }
    }
}
impl NotesKernel {
    fn session(&mut self) -> Result<&mut NotesSession> {
        self.session
            .as_mut()
            .ok_or_else(|| Error::new("NotOpen", "No notebook is open."))
    }
    pub fn configure(&mut self, plugins: &Value) -> Result<()> {
        let plugins = model::array(plugins)?;
        let mut catalog = model::builtin_brushes();
        for p in plugins {
            let id = p["id"]
                .as_str()
                .ok_or_else(|| Error::new("InvalidBrush", "Invalid brush definition."))?;
            model::require(id.len() <= 128 && id.contains(':') && !catalog.contains_key(id))?;
            model::require(
                p.get("version")
                    .is_none_or(|v| model::number(v, 1.0, 1000.0)),
            )?;
            for parameter in model::array(&p["parameters"])? {
                model::require(
                    model::text(&parameter["id"], 1, 128)
                        && model::number(&parameter["min"], -10000.0, 10000.0)
                        && model::number(
                            &parameter["max"],
                            parameter["min"].as_f64().unwrap() + 0.001,
                            10000.0,
                        ),
                )?;
            }
            catalog.insert(id.into(), p.clone());
        }
        self.brushes = catalog.clone();
        if let Some(s) = &mut self.session {
            s.brushes = catalog;
        }
        Ok(())
    }
    fn init(&mut self, request: &Value) -> Result<()> {
        let document = Document::from_value(request["document"].clone(), &self.brushes)?;
        let history = if let Some(state) = request
            .get("history")
            .filter(|s| s["format"] == "cubeoffice-note-history")
        {
            codec::decode_history(&serde_json::to_vec(state)?, &document, &self.brushes)?
        } else if let Some(state) = request.get("history") {
            let restore = |key: &str| -> Result<Vec<Arc<Document>>> {
                model::array(&state[key])?
                    .iter()
                    .map(|d| Document::from_value(d.clone(), &self.brushes).map(Arc::new))
                    .collect()
            };
            let state = HistoryState {
                past: restore("past")?,
                future: restore("future")?,
            };
            model::require(state.past.len() + state.future.len() <= model::HISTORY_STEPS)?;
            state
        } else {
            HistoryState::default()
        };
        self.session = Some(NotesSession::new(
            document,
            history,
            self.brushes.clone(),
            request["readonly"] == true,
        ));
        self.frames.clear();
        self.wire = Default::default();
        Ok(())
    }
    pub fn projection(&mut self, include_frames: bool) -> Result<Value> {
        let s = self
            .session
            .as_ref()
            .ok_or_else(|| Error::new("NotOpen", "No notebook is open."))?;
        let mut active = vec![s.document.clone()];
        active.extend(s.history.past.iter().cloned());
        active.extend(s.history.future.iter().cloned());
        self.frames
            .retain(|(d, _)| active.iter().any(|a| Arc::ptr_eq(a, d)));
        let mut ids = Vec::new();
        for doc in &active {
            let id = if let Some((_, id)) = self.frames.iter().find(|(d, _)| Arc::ptr_eq(d, doc)) {
                *id
            } else {
                self.next_id += 1;
                self.frames.push((doc.clone(), self.next_id));
                self.next_id
            };
            ids.push(id);
        }
        let mut result = self.wire.prepare(&active, include_frames);
        let state = json!({"kernel":"rust","revision":s.revision(),"dirty":s.dirty(),"readonly":s.readonly(),"document":self.wire.document(&s.document),"current":ids[0],"past":&ids[1..1+s.history.past.len()],"future":&ids[1+s.history.past.len()..]});
        result
            .as_object_mut()
            .unwrap()
            .extend(state.as_object().unwrap().clone());
        if include_frames {
            result["frames"] = Value::Array(
                active
                    .iter()
                    .zip(&ids)
                    .map(|(d, id)| json!({"id":id,"document":self.wire.document(d)}))
                    .collect(),
            );
        }
        Ok(result)
    }
    pub fn command(&mut self, mut request: Value) -> Result<Value> {
        self.wire.expand(&mut request)?;
        let op = request["op"]
            .as_str()
            .ok_or_else(|| Error::new("InvalidArgument", "Missing notes operation."))?;
        match op {
            "pageSvg" => {
                let id = request["pageId"]
                    .as_str()
                    .ok_or_else(|| Error::new("MissingPage", "Missing page ID."))?;
                let page = self
                    .session()?
                    .document
                    .pages
                    .iter()
                    .find(|p| p["id"] == id)
                    .ok_or_else(|| Error::new("MissingPage", "Notebook page was removed."))?;
                let viewport = request
                    .get("viewport")
                    .map(|v| serde_json::from_value(v.clone()))
                    .transpose()?;
                return Ok(json!({"svg":crate::render::page_svg(page,viewport)?}));
            }
            "brushPasses" => {
                return Ok(json!({"passes":crate::brushes::render(&request["stroke"])?}))
            }
            "configure" => {
                self.configure(&request["plugins"])?;
                if let Some(name) = request["fileName"].as_str() {
                    self.file_name = name.into();
                }
                return Ok(json!({"kernel":"rust"}));
            }
            "exportFormat" => {
                model::require(request["format"] == "cubenote" || request["format"] == "xopp")?;
                self.save_xopp = request["format"] == "xopp";
                return Ok(json!({"kernel":"rust"}));
            }
            "validate" => {
                model::validate(&request["document"], &self.brushes)?;
                return Ok(json!({"valid":true}));
            }
            "init" => self.init(&request)?,
            "initSave" => {
                self.init(&request)?;
                return Ok(json!({"kernel":"rust"}));
            }
            "replace" => {
                let base = request["baseRevision"]
                    .as_u64()
                    .ok_or_else(|| Error::new("InvalidArgument", "Missing baseRevision."))?;
                self.session()?.replace(request["document"].clone(), base)?;
            }
            "replacePage" => {
                let base = request["baseRevision"]
                    .as_u64()
                    .ok_or_else(|| Error::new("InvalidArgument", "Missing baseRevision."))?;
                let id = request["pageId"]
                    .as_str()
                    .ok_or_else(|| Error::new("InvalidArgument", "Missing pageId."))?;
                self.session()?
                    .replace_page(id, request["page"].clone(), base)?;
            }
            "undo" | "redo" => {
                let base = request["baseRevision"]
                    .as_u64()
                    .ok_or_else(|| Error::new("InvalidArgument", "Missing baseRevision."))?;
                if op == "undo" {
                    self.session()?.undo(base)?;
                } else {
                    self.session()?.redo(base)?;
                }
            }
            "markSaved" => {
                let revision = request["revision"]
                    .as_u64()
                    .ok_or_else(|| Error::new("InvalidArgument", "Missing revision."))?;
                self.session()?.mark_saved(revision);
            }
            "readonly" => {
                model::require(request["value"].is_boolean())?;
                self.session()?
                    .set_readonly(request["value"].as_bool().unwrap());
            }
            "state" => {}
            _ => {
                return Err(Error::new(
                    "UnsupportedOperation",
                    format!("Unknown notes operation: {op}"),
                ))
            }
        }
        self.projection(request["includeFrames"] == true)
    }
}
impl BrowserKernel for NotesKernel {
    fn open(&mut self, bytes: Vec<u8>) -> std::result::Result<Value, KernelError> {
        let title = if self.file_name.to_ascii_lowercase().ends_with(".xopp")
            || self.file_name.to_ascii_lowercase().ends_with(".xoj")
        {
            &self.file_name[..self.file_name.len() - 5
                + usize::from(self.file_name.to_ascii_lowercase().ends_with(".xoj"))]
        } else {
            &self.file_name
        };
        let (doc, history) = codec::read_named(&bytes, title, &self.brushes)?;
        self.session = Some(NotesSession::new(doc, history, self.brushes.clone(), false));
        self.frames.clear();
        self.wire = Default::default();
        self.projection(true).map_err(Into::into)
    }
    fn request(&mut self, request: Value) -> std::result::Result<Value, KernelError> {
        self.command(request).map_err(Into::into)
    }
    fn save(&mut self) -> std::result::Result<Vec<u8>, KernelError> {
        let xopp = std::mem::take(&mut self.save_xopp);
        let s = self.session()?;
        if xopp {
            return crate::xopp::write(&s.document, &s.brushes).map_err(Into::into);
        }
        codec::write(&s.snapshot(), &s.brushes).map_err(Into::into)
    }
}
