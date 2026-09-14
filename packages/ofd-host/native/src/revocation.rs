use crate::{
    document::Result,
    trust::{crl_urls, ocsp_urls, TrustConfig},
};
use openssl::{
    asn1::Asn1Time,
    hash::MessageDigest,
    ocsp::{OcspCertId, OcspCertStatus, OcspFlag, OcspRequest, OcspResponse, OcspResponseStatus},
    stack::Stack,
    x509::{store::X509Store, CrlStatus, X509Crl, X509},
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    io::Read,
    net::{IpAddr, ToSocketAddrs},
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use x509_parser::prelude::*;
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Revocation {
    pub status: String,
    pub source: Option<String>,
    pub detail: String,
    pub valid_until: Option<i64>,
}
impl Revocation {
    fn new(status: &str, source: Option<String>, detail: impl Into<String>) -> Self {
        Self {
            status: status.into(),
            source,
            detail: detail.into(),
            valid_until: None,
        }
    }
}
pub fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            let o = v.octets();
            !v.is_private()
                && !v.is_loopback()
                && !v.is_link_local()
                && !v.is_broadcast()
                && !v.is_unspecified()
                && !v.is_multicast()
                && o[0] != 0
                && o[0] < 224
                && !(o[0] == 100 && (64..=127).contains(&o[1]))
                && !(o[0] == 192 && o[1] == 0)
                && !(o[0] == 198 && (o[1] == 18 || o[1] == 19 || o[1] == 51))
                && !(o[0] == 203 && o[1] == 0 && o[2] == 113)
        }
        IpAddr::V6(v) => {
            if let Some(v4) = v.to_ipv4_mapped() {
                return public_ip(IpAddr::V4(v4));
            }
            let s = v.segments();
            !v.is_loopback()
                && !v.is_unspecified()
                && !v.is_multicast()
                && (s[0] & 0xe000) == 0x2000
                && !(s[0] == 0x2001 && s[1] == 0x0db8)
        }
    }
}
pub fn fetch(url: &str, body: Option<&[u8]>, cancel: &AtomicBool) -> Result<Vec<u8>> {
    if cancel.load(Ordering::Relaxed) {
        return Err("Operation cancelled".into());
    }
    let url = reqwest::Url::parse(url).map_err(|e| e.to_string())?;
    if !["http", "https"].contains(&url.scheme())
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Unsupported certificate status URL".into());
    }
    let host = url.host_str().ok_or("Missing status host")?;
    let port = url.port_or_known_default().ok_or("Missing status port")?;
    if port != 80 && port != 443 {
        return Err("Certificate status URLs must use port 80 or 443".into());
    }
    let addresses = (host, port)
        .to_socket_addrs()
        .map_err(|e| e.to_string())?
        .collect::<Vec<_>>();
    if addresses.is_empty() || addresses.iter().any(|a| !public_ip(a.ip())) {
        return Err("Certificate status host resolves to a non-public address".into());
    }
    let client = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(6))
        .resolve_to_addrs(host, &addresses)
        .build()
        .map_err(|e| e.to_string())?;
    let request = if let Some(body) = body {
        client
            .post(url)
            .header("content-type", "application/ocsp-request")
            .body(body.to_vec())
    } else {
        client.get(url)
    };
    let mut response = request
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    if response
        .content_length()
        .is_some_and(|n| n > 4 * 1024 * 1024)
    {
        return Err("Certificate status response is too large".into());
    }
    let mut data = vec![];
    (&mut response)
        .take(4 * 1024 * 1024 + 1)
        .read_to_end(&mut data)
        .map_err(|e| e.to_string())?;
    if data.len() > 4 * 1024 * 1024 || cancel.load(Ordering::Relaxed) {
        return Err("Status response cancelled or too large".into());
    }
    Ok(data)
}
fn asn_time(value: &str) -> Result<i64> {
    chrono::NaiveDateTime::parse_from_str(value, "%b %e %H:%M:%S %Y GMT")
        .map(|t| t.and_utc().timestamp())
        .map_err(|_| "Cannot parse revocation validity time".into())
}
fn ocsp(data: &[u8], cert: &X509, issuer: &X509, store: &X509Store) -> Result<(&'static str, i64)> {
    let response = OcspResponse::from_der(data).map_err(|e| e.to_string())?;
    if response.status() != OcspResponseStatus::SUCCESSFUL {
        return Err("OCSP responder did not return a successful response".into());
    }
    let basic = response.basic().map_err(|e| e.to_string())?;
    let mut stack = Stack::new().map_err(|e| e.to_string())?;
    stack.push(issuer.clone()).map_err(|e| e.to_string())?;
    basic
        .verify(&stack, store, OcspFlag::empty())
        .map_err(|e| e.to_string())?;
    let id =
        OcspCertId::from_cert(MessageDigest::sha1(), cert, issuer).map_err(|e| e.to_string())?;
    let status = basic
        .find_status(&id)
        .ok_or("OCSP response does not cover this certificate")?;
    status
        .check_validity(300, Some(24 * 60 * 60))
        .map_err(|_| "OCSP response is stale or not yet valid")?;
    let until = status
        .next_update()
        .map(|t| asn_time(&t.to_string()))
        .transpose()?
        .unwrap_or(asn_time(&status.this_update.to_string())? + 86400);
    Ok((
        if status.status == OcspCertStatus::GOOD {
            "good"
        } else if status.status == OcspCertStatus::REVOKED {
            "revoked"
        } else {
            "unknown"
        },
        until,
    ))
}
fn crl(data: &[u8], cert: &X509, issuer: &X509) -> Result<(&'static str, i64)> {
    let crl = X509Crl::from_der(data)
        .or_else(|_| X509Crl::from_pem(data))
        .map_err(|e| e.to_string())?;
    let issuer_key = issuer.public_key().map_err(|e| e.to_string())?;
    if !crl.verify(&issuer_key).map_err(|e| e.to_string())? {
        return Err("CRL signature is invalid".into());
    }
    if crl.issuer_name().to_der().map_err(|e| e.to_string())?
        != issuer.subject_name().to_der().map_err(|e| e.to_string())?
    {
        return Err("CRL issuer does not match".into());
    }
    let der = crl.to_der().map_err(|e| e.to_string())?;
    let (_, parsed) = parse_x509_crl(&der).map_err(|e| e.to_string())?;
    if parsed
        .extensions()
        .iter()
        .any(|e| e.oid.to_id_string() == "2.5.29.27")
    {
        return Err("Delta CRL requires its corresponding base CRL".into());
    }
    let now = Asn1Time::days_from_now(0).map_err(|e| e.to_string())?;
    if crl.last_update() > now.as_ref() || crl.next_update().is_none_or(|next| next < now.as_ref())
    {
        return Err("CRL is stale or not yet valid".into());
    }
    Ok((
        match crl.get_by_cert(cert) {
            CrlStatus::Revoked(_) => "revoked",
            CrlStatus::NotRevoked => "good",
            CrlStatus::RemoveFromCrl(_) => "unknown",
        },
        asn_time(&crl.next_update().ok_or("Missing CRL validity")?.to_string())?,
    ))
}
pub fn check(
    cert: &X509,
    issuer: &X509,
    store: &X509Store,
    config: &TrustConfig,
    cache: &Path,
    cancel: &AtomicBool,
) -> Revocation {
    let mut errors = vec![];
    let mut urls = ocsp_urls(cert)
        .into_iter()
        .map(|url| (url, true))
        .collect::<Vec<_>>();
    urls.extend(crl_urls(cert).into_iter().map(|url| (url, false)));
    for (url, is_ocsp) in urls.into_iter().take(4) {
        let key = format!(
            "{:x}",
            Sha256::digest(format!(
                "{url}:{}",
                cert.serial_number()
                    .to_bn()
                    .and_then(|v| v.to_hex_str())
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ))
        );
        let file = cache.join(key);
        let validate = |data: &[u8]| {
            if is_ocsp {
                ocsp(data, cert, issuer, store)
            } else {
                crl(data, cert, issuer)
            }
        };
        if let Ok(data) = std::fs::read(&file) {
            if let Ok((status, until)) = validate(&data) {
                if status != "unknown" {
                    let mut result = Revocation::new(status, Some(url), "已验证缓存的吊销信息");
                    result.valid_until = Some(until);
                    return result;
                }
            }
        }
        if !config.online_revocation {
            continue;
        }
        let body = if is_ocsp {
            let result = (|| {
                let mut req = OcspRequest::new().map_err(|e| e.to_string())?;
                req.add_id(
                    OcspCertId::from_cert(MessageDigest::sha1(), cert, issuer)
                        .map_err(|e| e.to_string())?,
                )
                .map_err(|e| e.to_string())?;
                req.to_der().map_err(|e| e.to_string())
            })();
            match result {
                Ok(v) => Some(v),
                Err(e) => {
                    errors.push(e);
                    continue;
                }
            }
        } else {
            None
        };
        match fetch(&url, body.as_deref(), cancel)
            .and_then(|data| validate(&data).map(|status| (data, status)))
        {
            Ok((data, (status, until))) => {
                let _ = std::fs::create_dir_all(cache);
                let _ = std::fs::write(file, data);
                let mut result = Revocation::new(status, Some(url), "已验证在线吊销信息");
                result.valid_until = Some(until);
                return result;
            }
            Err(error) => errors.push(error),
        }
    }
    Revocation::new(
        "unknown",
        None,
        if !config.online_revocation {
            "离线模式，缺少有效的缓存吊销信息".into()
        } else if errors.is_empty() {
            "证书没有可用的 OCSP/CRL 地址".into()
        } else {
            errors.join("; ")
        },
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_ssrf_targets() {
        for address in [
            "127.0.0.1",
            "10.1.1.1",
            "169.254.169.254",
            "192.168.1.1",
            "::1",
            "::ffff:127.0.0.1",
            "fe80::1",
        ] {
            assert!(!public_ip(address.parse().unwrap()));
        }
        assert!(public_ip("8.8.8.8".parse().unwrap()));
    }
}

#[cfg(test)]
mod crl_tests {
    use super::*;
    use openssl::{
        asn1::{Asn1Object, Asn1OctetString, Asn1Time},
        x509::{
            extension::AuthorityKeyIdentifier, X509CrlBuilder, X509Extension, X509RevokedBuilder,
        },
    };
    #[test]
    fn verifies_crl_signature_freshness_and_revocation_status() {
        let (root, key) = crate::tests::certificate("CRL test CA", None, false, true);
        let (leaf, _) =
            crate::tests::certificate("Document signer", Some((&root, &key)), false, true);
        let build = |revoked: bool, expired: bool| {
            let mut crl = X509CrlBuilder::new().unwrap();
            crl.set_issuer_name(root.subject_name()).unwrap();
            let now = chrono::Utc::now().timestamp();
            crl.set_last_update(&Asn1Time::from_unix(now - 600).unwrap())
                .unwrap();
            crl.set_next_update(
                &Asn1Time::from_unix(if expired { now - 60 } else { now + 3600 }).unwrap(),
            )
            .unwrap();
            let issuer = X509::builder().unwrap();
            let aki = AuthorityKeyIdentifier::new()
                .keyid(true)
                .build(&issuer.x509v3_context(Some(&root), None))
                .unwrap();
            crl.append_extension(aki).unwrap();
            let number = Asn1OctetString::new_from_bytes(&[2, 1, 1]).unwrap();
            crl.append_extension(
                X509Extension::new_from_der(
                    &Asn1Object::from_str("2.5.29.20").unwrap(),
                    false,
                    &number,
                )
                .unwrap(),
            )
            .unwrap();
            if revoked {
                let mut entry = X509RevokedBuilder::new().unwrap();
                entry.set_serial_number(leaf.serial_number()).unwrap();
                entry
                    .set_revocation_date(&Asn1Time::from_unix(now - 300).unwrap())
                    .unwrap();
                crl.add_revoked(entry.build()).unwrap();
            }
            crl.sign(&key, MessageDigest::sha256()).unwrap();
            crl.build().unwrap().to_der().unwrap()
        };
        assert_eq!(crl(&build(false, false), &leaf, &root).unwrap().0, "good");
        assert_eq!(crl(&build(true, false), &leaf, &root).unwrap().0, "revoked");
        assert!(crl(&build(false, true), &leaf, &root).is_err());
        let (other, _) = crate::tests::certificate("Other CA", None, false, true);
        assert!(crl(&build(false, false), &leaf, &other).is_err());
    }
}
