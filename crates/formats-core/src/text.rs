use crate::{error, Result};
use encoding_rs::{Encoding, UTF_16BE, UTF_16LE, UTF_8};
use ropey::Rope;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, VecDeque},
    sync::Arc,
};

pub const MAX_BYTES: usize = 8 * 1024 * 1024;
const HISTORY_BYTES: usize = 32 * 1024 * 1024;
#[derive(Clone)]
struct Snapshot {
    unchanged: bool,
    doc: Rope,
    original: Arc<[u8]>,
    clean: Rope,
}
#[derive(Clone)]
struct Frame {
    doc: Rope,
    selection: Value,
}
pub struct TextSession {
    doc: Rope,
    clean: Rope,
    original: Arc<[u8]>,
    encoding: &'static Encoding,
    bom: bool,
    separator: String,
    revision: u64,
    dirty: bool,
    past: VecDeque<Frame>,
    future: Vec<Frame>,
    selection: Value,
    group: Option<String>,
    snapshots: HashMap<u64, Snapshot>,
    next: u64,
    ack: u64,
    export: Option<u64>,
    chunk: Option<Vec<u8>>,
    readonly: bool,
    limit: usize,
}
pub fn decode(bytes: &[u8], label: &str, fatal: bool) -> Result<(String, &'static Encoding, bool)> {
    let (encoding, bom, skip) = if bytes.starts_with(&[239, 187, 191]) {
        (UTF_8, true, 3)
    } else if bytes.starts_with(&[255, 254]) {
        (UTF_16LE, true, 2)
    } else if bytes.starts_with(&[254, 255]) {
        (UTF_16BE, true, 2)
    } else {
        (
            Encoding::for_label(label.as_bytes())
                .ok_or_else(|| error("InvalidEncoding", "Unknown text encoding."))?,
            false,
            0,
        )
    };
    let (text, malformed) = encoding.decode_without_bom_handling(&bytes[skip..]);
    if fatal && malformed {
        return Err(error("InvalidEncoding", "Invalid encoded text."));
    }
    Ok((text.into_owned(), encoding, bom))
}
pub fn decode_request(r: &Value) -> Result<Value> {
    let bytes = r["bytes"]
        .as_array()
        .ok_or_else(|| error("InvalidArgument", "Missing bytes."))?;
    if bytes.len() > MAX_BYTES {
        return Err(error("LimitExceeded", "Text decode budget exceeded."));
    }
    let bytes = bytes
        .iter()
        .map(|b| {
            b.as_u64()
                .filter(|n| *n <= 255)
                .map(|n| n as u8)
                .ok_or_else(|| error("InvalidArgument", "Invalid byte."))
        })
        .collect::<Result<Vec<_>>>()?;
    let (text, encoding, bom) = decode(
        &bytes,
        r["encoding"].as_str().unwrap_or("utf-8"),
        r["fatal"] != false,
    )?;
    if r["binaryCheck"] != false && text.contains('\0') {
        return Err(error("BinaryData", "The file contains binary data."));
    }
    Ok(json!({"text":text,"encoding":encoding.name().to_lowercase(),"bom":bom}))
}
fn same(a: &Rope, b: &Rope) -> bool {
    a.is_instance(b) || (a.len_bytes() == b.len_bytes() && a == b)
}
fn normalized(s: &str) -> String {
    s.replace("\r\n", "\n").replace('\r', "\n")
}
/// Decode a bounded host range. Whole-file offsets remain u64 on wasm32.
pub fn decode_page(bytes: &[u8], r: &Value) -> Result<Value> {
    if bytes.len() > 64 * 1024 * 1024 {
        return Err(error("LimitExceeded", "Text decode budget exceeded."));
    }
    let head = r["head"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|n| n.as_u64().map(|b| b as u8))
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| bytes[..bytes.len().min(4)].to_vec());
    let label = r["encoding"].as_str().unwrap_or("utf-8");
    let (_, encoding, _) = decode(&head, label, false)?;
    let read_start = r["readStart"].as_u64().unwrap_or(0);
    let offset = r["offset"].as_u64().unwrap_or(0);
    let size = r["size"].as_u64().unwrap_or(bytes.len() as u64);
    let paged = r["paged"] == true;
    let prefix = r["prefix"] == true;
    let utf16 = encoding == UTF_16LE || encoding == UTF_16BE;
    if paged && !utf16 && encoding != UTF_8 {
        return Err(error(
            "UnsupportedEncoding",
            "Paged browsing supports UTF-8 and UTF-16. Convert other encodings to UTF-8 first.",
        ));
    }
    let start_at = if utf16 && paged {
        offset - offset % 2
    } else {
        offset
    };
    let mut start = start_at
        .checked_sub(read_start)
        .and_then(|n| usize::try_from(n).ok())
        .filter(|n| *n <= bytes.len())
        .ok_or_else(|| error("InvalidRange", "Invalid text range."))?;
    let budget = r["budget"]
        .as_u64()
        .unwrap_or(bytes.len() as u64)
        .min(bytes.len() as u64) as usize;
    let mut end = (start + budget).min(bytes.len());
    if paged || prefix {
        if utf16 {
            let word = |i: usize| {
                if encoding == UTF_16LE {
                    u16::from_le_bytes([bytes[i], bytes[i + 1]])
                } else {
                    u16::from_be_bytes([bytes[i], bytes[i + 1]])
                }
            };
            if read_start + start as u64 > 0
                && start + 1 < bytes.len()
                && (0xdc00..=0xdfff).contains(&word(start))
            {
                start += 2;
            }
            if read_start + (end as u64) < size {
                end -= end % 2;
                if end >= 2 && (0xd800..=0xdbff).contains(&word(end - 2)) {
                    end -= 2;
                }
            }
        } else if encoding == UTF_8 {
            let original = start;
            while start < bytes.len() && start < original + 4 && bytes[start] & 0xc0 == 0x80 {
                start += 1;
            }
            if start == original + 4 {
                return Err(error(
                    "InvalidEncoding",
                    "Invalid UTF-8 at this file position.",
                ));
            }
            if read_start + (end as u64) < size {
                while end > start && end < bytes.len() && bytes[end] & 0xc0 == 0x80 {
                    end -= 1;
                }
            }
        }
    }
    if start > end {
        return Err(error("InvalidRange", "Invalid Unicode range."));
    }
    let label = encoding.name().to_lowercase();
    let text = if prefix && read_start + (end as u64) < size {
        let mut decoder = encoding.new_decoder_with_bom_removal();
        let mut output = String::with_capacity((end - start) * 4 + 16);
        let (result, _) =
            decoder.decode_to_string_without_replacement(&bytes[start..end], &mut output, false);
        if matches!(result, encoding_rs::DecoderResult::Malformed(..)) {
            return Err(error("InvalidEncoding", "Invalid encoded text."));
        }
        output
    } else if read_start + start as u64 == 0 {
        decode(&bytes[start..end], &label, true)?.0
    } else {
        let (value, malformed) = encoding.decode_without_bom_handling(&bytes[start..end]);
        if malformed {
            return Err(error("InvalidEncoding", "Invalid encoded text."));
        }
        value.into_owned()
    };
    if r["binaryCheck"] != false && text.contains('\0') {
        return Err(error("BinaryData", "The file contains binary data."));
    }
    let line_count = normalized(&text).split('\n').count();
    Ok(
        json!({"text":text,"start":read_start+start as u64,"end":read_start+end as u64,"size":size,"encoding":label,"lineCount":line_count}),
    )
}
impl TextSession {
    pub fn open(bytes: Vec<u8>, label: &str) -> Result<Self> {
        Self::open_with_limit(bytes, label, MAX_BYTES)
    }
    pub fn open_with_limit(bytes: Vec<u8>, label: &str, limit: usize) -> Result<Self> {
        if bytes.len() > limit {
            return Err(error(
                "LimitExceeded",
                "File exceeds the editing budget; use paged browsing.",
            ));
        }
        let (text, encoding, bom) = decode(&bytes, label, true)?;
        if text.contains('\0') {
            return Err(error("BinaryData", "The file contains binary data."));
        }
        let separator = text
            .find(['\r', '\n'])
            .map(|i| {
                if text[i..].starts_with("\r\n") {
                    "\r\n"
                } else {
                    &text[i..i + 1]
                }
            })
            .unwrap_or("\n")
            .to_owned();
        let doc = Rope::from_str(&normalized(&text));
        Ok(Self {
            clean: doc.clone(),
            doc,
            original: bytes.into(),
            encoding,
            bom,
            separator,
            revision: 0,
            dirty: false,
            past: VecDeque::new(),
            future: Vec::new(),
            snapshots: HashMap::new(),
            next: 0,
            ack: 0,
            export: None,
            chunk: None,
            readonly: false,
            limit,
            selection: Value::Null,
            group: None,
        })
    }
    fn dirty(&self) -> bool {
        self.dirty
    }
    pub fn projection(&self) -> Value {
        json!({"kernel":"rust","revision":self.revision,"dirty":self.dirty(),"readonly":self.readonly,"encoding":self.encoding.name().to_lowercase(),"lineSeparator":self.separator,"length":self.doc.len_utf16_cu(),"lines":self.doc.len_lines(),"canUndo":!self.past.is_empty(),"canRedo":!self.future.is_empty(),"selection":self.selection})
    }
    fn guard(&self) -> Result<()> {
        if self.readonly {
            Err(error("ReadOnly", "The text session is read-only."))
        } else {
            Ok(())
        }
    }
    fn install(&mut self, doc: Rope) {
        if same(&doc, &self.doc) {
            return;
        }
        self.past.push_back(Frame {
            doc: self.doc.clone(),
            selection: self.selection.clone(),
        });
        self.future.clear();
        while self.past.len() > 200
            || (self.past.iter().map(|f| f.doc.len_bytes()).sum::<usize>() > HISTORY_BYTES
                && self.past.len() > 1)
        {
            self.past.pop_front();
        }
        self.doc = doc;
        self.dirty = !same(&self.doc, &self.clean);
        self.group = None;
        self.revision += 1;
    }
    fn validate_selection(doc: &Rope, selection: &Value) -> Result<()> {
        if selection.is_null() {
            return Ok(());
        }
        let ranges = selection["ranges"]
            .as_array()
            .filter(|r| !r.is_empty() && r.len() <= 10000)
            .ok_or_else(|| error("InvalidRange", "Invalid selection."))?;
        if selection["main"].as_u64().unwrap_or(0) >= ranges.len() as u64 {
            return Err(error("InvalidRange", "Invalid primary selection."));
        }
        for r in ranges {
            for key in ["anchor", "head"] {
                let offset = r[key]
                    .as_u64()
                    .ok_or_else(|| error("InvalidRange", "Invalid selection position."))?;
                Self::char_offset(
                    doc,
                    usize::try_from(offset)
                        .map_err(|_| error("InvalidRange", "Selection position overflow."))?,
                )?;
            }
        }
        Ok(())
    }
    fn char_offset(doc: &Rope, offset: usize) -> Result<usize> {
        if offset > doc.len_utf16_cu() {
            return Err(error(
                "InvalidRange",
                "Text position is outside the document.",
            ));
        }
        let at = doc.utf16_cu_to_char(offset);
        if doc.char_to_utf16_cu(at) != offset {
            return Err(error(
                "InvalidRange",
                "Text position splits a Unicode character.",
            ));
        }
        Ok(at)
    }
    pub fn request(&mut self, r: Value) -> Result<Value> {
        let history_before =
            matches!(r["op"].as_str(), Some("undo" | "redo")).then(|| self.doc.clone());
        match r["op"].as_str().unwrap_or("") {
            "state" => {}
            "readonly" => self.readonly = r["value"] == true,
            "text" => {
                return Ok(json!({"text":self.doc.to_string().replace('\n',&self.separator)}))
            }
            "prefix" => {
                let len =
                    (r["length"].as_u64().unwrap_or(24000) as usize).min(self.doc.len_utf16_cu());
                let at = self.doc.utf16_cu_to_char(len);
                return Ok(
                    json!({"text":self.doc.slice(..at).to_string().replace('\n',&self.separator)}),
                );
            }
            "set" => {
                self.guard()?;
                let text = r["text"]
                    .as_str()
                    .ok_or_else(|| error("InvalidArgument", "Missing text."))?;
                if text.len() > self.limit {
                    return Err(error("LimitExceeded", "Text exceeds the editing budget."));
                }
                self.install(Rope::from_str(&normalized(text)));
            }
            "changes" => {
                self.guard()?;
                let changes = r["changes"]
                    .as_array()
                    .ok_or_else(|| error("InvalidArgument", "Missing changes."))?;
                let mut edits = Vec::new();
                let mut previous = 0;
                for c in changes {
                    let from = c["from"]
                        .as_u64()
                        .ok_or_else(|| error("InvalidRange", "Missing range."))?
                        as usize;
                    let to = c["to"]
                        .as_u64()
                        .ok_or_else(|| error("InvalidRange", "Missing range."))?
                        as usize;
                    if from < previous || to < from {
                        return Err(error(
                            "InvalidRange",
                            "Changes must be ordered and disjoint.",
                        ));
                    }
                    previous = to;
                    let insert = normalized(
                        c["insert"]
                            .as_str()
                            .ok_or_else(|| error("InvalidArgument", "Missing insertion."))?,
                    );
                    edits.push((
                        Self::char_offset(&self.doc, from)?,
                        Self::char_offset(&self.doc, to)?,
                        insert,
                    ));
                }
                let mut doc = self.doc.clone();
                for (from, to, insert) in edits.into_iter().rev() {
                    doc.remove(from..to);
                    doc.insert(from, &insert);
                }
                if doc.len_bytes() > self.limit {
                    return Err(error("LimitExceeded", "Text exceeds the editing budget."));
                }
                if r["validateOnly"] == true {
                    return Ok(self.projection());
                }
                let before = r
                    .get("selectionBefore")
                    .cloned()
                    .unwrap_or(self.selection.clone());
                let after = r.get("selectionAfter").cloned().unwrap_or(Value::Null);
                Self::validate_selection(&self.doc, &before)?;
                Self::validate_selection(&doc, &after)?;
                let group = r["group"].as_str().map(str::to_string);
                let merge = group.is_some()
                    && self.group == group
                    && self.future.is_empty()
                    && self.selection == before;
                self.selection = before;
                if merge && !same(&doc, &self.doc) {
                    self.doc = doc;
                    self.dirty = !same(&self.doc, &self.clean);
                    self.revision += 1;
                } else {
                    self.install(doc);
                }
                self.selection = after;
                self.group = group;
            }
            "undo" => {
                self.guard()?;
                if let Some(doc) = self.past.pop_back() {
                    self.future.push(Frame {
                        doc: self.doc.clone(),
                        selection: self.selection.clone(),
                    });
                    self.doc = doc.doc;
                    self.dirty = !same(&self.doc, &self.clean);
                    self.selection = doc.selection;
                    self.group = None;
                    self.revision += 1;
                }
            }
            "redo" => {
                self.guard()?;
                if let Some(doc) = self.future.pop() {
                    self.past.push_back(Frame {
                        doc: self.doc.clone(),
                        selection: self.selection.clone(),
                    });
                    self.doc = doc.doc;
                    self.dirty = !same(&self.doc, &self.clean);
                    self.selection = doc.selection;
                    self.group = None;
                    self.revision += 1;
                }
            }
            "snapshot" => {
                if self.snapshots.len() >= 8 {
                    return Err(error("LimitExceeded", "Too many pending text saves."));
                }
                self.next += 1;
                self.snapshots.insert(
                    self.next,
                    Snapshot {
                        unchanged: !self.dirty,
                        doc: self.doc.clone(),
                        clean: self.clean.clone(),
                        original: self.original.clone(),
                    },
                );
                return Ok(json!({"token":self.next}));
            }
            "encodeSnapshot" => {
                let token = r["token"].as_u64().unwrap_or(0);
                if !self.snapshots.contains_key(&token) {
                    return Err(error("InvalidState", "Unknown save snapshot."));
                }
                self.export = Some(token);
                self.chunk = None;
            }
            "encodeChunk" => {
                let token = r["token"].as_u64().unwrap_or(0);
                let s = self
                    .snapshots
                    .get(&token)
                    .ok_or_else(|| error("InvalidState", "Unknown save snapshot."))?;
                let from = r["from"]
                    .as_u64()
                    .and_then(|n| usize::try_from(n).ok())
                    .ok_or_else(|| error("InvalidRange", "Invalid encode position."))?;
                let unchanged = s.unchanged;
                let length = if unchanged {
                    s.original.len()
                } else {
                    s.doc.len_chars()
                };
                if from > length {
                    return Err(error(
                        "InvalidRange",
                        "Encode position is past the snapshot.",
                    ));
                }
                let next = (from + 256 * 1024).min(length);
                let chunk = if unchanged {
                    s.original[from..next].to_vec()
                } else {
                    let part = Rope::from(s.doc.slice(from..next));
                    self.encode_content(&part, from == 0)?
                };
                self.export = Some(token);
                self.chunk = Some(chunk);
                return Ok(json!({"next":next,"done":next==length}));
            }
            "acknowledge" => {
                let token = r["token"].as_u64().unwrap_or(0);
                if token < self.ack {
                    return Err(error(
                        "StaleSave",
                        "An older save cannot acknowledge newer persisted content.",
                    ));
                }
                let s = self
                    .snapshots
                    .get(&token)
                    .ok_or_else(|| error("InvalidState", "Unknown save snapshot."))?;
                let original = self.encode_doc(&s.doc, &s.clean, &s.original)?;
                self.clean = s.doc.clone();
                self.dirty = !same(&self.doc, &self.clean);
                self.original = original.into();
                self.ack = token;
            }
            "release" => {
                let token = r["token"].as_u64().unwrap_or(0);
                self.snapshots.remove(&token);
                if self.export == Some(token) {
                    self.export = None;
                    self.chunk = None;
                }
            }
            _ => return Err(error("InvalidArgument", "Unknown text operation.")),
        }
        let mut projection = self.projection();
        if let Some(before) = history_before.filter(|b| b != &self.doc) {
            let prefix = before
                .chars()
                .zip(self.doc.chars())
                .take_while(|(a, b)| a == b)
                .count();
            let suffix = before
                .chars()
                .reversed()
                .zip(self.doc.chars().reversed())
                .take(before.len_chars().min(self.doc.len_chars()) - prefix)
                .take_while(|(a, b)| a == b)
                .count();
            projection["patch"] = json!({"from":before.char_to_utf16_cu(prefix),"to":before.char_to_utf16_cu(before.len_chars()-suffix),"insert":self.doc.slice(prefix..self.doc.len_chars()-suffix).to_string()});
        }
        Ok(projection)
    }
    fn encode_doc(&self, doc: &Rope, clean: &Rope, original: &[u8]) -> Result<Vec<u8>> {
        if same(doc, clean) {
            return Ok(original.to_vec());
        }
        self.encode_content(doc, true)
    }
    fn encode_content(&self, doc: &Rope, include_bom: bool) -> Result<Vec<u8>> {
        let mut output = Vec::new();
        let utf16 = self.encoding == UTF_16LE || self.encoding == UTF_16BE;
        if !utf16 && self.encoding != UTF_8 {
            return Err(error(
                "UnsupportedEncoding",
                format!(
                    "Editing {} files is not supported; convert the file to UTF-8 first.",
                    self.encoding.name().to_lowercase()
                ),
            ));
        }
        if self.bom && include_bom {
            output.extend_from_slice(if self.encoding == UTF_16LE {
                &[255, 254]
            } else if self.encoding == UTF_16BE {
                &[254, 255]
            } else {
                &[239, 187, 191]
            });
        }
        for chunk in doc.chunks() {
            let chunk = chunk.replace('\n', &self.separator);
            if utf16 {
                for word in chunk.encode_utf16() {
                    output.extend_from_slice(&if self.encoding == UTF_16LE {
                        word.to_le_bytes()
                    } else {
                        word.to_be_bytes()
                    });
                }
            } else {
                output.extend_from_slice(chunk.as_bytes());
            }
        }
        Ok(output)
    }
    pub fn encode(&self) -> Result<Vec<u8>> {
        if let Some(chunk) = &self.chunk {
            return Ok(chunk.clone());
        }
        if let Some(token) = self.export {
            let s = self
                .snapshots
                .get(&token)
                .ok_or_else(|| error("InvalidState", "Unknown save snapshot."))?;
            self.encode_doc(&s.doc, &s.clean, &s.original)
        } else {
            self.encode_doc(&self.doc, &self.clean, &self.original)
        }
    }
}
