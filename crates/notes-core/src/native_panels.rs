//! Panel inventory shared by native shells; widget bindings only execute these projected commands.
use crate::{native::Surface, Error, Result};
use serde_json::{json, Value};
fn choice(title: &str, command: Value) -> Value {
    json!({"type":"choice","title":title,"command":command})
}
fn panel(title: &str, name: &str) -> Value {
    choice(title, json!({"op":"panel","name":name}))
}
fn slider(title: &str, field: &str, value: f64, min: f64, max: f64, command: Value) -> Value {
    json!({"type":"slider","title":title,"field":field,"value":value,"min":min,"max":max,"command":command})
}
pub fn project(s: &Surface, name: &str, width: f64, height: f64) -> Result<Value> {
    if name == "tip" {
        return tip(s, width, height);
    }
    let page = &s.session.document.pages[s.page];
    let mut rows = vec![];
    let mut columns = 2;
    let title;
    match name {
        "tip" => {
            title = "快捷工具";
            rows.extend([
                choice("画笔", json!({"op":"tool","tool":"pen","close":true})),
                choice("橡皮擦", json!({"op":"tool","tool":"eraser","close":true})),
                choice("取色", json!({"host":"sample"})),
                choice("颜色", json!({"host":"colorPicker"})),
                choice("撤销", json!({"op":"action","action":100,"close":true})),
                choice("重做", json!({"op":"action","action":101,"close":true})),
            ]);
        }
        "eraser" => {
            title = "画笔设置";
            for (label, mode, hint, icon) in [
                ("轨迹擦除", "path", "只擦掉经过的部分", 212),
                ("整笔擦除", "stroke", "碰到笔迹就整笔删除", 213),
            ] {
                let mut r = choice(label, json!({"op":"eraserMode","mode":mode}));
                r["type"] = json!("eraserMode");
                r["hint"] = json!(hint);
                r["icon"] = json!(icon);
                r["selected"] = json!(s.aux["eraser"]["mode"] == mode);
                rows.push(r);
            }
            rows.push(slider(
                "橡皮大小",
                "value",
                s.active_width(),
                0.5,
                100.0,
                json!({"op":"settings","opacity":1,"pressure":false,"settings":{}}),
            ));
            let widths = if s.aux["eraser"]["mode"] == "path" {
                [8, 20, 40]
            } else {
                [5, 10, 20]
            };
            for w in widths {
                let mut r = choice(
                    &format!("{w} pt"),
                    json!({"op":"settings","value":w,"opacity":1,"pressure":false,"settings":{}}),
                );
                r["type"] = json!("quick");
                r["selected"] = json!(s.active_width() == w as f64);
                rows.push(r);
            }
            rows.push(json!({"type":"section","title":"仅擦除笔迹，不影响图片和背景。"}));
        }
        "tools" => {
            title = "更多工具";
            rows.extend([
                choice("插入图片", json!({"host":"photo"})),
                choice("旋转画布 90°", json!({"host":"rotate"})),
                choice("文字", json!({"op":"tool","tool":"text","close":true})),
                panel("形状", "shapes"),
                choice("移动视图", json!({"op":"tool","tool":"hand","close":true})),
                choice("画笔设置", json!({"host":"ink"})),
                panel("纸张", "paper"),
                panel("美纹纸", "tape"),
                panel("图层", "layers"),
                panel("视图选项", "view"),
                choice("复位工具栏", json!({"op":"moveTray","x":0,"y":0})),
            ]);
            if !s.selected.is_empty() {
                rows.insert(0, panel("所选内容", "selection"));
            }
            if page["background"].is_object() {
                rows.insert(1, panel("调整背景", "background"));
                rows.insert(2, choice("从背景取色", json!({"host":"sampleBackground"})));
            }
        }
        "document" => {
            title = "文档选项";
            rows.extend([
                choice("保存副本", json!({"host":"save"})),
                choice("打开笔记", json!({"host":"open"})),
                choice("导出为图片", json!({"host":"exportPNG"})),
                choice("导出为 PDF", json!({"host":"exportPDF"})),
                choice(
                    if page["bookmarked"] == true {
                        "取消书签"
                    } else {
                        "添加书签"
                    },
                    json!({"op":"bookmark"}),
                ),
                panel("页面操作", "page"),
                panel("视图选项", "view"),
            ]);
        }
        "page" => {
            title = "页面操作";
            rows.extend([
                choice("添加页面", json!({"op":"addPage"})),
                choice("添加书签", json!({"op":"bookmark"})),
                choice(
                    "清空本页",
                    json!({"op":"change","kind":"clearPage","confirm":true}),
                ),
                choice(
                    "删除本页",
                    json!({"op":"change","kind":"deletePage","confirm":true}),
                ),
            ]);
        }
        "shapes" => {
            title = "形状";
            columns = 3;
            rows.extend([
                choice("直线", json!({"op":"tool","tool":"line","close":true})),
                choice("矩形", json!({"op":"tool","tool":"rectangle","close":true})),
                choice("椭圆", json!({"op":"tool","tool":"ellipse","close":true})),
            ]);
        }
        "paper" => {
            title = "纸张";
            columns = 4;
            rows.push(json!({"type":"section","title":"纸张模板"}));
            for (label, id) in [
                ("空白", "plain"),
                ("横线", "ruled"),
                ("方格", "grid"),
                ("点阵", "dotted"),
            ] {
                let mut r = choice(label, json!({"op":"change","kind":"paper","paper":id}));
                r["paper"] = json!(id);
                r["selected"] = json!(page["paper"] == id);
                rows.push(r)
            }
            rows.push(json!({"type":"section","title":"纸张颜色"}));
            for c in ["#ffffff", "#fffdf7", "#eef5fc", "#202b3f"] {
                rows.push(json!({"type":"swatch","color":c,"selected":page["color"]==c,"command":{"op":"change","kind":"pageColor","color":c}}));
            }
        }
        "layers" => {
            title = "图层";
            columns = 1;
            for (i, l) in page["layers"].as_array().unwrap().iter().enumerate() {
                let mut r = choice(
                    l["name"].as_str().unwrap_or("图层"),
                    json!({"op":"change","kind":"layer","action":"toggle","index":i}),
                );
                r["type"] = json!("layer");
                r["visible"] = l["visible"].clone();
                r["command"] = json!({"op":"change","kind":"layer","action":"select","index":i});
                r["toggle"] = json!({"op":"change","kind":"layer","action":"toggle","index":i});
                r["selected"] = json!(s.active_layer == i);
                rows.push(r)
            }
            rows.push(choice(
                "添加图层",
                json!({"op":"change","kind":"layer","action":"add"}),
            ));
        }
        "view" => {
            title = "视图选项";
            for (label, value, command) in [
                (
                    "网格吸附",
                    s.snap_grid,
                    json!({"op":"guides","grid":!s.snap_grid}),
                ),
                (
                    "对齐辅助线",
                    s.align_guides,
                    json!({"op":"guides","align":!s.align_guides}),
                ),
            ] {
                let mut row = choice(label, command);
                row["selected"] = json!(value);
                rows.push(row);
            }
            rows.extend([
                choice("适合页面", json!({"op":"action","action":102})),
                choice("旋转画布 90°", json!({"host":"rotate"})),
                choice("手指绘画", json!({"host":"finger"})),
                choice(
                    if page["infinite"] == false {
                        "无限画布"
                    } else {
                        "分页画布"
                    },
                    json!({"op":"change","kind":"infinite","value":page["infinite"]==false}),
                ),
                choice(
                    "全选",
                    json!({"op":"selection","action":"selectAll","close":true}),
                ),
            ]);
        }
        "selection" => {
            title = "排列选中内容";
            let colors = [
                "#222b40", "#4f46e5", "#2563eb", "#dc3658", "#15803d", "#c77d15", "#facc15",
                "#ffffff",
            ];
            for color in colors {
                rows.push(json!({"type":"swatch","color":color,"selected":s.active_color().eq_ignore_ascii_case(color),"command":{"op":"color","color":color}}));
            }
            rows.push(choice("自定义颜色", json!({"host":"colorPicker"})));
            let selected_width = page["layers"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|l| l["visible"] == true)
                .flat_map(|l| l["elements"].as_array().unwrap())
                .find(|e| {
                    e["kind"] == "stroke" && s.selected.iter().any(|id| e["id"] == id.as_str())
                })
                .and_then(|e| e["width"].as_f64())
                .unwrap_or(s.active_width());
            let arranged_count = page["layers"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|l| l["visible"] == true)
                .flat_map(|l| l["elements"].as_array().unwrap())
                .filter(|e| {
                    e.get("connector").is_none()
                        && s.selected.iter().any(|id| e["id"] == id.as_str())
                })
                .count();
            rows.push(slider(
                "笔迹粗细",
                "value",
                selected_width,
                0.5,
                100.0,
                json!({"op":"change","kind":"selectionWidth"}),
            ));
            for (label, action) in [
                ("左对齐", "left"),
                ("水平居中", "center"),
                ("顶部对齐", "top"),
                ("水平等距", "horizontal"),
                ("垂直等距", "vertical"),
            ] {
                let mut row = choice(
                    label,
                    json!({"op":"change","kind":"selectionArrange","action":action}),
                );
                row["available"] = json!(
                    arranged_count
                        >= if ["horizontal", "vertical"].contains(&action) {
                            3
                        } else {
                            2
                        }
                );
                rows.push(row);
            }
            rows.push(choice(
                "缩小选中内容",
                json!({"op":"change","kind":"selectionScale","value":0.9}),
            ));
            rows.push(choice(
                "放大选中内容",
                json!({"op":"change","kind":"selectionScale","value":1.1}),
            ));
        }
        "tape" => {
            title = "美纹纸";
            columns = 1;
            rows.extend([
                choice("调整位置", json!({"op":"tool","tool":"tape","close":true})),
                choice(
                    "放置美纹纸",
                    json!({"op":"change","kind":"tape","action":"add"}),
                ),
                choice(
                    "移除全部美纹纸",
                    json!({"op":"change","kind":"tape","action":"clear"}),
                ),
            ]);
            for (i, t) in page["tapes"].as_array().into_iter().flatten().enumerate() {
                rows.push(slider(
                    &format!("美纹纸 {} 角度", i + 1),
                    "angle",
                    t["angle"].as_f64().unwrap(),
                    -180.0,
                    180.0,
                    json!({"op":"change","kind":"tape","action":"update","index":i}),
                ));
                rows.push(slider(
                    "宽度",
                    "width",
                    t["width"].as_f64().unwrap(),
                    40.0,
                    1000.0,
                    json!({"op":"change","kind":"tape","action":"update","index":i}),
                ));
            }
        }
        "background" => {
            title = "背景图片";
            columns = 1;
            if let Some(b) = page.get("background") {
                rows.push(choice(
                    "拖动背景位置",
                    json!({"op":"tool","tool":"background","close":true}),
                ));
                rows.push(slider(
                    "不透明度",
                    "opacity",
                    b["opacity"].as_f64().unwrap(),
                    0.05,
                    1.0,
                    json!({"op":"change","kind":"background"}),
                ));
                rows.push(slider(
                    "旋转角度",
                    "angle",
                    b["angle"].as_f64().unwrap_or(0.0),
                    -180.0,
                    180.0,
                    json!({"op":"change","kind":"background"}),
                ));
                rows.extend([
                    choice(
                        "放大",
                        json!({"op":"change","kind":"background","scale":1.2}),
                    ),
                    choice(
                        "缩小",
                        json!({"op":"change","kind":"background","scale":0.833333333}),
                    ),
                    choice("从背景取色", json!({"host":"sampleBackground"})),
                    choice(
                        "移除背景",
                        json!({"op":"change","kind":"background","action":"remove"}),
                    ),
                ]);
            }
        }
        "colors" => {
            title = "选择颜色";
            for color in [
                "#222b40", "#4f46e5", "#2563eb", "#dc3658", "#15803d", "#c77d15", "#facc15",
                "#ffffff",
            ] {
                rows.push(json!({"type":"swatch","color":color,"title":color,"selected":s.active_color().eq_ignore_ascii_case(color),"command":{"op":"color","color":color,"opacity":s.active_opacity()}}));
            }
            rows.push(json!({"type":"section","title":"画布颜色"}));
            let mut colors: Vec<String> = vec![];
            for l in page["layers"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|l| l["visible"] == true)
            {
                for e in l["elements"].as_array().unwrap() {
                    if e["kind"] == "image"
                        || (e["kind"] == "stroke" && e["opacity"].as_f64().unwrap_or(1.0) <= 0.0)
                        || (e["kind"] == "text"
                            && e["text"].as_str().unwrap_or("").trim().is_empty())
                    {
                        continue;
                    }
                    if let Some(color) = e["color"].as_str() {
                        let color = color.to_ascii_lowercase();
                        if !colors.contains(&color) {
                            colors.push(color)
                        }
                    }
                }
            }
            for color in colors {
                rows.push(json!({"type":"swatch","color":color,"title":color,"selected":s.active_color().eq_ignore_ascii_case(&color),"command":{"op":"color","color":color,"opacity":s.active_opacity()}}));
            }
            rows.push(json!({"type":"section","title":"自定义颜色"}));
            rows.push(choice("选择颜色", json!({"host":"colorPicker"})));
            rows.push(choice("从画布取色", json!({"host":"sample"})));
        }
        _ => return Err(Error::new("UnknownPanel", "No such native panel.")),
    }
    let cw = (width - 24.0).min(360.0).max(100.0);
    let mut y: f64 = 61.0;
    let mut col = 0;
    for row in &mut rows {
        if row["type"] == "section" {
            if col != 0 {
                y += 44.0;
                col = 0;
            }
            row["frame"] = json!({"x":17,"y":y,"width":cw-34.0,"height":24});
            y += 28.0;
        } else if row["type"] == "swatch" {
            let count = ((cw - 34.0) / 44.0).floor() as usize;
            row["frame"] = json!({"x":17.0+col as f64*44.0,"y":y,"width":44,"height":44});
            col += 1;
            if col >= count.max(1) {
                col = 0;
                y += 44.0;
            }
        } else if row["type"] == "slider" {
            if col != 0 {
                y += 52.0;
                col = 0
            }
            row["frame"] = json!({"x":17,"y":y,"width":cw-34.0,"height":80});
            y += 88.0;
        } else {
            let count = if row["type"] == "quick" { 3 } else { columns };
            let h = if row.get("paper").is_some() {
                124.0
            } else if row["type"] == "eraserMode" {
                112.0
            } else {
                44.0
            };
            let w = (cw - 34.0 - (count - 1) as f64 * 8.0) / count as f64;
            row["frame"] = json!({"x":17.0+col as f64*(w+8.0),"y":y,"width":w,"height":h});
            col += 1;
            if col == count {
                col = 0;
                y += h + if row["type"] == "eraserMode" {
                    20.0
                } else {
                    8.0
                };
            }
        }
    }
    if col != 0 {
        y += 52.0
    }
    for row in &mut rows {
        let command = &row["command"];
        let op = command["op"].as_str().unwrap_or("");
        let host = command["host"].as_str().unwrap_or("");
        let mutating = ["change", "bookmark", "addPage", "insertText", "selection"].contains(&op)
            || op == "action" && [100, 101].contains(&command["action"].as_u64().unwrap_or(0))
            || host == "photo";
        row["enabled"] = json!(
            !(s.session.readonly() && mutating)
                && row["available"] != false
                && !(command["kind"] == "deletePage" && s.session.document.pages.len() <= 1)
        );
    }
    let content_height = y + 60.0;
    let tray = crate::native_ui::state(s, width, height)["tray"].clone();
    let bottom = if s.session.readonly() {
        height - 14.0
    } else {
        tray["y"].as_f64().unwrap() - 12.5
    };
    let h = content_height.min((bottom - 76.0).max(44.0));
    Ok(
        json!({"name":name,"title":title,"frame":{"x":12,"y":bottom-h,"width":cw,"height":h},"contentHeight":content_height,"footerY":y,"rows":rows}),
    )
}

