use crate::{error, Result};
pub type Matrix = [f64; 6];
pub const IDENTITY: Matrix = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];
pub const MM: f64 = 96.0 / 25.4;
pub fn num(s: &str, fallback: f64) -> f64 {
    let s = s.trim();
    if s.is_empty() {
        return fallback;
    }
    s.parse::<f64>()
        .ok()
        .filter(|n| n.is_finite())
        .unwrap_or_else(|| {
            let t = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X"));
            if let Some(t) = t {
                return u64::from_str_radix(t, 16)
                    .map(|n| n as f64)
                    .unwrap_or(fallback);
            }
            fallback
        })
}
pub fn numbers(s: &str) -> Vec<f64> {
    s.split_whitespace().map(|s| num(s, 0.0)).collect()
}
pub fn matrix(s: &str) -> Matrix {
    numbers(s).try_into().unwrap_or(IDENTITY)
}
pub fn list(v: &[f64]) -> String {
    v.iter()
        .map(|n| if *n == 0.0 { "0".into() } else { n.to_string() })
        .collect::<Vec<String>>()
        .join(" ")
}
pub fn multiply(a: Matrix, b: Matrix) -> Matrix {
    [
        a[0] * b[0] + a[2] * b[1],
        a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4],
        a[1] * b[4] + a[3] * b[5] + a[5],
    ]
}
pub fn inverse(m: Matrix) -> Result<Matrix> {
    let d = m[0] * m[3] - m[1] * m[2];
    if d.abs() < 1e-15 {
        return Err(error(
            "InvalidTransform",
            "Singular OFD coordinate transform.",
        ));
    }
    Ok([
        m[3] / d,
        -m[1] / d,
        -m[2] / d,
        m[0] / d,
        (m[2] * m[5] - m[3] * m[4]) / d,
        (m[1] * m[4] - m[0] * m[5]) / d,
    ])
}
pub fn point(m: Matrix, p: [f64; 2]) -> [f64; 2] {
    [
        m[0] * p[0] + m[2] * p[1] + m[4],
        m[1] * p[0] + m[3] * p[1] + m[5],
    ]
}
pub use super::super::strokes::{line_width, stroke_scale};
pub fn path(s: &str) -> Result<String> {
    let invalid = || error("InvalidGeometry", "Invalid OFD path.");
    let bytes = s.as_bytes();
    let mut i = 0;
    let mut tokens = Vec::new();
    while i < bytes.len() {
        if bytes[i].is_ascii_whitespace() {
            i += 1;
            continue;
        }
        let start = i;
        let c = bytes[i].to_ascii_uppercase();
        if b"MSLQBCAZ".contains(&c) {
            i += 1;
            tokens.push(&s[start..i]);
            continue;
        }
        if bytes[i] == b'+' || bytes[i] == b'-' {
            i += 1;
        }
        let digits = i;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        let mut count = i - digits;
        if i < bytes.len() && bytes[i] == b'.' {
            i += 1;
            let digits = i;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            count += i - digits;
        }
        if count == 0 {
            return Err(invalid());
        }
        if i < bytes.len() && (bytes[i] == b'e' || bytes[i] == b'E') {
            i += 1;
            if i < bytes.len() && (bytes[i] == b'+' || bytes[i] == b'-') {
                i += 1;
            }
            let digits = i;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            if digits == i {
                return Err(invalid());
            }
        }
        tokens.push(&s[start..i]);
    }
    let mut out = Vec::new();
    let mut i = 0;
    while i < tokens.len() {
        let cmd = tokens[i].to_ascii_uppercase();
        i += 1;
        let count = match cmd.as_str() {
            "M" | "S" | "L" => 2,
            "Q" => 4,
            "B" => 6,
            "A" => 7,
            "C" | "Z" => 0,
            _ => return Err(error("InvalidGeometry", "Missing OFD path command.")),
        };
        if i + count > tokens.len() {
            return Err(error("InvalidGeometry", "Invalid OFD path coordinates."));
        }
        let mut args = tokens[i..i + count]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>();
        if args
            .iter()
            .any(|s| !s.parse::<f64>().ok().is_some_and(|v| v.is_finite()))
        {
            return Err(error("InvalidGeometry", "Invalid OFD path coordinates."));
        }
        if cmd == "A" {
            for j in 0..2 {
                args[j] = args[j].parse::<f64>().unwrap().abs().to_string();
            }
            args[2] = (args[2].parse::<f64>().unwrap() % 360.0).to_string();
            if !["0", "1"].contains(&args[3].as_str()) || !["0", "1"].contains(&args[4].as_str()) {
                return Err(error("InvalidGeometry", "Invalid OFD arc flags."));
            }
        }
        out.push(
            match cmd.as_str() {
                "B" => "C",
                "C" => "Z",
                "S" => "M",
                _ => &cmd,
            }
            .to_string(),
        );
        out.extend(args);
        i += count;
    }
    Ok(out.join(" "))
}
