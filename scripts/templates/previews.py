"""Gallery previews for the CubeOffice original templates.

The preview mirrors the template's cover slide from the same tokens, drawn as
SVG rather than rendered from the .pptx: it needs no rendering engine in the
build, it stays crisp at any thumbnail size, and it is a few kilobytes, which
matters because the desktop picker fetches every preview in the catalog.
"""

from __future__ import annotations

from xml.sax.saxutils import escape

from design import MARGIN, SLIDE_HEIGHT_IN, SLIDE_WIDTH_IN, Design

PPI = 96.0
WIDTH = round(SLIDE_WIDTH_IN * PPI)
HEIGHT = round(SLIDE_HEIGHT_IN * PPI)

# Fallback stacks for the faces the templates ask for, so a preview in a
# browser or in the desktop picker resolves to something close.
FONT_STACKS = {
    "Georgia": "Georgia,'Times New Roman',serif",
    "Times New Roman": "'Times New Roman',Times,serif",
    "Arial": "Arial,Helvetica,sans-serif",
    "Trebuchet MS": "'Trebuchet MS',Tahoma,sans-serif",
    "Verdana": "Verdana,Geneva,sans-serif",
}


def px(inches: float) -> float:
    return round(inches * PPI, 1)


def stack(font: str) -> str:
    return FONT_STACKS.get(font, "Arial,Helvetica,sans-serif")


def _rect(x, y, w, h, fill=None, stroke=None, stroke_width=1.0, rx=0.0):
    parts = [f'<rect x="{px(x)}" y="{px(y)}" width="{px(w)}" height="{px(h)}"']
    if rx:
        parts.append(f' rx="{px(rx)}"')
    parts.append(f' fill="{"#" + fill if fill else "none"}"')
    if stroke:
        parts.append(f' stroke="#{stroke}" stroke-width="{stroke_width}"')
    parts.append("/>")
    return "".join(parts)


def _circle(cx, cy, r, fill):
    return f'<circle cx="{px(cx)}" cy="{px(cy)}" r="{px(r)}" fill="#{fill}"/>'


def _polygon(points, fill):
    coords = " ".join(f"{px(x)},{px(y)}" for x, y in points)
    return f'<polygon points="{coords}" fill="#{fill}"/>'


def _text(x, y, content, *, font, size, color, weight="normal", spacing=0.0, anchor="start", opacity=None):
    attrs = [
        f'x="{px(x)}"',
        f'y="{px(y)}"',
        f'font-family="{stack(font)}"',
        f'font-size="{round(size * PPI / 72.0, 1)}"',
        f'fill="#{color}"',
    ]
    if weight != "normal":
        attrs.append(f'font-weight="{weight}"')
    if spacing:
        attrs.append(f'letter-spacing="{round(spacing * PPI / 72.0, 2)}"')
    if anchor != "start":
        attrs.append(f'text-anchor="{anchor}"')
    if opacity is not None:
        attrs.append(f'opacity="{opacity}"')
    return f'<text {" ".join(attrs)}>{escape(content)}</text>'


