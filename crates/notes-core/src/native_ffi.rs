//! Native canvas ABI: typed coalesced samples and independently owned render snapshots.
use crate::{
    ffi::NotesSnapshot,
    native::{Frame, FrameRenderer, InputSample, Surface},
    Error, Result,
};
use serde_json::json;
/// Independent atomic token: cancelling never borrows the active renderer.
pub struct NativeCancellation {
    flag: std::sync::Arc<std::sync::atomic::AtomicBool>,
}
#[no_mangle]
pub extern "C" fn cube_surface_cancellation_new() -> *mut NativeCancellation {
    Box::into_raw(Box::new(NativeCancellation {
        flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    }))
}
/// # Safety
/// Null or live token; may be signalled concurrently with its bound render job.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_cancellation_cancel(token: *const NativeCancellation) {
    if !token.is_null() {
        (*token)
            .flag
            .store(true, std::sync::atomic::Ordering::Relaxed);
    }
}
/// # Safety
/// Null or owned token; do not free concurrently with signalling it.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_cancellation_free(token: *mut NativeCancellation) {
    if !token.is_null() {
        drop(Box::from_raw(token));
    }
}
/// # Safety
/// Exclusive renderer on its worker; token is readable during this call only.
/// Binding clones the atomic owner, so the renderer outlives the token handle safely.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_renderer_cancellation(
    renderer: *mut NativeFrameRenderer,
    token: *const NativeCancellation,
) {
    if !renderer.is_null() {
        (*renderer).renderer.renderer.cancellation = if token.is_null() {
            None
        } else {
            Some((*token).flag.clone())
        };
    }
}
pub struct NativeSurface {
    surface: Surface,
    metrics: crate::native_metrics::Metrics,
    output: Vec<u8>,
}
pub struct NativeFrame {
    frame: Frame,
}
pub struct NativeFrameRenderer {
    renderer: FrameRenderer,
    output: Vec<u8>,
    layers: NativeLayerInfo,
    tile: NativeTileInfo,
}
#[repr(C)]
#[derive(Default, Clone, Copy)]
pub struct NativeLayerInfo {
    pub base_changed: u32,
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}
#[repr(C)]
#[derive(Default, Clone, Copy)]
pub struct NativeTileInfo {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub total_width: u32,
    pub total_height: u32,
    pub count: u32,
    pub cached: u32,
    pub done: u32,
    pub viewport_x: f64,
    pub viewport_y: f64,
    pub viewport_width: f64,
    pub viewport_height: f64,
}
fn result(output: &mut Vec<u8>, value: Result<Vec<u8>>) -> u32 {
    match value {
        Ok(bytes) => {
            *output = bytes;
            0
        }
        Err(e) => {
            *output =
                serde_json::to_vec(&json!({"code":e.code,"message":e.message})).unwrap_or_default();
            1
        }
    }
}
#[no_mangle]
pub extern "C" fn cube_surface_new() -> *mut NativeSurface {
    Box::into_raw(Box::new(NativeSurface {
        surface: Surface::new(),
        metrics: crate::native_metrics::Metrics::default(),
        output: Vec::new(),
    }))
}
/// # Safety
/// Every pointer in this module must be null or valid, live and not concurrently mutated/freed.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_free(h: *mut NativeSurface) {
    if !h.is_null() {
        drop(Box::from_raw(h));
    }
}
/// # Safety
/// Exclusively borrowed surface. This does not change its output buffer or document.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_metric(h: *mut NativeSurface, kind: u32, ms: f64) -> u32 {
    if h.is_null() {
        return 1;
    }
    u32::from(!(*h).metrics.record(kind, ms))
}
/// # Safety
/// Exclusively borrowed surface; copy aggregate JSON before the next output call.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_metrics(h: *mut NativeSurface) -> u32 {
    if h.is_null() {
        return 1;
    }
    let h = &mut *h;
    result(
        &mut h.output,
        serde_json::to_vec(&h.metrics.value()).map_err(Into::into),
    )
}
/// # Safety
/// Surface is exclusively borrowed; input contains length readable bytes.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_request(
    h: *mut NativeSurface,
    input: *const u8,
    length: usize,
) -> u32 {
    if h.is_null() || input.is_null() || length > crate::model::MAX_BYTES {
        return 1;
    }
    let h = &mut *h;
    let value = (|| {
        let v = crate::parse(std::slice::from_raw_parts(input, length))?;
        let width = v["layoutWidth"]
            .as_f64()
            .or_else(|| v["width"].as_f64())
            .unwrap_or(1024.0);
        let height = v["layoutHeight"]
            .as_f64()
            .or_else(|| v["height"].as_f64())
            .unwrap_or(768.0);
        crate::model::require(
            width.is_finite()
                && height.is_finite()
                && (1.0..=16384.0).contains(&width)
                && (1.0..=16384.0).contains(&height),
        )?;
        match v["op"].as_str().unwrap_or("") {
            "action" => h.surface.action(
                v["action"]
                    .as_u64()
                    .filter(|n| *n <= u32::MAX as u64)
                    .ok_or_else(|| Error::new("InvalidInput", "Invalid action."))?
                    as u32,
            )?,
            "new" => h.surface.new_document(),
            "rotate" => h.surface.rotate(),
            "fingerDraw" => h.surface.finger_draw = v["value"].as_bool().unwrap_or(true),
            "change" => h.surface.change(&v)?,
            "tool" => h.surface.set_tool(v["tool"].as_str().unwrap_or(""))?,
            "eraserMode" => h.surface.eraser_mode(v["mode"].as_str().unwrap_or(""))?,
            "selection" => h
                .surface
                .selection_action(v["action"].as_str().unwrap_or(""))?,
            "insertText" => h.surface.insert_text(v["text"].as_str().unwrap_or(""))?,
            "rail" => h.surface.rail(
                v["tab"].as_str().unwrap_or("pages"),
                v["bookmarksOnly"].as_bool().unwrap_or(false),
            )?,
            "bookmark" => h.surface.bookmark()?,
            "scene" => h.surface.scene(
                v["name"].as_str().unwrap_or(""),
                v["index"].as_u64().map(|v| v as usize),
            )?,
            "color" => h.surface.select_color(
                v["color"].as_str().unwrap_or(""),
                v.get("opacity").map(|n| n.as_f64().unwrap_or(f64::NAN)),
            )?,
            "guides" => h.surface.set_guides(
                v["grid"].as_bool().unwrap_or(h.surface.snap_grid),
                v["align"].as_bool().unwrap_or(h.surface.align_guides),
            ),
            "camera" => h
                .surface
                .camera(serde_json::from_value(v["viewport"].clone())?)?,
            "moveTray" => h.surface.move_tray(
                v["x"].as_f64().unwrap_or(f64::NAN),
                v["y"].as_f64().unwrap_or(f64::NAN),
            )?,
            "resize" => h.surface.resize_canvas(
                v["canvasWidth"].as_f64().unwrap_or(f64::NAN),
                v["canvasHeight"].as_f64().unwrap_or(f64::NAN),
            )?,
            "settings" => h.surface.tool_settings(
                v["value"].as_f64().unwrap_or(f64::NAN),
                v["opacity"].as_f64().unwrap_or(f64::NAN),
                v["pressure"].as_bool().unwrap_or(false),
                v["settings"].clone(),
            )?,
            "page" => h.surface.select_page(
                v["index"]
                    .as_u64()
                    .and_then(|v| usize::try_from(v).ok())
                    .ok_or_else(|| Error::new("InvalidInput", "Invalid page index."))?,
            )?,
            "addPage" => h.surface.add_page()?,
            "readonly" => {
                let readonly = v["value"]
                    .as_bool()
                    .ok_or_else(|| Error::new("InvalidInput", "Invalid editing mode."))?;
                h.surface.camera(h.surface.viewport)?;
                h.surface.session.set_readonly(readonly);
            }
            "markSaved" => {
                h.surface.mark_saved(
                    v["documentEpoch"]
                        .as_u64()
                        .ok_or_else(|| Error::new("InvalidInput", "Missing document epoch."))?,
                    v["revision"]
                        .as_u64()
                        .ok_or_else(|| Error::new("InvalidInput", "Missing saved revision."))?,
                );
            }
            "state" | "panel" | "library" => {}
            _ => {
                return Err(Error::new(
                    "UnknownAction",
                    "Unsupported native surface request.",
                ))
            }
        }
        let mut state = h.surface.state(width, height);
        state["pagePanel"] = crate::native_ui::pages_layout(&h.surface, width, height);
        if v["op"] == "library" {
            state["library"] = crate::native_panels::library(&v["items"], width, height)?;
        }
        if let Some(x) = v["settingsAnchorX"]
            .as_f64()
            .filter(|x| x.is_finite() && x.abs() < 1e6)
        {
            state["settingsPanel"] =
                crate::native_ui::settings_layout(&h.surface, width, height, x);
        }
        let panel = v["panelName"].as_str().or_else(|| {
            if v["op"] == "panel" {
                v["name"].as_str()
            } else {
                None
            }
        });
        if let Some(name) = panel {
            state["panel"] = crate::native_panels::project(&h.surface, name, width, height)?;
            if name == "tip" {
                if let (Some(x), Some(y)) = (
                    v["anchorX"].as_f64().filter(|x| x.is_finite()),
                    v["anchorY"].as_f64().filter(|y| y.is_finite()),
                ) {
                    let w = state["panel"]["frame"]["width"].as_f64().unwrap();
                    let h = state["panel"]["frame"]["height"].as_f64().unwrap();
                    state["panel"]["frame"]["x"] =
                        json!((x + 18.0).clamp(8.0, (width - w - 8.0).max(8.0)));
                    state["panel"]["frame"]["y"] = json!((if y - h - 18.0 >= 72.0 {
                        y - h - 18.0
                    } else {
                        y + 22.0
                    })
                    .clamp(72.0, (height - h - 8.0).max(72.0)));
                }
            }
        }
        Ok(serde_json::to_vec(&state)?)
    })();
    result(&mut h.output, value)
}
/// # Safety
/// Exclusive surface. Success output is premultiplied RGBA8, width*4 row stride.
/// Copy before any subsequent surface call. Icons are bounded to 256×512 pixels.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_tool_icon(
    h: *mut NativeSurface,
    action: u32,
    width: u32,
    height: u32,
) -> u32 {
    if h.is_null() {
        return 1;
    }
    let h = &mut *h;
    let value = (|| {
        let style = match action {
            0..=9 => crate::native::STYLES[action as usize],
            10 => "highlighter",
            11 => "eraser",
            12 => "lasso",
            _ => return Err(Error::new("InvalidInput", "Invalid tool icon.")),
        };
        let color = match action {
            10 => h.surface.aux["highlighter"]["color"].as_str().unwrap(),
            11 => "#ee929b",
            12 => "#6d7583",
            _ => {
                if action as usize == h.surface.style {
                    h.surface.color.as_str()
                } else {
                    h.surface.presets[action as usize]["color"]
                        .as_str()
                        .unwrap()
                }
            }
        };
        crate::native_ui::render_pen(style, color, width, height)
    })();
    result(&mut h.output, value)
}
/// # Safety
/// Exclusive surface; bounded premultiplied RGBA8 icon output uses the surface buffer.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_chrome_icon(
    h: *mut NativeSurface,
    action: u32,
    width: u32,
    height: u32,
) -> u32 {
    if h.is_null() {
        return 1;
    }
    let h = &mut *h;
    result(
        &mut h.output,
        crate::native_ui::render_chrome(action, h.surface.session.readonly(), width, height),
    )
}
/// # Safety
/// Exclusive surface; copy RGBA8 output before its next call.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_brush_preview(
    h: *mut NativeSurface,
    width: u32,
    height: u32,
) -> u32 {
    if h.is_null() {
        return 1;
    }
    let h = &mut *h;
    result(
        &mut h.output,
        crate::native_ui::brush_preview(&h.surface, width, height),
    )
}
/// # Safety
/// Exclusive surface, length readable file bytes.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_open(
    h: *mut NativeSurface,
    input: *const u8,
    length: usize,
) -> u32 {
    if h.is_null() || input.is_null() || length > crate::model::MAX_BYTES {
        return 1;
    }
    let h = &mut *h;
    let value = h
        .surface
        .open(std::slice::from_raw_parts(input, length))
        .map(|_| Vec::new());
    result(&mut h.output, value)
}
/// # Safety
/// Exclusive surface, length valid InputSamples. Phase 0 begins, 1 appends, 2 commits, 3 cancels.
/// Signed tokens are opaque identities; negative IDs are valid. Coordinates are world points.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_input(
    h: *mut NativeSurface,
    phase: u32,
    token: i64,
    stylus: u32,
    samples: *const InputSample,
    length: usize,
) -> u32 {
    if h.is_null() || length > 100000 || (length > 0 && samples.is_null()) {
        return 1;
    }
    let samples = if length == 0 {
        &[]
    } else {
        std::slice::from_raw_parts(samples, length)
    };
    let h = &mut *h;
    let value = h
        .surface
        .input(phase, token, stylus != 0, samples)
        .map(|_| Vec::new());
    result(&mut h.output, value)
}
/// # Safety
/// Shared live surface. Capture on its input thread; render the returned frame on a worker.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_frame(h: *const NativeSurface) -> *mut NativeFrame {
    if h.is_null() {
        return std::ptr::null_mut();
    }
    let h = &*h;
    Box::into_raw(Box::new(NativeFrame {
        frame: h.surface.capture(),
    }))
}
/// # Safety
/// Shared surface; returned immutable frame belongs to caller and may render on a worker.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_page_frame(
    h: *const NativeSurface,
    index: usize,
) -> *mut NativeFrame {
    if h.is_null() {
        return std::ptr::null_mut();
    }
    match (&*h).surface.page_frame(index) {
        Ok(frame) => Box::into_raw(Box::new(NativeFrame { frame })),
        Err(_) => std::ptr::null_mut(),
    }
}
/// # Safety
/// Shared surface. The caller owns the immutable background-only frame.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_background_frame(
    h: *const NativeSurface,
) -> *mut NativeFrame {
    if h.is_null() {
        return std::ptr::null_mut();
    }
    Box::into_raw(Box::new(NativeFrame {
        frame: (&*h).surface.background_frame(),
    }))
}
/// # Safety
/// Shared live frame; its immutable viewport has a strictly positive aspect ratio.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_frame_aspect(h: *const NativeFrame) -> f64 {
    if h.is_null() {
        1.0
    } else {
        (&*h).frame.viewport.width / (&*h).frame.viewport.height
    }
}
/// # Safety
/// Shared immutable frame. Pure drawings need no font database initialization.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_frame_needs_fonts(h: *const NativeFrame) -> u32 {
    if h.is_null() {
        return 0;
    }
    let page = &(*h).frame.page;
    u32::from(
        page["layers"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|layer| layer["visible"] == true)
            .flat_map(|layer| layer["elements"].as_array().into_iter().flatten())
            .any(|element| {
                element["kind"] == "text"
                    && element["text"]
                        .as_str()
                        .is_some_and(|text| !text.is_empty())
            }),
    )
}
/// # Safety
/// Exclusive detached frame. Expand its raster coverage without moving the live camera.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_frame_viewport(
    h: *mut NativeFrame,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> u32 {
    if h.is_null()
        || ![x, y, width, height].iter().all(|n| n.is_finite())
        || x.abs() > 1e9
        || y.abs() > 1e9
        || !(1.0..=1e7).contains(&width)
        || !(1.0..=1e7).contains(&height)
    {
        return 1;
    }
    (*h).frame.viewport = crate::render::Bounds {
        x,
        y,
        width,
        height,
    };
    0
}
/// # Safety
/// Null or exclusively owned live frame, not rendered concurrently.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_frame_free(h: *mut NativeFrame) {
    if !h.is_null() {
        drop(Box::from_raw(h));
    }
}
/// # Safety
/// Shared surface on its input thread. Returned save snapshot may be encoded on a worker.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_snapshot(h: *const NativeSurface) -> *mut NotesSnapshot {
    if h.is_null() {
        return std::ptr::null_mut();
    }
    let h = &*h;
    Box::into_raw(Box::new(NotesSnapshot {
        value: h.surface.snapshot(),
        brushes: h.surface.session.brushes.clone(),
        output: Vec::new(),
    }))
}
#[no_mangle]
pub extern "C" fn cube_surface_renderer_new() -> *mut NativeFrameRenderer {
    Box::into_raw(Box::new(NativeFrameRenderer {
        renderer: FrameRenderer::new(),
        output: Vec::new(),
        layers: NativeLayerInfo::default(),
        tile: NativeTileInfo::default(),
    }))
}
/// # Safety
/// Null or exclusively owned live renderer, not rendered concurrently.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_renderer_free(h: *mut NativeFrameRenderer) {
    if !h.is_null() {
        drop(Box::from_raw(h));
    }
}
/// # Safety
/// Exclusive renderer. Keep committed pixels, release disposable compiled geometry.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_renderer_trim(h: *mut NativeFrameRenderer) {
    if !h.is_null() {
        (*h).renderer.trim_geometry();
    }
}
/// # Safety
/// Exclusive renderer, readable font byte array of length bytes.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_renderer_font(
    h: *mut NativeFrameRenderer,
    input: *const u8,
    length: usize,
) -> u32 {
    if h.is_null() || input.is_null() || length > 32 * 1024 * 1024 {
        return 1;
    }
    let h = &mut *h;
    let value = h
        .renderer
        .renderer
        .add_font(std::slice::from_raw_parts(input, length).to_vec())
        .map(|_| Vec::new());
    result(&mut h.output, value)
}
/// # Safety
/// Exclusive renderer, shared live frame. Successful output: premultiplied RGBA8, width*4 stride.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_render(
    h: *mut NativeFrameRenderer,
    frame: *const NativeFrame,
    width: u32,
    height: u32,
) -> u32 {
    if h.is_null() || frame.is_null() {
        return 1;
    }
    let h = &mut *h;
    let frame = &*frame;
    let value = h
        .renderer
        .render(&frame.frame, width, height)
        .map(|p| p.take());
    result(&mut h.output, value)
}
/// # Safety
/// Exclusive renderer, shared immutable frame. Preview pixels never enter its exact base cache.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_render_preview(
    h: *mut NativeFrameRenderer,
    frame: *const NativeFrame,
    width: u32,
    height: u32,
) -> u32 {
    if h.is_null() || frame.is_null() {
        return 1;
    }
    let h = &mut *h;
    let value = h
        .renderer
        .render_preview(&(*frame).frame, width, height)
        .map(|p| p.take());
    result(&mut h.output, value)
}
/// # Safety
/// Exclusive live renderer, shared immutable frame. Output is only the cropped live-ink patch.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_render_layers(
    h: *mut NativeFrameRenderer,
    frame: *const NativeFrame,
    width: u32,
    height: u32,
) -> u32 {
    if h.is_null() || frame.is_null() {
        return 1;
    }
    let h = &mut *h;
    let frame = &*frame;
    h.layers = NativeLayerInfo::default();
    let value = h
        .renderer
        .render_layers(&frame.frame, width, height)
        .map(|layers| {
            h.layers = NativeLayerInfo {
                base_changed: u32::from(layers.base_changed),
                x: layers.x,
                y: layers.y,
                width: layers.patch.as_ref().map_or(0, |p| p.width()),
                height: layers.patch.as_ref().map_or(0, |p| p.height()),
            };
            layers.patch.map_or_else(Vec::new, |p| p.take())
        });
    result(&mut h.output, value)
}
/// # Safety
/// Exclusive independent ink renderer, shared immutable frame. Does not rasterize/cache the page.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_render_ink(
    h: *mut NativeFrameRenderer,
    frame: *const NativeFrame,
    width: u32,
    height: u32,
) -> u32 {
    if h.is_null() || frame.is_null() {
        return 1;
    }
    let h = &mut *h;
    h.layers = NativeLayerInfo::default();
    let value = h
        .renderer
        .render_ink(&(*frame).frame, width, height)
        .map(|layers| {
            h.layers = NativeLayerInfo {
                base_changed: 0,
                x: layers.x,
                y: layers.y,
                width: layers.patch.as_ref().map_or(0, |p| p.width()),
                height: layers.patch.as_ref().map_or(0, |p| p.height()),
            };
            layers.patch.map_or_else(Vec::new, |p| p.take())
        });
    result(&mut h.output, value)
}
/// # Safety
/// Shared live renderer; valid until the next render or destruction. Copy when base_changed != 0.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_base_ptr(h: *const NativeFrameRenderer) -> *const u8 {
    if h.is_null() {
        return std::ptr::null();
    }
    let h = &*h;
    h.renderer
        .base()
        .map_or(std::ptr::null(), |p| p.data().as_ptr())
}
/// # Safety
/// Shared live renderer.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_base_len(h: *const NativeFrameRenderer) -> usize {
    if h.is_null() {
        return 0;
    }
    let h = &*h;
    h.renderer.base().map_or(0, |p| p.data().len())
}
/// # Safety
/// Shared live renderer.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_layers(h: *const NativeFrameRenderer) -> NativeLayerInfo {
    if h.is_null() {
        NativeLayerInfo::default()
    } else {
        (*h).layers
    }
}
/// # Safety
/// Shared live handle. Copy output before its next request, input or destruction.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_output_ptr(h: *const NativeSurface) -> *const u8 {
    if h.is_null() {
        std::ptr::null()
    } else {
        (*h).output.as_ptr()
    }
}
/// # Safety
/// Shared live handle.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_output_len(h: *const NativeSurface) -> usize {
    if h.is_null() {
        0
    } else {
        (*h).output.len()
    }
}
/// # Safety
/// Shared live renderer. Copy output before its next call or destruction.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_renderer_output_ptr(
    h: *const NativeFrameRenderer,
) -> *const u8 {
    if h.is_null() {
        std::ptr::null()
    } else {
        (*h).output.as_ptr()
    }
}
/// # Safety
/// Shared live renderer.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_renderer_output_len(h: *const NativeFrameRenderer) -> usize {
    if h.is_null() {
        0
    } else {
        (*h).output.len()
    }
}

