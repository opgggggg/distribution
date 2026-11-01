//! Detached mobile PDF commands using the pinned upstream Rust object model.
mod image;
use crate::{error, Result};
use pdf_core::{
    object::{File, Object, Ref},
    Document,
};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
pub(super) fn map(e: pdf_core::Error) -> office_browser_abi::KernelError {
    error(&e.code, e.message)
}
fn invalid(message: &str) -> office_browser_abi::KernelError {
    error("InvalidArgument", message)
}
fn dict(object: &Object) -> Result<BTreeMap<String, Object>> {
    match object {
        Object::Dict(d) | Object::Stream { dict: d, .. } => Ok(d.clone()),
        _ => Err(invalid("Invalid PDF dictionary.")),
    }
}
fn allocate(file: &mut File, object: Object) -> Result<Ref> {
    let number = file
        .objects
        .keys()
        .next_back()
        .map_or(1, |r| r.0.saturating_add(1));
    if number > 1_000_000 {
        return Err(error("LimitExceeded", "PDF object limit exceeded."));
    }
    let reference = (number, 0);
    file.set(reference, object);
    Ok(reference)
}
fn inherited(file: &File, page: &Object, key: &str) -> Result<Object> {
    let mut node = page;
    let mut seen = BTreeSet::new();
    for _ in 0..128 {
        if !matches!(node.get(key), Object::Null) {
            return Ok(node.get(key).clone());
        }
        let parent = node.get("Parent");
        if matches!(parent, Object::Null) {
            return Ok(Object::Null);
        }
        if let Some(r) = parent.reference() {
            if !seen.insert(r) {
                return Err(invalid("Cyclic PDF page ancestors."));
            }
        }
        node = file.resolve(parent);
    }
    Err(error("LimitExceeded", "PDF page ancestor limit exceeded."))
}
fn page_index(page: &Value, count: usize, message: &str) -> Result<usize> {
    page.as_u64()
        .filter(|n| *n >= 1 && *n <= count as u64)
        .map(|n| n as usize - 1)
        .ok_or_else(|| invalid(message))
}
fn editable(file: &File) -> Result<()> {
    if !matches!(file.trailer.get("Encrypt"), Object::Null) {
        return Err(error(
            "NotSupported",
            "Editing encrypted PDF documents is not supported.",
        ));
    }
    Ok(())
}
fn save(mut file: File) -> Result<Vec<u8>> {
    // Sweep unreachable objects before the detached rewrite, so removed content
    // is not retained merely because it existed in an earlier source revision.
    // File::save retains opaque trailer extensions as well as Root/Info. Their
    // references must survive the sweep too, rather than becoming dangling.
    let mut stack = vec![&file.trailer];
    let mut live = BTreeSet::new();
    while let Some(object) = stack.pop() {
        match object {
            Object::Reference(r) => {
                if live.insert(*r) {
                    if live.len() > 1_000_000 {
                        return Err(error("LimitExceeded", "PDF object limit exceeded."));
                    }
                    if let Some(o) = file.objects.get(r) {
                        stack.push(o);
                    }
                }
            }
            Object::Array(a) => stack.extend(a),
            Object::Dict(d) | Object::Stream { dict: d, .. } => stack.extend(d.values()),
            _ => {}
        }
    }
    file.objects.retain(|r, _| live.contains(r));
    let output = file.save().map_err(map)?;
    if output.len() > 128 * 1024 * 1024 {
        return Err(error(
            "LimitExceeded",
            "PDF output exceeds its size budget.",
        ));
    }
    Ok(output)
}
fn pages(document: &Document, operation: &Value) -> Result<Vec<u8>> {
    editable(&document.file)?;
    let count = document.pages.len();
    let index = page_index(&operation["page"], count, "页码超出范围。")?;
    let kind = operation["type"].as_str().unwrap_or("");
    if kind == "delete" && count == 1 {
        return Err(invalid("至少需要保留一页。"));
    }
    let target = if kind == "move" {
        Some(page_index(
            &operation["target"],
            count,
            "目标页码超出范围。",
        )?)
    } else {
        None
    };
    if !["rotate", "delete", "move"].contains(&kind) {
        return Err(invalid("Unknown PDF page operation."));
    }
    let mut file = document.file.clone();
    if kind == "rotate" {
        if let Some(reference) = document.pages[index].reference {
            let mut page = dict(&document.pages[index].object)?;
            let angle = file
                .resolve(&inherited(&file, &document.pages[index].object, "Rotate")?)
                .number();
            page.insert("Rotate".into(), Object::Number((angle + 90.0) % 360.0));
            file.set(reference, Object::Dict(page));
            return save(file);
        }
    }
    // Flatten only the page tree. Materialize inherited values before moving a
    // leaf to its new parent; catalog/form/tag/annotation objects keep identity.
    let root = file
        .trailer
        .get("Root")
        .reference()
        .ok_or_else(|| invalid("Missing PDF catalog reference."))?;
    let mut catalog = dict(file.root())?;
    let tree = allocate(&mut file, Object::Dict(BTreeMap::new()))?;
    let mut refs = Vec::new();
    for (i, page) in document.pages.iter().enumerate() {
        let mut d = dict(&page.object)?;
        for key in ["MediaBox", "CropBox", "Resources", "Rotate"] {
            if matches!(page.object.get(key), Object::Null) {
                let value = inherited(&document.file, &page.object, key)?;
                if !matches!(value, Object::Null) {
                    d.insert(key.into(), value);
                }
            }
        }
        d.insert("Parent".into(), Object::Reference(tree));
        if kind == "rotate" && i == index {
            let angle = file
                .resolve(d.get("Rotate").unwrap_or(&Object::Null))
                .number();
            d.insert("Rotate".into(), Object::Number((angle + 90.0) % 360.0));
        }
        let r = if let Some(r) = page.reference {
            file.set(r, Object::Dict(d));
            r
        } else {
            allocate(&mut file, Object::Dict(d))?
        };
        refs.push(Object::Reference(r));
    }
    if kind == "delete" {
        refs.remove(index);
    } else if let Some(target) = target {
        let page = refs.remove(index);
        refs.insert(target, page);
    }
    file.set(
        tree,
        Object::Dict(BTreeMap::from([
            ("Type".into(), Object::Name("Pages".into())),
            ("Count".into(), Object::Number(refs.len() as f64)),
            ("Kids".into(), Object::Array(refs)),
        ])),
    );
    catalog.insert("Pages".into(), Object::Reference(tree));
    file.set(root, Object::Dict(catalog));
    save(file)
}
pub struct Session {
    document: Document,
    image: Option<image::Image>,
}
impl Session {
    pub fn image_pages(bytes: &[u8]) -> Result<Self> {
        let output = image::pages_frame(bytes)?;
        Self::open(output, None)
    }
    pub fn open(bytes: Vec<u8>, mime: Option<&str>) -> Result<Self> {
        if bytes.len() > 128 * 1024 * 1024 {
            return Err(error("LimitExceeded", "PDF input exceeds its size budget."));
        }
        let bytes = if let Some(mime) = mime {
            image::document(&bytes, mime)?
        } else {
            bytes
        };
        Ok(Self {
            document: Document::open(&bytes).map_err(map)?,
            image: None,
        })
    }
    pub fn state(&self) -> Value {
        json!({"kernel":"rust","pageCount":self.document.pages.len()})
    }
    pub fn upload_image(&mut self, bytes: &[u8]) -> Result<Value> {
        let image = image::Image::read(bytes, "image/png")?;
        self.image = Some(image);
        Ok(json!({"uploaded":true}))
    }
    pub fn request(&mut self, r: &Value) -> Result<Value> {
        let output = match r["op"].as_str() {
            Some("pageOperation") => pages(&self.document, &r["operation"])?,
            Some("signature") => image::signature(
                &self.document,
                self.image
                    .as_ref()
                    .ok_or_else(|| invalid("Upload a signature PNG first."))?,
                r,
            )?,
            Some("state") => return Ok(self.state()),
            _ => return Err(invalid("Unknown mobile PDF operation.")),
        };
        let document = Document::open(&output).map_err(map)?;
        self.document = document;
        Ok(self.state())
    }
    pub fn save(&self) -> Result<Vec<u8>> {
        self.document.save().map_err(map)
    }
}
