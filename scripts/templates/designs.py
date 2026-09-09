"""The eight CubeOffice original template designs.

Each palette was picked for this set: the accent carries at least a 3:1 contrast
against its own background, and body text against `canvas` clears 7:1, so a
deck stays readable projected as well as on screen. Type pairings use only faces
that ship with both Windows and macOS, so a template opens the same way on
either -- and on Android, where the app falls back to the closest system face.
"""

from __future__ import annotations

from design import Design, Palette, TypeScale

# --------------------------------------------------------------------------
# Type pairings
# --------------------------------------------------------------------------

EDITORIAL = TypeScale(
    heading_font="Georgia",
    body_font="Trebuchet MS",
    display=52,
    title=31,
    section=76,
    lead=15,
    body=13,
    caption=9.5,
    stat=44,
)

INDUSTRIAL = TypeScale(
    heading_font="Arial",
    body_font="Arial",
    display=58,
    title=33,
    section=84,
    lead=15,
    body=13,
    caption=9.5,
    stat=48,
    display_caps=True,
    title_caps=True,
    heading_spacing=-0.6,
)

TECHNICAL = TypeScale(
    heading_font="Arial",
    body_font="Arial",
    display=46,
    title=27,
    section=68,
    lead=14,
    body=12,
    caption=9,
    stat=40,
)

HUMANIST = TypeScale(
    heading_font="Trebuchet MS",
    body_font="Trebuchet MS",
    display=50,
    title=30,
    section=74,
    lead=15,
    body=13,
    caption=9.5,
    stat=44,
)

WARM = TypeScale(
    heading_font="Georgia",
    body_font="Verdana",
    display=48,
    title=29,
    section=72,
    lead=14,
    body=12,
    caption=9,
    stat=42,
)

CLASSICAL = TypeScale(
    heading_font="Times New Roman",
    body_font="Arial",
    display=54,
    title=32,
    section=78,
    lead=15,
    body=12.5,
    caption=9,
    stat=44,
    heading_bold=False,
)

SPARE = TypeScale(
    heading_font="Arial",
    body_font="Arial",
    display=50,
    title=28,
    section=72,
    lead=14.5,
    body=12.5,
    caption=9,
    stat=42,
    display_caps=True,
    title_caps=False,
    heading_spacing=1.6,
)

# --------------------------------------------------------------------------
# Designs
# --------------------------------------------------------------------------

