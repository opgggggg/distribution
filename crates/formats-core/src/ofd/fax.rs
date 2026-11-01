//! Bounded CCITT Group-3 1D/mixed-2D lines. Huffman/mode tables come from the
//! same pure-Rust fax crate used by the TIFF Group-4 decoder.
use crate::{error, Result};
use fax::{
    maps::{black, mode, white, Mode},
    BitReader, Color,
};
struct Bits<'a> {
    bytes: &'a [u8],
    bit: usize,
}
impl BitReader for Bits<'_> {
    type Error = ();
    fn peek(&self, n: u8) -> Option<u16> {
        if self.bit.checked_add(n as usize)? > self.bytes.len() * 8 {
            return None;
        }
        let mut v = 0;
        for i in 0..n as usize {
            let p = self.bit + i;
            v = (v << 1) | ((self.bytes[p / 8] >> (7 - p % 8)) & 1) as u16;
        }
        Some(v)
    }
    fn consume(&mut self, n: u8) -> std::result::Result<(), ()> {
        if self.bit + n as usize > self.bytes.len() * 8 {
            return Err(());
        }
        self.bit += n as usize;
        Ok(())
    }
    fn bits_to_byte_boundary(&self) -> u8 {
        ((8 - self.bit % 8) % 8) as u8
    }
}
fn invalid() -> office_browser_abi::KernelError {
    error("InvalidImage", "Invalid CCITT Group-3 image data.")
}
fn run(reader: &mut Bits<'_>, color: Color, width: usize) -> Result<usize> {
    let mut sum = 0_usize;
    loop {
        let n = match color {
            Color::White => white::decode(reader),
            Color::Black => black::decode(reader),
        }
        .ok_or_else(invalid)? as usize;
        sum = sum
            .checked_add(n)
            .filter(|n| *n <= width)
            .ok_or_else(invalid)?;
        if n < 64 {
            return Ok(sum);
        }
    }
}
pub(super) fn group3(
    data: &[u8],
    width: usize,
    height: usize,
    mixed: bool,
    fill_order: u32,
) -> Result<Vec<u8>> {
    let flipped;
    if fill_order == 2 {
        flipped = data.iter().map(|b| b.reverse_bits()).collect::<Vec<_>>();
    } else {
        flipped = Vec::new();
    }
    let mut reader = Bits {
        bytes: if fill_order == 2 { &flipped } else { data },
        bit: 0,
    };
    if !mixed {
        while reader.peek(12) != Some(1) {
            if reader.peek(1) != Some(0) {
                return Err(invalid());
            }
            reader.consume(1).map_err(|_| invalid())?;
        }
        reader.consume(12).map_err(|_| invalid())?;
        if reader.peek(1) == Some(1) {
            return legacy_ambiguous(reader.bytes, width, height);
        }
        reader.bit = 0;
    }
    let stride = width.div_ceil(8);
    let mut output = vec![0_u8; stride * height];
    let mut reference = Vec::<u16>::new();
    for y in 0..height {
        while reader.peek(12) != Some(1) {
            if reader.peek(1) != Some(0) {
                return Err(invalid());
            }
            reader.consume(1).map_err(|_| invalid())?;
        }
        reader.consume(12).map_err(|_| invalid())?;
        let one_d = if mixed {
            let value = reader.peek(1).ok_or_else(invalid)?;
            reader.consume(1).map_err(|_| invalid())?;
            value == 1
        } else {
            true
        };
        let mut current = Vec::new();
        let (mut a0, mut color, mut start) = (0_usize, Color::White, true);
        let mut operations = 0;
        while a0 < width {
            operations += 1;
            if operations > width.saturating_mul(4) + 64 {
                return Err(invalid());
            }
            if one_d {
                let next = a0 + run(&mut reader, color, width)?;
                if next > width {
                    return Err(invalid());
                }
                if next < width {
                    current.push(next as u16);
                }
                a0 = next;
                color = !color;
                continue;
            }
            let b = reference.iter().enumerate().find(|(i, p)| {
                let p = **p as usize;
                (p > a0 || (start && p == a0))
                    && (*i % 2 == if color == Color::White { 0 } else { 1 })
            });
            let (b1, b2) = b
                .map(|(i, p)| {
                    (
                        *p as usize,
                        reference.get(i + 1).copied().unwrap_or(width as u16) as usize,
                    )
                })
                .unwrap_or((width, width));
            match mode::decode(&mut reader).ok_or_else(invalid)? {
                Mode::Pass => {
                    a0 = b2;
                }
                Mode::Vertical(delta) => {
                    let next = b1 as i32 + delta as i32;
                    if next < a0 as i32 || next > width as i32 {
                        return Err(invalid());
                    }
                    a0 = next as usize;
                    if a0 < width {
                        current.push(a0 as u16);
                    }
                    color = !color;
                }
                Mode::Horizontal => {
                    let a1 = a0 + run(&mut reader, color, width)?;
                    let a2 = a1 + run(&mut reader, !color, width)?;
                    if a2 > width {
                        return Err(invalid());
                    }
                    if a1 < width {
                        current.push(a1 as u16);
                    }
                    if a2 < width {
                        current.push(a2 as u16);
                    }
                    a0 = a2;
                }
                _ => return Err(invalid()),
            }
            start = false;
        }
        for (x, color) in fax::decoder::pels(&current, width as u16).enumerate() {
            // The original Group-3 provider emits black pels as one; the TIFF
            // photometric interpretation is applied separately by the caller.
            if color == Color::Black {
                output[y * stride + x / 8] |= 1 << (7 - x % 8);
            }
        }
        reference = current;
    }
    Ok(output)
}

