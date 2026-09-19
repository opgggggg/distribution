use crate::{
    document::{Policy, Result},
    media::Jobs,
    trust::atomic_json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
#[cfg(not(windows))]
use std::time::Duration;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Mutex},
};
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintJob {
    pub id: String,
    pub document_hash: String,
    pub document_index: usize,
    pub copies: u32,
    pub status: String,
    pub printer_job: Option<String>,
    pub detail: Option<String>,
    pub created_at: i64,
}
#[derive(Clone, Default, Serialize, Deserialize)]
struct Data {
    used: HashMap<String, u64>,
    jobs: Vec<PrintJob>,
}
pub struct Ledger {
    path: PathBuf,
    data: Mutex<Data>,
}
impl Ledger {
    pub fn load(dir: &Path) -> Result<Self> {
        let path = dir.join("print-ledger.json");
        let mut data: Data = if path.exists() {
            serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?
        } else {
            Data::default()
        };
        let mut changed = false;
        for job in &mut data.jobs {
            if job.status == "reserved" {
                job.status = "unknown".into();
                job.detail = Some("上次打印未完成状态确认，份数仍保留".into());
                changed = true;
            }
        }
        if changed {
            atomic_json(&path, &data)?;
        }
        Ok(Self {
            path,
            data: Mutex::new(data),
        })
    }
    fn key(hash: &str, index: usize) -> String {
        format!("{hash}:{index}")
    }
    pub fn remaining(&self, hash: &str, index: usize, policy: &Policy) -> Option<u64> {
        policy.copies.map(|max| {
            (max as u64).saturating_sub(
                *self
                    .data
                    .lock()
                    .unwrap()
                    .used
                    .get(&Self::key(hash, index))
                    .unwrap_or(&0),
            )
        })
    }
    pub fn reserve(
        &self,
        hash: &str,
        index: usize,
        copies: u32,
        policy: &Policy,
    ) -> Result<PrintJob> {
        policy.authorize("print", chrono::Utc::now().timestamp())?;
        if copies == 0 || copies > 99 {
            return Err("打印份数必须在 1 到 99 之间".into());
        }
        let mut state = self.data.lock().unwrap();
        let mut next = state.clone();
        let used = next.used.entry(Self::key(hash, index)).or_default();
        if policy
            .copies
            .is_some_and(|max| *used + copies as u64 > max as u64)
        {
            return Err("打印份数超过文档剩余额度".into());
        }
        *used += copies as u64;
        let job = PrintJob {
            id: uuid::Uuid::new_v4().to_string(),
            document_hash: hash.into(),
            document_index: index,
            copies,
            status: "reserved".into(),
            printer_job: None,
            detail: None,
            created_at: chrono::Utc::now().timestamp(),
        };
        next.jobs.push(job.clone());
        if next.jobs.len() > 10000 {
            next.jobs.drain(..next.jobs.len() - 10000);
        }
        atomic_json(&self.path, &next)?;
        *state = next;
        Ok(job)
    }
    pub fn finish(
        &self,
        id: &str,
        status: &str,
        printer_job: Option<String>,
        detail: Option<String>,
    ) -> Result<PrintJob> {
        let mut state = self.data.lock().unwrap();
        let mut next = state.clone();
        let job = next
            .jobs
            .iter_mut()
            .find(|j| j.id == id)
            .ok_or("Unknown print job")?;
        if job.status != "reserved" {
            return Err("Print job is already finalized".into());
        }
        job.status = status.into();
        job.printer_job = printer_job;
        job.detail = detail;
        if status == "failed" {
            let used = next
                .used
                .entry(Self::key(&job.document_hash, job.document_index))
                .or_default();
            *used = used.saturating_sub(job.copies as u64);
        }
        let result = job.clone();
        atomic_json(&self.path, &next)?;
        *state = next;
        Ok(result)
    }
    pub fn jobs(&self, hash: &str) -> Vec<PrintJob> {
        self.data
            .lock()
            .unwrap()
            .jobs
            .iter()
            .filter(|j| j.document_hash == hash)
            .rev()
            .take(50)
            .cloned()
            .collect()
    }
}
pub fn capabilities() -> Value {
    #[cfg(windows)]
    {
        return json!({"available":true,"backend":"windows-gdi","format":"png"});
    }
    #[cfg(not(windows))]
    {
        let program = Path::new("/usr/bin/lp");
        json!({"available":program.is_file(),"backend":"cups","format":"pdf"})
    }
}
pub struct PrintInput {
    pub path: PathBuf,
    pub width_mm: f64,
    pub height_mm: f64,
}
pub fn submit(
    ledger: &Ledger,
    hash: &str,
    index: usize,
    policy: &Policy,
    copies: u32,
    name: &str,
    inputs: &[PrintInput],
    jobs: &Jobs,
    job_id: &str,
    cancel: &AtomicBool,
    dir: &Path,
) -> Result<PrintJob> {
    if !capabilities()["available"].as_bool().unwrap_or(false) {
        return Err("此系统没有可用的打印服务".into());
    }
    if inputs.is_empty() {
        return Err("No printable pages".into());
    }
    for input in inputs {
        if !input.width_mm.is_finite()
            || !input.height_mm.is_finite()
            || input.width_mm <= 0.0
            || input.height_mm <= 0.0
        {
            return Err("Invalid print dimensions".into());
        }
        if !input.path.is_file() {
            return Err("Print data is missing".into());
        }
    }
    #[cfg(not(windows))]
    let printer = {
        let output = jobs.run(
            job_id,
            Path::new("/usr/bin/lpstat"),
            &["-d".into()],
            None,
            dir,
            cancel,
            Duration::from_secs(5),
            None,
        )?;
        let text = String::from_utf8_lossy(&output);
        let name = text
            .rsplit_once(':')
            .map(|(_, name)| name.trim())
            .filter(|name| !name.is_empty())
            .ok_or("系统没有默认打印机")?
            .to_owned();
        name
    };
    let reservation = ledger.reserve(hash, index, copies, policy)?;
    if cancel.load(std::sync::atomic::Ordering::Acquire) {
        return ledger.finish(
            &reservation.id,
            "failed",
            None,
            Some("已在提交前取消".into()),
        );
    }
    #[cfg(not(windows))]
    {
        if inputs.len() != 1 {
            return ledger.finish(
                &reservation.id,
                "failed",
                None,
                Some("CUPS expects one PDF document".into()),
            );
        }
        let args = vec![
            "-d".into(),
            printer,
            "-o".into(),
            "fit-to-page".into(),
            "-n".into(),
            copies.to_string(),
            "-t".into(),
            name.chars().take(120).collect(),
            "--".into(),
            inputs[0].path.to_string_lossy().into_owned(),
        ];
        match jobs.run(
            job_id,
            Path::new("/usr/bin/lp"),
            &args,
            None,
            dir,
            cancel,
            Duration::from_secs(30),
            None,
        ) {
            Ok(output) => {
                let result = String::from_utf8_lossy(&output).trim().to_owned();
                ledger.finish(
                    &reservation.id,
                    "submitted",
                    Some(result),
                    Some("已提交系统打印队列；这不代表纸张已输出".into()),
                )
            }
            Err(error) => ledger.finish(
                &reservation.id,
                "unknown",
                None,
                Some(format!("提交状态无法确认，保留本次份数：{error}")),
            ),
        }
    }
    #[cfg(windows)]
    {
        let _ = (jobs, job_id, dir);
        match windows::print(name, inputs, copies, cancel) {
            Ok(id) => ledger.finish(
                &reservation.id,
                "submitted",
                Some(id.to_string()),
                Some("已提交系统打印队列".into()),
            ),
            Err((error, submitted)) => ledger.finish(
                &reservation.id,
                if submitted { "unknown" } else { "failed" },
                None,
                Some(error),
            ),
        }
    }
}
#[cfg(windows)]
mod windows {
    use super::*;
    use std::sync::atomic::Ordering;
    use windows_sys::Win32::{
        Graphics::{Gdi::*, Printing::GetDefaultPrinterW},
        Storage::Xps::{AbortDoc, EndDoc, EndPage, StartDocW, StartPage, DOCINFOW},
    };
    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(Some(0)).collect()
    }
    pub fn print(
        name: &str,
        pages: &[PrintInput],
        copies: u32,
        cancel: &AtomicBool,
    ) -> std::result::Result<i32, (String, bool)> {
        unsafe {
            let mut length = 0;
            GetDefaultPrinterW(std::ptr::null_mut(), &mut length);
            if length == 0 {
                return Err(("系统没有默认打印机".into(), false));
            }
            let mut printer = vec![0u16; length as usize];
            if GetDefaultPrinterW(printer.as_mut_ptr(), &mut length) == 0 {
                return Err(("无法读取默认打印机".into(), false));
            }
            let dc = CreateDCW(
                std::ptr::null(),
                printer.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
            );
            if dc.is_null() {
                return Err(("无法打开打印机".into(), false));
            }
            let title = wide(name);
            let doc = DOCINFOW {
                cbSize: std::mem::size_of::<DOCINFOW>() as _,
                lpszDocName: title.as_ptr(),
                lpszOutput: std::ptr::null(),
                lpszDatatype: std::ptr::null(),
                fwType: 0,
            };
            let id = StartDocW(dc, &doc);
            if id <= 0 {
                DeleteDC(dc);
                return Err(("打印机拒绝任务".into(), false));
            }
            let result = (|| -> Result<()> {
                for _ in 0..copies {
                    for page in pages {
                        if cancel.load(Ordering::Acquire) {
                            return Err("打印已取消，部分页面可能已经输出".into());
                        }
                        let reader =
                            image::ImageReader::open(&page.path).map_err(|e| e.to_string())?;
                        let image = reader.decode().map_err(|e| e.to_string())?.to_rgba8();
                        let (w, h) = image.dimensions();
                        if w == 0 || h == 0 || (w as u64) * (h as u64) > 40_000_000 {
                            return Err("打印页像素超限".into());
                        }
                        let mut pixels = image.into_raw();
                        for p in pixels.chunks_exact_mut(4) {
                            p.swap(0, 2)
                        }
                        if StartPage(dc) <= 0 {
                            return Err("无法开始打印页".into());
                        }
                        let pw = GetDeviceCaps(dc, HORZRES as i32);
                        let ph = GetDeviceCaps(dc, VERTRES as i32);
                        let scale = (pw as f64 / w as f64).min(ph as f64 / h as f64);
                        let dw = (w as f64 * scale) as i32;
                        let dh = (h as f64 * scale) as i32;
                        let bitmap = BITMAPINFO {
                            bmiHeader: BITMAPINFOHEADER {
                                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as _,
                                biWidth: w as _,
                                biHeight: -(h as i32),
                                biPlanes: 1,
                                biBitCount: 32,
                                biCompression: BI_RGB,
                                biSizeImage: 0,
                                biXPelsPerMeter: 0,
                                biYPelsPerMeter: 0,
                                biClrUsed: 0,
                                biClrImportant: 0,
                            },
                            bmiColors: [RGBQUAD {
                                rgbBlue: 0,
                                rgbGreen: 0,
                                rgbRed: 0,
                                rgbReserved: 0,
                            }],
                        };
                        SetStretchBltMode(dc, HALFTONE as _);
                        let drawn = StretchDIBits(
                            dc,
                            (pw - dw) / 2,
                            (ph - dh) / 2,
                            dw,
                            dh,
                            0,
                            0,
                            w as _,
                            h as _,
                            pixels.as_ptr().cast(),
                            &bitmap,
                            DIB_RGB_COLORS,
                            SRCCOPY,
                        );
                        if drawn == 0 || EndPage(dc) <= 0 {
                            return Err("打印页提交失败".into());
                        }
                    }
                }
                if EndDoc(dc) <= 0 {
                    return Err("打印任务完成状态未知".into());
                }
                Ok(())
            })();
            if result.is_err() {
                AbortDoc(dc);
            }
            DeleteDC(dc);
            result.map(|_| id).map_err(|e| (e, true))
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quota_reservation_survives_restart_and_uncertain_jobs() {
        let dir = tempfile::tempdir().unwrap();
        let ledger = Ledger::load(dir.path()).unwrap();
        let mut policy = Policy::parse(None).unwrap();
        policy.copies = Some(2);
        let job = ledger.reserve("hash", 0, 1, &policy).unwrap();
        ledger.finish(&job.id, "unknown", None, None).unwrap();
        let restarted = Ledger::load(dir.path()).unwrap();
        assert_eq!(restarted.remaining("hash", 0, &policy), Some(1));
        assert!(restarted.reserve("hash", 0, 2, &policy).is_err());
        let second = restarted.reserve("hash", 0, 1, &policy).unwrap();
        restarted.finish(&second.id, "failed", None, None).unwrap();
        assert_eq!(restarted.remaining("hash", 0, &policy), Some(1));
    }
}
