#!/usr/bin/env python3
"""Build the CubeOffice original PPTX templates, their previews and the catalog.

    python3 -m venv .venv && .venv/bin/pip install 'python-pptx==1.0.2'
    .venv/bin/python scripts/templates/build.py

Writes into `website/templates/`: one .pptx per template per language, one SVG
preview per template, and `index.json` -- the catalog the desktop template
picker and the website gallery both read.

Every template is drawn from the design tokens in this directory. Nothing is
derived from a third-party template, and no template embeds a photograph, icon
set or font file, so the output is CubeOffice's own work and free to
redistribute.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import sys
import zipfile
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from pptx import Presentation  # noqa: E402
from pptx.opc.constants import RELATIONSHIP_TYPE as RT  # noqa: E402
from pptx.oxml.ns import qn  # noqa: E402

import content_en  # noqa: E402
import content_zh  # noqa: E402
import recipes  # noqa: E402
from design import SLIDE_HEIGHT, SLIDE_WIDTH, Design  # noqa: E402
from designs import DESIGNS  # noqa: E402
from previews import cover_svg  # noqa: E402

REPOSITORY_ROOT = HERE.parent.parent
OUTPUT_ROOT = REPOSITORY_ROOT / "website" / "templates"
CATALOG_VERSION = 1
LOCALES = ("en", "zh-CN")
CONTENT_BY_LOCALE = {"en": content_en.CONTENT, "zh-CN": content_zh.CONTENT}

LICENSE_ID = "CubeOffice-Original-1.0"
LICENSE_NOTE = {
    "en": "CubeOffice original template. Free to use, edit and redistribute, "
    "with or without attribution, for personal and commercial work.",
    "zh-CN": "CubeOffice 原创模板。可自由使用、修改和再分发，"
    "用于个人或商业用途，无需署名。",
}

# The catalog is served cross-origin to the desktop app, so it carries only
# what the picker draws. Anything else belongs on the website page.
LOCALE_LABELS = {"en": "English", "zh-CN": "简体中文"}

# A .pptx is a zip, and a zip records a modification time per entry, so an
# unpinned build writes different bytes every minute: the committed templates
# would churn on every run and every rebuild would invalidate the caches and
# the catalog's checksums for files whose content never changed. One fixed
# timestamp for the archive entries and the document properties makes the same
# inputs produce the same bytes.
ARCHIVE_TIMESTAMP = (2026, 1, 1, 0, 0, 0)
DOCUMENT_TIMESTAMP = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)


def slide_plan(presentation, design: Design) -> None:
    """The thirteen slides every template ships, in reading order."""
    recipes.cover(presentation, design)
    recipes.agenda(presentation, design)
    recipes.section(presentation, design, 0)
    recipes.lead_and_points(presentation, design)
    recipes.cards(presentation, design)
    recipes.stats(presentation, design)
    recipes.section(presentation, design, 1)
    recipes.timeline(presentation, design)
    recipes.table(presentation, design)
    recipes.picture_and_text(presentation, design)
    recipes.section(presentation, design, 2)
    recipes.quote(presentation, design)
    recipes.closing(presentation, design)


def widen_to_16_9(presentation) -> None:
    """Retarget the stock 4:3 master and layouts at a widescreen slide.

    python-pptx starts from a 4:3 package. Setting the slide size alone leaves
    every inherited placeholder sized for a 10-inch slide, so a user who adds a
    slide from a layout gets a left-hugging box on a 13.3-inch canvas. Scaling
    the horizontal geometry by the same factor keeps those layouts usable.
    """
    factor = SLIDE_WIDTH / presentation.slide_width
    presentation.slide_width = SLIDE_WIDTH
    presentation.slide_height = SLIDE_HEIGHT
    # The stock package also declares `type="screen4x3"`, which would now
    # contradict the dimensions above. Widescreen decks carry no type at all.
    slide_size = presentation._element.find(qn("p:sldSz"))
    if slide_size is not None and "type" in slide_size.attrib:
        del slide_size.attrib["type"]
    for master in presentation.slide_masters:
        parents = [master, *master.slide_layouts]
        for parent in parents:
            for shape in parent.shapes:
                if shape.left is None or shape.width is None:
                    continue
                shape.left = int(shape.left * factor)
                shape.width = int(shape.width * factor)


def apply_theme(presentation, design: Design) -> None:
    """Rewrite the package theme so inherited layouts follow the design.

    The templates draw their own slides, but a user adding a slide from one of
    the stock layouts should still land in the right palette and typeface --
    which means the theme, not the slides, has to carry the design.
    """
    p, t = design.palette, design.type_scale
    theme_part = presentation.slide_masters[0].part.part_related_by(RT.THEME)
    theme = theme_part._element if hasattr(theme_part, "_element") else None
    if theme is None:
        from lxml import etree

        theme = etree.fromstring(theme_part.blob)

    scheme = {
        "dk1": p.ink,
        "lt1": p.canvas,
        "dk2": p.cover_canvas,
        "lt2": p.surface,
        "accent1": p.accent,
        "accent2": p.tint("accent", 0.35),
        "accent3": p.ink,
        "accent4": p.muted,
        "accent5": p.tint("ink", 0.6),
        "accent6": p.rule,
        "hlink": p.accent,
        "folHlink": p.muted,
    }
    color_scheme = theme.find(f".//{qn('a:clrScheme')}")
    for role, value in scheme.items():
        element = color_scheme.find(qn(f"a:{role}"))
        if element is None:
            continue
        for child in list(element):
            element.remove(child)
        srgb = element.makeelement(qn("a:srgbClr"), {"val": value.lstrip("#").upper()})
        element.append(srgb)

    font_scheme = theme.find(f".//{qn('a:fontScheme')}")
    for tag, face in (("a:majorFont", t.heading_font), ("a:minorFont", t.body_font)):
        latin = font_scheme.find(f"{qn(tag)}/{qn('a:latin')}")
        if latin is not None:
            latin.set("typeface", face)

    from lxml import etree

    theme_part._blob = etree.tostring(
        theme, xml_declaration=True, encoding="UTF-8", standalone=True
    )


def set_properties(presentation, design: Design, locale: str) -> None:
    core = presentation.core_properties
    core.title = f"{design.name_en} — CubeOffice template"
    core.subject = design.category_en
    core.author = "CubeOffice"
    core.last_modified_by = "CubeOffice"
    core.category = design.category_en
    core.comments = LICENSE_NOTE[locale]
    core.keywords = f"CubeOffice, template, {design.category_en.lower()}, {locale}"
    # Otherwise these keep the stock template's 2013 dates.
    core.created = DOCUMENT_TIMESTAMP
    core.modified = DOCUMENT_TIMESTAMP


def build_template(design: Design, locale: str, destination: Path) -> None:
    presentation = Presentation()
    widen_to_16_9(presentation)
    apply_theme(presentation, design)
    localized = Design(**{**design.__dict__, "content": CONTENT_BY_LOCALE[locale][design.key]})
    slide_plan(presentation, localized)
    set_properties(presentation, design, locale)
    destination.parent.mkdir(parents=True, exist_ok=True)
    presentation.save(str(destination))
    normalize_archive(destination)


def normalize_archive(path: Path) -> None:
    """Rewrite a saved .pptx with pinned entry timestamps, preserving order."""
    with zipfile.ZipFile(path) as source:
        entries = [(item, source.read(item.filename)) for item in source.infolist()]
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as target:
        for item, payload in entries:
            pinned = zipfile.ZipInfo(item.filename, date_time=ARCHIVE_TIMESTAMP)
            pinned.compress_type = item.compress_type
            pinned.external_attr = item.external_attr
            pinned.create_system = item.create_system
            target.writestr(pinned, payload)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def versioned(url: str, sha256: str) -> str:
    """Tag a URL with its content hash.

    The files are served with a week of caching, so a regenerated template
    published under the same name would keep serving the old bytes from
    browser and proxy caches — and for a .pptx the app would then reject it
    against the catalog's new checksum, reporting a corrupt download rather
    than a stale cache. A content-addressed query makes every change a new
    cache key, and nginx ignores the query when it resolves the file.
    """
    return f"{url}?v={sha256[:12]}"


def main() -> int:
    pptx_dir = OUTPUT_ROOT / "pptx"
    preview_dir = OUTPUT_ROOT / "previews"
    pptx_dir.mkdir(parents=True, exist_ok=True)
    preview_dir.mkdir(parents=True, exist_ok=True)

    entries = []
    for design in DESIGNS:
        files = {}
        for locale in LOCALES:
            path = pptx_dir / f"{design.key}.{locale}.pptx"
            build_template(design, locale, path)
            file_digest = digest(path)
            files[locale] = {
                "url": versioned(f"/templates/pptx/{path.name}", file_digest),
                "bytes": path.stat().st_size,
                "sha256": file_digest,
            }
            print(f"  {path.relative_to(REPOSITORY_ROOT)}  {path.stat().st_size:>7,} B")

        preview_design = Design(
            **{**design.__dict__, "content": CONTENT_BY_LOCALE["en"][design.key]}
        )
        preview_path = preview_dir / f"{design.key}.svg"
        preview_path.write_text(cover_svg(preview_design), encoding="utf-8")

        entries.append(
            {
                "id": design.key,
                "format": "pptx",
                "name": {"en": design.name_en, "zh-CN": design.name_zh},
                "description": {"en": design.tagline_en, "zh-CN": design.tagline_zh},
                "category": {"en": design.category_en, "zh-CN": design.category_zh},
                "slides": 13,
                "aspect": "16:9",
                "preview": versioned(
                    f"/templates/previews/{preview_path.name}", digest(preview_path)
                ),
                "files": files,
                "license": LICENSE_ID,
            }
        )

    catalog = {
        "version": CATALOG_VERSION,
        "updated": date.today().isoformat(),
        "locales": LOCALES,
        "localeLabels": LOCALE_LABELS,
        "license": {"id": LICENSE_ID, "note": LICENSE_NOTE},
        "templates": entries,
    }
    catalog_path = OUTPUT_ROOT / "index.json"
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent="\t") + "\n", encoding="utf-8")

    (OUTPUT_ROOT / "LICENSE.txt").write_text(
        "CubeOffice original templates\n"
        "=============================\n\n"
        f"{LICENSE_NOTE['en']}\n\n"
        f"{LICENSE_NOTE['zh-CN']}\n\n"
        "Every template in this directory was designed and generated for\n"
        "CubeOffice by scripts/templates/ in the CubeOffice distribution\n"
        "repository. The layouts, palettes, type pairings, decorative shapes\n"
        "and placeholder copy are original work. No template contains a\n"
        "photograph, icon set, font file or layout taken from any third-party\n"
        "template, and none is derived from one.\n",
        encoding="utf-8",
    )

    print(f"\n{len(entries)} templates x {len(LOCALES)} locales -> {catalog_path.relative_to(REPOSITORY_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
