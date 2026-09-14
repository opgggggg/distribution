use chrono::{DateTime, Local, NaiveDateTime};
use roxmltree::{Document, Node};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    io::{Cursor, Read},
    path::PathBuf,
    sync::Arc,
};
use uuid::Uuid;

pub const MAX_SOURCE: u64 = 64 * 1024 * 1024;
pub const MAX_EXPANDED: usize = 128 * 1024 * 1024;
pub type Result<T> = std::result::Result<T, String>;
pub fn child<'a, 'i>(node: Node<'a, 'i>, name: &str) -> Option<Node<'a, 'i>> {
    node.children()
        .find(|n| n.is_element() && n.tag_name().name() == name)
}
pub fn text<'a, 'i>(node: Node<'a, 'i>, name: &str) -> &'a str {
    child(node, name)
        .and_then(|n| n.text())
        .unwrap_or("")
        .trim()
}
pub fn attr<'a, 'i>(node: Node<'a, 'i>, name: &str) -> &'a str {
    node.attribute(name).unwrap_or("")
}
pub fn resolve(base: &str, reference: &str) -> Result<String> {
    if reference.is_empty()
        || reference.contains(['\\', ':', '\0'])
        || reference.chars().any(|c| c.is_control())
    {
        return Err("Invalid package resource path".into());
    }
    let mut parts: Vec<&str> = if reference.starts_with('/') {
        vec![]
    } else {
        base.rsplit_once('/')
            .map(|(p, _)| p.split('/').collect())
            .unwrap_or_default()
    };
    for p in reference.split('/') {
        match p {
            "" | "." => {}
            ".." => {
                if parts.pop().is_none() {
                    return Err("Resource path escapes the package".into());
                }
            }
            _ => parts.push(p),
        }
    }
    Ok(parts.join("/"))
}
pub fn xml(bytes: &[u8]) -> Result<Document<'_>> {
    let s = std::str::from_utf8(bytes).map_err(|_| "Native verification requires UTF-8 OFD XML")?;
    if s.contains("<!DOCTYPE") || s.contains("<!ENTITY") {
        return Err("DTD/entity declarations are forbidden".into());
    }
    Document::parse(s).map_err(|e| e.to_string())
}
fn boolean(value: &str, default: bool) -> bool {
    match value.trim() {
        "true" | "1" => true,
        "false" | "0" => false,
        _ => default,
    }
}
fn date(value: &str) -> Result<Option<i64>> {
    if value.is_empty() {
        return Ok(None);
    }
    if let Ok(v) = DateTime::parse_from_rfc3339(value) {
        return Ok(Some(v.timestamp()));
    }
    let naive = NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S")
        .map_err(|_| "Invalid OFD validity date")?;
    Ok(Some(
        naive
            .and_local_timezone(Local)
            .single()
            .ok_or("Ambiguous OFD validity date")?
            .timestamp(),
    ))
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Policy {
    pub edit: bool,
    pub export: bool,
    pub sign: bool,
    pub annotate: bool,
    pub print: bool,
    pub copies: Option<u32>,
    pub print_screen: bool,
    pub valid_from: Option<i64>,
    pub valid_until: Option<i64>,
}
impl Policy {
    pub fn parse(node: Option<Node<'_, '_>>) -> Result<Self> {
        let get = |name| node.map(|n| text(n, name)).unwrap_or("");
        let print = node.and_then(|n| child(n, "Print"));
        let period = node.and_then(|n| child(n, "ValidPeriod"));
        let copies = print
            .and_then(|n| n.attribute("Copies"))
            .map(str::parse::<i64>)
            .transpose()
            .map_err(|_| "Invalid print quota")?
            .filter(|n| *n >= 0)
            .map(|n| u32::try_from(n).map_err(|_| "Print quota is too large"))
            .transpose()?;
        let result = Self {
            edit: boolean(get("Edit"), true),
            export: boolean(get("Export"), true),
            sign: boolean(get("Signature"), true),
            annotate: boolean(get("Annot"), true),
            print: print
                .map(|n| boolean(attr(n, "Printable"), true))
                .unwrap_or(true)
                && copies != Some(0),
            copies,
            print_screen: boolean(get("PrintScreen"), true),
            valid_from: date(period.map(|n| attr(n, "StartDate")).unwrap_or(""))?,
            valid_until: date(period.map(|n| attr(n, "EndDate")).unwrap_or(""))?,
        };
        if matches!((result.valid_from,result.valid_until),(Some(a),Some(b)) if a>b) {
            return Err("OFD validity period is reversed".into());
        }
        Ok(result)
    }
    pub fn authorize(&self, operation: &str, now: i64) -> Result<()> {
        if self.valid_from.is_some_and(|t| now < t) || self.valid_until.is_some_and(|t| now > t) {
            return Err("文档不在允许访问的有效期内".into());
        }
        let permitted = match operation {
            "read" => true,
            "export" => self.export,
            "print" => self.print,
            "edit" => self.edit,
            "annotate" => self.annotate,
            "sign" => self.sign,
            "capture" => self.print_screen,
            _ => return Err("Unknown document operation".into()),
        };
        if permitted {
            Ok(())
        } else {
            Err(format!("文档权限不允许此操作：{operation}"))
        }
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentInfo {
    pub index: usize,
    pub path: String,
    pub title: String,
    pub page_ids: Vec<String>,
    pub policy: Policy,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub hash: String,
    pub name: String,
    pub documents: Vec<DocumentInfo>,
    pub size: usize,
}
pub struct Session {
    pub info: SessionInfo,
    pub parts: BTreeMap<String, Arc<[u8]>>,
    pub source: PathBuf,
    pub root: tempfile::TempDir,
    pub expanded: usize,
    pub signature_indexes: Vec<(usize, String)>,
}
impl Session {
    pub fn open(source: PathBuf, name: String, cache: &std::path::Path) -> Result<Self> {
        let size = std::fs::metadata(&source).map_err(|e| e.to_string())?.len();
        if size > MAX_SOURCE {
            return Err("OFD source exceeds 64 MiB".into());
        }
        let bytes = std::fs::read(&source).map_err(|e| e.to_string())?;
        let hash = format!("{:x}", Sha256::digest(&bytes));
        let mut zip = zip::ZipArchive::new(Cursor::new(&bytes)).map_err(|e| e.to_string())?;
        if zip.len() > 10000 {
            return Err("Too many OFD parts".into());
        }
        let mut parts = BTreeMap::new();
        let mut expanded = 0usize;
        for i in 0..zip.len() {
            let mut file = zip.by_index(i).map_err(|e| e.to_string())?;
            if file.is_dir() {
                continue;
            }
            let name = file.name().to_owned();
            if resolve("", &name)? != name || parts.contains_key(&name) {
                return Err("Non-canonical or duplicate OFD part".into());
            }
            let budget = MAX_EXPANDED
                .checked_sub(expanded)
                .ok_or("OFD expansion budget exceeded")?;
            if file.size() > budget as u64 {
                return Err("OFD expansion budget exceeded".into());
            }
            let mut data = Vec::new();
            (&mut file)
                .take(budget as u64 + 1)
                .read_to_end(&mut data)
                .map_err(|e| e.to_string())?;
            expanded += data.len();
            if expanded > MAX_EXPANDED {
                return Err("OFD expansion budget exceeded".into());
            }
            parts.insert(name, Arc::<[u8]>::from(data));
        }
        let get = |p: &str| {
            parts
                .get(p)
                .map(|v| v.as_ref())
                .ok_or_else(|| format!("Missing OFD part {p}"))
        };
        let ofd = xml(get("OFD.xml")?)?;
        if ofd.root_element().tag_name().name() != "OFD" {
            return Err("Not an OFD document".into());
        }
        let mut documents = vec![];
        let mut signature_indexes = vec![];
        for (index, body) in ofd
            .root_element()
            .children()
            .filter(|n| n.has_tag_name("DocBody"))
            .enumerate()
        {
            let default = resolve("OFD.xml", text(body, "DocRoot"))?;
            let version = child(body, "Versions").and_then(|n| {
                n.children()
                    .find(|n| n.has_tag_name("Version") && boolean(attr(*n, "Current"), false))
            });
            let path = if let Some(version) = version {
                let p = resolve("OFD.xml", attr(version, "BaseLoc"))?;
                let root = xml(get(&p)?)?;
                resolve(&p, text(root.root_element(), "DocRoot"))?
            } else {
                default
            };
            let doc = xml(get(&path)?)?;
            let root = doc.root_element();
            let pages = child(root, "Pages").ok_or("Document has no page list")?;
            let page_ids = pages
                .children()
                .filter(|n| n.has_tag_name("Page"))
                .map(|n| attr(n, "ID").to_owned())
                .collect::<Vec<_>>();
            if page_ids.is_empty() || page_ids.len() > 1000 {
                return Err("Invalid OFD page count".into());
            }
            let title = child(body, "DocInfo")
                .map(|n| text(n, "Title"))
                .unwrap_or("")
                .to_owned();
            documents.push(DocumentInfo {
                index,
                path,
                title,
                page_ids,
                policy: Policy::parse(child(root, "Permissions"))?,
            });
            let sig = text(body, "Signatures");
            if !sig.is_empty() {
                signature_indexes.push((index, resolve("OFD.xml", sig)?));
            }
        }
        if documents.is_empty() {
            return Err("OFD has no document bodies".into());
        }
        let root = tempfile::Builder::new()
            .prefix("ofd-session-")
            .tempdir_in(cache)
            .map_err(|e| e.to_string())?;
        Ok(Self {
            info: SessionInfo {
                id: Uuid::new_v4().to_string(),
                hash,
                name: name.chars().take(255).collect(),
                documents,
                size: bytes.len(),
            },
            parts,
            source,
            root,
            expanded,
            signature_indexes,
        })
    }
    pub fn part(&self, path: &str) -> Result<&[u8]> {
        self.parts
            .get(path)
            .map(|p| p.as_ref())
            .ok_or_else(|| format!("Missing OFD part {path}"))
    }
    pub fn policy(&self, index: usize) -> Result<&Policy> {
        self.info
            .documents
            .get(index)
            .map(|d| &d.policy)
            .ok_or_else(|| "Unknown document index".into())
    }
    pub fn media(&self, index: usize, page_id: Option<&str>, id: &str) -> Result<(String, &[u8])> {
        let info = self
            .info
            .documents
            .get(index)
            .ok_or("Unknown document index")?;
        let document = xml(self.part(&info.path)?)?;
        let mut roots = vec![info.path.clone()];
        if let Some(page_id) = page_id {
            if let Some(page) = document
                .descendants()
                .find(|n| n.has_tag_name("Page") && attr(*n, "ID") == page_id)
            {
                roots.push(resolve(&info.path, attr(page, "BaseLoc"))?);
            }
        }
        let mut found = None;
        for root_path in roots {
            let doc = xml(self.part(&root_path)?)?;
            for tag in ["PublicRes", "DocumentRes", "PageRes"] {
                for reference in doc.descendants().filter(|n| n.has_tag_name(tag)) {
                    let path = resolve(&root_path, reference.text().unwrap_or("").trim())?;
                    let resource = xml(self.part(&path)?)?;
                    let base = attr(resource.root_element(), "BaseLoc");
                    for item in resource
                        .descendants()
                        .filter(|n| n.has_tag_name("MultiMedia") && attr(*n, "ID") == id)
                    {
                        let loc = text(item, "MediaFile");
                        let rel = if loc.starts_with('/') || base.is_empty() {
                            loc.to_owned()
                        } else {
                            format!("{base}/{loc}")
                        };
                        found = Some((attr(item, "Format").to_owned(), resolve(&path, &rel)?));
                    }
                }
            }
        }
        let (format, path) = found.ok_or("Unknown OFD media resource")?;
        Ok((format, self.part(&path)?))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn canonical_paths() {
        assert_eq!(resolve("Doc/Res.xml", "../x").unwrap(), "x");
        assert!(resolve("Doc.xml", "../x").is_err());
        assert!(resolve("", "/x").is_ok());
        assert!(resolve("", "https://host/x").is_err());
    }
    #[test]
    fn policy_is_backend_enforced() {
        let d=xml(br#"<Permissions><Export>false</Export><Print Printable="true" Copies="0"/></Permissions>"#).unwrap();
        let p = Policy::parse(Some(d.root_element())).unwrap();
        assert!(p.authorize("read", 0).is_ok());
        assert!(p.authorize("export", 0).is_err());
        assert!(p.authorize("print", 0).is_err());
    }
}