/// # Safety
/// Exclusive renderer, immutable independent frame; advance on the same worker.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_tiles_begin(
    h: *mut NativeFrameRenderer,
    frame: *const NativeFrame,
    width: u32,
    height: u32,
) -> u32 {
    if h.is_null() || frame.is_null() {
        return 1;
    }
    let h = &mut *h;
    h.tile = NativeTileInfo::default();
    let value = h
        .renderer
        .begin_tiles(&(*frame).frame, width, height)
        .map(|p| {
            h.tile = NativeTileInfo {
                total_width: p.width,
                total_height: p.height,
                count: p.count,
                viewport_x: p.viewport.x,
                viewport_y: p.viewport.y,
                viewport_width: p.viewport.width,
                viewport_height: p.viewport.height,
                ..Default::default()
            };
            Vec::new()
        });
    result(&mut h.output, value)
}
/// # Safety
/// Exclusive renderer. Output bytes are one premultiplied RGBA tile, borrowed until next call.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_tiles_next(h: *mut NativeFrameRenderer) -> u32 {
    if h.is_null() {
        return 1;
    }
    let h = &mut *h;
    let value = h.renderer.next_tile().map(|t| {
        if let Some(t) = t {
            h.tile.x = t.x;
            h.tile.y = t.y;
            h.tile.width = t.pixels.width();
            h.tile.height = t.pixels.height();
            h.tile.cached = u32::from(t.cached);
            h.tile.done = u32::from(t.done);
            t.pixels.take()
        } else {
            h.tile.width = 0;
            h.tile.height = 0;
            h.tile.done = 1;
            Vec::new()
        }
    });
    result(&mut h.output, value)
}
/// # Safety
/// Exclusive renderer, on its render worker. Already completed cache tiles remain reusable.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_tiles_cancel(h: *mut NativeFrameRenderer) {
    if !h.is_null() {
        (*h).renderer.cancel_tiles();
    }
}
/// # Safety
/// Live renderer, not concurrently mutated.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_tile_info(h: *const NativeFrameRenderer) -> NativeTileInfo {
    if h.is_null() {
        NativeTileInfo::default()
    } else {
        (*h).tile
    }
}

