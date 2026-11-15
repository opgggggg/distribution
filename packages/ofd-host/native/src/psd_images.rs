//! PSD image operations share the trusted profile-service transport. No HTTP listener.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};

pub struct Images {
    root: PathBuf,
    helper: Option<PathBuf>,
    gate: Mutex<()>,
    outputs: Mutex<HashMap<String, PathBuf>>,
}
impl Images {
    pub fn new(root: PathBuf, resources: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        for item in std::fs::read_dir(&root)
            .map_err(|e| e.to_string())?
            .flatten()
        {
            if item.path().is_file() {
                let _ = std::fs::remove_file(item.path());
            }
        }
        let sibling = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(Path::to_owned));
        let mut candidates = vec![resources.join("cubeoffice-psd-images")];
        if let Some(dir) = sibling {
            candidates.push(dir.join("cubeoffice-psd-images"));
            candidates.push(dir.join(format!(
                "cubeoffice-psd-images-{}-apple-darwin",
                std::env::consts::ARCH
            )));
        }
        let helper = if cfg!(target_os = "macos") {
            candidates.into_iter().find(|p| p.is_file())
        } else {
            None
        };
        Ok(Self {
            root,
            helper,
            gate: Mutex::new(()),
            outputs: Mutex::new(HashMap::new()),
        })
    }
    pub fn available(&self) -> bool {
        self.helper.is_some()
    }
    pub fn process(&self, input: &Path, meta: &Value) -> Result<Value, String> {
        let result = self.run(input, meta);
        let _ = std::fs::remove_file(input);
        result
    }
    fn run(&self, input: &Path, meta: &Value) -> Result<Value, String> {
        let _gate = self.gate.lock().map_err(|_| "Image service unavailable")?;
        let helper = self
            .helper
            .as_ref()
            .ok_or("Native PSD image services require the macOS helper")?;
        let operation = meta["operation"].as_str().unwrap_or("");
        if !["decode", "foreground"].contains(&operation) {
            return Err("Unknown image operation".into());
        }
        if self.outputs.lock().unwrap().len() >= 4 {
            return Err("Release previous image results first".into());
        }
        let bytes = std::fs::read(input).map_err(|e| e.to_string())?;
        if bytes.len() > 48 * 1024 * 1024 {
            return Err("Image input exceeds 48 MiB".into());
        }
        let request = json!({"operation":operation,"data":STANDARD.encode(bytes),"advanced":meta["advanced"].as_bool().unwrap_or(false),"refineEdges":meta["refineEdges"].as_f64().unwrap_or(0.),"shiftEdge":meta["shiftEdge"].as_f64().unwrap_or(0.),"contrast":meta["contrast"].as_f64().unwrap_or(0.)});
        let mut child = Command::new(helper)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Cannot start PSD image helper: {e}"))?;
        let mut stdin = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();
        let writer = std::thread::spawn(move || -> std::io::Result<()> {
            serde_json::to_writer(&mut stdin, &request)?;
            stdin.write_all(b"\n")
        });
        let reader = std::thread::spawn(move || -> std::io::Result<Vec<u8>> {
            let mut out = vec![];
            stdout.take(90 * 1024 * 1024 + 1).read_to_end(&mut out)?;
            Ok(out)
        });
        let start = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if start.elapsed() < Duration::from_secs(90) => {
                    std::thread::sleep(Duration::from_millis(20))
                }
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = writer.join();
                    let _ = reader.join();
                    return Err("PSD image helper timed out or exited unexpectedly".into());
                }
            }
        }
        writer
            .join()
            .map_err(|_| "Image writer failed")?
            .map_err(|e| e.to_string())?;
        let data = reader
            .join()
            .map_err(|_| "Image reader failed")?
            .map_err(|e| e.to_string())?;
        if data.len() > 90 * 1024 * 1024 {
            return Err("Image response is too large".into());
        }
        let response: Value = serde_json::from_slice(&data).map_err(|e| e.to_string())?;
        if let Some(error) = response["error"].as_str() {
            return Err(error.into());
        }
        let png = STANDARD
            .decode(response["data"].as_str().ok_or("Missing image result")?)
            .map_err(|e| e.to_string())?;
        if png.len() > 64 * 1024 * 1024 {
            return Err("Image result exceeds 64 MiB".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        let path = self.root.join(&id);
        std::fs::write(&path, &png).map_err(|e| e.to_string())?;
        self.outputs.lock().unwrap().insert(id.clone(), path);
        Ok(json!({"id":id,"length":png.len()}))
    }
    pub fn read(&self, p: &Value) -> Result<Value, String> {
        use std::io::{Seek, SeekFrom};
        let outputs = self.outputs.lock().unwrap();
        let path = outputs
            .get(p["id"].as_str().unwrap_or(""))
            .ok_or("Unknown image result")?;
        let offset = p["offset"].as_u64().ok_or("Missing image offset")?;
        let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
        if offset >= file.metadata().map_err(|e| e.to_string())?.len() {
            return Err("Image offset out of range".into());
        }
        file.seek(SeekFrom::Start(offset))
            .map_err(|e| e.to_string())?;
        let mut bytes = vec![];
        file.take(1024 * 1024)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        Ok(json!({"data":STANDARD.encode(bytes)}))
    }
    pub fn release(&self, p: &Value) -> Result<Value, String> {
        if let Some(path) = self
            .outputs
            .lock()
            .unwrap()
            .remove(p["id"].as_str().unwrap_or(""))
        {
            let _ = std::fs::remove_file(path);
        }
        Ok(json!({"released":true}))
    }
}
