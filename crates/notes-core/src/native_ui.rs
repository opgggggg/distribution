//! Native chrome follows the shipped iPad tray. Rust owns layout, tool metadata and glyphs.
use crate::{
    native::{Surface, STYLES},
    Error, Result,
};
use serde_json::{json, Value};
pub const SWATCHES: [&str; 5] = ["#222b40", "#2563eb", "#15803d", "#facc15", "#dc3658"];

pub fn state(s: &Surface, width: f64, height: f64) -> Value {
    let wide = width >= 680.0;
    let compact = height < 500.0;
    let tray_width = (width - 24.0).min(920.0).max(1.0);
    let tray_height = if compact {
        if wide {
            118.0
        } else {
            106.0
        }
    } else {
        124.0
    };
    let tray_x = ((width - tray_width) / 2.0 + s.tray_offset[0])
        .clamp(12.0, (width - tray_width - 12.0).max(12.0));
    let tray_y = (height - tray_height - 14.0 + s.tray_offset[1])
        .clamp(72.0, (height - tray_height - 12.0).max(72.0));
    let colors_width = if wide { 132.0 } else { 44.0 };
    let strip_width = (tray_width - 170.0 - colors_width).max(44.0);
    let brush_height = if compact { 68.0 } else { 86.0 };
    let strip_height = brush_height + 8.0;
    let center_y = 23.0 + (tray_height - 30.0 - 44.0) / 2.0;
    let colors_y = 23.0 + (tray_height - 30.0 - 88.0) / 2.0;
    let mut buttons = STYLES
        .iter()
        .enumerate()
        .map(|(i, id)| {
            let preset = &s.presets[i];
            json!({"action":i,"title":s.session.brushes[*id]["label"],"glyph":id,
            "selected":s.tool=="pen"&&s.style==i,"enabled":!s.session.readonly(),
            "color":if s.style==i{s.color.as_str()}else{preset["color"].as_str().unwrap()},
            "value":if s.style==i{s.width}else{preset["width"].as_f64().unwrap()},
            "x":2.0+i as f64*46.0,"y":8,"width":44,"height":brush_height})
        })
        .collect::<Vec<_>>();
    for (i, (id, title, color, value)) in [
        (
            "highlighter",
            "荧光笔",
            s.aux["highlighter"]["color"].as_str().unwrap(),
            s.aux["highlighter"]["width"].as_f64().unwrap(),
        ),
        (
            "eraser",
            "橡皮擦",
            "#ee929b",
            s.aux["eraser"]["width"].as_f64().unwrap(),
        ),
        ("lasso", "套索", "#6d7583", 0.0),
    ]
    .into_iter()
    .enumerate()
    {
        buttons.push(json!({"action":10+i,"title":title,"glyph":id,"selected":s.tool==id,"enabled":!s.session.readonly(),"color":color,"value":value,"x":2.0+(i+10) as f64*46.0,"y":8,"width":44,"height":brush_height}));
    }
    let history = [
        (
            100,
            "撤销",
            "arrow.uturn.backward",
            !s.session.history.past.is_empty(),
        ),
        (
            101,
            "重做",
            "arrow.uturn.forward",
            !s.session.history.future.is_empty(),
        ),
    ]
    .into_iter()
    .enumerate()
    .map(|(i, (action, title, icon, enabled))| {
        json!({"action":action,"title":title,"icon":icon,"enabled":enabled,"group":"history",
                "x":11.0+i as f64*46.0,"y":center_y,"width":44,"height":44})
    })
    .collect::<Vec<_>>();
    let colors_x = 111.0 + strip_width;
    let mut controls = history;
    if wide {
        for (i, color) in SWATCHES.iter().enumerate() {
            controls.push(json!({"action":300+i,"title":format!("笔迹颜色 {color}"),"color":color,"selected":s.active_color().eq_ignore_ascii_case(color),"group":"swatch",
                "x":colors_x+(i%3) as f64*44.0,"y":colors_y+(i/3) as f64*44.0,"width":44,"height":44}));
        }
    }
    controls.push(json!({"action":200,"title":"更多颜色","group":"color","color":s.active_color(),"rainbow":wide,
        "x":colors_x+if wide{88.0}else{0.0},"y":if wide{colors_y+44.0}else{center_y},"width":44,"height":44}));
    controls.push(
        json!({"action":202,"title":"更多工具","icon":"ellipsis","group":"settings",
        "x":tray_width-55.0,"y":center_y,"width":44,"height":44}),
    );
    let mode_width = if width < 420.0 { 76.0 } else { 84.0 };
    let actions_width = 48.0 + mode_width + 48.0 + 16.0;
    let top_controls = [
        json!({"action":203,"title":"打开笔记","icon":"folder","x":if width<420.0{8}else{12},"y":8,"width":48,"height":48}),
        json!({"action":204,"title":"页面","icon":"rectangle.on.rectangle","x":width-12.0-actions_width,"y":8,"width":48,"height":48}),
        json!({"action":205,"title":if s.session.readonly(){"编辑文档"}else{"完成编辑"},"label":if s.session.readonly(){"编辑"}else{"完成"},"icon":if s.session.readonly(){"pencil"}else{"checkmark"},"group":"mode","x":width-12.0-48.0-8.0-mode_width,"y":8,"width":mode_width,"height":48}),
        json!({"action":206,"title":"更多文档操作","icon":"ellipsis","x":width-60.0,"y":8,"width":48,"height":48}),
    ];
    let brush = brush_metadata(s);
    let pages = s.session.document.pages.iter().enumerate().map(|(i,p)|json!({"index":i,"title":format!("第 {} 页",i+1),"selected":s.page==i,"bookmarked":p["bookmarked"]})).collect::<Vec<_>>();
    let mut value = json!({"title":s.session.document.title(),"status":if s.session.dirty(){"未保存更改"}else{"未修改"},
        "documentEpoch":s.document_epoch(),"revision":s.session.revision(),"dirty":s.session.dirty(),"readonly":s.session.readonly(),
        "canUndo":!s.session.history.past.is_empty(),"canRedo":!s.session.history.future.is_empty(),
        "rotation":s.rotation,"fingerDraw":s.finger_draw,"tool":s.tool,"color":s.active_color(),"opacity":s.active_opacity(),"width":s.active_width(),"pressure":s.pressure,"settings":s.settings,"eraserMode":s.aux["eraser"]["mode"],"selection":s.selection_bounds(),"lassoPath":s.lasso_path(),"pendingText":s.pending_text.is_some(),"tapes":s.capture().page["tapes"],"background":s.capture().page["background"],
        "brush":brush,"style":STYLES[s.style],"viewport":s.viewport,"pageIndex":s.page,"pages":pages,
        "body":{"x":0,"y":64,"width":width,"height":(height-64.0).max(1.0)},
        "topbar":{"x":0,"y":0,"width":width,"height":64},
        "titleFrame":{"x":if width<420.0{64}else{72},"y":10,"width":(width-88.0-actions_width).max(1.0),"height":25},
        "statusFrame":{"x":if width<420.0{64}else{72},"y":35,"width":(width-88.0-actions_width).max(1.0),"height":19},
        "trayOffset":[tray_x-(width-tray_width)/2.0,tray_y-(height-tray_height-14.0)],
        "tray":{"x":tray_x,"y":tray_y,"width":tray_width,"height":tray_height},
        "strip":{"x":107,"y":23.0+(tray_height-30.0-strip_height)/2.0,"width":strip_width,"height":strip_height,"contentWidth":602},
        "grip":{"x":(tray_width-80.0)/2.0,"y":-14,"width":80,"height":44},
        "buttons":buttons,"controls":controls,"topControls":top_controls});
    let selected_element = if s.selected.len() == 1 {
        s.session.document.pages[s.page]["layers"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|l| l["visible"] == true)
            .flat_map(|l| l["elements"].as_array().unwrap())
            .find(|e| e["id"] == s.selected[0])
    } else {
        None
    };
    value["selectionConnectable"] = json!(selected_element
        .is_some_and(|e| matches!(e["shape"].as_str(), Some("rectangle" | "ellipse"))));
    value["selectionText"] = selected_element
        .filter(|e| e["kind"] == "text")
        .map(|e| e["text"].clone())
        .unwrap_or(Value::Null);
    value["sceneCount"] = json!(s.session.document.pages[s.page]["scenes"]
        .as_array()
        .map_or(0, Vec::len));
    value["selectionIDs"] = json!(s.selected);
    value["selectionGesture"] = json!(s.selection_operation());
    value["selectionOrigin"] = json!(s.selection_origin());
    value["guides"] = s.guides();
    value["snapGrid"] = json!(s.snap_grid);
    value["alignGuides"] = json!(s.align_guides);
    value
}