DESIGNS = [
    Design(
        key="meridian",
        name_en="Meridian",
        name_zh="子午线",
        tagline_en="An editorial business plan with generous margins and a quiet sand accent.",
        tagline_zh="留白充裕的商业计划版式，配沙色点缀，适合正式提案。",
        category_en="Business plan",
        category_zh="商业计划",
        palette=Palette(
            canvas="FFFFFF",
            ink="16233A",
            muted="55627A",
            accent="B4762A",
            accent_ink="FFFFFF",
            surface="F6F3EE",
            rule="D9D3C8",
            cover_canvas="16233A",
            cover_ink="FFFFFF",
        ),
        type_scale=EDITORIAL,
        motif="rules",
    ),
    Design(
        key="kinetic",
        name_en="Kinetic",
        name_zh="动势",
        tagline_en="A launch deck built on hard diagonals, heavy caps and a single electric accent.",
        tagline_zh="强对角线与重字重构成的发布会版式，单一荧光色点睛。",
        category_en="Product launch",
        category_zh="产品发布",
        palette=Palette(
            canvas="FFFFFF",
            ink="111417",
            muted="565C63",
            accent="0F7B4F",
            accent_ink="FFFFFF",
            surface="F2F3F4",
            rule="D8DBDE",
            cover_canvas="111417",
            cover_ink="FFFFFF",
        ),
        type_scale=INDUSTRIAL,
        motif="speed",
    ),
    Design(
        key="lattice",
        name_en="Lattice",
        name_zh="网格",
        tagline_en="A numbers-first annual report: dot lattice, ruled tables, terracotta figures.",
        tagline_zh="以数字为主的年度报告：点阵底纹、线框表格、赭红数据。",
        category_en="Annual report",
        category_zh="年度报告",
        palette=Palette(
            canvas="FFFFFF",
            ink="1C1C1E",
            muted="5A5A60",
            accent="A2402C",
            accent_ink="FFFFFF",
            surface="F5F4F2",
            rule="D6D4D0",
            cover_canvas="24242A",
            cover_ink="FFFFFF",
        ),
        type_scale=EDITORIAL,
        motif="lattice",
    ),
    Design(
        key="tidewater",
        name_en="Tidewater",
        name_zh="潮汐",
        tagline_en="Soft rounded panels and a deep teal range for sales and strategy reviews.",
        tagline_zh="圆角面板配深青色系，用于销售策略与业务复盘。",
        category_en="Sales strategy",
        category_zh="销售策略",
        palette=Palette(
            canvas="FFFFFF",
            ink="10333A",
            muted="4A6B72",
            accent="0E6E7C",
            accent_ink="FFFFFF",
            surface="EFF6F7",
            rule="C9DCDF",
            cover_canvas="0B2A30",
            cover_ink="FFFFFF",
        ),
        type_scale=HUMANIST,
        motif="tide",
        radius=0.18,
    ),
    Design(
        key="ledger",
        name_en="Ledger",
        name_zh="账簿",
        tagline_en="A functional status report: rules, tables and a four-step tracker.",
        tagline_zh="务实的项目状态报告：分隔线、表格与四段式进度条。",
        category_en="Project status",
        category_zh="项目状态",
        palette=Palette(
            canvas="FFFFFF",
            ink="1F2429",
            muted="5C646C",
            accent="1D4ED8",
            accent_ink="FFFFFF",
            surface="F4F6F8",
            rule="D5DAE0",
            cover_canvas="FFFFFF",
            cover_ink="1F2429",
        ),
        type_scale=TECHNICAL,
        motif="ledger",
    ),
    Design(
        key="chalk",
        name_en="Chalk",
        name_zh="粉笔",
        tagline_en="A warm workshop deck: numbered modules, soft circles, roomy line spacing.",
        tagline_zh="温暖的培训课件：模块编号、柔和圆形、宽松行距。",
        category_en="Training",
        category_zh="培训课件",
        palette=Palette(
            canvas="FFFCF7",
            ink="2A2320",
            muted="6B5F58",
            accent="C2543C",
            accent_ink="FFFFFF",
            surface="F6EFE6",
            rule="DFD3C6",
            cover_canvas="2A2320",
            cover_ink="FFFCF7",
        ),
        type_scale=WARM,
        motif="chalk",
        radius=0.14,
    ),
    Design(
        key="passepartout",
        name_en="Passepartout",
        name_zh="卡纸",
        tagline_en="A gallery portfolio: thin double frames, small captions, image-led pages.",
        tagline_zh="画廊式作品集：双细边框、小号图注、以图为主。",
        category_en="Portfolio",
        category_zh="作品集",
        palette=Palette(
            canvas="FFFFFF",
            ink="1A1A1A",
            muted="6E6E6E",
            accent="8A6A3D",
            accent_ink="FFFFFF",
            surface="FAFAF8",
            rule="DCDCD8",
            cover_canvas="FFFFFF",
            cover_ink="1A1A1A",
        ),
        type_scale=CLASSICAL,
        motif="frame",
    ),
    Design(
        key="monogram",
        name_en="Monogram",
        name_zh="字母印记",
        tagline_en="Almost nothing: one hairline, one accent, type doing all the work.",
        tagline_zh="极简到只剩排版：一道细线、一种强调色。",
        category_en="Minimal",
        category_zh="极简通用",
        palette=Palette(
            canvas="FFFFFF",
            ink="000000",
            muted="606060",
            accent="B02A2A",
            accent_ink="FFFFFF",
            surface="F7F7F7",
            rule="DBDBDB",
            cover_canvas="FFFFFF",
            cover_ink="000000",
        ),
        type_scale=SPARE,
        motif="monogram",
    ),
]

DESIGNS_BY_KEY = {design.key: design for design in DESIGNS}
