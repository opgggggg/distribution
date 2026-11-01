# CubeOffice filter-free stroke rendering

Source: resvg 0.45.1 from crates.io, originally published by
https://github.com/linebender/resvg. Original MIT/Apache-2.0 licenses are retained.

The additive `render_clipped` entry point is in `src/lib.rs`.
Normal `render` and `render_node` retain upstream behavior. The new entry point
clips temporary compositing surfaces to the target plus a 64-pixel guard band
padding, rather than allowing the default five-times-target effect bounds.
An opt-in context flag translates that clip into isolated group coordinates
(`src/render.rs`) and resets it for pattern surfaces (`src/path.rs`). Existing
context constructors in clip/filter helpers select unchanged upstream behavior.

CubeOffice uses it for committed brush SVGs and the generated paper/background
scene. These contain opacity, masks and clip paths but no filters or
offscreen-dependent effects. Whole-scene SVG reference and text/image elements
retain the standard entry point. Ink-only first paint and live preview retain
their original stroke paths. The simple marker also
retains the standard entry point to preserve its subpixel edge placement.

The notes renderer suite compares all ten brushes, both with and without eraser
masks, overlapping highlighter, a fractional camera and deep zoom against the
unmodified whole-scene rendering entry point. Maximum channel difference is
bounded to one. Recheck this invariant before adding filters to brush SVGs.