// The original provider infers mixed coding from the first bit following EOL,
// even if T4Options says 1D. Preserve its permissive partial-line output for
// those ambiguous historical resources; all writes remain raster-bounded.
fn legacy_ambiguous(data: &[u8], width: usize, height: usize) -> Result<Vec<u8>> {
    let stride = width.div_ceil(8);
    let mut output = vec![0; stride * height];
    let mut line = vec![false; width];
    let mut previous = Vec::<(usize, bool)>::new();
    let (mut a0, mut color, mut run_len, mut horizontal) = (0_usize, false, 0_usize, 0_u8);
    let (mut word, mut length, mut y, mut one_d) = (0_u16, 0_usize, None, false);
    let mut bit = 0;
    let write = |out: &mut [u8], row: usize, line: &[bool]| {
        let origin = row.saturating_mul(stride * 8);
        for (x, value) in line
            .iter()
            .enumerate()
            .take(out.len() * 8 - origin.min(out.len() * 8))
        {
            if *value {
                let p = origin + x;
                out[p / 8] |= 1 << (7 - p % 8);
            }
        }
    };
    while bit < data.len() * 8 {
        let b1 = previous
            .iter()
            .find(|(p, c)| *p >= a0 + usize::from(a0 != 0) && *c != color)
            .map(|(p, _)| *p);
        let b2 = b1.and_then(|p| {
            previous
                .iter()
                .find(|(q, c)| *q >= p && *c == color)
                .map(|(q, _)| *q)
        });
        word = (word << 1) | ((data[bit / 8] >> (7 - bit % 8)) & 1) as u16;
        length += 1;
        bit += 1;
        let mut append = 0;
        let mut emit_run = false;
        if (one_d || horizontal > 0) && length <= 13 {
            let bytes = ((word as u32) << (32 - length)).to_be_bytes();
            let mut probe = Bits {
                bytes: &bytes,
                bit: 0,
            };
            let value = if color {
                black::decode(&mut probe)
            } else {
                white::decode(&mut probe)
            };
            if let Some(value) = value.filter(|_| probe.bit == length) {
                word = 0;
                length = 0;
                run_len += value as usize;
                if run_len > width * height + 65536 {
                    return Err(invalid());
                }
                if value < 64 {
                    emit_run = true;
                    append = run_len;
                    run_len = 0;
                    if !one_d {
                        a0 += append;
                        horizontal -= 1;
                    }
                }
            }
        } else if !one_d && horizontal == 0 && length <= 7 {
            let vertical = match (length, word) {
                (1, 1) => Some(0),
                (3, 3) => Some(1),
                (3, 2) => Some(-1),
                (6, 3) => Some(2),
                (6, 2) => Some(-2),
                (7, 3) => Some(3),
                (7, 2) => Some(-3),
                _ => None,
            };
            if (length, word) == (4, 1) {
                if let Some(next) = b2 {
                    append = next.saturating_sub(a0);
                    a0 = next;
                }
                word = 0;
                length = 0;
                line.resize(
                    line.len()
                        .checked_add(append)
                        .filter(|n| *n <= width * height + 65536)
                        .ok_or_else(invalid)?,
                    color,
                );
                append = 0;
            } else if (length, word) == (3, 1) {
                horizontal = 2;
                word = 0;
                length = 0;
            } else if let Some(delta) = vertical {
                if let Some(next) = b1.and_then(|p| p.checked_add_signed(delta)) {
                    append = next.saturating_sub(a0);
                    a0 = next;
                }
                word = 0;
                length = 0;
                // Even an empty vertical run toggles color.
                line.resize(
                    line.len()
                        .checked_add(append)
                        .filter(|n| *n <= width * height + 65536)
                        .ok_or_else(invalid)?,
                    color,
                );
                color = !color;
                append = 0;
            }
        }
        if emit_run {
            line.resize(
                line.len()
                    .checked_add(append)
                    .filter(|n| *n <= width * height + 65536)
                    .ok_or_else(invalid)?,
                color,
            );
            color = !color;
        }
        if length >= 12 && word & 0xfff == 1 {
            if let Some(row) = y {
                write(&mut output, row, &line);
            }
            if y == Some(height - 1) {
                return Ok(output);
            }
            one_d = data
                .get(bit / 8)
                .map(|b| (b >> (7 - bit % 8)) & 1 == 1)
                .unwrap_or(false);
            bit += 1;
            y = Some(y.map_or(0, |row| row + 1));
            a0 = 0;
            color = false;
            word = 0;
            length = 0;
            previous.clear();
            if line.first() == Some(&true) {
                previous.push((0, true));
            }
            for i in 1..line.len() {
                if line[i] != line[i - 1] {
                    previous.push((i, line[i]));
                }
            }
            previous.push((line.len(), false));
            previous.push((line.len(), true));
            line.clear();
        }
    }
    if line.len() == width {
        if let Some(row) = y {
            write(&mut output, row, &line);
        }
    }
    Ok(output)
}
