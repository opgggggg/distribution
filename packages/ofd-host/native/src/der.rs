use crate::document::Result;
#[derive(Clone, Copy, Debug)]
pub struct Der<'a> {
    pub tag: u8,
    pub value: &'a [u8],
    pub full: &'a [u8],
}
impl<'a> Der<'a> {
    pub fn parse(bytes: &'a [u8]) -> Result<(Self, &'a [u8])> {
        if bytes.len() < 2 {
            return Err("Truncated ASN.1 value".into());
        }
        let tag = bytes[0];
        if tag & 31 == 31 {
            return Err("Unsupported ASN.1 high tag".into());
        }
        let mut offset = 2;
        let mut len = bytes[1] as usize;
        if len & 128 != 0 {
            let count = len & 127;
            if count == 0 || count > 4 || bytes.len() < 2 + count {
                return Err("Invalid DER length".into());
            }
            len = 0;
            for b in &bytes[2..2 + count] {
                len = len
                    .checked_mul(256)
                    .and_then(|n| n.checked_add(*b as usize))
                    .ok_or("DER overflow")?;
            }
            offset += count;
        }
        let end = offset.checked_add(len).ok_or("DER overflow")?;
        if end > bytes.len() {
            return Err("Truncated DER payload".into());
        }
        Ok((
            Self {
                tag,
                value: &bytes[offset..end],
                full: &bytes[..end],
            },
            &bytes[end..],
        ))
    }
    pub fn root(bytes: &'a [u8]) -> Result<Self> {
        let (n, rest) = Self::parse(bytes)?;
        if !rest.is_empty() {
            return Err("Trailing ASN.1 data".into());
        }
        Ok(n)
    }
    pub fn children(&self) -> Result<Vec<Der<'a>>> {
        if self.tag & 32 == 0 {
            return Err("Expected ASN.1 container".into());
        }
        let mut data = self.value;
        let mut nodes = vec![];
        while !data.is_empty() {
            if nodes.len() > 10000 {
                return Err("ASN.1 node budget exceeded".into());
            }
            let (node, rest) = Self::parse(data)?;
            nodes.push(node);
            data = rest;
        }
        Ok(nodes)
    }
    pub fn bits(&self) -> Result<&'a [u8]> {
        if self.tag != 3 || self.value.first() != Some(&0) {
            return Err("Invalid signature BIT STRING".into());
        }
        Ok(&self.value[1..])
    }
    pub fn oid(&self) -> Result<String> {
        if self.tag != 6 {
            return Err("Expected algorithm OID".into());
        }
        let mut nums = vec![];
        let mut n = 0u64;
        for b in self.value {
            n = n
                .checked_mul(128)
                .and_then(|n| n.checked_add((b & 127) as u64))
                .ok_or("OID overflow")?;
            if b & 128 == 0 {
                nums.push(n);
                n = 0
            }
        }
        if nums.is_empty() || self.value.last().is_some_and(|b| b & 128 != 0) {
            return Err("Invalid OID".into());
        }
        let first = nums.remove(0);
        let a = if first < 40 {
            0
        } else if first < 80 {
            1
        } else {
            2
        };
        let mut result = format!("{a}.{}", first - a * 40);
        for v in nums {
            result.push_str(&format!(".{v}"));
        }
        Ok(result)
    }
}
pub fn find_oid<'a>(node: Der<'a>, oid: &str, depth: usize) -> Result<Vec<Der<'a>>> {
    if depth > 32 {
        return Err("ASN.1 nesting budget exceeded".into());
    }
    if node.tag & 32 == 0 {
        return Ok(vec![]);
    }
    let children = node.children()?;
    if children
        .first()
        .is_some_and(|n| n.oid().ok().as_deref() == Some(oid))
    {
        return Ok(children);
    }
    for child in children {
        if child.tag & 32 != 0 {
            let found = find_oid(child, oid, depth + 1)?;
            if !found.is_empty() {
                return Ok(found);
            }
        }
    }
    Ok(vec![])
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unbounded_or_truncated_der() {
        assert!(Der::root(&[0x30, 0x80, 0, 0]).is_err());
        assert!(Der::root(&[0x30, 5, 0]).is_err());
        assert_eq!(
            Der::root(&[6, 3, 0x2a, 3, 4]).unwrap().oid().unwrap(),
            "1.2.3.4"
        );
    }
}
