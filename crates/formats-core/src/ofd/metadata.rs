use super::{
    resolve_path,
    xml::{self, attr, children, first, inspect_node, local, value},
    Package,
};
use crate::{error, Result};
use roxmltree::Node;
use serde_json::{json, Value};

pub fn document_path(package: &mut Package, index: usize, version: Option<&str>) -> Result<String> {
    let root = package.text("OFD.xml")?;
    let doc = xml::parse(&root)?;
    let bodies = children(doc.root_element(), "DocBody");
    let body = *bodies
        .get(index)
        .ok_or_else(|| error("InvalidDocument", "Unknown OFD document."))?;
    select_path(package, body, version)
}
fn select_path(package: &mut Package, body: Node<'_, '_>, version: Option<&str>) -> Result<String> {
    let versions = children(body, "Versions")
        .first()
        .copied()
        .map(|v| children(v, "Version"))
        .unwrap_or_default();
    let chosen = if let Some(id) = version {
        Some(
            *versions
                .iter()
                .find(|v| attr(**v, "ID", "") == id)
                .ok_or_else(|| error("InvalidVersion", format!("Unknown OFD version {id}.")))?,
        )
    } else {
        versions
            .into_iter()
            .find(|v| attr(*v, "Current", "") == "true")
    };
    if let Some(chosen) = chosen {
        let path = resolve_path("OFD.xml", &attr(chosen, "BaseLoc", ""))?;
        let text = package.text(&path)?;
        let version = xml::parse(&text)?;
        return resolve_path(
            &path,
            &first(version.root_element(), "DocRoot")
                .map(value)
                .unwrap_or_default(),
        );
    }
    resolve_path(
        "OFD.xml",
        &first(body, "DocRoot").map(value).unwrap_or_default(),
    )
}
pub fn describe(package: &mut Package, options: &Value) -> Result<Vec<Value>> {
    let text = package.text("OFD.xml")?;
    let root = xml::parse(&text)?;
    let root = root.root_element();
    if !local(root, "OFD") {
        return Err(error("InvalidDocument", "Invalid OFD root element."));
    }
    let mut result = Vec::new();
    for (index, body) in children(root, "DocBody").into_iter().enumerate() {
        let version = if options.get("documentIndex").is_none()
            || options["documentIndex"].as_u64() == Some(index as u64)
        {
            options["version"].as_str()
        } else {
            None
        };
        let path = select_path(package, body, version)?;
        let document = package.text(&path)?;
        let document = xml::parse(&document)?;
        let document = document.root_element();
        let permission = children(document, "Permissions").first().copied();
        let mut attachments = Vec::new();
        if let Some(reference) = children(document, "Attachments")
            .first()
            .map(|n| value(*n))
            .filter(|s| !s.is_empty())
        {
            let location = resolve_path(&path, &reference)?;
            if package.has(&location) {
                let source = package.text(&location)?;
                let doc = xml::parse(&source)?;
                for file in children(doc.root_element(), "Attachment") {
                    if let Some(reference) =
                        first(file, "FileLoc").map(value).filter(|s| !s.is_empty())
                    {
                        attachments.push(json!({"id":attr(file,"ID",""),"name":attr(file,"Name",""),"path":resolve_path(&location,&reference)?,"mediaType":attr(file,"Format",""),"metadata":inspect_node(file)?}));
                    }
                }
            }
        }
        let mut versions = Vec::new();
        if let Some(node) = children(body, "Versions").first() {
            for v in children(*node, "Version") {
                let location = resolve_path("OFD.xml", &attr(v, "BaseLoc", ""))?;
                let mut item = json!({"id":attr(v,"ID",""),"path":location,"current":attr(v,"Current","")=="true"});
                if package.has(&location) {
                    item["xml"] = package.xml(&location)?;
                }
                versions.push(item);
            }
        }
        let mut pages = Vec::new();
        for p in document
            .descendants()
            .skip(1)
            .filter(|p| local(*p, "Page") && p.attribute("BaseLoc").is_some())
        {
            pages.push(
                json!({"id":attr(p,"ID",""),"path":resolve_path(&path,&attr(p,"BaseLoc",""))?}),
            );
        }
        let mut outline_items = Vec::new();
        for n in children(document, "Outlines") {
            for n in children(n, "OutlineElem") {
                outline_items.push(outline(n, 0)?);
            }
        }
        let inspected_children = |tag: &str| -> Result<Vec<Value>> {
            let mut values = Vec::new();
            for n in children(document, tag) {
                for n in n.children().filter(|n| n.is_element()) {
                    values.push(inspect_node(n)?);
                }
            }
            Ok(values)
        };
        let mut item = json!({"path":path,"root":inspect_node(document)?,"pages":pages,"outlineItems":outline_items,"outlines":inspected_children("Outlines")?,"bookmarks":inspected_children("Bookmarks")?,"policy":permissions(permission),"view":view_preferences(children(document,"VPreferences").first().copied()),"actions":actions(document)?,"attachments":attachments,"versions":versions});
        if let Some(info) = children(body, "DocInfo").first() {
            item["info"] = inspect_node(*info)?;
        }
        if let Some(permission) = permission {
            item["permissions"] = inspect_node(permission)?;
        }
        for (key, owner, tag, base) in [
            ("customTags", document, "CustomTags", path.as_str()),
            ("extensions", document, "Extensions", path.as_str()),
            ("annotations", document, "Annotations", path.as_str()),
            ("signatures", body, "Signatures", "OFD.xml"),
        ] {
            if let Some(external) = external(package, owner, tag, base)? {
                item[key] = external;
            }
        }
        result.push(item);
    }
    Ok(result)
}
fn external(
    package: &mut Package,
    owner: Node<'_, '_>,
    tag: &str,
    base: &str,
) -> Result<Option<Value>> {
    let reference = children(owner, tag)
        .first()
        .map(|n| value(*n))
        .unwrap_or_default();
    if reference.is_empty() {
        return Ok(None);
    }
    let path = resolve_path(base, &reference)?;
    if !package.has(&path) {
        return Ok(None);
    }
    Ok(Some(json!({"path":path,"xml":package.xml(&path)?})))
}
fn outline(n: Node<'_, '_>, depth: usize) -> Result<Value> {
    if depth > 256 {
        return Err(error(
            "LimitExceeded",
            "OFD outline depth exceeds the budget.",
        ));
    }
    let mut nested = Vec::new();
    for child in children(n, "OutlineElem") {
        nested.push(outline(child, depth + 1)?);
    }
    Ok(
        json!({"title":attr(n,"Title",""),"expanded":attr(n,"Expanded","true")=="true","actions":actions(n)?,"children":nested}),
    )
}
pub fn actions(n: Node<'_, '_>) -> Result<Vec<Value>> {
    let Some(node) = children(n, "Actions").first().copied() else {
        return Ok(Vec::new());
    };
    let mut result = Vec::new();
    for action in children(node, "Action") {
        let payload = action.children().find(|n| {
            n.is_element()
                && ["Goto", "GotoA", "URI", "Sound", "Movie"].contains(&n.tag_name().name())
        });
        let mut item = json!({"event":attr(action,"Event",""),"type":payload.map(|p|p.tag_name().name()).unwrap_or("Unknown"),"parameters":inspect_node(payload.unwrap_or(action))?});
        if let Some(region) = children(action, "Region").first() {
            item["region"] = json!(region_path(*region)?);
        }
        result.push(item);
    }
    Ok(result)
}
fn number(s: &str) -> f64 {
    s.trim()
        .parse::<f64>()
        .ok()
        .filter(|n| n.is_finite())
        .unwrap_or(0.)
}
fn numbers(s: &str) -> Vec<f64> {
    s.split_whitespace().map(number).collect()
}
fn coordinates(v: &[f64]) -> String {
    v.iter()
        .map(|n| n.to_string())
        .collect::<Vec<_>>()
        .join(" ")
}
fn region_path(region: Node<'_, '_>) -> Result<String> {
    let mut output = Vec::new();
    for area in children(region, "Area") {
        let mut point = numbers(&attr(area, "Start", ""));
        if point.len() != 2 {
            return Err(error(
                "InvalidRegion",
                "Region Area requires a Start point.",
            ));
        }
        output.push(format!("M {}", coordinates(&point)));
        for c in area.children().filter(|n| n.is_element()) {
            let p = |name: &str, fallback: &[f64]| {
                if c.attribute(name).is_some() {
                    numbers(&attr(c, name, ""))
                } else {
                    fallback.to_vec()
                }
            };
            match c.tag_name().name() {
                "Move" | "Line" => {
                    point = p("Point1", &point);
                    output.push(format!(
                        "{} {}",
                        if local(c, "Move") { "M" } else { "L" },
                        coordinates(&point)
                    ));
                }
                "QuadraticBezier" => {
                    let end = p("Point2", &point);
                    output.push(format!(
                        "Q {} {}",
                        coordinates(&p("Point1", &point)),
                        coordinates(&end)
                    ));
                    point = end;
                }
                "CubicBezier" => {
                    let end = p("Point3", &point);
                    output.push(format!(
                        "C {} {} {}",
                        coordinates(&p("Point1", &point)),
                        coordinates(&p("Point2", &end)),
                        coordinates(&end)
                    ));
                    point = end;
                }
                "Arc" => {
                    let radii = numbers(&attr(c, "EllipseSize", ""))
                        .into_iter()
                        .map(f64::abs)
                        .collect::<Vec<_>>();
                    let x = radii.first().copied().unwrap_or(0.);
                    let y = radii.get(1).copied().unwrap_or(x);
                    let end = p("EndPoint", &point);
                    output.push(if x != 0. && y != 0. {
                        format!(
                            "A {x} {y} {} {} {} {}",
                            number(&attr(c, "RotationAngle", "")) % 360.,
                            if attr(c, "LargeArc", "") == "true" {
                                1
                            } else {
                                0
                            },
                            if attr(c, "SweepDirection", "") == "true" {
                                1
                            } else {
                                0
                            },
                            coordinates(&end)
                        )
                    } else {
                        format!("L {}", coordinates(&end))
                    });
                    point = end;
                }
                "Close" => output.push("Z".into()),
                _ => {}
            }
        }
        output.push("Z".into());
    }
    Ok(output.join(" "))
}
fn truth(value: Option<String>, fallback: bool) -> bool {
    value.map(|s| s == "true" || s == "1").unwrap_or(fallback)
}
pub fn permissions(node: Option<Node<'_, '_>>) -> Value {
    let v = |name: &str| node.and_then(|n| children(n, name).first().copied().map(value));
    let print = node.and_then(|n| children(n, "Print").first().copied());
    let valid = node.and_then(|n| children(n, "ValidPeriod").first().copied());
    let copies = print.and_then(|p| p.attribute("Copies")).and_then(|s| {
        if s.trim().is_empty() {
            Some(0.)
        } else {
            s.parse::<f64>().ok().filter(|n| n.is_finite())
        }
    });
    let mut period = json!({});
    if let Some(valid) = valid {
        for (key, name) in [("start", "StartDate"), ("end", "EndDate")] {
            let s = attr(valid, name, "");
            if !s.is_empty() {
                period[key] = json!(s);
            }
        }
    }
    json!({"edit":truth(v("Edit"),true),"annotate":truth(v("Annot"),true),"export":truth(v("Export"),true),"sign":truth(v("Signature"),true),"watermark":truth(v("Watermark"),true),"printScreen":truth(v("PrintScreen"),true),"print":{"allowed":truth(print.map(|p|attr(p,"Printable","true")),true)&&copies!=Some(0.),"copies":copies.filter(|n|*n>=0.)},"validPeriod":period})
}
pub fn view_preferences(node: Option<Node<'_, '_>>) -> Value {
    let v = |name: &str, fallback: &str| {
        node.and_then(|n| children(n, name).first().copied().map(value))
            .unwrap_or_else(|| fallback.into())
    };
    let mut result = json!({"pageMode":v("PageMode","None"),"pageLayout":v("PageLayout","OneColumn"),"tabDisplay":v("TabDisplay","FileName"),"hideToolbar":truth(Some(v("HideToolbar","false")),false),"hideMenubar":truth(Some(v("HideMenubar","false")),false),"hideWindowUI":truth(Some(v("HideWindowUI","false")),false),"zoomMode":v("ZoomMode","Default")});
    let zoom = v("Zoom", "");
    if !zoom.is_empty() {
        result["zoom"] = json!(zoom.parse::<f64>().ok().filter(|n| n.is_finite()));
    }
    result
}
