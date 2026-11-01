use crate::{
    model::*,
    page::{validate_frame, Page},
    Error, Result,
};
use serde::{ser::SerializeMap, Serialize, Serializer};
use serde_json::{Map, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

/// Pages are immutable and shared across history frames and detached saves.
#[derive(Clone, Debug)]
pub struct Document {
    pub head: Map<String, Value>,
    pub pages: Vec<Arc<Page>>,
}
impl Document {
    pub fn from_value(mut value: Value, brushes: &BrushCatalog) -> Result<Self> {
        validate(&value, brushes)?;
        let pages = value
            .as_object_mut()
            .unwrap()
            .remove("pages")
            .unwrap()
            .as_array_mut()
            .unwrap()
            .drain(..)
            .map(|p| Arc::new(Page::from_validated(p)))
            .collect();
        Ok(Self {
            head: value.as_object_mut().unwrap().clone(),
            pages,
        })
    }
    pub fn value(&self) -> Value {
        serde_json::to_value(self).expect("JSON document")
    }
    pub fn title(&self) -> &Value {
        &self.head["title"]
    }
}
impl Serialize for Document {
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        let mut map = s.serialize_map(Some(self.head.len() + 1))?;
        for (k, v) in &self.head {
            map.serialize_entry(k, v)?;
        }
        map.serialize_entry("pages", &self.pages)?;
        map.end()
    }
}
#[derive(Clone, Debug, Default)]
pub struct HistoryState {
    pub past: Vec<Arc<Document>>,
    pub future: Vec<Arc<Document>>,
}
#[derive(Clone)]
pub struct SaveSnapshot {
    pub document: Arc<Document>,
    pub history: HistoryState,
    pub revision: u64,
}
#[derive(Clone)]
struct Identity {
    current: usize,
    past: Vec<usize>,
    future: Vec<usize>,
}
impl Identity {
    fn new(doc: &Arc<Document>, state: &HistoryState) -> Self {
        Self {
            current: Arc::as_ptr(doc) as usize,
            past: state.past.iter().map(|d| Arc::as_ptr(d) as usize).collect(),
            future: state
                .future
                .iter()
                .map(|d| Arc::as_ptr(d) as usize)
                .collect(),
        }
    }
    fn matches(&self, doc: &Arc<Document>, state: &HistoryState) -> bool {
        self.current == Arc::as_ptr(doc) as usize
            && self
                .past
                .iter()
                .copied()
                .eq(state.past.iter().map(|d| Arc::as_ptr(d) as usize))
            && self
                .future
                .iter()
                .copied()
                .eq(state.future.iter().map(|d| Arc::as_ptr(d) as usize))
    }
}
pub struct NotesSession {
    pub document: Arc<Document>,
    pub history: HistoryState,
    pub brushes: BrushCatalog,
    revision: u64,
    readonly: bool,
    clean: Identity,
    // Keep clean identities alive, so allocator address reuse cannot acknowledge a different edit.
    clean_snapshot: SaveSnapshot,
}
impl NotesSession {
    pub fn new(
        document: Document,
        history: HistoryState,
        brushes: BrushCatalog,
        readonly: bool,
    ) -> Self {
        let document = Arc::new(document);
        let clean = Identity::new(&document, &history);
        let clean_snapshot = SaveSnapshot {
            document: document.clone(),
            history: history.clone(),
            revision: 0,
        };
        Self {
            document,
            history,
            brushes,
            revision: 0,
            readonly,
            clean,
            clean_snapshot,
        }
    }
    pub fn revision(&self) -> u64 {
        self.revision
    }
    pub fn dirty(&self) -> bool {
        !self.clean.matches(&self.document, &self.history)
    }
    pub fn readonly(&self) -> bool {
        self.readonly
    }
    pub fn set_readonly(&mut self, value: bool) {
        self.readonly = value;
    }
    pub fn snapshot(&self) -> SaveSnapshot {
        SaveSnapshot {
            document: self.document.clone(),
            history: self.history.clone(),
            revision: self.revision,
        }
    }
    fn editable(&self, revision: u64) -> Result<()> {
        if self.readonly {
            return Err(Error::new("ReadOnly", "This notebook is read-only."));
        }
        if revision != self.revision {
            return Err(Error::new(
                "StaleRevision",
                "The notebook changed; retry against the current revision.",
            ));
        }
        Ok(())
    }
    pub fn replace(&mut self, value: Value, base: u64) -> Result<bool> {
        self.editable(base)?;
        let next = Document::from_value(value, &self.brushes)?;
        self.install(next)
    }
    pub fn replace_page(&mut self, id: &str, page: Value, base: u64) -> Result<bool> {
        self.editable(base)?;
        let index = self
            .document
            .pages
            .iter()
            .position(|p| p["id"] == id)
            .ok_or_else(|| Error::new("MissingPage", "Notebook page was removed."))?;
        require(page["id"] == id)?;
        if self.document.pages[index].external() == page {
            return Ok(false);
        }
        let mut next = (*self.document).clone();
        crate::model::validate_page(&page, &self.brushes)?;
        next.pages[index] = Arc::new(Page::from_validated(page));
        // Validate global IDs and page-local connector targets before committing.
        validate_frame(&next.pages)?;
        self.install(next)
    }
    fn install(&mut self, mut next: Document) -> Result<bool> {
        if self.document.head == next.head && self.document.pages == next.pages {
            return Ok(false);
        }
        // Preserve immutable page identities after whole-document edits.
        for p in &mut next.pages {
            if let Some(old) = self.document.pages.iter().find(|old| ***old == **p) {
                *p = old.clone();
            }
        }
        self.history.past.push(self.document.clone());
        self.document = Arc::new(next);
        self.history.future.clear();
        while self.history.past.len() > 1
            && (self.history.past.len() > HISTORY_STEPS
                || retained_bytes(&self.document, &self.history) > HISTORY_BYTES)
        {
            self.history.past.remove(0);
        }
        self.revision += 1;
        Ok(true)
    }
    pub fn undo(&mut self, base: u64) -> Result<bool> {
        self.editable(base)?;
        if let Some(before) = self.history.past.pop() {
            self.history.future.push(self.document.clone());
            self.document = before;
            self.revision += 1;
            return Ok(true);
        }
        Ok(false)
    }
    pub fn redo(&mut self, base: u64) -> Result<bool> {
        self.editable(base)?;
        if let Some(after) = self.history.future.pop() {
            self.history.past.push(self.document.clone());
            self.document = after;
            self.revision += 1;
            return Ok(true);
        }
        Ok(false)
    }
    pub fn mark_saved(&mut self, revision: u64) -> bool {
        if revision != self.revision {
            return false;
        }
        self.clean = Identity::new(&self.document, &self.history);
        self.clean_snapshot = self.snapshot();
        true
    }
}
fn retained_bytes(doc: &Document, history: &HistoryState) -> usize {
    let mut pages = HashSet::new();
    let mut photos = HashMap::new();
    let mut bytes = 0;
    for book in history
        .past
        .iter()
        .map(AsRef::as_ref)
        .chain(std::iter::once(doc))
    {
        bytes += serde_json::to_vec(&book.head).map_or(HISTORY_BYTES + 1, |v| v.len() * 3);
        for page in &book.pages {
            if pages.insert(Arc::as_ptr(page)) {
                for source in &page.photos {
                    photos.insert(Arc::as_ptr(source) as *const u8 as usize, source.len() * 2);
                }
                bytes += page.history_bytes;
            }
        }
    }
    bytes + photos.values().sum::<usize>()
}
