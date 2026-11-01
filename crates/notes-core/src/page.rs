//! Immutable page storage. Raster strings are interned once, not cloned per history frame.
use crate::{codec::visit_photos, model::*, Result};
use serde::{Serialize, Serializer};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    hash::{Hash, Hasher},
    ops::Deref,
    sync::{Arc, Mutex, OnceLock, Weak},
};
// Keep the large bytes in String's separate heap allocation. Weak<str> would keep
// the raster's inline Arc allocation resident until the cache pruned its weak entry.
type PhotoCache = HashMap<u64, Vec<Weak<String>>>;
static PHOTOS: OnceLock<Mutex<PhotoCache>> = OnceLock::new();
fn intern(source: &str) -> Arc<String> {
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    source.hash(&mut hash);
    let key = hash.finish();
    let mut cache = PHOTOS
        .get_or_init(Default::default)
        .lock()
        .expect("photo cache lock");
    if cache.len() > 1024 && cache.len() % 256 == 0 {
        cache.retain(|_, v| {
            v.retain(|p| p.strong_count() > 0);
            !v.is_empty()
        });
    }
    let bucket = cache.entry(key).or_default();
    bucket.retain(|p| p.strong_count() > 0);
    if let Some(source) = bucket
        .iter()
        .filter_map(Weak::upgrade)
        .find(|p| p.as_ref() == source)
    {
        return source;
    }
    let source = Arc::new(source.to_owned());
    bucket.push(Arc::downgrade(&source));
    source
}
#[derive(Clone, Debug)]
pub struct Page {
    pub(crate) raw: Value,
    pub(crate) photos: Vec<Arc<String>>,
    pub(crate) ids: Vec<String>,
    pub(crate) points: usize,
    pub(crate) elements: usize,
    pub(crate) history_bytes: usize,
}
impl Page {
    pub(crate) fn from_validated(mut value: Value) -> Self {
        let mut photos = Vec::new();
        visit_photos(&mut value, &mut |v| {
            let source = intern(v.as_str().expect("validated raster source"));
            let index = photos.len();
            photos.push(source);
            *v = json!(format!("@native-photo:{index}"));
        });
        let mut ids = vec![value["id"].as_str().unwrap().into()];
        if let Some(bg) = value.get("background") {
            ids.push(bg["id"].as_str().unwrap().into());
        }
        for key in ["scenes", "tapes"] {
            if let Some(items) = value[key].as_array() {
                for item in items {
                    ids.push(item["id"].as_str().unwrap().into());
                }
            }
        }
        let mut points = 0;
        let mut elements = 0;
        for l in value["layers"].as_array().unwrap() {
            ids.push(l["id"].as_str().unwrap().into());
            for e in l["elements"].as_array().unwrap() {
                ids.push(e["id"].as_str().unwrap().into());
                elements += 1;
                if e["kind"] == "stroke" {
                    points += e["points"].as_array().unwrap().len();
                    if let Some(masks) = e["erasures"].as_array() {
                        for mask in masks {
                            points += mask["points"].as_array().unwrap().len();
                        }
                    }
                }
            }
        }
        let history_bytes = serde_json::to_vec(&value).map_or(HISTORY_BYTES + 1, |v| v.len() * 3);
        Self {
            raw: value,
            photos,
            ids,
            points,
            elements,
            history_bytes,
        }
    }
    pub fn photo_sources(&self) -> &[Arc<String>] {
        &self.photos
    }
    pub fn external(&self) -> Value {
        let mut page = self.raw.clone();
        let mut index = 0;
        visit_photos(&mut page, &mut |src| {
            *src = json!(self.photos[index].as_ref());
            index += 1;
        });
        page
    }
    pub(crate) fn wire(&self, mut photo: impl FnMut(&Arc<String>) -> String) -> Value {
        let mut page = self.raw.clone();
        let mut index = 0;
        visit_photos(&mut page, &mut |src| {
            *src = json!(photo(&self.photos[index]));
            index += 1;
        });
        page
    }
}
impl Deref for Page {
    type Target = Value;
    fn deref(&self) -> &Value {
        &self.raw
    }
}
impl PartialEq for Page {
    fn eq(&self, other: &Self) -> bool {
        self.raw == other.raw && self.photos == other.photos
    }
}
impl Serialize for Page {
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        self.external().serialize(s)
    }
}
pub(crate) fn validate_frame(pages: &[Arc<Page>]) -> Result<()> {
    let mut ids = std::collections::HashSet::new();
    let mut points = 0;
    let mut elements = 0;
    require(!pages.is_empty() && pages.len() <= MAX_PAGES)?;
    for page in pages {
        points += page.points;
        elements += page.elements;
        require(points <= MAX_POINTS && elements <= MAX_ELEMENTS)?;
        for id in &page.ids {
            require(ids.insert(id))?;
        }
    }
    Ok(())
}
