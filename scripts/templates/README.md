# CubeOffice original PPTX templates

Generates the starter presentations published at `https://cubexp.com/templates`
and offered by the desktop app when you create a new PPTX.

## Provenance

Every template here is CubeOffice's own work. The layouts, palettes, type
pairings, decorative shapes and placeholder copy were designed for this set and
are produced entirely from the design tokens in this directory. No template
embeds a photograph, icon set or font file, and none is derived from a
third-party template — which is what makes them safe to redistribute under the
licence stated in `website/templates/LICENSE.txt`.

Do not add a template by importing someone else's .pptx and editing it. A
cosmetically modified template is a derivative work and still carries its
original copyright. Add a `Design` instead.

## Build

```sh
python3 -m venv .venv
.venv/bin/pip install 'python-pptx==1.0.2'
.venv/bin/python scripts/templates/build.py
.venv/bin/python scripts/templates/check.py
```

`build.py` writes into `website/templates/`:

| Path                      | What                                          |
| ------------------------- | --------------------------------------------- |
| `pptx/<id>.<locale>.pptx` | one deck per design per language              |
| `previews/<id>.svg`       | the cover, redrawn as SVG for gallery cards   |
| `index.json`              | the catalog the app and the website both read |
| `LICENSE.txt`             | the redistribution terms                      |

The generated files are committed: the website serves them directly, so the
repository is the record of what is published.

The build is reproducible: archive entry timestamps and document dates are
pinned, so the same inputs always produce the same bytes and a rebuild that
changes nothing leaves the committed templates untouched.

Catalog URLs carry a `?v=<content hash>` tag. The files are served with a week
of caching, so without it a regenerated template published under the same name
would keep serving old bytes from browser and proxy caches — and the app, which
checks a .pptx against the catalog's checksum, would report a corrupt download
rather than a stale cache.

`check.py` is the only automated review these 208 slides get. It reports shapes
that run off the slide, overlapping text boxes, and text that does not fit the
box drawn for it. Run it after every build.

## Layout

| File                            | What                                                        |
| ------------------------------- | ----------------------------------------------------------- |
| `design.py`                     | tokens (`Palette`, `TypeScale`, `Design`) and shape helpers |
| `designs.py`                    | the eight designs: palette, type pairing, motif             |
| `recipes.py`                    | the slide recipes and the cover/title motifs                |
| `content_en.py`/`content_zh.py` | starter copy, same slots and figures in both                |
| `previews.py`                   | the SVG cover preview                                       |
| `build.py`                      | assembly, theme patching, catalog, licence                  |
| `check.py`                      | geometry and overflow review                                |

A recipe reads design tokens and nothing else, so two designs sharing a recipe
still look unrelated. Differentiation comes from the palette, the type pairing,
the corner radius, the motif and which recipes a design uses.

## Adding a template

1. Add a `Design` to `designs.py`. Give it a palette whose accent clears 3:1
   against its own background and whose body text clears 7:1 against `canvas`,
   and a type pairing built only from faces that ship with both Windows and
   macOS.
2. If it needs new artwork, add a motif branch to `draw_cover_motif`,
   `draw_title_mark` and `previews._motif` under the same key.
3. Add its copy to `content_en.py` and `content_zh.py` — the same slots, the
   same list lengths and the same figures in both.
4. Rebuild, run `check.py`, then publish `website/templates/` (see
   `website/README.md`).

The app reads the catalog at runtime, so a new template reaches existing
installations as soon as the website is published. No app release is needed.

## Fonts

Templates set Latin faces per run and leave CJK to the reader's system font, so
no font file is bundled and a deck renders the same on Windows and macOS. Adding
a face that is not present on both platforms will silently substitute on one of
them.
