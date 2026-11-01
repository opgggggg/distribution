#ifndef CUBEOFFICE_NOTES_H
#define CUBEOFFICE_NOTES_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct NotesHandle NotesHandle;
typedef struct NotesSnapshot NotesSnapshot;
/* One independent document per handle. Serialize calls; copy output before the next call. */
NotesHandle *cube_notes_new(void);
void cube_notes_free(NotesHandle *handle);
uint32_t cube_notes_request(NotesHandle *handle, const uint8_t *bytes, size_t length);
uint32_t cube_notes_open(NotesHandle *handle, const uint8_t *bytes, size_t length);
uint32_t cube_notes_save(NotesHandle *handle);
const uint8_t *cube_notes_output_ptr(const NotesHandle *handle);
size_t cube_notes_output_len(const NotesHandle *handle);
/* Capture on the document thread; encode the independent snapshot on a worker thread. */
NotesSnapshot *cube_notes_snapshot(const NotesHandle *handle);
uint32_t cube_notes_snapshot_save(NotesSnapshot *snapshot);
const uint8_t *cube_notes_snapshot_output_ptr(const NotesSnapshot *snapshot);
size_t cube_notes_snapshot_output_len(const NotesSnapshot *snapshot);
void cube_notes_snapshot_free(NotesSnapshot *snapshot);
/* Available when compiled with Cargo feature native-renderer. No WebView is involved. */
#ifdef CUBE_NOTES_NATIVE_RENDERER
typedef struct NotesRenderer NotesRenderer;
typedef struct NativeSurface NativeSurface;
typedef struct NativeFrame NativeFrame;
typedef struct NativeFrameRenderer NativeFrameRenderer;
typedef struct NativeCancellation NativeCancellation;
/* Independent token: cancel on the input thread; bind on the renderer's worker. */
NativeCancellation *cube_surface_cancellation_new(void);
void cube_surface_cancellation_cancel(const NativeCancellation *token);
void cube_surface_cancellation_free(NativeCancellation *token);
void cube_surface_renderer_cancellation(NativeFrameRenderer *renderer, const NativeCancellation *token);
typedef struct InputSample { double x, y, pressure, time_ms; } InputSample;
NativeSurface *cube_surface_new(void);
void cube_surface_free(NativeSurface *surface);
/* Local timing aggregates; kind: input/raster/frame interval/presentation/save/state (0..5).
 * Additional kinds: base raster/ink raster/input begin/append/commit (6..10).
 * Kind 11 is complete native UI refresh. Recording is bounded O(1) and leaves
 * output unchanged. Reading produces aggregate JSON. */
uint32_t cube_surface_metric(NativeSurface *surface, uint32_t kind, double milliseconds);
uint32_t cube_surface_metrics(NativeSurface *surface);
uint32_t cube_surface_request(NativeSurface *surface, const uint8_t *json, size_t length);
/* Rust-owned tray glyph, premultiplied RGBA8; copy surface output before next call. */
uint32_t cube_surface_chrome_icon(NativeSurface *surface, uint32_t action, uint32_t width, uint32_t height);
uint32_t cube_surface_brush_preview(NativeSurface *surface, uint32_t width, uint32_t height);
uint32_t cube_surface_tool_icon(NativeSurface *surface, uint32_t action, uint32_t width, uint32_t height);
uint32_t cube_surface_open(NativeSurface *surface, const uint8_t *bytes, size_t length);
/* phase: 0 begin, 1 append, 2 end/commit, 3 cancel. Samples are world points.
 * Coalesced samples go straight to Rust; signed tokens (including negatives) are opaque. */
uint32_t cube_surface_input(NativeSurface *surface, uint32_t phase, int64_t token,
    uint32_t stylus, const InputSample *samples, size_t length);
const uint8_t *cube_surface_output_ptr(const NativeSurface *surface);
size_t cube_surface_output_len(const NativeSurface *surface);
/* Capture on input thread. Returned snapshots/frames are independently owned. */
NativeFrame *cube_surface_frame(const NativeSurface *surface);
NativeFrame *cube_surface_page_frame(const NativeSurface *surface, size_t index);
NativeFrame *cube_surface_background_frame(const NativeSurface *surface);
/* GPU renderer: confined to its serial worker. CAMetalLayer must outlive handle.
 * readback=1 is reserved for QA/export; live display never reads GPU pixels back. */
