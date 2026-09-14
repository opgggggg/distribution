use crate::document::{Result, Session};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

pub struct Jobs {
    cancelled: Mutex<HashMap<String, Instant>>,
    closed: Mutex<std::collections::HashSet<String>>,
    flags: Mutex<HashMap<String, (String, Arc<AtomicBool>)>>,
    processes: Mutex<HashMap<String, Arc<Mutex<Child>>>>,
}
impl Default for Jobs {
    fn default() -> Self {
        Self {
            cancelled: Mutex::new(HashMap::new()),
            closed: Mutex::new(std::collections::HashSet::new()),
            flags: Mutex::new(HashMap::new()),
            processes: Mutex::new(HashMap::new()),
        }
    }
}
impl Jobs {
    pub fn begin(&self, id: &str, document: &str) -> Result<Arc<AtomicBool>> {
        if id.len() > 100 || id.is_empty() {
            return Err("Invalid job ID".into());
        }
        let closed = self.closed.lock().unwrap();
        if closed.contains(document) {
            return Err("文档会话已关闭".into());
        }
        let mut cancelled = self.cancelled.lock().unwrap();
        cancelled.retain(|_, time| time.elapsed() < Duration::from_secs(600));
        if cancelled.remove(id).is_some() {
            return Err("操作已取消".into());
        }
        drop(cancelled);
        let mut jobs = self.flags.lock().unwrap();
        if jobs.len() >= 8 || jobs.contains_key(id) {
            return Err("Too many active document jobs".into());
        }
        let flag = Arc::new(AtomicBool::new(false));
        jobs.insert(id.into(), (document.into(), flag.clone()));
        Ok(flag)
    }
    pub fn finish(&self, id: &str) {
        self.flags.lock().unwrap().remove(id);
        self.processes.lock().unwrap().remove(id);
    }
    pub fn cancel(&self, id: &str) {
        if id.len() > 100 {
            return;
        }
        let mut cancelled = self.cancelled.lock().unwrap();
        if cancelled.len() < 2048 {
            cancelled.insert(id.into(), Instant::now());
        }
        drop(cancelled);
        if let Some((_, flag)) = self.flags.lock().unwrap().get(id) {
            flag.store(true, Ordering::Release)
        }
        if let Some(child) = self.processes.lock().unwrap().get(id) {
            let _ = child.lock().unwrap().kill();
        }
    }
    pub fn close_document(&self, document: &str) {
        self.closed.lock().unwrap().insert(document.into());
        let ids = self
            .flags
            .lock()
            .unwrap()
            .iter()
            .filter(|(_, entry)| entry.0 == document)
            .map(|(id, _)| id.clone())
            .collect::<Vec<_>>();
        for id in ids {
            self.cancel(&id)
        }
    }
    pub fn shutdown(&self) {
        let ids = self
            .flags
            .lock()
            .unwrap()
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        for id in ids {
            self.cancel(&id)
        }
    }
    pub fn run(
        &self,
        id: &str,
        program: &Path,
        args: &[String],
        input: Option<&Path>,
        dir: &Path,
        flag: &AtomicBool,
        timeout: Duration,
        output_path: Option<&Path>,
    ) -> Result<Vec<u8>> {
        if flag.load(Ordering::Acquire) {
            return Err("操作已取消".into());
        }
        let stdout = tempfile::NamedTempFile::new_in(dir).map_err(|e| e.to_string())?;
        let stderr = tempfile::NamedTempFile::new_in(dir).map_err(|e| e.to_string())?;
        let mut command = Command::new(program);
        command.env("LC_ALL", "C");
        command
            .args(args)
            .stdin(if let Some(input) = input {
                Stdio::from(std::fs::File::open(input).map_err(|e| e.to_string())?)
            } else {
                Stdio::null()
            })
            .stdout(stdout.reopen().map_err(|e| e.to_string())?)
            .stderr(stderr.reopen().map_err(|e| e.to_string())?);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let child = Arc::new(Mutex::new(command.spawn().map_err(|e| e.to_string())?));
        self.processes
            .lock()
            .unwrap()
            .insert(id.into(), child.clone());
        let start = Instant::now();
        let status = loop {
            let oversized = stdout
                .as_file()
                .metadata()
                .map(|m| m.len() > 1024 * 1024)
                .unwrap_or(true)
                || stderr
                    .as_file()
                    .metadata()
                    .map(|m| m.len() > 1024 * 1024)
                    .unwrap_or(true)
                || output_path
                    .and_then(|p| std::fs::metadata(p).ok())
                    .is_some_and(|m| m.len() > 512 * 1024 * 1024);
            if flag.load(Ordering::Acquire) || start.elapsed() > timeout || oversized {
                let mut child = child.lock().unwrap();
                let _ = child.kill();
                let _ = child.wait();
                self.processes.lock().unwrap().remove(id);
                return Err(if flag.load(Ordering::Acquire) {
                    "操作已取消"
                } else if oversized {
                    "媒体输出超过容量限制"
                } else {
                    "媒体处理超时"
                }
                .into());
            }
            let result = child
                .lock()
                .unwrap()
                .try_wait()
                .map_err(|e| e.to_string())?;
            if let Some(status) = result {
                break status;
            }
            std::thread::sleep(Duration::from_millis(25));
        };
        self.processes.lock().unwrap().remove(id);
        if !status.success() {
            let mut file = stderr.reopen().map_err(|e| e.to_string())?;
            let len = file.metadata().map_err(|e| e.to_string())?.len();
            file.seek(SeekFrom::Start(len.saturating_sub(4096)))
                .map_err(|e| e.to_string())?;
            let mut error = String::new();
            file.read_to_string(&mut error).map_err(|e| e.to_string())?;
            return Err(format!("本地处理失败：{}", error.trim()));
        }
        std::fs::read(stdout.path()).map_err(|e| e.to_string())
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineFile {
    pub name: String,
    pub sha256: String,
    #[serde(default)]
    pub development_name: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineManifest {
    pub ffmpeg: EngineFile,
    pub ffprobe: EngineFile,
    pub source_urls: Vec<String>,
    pub required_decoders: Vec<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub available: bool,
    pub version: String,
    pub decoders: Vec<String>,
    pub avs: bool,
    pub avs2: bool,
    pub avs3: bool,
    pub reason: Option<String>,
    pub profile_notes: Vec<String>,
}
pub struct MediaEngine {
    pub capabilities: Capabilities,
    ffmpeg: PathBuf,
    ffprobe: PathBuf,
}
pub fn hash_file(path: &Path) -> Result<String> {
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    let mut buffer = [0; 65536];
    loop {
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hash.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
impl MediaEngine {
    pub fn load(resource_dir: &Path) -> Self {
        let result = (|| -> Result<Self> {
            let manifest_path = if resource_dir.join("ofd-engines.json").is_file() {
                resource_dir.join("ofd-engines.json")
            } else {
                std::env::current_exe()
                    .map_err(|e| e.to_string())?
                    .parent()
                    .ok_or("Missing engine directory")?
                    .join("ofd-engines.json")
            };
            let manifest: EngineManifest =
                serde_json::from_slice(&std::fs::read(manifest_path).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            let bin = std::env::current_exe()
                .map_err(|e| e.to_string())?
                .parent()
                .ok_or("Missing binary directory")?
                .to_owned();
            let resolve = |f: &EngineFile| -> Result<PathBuf> {
                if f.name.contains(['/', '\\']) {
                    return Err("Invalid engine filename".into());
                }
                let mut path = bin.join(&f.name);
                if !path.is_file() {
                    if let Some(dev) = &f.development_name {
                        if !dev.contains(['/', '\\']) {
                            path = bin.join(dev)
                        }
                    }
                }
                if hash_file(&path)? != f.sha256 {
                    return Err("媒体引擎完整性检查失败".into());
                }
                Ok(path)
            };
            let ffmpeg = resolve(&manifest.ffmpeg)?;
            let ffprobe = resolve(&manifest.ffprobe)?;
            let list = Command::new(&ffmpeg)
                .args(["-hide_banner", "-decoders"])
                .output()
                .map_err(|e| e.to_string())?;
            if !list.status.success() {
                return Err("Media engine cannot enumerate decoders".into());
            }
            let decoders = String::from_utf8_lossy(&list.stdout)
                .lines()
                .filter_map(|line| {
                    let mut fields = line.split_whitespace();
                    let flags = fields.next()?;
                    let name = fields.next()?;
                    if flags.len() == 6
                        && flags.chars().all(|c| c.is_ascii_alphabetic() || c == '.')
                    {
                        Some(name.to_owned())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>();
            for required in &manifest.required_decoders {
                if !decoders.contains(required) {
                    return Err(format!("Required media decoder {required} is missing"));
                }
            }
            let protocols = Command::new(&ffmpeg)
                .args(["-hide_banner", "-protocols"])
                .output()
                .map_err(|e| e.to_string())?;
            if !String::from_utf8_lossy(&protocols.stdout)
                .lines()
                .any(|line| line.trim() == "fd")
            {
                return Err("Media engine must support seekable fd input".into());
            }
            let version = Command::new(&ffmpeg)
                .arg("-version")
                .output()
                .map_err(|e| e.to_string())?;
            let capabilities = Capabilities {
                available: true,
                version: String::from_utf8_lossy(&version.stdout)
                    .lines()
                    .next()
                    .unwrap_or("")
                    .to_owned(),
                avs: decoders.iter().any(|c| c == "cavs"),
                avs2: decoders.iter().any(|c| c == "avs2" || c == "libdavs2"),
                avs3: decoders.iter().any(|c| c == "avs3" || c == "libuavs3d"),
                decoders,
                reason: None,
                profile_notes: vec![
                    "AVS2: upstream davs2 8-bit profile; AVS3: portable 8/10-bit build".into(),
                ],
            };
            Ok(Self {
                capabilities,
                ffmpeg,
                ffprobe,
            })
        })();
        result.unwrap_or_else(|error| Self {
            capabilities: Capabilities {
                available: false,
                version: "".into(),
                decoders: vec![],
                avs: false,
                avs2: false,
                avs3: false,
                reason: Some(error),
                profile_notes: vec![],
            },
            ffmpeg: PathBuf::new(),
            ffprobe: PathBuf::new(),
        })
    }
    pub fn prepare(
        &self,
        session: &Session,
        index: usize,
        page_id: Option<&str>,
        resource_id: &str,
        jobs: &Jobs,
        job_id: &str,
        cancel: &AtomicBool,
        transcode: bool,
    ) -> Result<Value> {
        session
            .policy(index)?
            .authorize("read", chrono::Utc::now().timestamp())?;
        let (_, bytes) = session.media(index, page_id, resource_id)?;
        let key = format!("{:x}", Sha256::digest(bytes));
        if !transcode {
            if let Some((extension, mime, kind)) = browser_media(bytes) {
                let output = session
                    .root
                    .path()
                    .join(format!("media-original-{key}.{extension}"));
                if !output.exists() {
                    std::fs::write(&output, bytes).map_err(|e| e.to_string())?;
                }
                return Ok(
                    json!({"path":output,"mime":mime,"kind":kind,"direct":true,"hostFiles":[output]}),
                );
            }
        }
        if !self.capabilities.available {
            return Err("此媒体需要可选转码组件；文档的其他内容仍可正常阅读".into());
        }
        let input = session.root.path().join(format!("media-{key}.bin"));
        if !input.exists() {
            std::fs::write(&input, bytes).map_err(|e| e.to_string())?;
        }
        let formats = "mov,matroska,avi,mpeg,mpegts,mp3,wav,aac,flac,ogg,cavsvideo,avs2,avs3";
        let probe_args = [
            "-v",
            "error",
            "-max_alloc",
            "67108864",
            "-protocol_whitelist",
            "fd,pipe",
            "-format_whitelist",
            formats,
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            "-i",
            "fd:0",
        ]
        .map(str::to_owned)
        .to_vec();
        let result = jobs.run(
            job_id,
            &self.ffprobe,
            &probe_args,
            Some(&input),
            session.root.path(),
            cancel,
            Duration::from_secs(15),
            None,
        )?;
        let probe: Value = serde_json::from_slice(&result).map_err(|e| e.to_string())?;
        let streams = probe["streams"].as_array().ok_or("Media has no streams")?;
        let video = streams.iter().find(|s| s["codec_type"] == "video");
        if let Some(video) = video {
            let width = video["width"].as_u64().unwrap_or(0);
            let height = video["height"].as_u64().unwrap_or(0);
            if width == 0 || height == 0 || width.saturating_mul(height) > 16_777_216 {
                return Err("Unsupported video dimensions".into());
            }
        }
        if video.is_none() && !streams.iter().any(|s| s["codec_type"] == "audio") {
            return Err("Resource contains no audio or video".into());
        }
        let extension = if video.is_some() { "mp4" } else { "wav" };
        let output = session
            .root
            .path()
            .join(format!("media-webview-{key}.{extension}"));
        if !output.exists() {
            let temporary = session.root.path().join(format!(
                "media-{key}-{}.{}",
                uuid::Uuid::new_v4(),
                extension
            ));
            let mut args = [
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "error",
                "-max_alloc",
                "268435456",
                "-protocol_whitelist",
                "fd,pipe",
                "-format_whitelist",
                formats,
                "-threads",
                "2",
                "-i",
                "fd:0",
                "-sn",
                "-dn",
            ]
            .map(str::to_owned)
            .to_vec();
            if video.is_some() {
                args.extend(
                    [
                        "-map",
                        "0:v:0",
                        "-map",
                        "0:a:0?",
                        "-c:v",
                        "libx264",
                        "-preset",
                        "veryfast",
                        "-crf",
                        "20",
                        "-pix_fmt",
                        "yuv420p",
                        "-vf",
                        "pad=ceil(iw/2)*2:ceil(ih/2)*2",
                        "-threads",
                        "2",
                        "-c:a",
                        "aac",
                        "-b:a",
                        "192k",
                        "-movflags",
                        "+faststart",
                    ]
                    .map(str::to_owned),
                );
            } else {
                args.extend(["-map", "0:a:0", "-vn", "-c:a", "pcm_s16le"].map(str::to_owned));
            }
            args.extend(["-y".into(), temporary.to_string_lossy().into_owned()]);
            let result = jobs.run(
                job_id,
                &self.ffmpeg,
                &args,
                Some(&input),
                session.root.path(),
                cancel,
                Duration::from_secs(180),
                Some(&temporary),
            );
            if let Err(error) = result {
                let _ = std::fs::remove_file(temporary);
                return Err(error);
            }
            std::fs::rename(&temporary, &output).map_err(|e| e.to_string())?;
        }
        Ok(
            json!({"path":output,"mime":if video.is_some(){"video/mp4"}else{"audio/wav"},"kind":if video.is_some(){"video"}else{"audio"},"probe":probe,"hostFiles":[output]}),
        )
    }
}

fn browser_media(bytes: &[u8]) -> Option<(&'static str, &'static str, &'static str)> {
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WAVE" {
        Some(("wav", "audio/wav", "audio"))
    } else if bytes.len() >= 12
        && [b"ftyp".as_slice(), b"moov".as_slice(), b"mdat".as_slice()].contains(&&bytes[4..8])
    {
        Some(("mp4", "video/mp4", "video"))
    } else if bytes.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]) {
        Some(("webm", "video/webm", "video"))
    } else if bytes.starts_with(b"OggS") {
        Some(("ogg", "audio/ogg", "audio"))
    } else if bytes.starts_with(b"fLaC") {
        Some(("flac", "audio/flac", "audio"))
    } else if bytes.len() > 2 && bytes[0] == 0xff && (bytes[1] & 0xf6) == 0xf0 {
        Some(("aac", "audio/aac", "audio"))
    } else if bytes.starts_with(b"ID3")
        || (bytes.len() > 2 && bytes[0] == 0xff && (bytes[1] & 0xe0) == 0xe0)
    {
        Some(("mp3", "audio/mpeg", "audio"))
    } else {
        None
    }
}
#[cfg(test)]
mod direct_tests {
    use super::*;
    #[test]
    fn common_media_does_not_require_transcoding() {
        assert_eq!(browser_media(b"RIFFxxxxWAVEdata").unwrap().1, "audio/wav");
        assert_eq!(browser_media(b"\0\0\0\x18ftypisom").unwrap().1, "video/mp4");
        assert!(browser_media(b"<html>not media</html>").is_none());
    }
}
