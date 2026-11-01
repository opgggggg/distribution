//! Retained GPU canvas. Brush paths become indexed meshes; camera changes only
//! update a uniform. UIKit owns the CAMetalLayer. File/history/export code is unchanged.
use crate::{
    native::Frame,
    render::{Bounds, NativePass, Renderer},
    Error, Result,
};
use bytemuck::{Pod, Zeroable};
use lyon_tessellation::{
    path::{math::point, Path as LyonPath},
    BuffersBuilder, FillOptions, FillTessellator, FillVertex, VertexBuffers,
};
use resvg::tiny_skia as skia;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::Arc,
    time::Instant,
};
use wgpu::util::DeviceExt;

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Vertex {
    position: [f32; 2],
    uv: [f32; 2],
    color: [f32; 4],
}
#[derive(Clone)]
struct Mesh {
    vertices: wgpu::Buffer,
    indices: wgpu::Buffer,
    count: u32,
    first: u32,
    bytes: usize,
}
struct Paint {
    mesh: Mesh,
    clip: bool,
    texture: String,
    cover: Option<Mesh>,
    union: bool,
    oil: bool,
}
struct Object {
    source: Value,
    bounds: Bounds,
    paints: Vec<Paint>,
    clips: Vec<Mesh>,
    masks: Vec<Mesh>,
    bytes: usize,
}
struct Pigment {
    bind: wgpu::BindGroup,
    bytes: usize,
}
struct Targets {
    size: (u32, u32),
    color: wgpu::TextureView,
    stencil: wgpu::TextureView,
    resolved: wgpu::Texture,
}
/// Persistent position/index buffers. Only changed bristle sections cross the
/// CPU/GPU boundary, independent of total stroke length. Winding is shared by
/// the segment quads, so crossings do not accumulate extra pigment.
#[derive(Default)]
struct OilMesh {
    positions: Vec<[f32; 2]>,
    mesh: Option<Mesh>,
    capacity: usize,
    cells: HashMap<(i32, i32), u32>,
    unsafe_bounds: bool,
    uploaded_bytes: usize,
}
impl OilMesh {
    fn cell_bounds(p: &[[f32; 2]]) -> Option<(i32, i32, i32, i32)> {
        let (mut l, mut t, mut r, mut b) = (
            f32::INFINITY,
            f32::INFINITY,
            f32::NEG_INFINITY,
            f32::NEG_INFINITY,
        );
        for p in p {
            l = l.min(p[0]);
            t = t.min(p[1]);
            r = r.max(p[0]);
            b = b.max(p[1]);
        }
        let (l, t, r, b) = (
            (l / 2.).floor() as i32 - 1,
            (t / 2.).floor() as i32 - 1,
            (r / 2.).floor() as i32,
            (b / 2.).floor() as i32,
        );
        if (r as i64 - l as i64 + 1) * (b as i64 - t as i64 + 1) > 4096 {
            None
        } else {
            Some((l, t, r, b))
        }
    }
    fn mark(&mut self, p: &[[f32; 2]], add: bool) {
        let Some((l, t, r, b)) = Self::cell_bounds(p) else {
            self.unsafe_bounds = true;
            return;
        };
        for y in t..=b {
            for x in l..=r {
                if add {
                    *self.cells.entry((x, y)).or_default() += 1;
                } else if let Some(n) = self.cells.get_mut(&(x, y)) {
                    *n -= 1;
                    if *n == 0 {
                        self.cells.remove(&(x, y));
                    }
                }
            }
        }
    }
    fn update(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        sections: &[[[f32; 2]; 2]],
        eligible: (usize, usize),
        changed: usize,
    ) -> Result<Option<Mesh>> {
        let segments = sections.len().saturating_sub(1);
        let from = changed.saturating_sub(1).min(segments);
        if from == 0 {
            self.cells.clear();
            self.unsafe_bounds = false;
        } else {
            for i in from..self.positions.len() / 4 {
                let p: [[_; 2]; 4] = self.positions[i * 4..i * 4 + 4].try_into().unwrap();
                self.mark(&p, false);
            }
        }
        self.positions.truncate(from * 4);
        for i in from..segments {
            let p = [
                sections[i][0],
                sections[i + 1][0],
                sections[i + 1][1],
                sections[i][1],
            ];
            self.mark(&p, true);
            self.positions.extend_from_slice(&p);
        }
        let growing = self.capacity < segments || self.mesh.is_none();
        if growing {
            self.capacity = segments.max(1).next_power_of_two();
            let vertices = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("Incremental oil positions"),
                size: (self.capacity * 4 * 8) as u64,
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            let indices = (0..self.capacity)
                .flat_map(|i| {
                    let b = (i * 4) as u32;
                    [b, b + 1, b + 2, b, b + 2, b + 3]
                })
                .collect::<Vec<_>>();
            let indices = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Stable oil indices"),
                contents: bytemuck::cast_slice(&indices),
                usage: wgpu::BufferUsages::INDEX,
            });
            self.mesh = Some(Mesh {
                vertices,
                indices,
                count: 0,
                first: 0,
                bytes: self.capacity * (4 * 8 + 6 * 4),
            });
        }
        let mesh = self.mesh.as_mut().unwrap();
        let first = if growing { 0 } else { from * 4 };
        self.uploaded_bytes =
            (self.positions.len() - first) * 8 + if growing { self.capacity * 6 * 4 } else { 0 };
        if first < self.positions.len() {
            queue.write_buffer(
                &mesh.vertices,
                (first * 8) as u64,
                bytemuck::cast_slice(&self.positions[first..]),
            );
        }
        mesh.first = (eligible.0 * 6) as u32;
        mesh.count = (eligible.1.saturating_sub(eligible.0 + 1) * 6) as u32;
        Ok((mesh.count > 0).then(|| mesh.clone()))
    }
}
#[derive(Default)]
pub struct Statistics {
    pub frames: u64,
    pub uploads: u64,
    pub mesh_bytes: usize,
    pub prepare_ms: f64,
    pub submit_ms: f64,
    pub readback_ms: f64,
    pub bristle_sections_updated: usize,
    pub bristle_bytes_uploaded: usize,
}
pub struct GpuCanvas {
    _instance: wgpu::Instance,
    surface: Option<wgpu::Surface<'static>>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: Option<wgpu::SurfaceConfiguration>,
    format: wgpu::TextureFormat,
    uniform: wgpu::Buffer,
    camera: wgpu::BindGroup,
    pigments: HashMap<String, Pigment>,
    texture_layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    image_sources: HashMap<String, Arc<String>>,
    paint: wgpu::RenderPipeline,
    clipped: wgpu::RenderPipeline,
    reset: wgpu::RenderPipeline,
    clip: wgpu::RenderPipeline,
    winding: wgpu::RenderPipeline,
    oil_winding: wgpu::RenderPipeline,
    union: wgpu::RenderPipeline,
    cover: wgpu::RenderPipeline,
    cover_clip: wgpu::RenderPipeline,
    depth_clear: wgpu::RenderPipeline,
    paper: wgpu::RenderPipeline,
    objects: HashMap<String, Object>,
    retired: VecDeque<(String, Object)>,
    page: Option<Arc<crate::page::Page>>,
    order: Vec<String>,
    targets: Option<Targets>,
    cpu: Renderer,
    live_oil: Option<crate::native_oil::LiveOil>,
    oil_meshes: Vec<OilMesh>,
    pub stats: Statistics,
    pub output: Vec<u8>,
    adapter_name: String,
}
fn error(e: impl std::fmt::Display) -> Error {
    Error::new("GpuRenderer", e.to_string())
}
fn color(hex: &str, opacity: f32) -> [f32; 4] {
    let rgb = u32::from_str_radix(hex.trim_start_matches('#'), 16).unwrap_or(0);
    [
        ((rgb >> 16) & 255) as f32 / 255. * opacity,
        ((rgb >> 8) & 255) as f32 / 255. * opacity,
        (rgb & 255) as f32 / 255. * opacity,
        opacity,
    ]
}
fn intersects(a: Bounds, b: Bounds) -> bool {
    a.x + a.width >= b.x && a.y + a.height >= b.y && a.x <= b.x + b.width && a.y <= b.y + b.height
}
impl GpuCanvas {
    /// # Safety
    /// A non-null CAMetalLayer must remain alive until this renderer is dropped.
    /// All methods, including drop, must run serially on its dedicated worker.
    pub unsafe fn new(layer: *mut std::ffi::c_void) -> Result<Self> {
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::METAL,
            ..Default::default()
        });
        #[cfg(target_vendor = "apple")]
        let surface = if layer.is_null() {
            None
        } else {
            Some(
                instance
                    .create_surface_unsafe(wgpu::SurfaceTargetUnsafe::CoreAnimationLayer(layer))
                    .map_err(error)?,
            )
        };
        #[cfg(not(target_vendor = "apple"))]
        let surface = None;
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            compatible_surface: surface.as_ref(),
            power_preference: wgpu::PowerPreference::HighPerformance,
            force_fallback_adapter: false,
        }))
        .map_err(error)?;
        let adapter_name = adapter.get_info().name;
        let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            label: Some("CubeOffice canvas"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::default(),
            memory_hints: wgpu::MemoryHints::MemoryUsage,
            trace: wgpu::Trace::Off,
        }))
        .map_err(error)?;
        let format = surface
            .as_ref()
            .map(|s| {
                s.get_capabilities(&adapter)
                    .formats
                    .into_iter()
                    .find(|f| {
                        *f == wgpu::TextureFormat::Bgra8Unorm
                            || *f == wgpu::TextureFormat::Rgba8Unorm
                    })
                    .ok_or_else(|| error("No linear color surface"))
            })
            .transpose()?
            .unwrap_or(wgpu::TextureFormat::Rgba8Unorm);
        if !adapter
            .get_texture_format_features(format)
            .flags
            .contains(wgpu::TextureFormatFeatureFlags::MULTISAMPLE_X4)
        {
            return Err(error("4x antialiasing unavailable"));
        }
        let config = surface.as_ref().map(|_| wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width: 1,
            height: 1,
            present_mode: wgpu::PresentMode::Fifo,
            desired_maximum_frame_latency: 2,
            alpha_mode: wgpu::CompositeAlphaMode::Opaque,
            view_formats: vec![],
        });
        let uniform = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Camera only"),
            size: 32,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let camera_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });
        let camera = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &camera_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform.as_entire_binding(),
            }],
        });
        let texture_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });
        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[&camera_layout, &texture_layout],
            push_constant_ranges: &[],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("CubeOffice brush/paper"),
            source: wgpu::ShaderSource::Wgsl(include_str!("gpu.wgsl").into()),
        });
        const FULL_ATTRIBUTES: [wgpu::VertexAttribute; 3] =
            wgpu::vertex_attr_array![0=>Float32x2,1=>Float32x2,2=>Float32x4];
        const POSITION_ATTRIBUTES: [wgpu::VertexAttribute; 1] =
            wgpu::vertex_attr_array![0=>Float32x2];
        let pipeline = |label: &str, kind: u8, fragment: &str| {
            let writes = matches!(kind, 2 | 3 | 4 | 5 | 6 | 10);
            let front = wgpu::StencilFaceState {
                compare: if kind == 7 || kind == 8 {
                    wgpu::CompareFunction::NotEqual
                } else {
                    wgpu::CompareFunction::Always
                },
                fail_op: wgpu::StencilOperation::Keep,
                depth_fail_op: wgpu::StencilOperation::Keep,
                pass_op: match kind {
                    2 | 10 => wgpu::StencilOperation::IncrementWrap,
                    3 | 4 => wgpu::StencilOperation::Replace,
                    _ => wgpu::StencilOperation::Keep,
                },
            };
            let mut back = front;
            if kind == 2 || kind == 10 {
                back.pass_op = wgpu::StencilOperation::DecrementWrap;
            }
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some(label),
                layout: Some(&layout),
                vertex: wgpu::VertexState {
                    module: &shader,
                    entry_point: Some(if kind == 10 {
                        "winding_vertex"
                    } else if kind == 6 {
                        "depth_clear"
                    } else {
                        "vertex"
                    }),
                    compilation_options: Default::default(),
                    buffers: &[wgpu::VertexBufferLayout {
                        array_stride: if kind == 10 { 8 } else { 32 },
                        step_mode: wgpu::VertexStepMode::Vertex,
                        attributes: if kind == 10 {
                            &POSITION_ATTRIBUTES
                        } else {
                            &FULL_ATTRIBUTES
                        },
                    }],
                },
                primitive: Default::default(),
                depth_stencil: Some(wgpu::DepthStencilState {
                    format: wgpu::TextureFormat::Depth24PlusStencil8,
                    depth_write_enabled: kind == 5 || kind == 6,
                    depth_compare: if kind == 1 || kind == 8 {
                        wgpu::CompareFunction::Equal
                    } else {
                        wgpu::CompareFunction::Always
                    },
                    stencil: wgpu::StencilState {
                        front,
                        back,
                        read_mask: if kind == 7 || kind == 8 { 255 } else { 0 },
                        write_mask: if matches!(kind, 2 | 3 | 4 | 10) {
                            255
                        } else {
                            0
                        },
                    },
                    bias: Default::default(),
                }),
                multisample: wgpu::MultisampleState {
                    count: 4,
                    ..Default::default()
                },
                fragment: Some(wgpu::FragmentState {
                    module: &shader,
                    entry_point: Some(fragment),
                    compilation_options: Default::default(),
                    targets: &[Some(wgpu::ColorTargetState {
                        format,
                        blend: Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING),
                        write_mask: if writes {
                            wgpu::ColorWrites::empty()
                        } else {
                            wgpu::ColorWrites::ALL
                        },
                    })],
                }),
                multiview: None,
                cache: None,
            })
        };
        let paint = pipeline("Retained triangle paint", 0, "fragment");
        let clipped = pipeline("Clipped triangle paint", 1, "fragment");
        let winding = pipeline("Nonzero path winding on GPU", 2, "fragment");
        let oil_winding = pipeline("Incremental oil sections", 10, "fragment");
        let union = pipeline("Convex contour union on GPU", 3, "fragment");
        let reset = pipeline("Clear winding / erase coverage", 4, "fragment");
        let clip = pipeline("Brush outline depth clip", 5, "fragment");
        let depth_clear = pipeline("Reset outline depth", 6, "fragment");
        let cover = pipeline("Shade nonzero path once", 7, "fragment");
        let cover_clip = pipeline("Shade clipped nonzero path once", 8, "fragment");
        let paper = pipeline("World paper", 0, "paper");
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::Repeat,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        let mut result = Self {
            _instance: instance,
            surface,
            device,
            queue,
            config,
            format,
            uniform,
            camera,
            pigments: HashMap::new(),
            texture_layout,
            sampler,
            image_sources: HashMap::new(),
            paint,
            clipped,
            reset,
            clip,
            winding,
            oil_winding,
            union,
            cover,
            cover_clip,
            depth_clear,
            paper,
            objects: HashMap::new(),
            retired: VecDeque::new(),
            page: None,
            order: vec![],
            targets: None,
            cpu: Renderer::new([]),
            live_oil: None,
            oil_meshes: vec![],
            stats: Statistics::default(),
            output: vec![],
            adapter_name,
        };
        result.upload_texture("@white", 1, 1, &[255; 4]);
        Ok(result)
    }
    pub fn add_font(&mut self, bytes: Vec<u8>) -> Result<()> {
        self.cpu.add_font(bytes)
    }
    fn upload_texture(&mut self, key: &str, width: u32, height: u32, pixels: &[u8]) {
        let texture = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some(key),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        self.queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            pixels,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(width * 4),
                rows_per_image: Some(height),
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
        let view = texture.create_view(&Default::default());
        let bind = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some(key),
            layout: &self.texture_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
            ],
        });
        self.pigments.insert(
            key.into(),
            Pigment {
                bind,
                bytes: pixels.len(),
            },
        );
        self.stats.uploads += 1;
    }
    fn mesh(&self, path: &skia::Path, col: [f32; 4], grain: bool) -> Result<Mesh> {
        let builder = Self::lyon_path(path);
        let mut geometry: VertexBuffers<Vertex, u32> = VertexBuffers::new();
        FillTessellator::new()
            .tessellate_path(
                &builder,
                &FillOptions::default()
                    .with_fill_rule(lyon_tessellation::FillRule::NonZero)
                    .with_tolerance(0.05),
                &mut BuffersBuilder::new(&mut geometry, |v: FillVertex| {
                    let p = v.position();
                    Vertex {
                        position: [p.x, p.y],
                        uv: if grain {
                            [p.x / 48., p.y / 48.]
                        } else {
                            [0.5, 0.5]
                        },
                        color: col,
                    }
                }),
            )
            .map_err(error)?;
        Ok(self.buffers(&geometry.vertices, &geometry.indices))
    }
    fn lyon_path(path: &skia::Path) -> LyonPath {
        let mut builder = LyonPath::builder();
        let mut open = false;
        for s in path.segments() {
            use skia::PathSegment::*;
            match s {
                MoveTo(p) => {
                    if open {
                        builder.end(false);
                    }
                    builder.begin(point(p.x, p.y));
                    open = true;
                }
                LineTo(p) => {
                    builder.line_to(point(p.x, p.y));
                }
                QuadTo(c, p) => {
                    builder.quadratic_bezier_to(point(c.x, c.y), point(p.x, p.y));
                }
                CubicTo(a, b, p) => {
                    builder.cubic_bezier_to(point(a.x, a.y), point(b.x, b.y), point(p.x, p.y));
                }
                Close => {
                    if open {
                        builder.end(true);
                        open = false;
                    }
                }
            }
        }
        if open {
            builder.end(false);
        }
        builder.build()
    }
    /// Linear contour upload. GPU winding avoids the quadratic intersection
    /// work of triangulating an ever-growing, self-crossing ribbon on the CPU.
    /// Convex contour unions (spray dots) use replace rather than a counter.
    /// A conservative crossing bound sends pathological >255 winding back to
    /// exact tessellation, so stencil wrap cannot erase dense valid content.
    fn path_paint(
        &self,
        path: &skia::Path,
        col: [f32; 4],
        clip: bool,
        texture: String,
    ) -> Result<Paint> {
        use lyon_tessellation::path::{iterator::PathIterator, Event};
        let lyon = Self::lyon_path(path);
        let mut vertices = Vec::new();
        let mut indices = Vec::new();
        let mut contour = Vec::<[f32; 2]>::new();
        let mut convex = true;
        let mut orientation = 0.;
        let mut events = Vec::<(f32, i32, i32)>::new();
        let mut edges = Vec::<([f32; 2], [f32; 2])>::new();
        let mut finish = |contour: &mut Vec<[f32; 2]>| {
            if contour.len() > 1 && contour.first() == contour.last() {
                contour.pop();
            }
            let base = vertices.len() as u32;
            for p in contour.iter() {
                vertices.push(Vertex {
                    position: *p,
                    uv: [0.5; 2],
                    color: col,
                });
            }
            for i in 2..contour.len() {
                indices.extend_from_slice(&[base, base + i as u32 - 1, base + i as u32]);
            }
            let n = contour.len();
            let mut sign = 0.;
            let mut turning = 0.0_f32;
            if n > 64 {
                convex = false;
            }
            for i in 0..n {
                let (a, b, c) = (contour[i], contour[(i + 1) % n], contour[(i + 2) % n]);
                let cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
                if n <= 64 {
                    let dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
                    turning += cross.atan2(dot);
                }
                if cross.abs() > 0.000001 {
                    if sign != 0. && sign * cross < 0. {
                        convex = false;
                    }
                    sign = cross.signum();
                }
                edges.push((a, b));
                if a[1] != b[1] {
                    let (pos, neg) = if a[1] < b[1] { (1, 0) } else { (0, 1) };
                    events.push((a[1].min(b[1]), pos, neg));
                    events.push((a[1].max(b[1]), -pos, -neg));
                }
            }
            if turning.abs() > std::f32::consts::TAU + 0.01 {
                convex = false;
            }
            if sign != 0. {
                if orientation != 0. && orientation * sign < 0. {
                    convex = false;
                }
                orientation = sign;
            }
            contour.clear();
        };
        for event in lyon.iter().flattened(0.05) {
            match event {
                Event::Begin { at } => {
                    if !contour.is_empty() {
                        finish(&mut contour);
                    }
                    contour.push([at.x, at.y]);
                }
                Event::Line { to, .. } => contour.push([to.x, to.y]),
                Event::End { .. } => finish(&mut contour),
                _ => unreachable!(),
            }
        }
        if !contour.is_empty() {
            finish(&mut contour);
        }
        let mut max = 0;
        let (mut pos, mut neg) = (0, 0);
        if !convex {
            events.sort_unstable_by(|a, b| {
                a.0.total_cmp(&b.0)
                    .then_with(|| (a.1 + a.2).cmp(&(b.1 + b.2)))
            });
            for (_, p, n) in events {
                pos += p;
                neg += n;
                max = max.max(pos).max(neg);
            }
        }
        if !convex && max > 255 && !Self::bounded_winding(&edges, path.bounds()) {
            return Ok(Paint {
                mesh: self.mesh(path, col, texture != "@white")?,
                clip,
                texture,
                cover: None,
                union: false,
                oil: false,
            });
        }
        let r = path.bounds();
        let bounds = Bounds {
            x: r.left() as f64,
            y: r.top() as f64,
            width: r.width() as f64,
            height: r.height() as f64,
        };
        let cover = self.colored_quad(bounds, col, texture != "@white");
        Ok(Paint {
            mesh: self.buffers(&vertices, &indices),
            clip,
            texture,
            cover: Some(cover),
            union: convex,
            oil: false,
        })
    }
    // A scanline-only bound overcounts distant crossing edges. Refine it into
    // cells: winding at the cell center plus ALL edges touching that cell is a
    // conservative bound anywhere inside. This is linear per grid row, with a
    // small adaptive grid, rather than building the edge-intersection graph.
    fn bounded_winding(edges: &[([f32; 2], [f32; 2])], b: skia::Rect) -> bool {
        for n in [32, 64, 128] {
            let dx = (b.width() / n as f32).max(0.0001);
            let dy = (b.height() / n as f32).max(0.0001);
            let mut counts = vec![0u32; n * n];
            for &(a, c) in edges {
                let ix = |x: f32| ((x - b.left()) / dx).floor().clamp(0., (n - 1) as f32) as usize;
                let iy = |y: f32| ((y - b.top()) / dy).floor().clamp(0., (n - 1) as f32) as usize;
                // Include both cells when an edge lies exactly on a grid line.
                let x0 = ix(a[0].min(c[0])).saturating_sub(1);
                let x1 = ix(a[0].max(c[0]));
                let y0 = iy(a[1].min(c[1])).saturating_sub(1);
                let y1 = iy(a[1].max(c[1]));
                for y in y0..=y1 {
                    for x in x0..=x1 {
                        counts[y * n + x] += 1;
                    }
                }
            }
            let mut safe = true;
            let mut crossings = Vec::new();
            for y in 0..n {
                let sample = b.top() + (y as f32 + 0.5) * dy;
                crossings.clear();
                for &(a, c) in edges {
                    if (a[1] <= sample && c[1] > sample) || (c[1] <= sample && a[1] > sample) {
                        let x = a[0] + (sample - a[1]) / (c[1] - a[1]) * (c[0] - a[0]);
                        crossings.push((x, if c[1] > a[1] { 1_i32 } else { -1_i32 }));
                    }
                }
                crossings.sort_unstable_by(|a, b| a.0.total_cmp(&b.0));
                let mut i = 0;
                let mut winding = 0_i32;
                for x in 0..n {
                    let sample = b.left() + (x as f32 + 0.5) * dx;
                    while i < crossings.len() && crossings[i].0 < sample {
                        winding += crossings[i].1;
                        i += 1;
                    }
                    if winding.unsigned_abs() + counts[y * n + x] > 255 {
                        safe = false;
                        break;
                    }
                }
                if !safe {
                    break;
                }
            }
            if safe {
                return true;
            }
        }
        false
    }
    /// Chisel marks are a union of convex nib sweeps, all with the same
    /// winding. Round-to-document coordinates can introduce tiny concavities;
    /// tessellate each short contour independently, then union it on the GPU.
    /// This avoids a quadratic intersection graph for thousands of overlaps.
    fn chisel_paint(&self, path: &skia::Path, col: [f32; 4], texture: String) -> Result<Paint> {
        let mut geometry: VertexBuffers<Vertex, u32> = VertexBuffers::new();
        let mut tess = FillTessellator::new();
        let mut contour = Vec::new();
        let mut finish = |contour: &mut Vec<skia::Point>| -> Result<()> {
            if contour.len() < 3 {
                contour.clear();
                return Ok(());
            }
            let mut p = LyonPath::builder();
            p.begin(point(contour[0].x, contour[0].y));
            for v in &contour[1..] {
                p.line_to(point(v.x, v.y));
            }
            p.end(true);
            tess.tessellate_path(
                &p.build(),
                &FillOptions::default().with_fill_rule(lyon_tessellation::FillRule::NonZero),
                &mut BuffersBuilder::new(&mut geometry, |v: FillVertex| {
                    let p = v.position();
                    Vertex {
                        position: [p.x, p.y],
                        uv: [0.5; 2],
                        color: col,
                    }
                }),
            )
            .map_err(error)?;
            contour.clear();
            Ok(())
        };
        for segment in path.segments() {
            match segment {
                skia::PathSegment::MoveTo(p) => {
                    finish(&mut contour)?;
                    contour.push(p);
                }
                skia::PathSegment::LineTo(p) => contour.push(p),
                skia::PathSegment::Close => finish(&mut contour)?,
                _ => return Err(error("Unexpected curved chisel contour")),
            }
        }
        finish(&mut contour)?;
        let r = path.bounds();
        let b = Bounds {
            x: r.left() as f64,
            y: r.top() as f64,
            width: r.width() as f64,
            height: r.height() as f64,
        };
        Ok(Paint {
            mesh: self.buffers(&geometry.vertices, &geometry.indices),
            clip: false,
            texture,
            cover: Some(self.colored_quad(b, col, false)),
            union: true,
            oil: false,
        })
    }
    fn choose_paint(
        &self,
        live: bool,
        path: &skia::Path,
        col: [f32; 4],
        clip: bool,
        texture: String,
    ) -> Result<Paint> {
        if live {
            self.path_paint(path, col, clip, texture)
        } else {
            Ok(Paint {
                mesh: self.mesh(path, col, texture != "@white")?,
                clip,
                texture,
                cover: None,
                union: false,
                oil: false,
            })
        }
    }
    fn colored_quad(&self, b: Bounds, col: [f32; 4], grain: bool) -> Mesh {
        let (x, y, w, h) = (b.x as f32, b.y as f32, b.width as f32, b.height as f32);
        self.buffers(
            &[[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(|p| Vertex {
                position: p,
                uv: if grain {
                    [p[0] / 48., p[1] / 48.]
                } else {
                    [0.5; 2]
                },
                color: col,
            }),
            &[0, 1, 2, 0, 2, 3],
        )
    }
    fn buffers(&self, vertices: &[Vertex], indices: &[u32]) -> Mesh {
        let vertices = self
            .device
            .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Retained brush vertices"),
                contents: bytemuck::cast_slice(vertices),
                usage: wgpu::BufferUsages::VERTEX,
            });
        let bytes = vertices.size() as usize + indices.len() * 4;
        let buffer = self
            .device
            .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Retained brush indices"),
                contents: bytemuck::cast_slice(indices),
                usage: wgpu::BufferUsages::INDEX,
            });
        Mesh {
            vertices,
            indices: buffer,
            count: indices.len() as u32,
            first: 0,
            bytes,
        }
    }
    fn quad(&self, b: Bounds) -> Mesh {
        let (x, y, w, h) = (b.x as f32, b.y as f32, b.width as f32, b.height as f32);
        self.buffers(
            &[
                [x, y, 0., 0.],
                [x + w, y, 1., 0.],
                [x + w, y + h, 1., 1.],
                [x, y + h, 0., 1.],
            ]
            .map(|p| Vertex {
                position: [p[0], p[1]],
                uv: [p[2], p[3]],
                color: [1.; 4],
            }),
            &[0, 1, 2, 0, 2, 3],
        )
    }
    fn masks(&self, e: &Value) -> Result<Vec<Mesh>> {
        let mut result = vec![];
        for polygon in e["cutouts"].as_array().into_iter().flatten() {
            let mut p = skia::PathBuilder::new();
            for (i, v) in polygon.as_array().unwrap().iter().enumerate() {
                let (x, y) = (
                    v["x"].as_f64().unwrap() as f32,
                    v["y"].as_f64().unwrap() as f32,
                );
                if i == 0 {
                    p.move_to(x, y)
                } else {
                    p.line_to(x, y)
                }
            }
            p.close();
            if let Some(p) = p.finish() {
                result.push(self.mesh(&p, [1.; 4], false)?);
            }
        }
        for e in e["erasures"].as_array().into_iter().flatten() {
            let rx = e["width"].as_f64().unwrap() as f32 / 2.;
            let ry = e["height"].as_f64().map(|v| v as f32).unwrap_or(rx * 2.) / 2.;
            let points = e["points"].as_array().unwrap();
            let mut p = skia::PathBuilder::new();
            let dot = points
                .iter()
                .all(|p| p["x"] == points[0]["x"] && p["y"] == points[0]["y"]);
            if dot {
                p.push_circle(
                    points[0]["x"].as_f64().unwrap() as f32 / rx,
                    points[0]["y"].as_f64().unwrap() as f32 / ry,
                    1.,
                );
            } else {
                for (i, v) in points.iter().enumerate() {
                    let (x, y) = (
                        v["x"].as_f64().unwrap() as f32 / rx,
                        v["y"].as_f64().unwrap() as f32 / ry,
                    );
                    if i == 0 {
                        p.move_to(x, y)
                    } else {
                        p.line_to(x, y)
                    }
                }
            }
            if let Some(path) = p.finish() {
                let path = if dot {
                    Some(path)
                } else {
                    path.stroke(
                        &skia::Stroke {
                            width: 2.,
                            line_cap: skia::LineCap::Round,
                            line_join: skia::LineJoin::Round,
                            ..Default::default()
                        },
                        1.,
                    )
                };
                if let Some(path) =
                    path.and_then(|p| p.transform(skia::Transform::from_scale(rx, ry)))
                {
                    result.push(self.mesh(&path, [1.; 4], false)?);
                }
            }
        }
        Ok(result)
    }
    fn live_chinese(&mut self, e: &Value, object: &mut Object) -> Result<()> {
        use serde::Deserialize;
        let typed = crate::brushes::Stroke::deserialize(e)?;
        let dry = typed.setting("dryness", 40.) / 100.;
        let Some(outline) = crate::brushes::native::outline_path(&typed, 1.) else {
            return Ok(());
        };
        let r = outline.bounds();
        let area = Bounds {
            x: r.left() as f64,
            y: r.top() as f64,
            width: r.width() as f64,
            height: r.height() as f64,
        };
        let outline_mesh = self.mesh(
            &outline,
            color(
                &typed.color,
                (typed.opacity * if dry == 0. { 1. } else { 1. - dry * 0.85 }) as f32,
            ),
            false,
        )?;
        object.paints.push(Paint {
            mesh: outline_mesh.clone(),
            clip: false,
            texture: "@white".into(),
            cover: None,
            union: false,
            oil: false,
        });
        if dry == 0. {
            return Ok(());
        }
        object.clips.push(outline_mesh.clone());
        let cache_area = Bounds {
            x: 0.,
            y: 0.,
            width: 1.,
            height: 1.,
        };
        if !self
            .live_oil
            .as_ref()
            .is_some_and(|r| r.matches(e, cache_area, 1, 1))
        {
            self.live_oil = Some(crate::native_oil::LiveOil::new_gpu_chinese(e)?);
            self.oil_meshes.clear();
        }
        let mut ribbons = self.live_oil.take().unwrap();
        let mut safe = true;
        for (i, (sections, eligible, changed, hex, opacity)) in
            ribbons.gpu_sections(e)?.iter().enumerate()
        {
            if self.oil_meshes.len() <= i {
                self.oil_meshes.push(OilMesh::default());
            }
            let cache = &mut self.oil_meshes[i];
            let mesh = cache.update(&self.device, &self.queue, sections, *eligible, *changed)?;
            self.stats.bristle_bytes_uploaded += cache.uploaded_bytes;
            if cache.unsafe_bounds || cache.cells.values().any(|n| *n > 255) {
                safe = false;
                break;
            }
            if let Some(mesh) = mesh {
                object.paints.push(Paint {
                    mesh,
                    clip: true,
                    texture: "@white".into(),
                    cover: Some(self.colored_quad(area, color(hex, *opacity as f32), false)),
                    union: false,
                    oil: true,
                });
            }
        }
        self.stats.bristle_sections_updated = ribbons.updated_sections;
        self.live_oil = Some(ribbons);
        if !safe {
            // High winding still uses exact geometry, including the same outline
            // clipping. Never allow a counter wrap to remove valid ink.
            object.paints.truncate(1);
            let prepared = self.cpu.native_stroke(e, false)?;
            for p in &prepared.passes {
                if let NativePass::Flat {
                    path,
                    color,
                    clip: Some(_),
                } = p
                {
                    object.paints.push(Paint {
                        mesh: self.mesh(
                            path,
                            [
                                color.red() * color.alpha(),
                                color.green() * color.alpha(),
                                color.blue() * color.alpha(),
                                color.alpha(),
                            ],
                            false,
                        )?,
                        clip: true,
                        texture: "@white".into(),
                        cover: None,
                        union: false,
                        oil: false,
                    });
                }
            }
        }
        let key = format!("grain:{}:None", typed.color);
        if !self.pigments.contains_key(&key) {
            let pixels = self.cpu.grain_raster(&typed.color, None, 2., 2.)?;
            self.upload_texture(&key, pixels.width(), pixels.height(), pixels.data());
        }
        // Coverage and clipping reuse the single complete outline mesh. Pigment
        // is shaded once per pass, including self crossings, as before.
        object.paints.push(Paint {
            mesh: outline_mesh,
            clip: false,
            texture: key,
            cover: Some(self.colored_quad(area, [(typed.opacity * dry * 0.12) as f32; 4], true)),
            union: true,
            oil: false,
        });
        Ok(())
    }
    fn object(&mut self, e: &Value, page: &crate::page::Page, live: bool) -> Result<Object> {
        let bounds = crate::render::bounds(e)?;
        let mut object = Object {
            source: e.clone(),
            bounds,
            paints: vec![],
            clips: vec![],
            masks: self.masks(e)?,
            bytes: 0,
        };
        if e["kind"] == "stroke" {
            if e["tool"] == "highlighter" {
                let mut p = skia::PathBuilder::new();
                let ps = e["points"].as_array().unwrap();
                let width = e["width"].as_f64().unwrap() as f32;
                if ps.len() == 1 {
                    p.push_rect(
                        skia::Rect::from_xywh(
                            ps[0]["x"].as_f64().unwrap() as f32 - width / 2.,
                            ps[0]["y"].as_f64().unwrap() as f32 - width / 2.,
                            width,
                            width,
                        )
                        .unwrap(),
                    );
                } else {
                    for (i, v) in ps.iter().enumerate() {
                        let (x, y) = (
                            v["x"].as_f64().unwrap() as f32,
                            v["y"].as_f64().unwrap() as f32,
                        );
                        if i == 0 {
                            p.move_to(x, y)
                        } else {
                            p.line_to(x, y)
                        }
                    }
                }
                if let Some(p) = p.finish().and_then(|p| {
                    if ps.len() == 1 {
                        Some(p)
                    } else {
                        p.stroke(
                            &skia::Stroke {
                                width,
                                line_join: skia::LineJoin::Round,
                                ..Default::default()
                            },
                            1.,
                        )
                    }
                }) {
                    object.paints.push(self.choose_paint(
                        live,
                        &p,
                        color(
                            e["color"].as_str().unwrap(),
                            e["opacity"].as_f64().unwrap() as f32,
                        ),
                        false,
                        "@white".into(),
                    )?);
                }
            } else if live
                && e["penStyle"] == "brush"
                && e["brushVersion"].as_u64().unwrap_or(1) >= 2
                && e["points"].as_array().unwrap().len() > 1
            {
                self.live_chinese(e, &mut object)?;
            } else if live
                && crate::native_oil::LiveOil::supported(e)
                && e["points"].as_array().unwrap().len() > 1
            {
                let area = Bounds {
                    x: 0.,
                    y: 0.,
                    width: 1.,
                    height: 1.,
                };
                if !self
                    .live_oil
                    .as_ref()
                    .is_some_and(|oil| oil.matches(e, area, 1, 1))
                {
                    self.live_oil = Some(crate::native_oil::LiveOil::new_gpu(e)?);
                    self.oil_meshes.clear();
                }
                let mut oil = self.live_oil.take().unwrap();
                let sections = oil.gpu_sections(e)?;
                let mut safe = true;
                for (i, (sections, eligible, changed, hex, opacity)) in sections.iter().enumerate()
                {
                    if self.oil_meshes.len() <= i {
                        self.oil_meshes.push(OilMesh::default());
                    }
                    let cache = &mut self.oil_meshes[i];
                    let mesh =
                        cache.update(&self.device, &self.queue, sections, *eligible, *changed)?;
                    if cache.cells.values().any(|n| *n > 255) || cache.unsafe_bounds {
                        safe = false;
                        break;
                    }
                    if let Some(mesh) = mesh {
                        object.paints.push(Paint {
                            mesh,
                            clip: false,
                            texture: "@white".into(),
                            cover: Some(self.colored_quad(
                                object.bounds,
                                color(hex, *opacity as f32),
                                false,
                            )),
                            union: false,
                            oil: true,
                        });
                    }
                }
                if !safe {
                    object.paints.clear();
                    for p in oil.gpu_paths(e)? {
                        object.paints.push(self.choose_paint(
                            false,
                            &p.path,
                            color(&p.color, p.opacity as f32),
                            false,
                            "@white".into(),
                        )?);
                    }
                }
                self.live_oil = Some(oil);
            } else {
                let prepared = self.cpu.native_stroke(e, false)?;
                for p in &prepared.clips {
                    if let Some(p) = p {
                        object.clips.push(self.mesh(p, [1.; 4], false)?);
                    }
                }
                for p in &prepared.passes {
                    let (path, col, clip, key) = match p {
                        NativePass::Flat { path, color, clip } => (
                            path,
                            [
                                color.red() * color.alpha(),
                                color.green() * color.alpha(),
                                color.blue() * color.alpha(),
                                color.alpha(),
                            ],
                            clip,
                            "@white".to_owned(),
                        ),
                        NativePass::Texture {
                            path,
                            clip,
                            color,
                            texture,
                            opacity,
                        } => {
                            let key = format!("grain:{color}:{texture:?}");
                            if !self.pigments.contains_key(&key) {
                                let pixels = self.cpu.grain_raster(color, *texture, 2., 2.)?;
                                self.upload_texture(
                                    &key,
                                    pixels.width(),
                                    pixels.height(),
                                    pixels.data(),
                                );
                            }
                            (path, [*opacity; 4], clip, key)
                        }
                    };
                    object.paints.push(
                        if live
                            && (e["penStyle"] == "reed"
                                || (e["penStyle"] == "marker"
                                    && e["brushVersion"].as_u64().unwrap_or(1) >= 2))
                        {
                            self.chisel_paint(path, col, key)?
                        } else {
                            self.choose_paint(live, path, col, clip.is_some(), key)?
                        },
                    );
                }
            }
        } else if e["src"].is_string() {
            let source = e["src"].as_str().unwrap();
            let source = if let Some(index) = source
                .strip_prefix("@native-photo:")
                .and_then(|v| v.parse::<usize>().ok())
            {
                page.photos[index].clone()
            } else {
                Arc::new(source.to_owned())
            };
            let key = format!("element:{}", e["id"].as_str().unwrap());
            if !self.pigments.contains_key(&key)
                || !self
                    .image_sources
                    .get(&key)
                    .is_some_and(|old| Arc::ptr_eq(old, &source) || old.as_str() == source.as_str())
            {
                use base64::Engine;
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(
                        source
                            .split_once(',')
                            .ok_or_else(|| error("Invalid image"))?
                            .1,
                    )
                    .map_err(error)?;
                let size = imagesize::blob_size(&bytes).map_err(error)?;
                if size.width > 8192 || size.height > 8192 || size.width * size.height > 16_777_216
                {
                    return Err(error("Image exceeds 16 megapixels"));
                }
                let scale = (4096. / size.width.max(size.height) as f64)
                    .min((8_000_000. / (size.width * size.height) as f64).sqrt())
                    .min(1.);
                let (w, h) = (
                    (size.width as f64 * scale).ceil() as u32,
                    (size.height as f64 * scale).ceil() as u32,
                );
                let area = Bounds {
                    x: 0.,
                    y: 0.,
                    width: size.width as f64,
                    height: size.height as f64,
                };
                let canonical = json!({"id":e["id"],"kind":"image","src":source.as_ref(),"x":0,"y":0,"width":size.width,"height":size.height,"angle":0,"opacity":1});
                let mut pixels =
                    skia::Pixmap::new(w, h).ok_or_else(|| error("Image texture allocation"))?;
                self.cpu.paint_element(&canonical, area, &mut pixels)?;
                self.upload_texture(&key, w, h, pixels.data());
                self.image_sources.insert(key.clone(), source);
            }
            // Image movement, scale, rotation and opacity change four vertices,
            // reusing the original decoded texture. No photo resampling per drag.
            let (x, y, w, h) = (
                e["x"].as_f64().unwrap(),
                e["y"].as_f64().unwrap(),
                e["width"].as_f64().unwrap(),
                e["height"].as_f64().unwrap(),
            );
            let angle = e["angle"].as_f64().unwrap_or(0.).to_radians();
            let (sin, cos) = angle.sin_cos();
            let alpha = e["opacity"].as_f64().unwrap() as f32;
            let vertices = [[0., 0.], [1., 0.], [1., 1.], [0., 1.]].map(|uv| {
                let (dx, dy) = ((uv[0] - 0.5) * w, (uv[1] - 0.5) * h);
                Vertex {
                    position: [
                        (x + w / 2. + dx * cos - dy * sin) as f32,
                        (y + h / 2. + dx * sin + dy * cos) as f32,
                    ],
                    uv: [uv[0] as f32, uv[1] as f32],
                    color: [alpha; 4],
                }
            });
            object.paints.push(Paint {
                mesh: self.buffers(&vertices, &[0, 1, 2, 0, 2, 3]),
                clip: false,
                texture: key,
                cover: None,
                union: false,
                oil: false,
            });
        } else {
            // Text is shaped with the existing fonts once per changed object,
            // then retained as a GPU texture. Exports keep the vector text path.
            let external = e.clone();
            let mut scale: f64 = 2.;
            let pad = if e["kind"] == "text" { 8. } else { 1. };
            let b = Bounds {
                x: bounds.x - pad,
                y: bounds.y - pad,
                width: bounds.width + 2. * pad,
                height: bounds.height + 2. * pad,
            };
            scale = scale
                .min(4096. / b.width.max(b.height))
                .min((8_000_000. / (b.width * b.height)).sqrt());
            let (w, h) = (
                (b.width * scale).ceil().max(1.) as u32,
                (b.height * scale).ceil().max(1.) as u32,
            );
            let mut pixels = skia::Pixmap::new(w, h).ok_or_else(|| error("Texture allocation"))?;
            self.cpu.paint_element(&external, b, &mut pixels)?;
            let key = format!("element:{}", e["id"].as_str().unwrap_or("@background"));
            self.upload_texture(&key, w, h, pixels.data());
            object.paints.push(Paint {
                mesh: self.quad(b),
                clip: false,
                texture: key,
                cover: None,
                union: false,
                oil: false,
            });
            object.bounds = b;
        }
        if e["kind"] == "stroke" {
            let margin = e["width"].as_f64().unwrap_or(0.) * 3.;
            object.bounds = Bounds {
                x: bounds.x - margin,
                y: bounds.y - margin,
                width: bounds.width + margin * 2.,
                height: bounds.height + margin * 2.,
            };
        }
        object.bytes = object
            .paints
            .iter()
            .map(|p| p.mesh.bytes + p.cover.as_ref().map_or(0, |m| m.bytes))
            .chain(object.clips.iter().chain(&object.masks).map(|m| m.bytes))
            .sum();
        Ok(object)
    }
    fn prepare(&mut self, frame: &Frame) -> Result<()> {
        let changed = self
            .page
            .as_ref()
            .is_none_or(|p| !Arc::ptr_eq(p, &frame.page));
        if changed {
            // Photo placeholders are page-local. Equal JSON does not imply the
            // same image when switching documents or replacing a background.
            let photos_changed = self.page.as_ref().is_some_and(|old| {
                old.photos.len() != frame.page.photos.len()
                    || old
                        .photos
                        .iter()
                        .zip(&frame.page.photos)
                        .any(|(a, b)| !Arc::ptr_eq(a, b))
            });
            if photos_changed {
                self.objects.retain(|_, o| !o.source["src"].is_string());
            }
            self.order.clear();
            for e in frame.page.raw.get("background").into_iter().chain(
                frame.page.raw["layers"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter(|l| l["visible"] == true)
                    .flat_map(|l| l["elements"].as_array().unwrap()),
            ) {
                let id = e["id"].as_str().unwrap().to_owned();
                self.order.push(id.clone());
                if self
                    .objects
                    .get("@live")
                    .is_some_and(|o| o.source["id"] == e["id"])
                {
                    let previous = self.objects.remove("@live").unwrap();
                    // Pointer-up can add the final sample before another display
                    // tick. Complete it with the incremental path, then retain it.
                    let object = if previous.source == *e {
                        previous
                    } else {
                        self.object(e, &frame.page, true)?
                    };
                    self.objects.insert(id.clone(), object);
                }
                if !self.objects.contains_key(&id) {
                    if let Some(index) = self
                        .retired
                        .iter()
                        .position(|(key, object)| key == &id && object.source == *e)
                    {
                        let (_, object) = self.retired.remove(index).unwrap();
                        self.objects.insert(id.clone(), object);
                    }
                }
                if self.objects.get(&id).is_some_and(|o| o.source == *e) {
                    continue;
                }
                if let Some(old) = self
                    .objects
                    .get_mut(&id)
                    .filter(|o| crate::render::same_ink_geometry(&o.source, e))
                {
                    old.source = e.clone();
                    let masks = self.masks(e)?;
                    let old = self.objects.get_mut(&id).unwrap();
                    old.masks = masks;
                    old.bytes = old
                        .paints
                        .iter()
                        .map(|p| p.mesh.bytes + p.cover.as_ref().map_or(0, |m| m.bytes))
                        .chain(old.clips.iter().chain(&old.masks).map(|m| m.bytes))
                        .sum();
                } else {
                    let object = self.object(e, &frame.page, false)?;
                    self.objects.insert(id, object);
                    self.stats.uploads += 1;
                }
            }
            self.page = Some(frame.page.clone());
            let ids: HashSet<_> = self.order.iter().cloned().collect();
            let removed = self
                .objects
                .keys()
                .filter(|id| !ids.contains(*id) && id.as_str() != "@live")
                .cloned()
                .collect::<Vec<_>>();
            for id in removed {
                let object = self.objects.remove(&id).unwrap();
                if object.source["kind"] == "stroke" {
                    self.retired.push_back((id, object));
                }
            }
            while self.retired.len() > 24
                || self.retired.iter().map(|(_, o)| o.bytes).sum::<usize>() > 64 * 1024 * 1024
            {
                self.retired.pop_front();
            }
            self.pigments
                .retain(|key, _| !key.starts_with("element:") || ids.contains(&key[8..]));
            self.image_sources
                .retain(|key, _| self.pigments.contains_key(key));
        }
        if let Some(e) = &frame.overlay {
            if !self.objects.get("@live").is_some_and(|o| o.source == *e) {
                let object = self.object(e, &frame.page, true)?;
                self.objects.insert("@live".into(), object);
                self.stats.uploads += 1;
            }
        } else {
            self.objects.remove("@live");
        }
        self.stats.mesh_bytes = self.objects.values().map(|o| o.bytes).sum();
        while self.stats.mesh_bytes + self.retired.iter().map(|(_, o)| o.bytes).sum::<usize>()
            > 192 * 1024 * 1024
            && !self.retired.is_empty()
        {
            self.retired.pop_front();
        }
        if self.stats.mesh_bytes > 192 * 1024 * 1024
            || self.pigments.values().map(|p| p.bytes).sum::<usize>() > 128 * 1024 * 1024
        {
            return Err(error("GPU canvas resource budget exceeded"));
        }
        Ok(())
    }
    fn resize(&mut self, width: u32, height: u32) -> Result<()> {
        if width == 0
            || height == 0
            || width > 4096
            || height > 4096
            || width as u64 * height as u64 > 8_000_000
        {
            return Err(error("GPU drawable exceeds 8 megapixels"));
        }
        if self
            .targets
            .as_ref()
            .is_some_and(|t| t.size == (width, height))
        {
            return Ok(());
        }
        let make = |format, sample_count, usage| {
            self.device.create_texture(&wgpu::TextureDescriptor {
                label: Some("Canvas target"),
                size: wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count,
                dimension: wgpu::TextureDimension::D2,
                format,
                usage,
                view_formats: &[],
            })
        };
        self.targets = Some(Targets {
            size: (width, height),
            color: make(self.format, 4, wgpu::TextureUsages::RENDER_ATTACHMENT)
                .create_view(&Default::default()),
            stencil: make(
                wgpu::TextureFormat::Depth24PlusStencil8,
                4,
                wgpu::TextureUsages::RENDER_ATTACHMENT,
            )
            .create_view(&Default::default()),
            resolved: make(
                self.format,
                1,
                wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            ),
        });
        if let (Some(surface), Some(config)) = (&self.surface, &mut self.config) {
            config.width = width;
            config.height = height;
            surface.configure(&self.device, config);
        }
        Ok(())
    }
    pub fn draw(&mut self, frame: &Frame, width: u32, height: u32, readback: bool) -> Result<()> {
        let b = frame.viewport;
        if ![b.x, b.y, b.width, b.height].iter().all(|v| v.is_finite())
            || b.width <= 0.
            || b.height <= 0.
        {
            return Err(error("Invalid GPU camera"));
        }
        let start = Instant::now();
        self.resize(width, height)?;
        self.stats.bristle_sections_updated = 0;
        self.stats.bristle_bytes_uploaded = 0;
        self.prepare(frame)?;
        self.stats.prepare_ms = start.elapsed().as_secs_f64() * 1000.;
        let start = Instant::now();
        let b = frame.viewport;
        let paper = match frame.page.raw["paper"].as_str() {
            Some("grid") => 1.,
            Some("ruled") => 2.,
            Some("dotted") => 3.,
            _ => 0.,
        };
        self.queue.write_buffer(
            &self.uniform,
            0,
            bytemuck::cast_slice(&[
                b.x as f32,
                b.y as f32,
                b.width as f32,
                b.height as f32,
                width as f32,
                height as f32,
                paper,
                0.,
            ]),
        );
        let target = self.targets.as_ref().unwrap();
        let drawable = if !readback {
            if let Some(surface) = &self.surface {
                Some(surface.get_current_texture().map_err(error)?)
            } else {
                None
            }
        } else {
            None
        };
        let view = drawable
            .as_ref()
            .map(|d| d.texture.create_view(&Default::default()))
            .unwrap_or_else(|| target.resolved.create_view(&Default::default()));
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("Retained canvas"),
            });
        let quad = self.quad(b);
        let c = color(frame.page.raw["color"].as_str().unwrap_or("#ffffff"), 1.);
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Ink/background/eraser composition"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &target.color,
                    depth_slice: None,
                    resolve_target: Some(&view),
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: c[0] as f64,
                            g: c[1] as f64,
                            b: c[2] as f64,
                            a: 1.,
                        }),
                        store: wgpu::StoreOp::Discard,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &target.stencil,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.),
                        store: wgpu::StoreOp::Discard,
                    }),
                    stencil_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(0),
                        store: wgpu::StoreOp::Discard,
                    }),
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_bind_group(0, &self.camera, &[]);
            let draw_mesh = |pass: &mut wgpu::RenderPass<'_>, mesh: &Mesh| {
                // A stationary/tapered initial nib can have no filled triangles.
                // wgpu rejects empty buffer slices even for a zero-count draw.
                if mesh.count == 0 {
                    return;
                }
                pass.set_vertex_buffer(0, mesh.vertices.slice(..));
                pass.set_index_buffer(mesh.indices.slice(..), wgpu::IndexFormat::Uint32);
                pass.draw_indexed(mesh.first..mesh.first + mesh.count, 0, 0..1);
            };
            let draw_object = |pass: &mut wgpu::RenderPass<'_>, object: &Object| {
                if !intersects(object.bounds, b) {
                    return;
                }
                pass.set_bind_group(1, &self.pigments["@white"].bind, &[]);
                if !object.clips.is_empty() {
                    pass.set_pipeline(&self.depth_clear);
                    draw_mesh(pass, &quad);
                    pass.set_pipeline(&self.clip);
                    for mesh in &object.clips {
                        draw_mesh(pass, mesh);
                    }
                }
                for paint in &object.paints {
                    pass.set_bind_group(1, &self.pigments[&paint.texture].bind, &[]);
                    if let Some(cover) = &paint.cover {
                        pass.set_pipeline(&self.reset);
                        pass.set_stencil_reference(0);
                        draw_mesh(pass, cover);
                        pass.set_pipeline(if paint.oil {
                            &self.oil_winding
                        } else if paint.union {
                            &self.union
                        } else {
                            &self.winding
                        });
                        pass.set_stencil_reference(1);
                        draw_mesh(pass, &paint.mesh);
                        pass.set_pipeline(&self.reset);
                        pass.set_stencil_reference(0);
                        for mesh in &object.masks {
                            draw_mesh(pass, mesh);
                        }
                        pass.set_pipeline(if paint.clip {
                            &self.cover_clip
                        } else {
                            &self.cover
                        });
                        pass.set_stencil_reference(0);
                        draw_mesh(pass, cover);
                    } else if !object.masks.is_empty() {
                        // Exact pathological winding fallback: its filled mesh
                        // can still use the same GPU erasure/outline machinery.
                        pass.set_pipeline(&self.reset);
                        pass.set_stencil_reference(0);
                        draw_mesh(pass, &quad);
                        pass.set_pipeline(&self.union);
                        pass.set_stencil_reference(1);
                        draw_mesh(pass, &paint.mesh);
                        pass.set_pipeline(&self.reset);
                        pass.set_stencil_reference(0);
                        for mesh in &object.masks {
                            draw_mesh(pass, mesh);
                        }
                        pass.set_pipeline(if paint.clip {
                            &self.cover_clip
                        } else {
                            &self.cover
                        });
                        draw_mesh(pass, &paint.mesh);
                    } else {
                        pass.set_pipeline(if paint.clip {
                            &self.clipped
                        } else {
                            &self.paint
                        });
                        draw_mesh(pass, &paint.mesh);
                    }
                }
            };
            let background = frame
                .page
                .raw
                .get("background")
                .and_then(|e| e["id"].as_str());
            if let Some(id) = background {
                draw_object(&mut pass, &self.objects[id]);
            }
            pass.set_bind_group(1, &self.pigments["@white"].bind, &[]);
            pass.set_pipeline(&self.paper);
            draw_mesh(&mut pass, &quad);
            for id in &self.order {
                if Some(id.as_str()) != background {
                    draw_object(&mut pass, &self.objects[id]);
                }
            }
            if let Some(live) = self.objects.get("@live") {
                draw_object(&mut pass, live);
            }
        }
        self.queue.submit(Some(encoder.finish()));
        if let Some(drawable) = drawable {
            drawable.present();
        }
        self.stats.submit_ms = start.elapsed().as_secs_f64() * 1000.;
        self.stats.frames += 1;
        if readback {
            self.readback()?;
        }
        Ok(())
    }
    fn readback(&mut self) -> Result<()> {
        let start = Instant::now();
        let t = self.targets.as_ref().unwrap();
        let (w, h) = t.size;
        let stride = (w * 4 + 255) & !255;
        let buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("QA pixel readback only"),
            size: stride as u64 * h as u64,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let mut encoder = self.device.create_command_encoder(&Default::default());
        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture: &t.resolved,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: &buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(stride),
                    rows_per_image: Some(h),
                },
            },
            wgpu::Extent3d {
                width: w,
                height: h,
                depth_or_array_layers: 1,
            },
        );
        self.queue.submit(Some(encoder.finish()));
        let (tx, rx) = std::sync::mpsc::channel();
        buffer.slice(..).map_async(wgpu::MapMode::Read, move |r| {
            let _ = tx.send(r);
        });
        self.device.poll(wgpu::PollType::Wait).map_err(error)?;
        rx.recv().map_err(error)?.map_err(error)?;
        let mapped = buffer.slice(..).get_mapped_range();
        self.output = Vec::with_capacity((w * h * 4) as usize);
        for row in mapped.chunks(stride as usize) {
            self.output.extend_from_slice(&row[..(w * 4) as usize]);
        }
        drop(mapped);
        buffer.unmap();
        if self.format == wgpu::TextureFormat::Bgra8Unorm {
            for p in self.output.chunks_exact_mut(4) {
                p.swap(0, 2);
            }
        }
        self.stats.readback_ms = start.elapsed().as_secs_f64() * 1000.;
        Ok(())
    }
    pub fn report(&self) -> Value {
        json!({"backend":"wgpu-metal","adapter":self.adapter_name,"frames":self.stats.frames,"uploads":self.stats.uploads,"meshBytes":self.stats.mesh_bytes,"retiredMeshBytes":self.retired.iter().map(|(_,o)|o.bytes).sum::<usize>(),"textureBytes":self.pigments.values().map(|p|p.bytes).sum::<usize>(),"prepareMs":self.stats.prepare_ms,"submitMs":self.stats.submit_ms,"readbackMs":self.stats.readback_ms,"bristleSectionsUpdated":self.stats.bristle_sections_updated,"bristleBytesUploaded":self.stats.bristle_bytes_uploaded})
    }
}

#[cfg(all(test, target_vendor = "apple"))]
mod tests {
    use super::*;
    #[test]
    fn winding_overflow_uses_exact_geometry_and_convex_union_does_not_wrap() {
        let gpu = unsafe { GpuCanvas::new(std::ptr::null_mut()) }.unwrap();
        let mut p = skia::PathBuilder::new();
        for _ in 0..512 {
            p.move_to(1., 1.);
            p.line_to(50., 1.);
            p.line_to(20., 20.);
            p.line_to(50., 50.);
            p.line_to(1., 50.);
            p.close();
        }
        let paint = gpu
            .path_paint(&p.finish().unwrap(), [1.; 4], false, "@white".into())
            .unwrap();
        assert!(
            paint.cover.is_none(),
            "More than 255 winding must not silently wrap"
        );
        let mut p = skia::PathBuilder::new();
        for _ in 0..512 {
            p.push_circle(20., 20., 10.);
        }
        let paint = gpu
            .path_paint(&p.finish().unwrap(), [1.; 4], false, "@white".into())
            .unwrap();
        assert!(
            paint.union && paint.cover.is_some(),
            "Convex spray dots use overflow-free union"
        );
    }
}
