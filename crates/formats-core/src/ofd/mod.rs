//! OFD package authority. Resource contents are immutable until an explicit edit.
pub mod codecs;
mod fax;
pub mod metadata;
pub mod render;
pub mod signatures;
pub mod strokes;
pub mod validate;
pub mod write;
pub mod xml;
use crate::{error, Result};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    io::{Cursor, Read, Write},
    sync::Arc,
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

#[derive(Clone)]
pub struct Package {
    source: Option<Arc<[u8]>>,
    zip: Option<ZipArchive<Cursor<Arc<[u8]>>>>,
    names: Vec<String>,
    sizes: BTreeMap<String, u64>,
    changes: BTreeMap<String, Option<Arc<[u8]>>>,
    cache: BTreeMap<String, Arc<[u8]>>,
    cache_bytes: usize,
    max_expanded: u64,
    max_entries: usize,
    revision: u64,
    signed: Option<bool>,
    pending: Option<String>,
}
pub fn resolve_path(base: &str, reference: &str) -> Result<String> {
    let scheme = reference.split_once(':').is_some_and(|(prefix, _)| {
        prefix
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphabetic)
            && prefix
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"+.-".contains(&c))
    });
    if reference.is_empty() || scheme || reference.chars().any(|c| c == '\\' || c < ' ') {
        return Err(error("InvalidPath", "Invalid archive resource path."));
    }
    let mut parts = if reference.starts_with('/') {
        Vec::new()
    } else {
        let mut p = base.split('/').collect::<Vec<_>>();
        p.pop();
        p
    };
    for part in reference.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if parts.pop().is_none() {
                    return Err(error("InvalidPath", "Archive resource escapes its root."));
                }
            }
            _ => parts.push(part),
        }
    }
    Ok(parts.join("/"))
}
pub fn canonical(path: &str) -> Result<()> {
    if resolve_path("", path)? != path {
        return Err(error("InvalidPath", "Package paths must be canonical."));
    }
    Ok(())
}
fn budget(config: &Value, key: &str, default: u64) -> Result<u64> {
    match config.get(key) {
        None => Ok(default),
        Some(v) => v
            .as_u64()
            .filter(|n| *n > 0 && *n <= 9_007_199_254_740_991)
            .ok_or_else(|| {
                error(
                    "LimitExceeded",
                    format!("{key} must be a positive safe integer."),
                )
            }),
    }
}
impl Package {
    /// Detached, immutable-part snapshot suitable for a native save worker.
    /// Caches and ZIP cursors are independent; untouched bytes remain shared.
    pub fn snapshot(&self) -> Self {
        let mut frame = self.clone();
        frame.pending = None;
        frame
    }
    pub fn empty(config: &Value) -> Result<Self> {
        Ok(Self {
            source: None,
            zip: None,
            names: Vec::new(),
            sizes: BTreeMap::new(),
            changes: BTreeMap::new(),
            cache: BTreeMap::new(),
            cache_bytes: 0,
            max_expanded: budget(config, "maxExpandedBytes", 128 * 1024 * 1024)?,
            max_entries: usize::try_from(budget(config, "maxEntries", 10000)?)
                .map_err(|_| error("LimitExceeded", "Entry budget exceeds this platform."))?,
            revision: 0,
            signed: None,
            pending: None,
        })
    }
    pub fn open(bytes: Vec<u8>, config: &Value) -> Result<Self> {
        let max_source = budget(config, "maxSourceBytes", 64 * 1024 * 1024)?;
        if bytes.len() as u64 > max_source {
            return Err(error(
                "LimitExceeded",
                "Document exceeds the source size budget.",
            ));
        }
        let mut p = Self::empty(config)?;
        let source: Arc<[u8]> = bytes.into();
        let mut zip = ZipArchive::new(Cursor::new(source.clone()))
            .map_err(|e| error("InvalidArchive", e.to_string()))?;
        if zip.len() > p.max_entries {
            return Err(error("LimitExceeded", "Too many archive entries."));
        }
        let mut total = 0_u64;
        for i in 0..zip.len() {
            let file = zip
                .by_index_raw(i)
                .map_err(|e| error("InvalidArchive", e.to_string()))?;
            total = total
                .checked_add(file.size())
                .ok_or_else(|| error("LimitExceeded", "Expanded size overflow."))?;
            if total > p.max_expanded {
                return Err(error(
                    "LimitExceeded",
                    "Document exceeds the expanded size budget.",
                ));
            }
            if file.is_dir() {
                continue;
            }
            let name = file.name().to_owned();
            canonical(&name).map_err(|_| {
                error(
                    "InvalidArchive",
                    "Non-canonical archive entry escapes its root.",
                )
            })?;
            if p.sizes.insert(name.clone(), file.size()).is_some() {
                return Err(error(
                    "InvalidArchive",
                    "Non-canonical or duplicate archive entry.",
                ));
            }
            p.names.push(name);
        }
        p.source = Some(source);
        p.zip = Some(zip);
        Ok(p)
    }
    pub fn paths(&self) -> Vec<String> {
        let mut names = self
            .names
            .iter()
            .filter(|n| !matches!(self.changes.get(*n), Some(None)))
            .cloned()
            .collect::<Vec<_>>();
        names.extend(
            self.changes
                .iter()
                .filter(|(n, v)| v.is_some() && !self.sizes.contains_key(*n))
                .map(|(n, _)| n.clone()),
        );
        names
    }
    pub fn has(&self, path: &str) -> bool {
        self.changes
            .get(path)
            .map(|v| v.is_some())
            .unwrap_or_else(|| self.sizes.contains_key(path))
    }
    pub fn read(&mut self, path: &str) -> Result<Vec<u8>> {
        canonical(path)?;
        if let Some(change) = self.changes.get(path) {
            return change
                .as_ref()
                .map(|b| b.to_vec())
                .ok_or_else(|| error("MissingPart", format!("Missing document part: {path}")));
        }
        if let Some(cached) = self.cache.get(path) {
            return Ok(cached.to_vec());
        }
        let expected = *self
            .sizes
            .get(path)
            .ok_or_else(|| error("MissingPart", format!("Missing document part: {path}")))?;
        let zip = self
            .zip
            .as_mut()
            .ok_or_else(|| error("MissingPart", "No archive is open."))?;
        let file = zip
            .by_name(path)
            .map_err(|e| error("InvalidArchive", e.to_string()))?;
        let mut bytes = Vec::new();
        file.take(expected.min(self.max_expanded).saturating_add(1))
            .read_to_end(&mut bytes)
            .map_err(|e| error("InvalidArchive", e.to_string()))?;
        if bytes.len() as u64 != expected {
            return Err(error(
                "InvalidArchive",
                "Archive resource size does not match its directory.",
            ));
        }
        if bytes.len() < 256 * 1024 && self.cache_bytes + bytes.len() <= 16 * 1024 * 1024 {
            self.cache_bytes += bytes.len();
            self.cache.insert(path.into(), bytes.clone().into());
        }
        Ok(bytes)
    }
    pub fn text(&mut self, path: &str) -> Result<String> {
        let bytes = self.read(path)?;
        Ok(crate::text::decode(&bytes, "utf-8", true)?.0)
    }
    pub fn xml(&mut self, path: &str) -> Result<Value> {
        let text = self.text(path)?;
        xml::inspect(&text)
    }
    pub fn state(&self) -> Value {
        json!({"kernel":"rust","paths":self.paths(),"dirty":!self.changes.is_empty(),"revision":self.revision,"cacheBytes":self.cache_bytes})
    }
    pub fn describe(&mut self, options: &Value) -> Result<Vec<Value>> {
        metadata::describe(self, options)
    }
    pub fn begin_edit(&mut self) -> Result<()> {
        if self.signed.is_none() {
            self.signed = Some(
                self.describe(&Value::Null)?
                    .iter()
                    .any(|d| d.get("signatures").is_some()),
            );
        }
        Ok(())
    }
    pub fn prepare_part(&mut self, path: &str) -> Result<()> {
        self.pending = None;
        canonical(path)?;
        if self.source.is_some() {
            self.begin_edit()?;
        }
        self.pending = Some(path.into());
        Ok(())
    }
    pub fn upload(&mut self, bytes: Vec<u8>) -> Result<Value> {
        let path = self
            .pending
            .take()
            .ok_or_else(|| error("InvalidState", "Prepare a part before uploading."))?;
        let mut total = 0_u64;
        let mut entries = 0;
        for name in self.paths() {
            if name != path {
                entries += 1;
                total = total
                    .checked_add(
                        self.changes
                            .get(&name)
                            .and_then(|v| v.as_ref())
                            .map(|b| b.len() as u64)
                            .unwrap_or_else(|| self.sizes[&name]),
                    )
                    .ok_or_else(|| error("LimitExceeded", "Expanded size overflow."))?;
            }
        }
        if entries + 1 > self.max_entries
            || total.saturating_add(bytes.len() as u64) > self.max_expanded
        {
            return Err(error(
                "LimitExceeded",
                "Edited package exceeds the archive budget.",
            ));
        }
        self.changes.insert(path, Some(bytes.into()));
        self.revision += 1;
        Ok(self.state())
    }
    pub fn set(&mut self, path: &str, bytes: Vec<u8>) -> Result<()> {
        self.prepare_part(path)?;
        self.upload(bytes)?;
        Ok(())
    }
    pub fn remove(&mut self, path: &str) -> Result<()> {
        canonical(path)?;
        if self.source.is_some() {
            self.begin_edit()?;
        }
        if !self.has(path) {
            return Err(error(
                "MissingPart",
                format!("Missing document part: {path}"),
            ));
        }
        self.changes.insert(path.into(), None);
        self.revision += 1;
        Ok(())
    }
    pub fn original(&self) -> Result<Vec<u8>> {
        self.source
            .as_ref()
            .map(|s| s.to_vec())
            .ok_or_else(|| error("InvalidState", "No original archive exists."))
    }
    pub fn write(&mut self, allow_invalid_signatures: bool) -> Result<Vec<u8>> {
        if self.changes.is_empty() && self.source.is_some() {
            return self.original();
        }
        if self.signed == Some(true) && !allow_invalid_signatures {
            return Err(error(
                "SignedPackage",
                "Editing a signed OFD requires re-signing or allowInvalidSignatures.",
            ));
        }
        self.describe(&Value::Null)?;
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        for path in self.paths() {
            let bytes = self.read(&path)?;
            zip.start_file(
                &path,
                SimpleFileOptions::default().compression_method(CompressionMethod::Stored),
            )
            .map_err(|e| error("InvalidArchive", e.to_string()))?;
            zip.write_all(&bytes)
                .map_err(|e| error("InvalidArchive", e.to_string()))?;
        }
        Ok(zip
            .finish()
            .map_err(|e| error("InvalidArchive", e.to_string()))?
            .into_inner())
    }
}
