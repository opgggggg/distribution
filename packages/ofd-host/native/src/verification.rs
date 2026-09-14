use crate::{
    crypto::{self, TimestampReport},
    document::{attr, child, resolve, text, xml, Result, Session},
    revocation::{self, Revocation},
    trust::{self, CertificateInfo, TrustStore},
};
use serde::Serialize;
use std::{
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
    time::Instant,
};
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceReport {
    pub path: String,
    pub valid: bool,
    pub error: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignerReport {
    pub certificate: CertificateInfo,
    pub chain: Vec<CertificateInfo>,
    pub chain_valid: bool,
    pub usage_valid: bool,
    pub revocation: Vec<Revocation>,
    pub detail: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureReport {
    pub id: String,
    pub document_index: usize,
    pub format: String,
    pub provider: String,
    pub claimed_time: String,
    pub integrity: String,
    pub cryptographic_validity: String,
    pub trust: String,
    pub references: Vec<ReferenceReport>,
    pub signers: Vec<SignerReport>,
    pub seal_valid: Option<bool>,
    pub seal_chain_valid: Option<bool>,
    pub timestamp: Option<TimestampReport>,
    pub issues: Vec<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationReport {
    pub document_hash: String,
    pub trust_revision: u64,
    pub checked_at: i64,
    pub recheck_after: i64,
    pub signatures: Vec<SignatureReport>,
}
pub fn verify(
    session: &Session,
    trust: &TrustStore,
    cache: &Path,
    cancel: &AtomicBool,
    selected: Option<&str>,
) -> Result<VerificationReport> {
    let config = trust.snapshot();
    let store = trust::x509_store(&config, None)?;
    let mut reports = vec![];
    let started = Instant::now();
    for (doc_index, index_path) in &session.signature_indexes {
        let index = xml(session.part(index_path)?)?;
        for entry in index
            .root_element()
            .children()
            .filter(|n| n.has_tag_name("Signature"))
        {
            if selected.is_some_and(|id| id != attr(entry, "ID")) {
                continue;
            }
            if reports.len() >= 256 {
                return Err("Too many signatures for one verification request".into());
            }
            if cancel.load(Ordering::Relaxed) {
                return Err("验证已取消".into());
            }
            let mut report = SignatureReport {
                id: attr(entry, "ID").to_owned(),
                document_index: *doc_index,
                format: "unknown".into(),
                provider: "".into(),
                claimed_time: "".into(),
                integrity: "invalid".into(),
                cryptographic_validity: "unsupported".into(),
                trust: "unknown".into(),
                references: vec![],
                signers: vec![],
                seal_valid: None,
                seal_chain_valid: None,
                timestamp: None,
                issues: vec![],
            };
            let result = (|| -> Result<()> {
                let path = resolve(index_path, attr(entry, "BaseLoc"))?;
                let bytes = session.part(&path)?;
                let signature = xml(bytes)?;
                let root = signature.root_element();
                let signed = child(root, "SignedInfo").ok_or("Missing SignedInfo")?;
                report.provider = child(signed, "Provider")
                    .map(|n| attr(n, "ProviderName").to_owned())
                    .unwrap_or_default();
                report.claimed_time = text(signed, "SignatureDateTime")
                    .chars()
                    .take(128)
                    .collect();
                let references =
                    child(signed, "References").ok_or("Missing protected references")?;
                let method = attr(references, "CheckMethod");
                let mut weak = matches!(
                    method.to_uppercase().as_str(),
                    "SHA1" | "SHA-1" | "MD5" | "1.3.14.3.2.26"
                );
                for reference in references
                    .children()
                    .filter(|n| n.has_tag_name("Reference"))
                {
                    if report.references.len() >= 10000 {
                        return Err("Too many signature references".into());
                    }
                    if cancel.load(Ordering::Relaxed) {
                        return Err("验证已取消".into());
                    }
                    let file = attr(reference, "FileRef");
                    let result = (|| {
                        if !file.starts_with('/') {
                            return Err("Signature FileRef must be absolute".into());
                        }
                        let part = resolve("", file)?;
                        let expected = trust::decode_base64(text(reference, "CheckValue"))?;
                        let actual = crypto::digest(method, session.part(&part)?)?;
                        Ok(expected.len() == actual.len()
                            && openssl::memcmp::eq(&expected, &actual))
                    })();
                    match result {
                        Ok(valid) => report.references.push(ReferenceReport {
                            path: file.into(),
                            valid,
                            error: None,
                        }),
                        Err(error) => report.references.push(ReferenceReport {
                            path: file.into(),
                            valid: false,
                            error: Some(error),
                        }),
                    }
                }
                report.integrity =
                    if !report.references.is_empty() && report.references.iter().all(|r| r.valid) {
                        "valid"
                    } else {
                        "invalid"
                    }
                    .into();
                let signed_value = resolve(&path, text(root, "SignedValue"))?;
                let envelope =
                    crypto::verify_envelope(session.part(&signed_value)?, bytes, &store)?;
                report.format = envelope.format;
                report.cryptographic_validity =
                    if envelope.valid { "valid" } else { "invalid" }.into();
                report.issues.extend(envelope.issues);
                weak |= envelope.weak;
                report.seal_valid = envelope.seal_valid;
                report.timestamp = Some(envelope.timestamp);
                if let Some(timestamp) = report.timestamp.as_mut() {
                    if timestamp.status == "verified" {
                        let mut until = chrono::Utc::now().timestamp() + 300;
                        for chain in &timestamp.chains {
                            if let Err(error) = crate::platform_trust::verify(chain, &config) {
                                timestamp.status = "untrusted".into();
                                timestamp.detail = error;
                                break;
                            }
                            for certificate in chain {
                                until = until.min(trust::info(certificate)?.valid_until);
                            }
                            for pair in chain.windows(2) {
                                let status = revocation::check(
                                    &pair[0], &pair[1], &store, &config, cache, cancel,
                                );
                                if let Some(expiry) = status.valid_until {
                                    until = until.min(expiry)
                                }
                                if status.status == "revoked" {
                                    timestamp.status = "invalid".into();
                                    timestamp.detail = "TSA 证书已吊销".into();
                                } else if status.status == "unknown"
                                    && config.require_revocation
                                    && timestamp.status != "invalid"
                                {
                                    timestamp.status = "unknown".into();
                                    timestamp.detail =
                                        "时间戳数学验证通过，但 TSA 吊销状态尚未确认".into();
                                }
                            }
                        }
                        timestamp.valid_until = Some(until);
                    }
                }
                let mut every_chain = true;
                let mut revoked = false;
                let mut unknown = false;
                for cert in envelope.signers {
                    let mut chain = trust::verify_chain(&cert, &envelope.certificates, &store)?;
                    if chain.valid {
                        if let Err(error) = crate::platform_trust::verify(&chain.chain, &config) {
                            chain.valid = false;
                            chain.reason = Some(error);
                        }
                    }
                    let usage = trust::usage(&cert, false);
                    let mut revocation = vec![];
                    if chain.valid {
                        let mut settings = config.clone();
                        if started.elapsed().as_secs() > 45 {
                            settings.online_revocation = false;
                        }
                        for pair in chain.chain.windows(2) {
                            let status = revocation::check(
                                &pair[0], &pair[1], &store, &settings, cache, cancel,
                            );
                            revoked |= status.status == "revoked";
                            unknown |= status.status == "unknown";
                            revocation.push(status);
                        }
                    }
                    every_chain &= chain.valid && usage.is_ok();
                    report.signers.push(SignerReport {
                        certificate: trust::info(&cert)?,
                        chain: chain
                            .chain
                            .iter()
                            .map(trust::info)
                            .collect::<Result<Vec<_>>>()?,
                        chain_valid: chain.valid,
                        usage_valid: usage.is_ok(),
                        revocation,
                        detail: usage.err().or(chain.reason),
                    });
                }
                if let Some(maker) = envelope.seal_signer {
                    let mut chain = trust::verify_chain(&maker, &envelope.certificates, &store)?;
                    if chain.valid {
                        if let Err(error) = crate::platform_trust::verify(&chain.chain, &config) {
                            chain.valid = false;
                            chain.reason = Some(error);
                        }
                    }
                    report.seal_chain_valid = Some(chain.valid);
                    every_chain &= chain.valid;
                    if !chain.valid {
                        report.issues.push("制章证书链不受信任".into())
                    }
                }
                if weak {
                    report
                        .issues
                        .push("签名或文件摘要使用旧算法，不能视为完整的当前信任证明".into());
                    unknown = true;
                }
                let bad_time = report
                    .timestamp
                    .as_ref()
                    .is_some_and(|t| t.status == "invalid");
                let uncertain_time = report.timestamp.as_ref().is_some_and(|t| {
                    t.status != "verified" && t.status != "notPresent" && t.status != "invalid"
                });
                report.trust = if report.integrity != "valid"
                    || report.cryptographic_validity != "valid"
                    || revoked
                    || report.seal_valid == Some(false)
                    || bad_time
                {
                    "invalid"
                } else if !every_chain {
                    "untrusted"
                } else if weak || uncertain_time || (unknown && config.require_revocation) {
                    "unknown"
                } else {
                    "trusted"
                }
                .into();
                Ok(())
            })();
            if let Err(error) = result {
                report.issues.push(error);
                if report.integrity == "invalid" {
                    report.trust = "invalid".into();
                }
            }
            reports.push(report);
        }
    }
    if cancel.load(Ordering::Relaxed) {
        return Err("验证已取消".into());
    }
    if trust.snapshot().revision != config.revision {
        return Err("信任设置已变化，请重新验证".into());
    }
    let now = chrono::Utc::now().timestamp();
    let recheck = reports
        .iter()
        .flat_map(|r| r.signers.iter())
        .flat_map(|s| {
            s.chain
                .iter()
                .map(|c| c.valid_until)
                .chain(s.revocation.iter().filter_map(|r| r.valid_until))
        })
        .chain(
            reports
                .iter()
                .filter_map(|r| r.timestamp.as_ref().and_then(|t| t.valid_until)),
        )
        .min()
        .unwrap_or(now + 300)
        .min(now + 300);
    Ok(VerificationReport {
        recheck_after: recheck,
        document_hash: session.info.hash.clone(),
        trust_revision: config.revision,
        checked_at: chrono::Utc::now().timestamp(),
        signatures: reports,
    })
}