def _wrap(text: str, limit: int) -> list[str]:
    """Break a cover title the way the slide does -- by width, not by clause."""
    if any("一" <= ch <= "鿿" for ch in text):
        # CJK has no spaces to break on; count characters instead.
        cjk_limit = max(4, limit // 2)
        return [text[i : i + cjk_limit] for i in range(0, len(text), cjk_limit)] or [text]
    lines: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if len(candidate) > limit and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def _motif(design: Design) -> list[str]:
    p, motif = design.palette, design.motif
    out: list[str] = []
    if motif == "rules":
        for index in range(4):
            out.append(_rect(MARGIN, 0.95 + index * 0.17, 2.1 - index * 0.42, 2.5 / 72.0, fill=p.accent))
        out.append(
            _polygon(
                [
                    (SLIDE_WIDTH_IN - 3.6, SLIDE_HEIGHT_IN),
                    (SLIDE_WIDTH_IN, SLIDE_HEIGHT_IN),
                    (SLIDE_WIDTH_IN, SLIDE_HEIGHT_IN - 2.5),
                ],
                p.tint("accent", 0.62),
            )
        )
    elif motif == "speed":
        for index, (offset, weight) in enumerate(((0.0, 0.0), (1.35, 0.45), (2.7, 0.72))):
            x = SLIDE_WIDTH_IN - 4.5 + offset
            skew = 0.82
            out.append(
                _polygon(
                    [
                        (x + skew, -0.6),
                        (x + 2.4, -0.6),
                        (x + 2.4 - skew, SLIDE_HEIGHT_IN + 0.6),
                        (x, SLIDE_HEIGHT_IN + 0.6),
                    ],
                    p.tint("accent", weight) if index else p.accent,
                )
            )
    elif motif == "lattice":
        for row in range(6):
            for column in range(9):
                out.append(
                    _circle(
                        MARGIN + column * 0.3 + 0.0375,
                        SLIDE_HEIGHT_IN - 2.35 + row * 0.3 + 0.0375,
                        0.0375,
                        p.tint("cover_ink", 0.55),
                    )
                )
        out.append(_rect(SLIDE_WIDTH_IN - 4.1, 1.15, 2.9, 2.9, stroke=p.accent, stroke_width=3.0))
    elif motif == "tide":
        out.append(
            _rect(
                SLIDE_WIDTH_IN - 5.2,
                SLIDE_HEIGHT_IN - 4.1,
                6.0,
                4.9,
                fill=p.tint("accent", 0.55),
                rx=1.5,
            )
        )
        out.append(
            _rect(SLIDE_WIDTH_IN - 3.9, SLIDE_HEIGHT_IN - 3.0, 5.2, 4.2, fill=p.accent, rx=1.3)
        )
    elif motif == "ledger":
        out.append(_rect(MARGIN, 0.9, SLIDE_WIDTH_IN - 2 * MARGIN, 3.0 / 72.0, fill=p.accent))
        for index, weight in enumerate((0.0, 0.35, 0.62, 0.82)):
            out.append(
                _rect(MARGIN + index * 0.52, SLIDE_HEIGHT_IN - 1.5, 0.36, 0.36, fill=p.tint("accent", weight))
            )
    elif motif == "chalk":
        out.append(_circle(SLIDE_WIDTH_IN - 4.3 + 2.8, -1.25 + 2.8, 2.8, p.tint("accent", 0.5)))
        out.append(_circle(SLIDE_WIDTH_IN - 2.55 + 1.05, 0.42 + 1.05, 1.05, p.accent))
    elif motif == "frame":
        out.append(
            _rect(0.42, 0.42, SLIDE_WIDTH_IN - 0.84, SLIDE_HEIGHT_IN - 0.84, stroke=p.accent, stroke_width=1.0)
        )
        out.append(
            _rect(
                0.58,
                0.58,
                SLIDE_WIDTH_IN - 1.16,
                SLIDE_HEIGHT_IN - 1.16,
                stroke=p.tint("accent", 0.5),
                stroke_width=0.75,
            )
        )
    elif motif == "monogram":
        out.append(
            _text(
                SLIDE_WIDTH_IN - 0.55,
                4.55,
                design.content["monogram"],
                font=design.type_scale.heading_font,
                size=320,
                color=p.tint("cover_ink", 0.88),
                weight="bold",
                anchor="end",
            )
        )
        out.append(_rect(MARGIN - 0.42, 1.5, 3.0 / 72.0, SLIDE_HEIGHT_IN - 3.0, fill=p.accent))
    return out


def cover_svg(design: Design) -> str:
    p, t, c = design.palette, design.type_scale, design.content
    body: list[str] = [_rect(0, 0, SLIDE_WIDTH_IN, SLIDE_HEIGHT_IN, fill=p.cover_canvas)]
    body.extend(_motif(design))

    left = MARGIN if design.motif != "frame" else MARGIN + 0.35
    accent_kicker = design.motif in ("frame", "monogram", "rules")
    body.append(
        _text(
            left,
            2.52,
            c["kicker"].upper() if not any("一" <= ch <= "鿿" for ch in c["kicker"]) else c["kicker"],
            font=t.body_font,
            size=t.caption,
            color=p.accent if accent_kicker else p.cover_ink,
            weight="bold",
            spacing=2.4,
        )
    )

    limit = 22 if design.motif in ("speed", "tide", "chalk", "monogram") else 26
    y = 3.32
    for line in _wrap(c["title"], limit)[:3]:
        body.append(
            _text(
                left,
                y,
                line.upper() if t.display_caps else line,
                font=t.heading_font,
                size=t.display,
                color=p.cover_ink,
                weight="bold" if t.heading_bold else "normal",
                spacing=t.heading_spacing,
            )
        )
        y += t.display * 1.06 / 72.0

    subtitle_limit = 46 if design.motif in ("speed", "tide", "chalk", "monogram") else 56
    y += 0.24
    for line in _wrap(c["subtitle"], subtitle_limit)[:2]:
        body.append(
            _text(left, y, line, font=t.body_font, size=t.lead, color=p.cover_ink, opacity=0.72)
        )
        y += t.lead * 1.35 / 72.0

    body.append(
        _text(
            left,
            SLIDE_HEIGHT_IN - 0.95,
            c["cover_footer"],
            font=t.body_font,
            size=t.caption,
            color=p.cover_ink,
            spacing=1.8,
            opacity=0.55,
        )
    )

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" '
        f'width="{WIDTH}" height="{HEIGHT}" role="img" '
        f'aria-label="{escape(design.name_en)} template cover">'
        + "".join(body)
        + "</svg>"
    )
