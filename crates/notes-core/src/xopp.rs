use crate::{history::Document, model::*, Error, Result};
use flate2::{read::MultiGzDecoder, write::GzEncoder, Compression};
use serde_json::{json, Value};
use std::io::{Read, Write};
fn fail(message: &str) -> Error {
    Error::new("UnsupportedXopp", message)
}
fn ink(raw: &str) -> Result<(String, f64)> {
    let named = [
        ("black", "#000000"),
        ("blue", "#3333cc"),
        ("red", "#ff0000"),
        ("green", "#008000"),
        ("gray", "#808080"),
        ("lightblue", "#00c0ff"),
        ("lightgreen", "#00ff00"),
        ("magenta", "#ff00ff"),
        ("orange", "#ff8000"),
        ("yellow", "#ffff00"),
        ("white", "#ffffff"),
        ("pink", "#ffc0cb"),
    ];
    if let Some((_, c)) = named.iter().find(|(n, _)| *n == raw) {
        return Ok(((*c).into(), 1.0));
    }
    if ![7, 9].contains(&raw.len())
        || !raw.starts_with('#')
        || !raw.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
    {
        return Err(fail("Invalid Xournal ink color."));
    }
    Ok((
        raw[..7].to_lowercase(),
        if raw.len() == 9 {
            u8::from_str_radix(&raw[7..], 16).unwrap() as f64 / 255.0
        } else {
            1.0
        },
    ))
}
fn attribute(node: roxmltree::Node, key: &str) -> Result<f64> {
    node.attribute(key)
        .unwrap_or("")
        .parse::<f64>()
        .map_err(|_| fail("Invalid Xournal numeric attribute."))
}
fn numbers(text: &str) -> Result<Vec<f64>> {
    text.split_whitespace()
        .map(|n| n.parse().map_err(|_| fail("Invalid Xournal coordinates.")))
        .collect()
}
pub fn read(bytes: &[u8], title: &str, brushes: &BrushCatalog) -> Result<Document> {
    let mut content = Vec::new();
    if bytes.starts_with(&[0x1f, 0x8b]) {
        MultiGzDecoder::new(bytes)
            .take(MAX_BYTES as u64 + 1)
            .read_to_end(&mut content)?;
    } else {
        content.extend_from_slice(bytes);
    }
    if content.len() > MAX_BYTES {
        return Err(fail("Expanded notebook exceeds the 64 MB editing limit."));
    }
    let xml = std::str::from_utf8(&content).map_err(|_| fail("Invalid notebook XML encoding."))?;
    if xml.to_ascii_uppercase().contains("<!DOCTYPE")
        || xml.to_ascii_uppercase().contains("<!ENTITY")
    {
        return Err(fail("Unsupported notebook XML."));
    }
    let doc =
        roxmltree::Document::parse(xml).map_err(|e| fail(&format!("Invalid notebook XML: {e}")))?;
    let root = doc.root_element();
    if !root.has_tag_name("xournal") {
        return Err(fail("Expected a Xournal notebook."));
    }
    let mut pages = Vec::new();
    let mut count = 0;
    for (pi, node) in root
        .children()
        .filter(|n| n.has_tag_name("page"))
        .enumerate()
    {
        if pi >= MAX_PAGES {
            return Err(fail("Invalid notebook page count."));
        }
        let bg = node
            .children()
            .find(|n| n.has_tag_name("background"))
            .ok_or_else(|| fail("Missing Xournal background."))?;
        if bg.attribute("type") != Some("solid") {
            return Err(fail("Xournal PDF and image backgrounds are not supported."));
        }
        if bg.has_attribute("config") {
            return Err(fail(
                "Custom Xournal paper configurations are not supported.",
            ));
        }
        let paper = match bg.attribute("style").unwrap_or("plain") {
            "plain" => "plain",
            "lined" | "ruled" => "ruled",
            "graph" => "grid",
            "dotted" => "dotted",
            _ => return Err(fail("Unsupported Xournal paper style.")),
        };
        let mut layers = Vec::new();
        for (li, layer) in node
            .children()
            .filter(|n| n.has_tag_name("layer"))
            .enumerate()
        {
            let mut elements = Vec::new();
            for (ei, e) in layer
                .children()
                .filter(roxmltree::Node::is_element)
                .enumerate()
            {
                let (color, opacity) = ink(e.attribute("color").unwrap_or("black"))?;
                let id = format!("xopp-{pi}-{li}-{ei}");
                let content = e
                    .descendants()
                    .filter_map(|n| n.is_text().then(|| n.text().unwrap_or("")))
                    .collect::<String>();
                if e.has_tag_name("text") {
                    for a in ["matrix", "wrap", "align", "justify", "audioFilename"] {
                        if e.has_attribute(a) {
                            return Err(fail("Unsupported Xournal text attribute."));
                        }
                    }
                    if opacity != 1.0 {
                        return Err(fail("Translucent Xournal text is not supported."));
                    }
                    elements.push(json!({"id":id,"kind":"text","x":attribute(e,"x")?,"y":attribute(e,"y")?,"size":attribute(e,"size")?,"color":color,"text":content,"font":e.attribute("font").unwrap_or("sans-serif")}));
                } else if e.has_tag_name("stroke")
                    && ["pen", "highlighter"].contains(&e.attribute("tool").unwrap_or(""))
                {
                    for a in ["fill", "lineStyle", "style", "audioFilename"] {
                        if e.has_attribute(a) {
                            return Err(fail("Unsupported Xournal stroke attribute."));
                        }
                    }
                    if e.attribute("capStyle").is_some_and(|c| c != "round") {
                        return Err(fail("Unsupported Xournal stroke cap style."));
                    }
                    let tool = e.attribute("tool").unwrap();
                    let widths = numbers(e.attribute("width").unwrap_or(""))?;
                    let coords = numbers(&content)?;
                    if coords.len() < 4
                        || coords.len() % 2 != 0
                        || widths.is_empty()
                        || (widths.len() != 1 && widths.len() != coords.len() / 2)
                    {
                        return Err(fail("Invalid Xournal stroke coordinates or widths."));
                    }
                    if tool == "highlighter" && widths.len() > 1 {
                        return Err(fail(
                            "Variable-width Xournal highlighters are not supported.",
                        ));
                    }
                    count += coords.len() / 2;
                    if count > MAX_POINTS {
                        return Err(fail("Too many notebook ink points."));
                    }
                    let points = coords
                        .chunks_exact(2)
                        .enumerate()
                        .map(|(i, p)| {
                            let mut p = json!({"x":p[0],"y":p[1],"pressure":0.5});
                            if widths.len() > 1 {
                                p["width"] = json!(widths[i.max(1)]);
                            }
                            p
                        })
                        .collect::<Vec<_>>();
                    elements.push(json!({"id":id,"kind":"stroke","tool":tool,"color":color,"opacity":if tool=="highlighter"{0.5}else{opacity},"width":widths[0],"pressure":false,"points":points}));
                } else {
                    return Err(fail("Unsupported Xournal content. Import stopped to preserve the original file."));
                }
            }
            layers.push(json!({"id":format!("layer-{pi}-{li}"),"name":layer.attribute("name").map(str::to_owned).unwrap_or_else(||format!("Layer {}",li+1)),"visible":true,"elements":elements}));
        }
        if node
            .children()
            .filter(roxmltree::Node::is_element)
            .any(|n| !n.has_tag_name("background") && !n.has_tag_name("layer"))
        {
            return Err(fail("Unsupported Xournal page content."));
        }
        pages.push(json!({"id":format!("page-{pi}"),"infinite":false,"width":attribute(node,"width")?,"height":attribute(node,"height")?,"paper":paper,"color":ink(bg.attribute("color").unwrap_or("black"))?.0,"bookmarked":false,"layers":layers}));
    }
    Document::from_value(
        json!({"format":"cubeoffice-notebook","version":1,"title":title,"pages":pages}),
        brushes,
    )
}
fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
fn num(v: f64) -> String {
    let n = (v * 10000.0).round() / 10000.0;
    if n == 0.0 {
        "0".into()
    } else {
        n.to_string()
    }
}
fn width(e: &Value, p: &Value) -> f64 {
    if let Some(w) = p["width"].as_f64() {
        return w;
    }
    let w = e["width"].as_f64().unwrap();
    let pressure = p["pressure"].as_f64().unwrap();
    if e["pressure"] != true || e["penStyle"] == "ballpoint" {
        return w;
    }
    let factor = match e["penStyle"].as_str() {
        Some("fountain" | "crayon") => 0.6 + 0.8 * pressure,
        Some("brush") => 0.1 + 1.8 * pressure,
        Some("pencil") => 0.7 + 0.6 * pressure,
        Some("watercolor" | "reed") => 0.65 + 0.7 * pressure,
        Some("marker") => 0.85 + 0.3 * pressure,
        _ => 0.3 + 1.4 * pressure,
    };
    w * factor
}
pub fn write(doc: &Document, brushes: &BrushCatalog) -> Result<Vec<u8>> {
    let book = doc.value();
    validate(&book, brushes)?;
    let mut xml=format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?><xournal version=\"0.4.8\" fileversion=\"4\" creator=\"CubeOffice\"><title>{}</title>",escape(book["title"].as_str().unwrap()));
    for p in array(&book["pages"])? {
        if p.get("background").is_some()
            || p["bookmarked"] == true
            || p["paper"] == "dotted"
            || p["scenes"].as_array().is_some_and(|v| !v.is_empty())
            || p["tapes"].as_array().is_some_and(|v| !v.is_empty())
        {
            return Err(fail(
                "Xournal cannot preserve these page features. Save as .cubenote or export PNG/PDF.",
            ));
        }
        let layers = array(&p["layers"])?;
        for l in layers {
            if l["visible"] != true {
                return Err(fail("Xournal cannot preserve hidden layers."));
            }
            for e in array(&l["elements"])? {
                if e["penStyle"].as_str().is_some_and(|id| id.contains(':'))
                    && e["pressure"] == true
                    && array(&e["points"])?
                        .iter()
                        .any(|p| p.get("width").is_none())
                {
                    return Err(fail("Custom Xournal brush export requires explicit point widths from its pressure renderer."));
                }
                if e["kind"] == "image"
                    || e["cutouts"].as_array().is_some_and(|v| !v.is_empty())
                    || e["erasures"].as_array().is_some_and(|v| !v.is_empty())
                    || e["penStyle"]
                        .as_str()
                        .is_some_and(|id| brushes.get(id).is_none_or(|b| b["xournal"] != true))
                {
                    return Err(fail("Xournal cannot preserve this content. Save as .cubenote or export PNG/PDF."));
                }
            }
        }
        let (mut left, mut top, mut right, mut bottom) = (
            f64::INFINITY,
            f64::INFINITY,
            f64::NEG_INFINITY,
            f64::NEG_INFINITY,
        );
        if p["infinite"] != false {
            for l in layers {
                for e in array(&l["elements"])? {
                    let (x, y, w, h, margin) = if e["kind"] == "text" {
                        let size = e["size"].as_f64().unwrap();
                        let lines = e["text"].as_str().unwrap().split('\n').collect::<Vec<_>>();
                        (
                            e["x"].as_f64().unwrap(),
                            e["y"].as_f64().unwrap(),
                            lines
                                .iter()
                                .map(|l| l.chars().count())
                                .max()
                                .unwrap_or(1)
                                .max(1) as f64
                                * size,
                            lines.len() as f64 * size * 1.35,
                            8.0,
                        )
                    } else {
                        let pts = array(&e["points"])?;
                        let radius = pts.iter().map(|p| width(e, p) / 2.0).fold(0.0, f64::max);
                        let minx = pts
                            .iter()
                            .map(|p| p["x"].as_f64().unwrap())
                            .fold(f64::INFINITY, f64::min);
                        let miny = pts
                            .iter()
                            .map(|p| p["y"].as_f64().unwrap())
                            .fold(f64::INFINITY, f64::min);
                        let maxx = pts
                            .iter()
                            .map(|p| p["x"].as_f64().unwrap())
                            .fold(f64::NEG_INFINITY, f64::max);
                        let maxy = pts
                            .iter()
                            .map(|p| p["y"].as_f64().unwrap())
                            .fold(f64::NEG_INFINITY, f64::max);
                        (
                            minx - radius,
                            miny - radius,
                            maxx - minx + radius * 2.0,
                            maxy - miny + radius * 2.0,
                            e["width"].as_f64().unwrap() * 2.0,
                        )
                    };
                    left = left.min(x - margin);
                    top = top.min(y - margin);
                    right = right.max(x + w + margin);
                    bottom = bottom.max(y + h + margin);
                }
            }
        }
        let (w, h, dx, dy) = if left.is_finite() {
            (
                (right - left + 48.0).max(72.0),
                (bottom - top + 48.0).max(72.0),
                24.0 - left,
                24.0 - top,
            )
        } else {
            (
                p["width"].as_f64().unwrap(),
                p["height"].as_f64().unwrap(),
                0.0,
                0.0,
            )
        };
        if w > 5000.0 || h > 5000.0 {
            return Err(fail("This board is too large for Xournal paper."));
        }
        let style = match p["paper"].as_str().unwrap() {
            "grid" => "graph",
            other => other,
        };
        xml+=&format!("<page width=\"{}\" height=\"{}\"><background type=\"solid\" color=\"{}ff\" style=\"{}\"/>",num(w),num(h),p["color"].as_str().unwrap(),style);
        for l in layers {
            xml += &format!("<layer name=\"{}\">", escape(l["name"].as_str().unwrap()));
            for e in array(&l["elements"])? {
                if e["kind"] == "text" {
                    xml += &format!(
                        "<text font=\"{}\" size=\"{}\" x=\"{}\" y=\"{}\" color=\"{}ff\">{}</text>",
                        escape(e["font"].as_str().unwrap_or("sans-serif")),
                        num(e["size"].as_f64().unwrap()),
                        num(e["x"].as_f64().unwrap() + dx),
                        num(e["y"].as_f64().unwrap() + dy),
                        e["color"].as_str().unwrap(),
                        escape(e["text"].as_str().unwrap())
                    );
                } else {
                    let mut points = array(&e["points"])?.clone();
                    if points.len() == 1 {
                        let mut end = points[0].clone();
                        end["x"] = json!(end["x"].as_f64().unwrap() + 0.001);
                        points.push(end);
                    }
                    let mut widths = vec![num(e["width"].as_f64().unwrap())];
                    if e["tool"] != "highlighter" {
                        widths.extend(points[1..].iter().map(|p| num(width(e, p))));
                    }
                    let coords = points
                        .iter()
                        .flat_map(|p| {
                            [
                                num(p["x"].as_f64().unwrap() + dx),
                                num(p["y"].as_f64().unwrap() + dy),
                            ]
                        })
                        .collect::<Vec<_>>()
                        .join(" ");
                    xml += &format!(
                        "<stroke tool=\"{}\" color=\"{}{:02x}\" width=\"{}\">{}</stroke>",
                        e["tool"].as_str().unwrap(),
                        e["color"].as_str().unwrap(),
                        (e["opacity"].as_f64().unwrap() * 255.0).round() as u8,
                        widths.join(" "),
                        coords
                    );
                }
            }
            xml += "</layer>";
        }
        xml += "</page>";
    }
    xml += "</xournal>";
    let mut gzip = GzEncoder::new(Vec::new(), Compression::default());
    gzip.write_all(xml.as_bytes())?;
    Ok(gzip.finish()?)
}
