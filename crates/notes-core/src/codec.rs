//! Existing .cubenote v1 archive/history interoperability, with bounded decompression.
use crate::{
    history::{Document, HistoryState, SaveSnapshot},
    model::*,
    Error, Result,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    io::{Cursor, Read, Write},
    sync::Arc,
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};
pub fn visit_photos(page: &mut Value, f: &mut impl FnMut(&mut Value)) {
    if let Some(src) = page.get_mut("background").and_then(|v| v.get_mut("src")) {
        f(src);
    }
    if let Some(layers) = page.get_mut("layers").and_then(Value::as_array_mut) {
        for layer in layers {
            if let Some(elements) = layer.get_mut("elements").and_then(Value::as_array_mut) {
                for e in elements {
                    if e["kind"] == "image" {
                        if let Some(src) = e.get_mut("src") {
                            f(src);
                        }
                    }
                }
            }
        }
    }
}
fn sources(doc: &Document) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for page in &doc.pages {
        visit_photos(&mut page.external(), &mut |v| {
            if let Some(s) = v.as_str() {
                if seen.insert(s.to_owned()) {
                    result.push(s.to_owned());
                }
            }
        });
    }
    result
}
#[derive(Clone, Serialize, Deserialize)]
struct Frame {
    title: String,
    pages: Vec<i64>,
}
#[derive(Serialize, Deserialize)]
struct Stored {
    format: String,
    version: u32,
    pages: Vec<Value>,
    past: Vec<Frame>,
    future: Vec<Frame>,
    #[serde(default)]
    photos: HashMap<String, String>,
}
fn history_error() -> Error {
    Error::new(
        "InvalidHistory",
        "Invalid or unsupported notebook undo/redo history.",
    )
}
pub fn decode_history(
    bytes: &[u8],
    document: &Document,
    brushes: &BrushCatalog,
) -> Result<HistoryState> {
    if bytes.len() > HISTORY_BYTES {
        return Err(history_error());
    }
    let mut stored: Stored = serde_json::from_slice(bytes)?;
    if stored.format != "cubeoffice-note-history"
        || stored.version != 1
        || stored.pages.len() > HISTORY_STEPS * MAX_PAGES
        || stored.past.len() + stored.future.len() > HISTORY_STEPS
    {
        return Err(history_error());
    }
    let current = sources(document);
    let mut pool = Vec::new();
    for page in &mut stored.pages {
        let mut missing = false;
        visit_photos(page, &mut |v| {
            if let Some(s) = v.as_str() {
                let source = if let Some(index) = s.strip_prefix("@current-photo:") {
                    index
                        .parse::<usize>()
                        .ok()
                        .and_then(|i| current.get(i))
                        .cloned()
                } else if let Some(index) = s.strip_prefix("@photo:") {
                    stored.photos.get(index).cloned()
                } else {
                    return;
                };
                if let Some(s) = source {
                    *v = Value::String(s);
                } else {
                    missing = true;
                }
            }
        });
        if missing {
            return Err(Error::new(
                "MissingPhoto",
                "Missing notebook history photo.",
            ));
        }
        validate(
            &json!({"format":"cubeoffice-notebook","version":1,"title":"History","pages":[page]}),
            brushes,
        )?;
        pool.push(Arc::new(crate::page::Page::from_validated(page.take())));
    }
    let mut used = HashSet::new();
    let mut restore = |frames: Vec<Frame>| -> Result<Vec<Arc<Document>>> {
        frames
            .into_iter()
            .map(|frame| {
                if frame.title.encode_utf16().count() > 4096
                    || frame.pages.is_empty()
                    || frame.pages.len() > MAX_PAGES
                {
                    return Err(history_error());
                }
                let pages = frame
                    .pages
                    .into_iter()
                    .map(|r| {
                        if r < -(document.pages.len() as i64) || r >= pool.len() as i64 {
                            return Err(history_error());
                        }
                        if r < 0 {
                            document
                                .pages
                                .get((-r - 1) as usize)
                                .cloned()
                                .ok_or_else(history_error)
                        } else {
                            used.insert(r as usize);
                            pool.get(r as usize).cloned().ok_or_else(history_error)
                        }
                    })
                    .collect::<Result<Vec<_>>>()?;
                let head = serde_json::from_value(
                    json!({"format":"cubeoffice-notebook","version":1,"title":frame.title}),
                )?;
                let doc = Document { head, pages };
                crate::page::validate_frame(&doc.pages)?;
                Ok(Arc::new(doc))
            })
            .collect()
    };
    let state = HistoryState {
        past: restore(stored.past)?,
        future: restore(stored.future)?,
    };
    if used.len() != pool.len() {
        return Err(history_error());
    }
    Ok(state)
}
pub fn encode_history(
    document: &Document,
    state: &HistoryState,
    budget: usize,
) -> Result<Option<Vec<u8>>> {
    let budget = budget.min(HISTORY_BYTES);
    if budget < 128 || (state.past.is_empty() && state.future.is_empty()) {
        return Ok(None);
    }
    let current = sources(document);
    let mut images: HashMap<String, String> = HashMap::new();
    let mut photos = HashMap::new();
    let mut ref_page = |page: &Value| -> Value {
        let mut copy = page.clone();
        visit_photos(&mut copy, &mut |src| {
            if let Some(s) = src.as_str() {
                if let Some(i) = current.iter().position(|c| c == s) {
                    *src = json!(format!("@current-photo:{i}"));
                } else {
                    let next = images.len().to_string();
                    let id = images.entry(s.to_owned()).or_insert(next).clone();
                    photos.insert(id.clone(), s.to_owned());
                    *src = json!(format!("@photo:{id}"));
                }
            }
        });
        copy
    };
    let mut keys = HashMap::new();
    for (i, p) in document.pages.iter().enumerate() {
        keys.insert(
            serde_json::to_vec(&ref_page(&p.external()))?,
            -(i as i64) - 1,
        );
    }
    let mut pool = Vec::new();
    let mut uses = Vec::new();
    let mut frame = |doc: &Document| -> Result<Frame> {
        let mut pages = Vec::new();
        for p in &doc.pages {
            let value = ref_page(&p.external());
            let key = serde_json::to_vec(&value)?;
            let i = if let Some(i) = keys.get(&key) {
                *i
            } else {
                let i = pool.len() as i64;
                keys.insert(key, i);
                pool.push(value);
                uses.push(0usize);
                i
            };
            if i >= 0 {
                uses[i as usize] += 1;
            }
            pages.push(i);
        }
        Ok(Frame {
            title: doc.title().as_str().unwrap().into(),
            pages,
        })
    };
    let mut past = state
        .past
        .iter()
        .map(|d| frame(d))
        .collect::<Result<Vec<_>>>()?;
    let mut future = state
        .future
        .iter()
        .map(|d| frame(d))
        .collect::<Result<Vec<_>>>()?;
    // Remove farthest frames first. Pool entries and photo sources are emitted only when referenced.
    loop {
        if past.is_empty() && future.is_empty() {
            return Ok(None);
        }
        let mut selected = Vec::new();
        let mut remap = HashMap::new();
        let mut selected_photos = HashMap::new();
        for (i, p) in pool.iter().enumerate() {
            if uses[i] > 0 {
                remap.insert(i as i64, selected.len() as i64);
                let mut p = p.clone();
                visit_photos(&mut p, &mut |v| {
                    if let Some(id) = v.as_str().and_then(|s| s.strip_prefix("@photo:")) {
                        if let Some(src) = photos.get(id) {
                            selected_photos.insert(id.into(), src.clone());
                        }
                    }
                });
                selected.push(p);
            }
        }
        let remap_frames = |frames: &[Frame]| {
            frames
                .iter()
                .map(|f| Frame {
                    title: f.title.clone(),
                    pages: f
                        .pages
                        .iter()
                        .map(|i| if *i < 0 { *i } else { remap[i] })
                        .collect(),
                })
                .collect()
        };
        let stored = Stored {
            format: "cubeoffice-note-history".into(),
            version: 1,
            pages: selected,
            past: remap_frames(&past),
            future: remap_frames(&future),
            photos: selected_photos,
        };
        let bytes = serde_json::to_vec(&stored)?;
        if past.len() + future.len() <= HISTORY_STEPS && bytes.len() <= budget {
            return Ok(Some(bytes));
        }
        let stack = if past.len() >= future.len() {
            &mut past
        } else {
            &mut future
        };
        let removed = stack.remove(0);
        for i in removed.pages {
            if i >= 0 {
                uses[i as usize] -= 1;
            }
        }
    }
}
pub fn read(bytes: &[u8], brushes: &BrushCatalog) -> Result<(Document, HistoryState)> {
    read_named(bytes, "Imported notebook", brushes)
}
pub fn read_named(
    bytes: &[u8],
    title: &str,
    brushes: &BrushCatalog,
) -> Result<(Document, HistoryState)> {
    if bytes.len() > MAX_BYTES {
        return Err(Error::new(
            "LimitExceeded",
            "Notebook exceeds the 64 MB editing limit.",
        ));
    }
    if !bytes.starts_with(b"PK") {
        return Ok((
            crate::xopp::read(bytes, title, brushes)?,
            HistoryState::default(),
        ));
    }
    // Check the advertised entry count before the ZIP parser allocates its index.
    let eocd = bytes.len().saturating_sub(65_557)..bytes.len().saturating_sub(21);
    let footer = eocd.rev().find(|i| {
        bytes.get(*i..*i + 4) == Some(b"PK\x05\x06")
            && *i + 22 + u16::from_le_bytes([bytes[*i + 20], bytes[*i + 21]]) as usize
                == bytes.len()
    });
    let footer =
        footer.ok_or_else(|| Error::new("InvalidArchive", "Missing notebook ZIP directory."))?;
    if u16::from_le_bytes([bytes[footer + 10], bytes[footer + 11]]) > 20 {
        return Err(Error::new(
            "InvalidArchive",
            "Invalid or oversized notebook archive.",
        ));
    }
    let mut zip = ZipArchive::new(Cursor::new(bytes))?;
    if zip.len() > 20 {
        return Err(Error::new(
            "InvalidArchive",
            "Invalid or oversized notebook archive.",
        ));
    }
    let mut files = HashMap::new();
    let mut expanded = 0;
    for i in 0..zip.len() {
        let file = zip.by_index(i)?;
        if file.size() > MAX_BYTES as u64 {
            return Err(Error::new(
                "LimitExceeded",
                "Invalid or oversized notebook archive.",
            ));
        }
        let name = file.name().to_owned();
        if !["mimetype", "notebook.json", "history.json", "content.xml"].contains(&name.as_str()) {
            continue;
        }
        let limit = if name == "history.json" {
            HISTORY_BYTES
        } else {
            MAX_BYTES
        };
        if name != "mimetype" {
            expanded += file.size() as usize;
        }
        if expanded > MAX_BYTES || file.size() > limit as u64 || files.contains_key(&name) {
            return Err(Error::new(
                "InvalidArchive",
                "Invalid, duplicate or oversized notebook entry.",
            ));
        }
        let mut data = Vec::new();
        file.take(limit as u64 + 1).read_to_end(&mut data)?;
        if data.len() > limit {
            return Err(Error::new(
                "LimitExceeded",
                "Expanded notebook exceeds its editing limit.",
            ));
        }
        files.insert(name, data);
    }
    if files.get("mimetype").map(Vec::as_slice) != Some(MIME.as_bytes()) {
        if let Some(content) = files.get("content.xml") {
            return Ok((
                crate::xopp::read(content, title, brushes)?,
                HistoryState::default(),
            ));
        }
        return Err(Error::new(
            "InvalidArchive",
            "This is not a CubeOffice notebook archive.",
        ));
    }
    let bytes = files
        .get("notebook.json")
        .ok_or_else(|| Error::new("InvalidArchive", "Missing notebook.json."))?;
    let doc = Document::from_value(crate::parse(bytes)?, brushes)?;
    let history = if let Some(bytes) = files.get("history.json") {
        decode_history(bytes, &doc, brushes)?
    } else {
        HistoryState::default()
    };
    Ok((doc, history))
}
pub fn write(snapshot: &SaveSnapshot, brushes: &BrushCatalog) -> Result<Vec<u8>> {
    validate(&snapshot.document.value(), brushes)?;
    let content = serde_json::to_vec(&snapshot.document)?;
    if content.len() > MAX_BYTES {
        return Err(Error::new(
            "LimitExceeded",
            "Notebook exceeds the 64 MB editing limit.",
        ));
    }
    let history = encode_history(
        &snapshot.document,
        &snapshot.history,
        MAX_BYTES - content.len(),
    )?;
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    zip.start_file(
        "mimetype",
        SimpleFileOptions::default().compression_method(CompressionMethod::Stored),
    )?;
    zip.write_all(MIME.as_bytes())?;
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .compression_level(Some(6));
    zip.start_file("notebook.json", options)?;
    zip.write_all(&content)?;
    if let Some(history) = history {
        zip.start_file("history.json", options)?;
        zip.write_all(&history)?;
    }
    let bytes = zip.finish()?.into_inner();
    if bytes.len() > MAX_BYTES {
        return Err(Error::new(
            "LimitExceeded",
            "Notebook archive exceeds the 64 MB editing limit.",
        ));
    }
    Ok(bytes)
}
