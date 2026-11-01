use crate::{error, Result};
use quick_xml::{events::Event, Reader};
use roxmltree::{Document, Node};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

pub fn parse(text: &str) -> Result<Document<'_>> {
    let upper = text.to_ascii_uppercase();
    if upper.contains("<!DOCTYPE") || upper.contains("<!ENTITY") {
        return Err(error(
            "InvalidXml",
            "DTD and entity declarations are not supported.",
        ));
    }
    Document::parse(text.trim_start_matches('\u{feff}'))
        .map_err(|e| error("InvalidXml", format!("Invalid XML: {e}")))
}
pub fn local(n: Node<'_, '_>, name: &str) -> bool {
    n.is_element() && n.tag_name().name() == name
}
pub fn children<'a, 'b>(n: Node<'a, 'b>, name: &str) -> Vec<Node<'a, 'b>> {
    n.children().filter(|n| local(*n, name)).collect()
}
pub fn first<'a, 'b>(n: Node<'a, 'b>, name: &str) -> Option<Node<'a, 'b>> {
    n.descendants().skip(1).find(|n| local(*n, name))
}
pub fn value(n: Node<'_, '_>) -> String {
    n.descendants()
        .filter(|n| n.is_text())
        .filter_map(|n| n.text())
        .collect::<String>()
        .trim()
        .into()
}
pub fn attr(n: Node<'_, '_>, name: &str, fallback: &str) -> String {
    let v = n
        .attributes()
        .find(|a| a.name() == name)
        .map(|a| a.value())
        .unwrap_or(fallback);
    let boolean = [
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
    .contains(&name);
    (if boolean && v == "1" {
        "true"
    } else if boolean && v == "0" {
        "false"
    } else {
        v
    })
    .into()
}
pub fn inspect(text: &str) -> Result<Value> {
    let doc = parse(text)?;
    inspect_node(doc.root_element())
}
pub fn inspect_node(node: Node<'_, '_>) -> Result<Value> {
    let source = node.document().input_text();
    let fragment = &source[node.range()];
    let mut namespaces =
        HashMap::from([("xml".into(), "http://www.w3.org/XML/1998/namespace".into())]);
    if let Some(parent) = node.parent() {
        for ns in parent.namespaces() {
            namespaces.insert(ns.name().unwrap_or("").into(), ns.uri().into());
        }
    }
    inspect_fragment(fragment, namespaces)
}
struct Frame {
    node: Value,
    namespaces: HashMap<String, String>,
    text: bool,
}
fn inspect_fragment(text: &str, namespaces: HashMap<String, String>) -> Result<Value> {
    let mut reader = Reader::from_str(text);
    let mut stack: Vec<Frame> = Vec::new();
    let mut root = None;
    loop {
        let event = reader
            .read_event()
            .map_err(|e| error("InvalidXml", e.to_string()))?;
        let empty = matches!(event, Event::Empty(_));
        match event {
            Event::Start(start) | Event::Empty(start) => {
                if stack.len() > 256 {
                    return Err(error(
                        "LimitExceeded",
                        "OFD XML inspection depth exceeds the budget.",
                    ));
                }
                let mut ns = stack
                    .last()
                    .map(|f| f.namespaces.clone())
                    .unwrap_or_else(|| namespaces.clone());
                let mut attrs = Map::new();
                for a in start.attributes() {
                    let a = a.map_err(|e| error("InvalidXml", e.to_string()))?;
                    let key = std::str::from_utf8(a.key.as_ref())
                        .map_err(|e| error("InvalidXml", e.to_string()))?
                        .to_string();
                    let v = a
                        .decoded_and_normalized_value(
                            quick_xml::XmlVersion::Implicit1_0,
                            reader.decoder(),
                        )
                        .map_err(|e| error("InvalidXml", e.to_string()))?
                        .into_owned();
                    if key == "xmlns" {
                        ns.insert("".into(), v.clone());
                    } else if let Some(prefix) = key.strip_prefix("xmlns:") {
                        ns.insert(prefix.into(), v.clone());
                    }
                    attrs.insert(key, json!(v));
                }
                let name = std::str::from_utf8(start.name().as_ref())
                    .map_err(|e| error("InvalidXml", e.to_string()))?
                    .to_string();
                let prefix = name.split_once(':').map(|(p, _)| p).unwrap_or("");
                let uri = ns.get(prefix).filter(|u| !u.is_empty()).cloned();
                let n = json!({"name":name,"namespace":uri,"attributes":attrs,"children":[]});
                if let Some(parent) = stack.last_mut() {
                    parent.text = false;
                }
                stack.push(Frame {
                    node: n,
                    namespaces: ns,
                    text: false,
                });
                if empty {
                    finish(&mut stack, &mut root);
                }
            }
            Event::End(_) => finish(&mut stack, &mut root),
            Event::Text(text) => {
                let decoded = text
                    .decode()
                    .map_err(|e| error("InvalidXml", e.to_string()))?;
                append_text(
                    &mut stack,
                    decoded.replace("\r\n", "\n").replace('\r', "\n"),
                    false,
                );
            }
            Event::GeneralRef(reference) => {
                let decoded = reference
                    .decode()
                    .map_err(|e| error("InvalidXml", e.to_string()))?;
                let encoded = format!("&{decoded};");
                let value = quick_xml::escape::unescape(&encoded)
                    .map_err(|e| error("InvalidXml", e.to_string()))?;
                append_text(&mut stack, value.into_owned(), false);
            }
            Event::CData(data) => append_text(
                &mut stack,
                data.decode()
                    .map_err(|e| error("InvalidXml", e.to_string()))?
                    .replace("\r\n", "\n")
                    .replace('\r', "\n"),
                true,
            ),
            Event::Eof => break,
            _ => {
                if let Some(last) = stack.last_mut() {
                    last.text = false;
                }
            }
        }
    }
    root.ok_or_else(|| error("InvalidXml", "Missing XML document element."))
}
fn finish(stack: &mut Vec<Frame>, root: &mut Option<Value>) {
    if let Some(frame) = stack.pop() {
        if let Some(parent) = stack.last_mut() {
            parent.node["children"]
                .as_array_mut()
                .unwrap()
                .push(frame.node);
            parent.text = false;
        } else {
            *root = Some(frame.node);
        }
    }
}
fn append_text(stack: &mut [Frame], text: String, cdata: bool) {
    if let Some(frame) = stack.last_mut() {
        let list = frame.node["children"].as_array_mut().unwrap();
        if frame.text && !cdata {
            if let Some(Value::String(last)) = list.last_mut() {
                last.push_str(&text);
            }
        } else {
            list.push(json!(text));
        }
        frame.text = !cdata;
    }
}
