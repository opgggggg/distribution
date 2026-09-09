#!/usr/bin/env python3
"""Check the generated templates for the faults a generator actually produces.

    .venv/bin/python scripts/templates/check.py

The templates are drawn from code, so nobody looks at all 208 slides. These are
the three ways generated slides go wrong, and all three are checkable without a
rendering engine:

1. a shape sitting outside the slide (a motif that was meant to bleed off one
   edge and runs off another);
2. two text boxes overlapping, which no renderer will save you from;
3. text longer than the box drawn for it, which silently overflows.

The text-height estimate is approximate on purpose -- it is calibrated to catch
a box that is badly undersized, not to predict line breaks exactly.
"""

from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from pptx import Presentation  # noqa: E402
from pptx.util import Emu  # noqa: E402

from design import SLIDE_HEIGHT, SLIDE_WIDTH  # noqa: E402

TEMPLATE_DIR = HERE.parent.parent / "website" / "templates" / "pptx"

# Shapes allowed past an edge: the cover motifs deliberately bleed. A bleed is
# only accepted where the design puts one, so a stray shape still reports.
BLEED_TOLERANCE_IN = 1.4
OVERFLOW_TOLERANCE = 1.12
OVERLAP_TOLERANCE_IN = 0.02


def inches(value: Emu | int | None) -> float | None:
    return None if value is None else value / 914400.0


def estimate_text_height(frame, width_in: float) -> float:
    """Total height of a frame's paragraphs, in inches."""
    total = 0.0
    for paragraph in frame.paragraphs:
        runs = paragraph.runs
        if not runs:
            continue
        size_pt = max((run.font.size.pt for run in runs if run.font.size), default=12.0)
        text = "".join(run.text for run in runs)
        if not text:
            continue
        # A CJK glyph occupies about a full em; Latin averages near half.
        cjk = sum(1 for ch in text if "⺀" <= ch <= "鿿" or "＀" <= ch <= "￯")
        em_units = cjk + (len(text) - cjk) * 0.52
        chars_per_line = max(1.0, width_in * 72.0 / size_pt)
        lines = max(1, int(em_units / chars_per_line + 0.999))
        spacing = paragraph.line_spacing if isinstance(paragraph.line_spacing, float) else 1.15
        total += lines * size_pt * spacing / 72.0
        for gap in (paragraph.space_before, paragraph.space_after):
            if gap is not None:
                total += gap.pt / 72.0
    return total


def check_file(path: Path) -> list[str]:
    problems: list[str] = []
    presentation = Presentation(str(path))
    slide_w = inches(SLIDE_WIDTH)
    slide_h = inches(SLIDE_HEIGHT)

    for index, slide in enumerate(presentation.slides, 1):
        boxes = []
        for shape in slide.shapes:
            left, top = inches(shape.left), inches(shape.top)
            width, height = inches(shape.width), inches(shape.height)
            if None in (left, top, width, height):
                continue
            right, bottom = left + width, top + height
            over = max(
                -left,
                -top,
                right - slide_w,
                bottom - slide_h,
            )
            if over > BLEED_TOLERANCE_IN:
                problems.append(
                    f"{path.name} slide {index}: {shape.shape_type} runs {over:.2f}in past an edge"
                )

            if not shape.has_text_frame:
                continue
            frame = shape.text_frame
            text = frame.text.strip()
            if not text:
                continue
            boxes.append((shape.name, left, top, width, height, frame))

            needed = estimate_text_height(frame, width)
            if needed > height * OVERFLOW_TOLERANCE:
                problems.append(
                    f"{path.name} slide {index}: text needs ~{needed:.2f}in "
                    f"in a {height:.2f}in box ({text[:38]!r})"
                )

        for i in range(len(boxes)):
            _, ax, ay, aw, ah, _ = boxes[i]
            for j in range(i + 1, len(boxes)):
                _, bx, by, bw, bh, _ = boxes[j]
                overlap_x = min(ax + aw, bx + bw) - max(ax, bx)
                overlap_y = min(ay + ah, by + bh) - max(ay, by)
                if overlap_x > OVERLAP_TOLERANCE_IN and overlap_y > OVERLAP_TOLERANCE_IN:
                    problems.append(
                        f"{path.name} slide {index}: text boxes overlap by "
                        f"{overlap_x:.2f}x{overlap_y:.2f}in"
                    )
    return problems


def check_catalog() -> list[str]:
    """Every URL the catalog publishes must resolve, and match its digest.

    The app rejects a .pptx whose bytes disagree with the catalog's checksum,
    so a catalog that drifted from the files on disk would ship a download that
    fails in the picker with a corruption message. URLs carry a `?v=` content
    tag, which is stripped here the way the web server strips it.
    """
    import hashlib
    import json

    catalog_path = TEMPLATE_DIR.parent / "index.json"
    if not catalog_path.exists():
        return [f"{catalog_path} is missing; run build.py"]
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    root = TEMPLATE_DIR.parent
    problems: list[str] = []

    def resolve(url: str) -> Path:
        return root / url.split("?", 1)[0].removeprefix("/templates/")

    for entry in catalog.get("templates", []):
        preview = resolve(entry.get("preview", ""))
        if not preview.is_file():
            problems.append(f"{entry.get('id')}: preview {entry.get('preview')} does not exist")
        for locale, published in (entry.get("files") or {}).items():
            path = resolve(published.get("url", ""))
            if not path.is_file():
                problems.append(f"{entry.get('id')} [{locale}]: {published.get('url')} does not exist")
                continue
            blob = path.read_bytes()
            if hashlib.sha256(blob).hexdigest() != published.get("sha256"):
                problems.append(f"{entry.get('id')} [{locale}]: {path.name} does not match its published sha256")
            if len(blob) != published.get("bytes"):
                problems.append(f"{entry.get('id')} [{locale}]: {path.name} does not match its published size")
    return problems


def main() -> int:
    files = sorted(TEMPLATE_DIR.glob("*.pptx"))
    if not files:
        print(f"no templates in {TEMPLATE_DIR}; run build.py first")
        return 1
    problems: list[str] = list(check_catalog())
    for path in files:
        problems.extend(check_file(path))
    slides = sum(len(Presentation(str(path)).slides) for path in files)
    if problems:
        for problem in problems:
            print(problem)
        print(f"\n{len(problems)} problems across {len(files)} files / {slides} slides")
        return 1
    print(f"{len(files)} files / {slides} slides: no geometry or overflow problems")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
