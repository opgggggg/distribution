//! Container/geometry/scoped-ID validation. Annex-A schema results are supplied
//! separately by the existing XSD engine, then merged in original traversal order.
use super::{resolve_path, xml::*, Package};
use crate::{error, Result};
use roxmltree::Node;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
const NS: &str = "http://www.ofdspec.org/2016";
#[derive(Clone)]
enum Step {
    Schema(String),
    Issue(Value),
}
#[derive(Clone)]
pub struct ValidationPlan {
    steps: Vec<Step>,
    checked: Vec<String>,
}
struct Validator<'a> {
    p: &'a mut Package,
    steps: Vec<Step>,
    checked: Vec<String>,
    seen: BTreeSet<(String, String)>,
    queue: VecDeque<(String, String)>,
    ids: BTreeMap<String, BTreeMap<String, String>>,
    refs: Vec<(String, String, String, String)>,
    maximum: Vec<(String, f64)>,
}
fn number(s: &str) -> f64 {
    let s = s.trim();
    if s.is_empty() {
        return 0.0;
    }
    if let Some(s) = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")) {
        return u64::from_str_radix(s, 16)
            .map(|n| n as f64)
            .unwrap_or(f64::NAN);
    }
    s.parse().unwrap_or(f64::NAN)
}
impl Validator<'_> {
    fn add(&mut self, path: &str, code: &str, message: &str) {
        self.steps.push(Step::Issue(
            json!({"path":path,"code":code,"message":message}),
        ));
    }
    fn link(&mut self, path: &str, scope: &str, reference: &str, is_xml: bool, next_scope: &str) {
        match resolve_path(path, reference) {
            Ok(target) => {
                if !self.p.has(&target) {
                    self.add(
                        path,
                        "missing-part",
                        &format!("Missing referenced part {target}."),
                    );
                } else if is_xml {
                    self.queue.push_back((
                        target.clone(),
                        if next_scope.is_empty() {
                            target
                        } else {
                            next_scope.into()
                        },
                    ));
                }
            }
            Err(e) => self.add(path, "path", &format!("Error: {}", e.message)),
        }
        let _ = scope;
    }
    fn walk(&mut self, path: &str, scope: &str, root: Node<'_, '_>) {
        self.ids.entry(scope.into()).or_default();
        let declarations = [
            "Page",
            "TemplatePage",
            "ColorSpace",
            "DrawParam",
            "Font",
            "MultiMedia",
            "CompositeGraphicUnit",
            "Layer",
            "TextObject",
            "ImageObject",
            "PathObject",
            "CompositeObject",
            "PageBlock",
            "Annot",
        ];
        for node in root.descendants().filter(Node::is_element) {
            if node.tag_name().namespace() != Some(NS) {
                continue;
            }
            let name = node.tag_name().name();
            let parent = node
                .parent()
                .filter(Node::is_element)
                .map(|n| n.tag_name().name())
                .unwrap_or("");
            if name == "Data" || node.ancestors().skip(1).any(|n| local(n, "Data")) {
                continue;
            }
            if !scope.is_empty() && declarations.contains(&name) && node.has_attribute("ID") {
                let id = attr(node, "ID", "");
                let map = self.ids.get_mut(scope).unwrap();
                if let Some(old) = map.get(&id) {
                    let message = format!("ID {id} is already declared as {old}.");
                    self.add(path, "duplicate-id", &message);
                } else {
                    map.insert(id, name.into());
                }
            }
            if name == "MaxUnitID" {
                let declared = number(&value(node));
                if let Some(entry) = self.maximum.iter_mut().find(|e| e.0 == scope) {
                    entry.1 = declared;
                } else {
                    self.maximum.push((scope.into(), declared));
                }
            }
            for (attribute, count, code, message) in [
                (
                    "Boundary",
                    4,
                    "boundary",
                    "Boundary requires four finite numbers and non-negative dimensions.",
                ),
                ("CTM", 6, "matrix", "CTM requires six finite numbers."),
            ] {
                if node.has_attribute(attribute) {
                    let raw = attr(node, attribute, "");
                    let values = raw.split_whitespace().map(number).collect::<Vec<_>>();
                    if values.len() != count
                        || values.iter().any(|v| !v.is_finite())
                        || (attribute == "Boundary"
                            && values.len() == 4
                            && (values[2] < 0.0 || values[3] < 0.0))
                    {
                        self.add(path, code, message);
                    }
                }
            }
            for (attribute, expected) in [
                ("Font", "Font"),
                ("DrawParam", "DrawParam"),
                ("ColorSpace", "ColorSpace"),
                ("TemplateID", "TemplatePage"),
                ("PageID", "Page"),
                ("PageRef", "Page"),
                ("ImageMask", "MultiMedia"),
                ("Substitution", "MultiMedia"),
                ("Thumbnail", "MultiMedia"),
            ] {
                if node.has_attribute(attribute) {
                    self.refs.push((
                        scope.into(),
                        attr(node, attribute, ""),
                        path.into(),
                        expected.into(),
                    ));
                }
            }
            if node.has_attribute("ResourceID") {
                self.refs.push((
                    scope.into(),
                    attr(node, "ResourceID", ""),
                    path.into(),
                    if name == "CompositeObject" {
                        "CompositeGraphicUnit"
                    } else {
                        "MultiMedia"
                    }
                    .into(),
                ));
            }
            if name == "DrawParam" && node.has_attribute("Relative") {
                self.refs.push((
                    scope.into(),
                    attr(node, "Relative", ""),
                    path.into(),
                    "DrawParam".into(),
                ));
            }
            if name == "DefaultCS" {
                self.refs
                    .push((scope.into(), value(node), path.into(), "ColorSpace".into()));
            }
            if name == "DocRoot" {
                self.link(path, scope, &value(node), true, "");
            } else if [
                "PublicRes",
                "DocumentRes",
                "PageRes",
                "Annotations",
                "CustomTags",
                "Extensions",
                "Attachments",
                "Signatures",
            ]
            .contains(&name)
                && node.children().all(|n| !n.is_element())
            {
                let owner = node.ancestors().find(|n| local(*n, "DocBody"));
                let mut owner_scope = scope.to_string();
                if let Some(owner) = owner {
                    match resolve_path(
                        "OFD.xml",
                        &first(owner, "DocRoot").map(value).unwrap_or_default(),
                    ) {
                        Ok(s) => owner_scope = s,
                        Err(e) => {
                            self.add(path, "path", &format!("Error: {}", e.message));
                            continue;
                        }
                    }
                }
                self.link(path, scope, &value(node), true, &owner_scope);
            } else if node.has_attribute("BaseLoc")
                && ["Page", "TemplatePage", "Signature", "Version"].contains(&name)
            {
                self.link(
                    path,
                    scope,
                    &attr(node, "BaseLoc", ""),
                    true,
                    if name == "Version" { "" } else { scope },
                );
            } else if ["MediaFile", "FontFile"].contains(&name) {
                let reference = value(node);
                let base = attr(root, "BaseLoc", "");
                let reference = if reference.starts_with('/') || base.is_empty() {
                    reference
                } else {
                    format!("{base}/{reference}")
                };
                self.link(path, scope, &reference, false, scope);
            } else if ["FileLoc", "SchemaLoc", "ExtendData", "SignedValue"].contains(&name) {
                self.link(
                    path,
                    scope,
                    &value(node),
                    name == "FileLoc" && parent == "Page",
                    scope,
                );
            } else if name == "BaseLoc" && parent == "Seal" {
                self.link(path, scope, &value(node), false, scope);
            }
            if name == "Reference" && node.has_attribute("FileRef") {
                self.link(path, scope, &attr(node, "FileRef", ""), false, scope);
            }
            if name == "File" && parent == "FileList" {
                self.link(path, scope, &value(node), false, scope);
            }
            if name == "ColorSpace" && node.has_attribute("Profile") {
                let reference = attr(node, "Profile", "");
                let base = attr(root, "BaseLoc", "");
                let reference = if reference.starts_with('/') || base.is_empty() {
                    reference
                } else {
                    format!("{base}/{reference}")
                };
                self.link(path, scope, &reference, false, scope);
            }
        }
    }
    fn run(mut self) -> ValidationPlan {
        let mut checked = BTreeSet::new();
        while let Some((path, scope)) = self.queue.pop_front() {
            if !self.seen.insert((scope.clone(), path.clone())) {
                continue;
            }
            if !self.p.has(&path) {
                self.add(&path, "missing-part", "Missing referenced OFD part.");
                continue;
            }
            let source = match self.p.text(&path) {
                Ok(s) => s,
                Err(e) => {
                    self.add(&path, "xml", &format!("Error: {}", e.message));
                    continue;
                }
            };
            let doc = match parse(&source) {
                Ok(doc) => doc,
                Err(e) => {
                    self.add(&path, "xml", &format!("Error: {}", e.message));
                    continue;
                }
            };
            if checked.insert(path.clone()) {
                self.checked.push(path.clone());
                self.steps.push(Step::Schema(path.clone()));
            }
            self.walk(&path, &scope, doc.root_element());
        }
        for (scope, id, path, expected) in std::mem::take(&mut self.refs) {
            let kind = self.ids.get(&scope).and_then(|m| m.get(&id));
            if let Some(kind) = kind {
                if kind != &expected {
                    let message = format!("ID {id} is {kind}, expected {expected}.");
                    self.add(&path, "reference-type", &message);
                }
            } else {
                self.add(
                    &path,
                    "unresolved-id",
                    &format!("Unknown {expected} ID {id}."),
                );
            }
        }
        for (scope, declared) in std::mem::take(&mut self.maximum) {
            let mut actual = 0.0_f64;
            if let Some(ids) = self.ids.get(&scope) {
                for id in ids.keys() {
                    let n = number(id);
                    if n.is_nan() {
                        actual = f64::NAN;
                        break;
                    }
                    actual = actual.max(n);
                }
            }
            if actual > declared {
                self.add(
                    &scope,
                    "max-unit-id",
                    &format!("MaxUnitID {declared} is less than declared ID {actual}."),
                );
            }
        }
        ValidationPlan {
            steps: self.steps,
            checked: self.checked,
        }
    }
}
impl ValidationPlan {
    pub fn new(p: &mut Package) -> Self {
        Validator {
            p,
            steps: Vec::new(),
            checked: Vec::new(),
            seen: BTreeSet::new(),
            queue: VecDeque::from([("OFD.xml".into(), "".into())]),
            ids: BTreeMap::new(),
            refs: Vec::new(),
            maximum: Vec::new(),
        }
        .run()
    }
    pub fn projection(&self) -> Value {
        json!({"checkedParts":self.checked})
    }
    pub fn structural_issues(&self) -> Vec<Value> {
        self.steps
            .iter()
            .filter_map(|s| {
                if let Step::Issue(v) = s {
                    Some(v.clone())
                } else {
                    None
                }
            })
            .collect()
    }
    pub fn finish(&self, replies: &Value) -> Result<Value> {
        let mut schemas = BTreeMap::new();
        for reply in replies
            .as_array()
            .ok_or_else(|| error("InvalidValidation", "Missing XSD validation replies."))?
        {
            let path = reply["path"]
                .as_str()
                .filter(|p| self.checked.iter().any(|c| c == p))
                .ok_or_else(|| error("InvalidValidation", "Unexpected XSD validation reply."))?;
            let issues = reply["issues"]
                .as_array()
                .ok_or_else(|| error("InvalidValidation", "Missing XSD validation issues."))?;
            if schemas.insert(path, issues).is_some() {
                return Err(error(
                    "InvalidValidation",
                    "Duplicate XSD validation reply.",
                ));
            }
        }
        let mut issues = Vec::new();
        for step in &self.steps {
            match step {
                Step::Issue(v) => issues.push(v.clone()),
                Step::Schema(path) => {
                    let replies = schemas.get(path.as_str()).ok_or_else(|| {
                        error("InvalidValidation", "Missing XSD validation reply.")
                    })?;
                    for reply in *replies {
                        let mut issue = reply.as_object().cloned().ok_or_else(|| {
                            error("InvalidValidation", "Invalid XSD validation issue.")
                        })?;
                        issue.insert("path".into(), json!(path));
                        issue.insert("code".into(), json!("xsd"));
                        issues.push(Value::Object(issue));
                    }
                }
            }
        }
        Ok(json!({"valid":issues.is_empty(),"issues":issues,"checkedParts":self.checked}))
    }
}
