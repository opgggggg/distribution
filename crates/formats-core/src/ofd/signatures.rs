//! OFD signature structure and transaction authority. Cryptography and trust remain
//! explicitly supplied by an OS/security provider; matching hashes do not imply trust.
use super::{resolve_path, xml::*, Package};
use crate::{error, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use roxmltree::Node;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

pub use super::write::escape;
fn invalid(message: &str) -> office_browser_abi::KernelError {
    error("InvalidSignature", message)
}
fn decode(s: &str) -> Result<Vec<u8>> {
    STANDARD
        .decode(s.chars().filter(|c| !matches!(c, '\u{9}'..='\u{d}' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')).collect::<String>())
        .map_err(|_| invalid("Invalid signature digest encoding."))
}
fn equal(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0_u8, |sum, (a, b)| sum | (a ^ b)) == 0
}
/// Edited XML is encoded as UTF-8; untouched parts retain their original bytes.
fn editable_xml(text: String) -> String {
    let mut source = text.trim_start_matches('\u{feff}').to_string();
    if source.starts_with("<?xml") {
        if let Some(end) = source.find("?>") {
            if let Some(key) = source[..end].find("encoding") {
                if let Some(eq) = source[key..end].find('=') {
                    let start = key + eq + 1;
                    let value = source[start..end].trim_start();
                    if let Some(quote) = value.chars().next().filter(|c| *c == '\'' || *c == '"') {
                        let offset = start + source[start..end].len() - value.len() + 1;
                        if let Some(len) = source[offset..end].find(quote) {
                            source.replace_range(offset..offset + len, "UTF-8");
                        }
                    }
                }
            }
        }
    }
    source
}
/// Insert into one existing element without reserializing unrelated XML/extensions.
fn append(source: &str, node: Node<'_, '_>, child: &str) -> Result<String> {
    let range = node.range();
    let fragment = &source[range.clone()];
    let name = fragment[1..]
        .split(|c: char| c.is_whitespace() || c == '/' || c == '>')
        .next()
        .unwrap();
    let replacement = if let Some(prefix) = fragment.strip_suffix("/>") {
        format!("{prefix}>{child}</{name}>")
    } else {
        let end = fragment
            .rfind("</")
            .ok_or_else(|| invalid("Invalid signature container."))?;
        format!("{}{child}{}", &fragment[..end], &fragment[end..])
    };
    let mut result = source.to_string();
    result.replace_range(range, &replacement);
    Ok(result)
}
fn body_index(r: &Value) -> Result<usize> {
    match r.get("documentIndex") {
        None => Ok(0),
        Some(v) => v
            .as_u64()
            .and_then(|v| usize::try_from(v).ok())
            .ok_or_else(|| error("InvalidRange", "Document index is outside the OFD package.")),
    }
}
fn token(r: &Value, key: &str) -> Result<String> {
    let s = r[key].as_str().unwrap_or("");
    if s.is_empty() || s.len() > 128 || !s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-') {
        return Err(invalid("Invalid signature nonce."));
    }
    Ok(s.into())
}
#[derive(Clone)]
pub struct Signing {
    options: Value,
    paths: Vec<String>,
    pub descriptor: String,
    pub signed_value: String,
    pub seal: Option<String>,
    pub method: String,
    id: String,
    namespace: String,
}
impl Signing {
    /// Work on a detached package so a rejected security provider cannot alter the source.
    pub fn begin(package: &Package, r: &Value) -> Result<(Package, Self)> {
        let mut p = package.snapshot();
        let source = editable_xml(p.text("OFD.xml")?);
        let doc = parse(&source)?;
        let root = doc.root_element();
        let bodies = children(root, "DocBody");
        let body = bodies
            .get(body_index(r)?)
            .copied()
            .ok_or_else(|| error("InvalidRange", "Document index is outside the OFD package."))?;
        let namespace = root
            .tag_name()
            .namespace()
            .unwrap_or("http://www.ofdspec.org/2016")
            .to_string();
        let reference = children(body, "Signatures").first().copied();
        let index_path = match reference {
            Some(n) => resolve_path("OFD.xml", &value(n))?,
            None => format!("Signatures-{}/Signatures.xml", token(r, "indexNonce")?),
        };
        let ns = format!("xmlns:ofd=\"{}\"", escape(&namespace));
        let index = if p.has(&index_path) {
            editable_xml(p.text(&index_path)?)
        } else {
            format!("<ofd:Signatures {ns}/>")
        };
        let parsed = parse(&index)?;
        for entry in children(parsed.root_element(), "Signature") {
            let path = resolve_path(&index_path, &attr(entry, "BaseLoc", ""))?;
            let signature = p.text(&path)?;
            let signature = parse(&signature)?;
            for reference in signature.descendants().filter(|n| local(*n, "Reference")) {
                if resolve_path("", &attr(reference, "FileRef", ""))? == index_path {
                    return Err(invalid("The signature index is protected; appending would invalidate an existing signature."));
                }
            }
        }
        // Cache original policy before touching OFD.xml / the index.
        p.begin_edit()?;
        if reference.is_none() {
            let edited = append(
                &source,
                body,
                &format!(
                    "<ofd:Signatures {ns}>{}</ofd:Signatures>",
                    escape(&index_path)
                ),
            )?;
            p.set("OFD.xml", edited.into_bytes())?;
        }
        let id = format!("s{}", token(r, "nonce")?.replace('-', ""));
        let descriptor = resolve_path(&index_path, &format!("{id}/Signature.xml"))?;
        let signed_value = resolve_path(&index_path, &format!("{id}/SignedValue.dat"))?;
        let seal = if r["hasSeal"] == true {
            Some(resolve_path(&index_path, &format!("{id}/Seal.esl"))?)
        } else {
            None
        };
        for path in [&descriptor, &signed_value]
            .into_iter()
            .chain(seal.as_ref())
        {
            if p.has(path) {
                return Err(invalid("Signature identifier already exists."));
            }
        }
        let root = parsed.root_element();
        let index = append(
            &index,
            root,
            &format!(
                "<ofd:Signature {ns} ID=\"{}\" Type=\"{}\" BaseLoc=\"/{}\"/>",
                escape(&id),
                if seal.is_some() { "Seal" } else { "Sign" },
                escape(&descriptor)
            ),
        )?;
        let parsed = parse(&index)?;
        let root = parsed.root_element();
        let mut edited = index.clone();
        if let Some(a) = root
            .attributes()
            .find(|a| a.namespace().is_none() && a.name() == "MaxSignId")
        {
            edited.replace_range(a.range(), &format!("MaxSignId=\"{}\"", escape(&id)));
        } else {
            let start = root.range().start + 1;
            let pos = start
                + index[start..]
                    .find(|c: char| c.is_whitespace() || c == '>' || c == '/')
                    .unwrap();
            edited.insert_str(pos, &format!(" MaxSignId=\"{}\"", escape(&id)));
        }
        p.set(&index_path, edited.into_bytes())?;
        let mut paths = p.paths();
        paths.retain(|path| path != &index_path);
        if let Some(seal) = &seal {
            paths.push(seal.clone());
        }
        paths.sort();
        let method = r["digestMethod"].as_str().unwrap_or("SHA256").to_string();
        Ok((
            p,
            Self {
                options: r.clone(),
                paths,
                descriptor,
                signed_value,
                seal,
                method,
                id,
                namespace,
            },
        ))
    }
    pub fn projection(&self) -> Value {
        json!({"paths":self.paths,"descriptorPath":self.descriptor,"valuePath":self.signed_value,"sealPath":self.seal,"digestMethod":self.method})
    }
    pub fn descriptor(&self, hashes: &Value) -> Result<Vec<u8>> {
        let hashes = hashes
            .as_object()
            .ok_or_else(|| invalid("Missing protected file hashes."))?;
        if hashes.len() != self.paths.len() {
            return Err(invalid(
                "Protected file hashes do not match the signing plan.",
            ));
        }
        let mut refs = String::new();
        for path in &self.paths {
            let encoded = hashes
                .get(path)
                .and_then(Value::as_str)
                .ok_or_else(|| invalid("Missing protected file hash."))?;
            decode(encoded)?;
            refs.push_str(&format!("<ofd:Reference FileRef=\"/{}\"><ofd:CheckValue>{}</ofd:CheckValue></ofd:Reference>",escape(path),encoded));
        }
        let mut stamps = String::new();
        if let Some(items) = self.options["stamps"].as_array() {
            if items.len() > 10000 {
                return Err(error("LimitExceeded", "Too many signature stamps."));
            }
            for (i, s) in items.iter().enumerate() {
                let coords = |key: &str| -> Result<String> {
                    let list = s[key]
                        .as_array()
                        .filter(|a| a.len() == 4)
                        .ok_or_else(|| invalid("Invalid signature stamp bounds."))?;
                    list.iter()
                        .map(|v| {
                            v.as_f64()
                                .filter(|v| v.is_finite())
                                .map(|n| if n == 0.0 { "0".into() } else { n.to_string() })
                                .ok_or_else(|| invalid("Invalid signature stamp coordinates."))
                        })
                        .collect::<Result<Vec<_>>>()
                        .map(|v| v.join(" "))
                };
                let default_id = format!("{}-{i}", self.id);
                stamps.push_str(&format!(
                    "<ofd:StampAnnot ID=\"{}\" PageRef=\"{}\" Boundary=\"{}\"{} />",
                    escape(s["id"].as_str().unwrap_or(&default_id)),
                    escape(s["pageId"].as_str().unwrap_or("")),
                    coords("boundary")?,
                    if s.get("clip").is_some() {
                        format!(" Clip=\"{}\"", coords("clip")?)
                    } else {
                        String::new()
                    }
                ));
            }
        }
        let provider = &self.options["provider"];
        let mut extra = String::new();
        for (key, name) in [("company", "Company"), ("version", "Version")] {
            if let Some(v) = provider[key].as_str().filter(|s| !s.is_empty()) {
                extra.push_str(&format!(" {name}=\"{}\"", escape(v)));
            }
        }
        Ok(format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?><ofd:Signature xmlns:ofd=\"{}\"><ofd:SignedInfo><ofd:Provider ProviderName=\"{}\"{extra}/><ofd:SignatureMethod>{}</ofd:SignatureMethod><ofd:SignatureDateTime>{}</ofd:SignatureDateTime><ofd:References CheckMethod=\"{}\">{refs}</ofd:References>{stamps}{}</ofd:SignedInfo><ofd:SignedValue>SignedValue.dat</ofd:SignedValue></ofd:Signature>",escape(&self.namespace),escape(provider["name"].as_str().unwrap_or("")),escape(self.options["signatureMethod"].as_str().unwrap_or("")),escape(self.options["signedAt"].as_str().unwrap_or("")),escape(&self.method),if self.seal.is_some(){"<ofd:Seal><ofd:BaseLoc>Seal.esl</ofd:BaseLoc></ofd:Seal>"}else{""}).into_bytes())
    }
}

#[derive(Clone)]
struct Reference {
    path: String,
    expected: String,
    missing: bool,
}
#[derive(Clone)]
struct Verification {
    id: String,
    method: String,
    references: Vec<Reference>,
    complete: bool,
    context: Option<Value>,
    error: Option<String>,
}
#[derive(Clone)]
pub struct VerificationPlan {
    entries: Vec<Verification>,
}
impl VerificationPlan {
    pub fn new(p: &mut Package) -> Result<Self> {
        let root = p.text("OFD.xml")?;
        let doc = parse(&root)?;
        let mut entries = Vec::new();
        for body in children(doc.root_element(), "DocBody") {
            let Some(reference) = children(body, "Signatures").first().copied() else {
                continue;
            };
            if value(reference).is_empty() {
                continue;
            }
            let index_path = resolve_path("OFD.xml", &value(reference))?;
            let index = p.text(&index_path)?;
            let index = parse(&index)?;
            for entry in children(index.root_element(), "Signature") {
                let mut item = Verification {
                    id: attr(entry, "ID", ""),
                    method: String::new(),
                    references: vec![],
                    complete: false,
                    context: None,
                    error: None,
                };
                let result = (|| -> Result<()> {
                    let path = resolve_path(&index_path, &attr(entry, "BaseLoc", ""))?;
                    let source = p.text(&path)?;
                    let doc = parse(&source)?;
                    let root = doc.root_element();
                    let signed = children(root, "SignedInfo")
                        .first()
                        .copied()
                        .ok_or_else(|| invalid("Signature is missing SignedInfo."))?;
                    let refs = children(signed, "References")
                        .first()
                        .copied()
                        .ok_or_else(|| invalid("Signature has no protected file references."))?;
                    let refs_list = children(refs, "Reference");
                    if refs_list.is_empty() {
                        return Err(invalid("Signature has no protected file references."));
                    }
                    item.method = attr(refs, "CheckMethod", "");
                    for reference in refs_list {
                        let file = attr(reference, "FileRef", "");
                        if !file.starts_with('/') {
                            return Err(invalid(
                                "Signature FileRef must be an absolute package path.",
                            ));
                        }
                        let path = resolve_path("", &file)?;
                        item.references.push(Reference {
                            missing: !p.has(&path),
                            path,
                            expected: first(reference, "CheckValue")
                                .map(|n| {
                                    n.descendants()
                                        .filter(|n| n.is_text())
                                        .filter_map(|n| n.text())
                                        .collect()
                                })
                                .unwrap_or_default(),
                        });
                    }
                    item.complete = true;
                    let signed_value = resolve_path(
                        &path,
                        &first(root, "SignedValue").map(value).unwrap_or_default(),
                    )?;
                    if !p.has(&signed_value) {
                        return Err(invalid("Missing SignedValue."));
                    }
                    let mut context = json!({"id":item.id,"method":first(signed,"SignatureMethod").map(value).unwrap_or_default(),"descriptorPath":path,"valuePath":signed_value});
                    if let Some(n) = first(signed, "SignatureDateTime") {
                        context["signedAt"] = json!(n
                            .descendants()
                            .filter(|n| n.is_text())
                            .filter_map(|n| n.text())
                            .collect::<String>());
                    }
                    if let Some(seal) = children(signed, "Seal")
                        .first()
                        .copied()
                        .and_then(|n| first(n, "BaseLoc"))
                    {
                        if !value(seal).is_empty() {
                            let seal_path = resolve_path(&path, &value(seal))?;
                            if p.has(&seal_path) {
                                context["sealPath"] = json!(seal_path);
                            }
                        }
                    }
                    item.context = Some(context);
                    Ok(())
                })();
                if let Err(e) = result {
                    item.error = Some(e.message);
                }
                entries.push(item);
            }
        }
        Ok(Self { entries })
    }
    pub fn projection(&self) -> Value {
        json!(self.entries.iter().map(|e| json!({"id":e.id,"digestMethod":e.method,"references":e.references.iter().map(|r|json!({"path":r.path,"missing":r.missing})).collect::<Vec<_>>(),"context":e.context})).collect::<Vec<_>>())
    }
    /// Replies contain only small provider outputs, never document bytes. Omitted,
    /// duplicated or mismatched digest replies are rejected instead of trusted.
    pub fn finish(&self, replies: &Value, providers: &Value) -> Result<Value> {
        let replies = replies
            .as_array()
            .ok_or_else(|| invalid("Missing digest provider results."))?;
        let mut hashes = BTreeMap::new();
        for r in replies {
            let key = (
                r["entry"]
                    .as_u64()
                    .and_then(|v| usize::try_from(v).ok())
                    .ok_or_else(|| invalid("Invalid digest reply."))?,
                r["reference"]
                    .as_u64()
                    .and_then(|v| usize::try_from(v).ok())
                    .ok_or_else(|| invalid("Invalid digest reply."))?,
            );
            let reference = self
                .entries
                .get(key.0)
                .and_then(|e| e.references.get(key.1))
                .filter(|r| !r.missing)
                .ok_or_else(|| invalid("Unexpected digest reply."))?;
            if r["path"].as_str() != Some(&reference.path) || hashes.insert(key, r).is_some() {
                return Err(invalid("Duplicate or mismatched digest reply."));
            }
        }
        let providers = providers.as_array().cloned().unwrap_or_default();
        let mut provider_entries = BTreeSet::new();
        for p in &providers {
            let i = p["entry"]
                .as_u64()
                .ok_or_else(|| invalid("Invalid security provider reply."))?
                as usize;
            if self
                .entries
                .get(i)
                .and_then(|e| e.context.as_ref())
                .is_none()
                || !provider_entries.insert(i)
            {
                return Err(invalid("Unexpected security provider reply."));
            }
            if p.get("error").is_none()
                && (!p["valid"].is_boolean()
                    || (p.get("trusted").is_some() && !p["trusted"].is_boolean()))
            {
                return Err(invalid("Invalid security provider result."));
            }
        }
        let mut output = Vec::new();
        for (i, entry) in self.entries.iter().enumerate() {
            let mut refs = Vec::new();
            let mut unsupported = false;
            for (j, reference) in entry.references.iter().enumerate() {
                let mut result = json!({"path":reference.path,"valid":false});
                if reference.missing {
                    result["error"] = json!("Missing protected file.");
                } else {
                    let reply = hashes
                        .get(&(i, j))
                        .ok_or_else(|| invalid("Missing digest reply."))?;
                    let value = (|| -> Result<Vec<u8>> {
                        if let Some(e) = reply["error"].as_str() {
                            return Err(invalid(e));
                        }
                        decode(reply["digest"].as_str().unwrap_or(""))
                    })();
                    let expected = decode(&reference.expected);
                    match value.and_then(|v| expected.map(|e| equal(&v, &e))) {
                        Ok(valid) => result["valid"] = json!(valid),
                        Err(e) => {
                            unsupported = true;
                            result["error"] = json!(if reply.get("error").is_some() {
                                e.message
                            } else {
                                format!("Error: {}", e.message)
                            });
                        }
                    }
                }
                refs.push(result);
            }
            let integrity = if unsupported {
                "unsupported"
            } else if entry.complete && refs.iter().all(|r| r["valid"] == true) {
                "valid"
            } else {
                "invalid"
            };
            let mut result = json!({"id":entry.id,"references":refs,"integrity":integrity,"cryptographicValidity":"unverified","trust":"unknown"});
            if let Some(e) = &entry.error {
                result["error"] = json!(e);
            }
            if let Some(p) = providers
                .iter()
                .find(|p| p["entry"].as_u64() == Some(i as u64))
            {
                if let Some(e) = p["error"].as_str() {
                    result["error"] = json!(e);
                } else {
                    result["cryptographicValidity"] = json!(if p["valid"] == true {
                        "valid"
                    } else {
                        "invalid"
                    });
                    if p.get("trusted").is_some() {
                        result["trust"] = json!(if p["trusted"] == true {
                            "trusted"
                        } else {
                            "untrusted"
                        });
                    }
                }
            }
            output.push(result);
        }
        Ok(json!(output))
    }
}
