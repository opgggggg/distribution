//! Handle-scoped native API. No JSON bridge is required for future per-sample drawing APIs.
use crate::browser::NotesKernel;
use office_browser_abi::BrowserKernel;
use serde_json::json;
pub struct NotesHandle {
    kernel: NotesKernel,
    output: Vec<u8>,
}
pub struct NotesSnapshot {
    pub(crate) value: crate::history::SaveSnapshot,
    pub(crate) brushes: crate::model::BrushCatalog,
    pub(crate) output: Vec<u8>,
}
#[cfg(feature = "native-renderer")]
pub struct NotesRenderer {
    renderer: crate::render::Renderer,
    output: Vec<u8>,
}

#[cfg(feature = "native-renderer")]
#[no_mangle]
pub extern "C" fn cube_notes_renderer_new() -> *mut NotesRenderer {
    Box::into_raw(Box::new(NotesRenderer {
        renderer: crate::render::Renderer::new([]),
        output: Vec::new(),
    }))
}
/// # Safety
/// Renderer is null or live and exclusively owned, not previously freed.
#[cfg(feature = "native-renderer")]
#[no_mangle]
pub unsafe extern "C" fn cube_notes_renderer_free(renderer: *mut NotesRenderer) {
    if !renderer.is_null() {
        drop(Box::from_raw(renderer));
    }
}
/// # Safety
/// Renderer is live/exclusively borrowed; font points to length readable bytes.
#[cfg(feature = "native-renderer")]
#[no_mangle]
pub unsafe extern "C" fn cube_notes_renderer_add_font(
    renderer: *mut NotesRenderer,
    font: *const u8,
    length: usize,
) -> u32 {
    if renderer.is_null() || font.is_null() || length > 32 * 1024 * 1024 {
        return 1;
    }
    let r = &mut *renderer;
    let result = r
        .renderer
        .add_font(std::slice::from_raw_parts(font, length).to_vec())
        .map(|_| Vec::new());
    render_reply(r, result)
}
#[cfg(feature = "native-renderer")]
fn render_reply(renderer: &mut NotesRenderer, result: crate::Result<Vec<u8>>) -> u32 {
    match result {
        Ok(bytes) => {
            renderer.output = bytes;
            0
        }
        Err(e) => {
            renderer.output =
                serde_json::to_vec(&json!({"code":e.code,"message":e.message})).unwrap_or_default();
            1
        }
    }
}
/// Render an immutable snapshot on a worker; output is premultiplied RGBA8, stride width*4.
/// # Safety
/// Renderer is exclusive, snapshot is live/shared, ID contains length readable UTF-8 bytes.
/// Do not mutate/free the snapshot concurrently. Live document edits may continue.
#[cfg(feature = "native-renderer")]
#[no_mangle]
pub unsafe extern "C" fn cube_notes_render(
    renderer: *mut NotesRenderer,
    snapshot: *const NotesSnapshot,
    id: *const u8,
    length: usize,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    pixel_width: u32,
    pixel_height: u32,
) -> u32 {
    if renderer.is_null() || snapshot.is_null() || id.is_null() || length > 512 {
        return 1;
    }
    let r = &mut *renderer;
    let snapshot = &*snapshot;
    let result = (|| {
        let id = std::str::from_utf8(std::slice::from_raw_parts(id, length))
            .map_err(|_| crate::Error::new("MissingPage", "Invalid page ID."))?;
        let page = snapshot
            .value
            .document
            .pages
            .iter()
            .find(|p| p["id"] == id)
            .ok_or_else(|| crate::Error::new("MissingPage", "Notebook page was removed."))?;
        Ok(r.renderer
            .render(
                page,
                crate::render::Bounds {
                    x,
                    y,
                    width,
                    height,
                },
                pixel_width,
                pixel_height,
            )?
            .take())
    })();
    render_reply(r, result)
}
/// # Safety
/// Renderer is live. Copy before its next call or destruction.
#[cfg(feature = "native-renderer")]
#[no_mangle]
pub unsafe extern "C" fn cube_notes_renderer_output_ptr(
    renderer: *const NotesRenderer,
) -> *const u8 {
    if renderer.is_null() {
        std::ptr::null()
    } else {
        (*renderer).output.as_ptr()
    }
}
/// # Safety
/// Renderer is live.
#[cfg(feature = "native-renderer")]
#[no_mangle]
pub unsafe extern "C" fn cube_notes_renderer_output_len(renderer: *const NotesRenderer) -> usize {
    if renderer.is_null() {
        0
    } else {
        (*renderer).output.len()
    }
}
fn reply(
    handle: &mut NotesHandle,
    result: Result<Vec<u8>, office_browser_abi::KernelError>,
) -> u32 {
    match result {
        Ok(bytes) => {
            handle.output = bytes;
            0
        }
        Err(e) => {
            handle.output =
                serde_json::to_vec(&json!({"code":e.code,"message":e.message})).unwrap_or_default();
            1
        }
    }
}
#[no_mangle]
pub extern "C" fn cube_notes_new() -> *mut NotesHandle {
    Box::into_raw(Box::new(NotesHandle {
        kernel: NotesKernel::default(),
        output: Vec::new(),
    }))
}
/// # Safety
/// `handle` is null or a live, exclusively owned handle from `cube_notes_new`.
#[no_mangle]
pub unsafe extern "C" fn cube_notes_free(handle: *mut NotesHandle) {
    if !handle.is_null() {
        drop(Box::from_raw(handle));
    }
}
/// # Safety
/// Handle must be live, and input must contain `len` readable bytes. Calls for one handle are serialized.
#[no_mangle]
pub unsafe extern "C" fn cube_notes_request(
    handle: *mut NotesHandle,
    ptr: *const u8,
    len: usize,
) -> u32 {
    if handle.is_null() || ptr.is_null() || len > crate::model::MAX_BYTES {
        return 1;
    }
    let handle = &mut *handle;
    let result = office_browser_abi::parse_request(std::slice::from_raw_parts(ptr, len))
        .and_then(|request| handle.kernel.request(request))
        .and_then(|v| office_browser_abi::json_bytes(&v));
    reply(handle, result)
}
/// # Safety
/// Same ownership and byte slice requirements as `cube_notes_request`.
#[no_mangle]
pub unsafe extern "C" fn cube_notes_open(
    handle: *mut NotesHandle,
    ptr: *const u8,
    len: usize,
) -> u32 {
    if handle.is_null() || ptr.is_null() || len > crate::model::MAX_BYTES {
        return 1;
    }
    let handle = &mut *handle;
    let result = handle
        .kernel
        .open(std::slice::from_raw_parts(ptr, len).to_vec())
        .and_then(|v| office_browser_abi::json_bytes(&v));
    reply(handle, result)
}
/// # Safety
/// Handle must be live and exclusively borrowed.
#[no_mangle]
pub unsafe extern "C" fn cube_notes_save(handle: *mut NotesHandle) -> u32 {
    if handle.is_null() {
        return 1;
    }
    let handle = &mut *handle;
    let result = handle.kernel.save();
    reply(handle, result)
}
/// # Safety
/// Handle must be live. Output bytes remain valid only until its next call or destruction.
#[no_mangle]
pub unsafe extern "C" fn cube_notes_output_ptr(handle: *const NotesHandle) -> *const u8 {
    if handle.is_null() {
        return std::ptr::null();
    }
    (*handle).output.as_ptr()
}
/// # Safety
/// Handle must be live.
#[no_mangle]
pub unsafe extern "C" fn cube_notes_output_len(handle: *const NotesHandle) -> usize {
    if handle.is_null() {
        return 0;
    }
    (*handle).output.len()
}

