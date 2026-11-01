use super::super::{write::escape, xml};
use crate::{error, Result};
use serde_json::Value;
use std::{collections::BTreeMap, sync::Arc};
#[derive(Clone)]
pub struct Element {
    pub name: String,
    pub attrs: BTreeMap<String, String>,
    pub items: Vec<Item>,
    pub ns: Arc<BTreeMap<String, String>>,
}
#[derive(Clone)]
pub enum Item {
    Text(String),
    Node(Arc<Element>),
}
impl Element {
    pub fn parse(source: &str) -> Result<Arc<Self>> {
        Self::from_value(&xml::inspect(source)?, &Arc::new(BTreeMap::new()))
    }
    fn from_value(v: &Value, parent: &Arc<BTreeMap<String, String>>) -> Result<Arc<Self>> {
        let attrs = v["attributes"]
            .as_object()
            .ok_or_else(|| error("InvalidXml", "Missing XML attributes."))?
            .iter()
            .map(|(k, v)| (k.clone(), v.as_str().unwrap_or("").into()))
            .collect::<BTreeMap<String, String>>();
        let mut ns = parent.clone();
        for (k, v) in &attrs {
            if k == "xmlns" {
                Arc::make_mut(&mut ns).insert("".into(), v.clone());
            } else if let Some(k) = k.strip_prefix("xmlns:") {
                Arc::make_mut(&mut ns).insert(k.into(), v.clone());
            }
        }
        let mut items = Vec::new();
        for item in v["children"].as_array().unwrap() {
            items.push(if let Some(s) = item.as_str() {
                Item::Text(s.into())
            } else {
                Item::Node(Self::from_value(item, &ns)?)
            });
        }
        Ok(Arc::new(Self {
            name: v["name"].as_str().unwrap().into(),
            attrs,
            items,
            ns,
        }))
    }
    pub fn local(&self) -> &str {
        self.name.rsplit(':').next().unwrap()
    }
    pub fn attr(&self, key: &str, fallback: &str) -> String {
        let v = self
            .attrs
            .iter()
            .find(|(k, _)| k.rsplit(':').next() == Some(key))
            .map(|(_, v)| v.as_str())
            .unwrap_or(fallback);
        if [
            "Fill",
            "Stroke",
            "Visible",
            "Italic",
            "Bold",
            "Serif",
            "FixedWidth",
            "Current",
            "Expanded",
            "Print",
            "NoZoom",
            "NoRotate",
            "ReadOnly",
            "NewWindow",
            "Repeat",
            "Synchronous",
            "HideToolbar",
            "HideMenubar",
            "HideWindowUI",
        ]
        .contains(&key)
        {
            if v == "1" {
                return "true".into();
            }
            if v == "0" {
                return "false".into();
            }
        }
        v.into()
    }
    pub fn has(&self, key: &str) -> bool {
        self.attrs.contains_key(key)
    }
    pub fn children(&self, name: &str) -> Vec<Arc<Self>> {
        self.items
            .iter()
            .filter_map(|v| match v {
                Item::Node(n) if name.is_empty() || n.local() == name => Some(n.clone()),
                _ => None,
            })
            .collect()
    }
    pub fn child(&self, name: &str) -> Option<Arc<Self>> {
        self.items.iter().find_map(|item| match item {
            Item::Node(n) if n.local() == name => Some(n.clone()),
            _ => None,
        })
    }
    pub fn descendants(&self, name: &str) -> Vec<Arc<Self>> {
        let mut out = Vec::new();
        self.collect(name, &mut out);
        out
    }
    fn collect(&self, name: &str, out: &mut Vec<Arc<Self>>) {
        for item in &self.items {
            if let Item::Node(n) = item {
                if n.local() == name {
                    out.push(n.clone());
                }
                n.collect(name, out);
            }
        }
    }
    pub fn first(&self, name: &str) -> Option<Arc<Self>> {
        for item in &self.items {
            if let Item::Node(n) = item {
                if n.local() == name {
                    return Some(n.clone());
                }
                if let Some(found) = n.first(name) {
                    return Some(found);
                }
            }
        }
        None
    }
    pub fn text(&self) -> String {
        let mut out = String::new();
        self.append_text(&mut out);
        out
    }
    fn append_text(&self, out: &mut String) {
        for item in &self.items {
            match item {
                Item::Text(s) => out.push_str(s),
                Item::Node(n) => n.append_text(out),
            }
        }
    }
    pub fn xml(&self, scoped: bool) -> String {
        let mut attrs = self.attrs.clone();
        if scoped {
            for (k, v) in self.ns.iter() {
                let key = if k.is_empty() {
                    "xmlns".into()
                } else {
                    format!("xmlns:{k}")
                };
                attrs.entry(key).or_insert_with(|| v.clone());
            }
        }
        let attrs = attrs
            .iter()
            .map(|(k, v)| format!(" {k}=\"{}\"", escape(v)))
            .collect::<String>();
        let inner = self
            .items
            .iter()
            .map(|v| match v {
                Item::Text(s) => escape(s),
                Item::Node(n) => n.xml(false),
            })
            .collect::<String>();
        format!("<{}{attrs}>{inner}</{}>", self.name, self.name)
    }
}
pub fn actions(node: &Element) -> Result<Vec<Value>> {
    let Some(actions) = node.child("Actions") else {
        return Ok(Vec::new());
    };
    let source = format!("<Root>{}</Root>", actions.xml(true));
    let doc = xml::parse(&source)?;
    super::super::metadata::actions(doc.root_element())
}
