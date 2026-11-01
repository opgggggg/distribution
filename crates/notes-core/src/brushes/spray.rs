use super::{fixed, outline::interpolate, Pass, Point, Stroke};
fn dot(path: &mut String, x: f64, y: f64, r: f64) {
    *path += &format!(
        "M{},{}a{},{} 0 1 0 {},0a{},{} 0 1 0 {},0Z",
        fixed(x - r),
        fixed(y),
        fixed(r),
        fixed(r),
        fixed(2.0 * r),
        fixed(r),
        fixed(r),
        fixed(-2.0 * r)
    );
}
fn random(seed: &mut u32) -> f64 {
    *seed ^= *seed << 13;
    *seed ^= *seed >> 17;
    *seed ^= *seed << 5;
    *seed as f64 / 4294967296.0
}
fn stamp(
    s: &Stroke,
    p: &Point,
    seed: &mut u32,
    paths: &mut [String],
    count: &mut usize,
    legacy: bool,
) {
    let radius = s.width / 2.0
        * if s.pressure {
            0.7 + 0.6 * p.pressure
        } else {
            1.0
        };
    for _ in 0..(s.setting("density", 55.0) / 6.0).round() as usize {
        if legacy && *count >= 5000 {
            break;
        }
        let theta = random(seed) * std::f64::consts::PI * 2.0;
        let distance = random(seed).sqrt() * radius;
        let r = 0.25 + random(seed) * (s.width / 45.0).max(0.5);
        let group = if legacy {
            0
        } else {
            (random(seed) * 3.0).floor() as usize
        };
        dot(
            &mut paths[group],
            p.x + theta.cos() * distance,
            p.y + theta.sin() * distance,
            r,
        );
        *count += 1;
    }
}
pub fn render(s: &Stroke) -> Vec<Pass> {
    let legacy = s.brush_version < 2;
    let mut seed = s.seed();
    if !legacy && seed == 0 {
        seed = 0x6d2b79f5;
    }
    let mut paths = vec![String::new(); if legacy { 1 } else { 3 }];
    let mut count = 0;
    stamp(s, &s.points[0], &mut seed, &mut paths, &mut count, legacy);
    let base = (s.width / 10.0).max(1.0);
    let mut ordinal = 1u32;
    let mut carry = 0.0;
    let total = s
        .points
        .windows(2)
        .map(|pair| (pair[1].x - pair[0].x).hypot(pair[1].y - pair[0].y))
        .sum::<f64>();
    let spacing = if legacy {
        base.max(
            total / ((5000.0 / (s.setting("density", 55.0) / 6.0).round()).floor() - 1.0).max(1.0),
        )
    } else {
        base
    };
    let mut next = base;
    for pair in s.points.windows(2) {
        if legacy && count >= 5000 {
            break;
        }
        let a = &pair[0];
        let b = &pair[1];
        let distance = (b.x - a.x).hypot(b.y - a.y);
        if distance == 0.0 {
            continue;
        }
        let mut offset = if legacy { spacing - carry } else { next };
        while offset <= distance && (!legacy || count < 5000) {
            stamp(
                s,
                &interpolate(a, b, offset / distance),
                &mut seed,
                &mut paths,
                &mut count,
                legacy,
            );
            ordinal += 1;
            offset += if legacy {
                spacing
            } else {
                base * 2.0f64.powf((ordinal / 1024) as f64)
            };
        }
        if legacy {
            carry = (carry + distance) % spacing;
        } else {
            next = offset - distance;
        }
    }
    paths
        .into_iter()
        .enumerate()
        .map(|(i, path)| {
            Pass::new(
                path,
                s.opacity * if legacy { 1.0 } else { [0.5, 0.75, 1.0][i] },
            )
        })
        .collect()
}
