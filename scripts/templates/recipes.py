"""Slide recipes shared by every CubeOffice original template.

A recipe lays out one kind of slide from the design tokens only. Templates
differ by palette, type pairing, corner radius, motif and which recipes they
use -- not by having their own layout code.
"""

from __future__ import annotations

from pptx.enum.text import MSO_ANCHOR, PP_ALIGN

from design import (
    CONTENT_WIDTH,
    MARGIN,
    SLIDE_HEIGHT_IN,
    SLIDE_WIDTH_IN,
    Design,
    background,
    bullets,
    ellipse,
    parallelogram,
    rect,
    rule,
    textbox,
    triangle,
    vrule,
    write,
)

BLANK_LAYOUT = 6

# The monogram motif's hairline sits in the left margin so it never runs
# underneath the first character of a heading.
RULE_GUTTER = MARGIN - 0.42


def _slide(presentation):
    return presentation.slides.add_slide(presentation.slide_layouts[BLANK_LAYOUT])


# --------------------------------------------------------------------------
# Motifs. `cover` decorates a full-bleed cover or section slide; `mark` is the
# quiet interior echo of it that sits beside a slide title.
# --------------------------------------------------------------------------


def draw_cover_motif(slide, design: Design) -> None:
    p = design.palette
    motif = design.motif
    if motif == "rules":
        for index in range(4):
            rule(slide, MARGIN, 0.95 + index * 0.17, 2.1 - index * 0.42, p.accent, weight=2.5)
        triangle(slide, SLIDE_WIDTH_IN - 3.6, SLIDE_HEIGHT_IN - 2.5, 3.6, 2.5, p.tint("accent", 0.62))
    elif motif == "speed":
        for index, (offset, weight) in enumerate(((0.0, 0.0), (1.35, 0.45), (2.7, 0.72))):
            parallelogram(
                slide,
                SLIDE_WIDTH_IN - 4.5 + offset,
                -0.6,
                2.4,
                SLIDE_HEIGHT_IN + 1.2,
                p.tint("accent", weight) if index else p.accent,
                skew=0.34,
            )
    elif motif == "lattice":
        for row in range(6):
            for column in range(9):
                size = 0.075
                ellipse(
                    slide,
                    MARGIN + column * 0.3,
                    SLIDE_HEIGHT_IN - 2.35 + row * 0.3,
                    size,
                    size,
                    fill=p.tint("cover_ink", 0.55),
                )
        rect(
            slide,
            SLIDE_WIDTH_IN - 4.1,
            1.15,
            2.9,
            2.9,
            line=p.accent,
            line_w=3.0,
        )
    elif motif == "tide":
        rect(
            slide,
            SLIDE_WIDTH_IN - 5.2,
            SLIDE_HEIGHT_IN - 4.1,
            6.0,
            4.9,
            fill=p.tint("accent", 0.55),
            radius=1.5,
        )
        rect(
            slide,
            SLIDE_WIDTH_IN - 3.9,
            SLIDE_HEIGHT_IN - 3.0,
            5.2,
            4.2,
            fill=p.accent,
            radius=1.3,
        )
    elif motif == "ledger":
        rule(slide, MARGIN, 0.9, CONTENT_WIDTH, p.accent, weight=3.0)
        for index, weight in enumerate((0.0, 0.35, 0.62, 0.82)):
            rect(
                slide,
                MARGIN + index * 0.52,
                SLIDE_HEIGHT_IN - 1.5,
                0.36,
                0.36,
                fill=p.tint("accent", weight),
            )
    elif motif == "chalk":
        ellipse(
            slide,
            SLIDE_WIDTH_IN - 4.3,
            -1.25,
            5.6,
            5.6,
            fill=p.tint("accent", 0.5),
        )
        ellipse(
            slide,
            SLIDE_WIDTH_IN - 2.55,
            0.42,
            2.1,
            2.1,
            fill=p.accent,
        )
    elif motif == "frame":
        rect(slide, 0.42, 0.42, SLIDE_WIDTH_IN - 0.84, SLIDE_HEIGHT_IN - 0.84, line=p.accent, line_w=1.0)
        rect(slide, 0.58, 0.58, SLIDE_WIDTH_IN - 1.16, SLIDE_HEIGHT_IN - 1.16, line=p.tint("accent", 0.5), line_w=0.75)
    elif motif == "monogram":
        watermark = textbox(
            slide,
            SLIDE_WIDTH_IN - 5.4,
            -0.9,
            5.0,
            6.4,
            align=PP_ALIGN.RIGHT,
            anchor=MSO_ANCHOR.MIDDLE,
        )
        write(
            watermark.text_frame,
            design.content["monogram"],
            font=design.type_scale.heading_font,
            size=320,
            color=p.tint("cover_ink", 0.88),
            bold=True,
            line_spacing=0.85,
            align=PP_ALIGN.RIGHT,
            first=True,
        )
        vrule(slide, RULE_GUTTER, 1.5, SLIDE_HEIGHT_IN - 3.0, p.accent, weight=3.0)


