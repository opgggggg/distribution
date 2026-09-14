use super::*;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use openssl::{
    asn1::Asn1Time,
    bn::BigNum,
    hash::MessageDigest,
    pkcs7::{Pkcs7, Pkcs7Flags},
    pkey::{PKey, Private},
    rsa::Rsa,
    stack::Stack,
    x509::{
        extension::{BasicConstraints, KeyUsage, SubjectKeyIdentifier},
        X509NameBuilder, X509,
    },
};
use sha2::{Digest, Sha256};
use std::{
    io::{Cursor, Write},
    sync::atomic::AtomicBool,
};
pub(crate) fn certificate(
    name: &str,
    issuer: Option<(&X509, &PKey<Private>)>,
    expired: bool,
    sign_usage: bool,
) -> (X509, PKey<Private>) {
    let key = PKey::from_rsa(Rsa::generate(2048).unwrap()).unwrap();
    let mut dn = X509NameBuilder::new().unwrap();
    dn.append_entry_by_text("CN", name).unwrap();
    let dn = dn.build();
    let mut cert = X509::builder().unwrap();
    cert.set_version(2).unwrap();
    let serial = BigNum::from_u32(if issuer.is_none() { 1 } else { 2 })
        .unwrap()
        .to_asn1_integer()
        .unwrap();
    cert.set_serial_number(&serial).unwrap();
    cert.set_subject_name(&dn).unwrap();
    cert.set_issuer_name(issuer.map(|v| v.0.subject_name()).unwrap_or(&dn))
        .unwrap();
    cert.set_pubkey(&key).unwrap();
    let now = chrono::Utc::now().timestamp();
    cert.set_not_before(&Asn1Time::from_unix(now - 86400).unwrap())
        .unwrap();
    cert.set_not_after(
        &Asn1Time::from_unix(if expired { now - 60 } else { now + 86400 * 30 }).unwrap(),
    )
    .unwrap();
    cert.append_extension(if issuer.is_none() {
        BasicConstraints::new().critical().ca().build().unwrap()
    } else {
        BasicConstraints::new().critical().build().unwrap()
    })
    .unwrap();
    cert.append_extension(if issuer.is_none() {
        KeyUsage::new().key_cert_sign().crl_sign().build().unwrap()
    } else if sign_usage {
        KeyUsage::new().digital_signature().build().unwrap()
    } else {
        KeyUsage::new().key_encipherment().build().unwrap()
    })
    .unwrap();
    let id = SubjectKeyIdentifier::new()
        .build(&cert.x509v3_context(issuer.map(|v| v.0.as_ref()), None))
        .unwrap();
    cert.append_extension(id).unwrap();
    cert.sign(issuer.map(|v| v.1).unwrap_or(&key), MessageDigest::sha256())
        .unwrap();
    (cert.build(), key)
}
fn fixture(leaf: &X509, key: &PKey<Private>, root: &X509, tamper: bool) -> Vec<u8> {
    let ns = "xmlns:ofd=\"http://www.ofdspec.org/2016\"";
    let mut parts = std::collections::BTreeMap::new();
    parts.insert("OFD.xml",format!("<ofd:OFD {ns} Version=\"1.0\" DocType=\"OFD\"><ofd:DocBody><ofd:DocInfo><ofd:DocID>test</ofd:DocID></ofd:DocInfo><ofd:DocRoot>Doc/Document.xml</ofd:DocRoot><ofd:Signatures>Doc/Signs/Signatures.xml</ofd:Signatures></ofd:DocBody></ofd:OFD>").into_bytes());
    parts.insert("Doc/Document.xml",format!("<ofd:Document {ns}><ofd:CommonData><ofd:MaxUnitID>20</ofd:MaxUnitID><ofd:PageArea><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:PageArea></ofd:CommonData><ofd:Pages><ofd:Page ID=\"1\" BaseLoc=\"Page.xml\"/></ofd:Pages></ofd:Document>").into_bytes());
    parts.insert(
        "Doc/Page.xml",
        format!("<ofd:Page {ns}><ofd:Content><ofd:Layer ID=\"2\"/></ofd:Content></ofd:Page>")
            .into_bytes(),
    );
    let refs=parts.iter().map(|(path,data)|format!("<ofd:Reference FileRef=\"/{path}\"><ofd:CheckValue>{}</ofd:CheckValue></ofd:Reference>",B64.encode(Sha256::digest(data)))).collect::<String>();
    let descriptor=format!("<ofd:Signature {ns}><ofd:SignedInfo><ofd:Provider ProviderName=\"Test\"/><ofd:SignatureMethod>1.2.840.113549.1.1.11</ofd:SignatureMethod><ofd:SignatureDateTime>20500101000000</ofd:SignatureDateTime><ofd:References CheckMethod=\"SHA256\">{refs}</ofd:References></ofd:SignedInfo><ofd:SignedValue>SignedValue.dat</ofd:SignedValue></ofd:Signature>").into_bytes();
    let mut chain = Stack::new().unwrap();
    chain.push(root.clone()).unwrap();
    let signed = Pkcs7::sign(
        leaf,
        key,
        &chain,
        &descriptor,
        Pkcs7Flags::DETACHED | Pkcs7Flags::BINARY,
    )
    .unwrap()
    .to_der()
    .unwrap();
    parts.insert("Doc/Signs/Signature.xml", descriptor);
    parts.insert("Doc/Signs/SignedValue.dat", signed);
    parts.insert("Doc/Signs/Signatures.xml",format!("<ofd:Signatures {ns}><ofd:Signature ID=\"s1\" BaseLoc=\"Signature.xml\"/></ofd:Signatures>").into_bytes());
    if tamper {
        parts.insert("Doc/Page.xml", format!("<ofd:Page {ns}/>").into_bytes());
    }
    let mut zip = zip::ZipWriter::new(Cursor::new(vec![]));
    for (path, data) in parts {
        zip.start_file(path, zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(&data).unwrap();
    }
    zip.finish().unwrap().into_inner()
}
fn session(root: &std::path::Path, bytes: &[u8]) -> document::Session {
    let path = root.join("source.ofd");
    std::fs::write(&path, bytes).unwrap();
    document::Session::open(path, "test.ofd".into(), root).unwrap()
}
#[test]
fn cms_checks_math_and_trust_without_auto_trusting_embedded_ca() {
    let dir = tempfile::tempdir().unwrap();
    let (root, root_key) = certificate("Test CA", None, false, true);
    let (leaf, key) = certificate("Document signer", Some((&root, &root_key)), false, true);
    let store = trust::TrustStore::load(dir.path()).unwrap();
    store.configure(false, false, false).unwrap();
    let session = session(dir.path(), &fixture(&leaf, &key, &root, false));
    let before = verification::verify(
        &session,
        &store,
        &dir.path().join("cache"),
        &AtomicBool::new(false),
        None,
    )
    .unwrap();
    assert_eq!(before.signatures[0].integrity, "valid");
    assert_eq!(before.signatures[0].cryptographic_validity, "valid");
    assert_eq!(before.signatures[0].trust, "untrusted");
    assert!(store.import(&leaf.to_der().unwrap()).is_err());
    store.import(&root.to_der().unwrap()).unwrap();
    let after = verification::verify(
        &session,
        &store,
        &dir.path().join("cache"),
        &AtomicBool::new(false),
        None,
    )
    .unwrap();
    assert_eq!(after.signatures[0].trust, "trusted", "{:?}", after);
    assert!(after.trust_revision > before.trust_revision);
}
#[test]
fn tampered_files_never_get_a_trusted_result() {
    let dir = tempfile::tempdir().unwrap();
    let (root, root_key) = certificate("Test CA", None, false, true);
    let (leaf, key) = certificate("Signer", Some((&root, &root_key)), false, true);
    let store = trust::TrustStore::load(dir.path()).unwrap();
    store.configure(false, false, false).unwrap();
    store.import(&root.to_der().unwrap()).unwrap();
    let session = session(dir.path(), &fixture(&leaf, &key, &root, true));
    let report =
        verification::verify(&session, &store, dir.path(), &AtomicBool::new(false), None).unwrap();
    assert_eq!(report.signatures[0].integrity, "invalid");
    assert_eq!(report.signatures[0].trust, "invalid");
}
#[test]
fn claimed_signing_time_does_not_override_expired_certificates() {
    let dir = tempfile::tempdir().unwrap();
    let (root, root_key) = certificate("Test CA", None, false, true);
    let (leaf, key) = certificate("Expired signer", Some((&root, &root_key)), true, true);
    let store = trust::TrustStore::load(dir.path()).unwrap();
    store.configure(false, false, false).unwrap();
    store.import(&root.to_der().unwrap()).unwrap();
    let session = session(dir.path(), &fixture(&leaf, &key, &root, false));
    let report =
        verification::verify(&session, &store, dir.path(), &AtomicBool::new(false), None).unwrap();
    assert_eq!(report.signatures[0].trust, "untrusted");
    assert!(!report.signatures[0].signers[0].chain_valid);
}
#[test]
fn certificate_usage_is_checked() {
    let (root, key) = certificate("Test CA", None, false, true);
    let (leaf, _) = certificate("Encryption only", Some((&root, &key)), false, false);
    assert!(trust::usage(&leaf, false).is_err());
}
#[test]
fn malformed_archives_cannot_escape_or_blow_up() {
    let dir = tempfile::tempdir().unwrap();
    let mut zip = zip::ZipWriter::new(Cursor::new(vec![]));
    zip.start_file("../OFD.xml", zip::write::SimpleFileOptions::default())
        .unwrap();
    zip.write_all(b"<OFD/>").unwrap();
    let bytes = zip.finish().unwrap().into_inner();
    let path = dir.path().join("bad.ofd");
    std::fs::write(&path, bytes).unwrap();
    assert!(document::Session::open(path, "bad".into(), dir.path()).is_err());
}

#[test]
fn sm2_signatures_and_descriptor_binding_are_verified() {
    use foreign_types::ForeignTypeRef;
    use openssl::{
        ec::{EcGroup, EcKey},
        md::Md,
        md_ctx::MdCtx,
        nid::Nid,
    };
    extern "C" {
        fn EVP_PKEY_CTX_set1_id(
            ctx: *mut openssl_sys::EVP_PKEY_CTX,
            id: *const std::ffi::c_void,
            len: std::ffi::c_int,
        ) -> std::ffi::c_int;
    }
    let group = EcGroup::from_curve_name(Nid::SM2).unwrap();
    let key = PKey::from_ec_key(EcKey::generate(&group).unwrap()).unwrap();
    let mut name = X509NameBuilder::new().unwrap();
    name.append_entry_by_text("CN", "SM2 test").unwrap();
    let name = name.build();
    let mut certificate = X509::builder().unwrap();
    certificate.set_version(2).unwrap();
    certificate.set_subject_name(&name).unwrap();
    certificate.set_issuer_name(&name).unwrap();
    certificate.set_pubkey(&key).unwrap();
    certificate
        .set_serial_number(&BigNum::from_u32(5).unwrap().to_asn1_integer().unwrap())
        .unwrap();
    certificate
        .set_not_before(&Asn1Time::days_from_now(0).unwrap())
        .unwrap();
    certificate
        .set_not_after(&Asn1Time::days_from_now(1).unwrap())
        .unwrap();
    certificate.sign(&key, MessageDigest::sm3()).unwrap();
    let certificate = certificate.build();
    let data = b"OFD immutable descriptor";
    let mut ctx = MdCtx::new().unwrap();
    let pctx = ctx.digest_sign_init(Some(Md::sm3()), &key).unwrap();
    let id = b"1234567812345678";
    assert!(unsafe { EVP_PKEY_CTX_set1_id(pctx.as_ptr(), id.as_ptr().cast(), id.len() as _) } > 0);
    ctx.digest_sign_update(data).unwrap();
    let mut signature = vec![];
    ctx.digest_sign_final_to_vec(&mut signature).unwrap();
    assert!(crypto::verify_raw(&certificate, "1.2.156.10197.1.501", data, &signature).unwrap());
    assert!(!matches!(
        crypto::verify_raw(&certificate, "1.2.156.10197.1.501", b"tampered", &signature),
        Ok(true)
    ));
}
