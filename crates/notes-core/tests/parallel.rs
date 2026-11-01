#![cfg(feature = "native-renderer")]
use cubeoffice_notes_core::{
    native::{FrameRenderer, InputSample, Surface},
    render::Renderer,
};

#[test]
fn parallel_camera_strips_preserve_every_brush_at_internal_boundaries() {
    for style in 0..10 {
        let mut s = Surface::new();
        s.resize_canvas(512.0, 512.0).unwrap();
        s.action(style).unwrap();
        let p = |x, y, t| InputSample {
            x,
            y,
            pressure: 0.5,
            time_ms: t,
        };
        s.begin(1, true, p(30.0, 30.0, 0.0)).unwrap();
        s.append(1, &[p(400.0, 300.0, 10.0), p(90.0, 450.0, 20.0)])
            .unwrap();
        s.end(1, true).unwrap();
        let frame = s.capture();
        let mut renderer = FrameRenderer::new();
        let plan = renderer.begin_tiles(&frame, 1024, 1024).unwrap();
        while renderer.next_tile().unwrap().is_some() {}
        let serial = Renderer::new([])
            .render_native(&frame.page, plan.viewport, plan.width, plan.height)
            .unwrap();
        let pixels = renderer.base().unwrap().data();
        let errors = pixels
            .iter()
            .zip(serial.data())
            .map(|(a, b)| a.abs_diff(*b) as usize)
            .collect::<Vec<_>>();
        let mean = errors.iter().sum::<usize>() as f64 / errors.len() as f64;
        let severe = errors.iter().filter(|d| **d > 16).count();
        assert!(mean < 0.02, "Brush {style} mean channel difference {mean}");
        assert!(
            severe < 128,
            "Brush {style} has {severe} large edge differences"
        );
    }
}

#[test]
fn detached_cancellation_token_stops_stale_pixels_and_fresh_job_recovers() {
    use cubeoffice_notes_core::native_ffi::*;
    unsafe {
        let surface = cube_surface_new();
        let frame = cube_surface_frame(surface);
        let renderer = cube_surface_renderer_new();
        let stale = cube_surface_cancellation_new();
        cube_surface_renderer_cancellation(renderer, stale);
        cube_surface_cancellation_cancel(stale);
        cube_surface_cancellation_free(stale); // The bound renderer owns a shared atomic, not this handle.
        assert_ne!(cube_surface_render(renderer, frame, 400, 400), 0);
        assert_ne!(cube_surface_tiles_begin(renderer, frame, 1024, 1024), 0);
        let fresh = cube_surface_cancellation_new();
        cube_surface_renderer_cancellation(renderer, fresh);
        cube_surface_cancellation_free(fresh);
        assert_eq!(cube_surface_tiles_begin(renderer, frame, 1024, 1024), 0);
        loop {
            assert_eq!(cube_surface_tiles_next(renderer), 0);
            if cube_surface_tile_info(renderer).done != 0 {
                break;
            }
        }
        cube_surface_renderer_cancellation(renderer, std::ptr::null());
        assert_eq!(cube_surface_render(renderer, frame, 400, 400), 0);
        cube_surface_renderer_free(renderer);
        cube_surface_frame_free(frame);
        cube_surface_free(surface);
    }
}

#[test]
fn interrupted_camera_keeps_prepared_paths_without_publishing_a_partial_base() {
    let mut surface = Surface::new();
    surface.resize_canvas(512.0, 512.0).unwrap();
    surface.action(2).unwrap();
    let p = |x, y| InputSample {
        x,
        y,
        pressure: 0.5,
        time_ms: 0.0,
    };
    surface.begin(1, true, p(20.0, 20.0)).unwrap();
    surface.append(1, &[p(490.0, 490.0)]).unwrap();
    surface.end(1, true).unwrap();
    let mut renderer = FrameRenderer::new();
    renderer
        .begin_tiles(&surface.capture(), 1024, 1024)
        .unwrap();
    renderer.next_tile().unwrap().unwrap();
    renderer.cancel_tiles();
    assert!(
        renderer.base().is_none(),
        "A cancelled band advanced the committed base"
    );
    assert!(
        renderer.renderer.native_geometry_cache_stats().0 > 0,
        "Cancelling threw away useful compiled paths"
    );
    renderer
        .begin_tiles(&surface.capture(), 1024, 1024)
        .unwrap();
    while renderer.next_tile().unwrap().is_some() {}
    assert!(renderer.base().is_some());
}

#[test]
fn cancellation_during_parallel_publication_discards_stale_pixels_and_recovers() {
    use cubeoffice_notes_core::native_ffi::*;
    unsafe {
        let surface = cube_surface_new();
        let command = serde_json::to_vec(&serde_json::json!({"op":"action","action":2})).unwrap();
        assert_eq!(
            cube_surface_request(surface, command.as_ptr(), command.len()),
            0
        );
        let points = [
            InputSample {
                x: 40.0,
                y: 40.0,
                pressure: 0.5,
                time_ms: 0.0,
            },
            InputSample {
                x: 490.0,
                y: 700.0,
                pressure: 0.5,
                time_ms: 10.0,
            },
        ];
        assert_eq!(cube_surface_input(surface, 0, -2, 1, points.as_ptr(), 1), 0);
        assert_eq!(
            cube_surface_input(surface, 2, -2, 1, points.as_ptr().add(1), 1),
            0
        );
        let frame = cube_surface_frame(surface);
        let renderer = cube_surface_renderer_new();
        let token = cube_surface_cancellation_new();
        cube_surface_renderer_cancellation(renderer, token);
        assert_eq!(cube_surface_tiles_begin(renderer, frame, 1024, 1024), 0);
        assert_eq!(cube_surface_tiles_next(renderer), 0); // Central tile.
        assert_eq!(cube_surface_tiles_next(renderer), 0); // First parallel row.
        assert_eq!(
            cube_surface_tile_info(renderer).done,
            0,
            "Fixture never left parallel work in flight"
        );
        cube_surface_cancellation_cancel(token);
        assert_ne!(cube_surface_tiles_next(renderer), 0);
        assert_eq!(
            cube_surface_base_len(renderer),
            0,
            "Cancelled rows published a partial committed base"
        );
        cube_surface_tiles_cancel(renderer);
        cube_surface_cancellation_free(token);
        cube_surface_renderer_cancellation(renderer, std::ptr::null());
        assert_eq!(cube_surface_tiles_begin(renderer, frame, 1024, 1024), 0);
        loop {
            assert_eq!(cube_surface_tiles_next(renderer), 0);
            if cube_surface_tile_info(renderer).done != 0 {
                break;
            }
        }
        assert!(cube_surface_base_len(renderer) > 0);
        cube_surface_renderer_free(renderer);
        cube_surface_frame_free(frame);
        cube_surface_free(surface);
    }
}
