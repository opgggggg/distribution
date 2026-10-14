# Brush plugins

The ten built-in pens—ballpoint, fountain, Chinese brush, pencil, watercolor, marker, crayon, reed, spray and oil—use the same `BrushPlugin` contract as application extensions. Highlighter, eraser and lasso remain independent editing tools.

Register an extension in application startup before opening notebooks:

```ts
import { registerBrushPlugin } from "@cubexp/notes/brushes";
import { charcoalBrush } from "./plugins/charcoal.js";

registerBrushPlugin(charcoalBrush);
```

See the working [charcoal example](../examples/charcoal.ts). Registration also updates already-mounted editors. No changes to the editor's pen list, validator, pressure code or export code are required.

Each plugin declares a stable namespaced ID, Chinese/English labels, an icon shape (or custom vector tip paths), default color/width/pressure/opacity, width limits, optional quick width presets, an optional strength slider, and numeric parameters. Parameters declare their labels, range, increment and default; the editor generates their controls and remembers values separately for each pen.

`pressureFactor(pressure)` maps a normalized pressure to a width multiplier. `render(stroke, geometry)` returns filled SVG-path passes with opacity, optional grain and an optional pigment color for bristle highlights/shadows, a clipping outline, and wax/paper grain variants. `geometry.path(scale)` provides the shared round-ink outline and `geometry.width(point)` provides the pressure-adjusted width. A plugin can supply its own path geometry, as the reed pen does. Canvas, pen previews, thumbnails, PNG and PDF use these same passes. Set `usesGrain: true` for grain passes so thumbnails share texture definitions across strokes.

`.cubenote` stores the plugin ID in `penStyle` and its numeric parameter values in `brushSettings`; these survive undo/redo, saving and local draft recovery. The document stores data only. Plugin code is registered by the host application and is not loaded from a notebook or fetched remotely. An unavailable plugin is rejected instead of rendering its ink as another pen. Install/register that plugin before reopening the file.

The `xournal` flag declares whether ordinary variable-width ink preserves the plugin's appearance. Grain, watercolor, crayon and angled nibs cannot be represented that way, so their `.xopp` export is rejected; native, PNG and PDF preserve their output. Runtime IDs cannot overwrite existing brushes. Numeric plugin settings are validated against their registered ranges.

The built-ins live in `src/brushes/builtins.ts` and `src/brushes/art.ts`; registration and public types live in `src/brushes.ts`. Rendering never depends on a growing list of pen-name conditionals.

`version` declares a brush renderer revision (default 1). New strokes record it as `brushVersion`; an absent value denotes legacy ink. Renderers must retain their legacy branch, and unsupported revisions are rejected. New pen strokes also capture a numeric `brushSeed` independent of the element ID so stochastic pigment survives duplication. Spray revision 2 appends stable seeded particles and never derives earlier spacing from the final path length. Oil revision 2 uses a flat pigment bed and irregular bristle strands; pencil, crayon and watercolor use separate graphite, wax and paper textures. All passes use the same Canvas/SVG/PNG/PDF paths.
