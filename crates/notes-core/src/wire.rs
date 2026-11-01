//! Bounded host projections: each immutable page and each raster crosses the bridge once.
use crate::{codec::visit_photos, history::Document, page::Page, Error, Result};
use serde_json::{json, Map, Value};
use std::{collections::HashSet, sync::Arc};
#[derive(Default)]
pub(crate) struct Wire {
    photos: Vec<(Arc<String>, u64)>,
    pages: Vec<(Arc<Page>, u64)>,
    next_photo: u64,
    next_page: u64,
}
impl Wire {
    pub fn prepare(&mut self, active: &[Arc<Document>], all_frames: bool) -> Value {
        let mut photo_ptrs = HashSet::new();
        let mut page_ptrs = HashSet::new();
        for doc in active {
            for page in &doc.pages {
                page_ptrs.insert(Arc::as_ptr(page) as usize);
                for photo in &page.photos {
                    photo_ptrs.insert(Arc::as_ptr(photo) as *const u8 as usize);
                }
            }
        }
        self.photos
            .retain(|(p, _)| photo_ptrs.contains(&(Arc::as_ptr(p) as *const u8 as usize)));
        self.pages
            .retain(|(p, _)| page_ptrs.contains(&(Arc::as_ptr(p) as usize)));
        let mut photos = Map::new();
        let mut pages = Map::new();
        for doc in if all_frames { active } else { &active[..1] } {
            for page in &doc.pages {
                for photo in &page.photos {
                    if !self.photos.iter().any(|(p, _)| Arc::ptr_eq(p, photo)) {
                        self.next_photo += 1;
                        self.photos.push((photo.clone(), self.next_photo));
                        photos.insert(self.next_photo.to_string(), json!(photo.as_ref()));
                    }
                }
                if !self.pages.iter().any(|(p, _)| Arc::ptr_eq(p, page)) {
                    self.next_page += 1;
                    self.pages.push((page.clone(), self.next_page));
                    pages.insert(
                        self.next_page.to_string(),
                        page.wire(|source| {
                            format!(
                                "@wire-photo:{}",
                                self.photos
                                    .iter()
                                    .find(|(p, _)| Arc::ptr_eq(p, source))
                                    .unwrap()
                                    .1
                            )
                        }),
                    );
                }
            }
        }
        json!({"wireVersion":1,"photos":photos,"pagePool":pages,"keepPhotos":self.photos.iter().map(|(_,id)|id).collect::<Vec<_>>(),"keepPages":self.pages.iter().map(|(_,id)|id).collect::<Vec<_>>()})
    }
    pub fn document(&self, doc: &Document) -> Value {
        let mut head = doc.head.clone();
        head.insert(
            "pages".into(),
            json!(doc
                .pages
                .iter()
                .map(|p| self
                    .pages
                    .iter()
                    .find(|(q, _)| Arc::ptr_eq(p, q))
                    .unwrap()
                    .1)
                .collect::<Vec<_>>()),
        );
        Value::Object(head)
    }
    pub fn expand(&self, request: &mut Value) -> Result<()> {
        let restore = |page: &mut Value| -> Result<()> {
            if let Some(id) = page.as_u64() {
                *page = self
                    .pages
                    .iter()
                    .find(|(_, i)| *i == id)
                    .map(|(p, _)| p.external())
                    .ok_or_else(|| Error::new("MissingPage", "Unknown host page reference."))?;
            }
            let mut error = None;
            visit_photos(page, &mut |value| {
                if let Some(id) = value.as_str().and_then(|s| s.strip_prefix("@wire-photo:")) {
                    if let Some(source) = id
                        .parse::<u64>()
                        .ok()
                        .and_then(|id| self.photos.iter().find(|(_, i)| *i == id))
                    {
                        *value = json!(source.0.as_ref());
                    } else {
                        error = Some(Error::new("MissingPhoto", "Unknown host photo reference."));
                    }
                }
            });
            error.map_or(Ok(()), Err)
        };
        if let Some(page) = request.get_mut("page") {
            restore(page)?;
        }
        if let Some(pages) = request
            .get_mut("document")
            .and_then(|d| d.get_mut("pages"))
            .and_then(Value::as_array_mut)
        {
            for page in pages {
                restore(page)?;
            }
        }
        Ok(())
    }
}
