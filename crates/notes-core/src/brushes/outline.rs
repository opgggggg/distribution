//! Fixed-option port of perfect-freehand 1.2.3 (MIT, Steve Ruiz).
//! See third-party/perfect-freehand-LICENSE. Options match the shipped notes renderer.
use super::{Point, Stroke};
type V = [f64; 2];
fn add(a: V, b: V) -> V {
    [a[0] + b[0], a[1] + b[1]]
}
fn sub(a: V, b: V) -> V {
    [a[0] - b[0], a[1] - b[1]]
}
fn mul(a: V, n: f64) -> V {
    [a[0] * n, a[1] * n]
}
fn per(a: V) -> V {
    [a[1], -a[0]]
}
fn dot(a: V, b: V) -> f64 {
    a[0] * b[0] + a[1] * b[1]
}
fn len(a: V) -> f64 {
    a[0].hypot(a[1])
}
fn unit(a: V) -> V {
    mul(a, 1.0 / len(a))
}
fn lerp(a: V, b: V, t: f64) -> V {
    add(a, mul(sub(b, a), t))
}
fn rot(a: V, c: V, r: f64) -> V {
    let d = sub(a, c);
    let (s, co) = r.sin_cos();
    [d[0] * co - d[1] * s + c[0], d[0] * s + d[1] * co + c[1]]
}
#[derive(Clone)]
struct Sample {
    p: V,
    pressure: f64,
    vector: V,
    travel: f64,
}
const PI: f64 = std::f64::consts::PI + 0.0001;
pub fn outline(s: &Stroke, scale: f64) -> Vec<V> {
    let mut input: Vec<(V, Option<f64>)> = Vec::new();
    for (i, p) in s.points.iter().enumerate() {
        let w = s.width_at(p) * scale;
        if i == 0 {
            input.push(([p.x, p.y], Some(w / (s.width * 4.0))));
            continue;
        }
        let a = &s.points[i - 1];
        let steps = (if s.points.len() == 2 {
            2.0_f64
        } else {
            1.0_f64
        })
        .max(
            ((p.x - a.x).hypot(p.y - a.y) / 4.0)
                .ceil()
                .min((100000 / s.points.len()).max(1) as f64),
        )
        .min(64.0) as usize;
        let aw = s.width_at(a) * scale;
        for j in 1..=steps {
            let t = j as f64 / steps as f64;
            input.push((
                [a.x + (p.x - a.x) * t, a.y + (p.y - a.y) * t],
                Some((aw + (w - aw) * t) / (s.width * 4.0)),
            ));
        }
    }
    if input.len() == 2 {
        let a = input[0];
        let b = input[1];
        input.truncate(1);
        for i in 1..5 {
            input.push((lerp(a.0, b.0, i as f64 / 4.0), None));
        }
    }
    if input.len() == 1 {
        input.push((add(input[0].0, [1.0, 1.0]), input[0].1));
    }
    let size = s.width * 2.0;
    let mut samples = vec![Sample {
        p: input[0].0,
        pressure: input[0].1.unwrap_or(0.25),
        vector: [1.0, 1.0],
        travel: 0.0,
    }];
    let mut travel = 0.0;
    let mut minimum = false;
    for i in 1..input.len() {
        let prev = samples.last().unwrap();
        let p = input[i].0;
        if p == prev.p {
            continue;
        }
        travel += len(sub(p, prev.p));
        if i + 1 < input.len() && !minimum {
            if travel < size {
                continue;
            }
            minimum = true;
        }
        samples.push(Sample {
            p,
            pressure: input[i].1.unwrap_or(0.5),
            vector: unit(sub(prev.p, p)),
            travel,
        });
    }
    samples[0].vector = if samples.len() > 1 {
        samples[1].vector
    } else {
        [0.0, 0.0]
    };
    let total = samples.last().unwrap().travel;
    let taper_start = if s.style == "brush" {
        s.width * 0.6
    } else {
        0.0
    };
    let taper_end = if s.style == "brush" {
        s.width * 2.4
    } else {
        0.0
    };
    let min_distance = (size * 0.5).powi(2);
    let mut radius = size * samples.last().unwrap().pressure;
    let mut first_radius = None;
    let mut prev_vector = samples[0].vector;
    let mut prev_left = samples[0].p;
    let mut prev_right = prev_left;
    let mut left = Vec::new();
    let mut right = Vec::new();
    let mut sharp = false;
    for (i, sample) in samples.iter().enumerate() {
        let last = i + 1 == samples.len();
        if !last && total - sample.travel < 3.0 {
            continue;
        }
        radius = size * sample.pressure;
        if first_radius.is_none() {
            first_radius = Some(radius);
        }
        let start = if sample.travel < taper_start {
            let t = sample.travel / taper_start;
            t * (2.0 - t)
        } else {
            1.0
        };
        let end = if total - sample.travel < taper_end {
            let t = (total - sample.travel) / taper_end - 1.0;
            t * t * t + 1.0
        } else {
            1.0
        };
        radius = (radius * start.min(end)).max(0.01);
        let next = if last {
            sample.vector
        } else {
            samples[i + 1].vector
        };
        let next_dot = if last { 1.0 } else { dot(sample.vector, next) };
        if (dot(sample.vector, prev_vector) < 0.0 && !sharp) || next_dot < 0.0 {
            let offset = mul(per(prev_vector), radius);
            let mut t = 0.0;
            while t <= 1.0 {
                prev_left = rot(sub(sample.p, offset), sample.p, PI * t);
                prev_right = rot(add(sample.p, offset), sample.p, -PI * t);
                left.push(prev_left);
                right.push(prev_right);
                t += 1.0 / 13.0;
            }
            if next_dot < 0.0 {
                sharp = true;
            }
            continue;
        }
        sharp = false;
        let offset = mul(
            per(if last {
                sample.vector
            } else {
                lerp(next, sample.vector, next_dot)
            }),
            radius,
        );
        let l = sub(sample.p, offset);
        let r = add(sample.p, offset);
        if last || i <= 1 || dot(sub(prev_left, l), sub(prev_left, l)) > min_distance {
            left.push(l);
            prev_left = l;
        }
        if last || i <= 1 || dot(sub(prev_right, r), sub(prev_right, r)) > min_distance {
            right.push(r);
            prev_right = r;
        }
        if !last {
            prev_vector = sample.vector;
        }
    }
    let first = samples[0].p;
    let last = samples.last().unwrap();
    if samples.len() == 1 {
        let r = first_radius.unwrap_or(radius);
        let start = add(
            first,
            mul(unit(per(sub(first, add(first, [1.0, 1.0])))), -r),
        );
        let mut result = Vec::new();
        let mut t = 1.0 / 13.0;
        while t <= 1.0 {
            result.push(rot(start, first, PI * 2.0 * t));
            t += 1.0 / 13.0;
        }
        return result;
    }
    let mut start_cap = Vec::new();
    if taper_start == 0.0 {
        let mut t = 1.0 / 13.0;
        while t <= 1.0 {
            start_cap.push(rot(right[0], first, PI * t));
            t += 1.0 / 13.0;
        }
    }
    if taper_end > 0.0 {
        left.push(last.p);
    } else {
        let start = add(last.p, mul(per(mul(last.vector, -1.0)), radius));
        let mut t = 1.0 / 29.0;
        while t < 1.0 {
            left.push(rot(start, last.p, PI * 3.0 * t));
            t += 1.0 / 29.0;
        }
    }
    left.extend(right.into_iter().rev());
    left.extend(start_cap);
    left
}
pub(super) fn interpolate(a: &Point, b: &Point, t: f64) -> Point {
    Point {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        pressure: a.pressure + (b.pressure - a.pressure) * t,
        width: a.width.zip(b.width).map(|(a, b)| a + (b - a) * t),
    }
}
