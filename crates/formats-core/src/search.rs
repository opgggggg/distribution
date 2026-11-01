use crate::{error, Result};
use serde_json::{json, Value};

/// Return original UTF-16 coordinates even when lowercasing expands a character.
pub fn request(r: &Value) -> Result<Value> {
    let text = r["text"]
        .as_str()
        .ok_or_else(|| error("InvalidArgument", "Missing search text."))?;
    let query = r["query"].as_str().unwrap_or("").trim().to_lowercase();
    let limit = r["limit"].as_u64().unwrap_or(500).min(10000) as usize;
    if query.is_empty() || limit == 0 {
        return Ok(json!([]));
    }
    let lower = text.to_lowercase();
    let mut positions = Vec::new();
    let mut from = 0;
    while positions.len() < limit {
        let Some(at) = lower[from..].find(&query).map(|n| n + from) else {
            break;
        };
        let end = at + query.len();
        positions.push((at, end));
        from = end;
    }
    // Map only match boundaries, rather than allocating two coordinates per byte
    // of a long chapter. Lowercasing's contextual final sigma has equal byte width.
    let mut found = Vec::with_capacity(positions.len());
    let (mut folded, mut utf16, mut index, mut start) = (0, 0, 0, None);
    for c in text.chars() {
        if index == positions.len() {
            break;
        }
        let next = folded + c.to_lowercase().map(char::len_utf8).sum::<usize>();
        while index < positions.len() && positions[index].0 < next {
            let original_start = *start.get_or_insert(utf16);
            if positions[index].1 > next {
                break;
            }
            found.push(json!({"from":original_start,"to":utf16+c.len_utf16()}));
            start = None;
            index += 1;
        }
        folded = next;
        utf16 += c.len_utf16();
    }
    Ok(Value::Array(found))
}
