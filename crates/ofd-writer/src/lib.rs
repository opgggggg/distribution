//! Minimal synchronous compatibility entry. No async fetch, JS writer or global document.
use office_browser_abi::{BrowserKernel, KernelError};
use serde_json::{json, Value};
pub type Result<T> = std::result::Result<T, KernelError>;
pub fn error(code: &str, message: impl Into<String>) -> KernelError {
    KernelError::new(code, message)
}
#[path = "../../formats-core/src/ofd/strokes.rs"]
pub mod strokes;
#[path = "../../formats-core/src/ofd/write.rs"]
pub mod write;
#[derive(Default)]
pub struct Writer {
    output: Option<Vec<u8>>,
}
impl BrowserKernel for Writer {
    fn request(&mut self, r: Value) -> Result<Value> {
        let number = |key: &str| r[key].as_f64().unwrap_or(f64::NAN);
        let numeric = |value: f64| {
            serde_json::to_vec(&value).map_err(|e| error("InvalidArgument", e.to_string()))
        };
        let output = match r["op"].as_str() {
            Some("svgAtDeviceScale") => Some(
                strokes::at_device_scale(r["svg"].as_str().unwrap_or(""), number("scale"))?
                    .into_bytes(),
            ),
            Some("strokeScale") => {
                let m: Vec<f64> = r["matrix"]
                    .as_array()
                    .ok_or_else(|| error("InvalidArgument", "Missing matrix."))?
                    .iter()
                    .map(|v| v.as_f64().unwrap_or(f64::NAN))
                    .collect();
                Some(numeric(strokes::stroke_scale(m.try_into().map_err(
                    |_| error("InvalidArgument", "Expected six matrix components."),
                )?))?)
            }
            Some("deviceLineWidth") => Some(numeric(strokes::line_width(
                number("width"),
                number("transformScale"),
                number("deviceScale"),
            )?)?),
            _ => None,
        };
        if let Some(output) = output {
            let size = output.len();
            self.output = Some(output);
            return Ok(json!({"kernel":"rust","bytes":size}));
        }
        if r["op"] != "docx" {
            return Err(error("InvalidArgument", "Unsupported writer operation."));
        }
        let pages = r["pages"]
            .as_array()
            .ok_or_else(|| error("InvalidArgument", "Missing writer pages."))?
            .iter()
            .map(|v| {
                v.as_str()
                    .map(str::to_owned)
                    .ok_or_else(|| error("InvalidArgument", "Text pages must be strings."))
            })
            .collect::<Result<Vec<_>>>()?;
        let output = write::docx(&pages)?;
        let size = output.len();
        self.output = Some(output);
        Ok(json!({"kernel":"rust","bytes":size}))
    }
    fn open(&mut self, bytes: Vec<u8>) -> Result<Value> {
        if bytes.len() > write::MAX_BYTES || bytes.len() < 4 {
            return Err(error("LimitExceeded", "Invalid writer input frame."));
        }
        let n = u32::from_le_bytes(bytes[..4].try_into().unwrap()) as usize;
        let end = n
            .checked_add(4)
            .filter(|n| *n <= bytes.len())
            .ok_or_else(|| error("InvalidArgument", "Truncated writer header."))?;
        let config: Value = serde_json::from_slice(&bytes[4..end])
            .map_err(|e| error("InvalidArgument", e.to_string()))?;
        let list = config["pages"]
            .as_array()
            .ok_or_else(|| error("InvalidArgument", "Missing image pages."))?;
        if list.is_empty() {
            return Err(error("InvalidArgument", "OFD requires at least one page."));
        }
        if list.len() > 1000 {
            return Err(error("LimitExceeded", "Too many OFD pages."));
        }
        let mut offset = end;
        let mut pages = Vec::new();
        for page in list {
            let len = page["length"]
                .as_u64()
                .and_then(|n| usize::try_from(n).ok())
                .ok_or_else(|| error("InvalidArgument", "Invalid image length."))?;
            let next = offset
                .checked_add(len)
                .filter(|n| *n <= bytes.len())
                .ok_or_else(|| error("InvalidArgument", "Truncated image bytes."))?;
            pages.push(write::ImagePage {
                bytes: &bytes[offset..next],
                width: page["width"].as_f64().unwrap_or(f64::NAN),
                height: page["height"].as_f64().unwrap_or(f64::NAN),
            });
            offset = next;
        }
        if offset != bytes.len() {
            return Err(error("InvalidArgument", "Unexpected trailing image bytes."));
        }
        let output = write::image_ofd(&pages, config["id"].as_str().unwrap_or(""))?;
        let size = output.len();
        self.output = Some(output);
        Ok(json!({"kernel":"rust","bytes":size}))
    }
    fn save(&mut self) -> Result<Vec<u8>> {
        self.output
            .clone()
            .ok_or_else(|| error("InvalidState", "No writer output is available."))
    }
}
office_browser_abi::export_browser_kernel!(Writer);