def draw_title_mark(slide, design: Design, y: float) -> None:
    p = design.palette
    motif = design.motif
    if motif in ("rules", "ledger"):
        rule(slide, MARGIN, y, 1.05, p.accent, weight=2.5)
    elif motif == "speed":
        parallelogram(slide, MARGIN, y - 0.05, 0.62, 0.16, p.accent, skew=0.5)
    elif motif == "lattice":
        for index in range(3):
            ellipse(slide, MARGIN + index * 0.21, y - 0.04, 0.11, 0.11, fill=p.accent)
    elif motif == "tide":
        rect(slide, MARGIN, y - 0.06, 0.9, 0.18, fill=p.accent, radius=0.09)
    elif motif == "chalk":
        ellipse(slide, MARGIN, y - 0.08, 0.22, 0.22, fill=p.accent)
    elif motif == "frame":
        rule(slide, MARGIN, y, 0.7, p.ink, weight=1.0)
    elif motif == "monogram":
        vrule(slide, RULE_GUTTER, y - 0.55, 0.85, p.accent, weight=3.0)


# --------------------------------------------------------------------------
# Recipes
# --------------------------------------------------------------------------


def cover(presentation, design: Design) -> None:
    slide = _slide(presentation)
    p, t, c = design.palette, design.type_scale, design.content
    background(slide, p.cover_canvas)
    draw_cover_motif(slide, design)

    left = MARGIN if design.motif != "frame" else MARGIN + 0.35
    # Narrow enough to clear whatever the motif puts on the right: the monogram
    # watermark starts furthest left, so it gets the tightest column.
    width = {"monogram": 6.9, "speed": 7.4, "tide": 7.4, "chalk": 7.4}.get(design.motif, 8.6)
    box = textbox(slide, left, 2.28, width, 3.1, anchor=MSO_ANCHOR.TOP)
    frame = box.text_frame
    write(
        frame,
        c["kicker"],
        font=t.body_font,
        size=t.caption,
        color=p.accent if design.motif in ("frame", "monogram", "rules") else p.cover_ink,
        bold=True,
        caps=True,
        spacing=2.4,
        space_after=14,
        first=True,
    )
    write(
        frame,
        c["title"],
        font=t.heading_font,
        size=t.display,
        color=p.cover_ink,
        bold=t.heading_bold,
        caps=t.display_caps,
        spacing=t.heading_spacing,
        line_spacing=1.02,
        space_after=16,
    )
    write(
        frame,
        c["subtitle"],
        font=t.body_font,
        size=t.lead,
        color=p.tint("cover_ink", 0.3),
        line_spacing=1.35,
    )

    footer = textbox(slide, left, SLIDE_HEIGHT_IN - 1.28, width, 0.5)
    write(
        footer.text_frame,
        c["cover_footer"],
        font=t.body_font,
        size=t.caption,
        color=p.tint("cover_ink", 0.45),
        caps=True,
        spacing=1.8,
        first=True,
    )


def _title_block(slide, design: Design, title: str, eyebrow: str | None = None):
    p, t = design.palette, design.type_scale
    draw_title_mark(slide, design, 0.98)
    y = 1.22
    if eyebrow:
        box = textbox(slide, MARGIN, y, CONTENT_WIDTH, 0.32)
        write(
            box.text_frame,
            eyebrow,
            font=t.body_font,
            size=t.caption,
            color=p.accent,
            bold=True,
            caps=True,
            spacing=2.2,
            first=True,
        )
        y += 0.42
    box = textbox(slide, MARGIN, y, CONTENT_WIDTH, 0.9)
    write(
        box.text_frame,
        title,
        font=t.heading_font,
        size=t.title,
        color=p.ink,
        bold=t.heading_bold,
        caps=t.title_caps,
        spacing=t.heading_spacing,
        line_spacing=1.05,
        first=True,
    )
    return y + 1.16