fn tip(s: &Surface, width: f64, height: f64) -> Result<Value> {
    let w = 268.0_f64.min(width - 16.0);
    let gap = 8.0;
    let col = (w - 16.0 - 4.0 * gap) / 5.0;
    let mut rows = vec![];
    for (i, (title, icon, command, enabled, selected)) in [
        (
            "画笔",
            208,
            json!({"op":"tool","tool":"pen","close":true}),
            true,
            ["pen", "highlighter"].contains(&s.tool.as_str()),
        ),
        (
            "橡皮擦",
            209,
            json!({"op":"tool","tool":"eraser","close":true}),
            true,
            s.tool == "eraser",
        ),
        ("更多颜色", 210, json!({"host":"colors"}), true, false),
        (
            "撤销",
            100,
            json!({"op":"action","action":100,"close":true}),
            !s.session.history.past.is_empty(),
            false,
        ),
        (
            "重做",
            101,
            json!({"op":"action","action":101,"close":true}),
            !s.session.history.future.is_empty(),
            false,
        ),
    ]
    .into_iter()
    .enumerate()
    {
        rows.push(json!({"type":"icon","title":title,"icon":icon,"command":command,"enabled":enabled,"selected":selected,"frame":{"x":8.0+i as f64*(col+gap),"y":8,"width":col,"height":44}}));
    }
    for (i, color) in ["#222b40", "#2563eb", "#15803d", "#facc15", "#dc3658"]
        .into_iter()
        .enumerate()
    {
        rows.push(json!({"type":"swatch","color":color,"selected":s.active_color().eq_ignore_ascii_case(color),"command":{"op":"color","color":color,"opacity":s.active_opacity(),"close":true},"frame":{"x":8.0+i as f64*(col+gap),"y":60,"width":col,"height":44}}));
    }
    let brush = crate::native_ui::brush_metadata(s);
    let widths = if s.tool == "highlighter" {
        json!([8, 14, 22])
    } else if s.tool == "eraser" {
        if s.aux["eraser"]["mode"] == "path" {
            json!([8, 20, 40])
        } else {
            json!([5, 10, 20])
        }
    } else {
        brush.get("quickWidths").cloned().unwrap_or_else(|| {
            let d = brush["defaults"]["width"].as_f64().unwrap_or(2.0);
            json!([
                d / 2.0,
                d,
                (d * 2.0).min(brush["maxWidth"].as_f64().unwrap_or(24.0))
            ])
        })
    };
    let cw = (w - 32.0) / 3.0;
    for (i, value) in widths.as_array().unwrap().iter().enumerate() {
        rows.push(json!({"type":"width","title":format!("{} pt",value),"value":value,"selected":s.active_width()==value.as_f64().unwrap(),"command":{"op":"settings","value":value,"opacity":s.active_opacity(),"pressure":s.pressure,"settings":if s.tool=="pen"{json!(s.settings)}else{json!({})},"close":true},"frame":{"x":8.0+i as f64*(cw+8.0),"y":121,"width":cw,"height":44}}));
    }
    rows.push(json!({"type":"icon","icon":211,"title":"取色","label":"取色","command":{"host":"sample"},"frame":{"x":8,"y":173,"width":w-16.0,"height":44}}));
    Ok(
        json!({"name":"tip","title":"快捷工具","compact":true,"frame":{"x":8,"y":(height-228.0).max(72.0),"width":w,"height":225},"contentHeight":225,"rows":rows}),
    )
}

pub fn library(entries: &Value, width: f64, height: f64) -> Result<Value> {
    let entries = entries
        .as_array()
        .ok_or_else(|| Error::new("InvalidInput", "Invalid library entries."))?;
    crate::model::require(
        entries.len() <= 10000
            && entries.iter().all(|e| {
                crate::model::text(&e["id"], 1, 1024) && crate::model::text(&e["title"], 0, 1024)
            }),
    )?;
    let columns = ((width - 24.0) / 204.0).floor().max(1.0) as usize;
    let card = (width - 48.0 - (columns - 1) as f64 * 24.0) / columns as f64;
    Ok(
        json!({"title":"我的文件","columns":columns,"cardWidth":card.max(44.0),"cardHeight":card.max(44.0),"gapX":24,"gapY":28,"grid":{"x":24,"y":240,"width":(width-48.0).max(44.0),"height":(height-240.0).max(44.0)},"items":entries}),
    )
}
