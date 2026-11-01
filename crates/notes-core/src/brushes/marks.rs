use super::{outline::interpolate, polygon, Pass, Stroke};
pub fn pigment(color: &str, amount: f64) -> String {
    let mut result = String::from("#");
    for i in [1, 3, 5] {
        let n = u8::from_str_radix(&color[i..i + 2], 16).unwrap() as f64;
        let v = if amount > 0.0 {
            n + (255.0 - n) * amount
        } else {
            n * (1.0 + amount)
        };
        result += &format!("{:02x}", v.round() as u8);
    }
    result
}
fn noise(position: f64, seed: f64) -> f64 {
    let value = |i: f64| {
        let n = (i as i32)
            .wrapping_add((seed * 37.0).floor() as i32)
            .wrapping_mul(374761393) as u32;
        let n = (n ^ (n >> 13)).wrapping_mul(1274126177);
        (n ^ (n >> 16)) as f64 / 2147483647.5 - 1.0
    };
    let sample = |step: f64| {
        let x = position / step;
        let i = x.floor();
        let f = x - i;
        let u = f * f * (3.0 - 2.0 * f);
        value(i) + (value(i + 1.0) - value(i)) * u
    };
    sample(7.0) * 0.65 + sample(29.0) * 0.35
}
pub(crate) fn ribbon_steps(distance: f64, count: usize) -> usize {
    ((distance / 3.0)
        .ceil()
        .min(64.0)
        .min((5000 / count).max(1) as f64))
    .max(1.0) as usize
}
pub(crate) fn ribbon_samples(s: &Stroke) -> Vec<(super::Point, f64)> {
    let mut points = Vec::new();
    extend_ribbon_samples(s, 0, &mut points);
    points
}
pub(crate) fn extend_ribbon_samples(
    s: &Stroke,
    from: usize,
    points: &mut Vec<(super::Point, f64)>,
) {
    let mut distance = points.last().map_or(0.0, |p| p.1);
    for (i, p) in s.points.iter().enumerate().skip(from) {
        let a = &s.points[i.saturating_sub(1)];
        let d = (p.x - a.x).hypot(p.y - a.y);
        let steps = ribbon_steps(d, s.points.len());
        if i == 0 {
            points.push((p.clone(), 0.0));
        } else {
            for j in 1..=steps {
                let t = j as f64 / steps as f64;
                points.push((interpolate(a, p, t), distance + d * t));
            }
        }
        distance += d;
    }
}
pub(crate) fn ribbon_section(
    s: &Stroke,
    points: &[(super::Point, f64)],
    i: usize,
    offset: f64,
    thickness: f64,
    roughness: f64,
    seed: f64,
) -> [[f64; 2]; 2] {
    let (p, travel) = &points[i];
    let a = &points[i.saturating_sub(1)].0;
    let b = &points[(i + 1).min(points.len() - 1)].0;
    let len = (b.x - a.x).hypot(b.y - a.y);
    let len = if len == 0.0 { 1.0 } else { len };
    let nx = -(b.y - a.y) / len;
    let ny = (b.x - a.x) / len;
    let w = s.width_at(p);
    let shift = (offset + noise(*travel, seed) * roughness * 0.09) * w;
    let half = (thickness * w / 2.0) * (1.0 + noise(*travel, seed + 4.0) * roughness * 0.4);
    [
        [p.x + nx * (shift - half), p.y + ny * (shift - half)],
        [p.x + nx * (shift + half), p.y + ny * (shift + half)],
    ]
}
pub(crate) fn ribbon(
    s: &Stroke,
    offset: f64,
    thickness: f64,
    roughness: f64,
    seed: f64,
    trim: f64,
) -> String {
    let points = ribbon_samples(s);
    let distance = points.last().map_or(0.0, |p| p.1);
    if points.len() == 1 {
        let p = &points[0].0;
        let w = s.width_at(p);
        return format!(
            "M{},{}h{}v{}h{}Z",
            p.x - w * 0.12,
            p.y + (offset - thickness / 2.0) * w,
            w * 0.24,
            thickness * w,
            -w * 0.24
        );
    }
    let mut upper = Vec::new();
    let mut lower = Vec::new();
    for (i, (_, travel)) in points.iter().enumerate() {
        if *travel < trim || *travel > distance - trim * 0.7 {
            continue;
        }
        let [a, b] = ribbon_section(s, &points, i, offset, thickness, roughness, seed);
        upper.push(a);
        lower.push(b);
    }
    upper.extend(lower.into_iter().rev());
    polygon(&upper)
}
pub(crate) struct OilRibbon {
    pub offset: f64,
    pub thickness: f64,
    pub roughness: f64,
    pub seed: f64,
    pub trim: f64,
    pub color: String,
    pub opacity: f64,
}
/// The same bristle specifications serve full native paths and incremental GPU
/// sections. Keep the existing SVG brush as an independent parity reference.
pub(crate) fn chinese_ribbons(s: &Stroke) -> Vec<OilRibbon> {
    let dry = s.setting("dryness", 40.0) / 100.0;
    if dry == 0.0 {
        return vec![];
    }
    (0..17)
        .map(|i| OilRibbon {
            offset: -0.46 + i as f64 / 16.0 * 0.92,
            thickness: 0.035,
            roughness: 0.35,
            seed: (i + 16) as f64,
            trim: 0.0,
            opacity: s.opacity * (0.5 + dry * 0.5),
            color: s.color.clone(),
        })
        .collect()
}
pub(crate) fn oil_ribbons(s: &Stroke) -> Vec<OilRibbon> {
    let texture = s.setting("bristles", 65.0) / 100.0;
    let mut result = vec![OilRibbon {
        offset: 0.0,
        thickness: 0.94,
        roughness: 0.15,
        seed: 4.0,
        trim: 0.0,
        opacity: s.opacity,
        color: pigment(&s.color, -0.05),
    }];
    for i in 0..27 {
        let offset = -0.48 + i as f64 / 26.0 * 0.96;
        let thickness = (0.016 + (i % 4) as f64 * 0.007) * (1.0 + texture * 0.5);
        let tone = noise(i as f64 * 11.0, 3.0) * 0.13;
        result.push(OilRibbon {
            offset,
            thickness,
            roughness: 0.25,
            seed: (i + 13) as f64,
            trim: (i % 5) as f64 * s.width * 0.06,
            opacity: s.opacity * texture * (0.5 + texture * 0.4),
            color: pigment(&s.color, tone),
        });
    }
    result.push(OilRibbon {
        offset: -0.2,
        thickness: 0.012,
        roughness: 0.25,
        seed: 31.0,
        trim: s.width * 0.15,
        opacity: s.opacity * texture * 0.35,
        color: pigment(&s.color, 0.22),
    });
    result
}
pub fn oil(s: &Stroke) -> Vec<Pass> {
    oil_ribbons(s)
        .into_iter()
        .map(|p| {
            Pass::new(
                ribbon(s, p.offset, p.thickness, p.roughness, p.seed, p.trim),
                p.opacity,
            )
            .color(p.color)
        })
        .collect()
}
pub fn graphite(s: &Stroke) -> Vec<Pass> {
    let path = s.path(1.0);
    let mut result = vec![
        Pass::new(path.clone(), s.opacity * 0.035),
        Pass::new(path, s.opacity * 0.8).grain(None),
    ];
    for (i, offset) in [-0.18, 0.0, 0.19].into_iter().enumerate() {
        result.push(Pass::new(
            ribbon(s, offset, 0.065, 0.8, (i + 4) as f64, 0.0),
            s.opacity * 0.22,
        ));
    }
    result
}
pub fn wax(s: &Stroke) -> Vec<Pass> {
    vec![
        Pass::new(ribbon(s, 0.0, 0.98, 0.35, 8.0, 0.0), s.opacity * 0.2),
        Pass::new(ribbon(s, 0.0, 1.0, 0.4, 8.0, 0.0), s.opacity * 0.85).grain(Some("wax")),
        Pass::new(ribbon(s, -0.12, 0.48, 0.6, 21.0, 0.0), s.opacity * 0.25).grain(Some("wax")),
    ]
}
pub fn wash(s: &Stroke) -> Vec<Pass> {
    let water = s.setting("water", 75.0) / 100.0;
    let mut result = Vec::new();
    for (i, scale) in [1.0, 0.96, 0.91, 0.85, 0.78, 0.68].into_iter().enumerate() {
        result.push(Pass::new(
            ribbon(s, 0.0, scale, 0.4 + water * 0.4, 11.0, 0.0),
            s.opacity * (0.018 + i as f64 * 0.012) * (1.3 - water * 0.5),
        ));
    }
    result.push(
        Pass::new(ribbon(s, 0.0, 0.88, 0.5, 11.0, 0.0), s.opacity * 0.14).grain(Some("paper")),
    );
    for offset in [-0.44, 0.44] {
        result.push(Pass::new(
            ribbon(s, offset, 0.035, 0.35, 11.0, 0.0),
            s.opacity * 0.14 * (1.0 - water * 0.5),
        ));
    }
    result
}
pub fn chinese(s: &Stroke) -> Vec<Pass> {
    let dry = s.setting("dryness", 40.0) / 100.0;
    let path = s.path(1.0);
    if dry == 0.0 {
        return vec![Pass::new(path, s.opacity)];
    }
    let mut result = vec![Pass::new(path.clone(), s.opacity * (1.0 - dry * 0.85))];
    for i in 0..17 {
        result.push(
            Pass::new(
                ribbon(
                    s,
                    -0.46 + i as f64 / 16.0 * 0.92,
                    0.035,
                    0.35,
                    (i + 16) as f64,
                    0.0,
                ),
                s.opacity * (0.5 + dry * 0.5),
            )
            .clip(path.clone()),
        );
    }
    result.push(Pass::new(path, s.opacity * dry * 0.12).grain(None));
    result
}
pub fn chisel(s: &Stroke, degrees: f64, aspect: f64, reed: bool) -> String {
    chisel_hulls(s, degrees, aspect, reed)
        .iter()
        .map(|h| polygon(h))
        .collect()
}
pub(crate) fn chisel_hulls(
    s: &Stroke,
    degrees: f64,
    aspect: f64,
    reed: bool,
) -> Vec<Vec<[f64; 2]>> {
    let angle = degrees * std::f64::consts::PI / 180.0;
    let c = angle.cos();
    let d = angle.sin();
    let vertices = |p: &super::Point| {
        let w = s.width_at(p) / 2.0;
        let t = if reed {
            (w * aspect).max(0.25)
        } else {
            w * aspect
        };
        [
            [p.x - c * w - d * t, p.y - d * w + c * t],
            [p.x + c * w - d * t, p.y + d * w + c * t],
            [p.x + c * w + d * t, p.y + d * w - c * t],
            [p.x - c * w + d * t, p.y - d * w - c * t],
        ]
    };
    let cross = |a: [f64; 2], b: [f64; 2], c: [f64; 2]| {
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    };
    let half = |points: Vec<[f64; 2]>| {
        let mut hull: Vec<[f64; 2]> = Vec::new();
        for p in points {
            while hull.len() >= 2 && cross(hull[hull.len() - 2], hull[hull.len() - 1], p) <= 0.0 {
                hull.pop();
            }
            hull.push(p);
        }
        hull.pop();
        hull
    };
    let mut path = Vec::new();
    for (i, p) in s.points.iter().enumerate() {
        let mut points = vertices(p).to_vec();
        points.extend(vertices(&s.points[i.saturating_sub(1)]));
        points.sort_by(|a, b| a[0].total_cmp(&b[0]).then_with(|| a[1].total_cmp(&b[1])));
        let mut hull = half(points.clone());
        points.reverse();
        hull.extend(half(points));
        path.push(hull);
    }
    path
}
pub fn legacy_oil(s: &Stroke) -> Vec<Pass> {
    let texture = s.setting("bristles", 65.0) / 100.0;
    let path = s.path(1.0);
    let mut result = vec![
        Pass::new(path.clone(), s.opacity * (1.0 - texture * 0.35)),
        Pass::new(path, s.opacity * texture * 0.65).grain(None),
    ];
    for scale in [0.82, 0.6, 0.38] {
        result.push(Pass::new(
            s.path(scale),
            s.opacity * (0.18 + texture * 0.18),
        ));
    }
    for (index, offset) in [-0.3, -0.16, 0.0, 0.16, 0.3].into_iter().enumerate() {
        let mut upper = Vec::new();
        let mut lower = Vec::new();
        for (i, p) in s.points.iter().enumerate() {
            let a = &s.points[i.saturating_sub(1)];
            let b = &s.points[(i + 1).min(s.points.len() - 1)];
            let len = (b.x - a.x).hypot(b.y - a.y);
            let len = if len == 0.0 { 1.0 } else { len };
            let nx = -(b.y - a.y) / len;
            let ny = (b.x - a.x) / len;
            let pressure = if s.pressure {
                0.6 + 0.8 * p.pressure
            } else {
                1.0
            };
            let w = s.width * pressure;
            let drift = (i as f64 * 0.37 + offset * 8.0).sin() * 0.008;
            let x = p.x + nx * w * (offset + drift);
            let y = p.y + ny * w * (offset + drift);
            upper.push([x - nx * w * 0.016, y - ny * w * 0.016]);
            lower.push([x + nx * w * 0.016, y + ny * w * 0.016]);
        }
        upper.extend(lower.into_iter().rev());
        result.push(
            Pass::new(polygon(&upper), s.opacity * texture * 0.65)
                .color(pigment(&s.color, if index % 2 == 1 { -0.25 } else { 0.35 })),
        );
    }
    result
}
