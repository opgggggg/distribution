use super::super::codecs::png;
use super::{data_uri, dom::Element, geometry::*, Renderer, Resources};
use crate::{error, Result};
use std::sync::Arc;
type Rgba = [f64; 4];
#[derive(Clone)]
struct Stop {
    at: f64,
    color: Rgba,
}
fn rgb(c: Rgba) -> String {
    format!("rgb({},{},{})", c[0].round(), c[1].round(), c[2].round())
}
fn sample(stops: &[Stop], t: f64) -> Rgba {
    if t <= stops[0].at {
        return stops[0].color;
    }
    for i in 1..stops.len() {
        if t <= stops[i].at {
            let (a, b) = (&stops[i - 1], &stops[i]);
            let f = if b.at == a.at {
                1.0
            } else {
                (t - a.at) / (b.at - a.at)
            };
            return std::array::from_fn(|k| a.color[k] + (b.color[k] - a.color[k]) * f);
        }
    }
    stops.last().unwrap().color
}
struct GradientMap {
    extend: i32,
    kind: u8,
    unit: f64,
    length: f64,
}
impl GradientMap {
    fn new(shade: &Element, length: f64) -> Self {
        Self {
            extend: num(&shade.attr("Extend", ""), 0.0) as i32,
            kind: match shade.attr("MapType", "Direct").as_str() {
                "Direct" => 0,
                "Reflect" => 1,
                _ => 2,
            },
            unit: num(&shade.attr("MapUnit", ""), length),
            length,
        }
    }
    fn position(&self, t: f64) -> Result<Option<f64>> {
        if (t < 0.0 && (self.extend & 1) == 0) || (t > 1.0 && (self.extend & 2) == 0) {
            return Ok(None);
        }
        if self.kind == 0 {
            return Ok(Some(if t.is_nan() {
                f64::NAN
            } else {
                t.clamp(0.0, 1.0)
            }));
        }
        if self.unit <= 0.0 {
            return Err(error(
                "InvalidGeometry",
                "Gradient MapUnit must be positive.",
            ));
        }
        let u = t * self.length / self.unit;
        Ok(Some(if self.kind == 1 {
            1.0 - (((u % 2.0 + 2.0) % 2.0) - 1.0).abs()
        } else {
            (u % 1.0 + 1.0) % 1.0
        }))
    }
}
#[derive(Clone, Copy)]
struct Vertex {
    x: f64,
    y: f64,
    edge: i32,
    color: Rgba,
}
impl Renderer<'_> {
    fn solid(&self, node: Option<&Element>, fallback: Rgba, res: &Resources) -> Result<Rgba> {
        let Some(node) = node else {
            return Ok(fallback);
        };
        let id = node.attr("ColorSpace", &res.default_cs);
        let space = res.colors.get(&id);
        let kind = space.map(|s| s.attr("Type", "RGB")).unwrap_or("RGB".into());
        let bits = space
            .map(|s| num(&s.attr("BitsPerComponent", ""), 8.0))
            .unwrap_or(8.0);
        let max = 2_f64.powf(bits) - 1.0;
        let index = num(&node.attr("Index", ""), -1.0);
        let entry = space.and_then(|s| s.first("Palette")).and_then(|n| {
            if index >= 0.0 && index.fract() == 0.0 {
                n.children("CV").get(index as usize).cloned()
            } else {
                None
            }
        });
        let raw = node.attr("Value", "");
        let raw = if !raw.is_empty() {
            raw
        } else if let Some(entry) = entry {
            entry.text()
        } else {
            match kind.as_str() {
                "CMYK" => "0 0 0 0",
                "Gray" => "0",
                _ => "0 0 0",
            }
            .into()
        };
        let mut values = raw
            .split_whitespace()
            .map(|s| {
                if let Some(hex) = s.strip_prefix('#') {
                    u64::from_str_radix(hex, 16)
                        .map(|v| v as f64)
                        .unwrap_or(f64::NAN)
                } else {
                    s.parse().unwrap_or(f64::NAN)
                }
            })
            .collect::<Vec<f64>>();
        if values.is_empty() {
            values.push(0.0);
        }
        if ![1.0, 2.0, 4.0, 8.0, 16.0].contains(&bits)
            || values
                .iter()
                .any(|n| !n.is_finite() || n.fract() != 0.0 || *n < 0.0 || *n > max)
        {
            return Ok(fallback);
        }
        let v = values.iter().map(|v| v / max).collect::<Vec<_>>();
        let alpha = num(&node.attr("Alpha", ""), 255.0).clamp(0.0, 255.0);
        if self.host.enabled() {
            let rgb =
                self.host
                    .convert(&v, &kind, bits, res.profiles.get(&id).map(String::as_str))?;
            if rgb.iter().any(|n| !n.is_finite() || *n < 0.0 || *n > 255.0) {
                return Err(error("InvalidColor", "Invalid colorConverter RGB result."));
            }
            return Ok([rgb[0], rgb[1], rgb[2], alpha]);
        }
        Ok(match v.len() {
            4 => [
                255.0 * (1.0 - v[0]) * (1.0 - v[3]),
                255.0 * (1.0 - v[1]) * (1.0 - v[3]),
                255.0 * (1.0 - v[2]) * (1.0 - v[3]),
                alpha,
            ],
            1 => [v[0] * 255.0, v[0] * 255.0, v[0] * 255.0, alpha],
            3 => [v[0] * 255.0, v[1] * 255.0, v[2] * 255.0, alpha],
            _ => fallback,
        })
    }
    fn stops(&self, shade: &Element, res: &Resources) -> Result<Vec<Stop>> {
        let segments = shade.children("Segment");
        if segments.len() < 2 {
            return Err(error(
                "InvalidGeometry",
                "An OFD gradient requires at least two segments.",
            ));
        }
        let mut positions = segments
            .iter()
            .map(|s| {
                if s.has("Position") {
                    num(&s.attr("Position", ""), 0.0)
                } else {
                    f64::NAN
                }
            })
            .collect::<Vec<_>>();
        if !positions[0].is_finite() {
            positions[0] = 0.0;
        }
        let last = positions.len() - 1;
        if !positions[last].is_finite() {
            positions[last] = 1.0;
        }
        let mut i = 0;
        while i < last {
            let mut j = i + 1;
            while !positions[j].is_finite() {
                j += 1;
            }
            for k in i + 1..j {
                positions[k] =
                    positions[i] + (positions[j] - positions[i]) * (k - i) as f64 / (j - i) as f64;
            }
            i = j;
        }
        if positions
            .iter()
            .enumerate()
            .any(|(i, p)| *p < 0.0 || *p > 1.0 || (i > 0 && *p < positions[i - 1]))
        {
            return Err(error(
                "InvalidGeometry",
                "Invalid gradient segment positions.",
            ));
        }
        segments
            .iter()
            .enumerate()
            .map(|(i, s)| {
                Ok(Stop {
                    at: positions[i],
                    color: self.solid(s.first("Color").as_deref(), [0.0, 0.0, 0.0, 255.0], res)?,
                })
            })
            .collect()
    }
    pub(super) fn paint(
        &mut self,
        node: Option<Arc<Element>>,
        fallback: &str,
        res: &mut Resources,
        bounds: [f64; 4],
        to_page: Matrix,
        depth: usize,
    ) -> Result<String> {
        let Some(node) = node else {
            return Ok(fallback.into());
        };
        let shade = node.children("").into_iter().find(|n| {
            [
                "Pattern",
                "AxialShd",
                "RadialShd",
                "GouraudShd",
                "LaGouraudShd",
            ]
            .contains(&n.local())
        });
        let Some(shade) = shade else {
            return Ok(rgb(self.solid(Some(&node), [0.0, 0.0, 0.0, 255.0], res)?));
        };
        let id = format!("ofd-paint-{}", self.clip_id);
        self.clip_id += 1;
        if shade.local() == "Pattern" {
            let width = num(&shade.attr("Width", ""), 0.0);
            let height = num(&shade.attr("Height", ""), 0.0);
            let xs = width.max(num(&shade.attr("XStep", ""), width));
            let ys = height.max(num(&shade.attr("YStep", ""), height));
            if width <= 0.0 || height <= 0.0 {
                return Err(error(
                    "InvalidGeometry",
                    "Invalid OFD pattern cell dimensions.",
                ));
            }
            let reflect = shade.attr("ReflectMethod", "Normal");
            let columns = if ["Column", "RowAndColumn"].contains(&reflect.as_str()) {
                2
            } else {
                1
            };
            let rows = if ["Row", "RowAndColumn"].contains(&reflect.as_str()) {
                2
            } else {
                1
            };
            let cell = shade
                .child("CellContent")
                .ok_or_else(|| error("InvalidGeometry", "Pattern is missing CellContent."))?;
            let pm = matrix(&shade.attr("CTM", ""));
            let relative = shade.attr("RelativeTo", "Object") == "Page";
            let content = self.cell(
                cell,
                res,
                depth,
                if relative { pm } else { multiply(to_page, pm) },
            )?;
            res.defs.push(format!("<clipPath id=\"{id}-cell\"><rect width=\"{width}\" height=\"{height}\"/></clipPath>"));
            let mut cells = String::new();
            for y in 0..rows {
                for x in 0..columns {
                    cells.push_str(&format!("<g transform=\"translate({} {}) scale({} {})\"><g clip-path=\"url(#{id}-cell)\">{content}</g></g>",x as f64*xs+if x>0{width}else{0.0},y as f64*ys+if y>0{height}else{0.0},if x>0{-1}else{1},if y>0{-1}else{1}));
                }
            }
            let transform = if relative {
                multiply(inverse(to_page)?, pm)
            } else {
                pm
            };
            res.defs.push(format!("<pattern id=\"{id}\" patternUnits=\"userSpaceOnUse\" width=\"{}\" height=\"{}\" patternTransform=\"matrix({})\">{cells}</pattern>",xs*columns as f64,ys*rows as f64,list(&transform)));
            return Ok(format!("url(#{id})"));
        }
        let [x, y, w, h] = bounds;
        let scale = self.options["paintScale"].as_f64().unwrap_or(MM * 2.0);
        let width = (w * scale).ceil();
        let height = (h * scale).ceil();
        if !(width > 0.0 && height > 0.0) || width * height > 40_000_000.0 {
            return Err(error(
                "LimitExceeded",
                "OFD gradient exceeds its raster budget.",
            ));
        }
        let (width, height) = (width as usize, height as usize);
        let mut pixels = vec![0_u8; width * height * 4];
        if ["GouraudShd", "LaGouraudShd"].contains(&shade.local()) {
            let points = shade
                .children("Point")
                .into_iter()
                .map(|p| {
                    Ok(Vertex {
                        x: num(&p.attr("X", ""), 0.0),
                        y: num(&p.attr("Y", ""), 0.0),
                        edge: num(&p.attr("EdgeFlag", ""), 0.0) as i32,
                        color: self.solid(
                            p.first("Color").as_deref(),
                            [0.0, 0.0, 0.0, 255.0],
                            res,
                        )?,
                    })
                })
                .collect::<Result<Vec<_>>>()?;
            let mut triangles = Vec::new();
            if shade.local() == "LaGouraudShd" {
                let n = num(&shade.attr("VerticesPerRow", ""), 0.0);
                if n.fract() != 0.0 || n < 2.0 || points.len() as f64 % n != 0.0 {
                    return Err(error("InvalidGeometry", "Invalid OFD lattice dimensions."));
                }
                let n = n as usize;
                for i in 0..points.len().saturating_sub(n) {
                    if i % n < n - 1 {
                        triangles.push([points[i], points[i + 1], points[i + n]]);
                        triangles.push([points[i + 1], points[i + n], points[i + n + 1]]);
                    }
                }
            } else {
                let mut last: Option<[Vertex; 3]> = None;
                let mut i = 0;
                while i < points.len() {
                    let p = points[i];
                    if p.edge == 0 {
                        if i + 3 > points.len() {
                            return Err(error("InvalidGeometry", "Incomplete Gouraud triangle."));
                        }
                        last = Some([points[i], points[i + 1], points[i + 2]]);
                        i += 3;
                    } else {
                        let old = last.ok_or_else(|| {
                            error("InvalidGeometry", "Invalid Gouraud triangle continuation.")
                        })?;
                        last = Some(if p.edge == 1 {
                            [old[1], old[2], p]
                        } else {
                            [old[0], old[2], p]
                        });
                        i += 1;
                    }
                    triangles.push(last.unwrap());
                }
            }
            if num(&shade.attr("Extend", ""), 0.0) == 1.0 {
                let back = self.solid(
                    shade.first("BackColor").as_deref(),
                    [0.0, 0.0, 0.0, 255.0],
                    res,
                )?;
                for pixel in pixels.chunks_exact_mut(4) {
                    for k in 0..4 {
                        pixel[k] = back[k] as u8;
                    }
                }
            }
            for [a, b, c] in triangles {
                let det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
                if det == 0.0 {
                    continue;
                }
                let min_x = ((a.x.min(b.x).min(c.x) - x) * scale).floor().max(0.0) as usize;
                let max_x = ((a.x.max(b.x).max(c.x) - x) * scale)
                    .ceil()
                    .min(width as f64)
                    .max(0.0) as usize;
                let min_y = ((a.y.min(b.y).min(c.y) - y) * scale).floor().max(0.0) as usize;
                let max_y = ((a.y.max(b.y).max(c.y) - y) * scale)
                    .ceil()
                    .min(height as f64)
                    .max(0.0) as usize;
                for py in min_y..max_y {
                    for px in min_x..max_x {
                        let sx = x + (px as f64 + 0.5) / scale;
                        let sy = y + (py as f64 + 0.5) / scale;
                        let u = ((b.y - c.y) * (sx - c.x) + (c.x - b.x) * (sy - c.y)) / det;
                        let v = ((c.y - a.y) * (sx - c.x) + (a.x - c.x) * (sy - c.y)) / det;
                        let z = 1.0 - u - v;
                        if u >= -1e-8 && v >= -1e-8 && z >= -1e-8 {
                            for k in 0..4 {
                                pixels[(py * width + px) * 4 + k] =
                                    (a.color[k] * u + b.color[k] * v + c.color[k] * z).round()
                                        as u8;
                            }
                        }
                    }
                }
            }
        } else {
            let start = numbers(&shade.attr("StartPoint", ""));
            let end = numbers(&shade.attr("EndPoint", ""));
            let colors = self.stops(&shade, res)?;
            if start.len() != 2 || end.len() != 2 {
                return Err(error(
                    "InvalidGeometry",
                    "Gradient requires start and end points.",
                ));
            }
            let eccentricity = num(&shade.attr("Eccentricity", ""), 0.0);
            let angle = num(&shade.attr("Angle", ""), 0.0) * std::f64::consts::PI / 180.0;
            let q = (1.0 - eccentricity * eccentricity).sqrt();
            if !(q > 0.0 && q <= 1.0) {
                return Err(error("InvalidGeometry", "Invalid radial eccentricity."));
            }
            let (sin, cos) = (angle.sin(), angle.cos());
            let project = |x: f64, y: f64| [x * cos + y * sin, (-x * sin + y * cos) / q];
            let [cx, cy] = project(end[0] - start[0], end[1] - start[1]);
            let r0 = num(&shade.attr("StartRadius", ""), 0.0);
            let dr = num(&shade.attr("EndRadius", ""), 0.0) - r0;
            let len = (end[0] - start[0]).hypot(end[1] - start[1]);
            let length = if len != 0.0 { len } else { dr.abs() };
            let mapping = GradientMap::new(&shade, length);
            let axial = shade.local() == "AxialShd";
            for py in 0..height {
                for px in 0..width {
                    let [sx, sy] = project(
                        x + (px as f64 + 0.5) / scale - start[0],
                        y + (py as f64 + 0.5) / scale - start[1],
                    );
                    let t = if axial {
                        (sx * cx + sy * cy) / (cx * cx + cy * cy)
                    } else {
                        let a = cx * cx + cy * cy - dr * dr;
                        let b = -2.0 * (sx * cx + sy * cy + r0 * dr);
                        let c = sx * sx + sy * sy - r0 * r0;
                        let disc = b * b - 4.0 * a * c;
                        let mut roots = [0.0; 2];
                        let count = if a.abs() < 1e-12 {
                            if b.abs() < 1e-12 {
                                0
                            } else {
                                roots[0] = -c / b;
                                1
                            }
                        } else if disc < 0.0 {
                            0
                        } else {
                            roots[0] = (-b - disc.sqrt()) / (2.0 * a);
                            roots[1] = (-b + disc.sqrt()) / (2.0 * a);
                            2
                        };
                        let mut candidate: Option<f64> = None;
                        for &t in &roots[..count] {
                            if r0 + dr * t >= 0.0 && mapping.position(t)?.is_some() {
                                candidate = Some(candidate.map_or(t, |old| old.max(t)));
                            }
                        }
                        let Some(t) = candidate else { continue };
                        t
                    };
                    let Some(mapped) = mapping.position(t)? else {
                        continue;
                    };
                    if !mapped.is_finite() {
                        continue;
                    }
                    let color = sample(&colors, mapped);
                    for k in 0..4 {
                        pixels[(py * width + px) * 4 + k] = color[k].round() as u8;
                    }
                }
            }
        }
        let uri = data_uri(&png(width, height, &pixels)?, "image/png");
        self.generated = self.generated.saturating_add(uri.len());
        if self.generated > self.max_bytes() {
            return Err(error(
                "LimitExceeded",
                "OFD paint output exceeds the size budget.",
            ));
        }
        res.defs.push(format!("<pattern id=\"{id}\" patternUnits=\"userSpaceOnUse\" x=\"{x}\" y=\"{y}\" width=\"{w}\" height=\"{h}\"><image x=\"0\" y=\"0\" width=\"{w}\" height=\"{h}\" href=\"{uri}\" preserveAspectRatio=\"none\"/></pattern>"));
        Ok(format!("url(#{id})"))
    }
}
