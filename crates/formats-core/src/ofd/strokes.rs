//! Final device-scale stroke minima, shared by native rendering and synchronous
//! viewer/export adapters. Only changed attributes are replaced in the SVG.
use crate::{error, Result};
pub const MM: f64 = 96.0 / 25.4;
pub fn stroke_scale(m: [f64; 6]) -> f64 {
    let sum = m[0] * m[0] + m[1] * m[1] + m[2] * m[2] + m[3] * m[3];
    let det = m[0] * m[3] - m[1] * m[2];
    let largest = ((sum + (sum * sum - 4.0 * det * det).max(0.0).sqrt()) / 2.0).sqrt();
    if largest == 0.0 {
        0.0
    } else {
        det.abs() / largest
    }
}
pub fn line_width(w: f64, scale: f64, device: f64) -> Result<f64> {
    if !w.is_finite() || w < 0.0 {
        return Err(error(
            "InvalidGeometry",
            "OFD line width must be non-negative.",
        ));
    }
    let unit = MM * scale.max(1e-12) * device;
    Ok(if w == 0.0 {
        1.0 / unit
    } else {
        w.max(2.0 / unit)
    })
}
pub fn at_device_scale(svg: &str, scale: f64) -> Result<String> {
    if !scale.is_finite() || scale <= 0.0 {
        return Err(error("InvalidScale", "Invalid OFD device scale."));
    }
    if !svg.contains("data-ofd-line-width") {
        return Ok(svg.into());
    }
    if svg.len() > 128 * 1024 * 1024 {
        return Err(error("LimitExceeded", "SVG exceeds its size budget."));
    }
    let upper = svg.to_ascii_uppercase();
    if upper.contains("<!DOCTYPE") || upper.contains("<!ENTITY") {
        return Err(error(
            "InvalidXml",
            "DTD and entity declarations are not supported.",
        ));
    }
    let doc = roxmltree::Document::parse(svg).map_err(|e| error("InvalidXml", e.to_string()))?;
    let mut changes = Vec::<(std::ops::Range<usize>, String)>::new();
    for node in doc
        .root_element()
        .descendants()
        .skip(1)
        .filter(|n| n.is_element())
    {
        let Some(width) = node.attribute("data-ofd-line-width") else {
            continue;
        };
        let number = |s: Option<&str>| -> f64 { s.unwrap_or("").trim().parse().unwrap_or(0.0) };
        let width = line_width(
            number(Some(width)),
            number(node.attribute("data-ofd-stroke-scale")),
            scale,
        )?;
        let miter = (number(node.attribute("data-ofd-miter-length")) / width).max(1.0);
        let mut inserted = String::new();
        for (name, value) in [("stroke-width", width), ("stroke-miterlimit", miter)] {
            let attribute = format!("{name}=\"{value}\"");
            if let Some(old) = node
                .attributes()
                .find(|a| a.name() == name && a.namespace().is_none())
            {
                changes.push((old.range(), attribute));
            } else {
                inserted.push(' ');
                inserted.push_str(&attribute);
            }
        }
        if !inserted.is_empty() {
            // Insert before the first existing attribute; otherwise find the end
            // of the start tag. Quoted '>' characters never affect this position.
            let start = node.range().start;
            let name_end = svg[start + 1..]
                .find(|c: char| c.is_whitespace() || c == '/' || c == '>')
                .map(|p| start + 1 + p)
                .ok_or_else(|| error("InvalidXml", "Invalid SVG start tag."))?;
            changes.push((name_end..name_end, inserted));
        }
    }
    changes.sort_by_key(|(range, _)| range.start);
    let mut output = String::with_capacity(svg.len());
    let mut cursor = 0;
    for (range, value) in changes {
        if range.start < cursor {
            return Err(error("InvalidXml", "Overlapping SVG attributes."));
        }
        output.push_str(&svg[cursor..range.start]);
        output.push_str(&value);
        cursor = range.end;
    }
    output.push_str(&svg[cursor..]);
    Ok(output)
}
