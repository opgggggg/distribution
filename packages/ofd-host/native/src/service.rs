use crate::{
    document::{Result, Session, MAX_SOURCE},
    media::{Jobs, MediaEngine},
    printing::{self, Ledger, PrintInput},
    trust::{decode_base64, TrustStore},
    verification,
};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::Read,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
struct Upload {
    document: String,
    path: PathBuf,
    kind: String,
    width: f64,
    height: f64,
}
pub struct Service {
    state_dir: PathBuf,
    input_dir: PathBuf,
    sessions: Mutex<HashMap<String, Arc<Session>>>,
    uploads: Mutex<HashMap<String, Upload>>,
    pub jobs: Jobs,
    trust: TrustStore,
    media: MediaEngine,
    ledger: Ledger,
}
fn string<'a>(value: &'a Value, key: &str) -> Result<&'a str> {
    value[key].as_str().ok_or_else(|| format!("Missing {key}"))
}
fn index(value: &Value) -> Result<usize> {
    let value = value["documentIndex"].as_u64().unwrap_or(0);
    usize::try_from(value).map_err(|_| "Invalid document index".into())
}
impl Service {
    pub fn new(state_dir: PathBuf, input_dir: PathBuf, resource_dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(state_dir.join("sessions")).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&input_dir).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&state_dir, std::fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?;
            std::fs::set_permissions(&input_dir, std::fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?;
        }
        for entry in std::fs::read_dir(state_dir.join("sessions"))
            .map_err(|e| e.to_string())?
            .flatten()
        {
            if entry.path().is_dir() {
                let _ = std::fs::remove_dir_all(entry.path());
            }
        }
        let trust = TrustStore::load(&state_dir)?;
        let ledger = Ledger::load(&state_dir)?;
        Ok(Self {
            media: MediaEngine::load(resource_dir),
            state_dir,
            input_dir,
            trust,
            ledger,
            sessions: Mutex::new(HashMap::new()),
            uploads: Mutex::new(HashMap::new()),
            jobs: Jobs::default(),
        })
    }
    fn session(&self, p: &Value) -> Result<Arc<Session>> {
        let id = string(p, "documentId")?;
        let session = self
            .sessions
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or("文档会话已关闭或不存在")?;
        if p["documentHash"]
            .as_str()
            .is_some_and(|hash| hash != session.info.hash)
        {
            return Err("文档已变化，请重新打开会话".into());
        }
        Ok(session)
    }
    pub fn dispatch(&self, method: &str, p: Value) -> Result<Value> {
        match method {
            "capabilities" => Ok(
                json!({"media":self.media.capabilities,"printing":printing::capabilities(),"signatures":{"cms":true,"ses":[1,4,5],"sm2":true,"sm3":true},"sourceLimit":MAX_SOURCE}),
            ),
            "upload.accept" => {
                let id = string(&p, "inputId")?;
                if id.len() != 48 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
                    return Err("Invalid upload capability".into());
                }
                let path = self.input_dir.join(id);
                let meta = &p["meta"];
                if std::fs::symlink_metadata(&path)
                    .map_err(|e| e.to_string())?
                    .file_type()
                    .is_symlink()
                {
                    return Err("Upload must not be a symbolic link".into());
                }
                if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > MAX_SOURCE {
                    return Err("Upload is too large".into());
                }
                if meta["kind"] == "document" {
                    let name = meta["name"].as_str().unwrap_or("document.ofd");
                    let session = Arc::new(Session::open(
                        path,
                        name.into(),
                        &self.state_dir.join("sessions"),
                    )?);
                    let mut sessions = self.sessions.lock().unwrap();
                    if sessions.len() >= 16
                        || sessions.values().map(|s| s.expanded).sum::<usize>() + session.expanded
                            > 512 * 1024 * 1024
                    {
                        return Err("打开的 OFD 文档超过当前内存预算".into());
                    }
                    let result = serde_json::to_value(&session.info).map_err(|e| e.to_string())?;
                    sessions.insert(session.info.id.clone(), session);
                    Ok(result)
                } else {
                    let session = self.session(meta)?;
                    session
                        .policy(index(meta)?)?
                        .authorize("print", chrono::Utc::now().timestamp())?;
                    let kind = string(meta, "kind")?;
                    if kind != "print-pdf" && kind != "print-page" {
                        return Err("Unsupported upload kind".into());
                    }
                    let mut prefix = [0u8; 8];
                    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
                    let length = file.read(&mut prefix).map_err(|e| e.to_string())?;
                    if (kind == "print-pdf" && !prefix[..length].starts_with(b"%PDF-"))
                        || (kind == "print-page" && prefix != [137, 80, 78, 71, 13, 10, 26, 10])
                    {
                        return Err("Invalid print data".into());
                    }
                    let width = meta["widthMm"].as_f64().unwrap_or(210.0);
                    let height = meta["heightMm"].as_f64().unwrap_or(297.0);
                    if !(width > 0.0 && width < 10000.0 && height > 0.0 && height < 10000.0) {
                        return Err("Invalid print dimensions".into());
                    }
                    let destination = session.root.path().join(format!(
                        "print-{id}.{}",
                        if kind == "print-pdf" { "pdf" } else { "png" }
                    ));
                    std::fs::rename(path, &destination).map_err(|e| e.to_string())?;
                    self.uploads.lock().unwrap().insert(
                        id.into(),
                        Upload {
                            document: session.info.id.clone(),
                            path: destination,
                            kind: kind.into(),
                            width,
                            height,
                        },
                    );
                    Ok(json!({"uploadId":id}))
                }
            }
            "session.close" => {
                let id = string(&p, "documentId")?;
                self.jobs.close_document(id);
                let session = self.sessions.lock().unwrap().remove(id);
                let files = session
                    .as_ref()
                    .map(|s| {
                        std::fs::read_dir(s.root.path())
                            .into_iter()
                            .flatten()
                            .flatten()
                            .map(|e| e.path())
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                self.uploads.lock().unwrap().retain(|_, u| u.document != id);
                if let Some(session) = session {
                    let _ = std::fs::remove_file(&session.source);
                }
                Ok(json!({"closed":true,"revokeFiles":files}))
            }
            "session.authorize" => {
                let session = self.session(&p)?;
                let policy = session.policy(index(&p)?)?;
                policy.authorize(string(&p, "operation")?, chrono::Utc::now().timestamp())?;
                serde_json::to_value(policy).map_err(|e| e.to_string())
            }
            "trust.list" => serde_json::to_value(self.trust.snapshot()).map_err(|e| e.to_string()),
            "trust.inspect" => {
                let data = decode_base64(string(&p, "certificate")?)?;
                if data.len() > 256 * 1024 {
                    return Err("Certificate is too large".into());
                }
                let cert = crate::trust::parse_certificate(&data)?;
                let der = cert.to_der().map_err(|e| e.to_string())?;
                let (_, parsed) =
                    x509_parser::parse_x509_certificate(&der).map_err(|e| e.to_string())?;
                let is_ca = parsed
                    .basic_constraints()
                    .map_err(|e| e.to_string())?
                    .is_some_and(|c| c.value.ca);
                Ok(json!({"certificate":crate::trust::info(&cert)?,"isCa":is_ca}))
            }
            "trust.import" => serde_json::to_value(
                self.trust
                    .import(&decode_base64(string(&p, "certificate")?)?)?,
            )
            .map_err(|e| e.to_string()),
            "trust.remove" => serde_json::to_value(self.trust.remove(string(&p, "fingerprint")?)?)
                .map_err(|e| e.to_string()),
            "trust.configure" => serde_json::to_value(
                self.trust.configure(
                    p["systemRoots"].as_bool().ok_or("Missing systemRoots")?,
                    p["onlineRevocation"]
                        .as_bool()
                        .ok_or("Missing onlineRevocation")?,
                    p["requireRevocation"]
                        .as_bool()
                        .ok_or("Missing requireRevocation")?,
                )?,
            )
            .map_err(|e| e.to_string()),
            "signature.verify" => {
                let session = self.session(&p)?;
                let job = string(&p, "jobId")?;
                let cancel = self.jobs.begin(job, &session.info.id)?;
                let result = verification::verify(
                    &session,
                    &self.trust,
                    &self.state_dir.join("revocation-cache"),
                    &cancel,
                    p["signatureId"].as_str(),
                )
                .and_then(|r| serde_json::to_value(r).map_err(|e| e.to_string()));
                self.jobs.finish(job);
                result
            }
            "media.prepare" => {
                let session = self.session(&p)?;
                let job = string(&p, "jobId")?;
                let cancel = self.jobs.begin(job, &session.info.id)?;
                let result = self.media.prepare(
                    &session,
                    index(&p)?,
                    p["pageId"].as_str(),
                    string(&p, "resourceId")?,
                    &self.jobs,
                    job,
                    &cancel,
                    p["transcode"].as_bool().unwrap_or(false),
                );
                self.jobs.finish(job);
                result
            }
            "job.cancel" => {
                self.jobs.cancel(string(&p, "jobId")?);
                Ok(json!({"cancelled":true}))
            }
            "print.status" => {
                let session = self.session(&p)?;
                let i = index(&p)?;
                Ok(
                    json!({"remaining":self.ledger.remaining(&session.info.hash,i,session.policy(i)?),"jobs":self.ledger.jobs(&session.info.hash),"capability":printing::capabilities()}),
                )
            }
            "print.submit" => {
                let session = self.session(&p)?;
                let i = index(&p)?;
                let job = string(&p, "jobId")?;
                let ids = p["uploadIds"].as_array().ok_or("Missing print uploads")?;
                if ids.len() > 1000 {
                    return Err("Too many print pages".into());
                }
                let inputs = {
                    let mut uploads = self.uploads.lock().unwrap();
                    let mut inputs = vec![];
                    for id in ids {
                        let id = id.as_str().ok_or("Invalid upload ID")?;
                        let entry = uploads.get(id).ok_or("Print data has expired")?;
                        if entry.document != session.info.id {
                            return Err("Print data belongs to another document".into());
                        }
                        let format = printing::capabilities()["format"]
                            .as_str()
                            .unwrap_or("pdf")
                            .to_owned();
                        if entry.kind
                            != if format == "pdf" {
                                "print-pdf"
                            } else {
                                "print-page"
                            }
                        {
                            return Err("Wrong print data format".into());
                        }
                        inputs.push(PrintInput {
                            path: entry.path.clone(),
                            width_mm: entry.width,
                            height_mm: entry.height,
                        });
                    }
                    for id in ids {
                        uploads.remove(id.as_str().unwrap());
                    }
                    inputs
                };
                let copies = u32::try_from(p["copies"].as_u64().ok_or("Missing print copies")?)
                    .map_err(|_| "Invalid print copies")?;
                let cancel = self.jobs.begin(job, &session.info.id)?;
                let result = printing::submit(
                    &self.ledger,
                    &session.info.hash,
                    i,
                    session.policy(i)?,
                    copies,
                    &session.info.name,
                    &inputs,
                    &self.jobs,
                    job,
                    &cancel,
                    session.root.path(),
                )
                .and_then(|r| serde_json::to_value(r).map_err(|e| e.to_string()));
                self.jobs.finish(job);
                for input in inputs {
                    let _ = std::fs::remove_file(input.path);
                }
                result
            }
            _ => Err(format!("Unknown document service operation: {method}")),
        }
    }
    pub fn shutdown(&self) {
        self.jobs.shutdown();
        for session in self.sessions.lock().unwrap().values() {
            let _ = std::fs::remove_file(&session.source);
        }
        self.sessions.lock().unwrap().clear();
    }
}
