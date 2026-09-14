use crate::{
    der::{find_oid, Der},
    document::Result,
    trust,
};
use chrono::NaiveDateTime;
use foreign_types::ForeignTypeRef;
use openssl::{
    bn::BigNum,
    ecdsa::EcdsaSig,
    hash::{hash, MessageDigest},
    md::Md,
    md_ctx::MdCtx,
    pkcs7::{Pkcs7, Pkcs7Flags},
    stack::Stack,
    x509::{store::X509Store, X509},
};
use serde::Serialize;

pub fn digest(method: &str, data: &[u8]) -> Result<Vec<u8>> {
    let method = match method {
        "1.2.156.10197.1.401" => "SM3",
        "1.3.14.3.2.26" => "SHA1",
        "2.16.840.1.101.3.4.2.1" => "SHA256",
        "2.16.840.1.101.3.4.2.2" => "SHA384",
        "2.16.840.1.101.3.4.2.3" => "SHA512",
        v => v,
    };
    let md = MessageDigest::from_name(&method.replace('-', ""))
        .ok_or_else(|| format!("Unsupported digest {method}"))?;
    hash(md, data)
        .map(|v| v.to_vec())
        .map_err(|e| e.to_string())
}
fn signature_digest(oid: &str) -> Result<&'static str> {
    match oid {
        "1.2.156.10197.1.501" => Ok("SM3"),
        "1.2.840.113549.1.1.11" | "1.2.840.10045.4.3.2" => Ok("SHA256"),
        "1.2.840.113549.1.1.12" | "1.2.840.10045.4.3.3" => Ok("SHA384"),
        "1.2.840.113549.1.1.13" | "1.2.840.10045.4.3.4" => Ok("SHA512"),
        "1.2.840.113549.1.1.5" | "1.2.840.10045.4.1" => Ok("SHA1"),
        _ => Err(format!("Unsupported signature algorithm {oid}")),
    }
}
extern "C" {
    fn EVP_PKEY_CTX_set1_id(
        ctx: *mut openssl_sys::EVP_PKEY_CTX,
        id: *const std::ffi::c_void,
        len: std::ffi::c_int,
    ) -> std::ffi::c_int;
}
pub fn verify_raw(cert: &X509, method: &str, data: &[u8], signature: &[u8]) -> Result<bool> {
    let name = signature_digest(method)?;
    let key = cert.public_key().map_err(|e| e.to_string())?;
    let mut ctx = MdCtx::new().map_err(|e| e.to_string())?;
    let md = match name {
        "SM3" => Md::sm3(),
        "SHA256" => Md::sha256(),
        "SHA384" => Md::sha384(),
        "SHA512" => Md::sha512(),
        _ => Md::sha1(),
    };
    let pctx = ctx
        .digest_verify_init(Some(md), &key)
        .map_err(|e| e.to_string())?;
    if name == "SM3" {
        let id = b"1234567812345678";
        let result =
            unsafe { EVP_PKEY_CTX_set1_id(pctx.as_ptr(), id.as_ptr().cast(), id.len() as _) };
        if result <= 0 {
            return Err("Cannot configure the SM2 signer identity".into());
        }
    }
    let normalized;
    if signature.len() == 64
        && Der::root(signature).is_err()
        && (method.starts_with("1.2.156.") || method.starts_with("1.2.840.10045"))
    {
        normalized = EcdsaSig::from_private_components(
            BigNum::from_slice(&signature[..32]).map_err(|e| e.to_string())?,
            BigNum::from_slice(&signature[32..]).map_err(|e| e.to_string())?,
        )
        .and_then(|sig| sig.to_der())
        .map_err(|e| e.to_string())?;
    } else {
        normalized = signature.to_vec();
    }
    ctx.digest_verify(data, &normalized)
        .map_err(|e| e.to_string())
}
fn time(node: Der<'_>) -> Result<i64> {
    let data = if node.tag == 3 {
        node.bits()?
    } else {
        node.value
    };
    if node.tag == 3 {
        if let Ok(inner) = Der::root(data) {
            if inner.tag == 0x17 || inner.tag == 0x18 {
                return time(inner);
            }
        }
    }
    let value = std::str::from_utf8(data).map_err(|_| "Invalid signature time")?;
    let expanded;
    let value = if node.tag == 0x17 || value.len() == 13 {
        let year = value
            .get(..2)
            .ok_or("Invalid UTC time")?
            .parse::<u32>()
            .map_err(|_| "Invalid UTC time")?;
        expanded = format!("{}{}", if year >= 50 { "19" } else { "20" }, value);
        expanded.as_str()
    } else {
        value
    };
    NaiveDateTime::parse_from_str(value, "%Y%m%d%H%M%SZ")
        .or_else(|_| NaiveDateTime::parse_from_str(value, "%Y%m%d%H%M%S%.fZ"))
        .map(|t| t.and_utc().timestamp())
        .map_err(|_| "Unsupported signature time encoding".into())
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimestampReport {
    pub status: String,
    pub time: Option<i64>,
    pub detail: String,
    pub valid_until: Option<i64>,
    #[serde(skip)]
    pub chains: Vec<Vec<X509>>,
}
pub struct Envelope {
    pub format: String,
    pub valid: bool,
    pub signers: Vec<X509>,
    pub certificates: Vec<X509>,
    pub issues: Vec<String>,
    pub weak: bool,
    pub seal_valid: Option<bool>,
    pub seal_signer: Option<X509>,
    pub timestamp: TimestampReport,
}
fn no_timestamp() -> TimestampReport {
    TimestampReport {
        status: "notPresent".into(),
        time: None,
        detail: "没有可信时间戳；声明的签名时间不作为证书信任依据".into(),
        valid_until: None,
        chains: vec![],
    }
}
fn timestamp(token: &[u8], signature: &[u8], store: &X509Store) -> TimestampReport {
    let result = (|| -> Result<(i64, bool, Vec<Vec<X509>>)> {
        let p7 = Pkcs7::from_der(token).map_err(|e| e.to_string())?;
        let empty = Stack::new().map_err(|e| e.to_string())?;
        let mut content = vec![];
        p7.verify(
            &empty,
            store,
            None,
            Some(&mut content),
            Pkcs7Flags::BINARY | Pkcs7Flags::NOVERIFY,
        )
        .map_err(|e| e.to_string())?;
        let fields = Der::root(&content)?.children()?;
        if fields.len() < 5 {
            return Err("Incomplete TSTInfo".into());
        }
        let imprint = fields[2].children()?;
        let alg = imprint
            .first()
            .ok_or("Missing timestamp digest")?
            .children()?
            .first()
            .ok_or("Missing timestamp OID")?
            .oid()?;
        if imprint.get(1).ok_or("Missing message imprint")?.value != digest(&alg, signature)? {
            return Err("Timestamp does not bind the signature value".into());
        }
        let instant = time(fields[4])?;
        if instant > chrono::Utc::now().timestamp() + 300 {
            return Err("Timestamp is in the future".into());
        }
        let certs = p7
            .signed()
            .and_then(|s| s.certificates())
            .map(|s| s.iter().map(|c| c.to_owned()).collect::<Vec<_>>())
            .unwrap_or_default();
        let signers = p7
            .signers(&empty, Pkcs7Flags::empty())
            .map_err(|e| e.to_string())?;
        if signers.is_empty() {
            return Err("Timestamp signer is missing".into());
        }
        let mut trusted = true;
        let mut chains = vec![];
        for signer in signers {
            trust::usage(&signer, true)?;
            let chain = trust::verify_chain(&signer, &certs, store)?;
            trusted &= chain.valid;
            chains.push(chain.chain);
        }
        Ok((instant, trusted, chains))
    })();
    match result {
        Ok((instant, true, chains)) => TimestampReport {
            valid_until: None,
            chains,
            status: "verified".into(),
            time: Some(instant),
            detail: "时间戳签名、消息印记和 TSA 当前证书链已验证；历史有效性仍需要归档吊销证据"
                .into(),
        },
        Ok((instant, false, chains)) => TimestampReport {
            valid_until: None,
            chains,
            status: "untrusted".into(),
            time: Some(instant),
            detail: "时间戳签名有效，但 TSA 证书链不受信任".into(),
        },
        Err(error) => TimestampReport {
            valid_until: None,
            chains: vec![],
            status: "invalid".into(),
            time: None,
            detail: error,
        },
    }
}
fn cms_timestamp(data: &[u8], store: &X509Store) -> TimestampReport {
    let result = (|| -> Result<Option<TimestampReport>> {
        let root = Der::root(data)?;
        let signed = root
            .children()?
            .get(1)
            .ok_or("Missing SignedData")?
            .children()?[0];
        let fields = signed.children()?;
        let signers = fields.last().ok_or("Missing signer infos")?.children()?;
        if signers.len() != 1 {
            return Ok(None);
        }
        let signer = signers[0].children()?;
        let signature = signer
            .iter()
            .rev()
            .find(|n| n.tag == 4)
            .ok_or("Missing CMS signature bytes")?;
        let found = find_oid(signers[0], "1.2.840.113549.1.9.16.2.14", 0)?;
        if found.len() < 2 {
            return Ok(None);
        }
        let token = found[1]
            .children()?
            .first()
            .ok_or("Empty timestamp attribute")?
            .full;
        Ok(Some(timestamp(token, signature.value, store)))
    })();
    match result {
        Ok(Some(value)) => value,
        _ => no_timestamp(),
    }
}
fn seal(seal: Der<'_>, signer: &X509) -> Result<(bool, X509)> {
    let fields = seal.children()?;
    let info = *fields.first().ok_or("Missing seal info")?;
    let signature_fields = if fields.get(1).is_some_and(|n| n.tag == 0x30) {
        fields[1].children()?
    } else {
        fields[1..].to_vec()
    };
    if signature_fields.len() < 3 {
        return Err("Incomplete seal signature".into());
    }
    let maker = X509::from_der(signature_fields[0].value).map_err(|e| e.to_string())?;
    let valid = verify_raw(
        &maker,
        &signature_fields[1].oid()?,
        info.full,
        signature_fields[2].bits()?,
    )?;
    let info_fields = info.children()?;
    let properties = info_fields
        .get(2)
        .ok_or("Missing seal properties")?
        .children()?;
    let modern = properties.get(2).is_some_and(|n| n.tag == 2);
    let list_index = if modern { 3 } else { 2 };
    let list = *properties
        .get(list_index)
        .ok_or("Missing authorized signer list")?;
    let signer_der = signer.to_der().map_err(|e| e.to_string())?;
    let digest_list = modern && properties[2].value == [2];
    let mut authorized = false;
    for entry in list.children()? {
        if !digest_list {
            authorized |= entry.tag == 4 && entry.value == signer_der;
        } else {
            let values = entry.children()?;
            if values.len() == 2 {
                let algorithm = if values[0].tag == 6 {
                    values[0].oid()?
                } else {
                    String::from_utf8_lossy(values[0].value).into_owned()
                };
                authorized |= values[1].value == digest(&algorithm, &signer_der)?;
            }
        }
    }
    let start = *properties
        .get(list_index + 2)
        .ok_or("Missing seal validity start")?;
    let end = *properties
        .get(list_index + 3)
        .ok_or("Missing seal validity end")?;
    let now = chrono::Utc::now().timestamp();
    Ok((
        valid && authorized && time(start)? <= now && now <= time(end)?,
        maker,
    ))
}
pub fn verify_envelope(data: &[u8], descriptor: &[u8], store: &X509Store) -> Result<Envelope> {
    if let Ok(p7) = Pkcs7::from_der(data) {
        if p7.signed().is_some() {
            let empty = Stack::new().map_err(|e| e.to_string())?;
            let mut content = vec![];
            let valid = p7
                .verify(
                    &empty,
                    store,
                    Some(descriptor),
                    Some(&mut content),
                    Pkcs7Flags::BINARY | Pkcs7Flags::NOVERIFY,
                )
                .is_ok()
                && content == descriptor;
            let signers = p7
                .signers(&empty, Pkcs7Flags::empty())
                .map_err(|e| e.to_string())?
                .iter()
                .map(|c| c.to_owned())
                .collect::<Vec<_>>();
            let certificates = p7
                .signed()
                .and_then(|s| s.certificates())
                .map(|s| s.iter().map(|c| c.to_owned()).collect())
                .unwrap_or_default();
            let canonical = p7.to_der().map_err(|e| e.to_string())?;
            let outer = Der::root(&canonical)?.children()?;
            let signed = outer.get(1).ok_or("Missing SignedData")?.children()?;
            let fields = signed.first().ok_or("Missing SignedData")?.children()?;
            let signer_infos = fields.last().ok_or("Missing signer infos")?.children()?;
            let mut weak = false;
            for signer in signer_infos {
                let values = signer.children()?;
                let digest = values.get(2).ok_or("Missing signer digest")?.children()?;
                let oid = digest.first().ok_or("Missing signer digest OID")?.oid()?;
                weak |= oid == "1.3.14.3.2.26" || oid == "1.2.840.113549.2.5";
            }
            return Ok(Envelope {
                format: "CMS/PKCS#7".into(),
                valid: valid && !signers.is_empty(),
                signers,
                certificates,
                issues: vec![],
                weak,
                seal_valid: None,
                seal_signer: None,
                timestamp: cms_timestamp(&canonical, store),
            });
        }
    }
    let fields = Der::root(data)?.children()?;
    let tbs = *fields.first().ok_or("Missing SES signed data")?;
    let values = tbs.children()?;
    if values.len() < 5 || values[0].tag != 2 {
        return Err("Unsupported SignedValue envelope".into());
    }
    let modern = fields.get(1).is_some_and(|n| n.tag == 4);
    let (cert, alg, sig) = if modern {
        (
            *fields.get(1).ok_or("Missing SES certificate")?,
            *fields.get(2).ok_or("Missing SES algorithm")?,
            *fields.get(3).ok_or("Missing SES signature")?,
        )
    } else {
        (
            *values.get(5).ok_or("Missing SES certificate")?,
            *values.get(6).ok_or("Missing SES algorithm")?,
            *fields.get(1).ok_or("Missing SES signature")?,
        )
    };
    let signer = X509::from_der(cert.value).map_err(|e| e.to_string())?;
    let method = alg.oid()?;
    let md = signature_digest(&method)?;
    let binding = values[3].bits()? == digest(md, descriptor)?;
    let valid = verify_raw(&signer, &method, tbs.full, sig.bits()?)? && binding;
    let mut issues = vec![];
    if !binding {
        issues.push("SignedValue 中的原文摘要与签名描述文件不一致".into());
    }
    let (seal_valid, seal_signer) = match seal(values[1], &signer) {
        Ok((ok, maker)) => (Some(ok), Some(maker)),
        Err(error) => {
            issues.push(format!("电子印章验证失败：{error}"));
            (Some(false), None)
        }
    };
    let stamp = fields.get(4).and_then(|n| {
        if n.tag == 3 {
            n.bits().ok()
        } else if n.tag == 0xa0 {
            n.children()
                .ok()
                .and_then(|v| v.first().copied())
                .and_then(|v| v.bits().ok())
        } else {
            None
        }
    });
    Ok(Envelope {
        format: format!("SES v{}", values[0].value.last().copied().unwrap_or(0)),
        valid,
        certificates: vec![signer.clone()],
        signers: vec![signer],
        issues,
        weak: md == "SHA1",
        seal_valid,
        seal_signer,
        timestamp: stamp
            .map(|token| timestamp(token, sig.bits().unwrap_or_default(), store))
            .unwrap_or_else(no_timestamp),
    })
}