def agenda(presentation, design: Design) -> None:
    slide = _slide(presentation)
    p, t, c = design.palette, design.type_scale, design.content
    background(slide, p.canvas)
    top = _title_block(slide, design, c["agenda_title"])

    items = c["agenda_items"]
    column_width = (CONTENT_WIDTH - 0.9) / 2
    for index, (label, note) in enumerate(items):
        column, row = divmod(index, 3)
        x = MARGIN + column * (column_width + 0.9)
        y = top + row * 1.32
        # Tall enough for the largest number size any type scale asks for.
        number = textbox(slide, x, y, 0.85, 0.8)
        write(
            number.text_frame,
            f"{index + 1:02d}",
            font=t.heading_font,
            size=t.section * 0.52,
            color=p.accent,
            bold=True,
            first=True,
        )
        rule(slide, x, y + 0.94, column_width, p.rule, weight=0.75)
        body = textbox(slide, x + 1.0, y - 0.04, column_width - 1.0, 0.9)
        write(
            body.text_frame,
            label,
            font=t.heading_font,
            size=t.body + 2,
            color=p.ink,
            bold=True,
            space_after=4,
            first=True,
        )
        write(body.text_frame, note, font=t.body_font, size=t.caption, color=p.muted, line_spacing=1.3)


def section(presentation, design: Design, index: int) -> None:
    slide = _slide(presentation)
    p, t, c = design.palette, design.type_scale, design.content
    label, note = c["sections"][index]
    background(slide, p.cover_canvas)
    if design.motif == "frame":
        rect(slide, 0.42, 0.42, SLIDE_WIDTH_IN - 0.84, SLIDE_HEIGHT_IN - 0.84, line=p.accent, line_w=1.0)
    elif design.motif == "monogram":
        vrule(slide, RULE_GUTTER, 2.1, SLIDE_HEIGHT_IN - 4.2, p.accent, weight=3.0)
    else:
        rect(slide, 0, SLIDE_HEIGHT_IN - 0.34, SLIDE_WIDTH_IN, 0.34, fill=p.accent)

    box = textbox(slide, MARGIN, 2.5, CONTENT_WIDTH - 2.0, 2.4, anchor=MSO_ANCHOR.TOP)
    frame = box.text_frame
    write(
        frame,
        f"{index + 1:02d}",
        font=t.heading_font,
        size=t.section,
        color=p.accent,
        bold=True,
        line_spacing=0.95,
        space_after=6,
        first=True,
    )
    write(
        frame,
        label,
        font=t.heading_font,
        size=t.title + 4,
        color=p.cover_ink,
        bold=t.heading_bold,
        caps=t.title_caps,
        spacing=t.heading_spacing,
        space_after=12,
    )
    write(frame, note, font=t.body_font, size=t.lead, color=p.tint("cover_ink", 0.35), line_spacing=1.35)


def lead_and_points(presentation, design: Design) -> None:
    slide = _slide(presentation)
    p, t, c = design.palette, design.type_scale, design.content
    background(slide, p.canvas)
    top = _title_block(slide, design, c["lead_title"], c["lead_eyebrow"])

    lead_width = CONTENT_WIDTH * 0.46
    lead = textbox(slide, MARGIN, top, lead_width, 3.0)
    write(
        lead.text_frame,
        c["lead_body"],
        font=t.body_font,
        size=t.lead,
        color=p.ink,
        line_spacing=1.42,
        first=True,
    )

    x = MARGIN + lead_width + 0.8
    width = CONTENT_WIDTH - lead_width - 0.8
    vrule(slide, x - 0.45, top + 0.06, 2.85, p.rule, weight=0.75)
    points = textbox(slide, x, top, width, 3.0)
    bullets(
        points.text_frame,
        c["lead_points"],
        font=t.body_font,
        size=t.body,
        color=p.muted,
        bullet_color=p.accent,
        gap=11,
    )


