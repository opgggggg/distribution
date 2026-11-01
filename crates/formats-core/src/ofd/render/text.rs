use super::super::write::escape;
use super::{
    diag,
    dom::Element,
    geometry::{list, num},
};
use crate::{error, Result};
use serde_json::Value;
use std::{collections::BTreeMap, sync::Arc};
use ttf_parser::{Face, GlyphId, OutlineBuilder};
#[derive(Clone)]
pub struct FontData {
    pub bytes: Arc<[u8]>,
    pub subfamily: String,
}
impl FontData {
    pub fn new(bytes: Arc<[u8]>) -> Result<Self> {
        let face =
            Face::parse(&bytes, 0).map_err(|_| error("InvalidFont", "Invalid OpenType font."))?;
        let subfamily = face
            .names()
            .into_iter()
            .filter(|n| n.name_id == 2)
            .find_map(|n| n.to_string())
            .unwrap_or_default();
        Ok(Self { bytes, subfamily })
    }
}
struct Outline {
    output: String,
    scale: f64,
}
impl Outline {
    fn p(&self, x: f32, y: f32) -> String {
        list(&[x as f64 * self.scale, -(y as f64) * self.scale])
    }
}
impl OutlineBuilder for Outline {
    fn move_to(&mut self, x: f32, y: f32) {
        self.output.push_str(&format!("M{}", self.p(x, y)));
    }
    fn line_to(&mut self, x: f32, y: f32) {
        self.output.push_str(&format!("L{}", self.p(x, y)));
    }
    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        self.output
            .push_str(&format!("Q{} {}", self.p(x1, y1), self.p(x, y)));
    }
    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        self.output.push_str(&format!(
            "C{} {} {}",
            self.p(x1, y1),
            self.p(x2, y2),
            self.p(x, y)
        ));
    }
    fn close(&mut self) {
        self.output.push('Z');
    }
}
fn decode(s: &str) -> String {
    let mut units = Vec::new();
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\\' {
            let next = chars.clone().take(4).collect::<String>();
            if next.len() == 4 && next.bytes().all(|c| c.is_ascii_hexdigit()) {
                for _ in 0..4 {
                    chars.next();
                }
                units.push(u16::from_str_radix(&next, 16).unwrap());
                continue;
            }
        }
        let mut pair = [0; 2];
        units.extend_from_slice(c.encode_utf16(&mut pair));
    }
    String::from_utf16_lossy(&units)
}
fn advances(s: &str, limit: usize) -> Result<Vec<f64>> {
    let t = s.split_whitespace().collect::<Vec<_>>();
    let mut out = Vec::new();
    let mut i = 0;
    while i < t.len() {
        let mut count = 1.0;
        if t[i] == "g" {
            i += 1;
            count = t.get(i).and_then(|s| s.parse().ok()).unwrap_or(f64::NAN);
            i += 1;
        }
        let value = t
            .get(i)
            .and_then(|s| s.parse::<f64>().ok())
            .filter(|n| n.is_finite())
            .ok_or_else(|| error("InvalidGeometry", "Invalid OFD glyph advances."))?;
        if !count.is_finite()
            || count < 0.0
            || count.fract() != 0.0
            || count > 9_007_199_254_740_991.0
        {
            return Err(error("InvalidGeometry", "Invalid OFD glyph advances."));
        }
        out.extend(
            std::iter::repeat(value).take((count as usize).min(limit.saturating_sub(out.len()))),
        );
        i += 1;
    }
    Ok(out)
}
pub struct TextPaint {
    pub fill: String,
    pub stroke: String,
    pub stroke_attrs: String,
    pub paint_attrs: String,
}
struct Run {
    code: Arc<Element>,
    value: String,
    chars: Vec<char>,
    offset: usize,
    x: f64,
    y: f64,
}
pub fn render(
    node: &Element,
    family: &str,
    font: Option<&FontData>,
    paint: TextPaint,
    text: &mut Vec<String>,
    diagnostics: &mut Vec<Value>,
    glyph_limit: usize,
    byte_limit: usize,
) -> Result<String> {
    let size = num(&node.attr("Size", ""), 3.5);
    let hscale = num(&node.attr("HScale", ""), 1.0);
    let direction = num(&node.attr("CharDirection", ""), 0.0);
    if size <= 0.0
        || hscale <= 0.0
        || ![0.0, 90.0, 180.0, 270.0].contains(&direction)
        || ![0.0, 90.0, 180.0, 270.0].contains(&num(&node.attr("ReadDirection", ""), 0.0))
    {
        return Err(error(
            "InvalidGeometry",
            "Invalid OFD text size, scale or direction.",
        ));
    }
    let face = font
        .map(|f| {
            Face::parse(&f.bytes, 0).map_err(|_| error("InvalidFont", "Invalid OpenType font."))
        })
        .transpose()?;
    let (mut start_x, mut start_y, mut offset) = (0.0, 0.0, 0);
    let mut runs = Vec::new();
    let mut characters = Vec::new();
    for code in node.children("TextCode") {
        let value = decode(&code.text());
        let chars = value.chars().collect::<Vec<_>>();
        text.push(value.clone());
        if code.has("X") {
            start_x = num(&code.attr("X", ""), 0.0);
        }
        if code.has("Y") {
            start_y = num(&code.attr("Y", ""), 0.0);
        }
        runs.push(Run {
            code,
            value,
            chars: chars.clone(),
            offset,
            x: start_x,
            y: start_y,
        });
        offset += chars.len();
        characters.extend(chars);
    }
    let mut maps = BTreeMap::new();
    for cg in node.children("CGTransform") {
        let start = num(&cg.attr("CodePosition", ""), 0.0);
        let count = num(&cg.attr("CodeCount", ""), 1.0);
        let glyph_count = num(&cg.attr("GlyphCount", ""), 1.0);
        let glyphs = cg
            .first("Glyphs")
            .map(|n| n.text())
            .unwrap_or_default()
            .split_whitespace()
            .map(|v| v.parse::<f64>().unwrap_or(f64::NAN))
            .collect::<Vec<_>>();
        if start.fract() != 0.0
            || count.fract() != 0.0
            || count < 1.0
            || start < 0.0
            || start + count > offset as f64
            || glyph_count != glyphs.len() as f64
            || glyph_count < 1.0
        {
            return Err(error("InvalidGeometry", "Invalid OFD CGTransform range."));
        }
        maps.insert(start as usize, (count as usize, glyphs));
    }
    let mut stack = vec![
        family,
        "Noto Sans CJK SC",
        "Source Han Sans SC",
        "PingFang SC",
        "Microsoft YaHei",
        "Songti SC",
        "Arial Unicode MS",
    ]
    .into_iter()
    .map(|s| format!("'{}'", s.replace('\\', "\\\\").replace('\'', "\\'")))
    .collect::<Vec<_>>()
    .join(",");
    stack.push_str(",sans-serif");
    let attrs = format!(
        "fill=\"{}\" stroke=\"{}\" {} {}",
        paint.fill, paint.stroke, paint.stroke_attrs, paint.paint_attrs
    );
    let font_attrs=format!("font-family=\"{}\" font-size=\"{size}\" font-weight=\"{}\" font-style=\"{}\" xml:space=\"preserve\"",escape(&stack),escape(&node.attr("Weight","400")),if node.attr("Italic","")=="true"{"italic"}else{"normal"});
    if !maps.is_empty() && font.is_none() {
        diag(
            diagnostics,
            "ofd-glyphs",
            "Glyph-index mapping requires its embedded font or a caller-supplied matching font.",
        );
    }
    let mut output = String::new();
    let mut consumed = 0_usize;
    let mut total_glyphs = 0_usize;
    for run in runs {
        let mut groups = Vec::new();
        let mut i = consumed.saturating_sub(run.offset);
        while i < run.chars.len() {
            let mapped = maps.get(&(run.offset + i));
            let count = if font.is_some() {
                mapped.map(|m| m.0).unwrap_or(1)
            } else {
                1
            };
            let value = characters[run.offset + i..(run.offset + i + count).min(characters.len())]
                .iter()
                .collect::<String>();
            let glyphs = face.as_ref().map(|f| {
                mapped.map(|m| m.1.clone()).unwrap_or_else(|| {
                    vec![f.glyph_index(run.chars[i]).unwrap_or(GlyphId(0)).0 as f64]
                })
            });
            groups.push((value, glyphs));
            i += count;
            consumed = run.offset + i;
        }
        let count = groups
            .iter()
            .map(|(s, g)| {
                g.as_ref()
                    .map(Vec::len)
                    .unwrap_or_else(|| s.chars().count())
            })
            .sum::<usize>();
        total_glyphs = total_glyphs.saturating_add(count);
        if total_glyphs > glyph_limit {
            return Err(error(
                "LimitExceeded",
                "OFD glyph count exceeds the object budget.",
            ));
        }
        let dx = advances(&run.code.attr("DeltaX", ""), count)?;
        let dy = advances(&run.code.attr("DeltaY", ""), count)?;
        let (mut x, mut y, mut index) = (run.x, run.y, 0);
        let advance = |x: &mut f64, y: &mut f64, index: &mut usize| {
            *x += dx.get(*index).or(dx.last()).copied().unwrap_or(0.0);
            *y += dy.get(*index).or(dy.last()).copied().unwrap_or(0.0);
            *index += 1;
        };
        if font.is_none() && direction == 0.0 && hscale == 1.0 {
            let mut xs = Vec::new();
            let mut ys = Vec::new();
            for _ in &run.chars {
                xs.push(x);
                ys.push(y);
                advance(&mut x, &mut y, &mut index);
            }
            output.push_str(&format!(
                "<text {font_attrs} {attrs} x=\"{}\" y=\"{}\">{}</text>",
                list(&xs),
                list(&ys),
                escape(&run.value)
            ));
        } else {
            for (value, glyphs) in groups {
                let (first_x, first_y) = (x, y);
                if let (Some(glyphs), Some(face), Some(font)) = (glyphs, face.as_ref(), font) {
                    for id in glyphs {
                        if id.fract() != 0.0 || id < 0.0 || id >= face.number_of_glyphs() as f64 {
                            return Err(error("InvalidFont", format!("Invalid glyph index {id}.")));
                        }
                        let name = font.subfamily.to_ascii_lowercase();
                        let italic = node.attr("Italic", "") == "true"
                            && !name.contains("italic")
                            && !name.contains("oblique");
                        let base_weight =
                            if ["bold", "black", "heavy"].iter().any(|s| name.contains(s)) {
                                700.0
                            } else {
                                400.0
                            };
                        let weight = num(&node.attr("Weight", ""), 400.0);
                        let mut path = Outline {
                            output: String::new(),
                            scale: size / face.units_per_em() as f64,
                        };
                        face.outline_glyph(GlyphId(id as u16), &mut path);
                        let path = escape(&path.output);
                        let transform = format!(
                            "translate({x} {y}) rotate({direction}) scale({hscale} 1){}",
                            if italic { " skewX(-12)" } else { "" }
                        );
                        if weight > base_weight && paint.fill != "none" {
                            let opacity = paint
                                .paint_attrs
                                .split("fill-opacity=\"")
                                .nth(1)
                                .and_then(|s| s.split('"').next())
                                .unwrap_or("1");
                            output.push_str(&format!("<path data-ofd-synthetic-bold=\"true\" fill=\"none\" stroke=\"{}\" stroke-width=\"{}\" stroke-linejoin=\"round\" stroke-opacity=\"{opacity}\" transform=\"{transform}\" d=\"{path}\"/>",paint.fill,size*(weight-base_weight)/5000.0));
                        }
                        output.push_str(&format!(
                            "<path {attrs} transform=\"{transform}\" d=\"{path}\"/>"
                        ));
                        advance(&mut x, &mut y, &mut index);
                    }
                    output.push_str(&format!("<text {font_attrs} fill=\"transparent\" stroke=\"none\" x=\"{first_x}\" y=\"{first_y}\">{}</text>",escape(&value)));
                } else {
                    output.push_str(&format!("<text {font_attrs} {attrs} transform=\"translate({x} {y}) rotate({direction}) scale({hscale} 1)\" x=\"0\" y=\"0\">{}</text>",escape(&value)));
                    advance(&mut x, &mut y, &mut index);
                }
                if output.len() > byte_limit {
                    return Err(error(
                        "LimitExceeded",
                        "OFD text output exceeds the SVG budget.",
                    ));
                }
            }
        }
    }
    Ok(output)
}
