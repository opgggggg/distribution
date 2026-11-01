//! Bulk OFD drawing authority. The host supplies only decoded image/font bytes and
//! an explicit color-provider binding; page traversal, geometry and SVG are Rust-owned.
mod dom;
mod geometry;
pub mod host;
mod paint;
mod text;
use super::{metadata, resolve_path, write::escape, Package};
use crate::{error, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use dom::{actions, Element};
use geometry::*;
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};
use text::{FontData, TextPaint};
pub type Assets = BTreeMap<String, Arc<[u8]>>;
pub trait ColorHost {
    fn enabled(&self) -> bool {
        false
    }
    fn convert(
        &self,
        _values: &[f64],
        _space: &str,
        _bits: f64,
        _profile: Option<&str>,
    ) -> Result<[f64; 3]> {
        Err(error("InvalidState", "No colorConverter host."))
    }
}
pub struct DefaultColorHost;
impl ColorHost for DefaultColorHost {}
#[derive(Clone, Default)]
struct Resources {
    images: BTreeMap<String, Arc<str>>,
    fonts: BTreeMap<String, String>,
    font_data: BTreeMap<String, FontData>,
    default_cs: String,
    draw: BTreeMap<String, Arc<Element>>,
    colors: BTreeMap<String, Arc<Element>>,
    profiles: BTreeMap<String, String>,
    composites: BTreeMap<String, Arc<Element>>,
    templates: BTreeMap<String, (String, String)>,
    defs: Vec<String>,
}
pub struct Renderer<'a> {
    package: &'a mut Package,
    assets: &'a Assets,
    host: &'a dyn ColorHost,
    options: Value,
    xml_cache: BTreeMap<String, Arc<Element>>,
    diagnostics: Vec<Value>,
    objects: usize,
    clip_id: usize,
    generated: usize,
    hotspots: Vec<Value>,
    page_bounds: Option<[f64; 4]>,
}
fn diag(out: &mut Vec<Value>, code: &str, message: &str) {
    out.push(json!({"code":code,"message":message}));
}
fn raster_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[137, 80, 78, 71]) {
        Some("image/png")
    } else if bytes.starts_with(&[255, 216, 255]) {
        Some("image/jpeg")
    } else {
        None
    }
}
fn data_uri(bytes: &[u8], mime: &str) -> String {
    format!("data:{mime};base64,{}", STANDARD.encode(bytes))
}
fn bounds(node: &Element) -> [f64; 4] {
    numbers(&node.attr("Boundary", ""))
        .try_into()
        .unwrap_or([0.0; 4])
}
impl<'a> Renderer<'a> {
    fn limit(&self, key: &str, default: usize) -> usize {
        self.options[key]
            .as_u64()
            .and_then(|v| usize::try_from(v).ok())
            .unwrap_or(default)
    }
    fn max_bytes(&self) -> usize {
        self.limit("maxSvgBytes", 128 * 1024 * 1024)
    }
    fn xml(&mut self, path: &str) -> Result<Arc<Element>> {
        if let Some(node) = self.xml_cache.get(path) {
            return Ok(node.clone());
        }
        let node = Element::parse(&self.package.text(path)?)?;
        self.xml_cache.insert(path.into(), node.clone());
        Ok(node)
    }
    fn resources(
        &mut self,
        document: &Element,
        path: &str,
        inherited: Option<&Resources>,
    ) -> Result<Resources> {
        let mut res = inherited.cloned().unwrap_or_default();
        if let Some(node) = document.first("DefaultCS") {
            res.default_cs = node.text().trim().into();
        }
        for template in document.descendants("TemplatePage") {
            res.templates.insert(
                template.attr("ID", ""),
                (
                    resolve_path(path, &template.attr("BaseLoc", ""))?,
                    template.attr("ZOrder", "Background"),
                ),
            );
        }
        for reference in [
            document.descendants("PublicRes"),
            document.descendants("DocumentRes"),
            document.descendants("PageRes"),
        ]
        .concat()
        {
            let resource_path = resolve_path(path, reference.text().trim())?;
            if !self.package.has(&resource_path) {
                diag(
                    &mut self.diagnostics,
                    "ofd-resource",
                    &format!("Missing resource dictionary {resource_path}."),
                );
                continue;
            }
            let root = self.xml(&resource_path)?;
            let base = root.attr("BaseLoc", "");
            let resource = |name: &str| {
                resolve_path(
                    &resource_path,
                    if name.starts_with('/') || base.is_empty() {
                        name.to_string()
                    } else {
                        format!("{base}/{name}")
                    }
                    .as_str(),
                )
            };
            for media in root.descendants("MultiMedia") {
                if media.attr("Type", "Image") != "Image" {
                    continue;
                }
                let Some(file) = media
                    .first("MediaFile")
                    .map(|n| n.text().trim().to_string())
                    .filter(|s| !s.is_empty())
                else {
                    continue;
                };
                let location = resource(&file)?;
                if self.package.has(&location) {
                    let bytes = self.package.read(&location)?;
                    let decoded = if bytes.starts_with(b"BM") {
                        Some(super::codecs::bmp(&bytes)?)
                    } else if bytes.starts_with(b"II") || bytes.starts_with(b"MM") {
                        Some(super::codecs::tiff(&bytes)?)
                    } else {
                        None
                    };
                    let bytes = decoded.as_deref().unwrap_or(&bytes);
                    if let Some(mime) = raster_mime(bytes) {
                        res.images
                            .insert(media.attr("ID", ""), data_uri(bytes, mime).into());
                        continue;
                    }
                }
                diag(
                    &mut self.diagnostics,
                    "ofd-media",
                    &format!("Unsupported or missing OFD media {file}."),
                );
            }
            for font in root.descendants("Font") {
                let id = font.attr("ID", "");
                let name = font.attr("FamilyName", &font.attr("FontName", "sans-serif"));
                let file = font
                    .first("FontFile")
                    .map(|n| n.text().trim().to_string())
                    .filter(|s| !s.is_empty());
                let bytes =
                    if let Some(bytes) = self.assets.get(&id).or_else(|| self.assets.get(&name)) {
                        Some(bytes.clone())
                    } else if let Some(path) = file
                        .as_ref()
                        .map(|f| resource(f))
                        .transpose()?
                        .filter(|p| self.package.has(p))
                    {
                        Some(Arc::<[u8]>::from(self.package.read(&path)?))
                    } else {
                        None
                    };
                if let Some(bytes) = bytes {
                    match FontData::new(bytes.clone()) {
                        Ok(data) => {
                            res.font_data.insert(id.clone(), data);
                        }
                        Err(_) => diag(
                            &mut self.diagnostics,
                            "ofd-font",
                            &format!("Cannot decode OpenType font {name}."),
                        ),
                    }
                    let clean = id
                        .chars()
                        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
                        .collect::<String>();
                    let family = format!("ofd-font-{}-{clean}", res.defs.len());
                    res.fonts.insert(id.clone(), family.clone());
                    if !res.font_data.contains_key(&id) {
                        res.defs.push(format!(
                            "<style>@font-face{{font-family:'{family}';src:url('{}')}}</style>",
                            data_uri(&bytes, "font/ttf")
                        ));
                    }
                } else {
                    res.fonts.insert(id, name.clone());
                    if let Some(file) = file {
                        diag(
                            &mut self.diagnostics,
                            "ofd-font",
                            &format!("Missing embedded font {file}; using a system font."),
                        );
                    }
                }
            }
            for space in root.descendants("ColorSpace") {
                let id = space.attr("ID", "");
                res.colors.insert(id.clone(), space.clone());
                let profile = space.attr("Profile", "");
                if !profile.is_empty() {
                    let path = resource(&profile)?;
                    let exists = self.package.has(&path);
                    if exists {
                        res.profiles.insert(id, path);
                    }
                    if !exists || !self.host.enabled() {
                        diag(
                            &mut self.diagnostics,
                            "ofd-icc",
                            &if exists {
                                "ICC profile rendering requires a colorConverter host.".into()
                            } else {
                                format!("Missing ICC profile {profile}.")
                            },
                        );
                    }
                }
            }
            for n in root.descendants("CompositeGraphicUnit") {
                res.composites.insert(n.attr("ID", ""), n);
            }
            for n in root.descendants("DrawParam") {
                res.draw.insert(n.attr("ID", ""), n);
            }
        }
        Ok(res)
    }
    fn draw_chain(&self, mut id: String, res: &Resources) -> Result<Vec<Arc<Element>>> {
        let mut chain = Vec::new();
        let mut seen = BTreeSet::new();
        while !id.is_empty() {
            if !seen.insert(id.clone()) {
                return Err(error(
                    "InvalidGeometry",
                    "Cyclic OFD DrawParam inheritance.",
                ));
            }
            if seen.len() > 64 {
                return Err(error(
                    "LimitExceeded",
                    "OFD DrawParam inheritance exceeds the nesting budget.",
                ));
            }
            let Some(draw) = res.draw.get(&id) else { break };
            chain.push(draw.clone());
            id = draw.attr("Relative", "");
        }
        Ok(chain)
    }
    fn cell(
        &mut self,
        node: Arc<Element>,
        res: &mut Resources,
        depth: usize,
        world: Matrix,
    ) -> Result<String> {
        let old_bounds = self.page_bounds.take();
        let hotspots = std::mem::take(&mut self.hotspots);
        let result = self.object(node, res, &mut Vec::new(), depth + 1, &[], world);
        self.page_bounds = old_bounds;
        self.hotspots = hotspots;
        result
    }
    // Object/page traversal is below; all resources remain private to this render.
    fn object(
        &mut self,
        node: Arc<Element>,
        res: &mut Resources,
        text: &mut Vec<String>,
        depth: usize,
        inherited: &[Arc<Element>],
        world: Matrix,
    ) -> Result<String> {
        if depth > 64 {
            return Err(error(
                "LimitExceeded",
                "OFD object nesting exceeds the budget.",
            ));
        }
        self.objects += 1;
        if self.objects > self.limit("maxObjects", 100000) {
            return Err(error("LimitExceeded", "Too many OFD objects."));
        }
        if node.attr("Visible", "true") == "false" {
            return Ok(String::new());
        }
        let kind = match node.local() {
            "Text" => "TextObject",
            "Path" => "PathObject",
            other => other,
        };
        let mut styles = vec![node.clone()];
        styles.extend(self.draw_chain(node.attr("DrawParam", ""), res)?);
        styles.extend_from_slice(inherited);
        let property = |name: &str, fallback: &str| {
            styles
                .iter()
                .find(|s| s.has(name))
                .map(|s| s.attr(name, ""))
                .unwrap_or_else(|| fallback.into())
        };
        let paint_node = |name: &str| styles.iter().find_map(|s| s.child(name));
        if !["TextObject", "PathObject", "ImageObject", "CompositeObject"].contains(&kind) {
            if ![
                "Page",
                "Content",
                "Layer",
                "PageBlock",
                "Appearance",
                "CellContent",
                "CompositeGraphicUnit",
            ]
            .contains(&kind)
            {
                return Ok(String::new());
            }
            let inherited = if kind == "Layer" {
                let mut v = self.draw_chain(node.attr("DrawParam", ""), res)?;
                v.extend_from_slice(inherited);
                v
            } else {
                inherited.to_vec()
            };
            let mut output = String::new();
            for child in node.children("") {
                output.push_str(&self.object(child, res, text, depth + 1, &inherited, world)?);
            }
            return Ok(output);
        }
        let [x, y, w, h] = bounds(&node);
        let raw_matrix = numbers(&node.attr("CTM", ""));
        if let Some([left, top, width, height]) = self.page_bounds {
            if node.has("Boundary") {
                let corners =
                    [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(|p| point(world, p));
                let min_x = corners.iter().map(|p| p[0]).fold(f64::INFINITY, f64::min);
                let max_x = corners
                    .iter()
                    .map(|p| p[0])
                    .fold(f64::NEG_INFINITY, f64::max);
                let min_y = corners.iter().map(|p| p[1]).fold(f64::INFINITY, f64::min);
                let max_y = corners
                    .iter()
                    .map(|p| p[1])
                    .fold(f64::NEG_INFINITY, f64::max);
                if max_x <= left || min_x >= left + width || max_y <= top || min_y >= top + height {
                    return Ok(String::new());
                }
            }
        }
        for action in actions(&node)? {
            self.hotspots.push(json!({"objectId":node.attr("ID",""),"region":action.get("region").cloned().unwrap_or_else(||json!(format!("M 0 0 L {w} 0 L {w} {h} L 0 {h} Z"))),"actions":[action],"transform":multiply(world,[1.0,0.0,0.0,1.0,x,y])}));
        }
        let local = matrix(&node.attr("CTM", ""));
        let to_page = multiply(world, multiply([1.0, 0.0, 0.0, 1.0, x, y], local));
        let mut paint_bounds = [0.0, 0.0, w, h];
        if w > 0.0 && h > 0.0 {
            if (local[0] * local[3] - local[1] * local[2]).abs() < 1e-15 {
                return Ok(String::new());
            }
            let inv = inverse(local)?;
            let points = [[0.0, 0.0], [w, 0.0], [0.0, h], [w, h]].map(|p| point(inv, p));
            let left = points.iter().map(|p| p[0]).fold(f64::INFINITY, f64::min);
            let top = points.iter().map(|p| p[1]).fold(f64::INFINITY, f64::min);
            paint_bounds = [
                left,
                top,
                points
                    .iter()
                    .map(|p| p[0])
                    .fold(f64::NEG_INFINITY, f64::max)
                    - left,
                points
                    .iter()
                    .map(|p| p[1])
                    .fold(f64::NEG_INFINITY, f64::max)
                    - top,
            ];
        }
        let fill_node = paint_node("FillColor");
        let stroke_node = paint_node("StrokeColor");
        let fill = self.paint(
            fill_node.clone(),
            "black",
            res,
            paint_bounds,
            to_page,
            depth,
        )?;
        let stroke = self.paint(
            stroke_node.clone(),
            if kind == "TextObject" {
                "none"
            } else {
                "black"
            },
            res,
            paint_bounds,
            to_page,
            depth,
        )?;
        let alpha = |s: &str| num(s, 255.0).clamp(0.0, 255.0) / 255.0;
        let opacity = alpha(&property("Alpha", "255"));
        let width = num(&property("LineWidth", ""), 0.353);
        let scale = stroke_scale(to_page)
            * if kind == "TextObject" {
                num(&node.attr("HScale", ""), 1.0).abs().min(1.0)
            } else {
                1.0
            };
        let miter = num(&property("MiterLimit", ""), 3.528);
        let device_width = line_width(width, scale, 1.0)?;
        let cap = property("Cap", "");
        let cap = match cap.as_str() {
            "Round" => "round",
            "Square" => "square",
            _ => "butt",
        };
        let join = property("Join", "");
        let join = match join.as_str() {
            "Round" => "round",
            "Bevel" => "bevel",
            _ => "miter",
        };
        let dash = property("DashPattern", "");
        let stroke_attrs=format!("data-ofd-line-width=\"{width}\" data-ofd-stroke-scale=\"{scale}\" data-ofd-miter-length=\"{miter}\" stroke-width=\"{device_width}\" stroke-linecap=\"{cap}\" stroke-linejoin=\"{join}\" stroke-miterlimit=\"{}\"{}",(miter/device_width).max(1.0),if dash.is_empty(){String::new()}else{format!(" stroke-dasharray=\"{}\" stroke-dashoffset=\"{}\"",list(&numbers(&dash)),num(&property("DashOffset",""),0.0))});
        let paint_attrs = format!(
            "fill-opacity=\"{}\" stroke-opacity=\"{}\"",
            alpha(
                &fill_node
                    .as_ref()
                    .map(|n| n.attr("Alpha", "255"))
                    .unwrap_or("255".into())
            ),
            alpha(
                &stroke_node
                    .as_ref()
                    .map(|n| n.attr("Alpha", "255"))
                    .unwrap_or("255".into())
            )
        );
        let mut border_svg = String::new();
        let mut content = match kind {
            "TextObject" => {
                let font_id = node.attr("Font", "");
                let paint = TextPaint {
                    fill: if property("Fill", "true") == "false" {
                        "none".into()
                    } else {
                        fill
                    },
                    stroke: if property("Stroke", "false") == "true" {
                        stroke
                    } else {
                        "none".into()
                    },
                    stroke_attrs,
                    paint_attrs,
                };
                let glyph_limit = self
                    .limit("maxObjects", 100000)
                    .saturating_sub(self.objects);
                let byte_limit = self.max_bytes().saturating_sub(self.generated);
                text::render(
                    &node,
                    res.fonts
                        .get(&font_id)
                        .map(String::as_str)
                        .unwrap_or("sans-serif"),
                    res.font_data.get(&font_id),
                    paint,
                    text,
                    &mut self.diagnostics,
                    glyph_limit,
                    byte_limit,
                )?
            }
            "ImageObject" => {
                let primary = res.images.get(&node.attr("ResourceID", ""));
                let substitute = res.images.get(&node.attr("Substitution", ""));
                let image = if self.options["useImageSubstitutions"] == true {
                    substitute.or(primary)
                } else {
                    primary.or(substitute)
                }
                .cloned();
                let iw = if raw_matrix.len() == 6 { 1.0 } else { w };
                let ih = if raw_matrix.len() == 6 { 1.0 } else { h };
                let mut image_content = String::new();
                if let Some(image) = image {
                    image_content=format!("<image href=\"{image}\" width=\"{iw}\" height=\"{ih}\" preserveAspectRatio=\"none\"/>");
                    if let Some(mask) = res.images.get(&node.attr("ImageMask", "")).cloned() {
                        let id = format!("ofd-image-mask-{}", self.clip_id);
                        self.clip_id += 1;
                        res.defs.push(format!("<mask id=\"{id}\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"{iw}\" height=\"{ih}\"><image href=\"{mask}\" width=\"{iw}\" height=\"{ih}\" preserveAspectRatio=\"none\"/></mask>"));
                        image_content = format!("<g mask=\"url(#{id})\">{image_content}</g>");
                    } else if !node.attr("ImageMask", "").is_empty() {
                        diag(
                            &mut self.diagnostics,
                            "ofd-image-mask",
                            &format!("Missing image mask {}.", node.attr("ImageMask", "")),
                        );
                    }
                } else {
                    diag(
                        &mut self.diagnostics,
                        "ofd-image",
                        &format!("Missing image resource {}.", node.attr("ResourceID", "")),
                    );
                }
                if let Some(border) = node.child("Border") {
                    let color = self.paint(
                        border.child("BorderColor"),
                        "black",
                        res,
                        [0.0, 0.0, w, h],
                        multiply(world, [1.0, 0.0, 0.0, 1.0, x, y]),
                        depth,
                    )?;
                    let dash = border.attr("DashPattern", "");
                    border_svg=format!("<rect x=\"0\" y=\"0\" width=\"{w}\" height=\"{h}\" rx=\"{}\" ry=\"{}\" fill=\"none\" stroke=\"{color}\" stroke-width=\"{}\" stroke-dasharray=\"{}\" stroke-dashoffset=\"{}\"/>",num(&border.attr("HorizonalCornerRadius",""),0.0),num(&border.attr("VerticalCornerRadius",""),0.0),num(&border.attr("LineWidth",""),0.353),if dash.is_empty(){"none".into()}else{list(&numbers(&dash))},num(&border.attr("DashOffset",""),0.0));
                }
                image_content
            }
            "CompositeObject" => {
                if let Some(unit) = res.composites.get(&node.attr("ResourceID", "")).cloned() {
                    self.object(unit, res, text, depth + 1, &styles[1..], to_page)?
                } else {
                    diag(
                        &mut self.diagnostics,
                        "ofd-composite",
                        &format!(
                            "Missing composite resource {}.",
                            node.attr("ResourceID", "")
                        ),
                    );
                    String::new()
                }
            }
            _ => {
                let data = node
                    .child("AbbreviatedData")
                    .map(|n| n.text())
                    .unwrap_or_default();
                format!("<path d=\"{}\" fill=\"{}\" fill-rule=\"{}\" stroke=\"{}\" {stroke_attrs} {paint_attrs}/>",escape(&path(&data)?),if property("Fill","false")=="true"{fill}else{"none".into()},if node.attr("Rule","")=="Even-Odd"{"evenodd"}else{"nonzero"},if property("Stroke","true")=="false"{"none".into()}else{stroke})
            }
        };
        if kind == "CompositeObject" {
            if let Some(unit) = res.composites.get(&node.attr("ResourceID", "")) {
                let width = num(&unit.attr("Width", ""), 0.0);
                let height = num(&unit.attr("Height", ""), 0.0);
                if width != 0.0 && height != 0.0 {
                    content=format!("<svg width=\"{width}\" height=\"{height}\" overflow=\"hidden\">{content}</svg>");
                }
            }
        }
        content = format!(
            "<g transform=\"matrix({})\">{content}</g>{border_svg}",
            list(&local)
        );
        for clip in node.child("Clips").unwrap_or(node.clone()).children("Clip") {
            let mut shapes = String::new();
            for area in clip.children("Area") {
                let styles = self.draw_chain(area.attr("DrawParam", ""), res)?;
                for shape in area
                    .children("")
                    .into_iter()
                    .filter(|n| ["Path", "Text"].contains(&n.local()))
                {
                    let shape =
                        self.object(shape, res, &mut Vec::new(), depth + 1, &styles, world)?;
                    shapes.push_str(&format!(
                        "<g transform=\"matrix({})\">{}</g>",
                        list(&matrix(&area.attr("CTM", ""))),
                        white_clip(shape)
                    ));
                }
            }
            let id = format!("ofd-clip-{}", self.clip_id);
            self.clip_id += 1;
            res.defs.push(format!("<mask id=\"{id}\" maskUnits=\"userSpaceOnUse\" maskContentUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"{w}\" height=\"{h}\" style=\"mask-type:alpha\">{shapes}</mask>"));
            content = format!("<g mask=\"url(#{id})\">{content}</g>");
        }
        if node.has("Boundary") {
            if w > 0.0 && h > 0.0 {
                let id = format!("ofd-boundary-{}", self.clip_id);
                self.clip_id += 1;
                res.defs.push(format!("<clipPath id=\"{id}\" clipPathUnits=\"userSpaceOnUse\"><rect width=\"{w}\" height=\"{h}\"/></clipPath>"));
                content = format!("<g clip-path=\"url(#{id})\">{content}</g>");
            } else {
                content.clear();
            }
        }
        let svg =
            format!("<g transform=\"translate({x} {y})\" opacity=\"{opacity}\">{content}</g>");
        if kind != "CompositeObject" {
            self.generated = self.generated.saturating_add(svg.len());
            if self.generated > self.max_bytes() {
                return Err(error(
                    "LimitExceeded",
                    "OFD SVG output exceeds the size budget.",
                ));
            }
        }
        Ok(svg)
    }
    fn render_page(
        &mut self,
        node: Arc<Element>,
        res: &mut Resources,
        text: &mut Vec<String>,
        stack: &mut BTreeSet<String>,
    ) -> Result<String> {
        let mut background = String::new();
        let mut foreground = String::new();
        for template in node.children("Template") {
            let Some((path, z_order)) =
                res.templates.get(&template.attr("TemplateID", "")).cloned()
            else {
                diag(
                    &mut self.diagnostics,
                    "ofd-template",
                    &format!("Missing template {}.", template.attr("TemplateID", "")),
                );
                continue;
            };
            if stack.contains(&path) || stack.len() >= 64 {
                return Err(error(
                    "InvalidGeometry",
                    "Cyclic or excessively nested OFD template.",
                ));
            }
            let root = self.xml(&path)?;
            let mut resources = self.resources(&root, &path, Some(res))?;
            stack.insert(path.clone());
            let svg = self.render_page(root, &mut resources, text, stack)?;
            stack.remove(&path);
            let start = res.defs.len();
            res.defs.extend(resources.defs.into_iter().skip(start));
            if template.attr("ZOrder", &z_order) == "Foreground" {
                foreground.push_str(&svg);
            } else {
                background.push_str(&svg);
            }
        }
        Ok(background + &self.object(node, res, text, 0, &[], IDENTITY)? + &foreground)
    }
    fn annotations(
        &mut self,
        document: &Element,
        path: &str,
    ) -> Result<BTreeMap<String, Vec<Arc<Element>>>> {
        let mut result = BTreeMap::new();
        let Some(reference) = document
            .first("Annotations")
            .map(|n| n.text().trim().to_string())
            .filter(|s| !s.is_empty())
        else {
            return Ok(result);
        };
        let location = resolve_path(path, &reference)?;
        if !self.package.has(&location) {
            diag(
                &mut self.diagnostics,
                "ofd-annotation",
                &format!("Missing annotation index {location}."),
            );
            return Ok(result);
        }
        let root = self.xml(&location)?;
        for page in root.children("Page") {
            if let Some(file) = page
                .first("FileLoc")
                .map(|n| n.text().trim().to_string())
                .filter(|s| !s.is_empty())
            {
                let file = resolve_path(&location, &file)?;
                result.insert(page.attr("PageID", ""), self.xml(&file)?.children("Annot"));
            }
        }
        Ok(result)
    }
    fn stamps(&mut self, body: &Element) -> Result<BTreeMap<String, String>> {
        let mut out = BTreeMap::<String, String>::new();
        for reference in body.descendants("Signatures") {
            let path = resolve_path("OFD.xml", reference.text().trim())?;
            let root = self.xml(&path)?;
            for signature in root.descendants("Signature") {
                let signature_path = resolve_path(&path, &signature.attr("BaseLoc", ""))?;
                let signature = self.xml(&signature_path)?;
                let seal = signature
                    .first("Seal")
                    .and_then(|n| n.first("BaseLoc"))
                    .map(|n| n.text().trim().to_string())
                    .filter(|s| !s.is_empty())
                    .or_else(|| {
                        signature
                            .first("SignedValue")
                            .map(|n| n.text().trim().to_string())
                            .filter(|s| !s.is_empty())
                    });
                let bytes = seal
                    .map(|s| resolve_path(&signature_path, &s))
                    .transpose()?
                    .filter(|p| self.package.has(p))
                    .map(|p| self.package.read(&p))
                    .transpose()?;
                let image = bytes.as_ref().and_then(|b| {
                    raster_mime(b)
                        .map(|m| data_uri(b, m))
                        .or_else(|| stamp_image(b))
                });
                diag(&mut self.diagnostics,"signature-unverified","Electronic signatures are not verified; conversion does not preserve signature validity.");
                let Some(image) = image else {
                    diag(
                        &mut self.diagnostics,
                        "ofd-seal",
                        "The seal image could not be decoded.",
                    );
                    continue;
                };
                for stamp in signature.descendants("StampAnnot") {
                    let [x, y, w, h] = bounds(&stamp);
                    let clip = numbers(&stamp.attr("Clip", ""));
                    let seal=format!("<image href=\"{image}\" x=\"{x}\" y=\"{y}\" width=\"{w}\" height=\"{h}\" preserveAspectRatio=\"none\"/>");
                    let seal = if clip.len() == 4 {
                        format!("<svg x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" viewBox=\"{} {} {} {}\" overflow=\"hidden\">{seal}</svg>",x+clip[0],y+clip[1],clip[2],clip[3],x+clip[0],y+clip[1],clip[2],clip[3])
                    } else {
                        seal
                    };
                    out.entry(stamp.attr("PageRef", ""))
                        .or_default()
                        .push_str(&seal);
                }
            }
        }
        Ok(out)
    }
    fn document(mut self) -> Result<Value> {
        let ofd = self.xml("OFD.xml")?;
        if ofd.local() != "OFD" {
            return Err(error("InvalidXml", "Invalid OFD root element."));
        }
        let bodies = ofd.children("DocBody");
        let selected = if let Some(index) = self.options.get("documentIndex") {
            let index = index
                .as_u64()
                .and_then(|i| usize::try_from(i).ok())
                .filter(|i| *i < bodies.len())
                .ok_or_else(|| {
                    error("InvalidRange", "Document index is outside the OFD package.")
                })?;
            vec![index]
        } else {
            (0..bodies.len()).collect()
        };
        let mut pages = Vec::new();
        let mut svg_bytes = 0_usize;
        for index in selected {
            let seals = self.stamps(&bodies[index])?;
            let path =
                metadata::document_path(self.package, index, self.options["version"].as_str())?;
            let document = self.xml(&path)?;
            let resources = self.resources(&document, &path, None)?;
            let annotations = self.annotations(&document, &path)?;
            let default_box = document
                .first("CommonData")
                .and_then(|n| n.first("PhysicalBox"))
                .map(|n| n.text());
            let page_list = document
                .child("Pages")
                .ok_or_else(|| error("InvalidXml", "OFD document is missing its Pages element."))?;
            for page_ref in page_list.children("Page") {
                if pages.len() >= self.limit("maxPages", 1000) {
                    return Err(error("LimitExceeded", "Too many OFD pages."));
                }
                let diagnostic_start = self.diagnostics.len();
                self.hotspots.clear();
                let page_path = resolve_path(&path, &page_ref.attr("BaseLoc", ""))?;
                let page = self.xml(&page_path)?;
                let mut res = self.resources(&page, &page_path, Some(&resources))?;
                let area = page
                    .child("Area")
                    .and_then(|n| n.first("PhysicalBox"))
                    .map(|n| n.text())
                    .filter(|s| !s.is_empty())
                    .or_else(|| default_box.clone())
                    .unwrap_or("0 0 210 297".into());
                let area = numbers(&area);
                if area.len() != 4
                    || !(area[2] > 0.0 && area[3] > 0.0 && area[2] < 10000.0 && area[3] < 10000.0)
                {
                    return Err(error("InvalidGeometry", "Invalid OFD page dimensions."));
                }
                let [left, top, width, height]: [f64; 4] = area.try_into().unwrap();
                self.page_bounds = Some([left, top, width, height]);
                let mut text = Vec::new();
                let mut content = self.render_page(
                    page.clone(),
                    &mut res,
                    &mut text,
                    &mut BTreeSet::from([page_path]),
                )?;
                if let Some(items) = annotations.get(&page_ref.attr("ID", "")) {
                    for annot in items {
                        if annot.attr("Visible", "true") == "false"
                            || (self.options["intent"] == "print"
                                && annot.attr("Print", "true") == "false")
                        {
                            continue;
                        }
                        let Some(appearance) = annot.child("Appearance") else {
                            diag(
                                &mut self.diagnostics,
                                "ofd-annotation",
                                "An annotation has no drawable appearance.",
                            );
                            continue;
                        };
                        let [x, y, _, _] = bounds(&appearance);
                        let svg = self.object(
                            appearance,
                            &mut res,
                            &mut text,
                            0,
                            &[],
                            [1.0, 0.0, 0.0, 1.0, x, y],
                        )?;
                        content.push_str(&format!("<g transform=\"translate({x} {y})\">{svg}</g>"));
                    }
                }
                if let Some(seal) = seals.get(&page_ref.attr("ID", "")) {
                    content.push_str(seal);
                }
                let svg=format!("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{}\" height=\"{}\" viewBox=\"0 0 {} {}\"><defs>{}</defs><rect width=\"100%\" height=\"100%\" fill=\"white\"/><g transform=\"scale({MM}) translate({} {})\">{content}</g></svg>",width*MM,height*MM,width*MM,height*MM,res.defs.join(""),if left==0.0{0.0}else{-left},if top==0.0{0.0}else{-top});
                svg_bytes = svg_bytes.saturating_add(svg.len());
                if svg_bytes > self.max_bytes() {
                    return Err(error(
                        "LimitExceeded",
                        "OFD SVG output exceeds the size budget.",
                    ));
                }
                for diagnostic in self.diagnostics.iter_mut().skip(diagnostic_start) {
                    if diagnostic.get("page").is_none() {
                        diagnostic["page"] = json!(pages.len());
                    }
                }
                pages.push(json!({"name":format!("Page {}",pages.len()+1),"id":page_ref.attr("ID",""),"documentIndex":index,"origin":[left,top],"actions":actions(&page)?,"hotspots":self.hotspots,"width":width*MM,"height":height*MM,"text":text.join("\n"),"svg":svg}));
            }
        }
        if pages.is_empty() {
            return Err(error("InvalidXml", "OFD document contains no pages."));
        }
        let text = pages
            .iter()
            .map(|p| p["text"].as_str().unwrap())
            .collect::<Vec<_>>()
            .join("\n\u{c}\n");
        let html = pages
            .iter()
            .map(|p| format!("<section>{}</section>", p["svg"].as_str().unwrap()))
            .collect::<String>();
        let documents = self.package.describe(&self.options)?;
        Ok(
            json!({"format":"ofd","documents":documents,"pages":pages,"sheets":[],"text":text,"html":html,"markdown":text,"diagnostics":self.diagnostics}),
        )
    }
}
fn stamp_image(bytes: &[u8]) -> Option<String> {
    for i in 0..bytes.len().saturating_sub(8) {
        if bytes[i] != 4 {
            continue;
        }
        let mut n = bytes[i + 1] as usize;
        let mut offset = i + 2;
        if n & 128 != 0 {
            let count = n & 127;
            if count < 1 || count > 4 {
                continue;
            }
            n = 0;
            for _ in 0..count {
                n = n * 256 + bytes[offset] as usize;
                offset += 1;
            }
        }
        if n < 8 || offset.checked_add(n).is_none_or(|end| end > bytes.len()) {
            continue;
        }
        let image = &bytes[offset..offset + n];
        if let Some(mime) = raster_mime(image) {
            return Some(data_uri(image, mime));
        }
    }
    None
}
fn white_clip(mut svg: String) -> String {
    let mut cursor = 0;
    while let Some(pos) = svg[cursor..].find("<text ") {
        let start = cursor + pos;
        let Some(end) = svg[start..].find('>') else {
            break;
        };
        let end = start + end;
        if svg[start..end].contains("fill=\"transparent\"") {
            if let Some(close) = svg[end..].find("</text>") {
                svg.replace_range(start..end + close + 7, "");
                cursor = start;
                continue;
            }
        }
        cursor = end + 1;
    }
    for attr in ["fill=\"", "stroke=\""] {
        let mut cursor = 0;
        while let Some(pos) = svg[cursor..].find(attr) {
            let start = cursor + pos + attr.len();
            let Some(end) = svg[start..].find('"') else {
                break;
            };
            let end = start + end;
            if &svg[start..end] != "none" {
                svg.replace_range(start..end, "white");
                cursor = start + 6;
            } else {
                cursor = end + 1;
            }
        }
    }
    svg
}
pub fn render(
    package: &mut Package,
    options: Value,
    assets: &Assets,
    host: &dyn ColorHost,
) -> Result<Value> {
    Renderer {
        package,
        assets,
        host,
        options,
        xml_cache: BTreeMap::new(),
        diagnostics: Vec::new(),
        objects: 0,
        clip_id: 0,
        generated: 0,
        hotspots: Vec::new(),
        page_bounds: None,
    }
    .document()
}