#[repr(C)]
#[derive(Default, Clone, Copy)]
pub struct NativeFrameBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
/// # Safety
/// Live exclusively borrowed surface. Returned frame is owned independently.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_selection_frame(
    h: *const NativeSurface,
    foreground: u32,
) -> *mut NativeFrame {
    if h.is_null() || foreground > 1 {
        return std::ptr::null_mut();
    }
    match (*h).surface.selection_frame(foreground != 0) {
        Some(frame) => Box::into_raw(Box::new(NativeFrame { frame })),
        None => std::ptr::null_mut(),
    }
}
/// # Safety
/// Shared live immutable frame.
#[no_mangle]
pub unsafe extern "C" fn cube_surface_frame_bounds(frame: *const NativeFrame) -> NativeFrameBounds {
    if frame.is_null() {
        return NativeFrameBounds::default();
    }
    let b = (*frame).frame.viewport;
    NativeFrameBounds {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
    }
}

#[cfg(feature = "gpu-renderer")]
pub struct NativeGpu {
    renderer: Option<crate::gpu::GpuCanvas>,
    output: Vec<u8>,
}
/// # Safety
/// Layer is null (offscreen QA) or a live CAMetalLayer owned until free.
/// The returned handle and every GPU call are confined to one serial worker.
#[cfg(feature = "gpu-renderer")]
#[no_mangle]
pub unsafe extern "C" fn cube_gpu_new(layer: *mut std::ffi::c_void) -> *mut NativeGpu {
    let (renderer, output) = match crate::gpu::GpuCanvas::new(layer) {
        Ok(r) => (Some(r), vec![]),
        Err(e) => (None, e.to_string().into_bytes()),
    };
    Box::into_raw(Box::new(NativeGpu { renderer, output }))
}
#[cfg(feature = "gpu-renderer")]
#[no_mangle]
pub unsafe extern "C" fn cube_gpu_free(h: *mut NativeGpu) {
    if !h.is_null() {
        drop(Box::from_raw(h));
    }
}
#[cfg(feature = "gpu-renderer")]
#[no_mangle]
pub unsafe extern "C" fn cube_gpu_ready(h: *const NativeGpu) -> u32 {
    u32::from(!h.is_null() && (*h).renderer.is_some())
}
#[cfg(feature = "gpu-renderer")]
#[no_mangle]
pub unsafe extern "C" fn cube_gpu_font(h: *mut NativeGpu, data: *const u8, len: usize) -> u32 {
    if h.is_null() || data.is_null() || len > 32 * 1024 * 1024 {
        return 1;
    }
    let h = &mut *h;
    match h
        .renderer
        .as_mut()
        .map(|r| r.add_font(std::slice::from_raw_parts(data, len).to_vec()))
    {
        Some(Ok(())) => 0,
        Some(Err(e)) => {
            h.output = e.to_string().into_bytes();
            1
        }
        None => 1,
    }
}
#[cfg(feature = "gpu-renderer")]
#[no_mangle]
pub unsafe extern "C" fn cube_gpu_draw(
    h: *mut NativeGpu,
    frame: *const NativeFrame,
    width: u32,
    height: u32,
    readback: u32,
) -> u32 {
    if h.is_null() || frame.is_null() {
        return 1;
    }
    let h = &mut *h;
    match h
        .renderer
        .as_mut()
        .map(|r| r.draw(&(*frame).frame, width, height, readback != 0))
    {
        Some(Ok(())) => {
            h.output = if readback != 0 {
                std::mem::take(&mut h.renderer.as_mut().unwrap().output)
            } else {
                vec![]
            };
            0
        }
        Some(Err(e)) => {
            h.output = e.to_string().into_bytes();
            1
        }
        None => 1,
    }
}
#[cfg(feature = "gpu-renderer")]
#[no_mangle]
pub unsafe extern "C" fn cube_gpu_report(h: *mut NativeGpu) -> u32 {
    if h.is_null() {
        return 1;
    }
    let h = &mut *h;
    match &h.renderer {
        Some(r) => {
            h.output = serde_json::to_vec(&r.report()).unwrap();
            0
        }
        None => 1,
    }
}
#[cfg(feature = "gpu-renderer")]
#[no_mangle]
pub unsafe extern "C" fn cube_gpu_output_ptr(h: *const NativeGpu) -> *const u8 {
    if h.is_null() {
        std::ptr::null()
    } else {
        (*h).output.as_ptr()
    }
}
#[cfg(feature = "gpu-renderer")]
#[no_mangle]
pub unsafe extern "C" fn cube_gpu_output_len(h: *const NativeGpu) -> usize {
    if h.is_null() {
        0
    } else {
        (*h).output.len()
    }
}
