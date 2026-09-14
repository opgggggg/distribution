use crate::document::Result;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chrono::Utc;
use openssl::{
    hash::MessageDigest,
    stack::Stack,
    x509::{
        store::{X509Store, X509StoreBuilder},
        verify::X509VerifyFlags,
        X509StoreContext, X509,
    },
};
use serde::{Deserialize, Serialize};
use std::{
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
use x509_parser::{extensions::ParsedExtension, prelude::*};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Anchor {
    pub fingerprint: String,
    pub subject: String,
    pub pem: String,
    pub added_at: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustConfig {
    pub revision: u64,
    pub system_roots: bool,
    pub online_revocation: bool,
    pub require_revocation: bool,
    pub anchors: Vec<Anchor>,
}
impl Default for TrustConfig {
    fn default() -> Self {
        Self {
            revision: 1,
            system_roots: true,
            online_revocation: true,
            require_revocation: true,
            anchors: vec![],
        }
    }
}
pub struct TrustStore {
    path: PathBuf,
    config: Mutex<TrustConfig>,
}
pub fn fingerprint(cert: &X509) -> Result<String> {
    Ok(cert
        .digest(MessageDigest::sha256())
        .map_err(|e| e.to_string())?
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}
pub fn subject(cert: &X509) -> String {
    cert.subject_name()
        .entries()
        .map(|e| {
            format!(
                "{}={}",
                e.object().nid().short_name().unwrap_or("OID"),
                String::from_utf8_lossy(e.data().as_slice())
            )
        })
        .collect::<Vec<_>>()
        .join(", ")
}
pub fn parse_certificate(bytes: &[u8]) -> Result<X509> {
    X509::from_pem(bytes)
        .or_else(|_| X509::from_der(bytes))
        .map_err(|e| e.to_string())
}
pub fn atomic_json(path: &Path, value: &impl Serialize) -> Result<()> {
    let parent = path.parent().ok_or("Missing state directory")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    serde_json::to_writer_pretty(file.as_file_mut(), value).map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
impl TrustStore {
    pub fn load(dir: &Path) -> Result<Self> {
        let path = dir.join("document-trust.json");
        let config = if path.exists() {
            serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
                .map_err(|e| format!("Invalid trust store: {e}"))?
        } else {
            TrustConfig::default()
        };
        Ok(Self {
            path,
            config: Mutex::new(config),
        })
    }
    pub fn snapshot(&self) -> TrustConfig {
        self.config.lock().unwrap().clone()
    }
    pub fn import(&self, bytes: &[u8]) -> Result<TrustConfig> {
        if bytes.len() > 256 * 1024 {
            return Err("Certificate is too large".into());
        }
        let cert = parse_certificate(bytes)?;
        let der = cert.to_der().map_err(|e| e.to_string())?;
        let (_, parsed) = parse_x509_certificate(&der).map_err(|e| e.to_string())?;
        if !parsed
            .basic_constraints()
            .map_err(|e| e.to_string())?
            .is_some_and(|c| c.value.ca)
        {
            return Err("只能将 CA 证书加入信任根；签名者证书不会自动成为信任根".into());
        }
        if parsed
            .key_usage()
            .map_err(|e| e.to_string())?
            .is_some_and(|k| !k.value.key_cert_sign())
        {
            return Err("CA certificate cannot sign certificates".into());
        }
        let fp = fingerprint(&cert)?;
        let mut next = self.snapshot();
        if next.anchors.iter().any(|a| a.fingerprint == fp) {
            return Ok(next);
        }
        if next.anchors.len() >= 256 {
            return Err("Too many trust anchors".into());
        }
        next.anchors.push(Anchor {
            fingerprint: fp,
            subject: subject(&cert),
            pem: String::from_utf8(cert.to_pem().map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?,
            added_at: Utc::now().timestamp(),
        });
        self.save(next)
    }
    fn save(&self, mut next: TrustConfig) -> Result<TrustConfig> {
        let mut state = self.config.lock().unwrap();
        if next.revision != state.revision {
            return Err("信任库已变化，请重试".into());
        }
        next.revision += 1;
        atomic_json(&self.path, &next)?;
        *state = next.clone();
        Ok(next)
    }
    pub fn remove(&self, id: &str) -> Result<TrustConfig> {
        let mut next = self.snapshot();
        next.anchors.retain(|a| a.fingerprint != id);
        self.save(next)
    }
    pub fn configure(&self, system: bool, online: bool, required: bool) -> Result<TrustConfig> {
        let mut next = self.snapshot();
        next.system_roots = system;
        next.online_revocation = online;
        next.require_revocation = required;
        self.save(next)
    }
}
pub struct ChainResult {
    pub valid: bool,
    pub reason: Option<String>,
    pub chain: Vec<X509>,
}
pub fn x509_store(config: &TrustConfig, at: Option<i64>) -> Result<X509Store> {
    let mut builder = X509StoreBuilder::new().map_err(|e| e.to_string())?;
    builder
        .set_flags(X509VerifyFlags::TRUSTED_FIRST | X509VerifyFlags::CHECK_SS_SIGNATURE)
        .map_err(|e| e.to_string())?;
    if config.system_roots {
        let native = rustls_native_certs::load_native_certs();
        for cert in native.certs {
            if let Ok(c) = X509::from_der(cert.as_ref()) {
                let _ = builder.add_cert(c);
            }
        }
    }
    for anchor in &config.anchors {
        builder
            .add_cert(parse_certificate(anchor.pem.as_bytes())?)
            .map_err(|e| e.to_string())?;
    }
    if let Some(at) = at {
        let mut params =
            openssl::x509::verify::X509VerifyParam::new().map_err(|e| e.to_string())?;
        params.set_time(at as _);
        builder.set_param(&params).map_err(|e| e.to_string())?;
    }
    Ok(builder.build())
}
pub fn verify_chain(leaf: &X509, untrusted: &[X509], store: &X509Store) -> Result<ChainResult> {
    let mut stack = Stack::new().map_err(|e| e.to_string())?;
    for cert in untrusted {
        stack.push(cert.clone()).map_err(|e| e.to_string())?;
    }
    let mut ctx = X509StoreContext::new().map_err(|e| e.to_string())?;
    let mut reason = None;
    let mut chain = vec![];
    let valid = ctx
        .init(store, leaf, &stack, |ctx| {
            let valid = ctx.verify_cert()?;
            if !valid {
                reason = Some(ctx.error().error_string().to_owned());
            }
            chain = ctx
                .chain()
                .map(|c| c.iter().map(|c| c.to_owned()).collect())
                .unwrap_or_default();
            Ok(valid)
        })
        .map_err(|e| e.to_string())?;
    Ok(ChainResult {
        valid,
        reason,
        chain,
    })
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateInfo {
    pub fingerprint: String,
    pub subject: String,
    pub issuer: String,
    pub valid_from: i64,
    pub valid_until: i64,
    pub pem: String,
}
pub fn info(cert: &X509) -> Result<CertificateInfo> {
    let der = cert.to_der().map_err(|e| e.to_string())?;
    let (_, p) = parse_x509_certificate(&der).map_err(|e| e.to_string())?;
    Ok(CertificateInfo {
        fingerprint: fingerprint(cert)?,
        subject: subject(cert),
        issuer: p.issuer().to_string(),
        valid_from: p.validity().not_before.timestamp(),
        valid_until: p.validity().not_after.timestamp(),
        pem: String::from_utf8(cert.to_pem().map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?,
    })
}
pub fn usage(cert: &X509, timestamp: bool) -> Result<()> {
    let der = cert.to_der().map_err(|e| e.to_string())?;
    let (_, p) = parse_x509_certificate(&der).map_err(|e| e.to_string())?;
    if p.key_usage()
        .map_err(|e| e.to_string())?
        .is_some_and(|k| !k.value.digital_signature() && !k.value.non_repudiation())
    {
        return Err("Certificate key usage does not permit signatures".into());
    }
    if let Some(eku) = p.extended_key_usage().map_err(|e| e.to_string())? {
        let allowed = if timestamp {
            eku.value.time_stamping
        } else {
            eku.value.any
                || eku
                    .value
                    .other
                    .iter()
                    .any(|oid| oid.to_id_string() == "1.3.6.1.5.5.7.3.36")
        };
        if !allowed {
            return Err(
                "Certificate extended key usage does not permit this signature purpose".into(),
            );
        }
    } else if timestamp {
        return Err("Timestamp signer lacks the timeStamping EKU".into());
    }
    Ok(())
}
pub fn ocsp_urls(cert: &X509) -> Vec<String> {
    let Ok(der) = cert.to_der() else {
        return vec![];
    };
    let Ok((_, p)) = parse_x509_certificate(&der) else {
        return vec![];
    };
    p.extensions()
        .iter()
        .flat_map(|e| match e.parsed_extension() {
            ParsedExtension::AuthorityInfoAccess(a) => a
                .accessdescs
                .iter()
                .filter(|d| d.access_method.to_id_string() == "1.3.6.1.5.5.7.48.1")
                .filter_map(|d| {
                    if let GeneralName::URI(uri) = d.access_location {
                        Some(uri.to_owned())
                    } else {
                        None
                    }
                })
                .collect(),
            _ => vec![],
        })
        .collect()
}
pub fn crl_urls(cert: &X509) -> Vec<String> {
    let Ok(der) = cert.to_der() else {
        return vec![];
    };
    let Ok((_, p)) = parse_x509_certificate(&der) else {
        return vec![];
    };
    p.extensions()
        .iter()
        .flat_map(|e| match e.parsed_extension() {
            ParsedExtension::CRLDistributionPoints(points) => points
                .points
                .iter()
                .flat_map(|p| match &p.distribution_point {
                    Some(DistributionPointName::FullName(names)) => names
                        .iter()
                        .filter_map(|n| {
                            if let GeneralName::URI(uri) = n {
                                Some((*uri).to_owned())
                            } else {
                                None
                            }
                        })
                        .collect(),
                    _ => vec![],
                })
                .collect(),
            _ => vec![],
        })
        .collect()
}
pub fn decode_base64(s: &str) -> Result<Vec<u8>> {
    B64.decode(s.chars().filter(|c| !c.is_whitespace()).collect::<String>())
        .map_err(|e| e.to_string())
}