/// Capture immutable Arc-backed pages/history without encoding or locking live input.
/// # Safety
/// Handle must be live and exclusively borrowed during this call. The returned
/// snapshot has independent ownership and may be moved to a background thread.
#[no_mangle]
pub unsafe extern "C" fn cube_notes_snapshot(handle: *const NotesHandle) -> *mut NotesSnapshot {
    if handle.is_null() {
        return std::ptr::null_mut();
    }
    let Some(session) = (*handle).kernel.session.as_ref() else {
        return std::ptr::null_mut();
    };
    Box::into_raw(Box::new(NotesSnapshot {
        value: session.snapshot(),
        brushes: session.brushes.clone(),
        output: Vec::new(),
    }))
}
/// # Safety
/// Snapshot must be live and exclusively borrowed; live-document calls may continue independently.
#[no_mangle]
pub unsafe extern "C" fn cube_notes_snapshot_save(snapshot: *mut NotesSnapshot) -> u32 {
    if snapshot.is_null() {
        return 1;
    }
    let snapshot = &mut *snapshot;
    match crate::codec::write(&snapshot.value, &snapshot.brushes) {
        Ok(bytes) => {
            snapshot.output = bytes;
            0
        }
        Err(error) => {
            snapshot.output =
                serde_json::to_vec(&json!({ "code": error.code, "message": error.message }))
                    .unwrap_or_default();
            1
        }
    }
}
/// # Safety
/// Snapshot is live. Copy output before saving again or destroying it.
#[no_mangle]
pub unsafe extern "C" fn cube_notes_snapshot_output_ptr(
    snapshot: *const NotesSnapshot,
) -> *const u8 {
    if snapshot.is_null() {
        return std::ptr::null();
    }
    (*snapshot).output.as_ptr()
}
/// # Safety
/// Snapshot must be live.
#[no_mangle]
pub unsafe extern "C" fn cube_notes_snapshot_output_len(snapshot: *const NotesSnapshot) -> usize {
    if snapshot.is_null() {
        return 0;
    }
    (*snapshot).output.len()
}
/// # Safety
/// Snapshot is null or exclusively owned and has not been freed.
#[no_mangle]
pub unsafe extern "C" fn cube_notes_snapshot_free(snapshot: *mut NotesSnapshot) {
    if !snapshot.is_null() {
        drop(Box::from_raw(snapshot));
    }
}
