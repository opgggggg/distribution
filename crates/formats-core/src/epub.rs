use crate::{error, text::decode, Result};
use roxmltree::{Document, Node};
use scraper::{ElementRef, Html};
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::{
    collections::HashMap,
    io::{Cursor, Read},
    sync::Arc,
};
use zip::ZipArchive;

const PACKAGE_LIMIT: usize = 256 * 1024 * 1024;
const RESOURCE_LIMIT: u64 = 64 * 1024 * 1024;
const XML_LIMIT: usize = 16 * 1024 * 1024;
pub struct Book {
    bytes: Arc<[u8]>,
    zip: ZipArchive<Cursor<Arc<[u8]>>>,
    entries: Vec<Value>,
    folded: HashMap<String, String>,
    sizes: HashMap<String, u64>,
    projection: Value,
    fonts: HashMap<String, Vec<u8>>,
    idpf: Vec<u8>,
}
fn xml(s: &str) -> Result<Document<'_>> {
    Document::parse_with_options(
        s.trim_start_matches('\u{feff}'),
        roxmltree::ParsingOptions {
            allow_dtd: true,
            ..Default::default()
        },
    )
    .map_err(|e| {
        error(
            "InvalidXml",
            format!("The EPUB package document is not well-formed XML: {e}"),
        )
    })
}
fn has(node: Node<'_, '_>, name: &str) -> bool {
    node.is_element() && node.tag_name().name() == name
}
fn first<'a, 'b>(node: Node<'a, 'b>, name: &str) -> Option<Node<'a, 'b>> {
    node.descendants().find(|n| has(*n, name))
}
fn words(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}
fn text(node: Node<'_, '_>) -> String {
    words(
        &node
            .descendants()
            .filter(|n| n.is_text())
            .filter_map(|n| n.text())
            .collect::<String>(),
    )
}
fn attr(node: Node<'_, '_>, name: &str) -> String {
    node.attribute(name).unwrap_or("").into()
}
fn decoded(s: &str) -> String {
    // URL's path representation is escaped; decode via the standard percent parser.
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(a), Some(b)) = (
                (bytes[i + 1] as char).to_digit(16),
                (bytes[i + 2] as char).to_digit(16),
            ) {
                out.push((a * 16 + b) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| s.into())
}
pub fn resolve_path(base: &str, href: &str) -> String {
    let clean = href
        .split('#')
        .next()
        .unwrap_or("")
        .split('?')
        .next()
        .unwrap_or("");
    if clean.is_empty() {
        return base.into();
    }
    let mut url = url::Url::parse("https://epub.invalid/").unwrap();
    {
        let mut segments = url.path_segments_mut().unwrap();
        segments.clear();
        for segment in base.split('/') {
            segments.push(segment);
        }
    }
    url.join(clean)
        .map(|u| decoded(u.path().trim_start_matches('/')))
        .unwrap_or_else(|_| clean.into())
}
fn media(path: &str) -> &'static str {
    match path
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "xhtml" | "xht" => "application/xhtml+xml",
        "html" | "htm" => "text/html",
        "css" => "text/css",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "ogg" => "audio/ogg",
        "ncx" => "application/x-dtbncx+xml",
        "js" => "text/javascript",
        "xml" => "application/xml",
        _ => "application/octet-stream",
    }
}
pub fn decode_resource(bytes: &[u8]) -> String {
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(200)]).to_lowercase();
    let label = ["encoding", "charset"]
        .iter()
        .find_map(|key| {
            let tail = head
                .split_once(key)?
                .1
                .trim_start()
                .strip_prefix('=')?
                .trim_start()
                .trim_start_matches(['\'', '"']);
            let end = tail
                .find(|c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '_')
                .unwrap_or(tail.len());
            Some(&tail[..end])
        })
        .unwrap_or("utf-8");
    decode(bytes, label, false)
        .or_else(|_| decode(bytes, "utf-8", false))
        .map(|r| r.0)
        .unwrap_or_default()
}
impl Book {
    pub fn source(&self) -> &[u8] {
        &self.bytes
    }
    pub fn resolve(&self, path: &str) -> Option<String> {
        if self.sizes.contains_key(path) {
            Some(path.into())
        } else {
            self.folded.get(&path.to_lowercase()).cloned()
        }
    }
    pub fn read(&mut self, path: &str, deobfuscate: bool) -> Result<Option<Vec<u8>>> {
        let Some(path) = self.resolve(path) else {
            return Ok(None);
        };
        let mut file = self
            .zip
            .by_name(&path)
            .map_err(|e| error("InvalidArchive", e.to_string()))?;
        if file.size() > RESOURCE_LIMIT {
            return Err(error("LimitExceeded", "EPUB resource exceeds 64 MiB."));
        }
        let mut bytes = Vec::new();
        file.by_ref()
            .take(RESOURCE_LIMIT + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| error("InvalidArchive", e.to_string()))?;
        if bytes.len() as u64 > RESOURCE_LIMIT {
            return Err(error("LimitExceeded", "EPUB resource exceeds 64 MiB."));
        }
        if deobfuscate {
            if let Some(key) = self.fonts.get(&path) {
                let len = if key == &self.idpf { 1040 } else { 1024 };
                for (i, b) in bytes.iter_mut().take(len).enumerate() {
                    *b ^= key[i % key.len()];
                }
            }
        }
        Ok(Some(bytes))
    }
    fn read_text(&mut self, path: &str) -> Result<Option<String>> {
        self.resource_text(path, false)
    }
    pub fn resource_text(&mut self, path: &str, deobfuscate: bool) -> Result<Option<String>> {
        if self
            .resolve(path)
            .and_then(|p| self.sizes.get(&p).copied())
            .unwrap_or(0)
            > XML_LIMIT as u64
        {
            return Err(error("LimitExceeded", "EPUB text resource exceeds 16 MiB."));
        }
        Ok(self.read(path, deobfuscate)?.map(|b| decode_resource(&b)))
    }
    pub fn projection(&self) -> Value {
        self.projection.clone()
    }
    pub fn open(bytes: Vec<u8>) -> Result<Self> {
        if bytes.len() > PACKAGE_LIMIT {
            return Err(error("LimitExceeded", "EPUB archive exceeds 256 MiB."));
        }
        let bytes: Arc<[u8]> = bytes.into();
        let zip = ZipArchive::new(Cursor::new(bytes.clone())).map_err(|e| {
            error(
                "InvalidArchive",
                format!("This file is not a valid EPUB archive ({e})."),
            )
        })?;
        if zip.len() > 100000 {
            return Err(error("LimitExceeded", "Too many EPUB resources."));
        }
        let mut book = Self {
            bytes,
            zip,
            entries: Vec::new(),
            sizes: HashMap::new(),
            folded: HashMap::new(),
            projection: Value::Null,
            fonts: HashMap::new(),
            idpf: Vec::new(),
        };
        for i in 0..book.zip.len() {
            let file = book
                .zip
                .by_index_raw(i)
                .map_err(|e| error("InvalidArchive", e.to_string()))?;
            if file.is_dir() {
                continue;
            }
            let name = file.name().to_string();
            let size = file.size();
            if book.sizes.contains_key(&name) {
                return Err(error("InvalidArchive", "Duplicate EPUB archive entry."));
            }
            book.folded.insert(name.to_lowercase(), name.clone());
            book.sizes.insert(name.clone(), size);
            book.entries.push(json!({"name":name,"size":size}));
        }
        book.parse()?;
        Ok(book)
    }
    fn parse(&mut self) -> Result<()> {
        let mut path = None;
        if let Some(container) = self.read_text("META-INF/container.xml")? {
            let doc = xml(&container)?;
            path = doc
                .descendants()
                .find(|n| {
                    has(*n, "rootfile")
                        && n.attribute("media-type")
                            .unwrap_or("application/oebps-package+xml")
                            == "application/oebps-package+xml"
                })
                .and_then(|n| n.attribute("full-path"))
                .map(str::to_string);
        }
        let path = path
            .or_else(|| {
                self.entries
                    .iter()
                    .filter_map(|v| v["name"].as_str())
                    .find(|n| n.to_lowercase().ends_with(".opf"))
                    .map(str::to_string)
            })
            .ok_or_else(|| error("InvalidEpub", "This EPUB has no package document (OPF)."))?;
        let package = self
            .read_text(&path)?
            .ok_or_else(|| error("InvalidEpub", "This EPUB has no package document (OPF)."))?;
        let doc = xml(&package)?;
        let root = doc.root_element();
        let meta = first(root, "metadata");
        let metas = meta
            .map(|m| {
                m.descendants()
                    .filter(|n| has(*n, "meta"))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let field = |name: &str| {
            meta.and_then(|m| first(m, name))
                .map(text)
                .filter(|s| !s.is_empty())
        };
        let identifiers = meta
            .map(|m| {
                m.descendants()
                    .filter(|n| has(*n, "identifier"))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let identifier = identifiers
            .iter()
            .find(|n| n.attribute("id") == root.attribute("unique-identifier"))
            .or_else(|| identifiers.first())
            .map(|n| text(*n))
            .filter(|s| !s.is_empty());
        let description = field("description").map(|s| {
            Html::parse_fragment(&s)
                .root_element()
                .text()
                .collect::<String>()
        });
        let metadata = json!({"title":field("title").unwrap_or_else(||{let name=path.rsplit('/').next().unwrap_or("");if name.to_ascii_lowercase().ends_with(".opf") {name[..name.len()-4].into()}else{name.into()}}),"creators":meta.map(|m|m.descendants().filter(|n|has(*n,"creator")).map(text).filter(|s|!s.is_empty()).collect::<Vec<_>>()).unwrap_or_default(),"identifier":identifier,"language":field("language"),"publisher":field("publisher"),"description":description,"published":field("date")});
        let mut manifest = Vec::new();
        let mut ids = HashMap::new();
        if let Some(m) = first(root, "manifest") {
            for n in m.children().filter(|n| has(*n, "item")) {
                let id = attr(n, "id");
                let href = attr(n, "href");
                if id.is_empty() || href.is_empty() {
                    continue;
                }
                let href = resolve_path(&path, &href);
                let href = self.resolve(&href).unwrap_or(href);
                let mime = n
                    .attribute("media-type")
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| media(&href));
                ids.insert(id.clone(), manifest.len());
                manifest.push(json!({"id":id,"href":href,"mediaType":mime,"properties":attr(n,"properties").split_whitespace().collect::<Vec<_>>(),"fallback":n.attribute("fallback")}));
            }
        }
        let se = first(root, "spine");
        let mut spine = Vec::new();
        if let Some(s) = se {
            for n in s.children().filter(|n| has(*n, "itemref")) {
                let mut id = attr(n, "idref");
                let mut seen = std::collections::HashSet::new();
                let mut found = None;
                while seen.insert(id.clone()) {
                    let Some(i) = ids.get(&id) else {
                        break;
                    };
                    let item = &manifest[*i];
                    let mime = item["mediaType"].as_str().unwrap_or("");
                    if mime.contains("html") || mime.contains("svg+xml") {
                        found = Some(item);
                        break;
                    }
                    id = item["fallback"].as_str().unwrap_or("").into();
                }
                if let Some(item) = found {
                    let href = item["href"].as_str().unwrap();
                    if let Some(size) = self.sizes.get(href) {
                        spine.push(json!({"index":spine.len(),"id":item["id"],"href":href,"mediaType":item["mediaType"],"linear":n.attribute("linear")!=Some("no"),"properties":attr(n,"properties").split_whitespace().collect::<Vec<_>>(),"size":(*size).max(1)}));
                    }
                }
            }
        }
        if spine.is_empty() {
            return Err(error("InvalidEpub", "This EPUB has no readable chapters."));
        }
        let cover_id = metas
            .iter()
            .find(|n| n.attribute("name") == Some("cover"))
            .and_then(|n| n.attribute("content"));
        let property = |item: &Value, p: &str| {
            item["properties"]
                .as_array()
                .is_some_and(|a| a.iter().any(|v| v == p))
        };
        let cover = manifest
            .iter()
            .find(|i| property(i, "cover-image"))
            .or_else(|| cover_id.and_then(|id| ids.get(id).map(|i| &manifest[*i])))
            .or_else(|| {
                manifest.iter().find(|i| {
                    i["mediaType"].as_str().unwrap_or("").starts_with("image/")
                        && format!("{}{}", i["id"], i["href"])
                            .to_lowercase()
                            .contains("cover")
                })
            });
        let cover = cover
            .filter(|i| i["mediaType"].as_str().unwrap_or("").starts_with("image/"))
            .map(|i| i["href"].clone());
        let layout = if metas.iter().any(|n| {
            n.attribute("property") == Some("rendition:layout") && text(*n) == "pre-paginated"
        }) {
            "pre-paginated"
        } else {
            "reflowable"
        };
        let direction = if se.and_then(|n| n.attribute("page-progression-direction")) == Some("rtl")
        {
            "rtl"
        } else {
            "ltr"
        };
        let mut count = 0;
        let mut toc = Vec::new();
        if let Some(nav) = manifest.iter().find(|i| property(i, "nav")) {
            let base = nav["href"].as_str().unwrap();
            if let Some(text) = self.read_text(base)? {
                let html = Html::parse_document(&text);
                let navs = html
                    .tree
                    .nodes()
                    .filter_map(ElementRef::wrap)
                    .filter(|e| e.value().name() == "nav")
                    .collect::<Vec<_>>();
                if let Some(nav) = navs
                    .iter()
                    .find(|n| {
                        n.value()
                            .attr("epub:type")
                            .unwrap_or("")
                            .split_whitespace()
                            .any(|t| t == "toc")
                    })
                    .or_else(|| navs.first())
                {
                    if let Some(ol) = nav
                        .descendants()
                        .filter_map(ElementRef::wrap)
                        .find(|e| e.value().name() == "ol")
                    {
                        toc = self.nav_list(ol, base, 0, &spine, &mut count);
                    }
                }
            }
        }
        if toc.is_empty() {
            let ncx = se
                .and_then(|n| n.attribute("toc"))
                .and_then(|id| ids.get(id).map(|i| &manifest[*i]))
                .or_else(|| {
                    manifest
                        .iter()
                        .find(|i| i["mediaType"] == "application/x-dtbncx+xml")
                });
            if let Some(ncx) = ncx {
                let base = ncx["href"].as_str().unwrap();
                if let Some(content) = self.read_text(base)? {
                    let doc = xml(&content)?;
                    if let Some(map) = first(doc.root_element(), "navMap") {
                        toc = self.ncx_list(map, base, 0, &spine, &mut count);
                    }
                }
            }
        }
        if toc.is_empty() {
            for (i, s) in spine.iter().filter(|s| s["linear"] == true).enumerate() {
                toc.push(self.toc_item(
                    (i + 1).to_string(),
                    &path,
                    s["href"].as_str().map(|p| format!("/{p}")),
                    0,
                    &spine,
                    &mut count,
                ));
            }
        }
        self.fonts(identifier.as_deref())?;
        self.projection = json!({"kernel":"rust","entries":self.entries,"metadata":metadata,"manifest":manifest,"spine":spine,"toc":toc,"layout":layout,"direction":direction,"coverHref":cover,"packagePath":path});
        Ok(())
    }
    fn toc_item(
        &self,
        label: String,
        base: &str,
        href: Option<String>,
        depth: usize,
        spine: &[Value],
        count: &mut usize,
    ) -> Value {
        let id = format!("toc-{}", *count);
        *count += 1;
        let mut item = json!({"id":id,"label":if label.is_empty(){"—".into()}else{label},"depth":depth,"children":[]});
        if let Some(href) = href {
            if !href.split('/').next().unwrap_or("").contains(':') {
                let (file, hash) = href
                    .split_once('#')
                    .map(|(a, b)| (a, Some(b)))
                    .unwrap_or((&href, None));
                let path = resolve_path(base, file);
                let path = self.resolve(&path).unwrap_or(path);
                if let Some(i) = spine.iter().position(|s| s["href"] == path) {
                    item["index"] = json!(i);
                }
                item["href"] = json!(path);
                if let Some(hash) = hash.filter(|h| !h.is_empty()) {
                    item["fragment"] = json!(decoded(hash));
                }
            }
        }
        item
    }
    fn nav_list(
        &self,
        ol: ElementRef<'_>,
        base: &str,
        depth: usize,
        spine: &[Value],
        count: &mut usize,
    ) -> Vec<Value> {
        if depth > 128 {
            return Vec::new();
        }
        ol.children()
            .filter_map(ElementRef::wrap)
            .filter(|n| n.value().name() == "li")
            .map(|li| {
                let children = li
                    .children()
                    .filter_map(ElementRef::wrap)
                    .collect::<Vec<_>>();
                let link = children
                    .iter()
                    .find(|e| e.value().name() == "a")
                    .or_else(|| children.iter().find(|e| e.value().name() == "span"));
                let mut item = self.toc_item(
                    link.map(|e| words(&e.text().collect::<String>()))
                        .unwrap_or_default(),
                    base,
                    link.and_then(|e| e.value().attr("href"))
                        .map(str::to_string),
                    depth,
                    spine,
                    count,
                );
                if let Some(ol) = children.into_iter().find(|e| e.value().name() == "ol") {
                    item["children"] = json!(self.nav_list(ol, base, depth + 1, spine, count));
                }
                item
            })
            .collect()
    }
    fn ncx_list(
        &self,
        parent: Node<'_, '_>,
        base: &str,
        depth: usize,
        spine: &[Value],
        count: &mut usize,
    ) -> Vec<Value> {
        if depth > 128 {
            return Vec::new();
        }
        parent
            .children()
            .filter(|n| has(*n, "navPoint"))
            .map(|p| {
                let mut item = self.toc_item(
                    first(p, "navLabel").map(text).unwrap_or_default(),
                    base,
                    p.children()
                        .find(|n| has(*n, "content"))
                        .and_then(|n| n.attribute("src"))
                        .map(str::to_string),
                    depth,
                    spine,
                    count,
                );
                item["children"] = json!(self.ncx_list(p, base, depth + 1, spine, count));
                item
            })
            .collect()
    }
    fn fonts(&mut self, identifier: Option<&str>) -> Result<()> {
        let Some(identifier) = identifier else {
            return Ok(());
        };
        let Some(encryption) = self.read_text("META-INF/encryption.xml")? else {
            return Ok(());
        };
        let doc = xml(&encryption)?;
        self.idpf =
            Sha1::digest(identifier.replace([' ', '\t', '\r', '\n'], "").as_bytes()).to_vec();
        let uuid = if identifier
            .get(..9)
            .is_some_and(|s| s.eq_ignore_ascii_case("urn:uuid:"))
        {
            &identifier[9..]
        } else {
            identifier
        };
        let hex = uuid
            .chars()
            .filter(|c| c.is_ascii_hexdigit())
            .collect::<String>();
        let adobe = if hex.len() == 32 {
            (0..32)
                .step_by(2)
                .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
                .collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        for data in doc.descendants().filter(|n| has(*n, "EncryptedData")) {
            let algorithm = first(data, "EncryptionMethod").and_then(|n| n.attribute("Algorithm"));
            let uri = first(data, "CipherReference").and_then(|n| n.attribute("URI"));
            let Some(path) = uri.and_then(|u| self.resolve(&decoded(u))) else {
                continue;
            };
            let key = match algorithm {
                Some("http://www.idpf.org/2008/embedding") => self.idpf.clone(),
                Some("http://ns.adobe.com/pdf/enc#RC") => adobe.clone(),
                _ => Vec::new(),
            };
            if !key.is_empty() {
                self.fonts.insert(path, key);
            }
        }
        Ok(())
    }
}
