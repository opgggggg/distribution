//! Distribution-owned color-provider import v1. The adapter returns errors as data,
//! never a JS exception through a borrowed Rust session. No document bytes cross it.
use super::ColorHost;
use crate::{error, Result};
#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "cubeoffice_ofd_host_v1")]
extern "C" {
    fn color(ptr: *const u8, len: usize, reply: *mut u32) -> u32;
}
pub struct ImportedColorHost {
    pub active: bool,
}
impl ColorHost for ImportedColorHost {
    fn enabled(&self) -> bool {
        self.active
    }
    fn convert(
        &self,
        values: &[f64],
        space: &str,
        bits: f64,
        profile: Option<&str>,
    ) -> Result<[f64; 3]> {
        #[cfg(not(target_arch = "wasm32"))]
        {
            let _ = (values, space, bits, profile);
            Err(error(
                "UnsupportedHost",
                "Native OFD callers must supply a ColorHost binding.",
            ))
        }
        #[cfg(target_arch = "wasm32")]
        {
            let input=serde_json::to_vec(&serde_json::json!({"components":values,"type":space,"bitsPerComponent":bits,"profilePath":profile})).map_err(|e|error("InvalidColor",e.to_string()))?;
            let mut reply = [0_u32; 2];
            let status = unsafe { color(input.as_ptr(), input.len(), reply.as_mut_ptr()) };
            let ptr = reply[0] as *mut u8;
            let len = reply[1] as usize;
            if ptr.is_null() || len > 1024 * 1024 {
                return Err(error("InvalidColor", "Invalid color provider response."));
            }
            let output = unsafe {
                serde_json::from_slice::<serde_json::Value>(std::slice::from_raw_parts(ptr, len))
            };
            unsafe { office_browser_abi::dealloc(ptr, len) };
            let output = output.map_err(|e| error("InvalidColor", e.to_string()))?;
            if status != 0 {
                return Err(error(
                    "InvalidColor",
                    output["error"].as_str().unwrap_or("Color provider failed."),
                ));
            }
            let values = output
                .as_array()
                .filter(|v| v.len() == 3)
                .ok_or_else(|| error("InvalidColor", "Invalid colorConverter RGB result."))?;
            let mut rgb = [0.0; 3];
            for i in 0..3 {
                rgb[i] = values[i]
                    .as_f64()
                    .filter(|n| n.is_finite() && *n >= 0.0 && *n <= 255.0)
                    .ok_or_else(|| error("InvalidColor", "Invalid colorConverter RGB result."))?;
            }
            Ok(rgb)
        }
    }
}
