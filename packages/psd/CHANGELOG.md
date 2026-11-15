# @cubexp/psd

## 0.35.0

### Minor Changes

- Initial release: dependency-free PSD codec (8-bit RGB/grayscale, Raw + RLE,
  byte-preserving round-trip for unparsed sections), pure-pixel layer
  compositor with 19 blend modes and clipping masks, a document selection
  system (rectangle / ellipse / lasso / magic wand, invertible and undoable)
  that constrains every pixel operation, painting tools (brush, eraser, clone
  stamp, dodge, burn, bucket, gradients, shapes), nine adjustments and six
  filters, three destructive layer styles, per-layer and whole-image
  transforms, `PsdEditorSession` with 41 typed actions and undo/redo, the AI
  command surface (`createPsdAiApi`), and the `PsdEditor`/`PsdViewer` Vue
  components with a Photoshop-style workspace layout.