def cards(presentation, design: Design) -> None:
    slide = _slide(presentation)
    p, t, c = design.palette, design.type_scale, design.content
    background(slide, p.canvas)
    top = _title_block(slide, design, c["cards_title"], c["cards_eyebrow"])

    items = c["cards"]
    gap = 0.42
    width = (CONTENT_WIDTH - gap * (len(items) - 1)) / len(items)
    height = 3.05
    for index, (label, body) in enumerate(items):
        x = MARGIN + index * (width + gap)
        rect(
            slide,
            x,
            top,
            width,
            height,
            fill=p.surface,
            line=None if design.radius else p.rule,
            line_w=0.75,
            radius=design.radius,
        )
        rect(slide, x, top, width if design.radius else 0.0, 0.0, fill=None)
        if not design.radius:
            rect(slide, x, top, width, 0.055, fill=p.accent if index == 0 else p.tint("accent", 0.55))
        else:
            ellipse(slide, x + 0.52, top + 0.6, 0.3, 0.3, fill=p.accent if index == 0 else p.tint("accent", 0.5))
        text = textbox(slide, x + 0.52, top + (1.12 if design.radius else 0.72), width - 1.04, height - 1.6)
        frame = text.text_frame
        write(
            frame,
            f"{index + 1:02d}",
            font=t.heading_font,
            size=t.caption,
            color=p.accent,
            bold=True,
            spacing=1.6,
            space_after=10,
            first=True,
        )
        write(
            frame,
            label,
            font=t.heading_font,
            size=t.body + 3,
            color=p.ink,
            bold=True,
            line_spacing=1.15,
            space_after=8,
        )
        write(frame, body, font=t.body_font, size=t.caption + 0.5, color=p.muted, line_spacing=1.4)


def stats(presentation, design: Design) -> None:
    slide = _slide(presentation)
    p, t, c = design.palette, design.type_scale, design.content
    background(slide, p.canvas)
    top = _title_block(slide, design, c["stats_title"], c["stats_eyebrow"])

    items = c["stats"]
    width = CONTENT_WIDTH / len(items)
    for index, (value, label, note) in enumerate(items):
        x = MARGIN + index * width
        if index:
            vrule(slide, x - 0.3, top + 0.15, 1.95, p.rule, weight=0.75)
        box = textbox(slide, x, top, width - 0.6, 2.3)
        frame = box.text_frame
        write(
            frame,
            value,
            font=t.heading_font,
            size=t.stat,
            color=p.accent if index == 0 else p.ink,
            bold=True,
            line_spacing=0.98,
            space_after=8,
            first=True,
        )
        write(
            frame,
            label,
            font=t.heading_font,
            size=t.body,
            color=p.ink,
            bold=True,
            space_after=5,
        )
        write(frame, note, font=t.body_font, size=t.caption, color=p.muted, line_spacing=1.35)

    band_top = top + 2.55
    rect(slide, MARGIN, band_top, CONTENT_WIDTH, 1.0, fill=p.tint("accent", 0.86), radius=design.radius)
    note = textbox(slide, MARGIN + 0.5, band_top + 0.24, CONTENT_WIDTH - 1.0, 0.55, anchor=MSO_ANCHOR.MIDDLE)
    write(
        note.text_frame,
        c["stats_footnote"],
        font=t.body_font,
        size=t.caption + 0.5,
        color=p.ink,
        line_spacing=1.3,
        first=True,
    )


def timeline(presentation, design: Design) -> None:
    slide = _slide(presentation)
    p, t, c = design.palette, design.type_scale, design.content
    background(slide, p.canvas)
    top = _title_block(slide, design, c["timeline_title"], c["timeline_eyebrow"])

    items = c["timeline"]
    axis_y = top + 1.15
    rule(slide, MARGIN, axis_y, CONTENT_WIDTH, p.rule, weight=1.5)
    step = CONTENT_WIDTH / len(items)
    for index, (when, label, note) in enumerate(items):
        x = MARGIN + index * step
        done = index < c["timeline_done"]
        ellipse(
            slide,
            x - 0.085,
            axis_y - 0.075,
            0.19,
            0.19,
            fill=p.accent if done else p.canvas,
            line=None if done else p.rule,
            line_w=1.5,
        )
        when_box = textbox(slide, x, axis_y - 0.72, step - 0.35, 0.4)
        write(
            when_box.text_frame,
            when,
            font=t.body_font,
            size=t.caption,
            color=p.accent if done else p.muted,
            bold=True,
            caps=True,
            spacing=1.6,
            first=True,
        )
        body = textbox(slide, x, axis_y + 0.42, step - 0.35, 1.9)
        frame = body.text_frame
        write(
            frame,
            label,
            font=t.heading_font,
            size=t.body + 1,
            color=p.ink,
            bold=True,
            line_spacing=1.2,
            space_after=6,
            first=True,
        )
        write(frame, note, font=t.body_font, size=t.caption, color=p.muted, line_spacing=1.35)