/// Same silhouettes, materials and ink bands as vue/pen-glyph.ts. Text width is a native label.
pub fn pen_svg(style: &str, color: &str) -> Result<String> {
    crate::model::require(
        (STYLES.contains(&style) || ["highlighter", "eraser", "lasso"].contains(&style))
            && crate::model::color(&json!(color)),
    )?;
    // Color syntax is validated by the model; escape for the XML attribute as well.
    let color = color
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('\'', "&apos;");
    let tip = match style {
        "ballpoint" => {
            r##"<polygon points="17,43 21,16 23,16 27,43" fill="url(#barrel)" stroke="#8b929c" stroke-width=".6"/><polygon points="21,16 22,9 23,16" fill="COLOR"/>"##
        }
        "fountain" => {
            r##"<polygon points="22,8 13,29 17,43 27,43 31,29" fill="url(#barrel)" stroke="#9b9ca1" stroke-width=".7"/><path d="M22 10V32" fill="none" stroke="COLOR"/><circle cx="22" cy="31" r="1.8" fill="COLOR"/>"##
        }
        "brush" => {
            r##"<path d="M22 4C22 17 13 29 15 39C17 44 27 44 29 39C32 29 23 18 22 4Z" fill="url(#tip)"/><path d="M19 24C15 32 18 38 19 39M24 27L27 38" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".7"/>"##
        }
        "pencil" => {
            r##"<polygon points="11,42 22,8 33,42" fill="#dfc29d"/><polygon points="18,21 22,8 26,21" fill="COLOR"/>"##
        }
        "watercolor" => {
            r##"<path d="M22 10C20 17 15 27 17 34C18 39 27 39 28 32C29 25 25 16 22 10Z" fill="url(#tip)"/><rect x="16" y="36" width="12" height="11" rx="2" fill="#c3c9d0"/>"##
        }
        "marker" => {
            r##"<rect x="13" y="16" width="18" height="28" rx="5" fill="COLOR"/><rect x="14" y="42" width="16" height="5" fill="url(#barrel)"/>"##
        }
        "crayon" => {
            r##"<polygon points="10,45 15,20 22,16 29,20 34,45" fill="COLOR"/><path d="M12 45H32V58H12Z" fill="COLOR"/>"##
        }
        "reed" => {
            r##"<polygon points="11,43 16,18 31,8 33,43" fill="#d6b27c"/><polygon points="16,18 31,8 29,17 16,26" fill="COLOR"/><path d="M24 17L21 36" fill="none" stroke="COLOR"/>"##
        }
        "spray" => {
            r##"<rect x="16" y="12" width="12" height="10" rx="2" fill="#5b6472"/><circle cx="25" cy="16" r="2" fill="COLOR"/><rect x="11" y="23" width="22" height="24" rx="6" fill="url(#barrel)"/><g fill="COLOR" opacity=".65"><circle cx="28" cy="3" r="1"/><circle cx="31" cy="7" r="1"/><circle cx="36" cy="2" r="1"/><circle cx="38" cy="8" r="1"/></g>"##
        }
        "oil" => {
            r##"<polygon points="10,28 10,9 16,7 28,7 34,9 34,28" fill="url(#tip)"/><path d="M14 10V27M19 9V27M25 9V27M30 10V27" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width=".8"/><rect x="10" y="28" width="24" height="17" rx="2" fill="url(#barrel)"/>"##
        }
        "highlighter" => {
            r##"<polygon points="14,33 14,15 30,8 30,29" fill="COLOR"/><polygon points="14,33 15,44 29,44 30,29" fill="url(#barrel)"/>"##
        }
        "eraser" => {
            r##"<rect x="11" y="14" width="22" height="34" rx="6" fill="#ee929b" stroke="#d88790" stroke-width=".5"/>"##
        }
        "lasso" => {
            r##"<ellipse cx="22" cy="26" rx="12" ry="15" fill="none" stroke="#6d7583" stroke-width="2" stroke-dasharray="2 2"/><path d="M16 37C25 35 24 44 16 46" fill="none" stroke="#6d7583" stroke-width="1.5"/>"##
        }
        _ => unreachable!(),
    };
    let body = if style == "brush" {
        r##"<path d="M14 42H30V120H14Z" fill="#b98442"/><path d="M14 42H18V120H14Z" fill="#ebcd93" opacity=".6"/><path d="M16 48V118M27 48V118" fill="none" stroke="#674520" stroke-opacity=".35" stroke-width=".8"/><path d="M14 60H30M14 98H30" fill="none" stroke="#664720" stroke-width="2"/><rect x="14" y="43" width="16" height="5" fill="#303037"/>"##
    } else if ["pencil", "crayon", "reed"].contains(&style) {
        r##"<path d="M11 42H33V120H11Z" fill="COLOR"/><path d="M11 42H17V120H11Z" fill="#fff" opacity=".4"/><path d="M27 42H33V120H27Z" fill="#000" opacity=".12"/><path d="M17 44V120M27 44V120" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".5"/>"##
    } else {
        r##"<rect x="11" y="43" width="22" height="77" rx="5" fill="url(#barrel)" stroke="#8b929c" stroke-opacity=".32" stroke-width=".6"/><rect x="11" y="65" width="22" height="6" fill="COLOR"/>"##
    };
    let water = if style == "watercolor" {
        r##"<rect x="16" y="79" width="12" height="26" rx="5" fill="COLOR" opacity=".13"/><path d="M16 95Q22 91 28 95" fill="none" stroke="COLOR" stroke-opacity=".45"/>"##
    } else {
        ""
    };
    let body = if ["eraser", "lasso"].contains(&style) {
        r##"<rect x="11" y="43" width="22" height="77" rx="5" fill="url(#barrel)" stroke="#8b929c" stroke-opacity=".32" stroke-width=".6"/>"##
    } else {
        body
    };
    Ok(format!(r##"<svg xmlns="http://www.w3.org/2000/svg" width="44" height="120" viewBox="0 0 44 120"><defs><linearGradient id="barrel" x1="0%" x2="100%" y1="0%" y2="0%"><stop offset="0" stop-color="#c5cbd2"/><stop offset=".25" stop-color="#fff"/><stop offset=".65" stop-color="#f1f3f5"/><stop offset="1" stop-color="#bcc3cc"/></linearGradient><linearGradient id="tip" x1="0%" x2="100%" y1="0%" y2="0%"><stop offset="0" stop-color="COLOR" stop-opacity=".6"/><stop offset=".5" stop-color="COLOR"/><stop offset="1" stop-color="COLOR" stop-opacity=".75"/></linearGradient></defs>{tip}{body}{water}</svg>"##).replace("COLOR", &color))
}
pub fn render_pen(style: &str, color: &str, width: u32, height: u32) -> Result<Vec<u8>> {
    crate::model::require(width > 0 && height > 0 && width <= 256 && height <= 512)?;
    let svg = pen_svg(style, color)?;
    let tree = resvg::usvg::Tree::from_str(&svg, &resvg::usvg::Options::default())
        .map_err(|e| Error::new("RenderError", e.to_string()))?;
    let mut image = resvg::tiny_skia::Pixmap::new(width, height)
        .ok_or_else(|| Error::new("RenderError", "Cannot allocate tool icon."))?;
    // Match SVG xMidYMid meet, as used by the existing 40×82 CSS pen glyph.
    let scale = (width as f32 / 44.0).min(height as f32 / 120.0);
    let transform = resvg::tiny_skia::Transform::from_row(
        scale,
        0.0,
        0.0,
        scale,
        (width as f32 - 44.0 * scale) / 2.0,
        (height as f32 - 120.0 * scale) / 2.0,
    );
    resvg::render(&tree, transform, &mut image.as_mut());
    Ok(image.data().to_vec())
}

/// The shipped mobile settings card, in logical points. OS bindings instantiate these controls.
pub fn settings_layout(s: &Surface, width: f64, height: f64, anchor_x: f64) -> Value {
    let brush = brush_metadata(s);
    let parameters = brush["parameters"].as_array().unwrap();
    let strength = brush["strength"].is_object();
    let supports_pressure = brush["supportsPressure"] == true;
    let panel_width = 360.0_f64.min(width - 24.0).max(44.0);
    let extra = (parameters.len() + usize::from(strength)) as f64 * 58.0;
    let content_height = if supports_pressure { 375.5 } else { 345.5 } + extra;
    let tray = state(s, width, height)["tray"].clone();
    let bottom = tray["y"].as_f64().unwrap() - 12.5;
    let panel_height = content_height.min((bottom - 76.0).max(44.0));
    let frame = json!({"x":(anchor_x-panel_width/2.0).clamp(12.0,(width-panel_width-12.0).max(12.0)),"y":bottom-panel_height,"width":panel_width,"height":panel_height});
    let mut rows = vec![
        json!({"id":"width","label":"笔迹粗细","min":0.5,"max":brush["maxWidth"],"step":0.5,"value":s.active_width(),"x":19,"y":140.5,"width":panel_width-102.0,"height":44,"outputX":panel_width-69.0}),
    ];
    let mut row_y = 198.5;
    if strength {
        rows.push(json!({"id":"opacity","label":brush["strength"]["label"],"min":brush["strength"]["min"].as_f64().unwrap_or(0.05)*100.0,"max":100,"step":1,"value":s.active_opacity()*100.0,"x":19,"y":row_y,"width":panel_width-102.0,"height":44,"outputX":panel_width-69.0}));
        row_y += 58.0;
    }
    for p in parameters {
        rows.push(json!({"id":p["id"],"label":p["label"],"min":p["min"],"max":p["max"],"step":p["step"],"value":s.settings[p["id"].as_str().unwrap()],"x":19,"y":row_y,"width":panel_width-102.0,"height":44,"outputX":panel_width-69.0}));
        row_y += 58.0;
    }
    json!({"frame":frame,"contentHeight":content_height,"rows":rows,"hintY":198.5+extra,"pressureY":228.5+extra,"pressureHintY":284.5+extra,"footerY":314.5+extra-if supports_pressure{0.0}else{30.0},"supportsPressure":supports_pressure})
}

pub fn brush_preview(s: &Surface, width: u32, height: u32) -> Result<Vec<u8>> {
    crate::model::require(width > 0 && height > 0 && width <= 1200 && height <= 300)?;
    if s.tool == "highlighter" {
        let points=(0..65).map(|i|{let t=i as f64/64.0;json!({"x":12.0+216.0*t,"y":30.0+10.0*(t*std::f64::consts::PI*3.0).sin(),"pressure":0.5})}).collect::<Vec<_>>();
        return Ok(crate::render::Renderer::new([]).overlay(&json!({"id":"preview","kind":"stroke","tool":"highlighter","color":s.active_color(),"width":s.active_width(),"opacity":s.active_opacity(),"pressure":false,"points":points}),crate::render::Bounds{x:0.0,y:0.0,width:240.0,height:60.0},width,height)?.data().to_vec());
    }
    let brush = brush_metadata(s);
    let points=(0..65).map(|i| {let t=i as f64/64.0;json!({"x":12.0+216.0*t,"y":30.0+10.0*(t*std::f64::consts::PI*3.0).sin(),"pressure":0.1+0.8*(t*std::f64::consts::PI).sin()})}).collect::<Vec<_>>();
    let stroke = json!({"id":"preview","kind":"stroke","tool":"pen","color":s.color,"width":s.width.min(24.0),"opacity":s.opacity,"pressure":s.pressure,"brushSettings":s.settings,"penStyle":STYLES[s.style],"brushVersion":brush["version"].as_u64().unwrap_or(1),"points":points});
    Ok(crate::render::Renderer::new([])
        .overlay(
            &stroke,
            crate::render::Bounds {
                x: 0.0,
                y: 0.0,
                width: 240.0,
                height: 60.0,
            },
            width,
            height,
        )?
        .data()
        .to_vec())
}

pub fn brush_metadata(s: &Surface) -> Value {
    match s.tool.as_str() {
        "highlighter" => {
            json!({"label":"荧光笔","maxWidth":30,"supportsPressure":false,"parameters":[],"hint":"透明荧光标记","strength":{"label":"不透明度","min":0.05,"step":0.01}})
        }
        "eraser" => {
            json!({"label":"橡皮擦","maxWidth":100,"supportsPressure":false,"parameters":[],"hint":"选择轨迹擦除或整笔擦除"})
        }
        _ => s.session.brushes[STYLES[s.style]].clone(),
    }
}
pub fn pages_layout(s: &Surface, width: f64, height: f64) -> Value {
    let panel_width = 320.0_f64.min(width - 24.0);
    let top = 64.0;
    let state = state(s, width, height);
    let trigger = &state["topControls"][1];
    let x = (trigger["x"].as_f64().unwrap() + 24.0 - panel_width / 2.0)
        .clamp(12.0, (width - panel_width - 12.0).max(12.0));
    let items = if s.rail_tab == "scenes" {
        s.session.document.pages[s.page]["scenes"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .iter()
            .enumerate()
            .map(|(i, p)| json!({"index":i,"title":p["name"],"kind":"scene"}))
            .collect::<Vec<_>>()
    } else {
        state["pages"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|p| !s.bookmarks_only || p["bookmarked"] == true)
            .cloned()
            .collect::<Vec<_>>()
    };
    let height = (216.0 + (items.len() as f64 / 2.0).ceil() * 184.0)
        .min(560.0)
        .min((height - top - 12.0).max(44.0));
    json!({"frame":{"x":x,"y":top,"width":panel_width,"height":height},"tab":s.rail_tab,"bookmarksOnly":s.bookmarks_only,"items":items,"count":s.session.document.pages.len(),"readonly":s.session.readonly()})
}

pub fn render_chrome(action: u32, readonly: bool, width: u32, height: u32) -> Result<Vec<u8>> {
    crate::model::require(width > 0 && height > 0 && width <= 128 && height <= 128)?;
    let key = match action {
        100 => "undo",
        101 => "redo",
        202 => "more",
        203 => "bar:back",
        204 => "bar:pages",
        205 => {
            if readonly {
                "bar:edit"
            } else {
                "bar:check"
            }
        }
        206 => "bar:more",
        207 => "fit",
        208 => "pen",
        209 => "eraser",
        210 => "palette",
        211 => "eyedropper",
        212 => "erasePath",
        213 => "eraseStroke",
        214 => "copy",
        215 => "trash",
        216 => "settings",
        217 => "connector",
        218 => "edit",
        219 => "scene",
        _ => return Err(Error::new("UnknownIcon", "No such chrome icon.")),
    };
    let paths: Value = serde_json::from_str(include_str!("../native-icons.json"))?;
    let content = paths[key]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| format!("<path d=\"{}\"/>", d.as_str().unwrap()))
        .collect::<String>();
    let svg=format!("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#000000\" stroke-width=\"{}\" stroke-linecap=\"round\" stroke-linejoin=\"round\">{content}</svg>",if action>=203&&action<=206{1.8}else{1.7});
    let tree = resvg::usvg::Tree::from_str(&svg, &resvg::usvg::Options::default())
        .map_err(|e| Error::new("RenderError", e.to_string()))?;
    let mut pixels = resvg::tiny_skia::Pixmap::new(width, height)
        .ok_or_else(|| Error::new("RenderError", "Cannot allocate chrome icon."))?;
    resvg::render(
        &tree,
        resvg::tiny_skia::Transform::from_scale(width as f32 / 24.0, height as f32 / 24.0),
        &mut pixels.as_mut(),
    );
    Ok(pixels.data().to_vec())
}
