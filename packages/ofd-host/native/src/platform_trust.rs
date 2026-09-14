use crate::{
    document::Result,
    trust::{fingerprint, TrustConfig},
};
use openssl::x509::X509;
/// Application anchors are explicitly approved for documents. System anchors
/// must additionally pass the OS's generic X.509 trust policy, not its TLS policy.
pub fn verify(chain: &[X509], config: &TrustConfig) -> Result<()> {
    let root = chain.last().ok_or("Certificate chain is empty")?;
    let fp = fingerprint(root)?;
    if config.anchors.iter().any(|a| a.fingerprint == fp) {
        return Ok(());
    }
    if !config.system_roots {
        return Err("No application trust anchor".into());
    }
    platform(chain)
}
#[cfg(target_os = "macos")]
fn platform(chain: &[X509]) -> Result<()> {
    use security_framework::{certificate::SecCertificate, policy::SecPolicy, trust::SecTrust};
    let certs = chain
        .iter()
        .map(|c| {
            SecCertificate::from_der(&c.to_der().map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())
        })
        .collect::<Result<Vec<_>>>()?;
    let mut trust = SecTrust::create_with_certificates(&certs, &[SecPolicy::create_x509()])
        .map_err(|e| e.to_string())?;
    trust
        .set_network_fetch_allowed(false)
        .map_err(|e| e.to_string())?;
    trust
        .evaluate_with_error()
        .map_err(|e| format!("系统证书信任策略未通过：{e}"))
}
#[cfg(windows)]
fn platform(chain: &[X509]) -> Result<()> {
    use windows_sys::Win32::Security::Cryptography::*;
    unsafe {
        let store = CertOpenStore(
            CERT_STORE_PROV_MEMORY,
            0,
            0,
            CERT_STORE_CREATE_NEW_FLAG,
            std::ptr::null(),
        );
        if store.is_null() {
            return Err("Cannot create certificate chain store".into());
        }
        let mut contexts = vec![];
        let result = (|| -> Result<()> {
            for cert in chain {
                let der = cert.to_der().map_err(|e| e.to_string())?;
                let context = CertCreateCertificateContext(
                    X509_ASN_ENCODING | PKCS_7_ASN_ENCODING,
                    der.as_ptr(),
                    der.len() as _,
                );
                if context.is_null() {
                    return Err("Windows cannot decode this certificate".into());
                }
                contexts.push(context);
                if CertAddCertificateContextToStore(
                    store,
                    context,
                    CERT_STORE_ADD_ALWAYS,
                    std::ptr::null_mut(),
                ) == 0
                {
                    return Err("Cannot prepare certificate chain".into());
                }
            }
            let mut parameters: CERT_CHAIN_PARA = std::mem::zeroed();
            parameters.cbSize = std::mem::size_of_val(&parameters) as _;
            let mut context = std::ptr::null_mut();
            if CertGetCertificateChain(
                0 as _,
                contexts[0],
                std::ptr::null(),
                store,
                &parameters,
                CERT_CHAIN_CACHE_ONLY_URL_RETRIEVAL,
                std::ptr::null(),
                &mut context,
            ) == 0
            {
                return Err("Windows certificate chain validation failed".into());
            }
            let mut policy: CERT_CHAIN_POLICY_PARA = std::mem::zeroed();
            policy.cbSize = std::mem::size_of_val(&policy) as _;
            let mut status: CERT_CHAIN_POLICY_STATUS = std::mem::zeroed();
            status.cbSize = std::mem::size_of_val(&status) as _;
            let ok = CertVerifyCertificateChainPolicy(
                CERT_CHAIN_POLICY_BASE,
                context,
                &policy,
                &mut status,
            ) != 0
                && status.dwError == 0;
            CertFreeCertificateChain(context);
            if ok {
                Ok(())
            } else {
                Err(format!(
                    "Windows certificate policy error: {}",
                    status.dwError
                ))
            }
        })();
        for context in contexts {
            CertFreeCertificateContext(context);
        }
        CertCloseStore(store, 0);
        result
    }
}
#[cfg(not(any(windows, target_os = "macos")))]
fn platform(_chain: &[X509]) -> Result<()> {
    Ok(())
}