def table(presentation, design: Design) -> None:
    slide = _slide(presentation)
    p, t, c = design.palette, design.type_scale, design.content
    background(slide, p.canvas)
    top = _title_block(slide, design, c["table_title"], c["table_eyebrow"])

    header, rows = c["table_header"], c["table_rows"]
    columns = len(header)
    first_width = CONTENT_WIDTH * 0.34
    other_width = (CONTENT_WIDTH - first_width) / (columns - 1)
    row_height = 0.62

    def column_x(index: int) -> float:
        return MARGIN if index == 0 else MARGIN + first_width + (index - 1) * other_width

    def column_width(index: int) -> float:
        return first_width if index == 0 else other_width

    rect(slide, MARGIN, top, CONTENT_WIDTH, row_height, fill=p.ink, radius=0.0)
    for index, label in enumerate(header):
        cell = textbox(
            slide,
            column_x(index) + 0.28,
            top,
            column_width(index) - 0.4,
            row_height,
            anchor=MSO_ANCHOR.MIDDLE,
        )
        write(
            cell.text_frame,
            label,
            font=t.body_font,
            size=t.caption,
            color=p.canvas,
            bold=True,
            caps=True,
            spacing=1.4,
            first=True,
        )

    for row_index, row in enumerate(rows):
        y = top + row_height + row_index * row_height
        if row_index % 2 == 0:
            rect(slide, MARGIN, y, CONTENT_WIDTH, row_height, fill=p.surface)
        rule(slide, MARGIN, y + row_height, CONTENT_WIDTH, p.rule, weight=0.5)
        for index, value in enumerate(row):
            cell = textbox(
                slide,
                column_x(index) + 0.28,
                y,
                column_width(index) - 0.4,
                row_height,
                anchor=MSO_ANCHOR.MIDDLE,
            )
            write(
                cell.text_frame,
                value,
                font=t.body_font,
                size=t.body - 1,
                color=p.ink if index == 0 else p.muted,
                bold=index == 0,
                first=True,
            )

    legend = textbox(slide, MARGIN, top + row_height * (len(rows) + 1) + 0.28, CONTENT_WIDTH, 0.4)
    write(
        legend.text_frame,
        c["table_note"],
        font=t.body_font,
        size=t.caption,
        color=p.muted,
        first=True,
    )


def picture_and_text(presentation, design: Design) -> None:
    slide = _slide(presentation)
    p, t, c = design.palette, design.type_scale, design.content
    background(slide, p.canvas)
    top = _title_block(slide, design, c["picture_title"], c["picture_eyebrow"])

    frame_width = CONTENT_WIDTH * 0.52
    frame_height = 3.2
    rect(
        slide,
        MARGIN,
        top,
        frame_width,
        frame_height,
        fill=p.surface,
        line=p.rule,
        line_w=0.75,
        radius=design.radius,
    )
    # An original, drawn placeholder: horizon, sun, two slopes.
    base_y = top + frame_height * 0.66
    ellipse(
        slide,
        MARGIN + frame_width * 0.62,
        top + frame_height * 0.26,
        0.5,
        0.5,
        fill=p.tint("accent", 0.35),
    )
    triangle(slide, MARGIN + frame_width * 0.2, base_y - 0.9, 1.5, 0.9, p.tint("ink", 0.72))
    triangle(slide, MARGIN + frame_width * 0.42, base_y - 1.25, 1.9, 1.25, p.tint("ink", 0.55))
    rule(slide, MARGIN + frame_width * 0.16, base_y, frame_width * 0.68, p.tint("ink", 0.45), weight=1.0)
    hint = textbox(
        slide,
        MARGIN,
        top + frame_height - 0.86,
        frame_width,
        0.4,
        align=PP_ALIGN.CENTER,
    )
    write(
        hint.text_frame,
        c["picture_hint"],
        font=t.body_font,
        size=t.caption,
        color=p.muted,
        caps=True,
        spacing=1.6,
        align=PP_ALIGN.CENTER,
        first=True,
    )

    x = MARGIN + frame_width + 0.8
    width = CONTENT_WIDTH - frame_width - 0.8
    # Stops above the rule and caption that close the column.
    body = textbox(slide, x, top, width, frame_height - 1.05)
    frame = body.text_frame
    write(
        frame,
        c["picture_lead"],
        font=t.heading_font,
        size=t.body + 5,
        color=p.ink,
        bold=t.heading_bold,
        line_spacing=1.2,
        space_after=14,
        first=True,
    )
    write(
        frame,
        c["picture_body"],
        font=t.body_font,
        size=t.body,
        color=p.muted,
        line_spacing=1.45,
        space_after=16,
    )
    rule(slide, x, top + frame_height - 0.95, 1.0, p.accent, weight=2.5)
    caption = textbox(slide, x, top + frame_height - 0.68, width, 0.5)
    write(
        caption.text_frame,
        c["picture_caption"],
        font=t.body_font,
        size=t.caption,
        color=p.muted,
        line_spacing=1.35,
        first=True,
    )