typedef struct NativeGpu NativeGpu;
NativeGpu *cube_gpu_new(void *metal_layer);
void cube_gpu_free(NativeGpu *gpu);
uint32_t cube_gpu_ready(const NativeGpu *gpu);
uint32_t cube_gpu_font(NativeGpu *gpu,const uint8_t *bytes,size_t length);
uint32_t cube_gpu_draw(NativeGpu *gpu,const NativeFrame *frame,uint32_t width,uint32_t height,uint32_t readback);
uint32_t cube_gpu_report(NativeGpu *gpu);
const uint8_t *cube_gpu_output_ptr(const NativeGpu *gpu);
size_t cube_gpu_output_len(const NativeGpu *gpu);
typedef struct NativeFrameBounds { double x,y,width,height; } NativeFrameBounds;
/* Cropped immutable snapshots: 0 restores content underneath, 1 transparent selected objects. */
NativeFrame *cube_surface_selection_frame(const NativeSurface *surface, uint32_t foreground);
NativeFrameBounds cube_surface_frame_bounds(const NativeFrame *frame);
double cube_surface_frame_aspect(const NativeFrame *frame);
void cube_surface_frame_free(NativeFrame *frame);
NotesSnapshot *cube_surface_snapshot(const NativeSurface *surface);
NativeFrameRenderer *cube_surface_renderer_new(void);
void cube_surface_renderer_free(NativeFrameRenderer *renderer);
uint32_t cube_surface_renderer_font(NativeFrameRenderer *renderer, const uint8_t *bytes, size_t length);
uint32_t cube_surface_render(NativeFrameRenderer *renderer, const NativeFrame *frame, uint32_t width, uint32_t height);
typedef struct NativeLayerInfo { uint32_t base_changed, x, y, width, height; } NativeLayerInfo;
/* Layered display: retain the committed base; output is the cropped transparent ink patch. */
uint32_t cube_surface_render_layers(NativeFrameRenderer *renderer, const NativeFrame *frame, uint32_t width, uint32_t height);
uint32_t cube_surface_render_preview(NativeFrameRenderer *renderer, const NativeFrame *frame, uint32_t width, uint32_t height);
void cube_surface_renderer_trim(NativeFrameRenderer *renderer);
uint32_t cube_surface_frame_needs_fonts(const NativeFrame *frame);
uint32_t cube_surface_frame_viewport(NativeFrame *frame, double x, double y, double width, double height);
uint32_t cube_surface_render_ink(NativeFrameRenderer *renderer, const NativeFrame *frame, uint32_t width, uint32_t height);
/* Progressive world-aligned raster cache, serialize all calls on the render worker.
 * begin returns the snapped source viewport; next returns a single RGBA tile.
 * Completed jobs also publish the assembled base. cancel retains the previous base. */
typedef struct NativeTileInfo {
  uint32_t x,y,width,height,total_width,total_height,count,cached,done;
  double viewport_x,viewport_y,viewport_width,viewport_height;
} NativeTileInfo;
uint32_t cube_surface_tiles_begin(NativeFrameRenderer *renderer,const NativeFrame *frame,uint32_t width,uint32_t height);
uint32_t cube_surface_tiles_next(NativeFrameRenderer *renderer);
void cube_surface_tiles_cancel(NativeFrameRenderer *renderer);
NativeTileInfo cube_surface_tile_info(const NativeFrameRenderer *renderer);
NativeLayerInfo cube_surface_layers(const NativeFrameRenderer *renderer);
const uint8_t *cube_surface_base_ptr(const NativeFrameRenderer *renderer);
size_t cube_surface_base_len(const NativeFrameRenderer *renderer);
const uint8_t *cube_surface_renderer_output_ptr(const NativeFrameRenderer *renderer);
size_t cube_surface_renderer_output_len(const NativeFrameRenderer *renderer);
NotesRenderer *cube_notes_renderer_new(void);
void cube_notes_renderer_free(NotesRenderer *renderer);
uint32_t cube_notes_renderer_add_font(NotesRenderer *renderer, const uint8_t *font, size_t length);
/* Render the immutable snapshot on a worker. Success output: premultiplied RGBA8,
 * row stride pixel_width * 4. Failure output: JSON code/message. Copy before next call. */
uint32_t cube_notes_render(NotesRenderer *renderer, const NotesSnapshot *snapshot,
    const uint8_t *page_id, size_t length, double x, double y, double width, double height,
    uint32_t pixel_width, uint32_t pixel_height);
const uint8_t *cube_notes_renderer_output_ptr(const NotesRenderer *renderer);
size_t cube_notes_renderer_output_len(const NotesRenderer *renderer);
#endif
#ifdef __cplusplus
}
#endif
#endif
