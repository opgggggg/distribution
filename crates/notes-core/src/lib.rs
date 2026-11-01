//! CubeOffice-owned Rust notes authority, usable natively and through the common WASM ABI.
pub mod browser;
pub mod brushes;
pub mod codec;
pub mod ffi;
#[cfg(feature = "gpu-renderer")]
pub mod gpu;
pub mod history;
pub mod model;
#[cfg(feature = "native-renderer")]
pub mod native;
#[cfg(feature = "native-renderer")]
mod native_commands;
#[cfg(feature = "native-renderer")]
mod native_edit;
#[cfg(feature = "native-renderer")]
pub mod native_ffi;
#[cfg(feature = "native-renderer")]
mod native_metrics;
#[cfg(feature = "native-renderer")]
mod native_oil;
#[cfg(feature = "native-renderer")]
mod native_panels;
#[cfg(feature = "native-renderer")]
mod native_tiles;
#[cfg(feature = "native-renderer")]
pub mod native_ui;
pub mod page;
pub mod render;
mod wire;
pub mod xopp;
use serde_json::Value;
#[derive(Debug, Clone)]
pub struct Error {
    pub code: String,
    pub message: String,
}
impl Error {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for Error {}
impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        Self::new("InvalidJson", e.to_string())
    }
}
impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Self::new("IoError", e.to_string())
    }
}
impl From<zip::result::ZipError> for Error {
    fn from(e: zip::result::ZipError) -> Self {
        Self::new("InvalidArchive", e.to_string())
    }
}
impl From<Error> for office_browser_abi::KernelError {
    fn from(e: Error) -> Self {
        Self::new(&e.code, e.message)
    }
}
pub type Result<T> = std::result::Result<T, Error>;
pub fn parse(bytes: &[u8]) -> Result<Value> {
    if bytes.len() > model::MAX_BYTES {
        return Err(Error::new(
            "LimitExceeded",
            "Notebook exceeds the 64 MB editing limit.",
        ));
    }
    Ok(serde_json::from_slice(bytes)?)
}
office_browser_abi::export_browser_kernel!(browser::NotesKernel);