def quote(presentation, design: Design) -> None:
    slide = _slide(presentation)
    p, t, c = design.palette, design.type_scale, design.content
    background(slide, p.tint("ink", 0.94) if design.motif != "monogram" else p.canvas)
    if design.motif == "monogram":
        vrule(slide, RULE_GUTTER, 2.0, SLIDE_HEIGHT_IN - 4.0, p.accent, weight=3.0)
    else:
        rect(slide, 0, 0, 0.34, SLIDE_HEIGHT_IN, fill=p.accent)

    mark = textbox(slide, MARGIN + 0.3, 1.6, 1.2, 1.25)
    write(
        mark.text_frame,
        "“",
        font=t.heading_font,
        size=84,
        color=p.tint("accent", 0.25),
        bold=True,
        line_spacing=0.9,
        first=True,
    )

    box = textbox(slide, MARGIN + 0.3, 2.95, CONTENT_WIDTH - 1.6, 2.6)
    frame = box.text_frame
    write(
        frame,
        c["quote"],
        font=t.heading_font,
        size=t.title - 4,
        color=p.ink,
        bold=False,
        italic=design.motif == "frame",
        line_spacing=1.28,
        space_after=22,
        first=True,
    )
    write(
        frame,
        c["quote_attribution"],
        font=t.body_font,
        size=t.caption + 1,
        color=p.muted,
        bold=True,
        caps=True,
        spacing=1.8,
    )


def closing(presentation, design: Design) -> None:
    slide = _slide(presentation)
    p, t, c = design.palette, design.type_scale, design.content
    background(slide, p.cover_canvas)
    if design.motif == "frame":
        rect(slide, 0.42, 0.42, SLIDE_WIDTH_IN - 0.84, SLIDE_HEIGHT_IN - 0.84, line=p.accent, line_w=1.0)
    elif design.motif == "monogram":
        vrule(slide, RULE_GUTTER, 2.2, SLIDE_HEIGHT_IN - 4.4, p.accent, weight=3.0)
    else:
        rect(slide, 0, 0, SLIDE_WIDTH_IN, 0.34, fill=p.accent)

    box = textbox(slide, MARGIN, 2.55, CONTENT_WIDTH * 0.66, 2.4)
    frame = box.text_frame
    write(
        frame,
        c["closing_title"],
        font=t.heading_font,
        size=t.display - 8,
        color=p.cover_ink,
        bold=t.heading_bold,
        caps=t.display_caps,
        spacing=t.heading_spacing,
        line_spacing=1.05,
        space_after=14,
        first=True,
    )
    write(
        frame,
        c["closing_body"],
        font=t.body_font,
        size=t.lead,
        color=p.tint("cover_ink", 0.3),
        line_spacing=1.4,
    )

    contact = textbox(slide, MARGIN, SLIDE_HEIGHT_IN - 1.65, CONTENT_WIDTH, 0.9)
    rule(slide, MARGIN, SLIDE_HEIGHT_IN - 1.75, 1.4, p.accent, weight=2.5)
    write(
        contact.text_frame,
        c["closing_contact"],
        font=t.body_font,
        size=t.caption,
        color=p.tint("cover_ink", 0.45),
        caps=True,
        spacing=2.0,
        first=True,
    )
