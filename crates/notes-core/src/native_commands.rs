//! Native document commands used by the shared action panels and OS photo/text adapters.
use crate::{model, native::Surface, Error, Result};
use serde_json::{json, Value};
impl Surface {
    pub fn change(&mut self, v: &Value) -> Result<()> {
        match v["kind"].as_str().unwrap_or("") {
            "paper" => {
                let paper = v["paper"].as_str().unwrap_or("");
                model::require(["plain", "grid", "ruled", "dotted"].contains(&paper))?;
                self.edit_page(|p| p["paper"] = json!(paper))
            }
            "pageColor" => {
                model::require(model::color(&v["color"]))?;
                self.edit_page(|p| p["color"] = v["color"].clone())
            }
            "infinite" => {
                let value = v["value"]
                    .as_bool()
                    .ok_or_else(|| Error::new("InvalidInput", "Invalid canvas mode."))?;
                self.edit_page(|p| p["infinite"] = json!(value))
            }
            "clearPage" => self.edit_page(|p| {
                for l in p["layers"].as_array_mut().unwrap() {
                    l["elements"] = json!([])
                }
            }),
            "deletePage" => {
                model::require(self.session.document.pages.len() > 1)?;
                let mut doc = self.session.document.value();
                doc["pages"].as_array_mut().unwrap().remove(self.page);
                self.session.replace(doc, self.session.revision())?;
                self.select_page(self.page.min(self.session.document.pages.len() - 1))
            }
            "layer" => {
                let action = v["action"].as_str().unwrap_or("");
                let index = v["index"].as_u64().unwrap_or(0) as usize;
                if action == "select" {
                    model::require(
                        index
                            < self.session.document.pages[self.page]["layers"]
                                .as_array()
                                .unwrap()
                                .len(),
                    )?;
                    self.camera(self.viewport)?;
                    self.active_layer = index;
                    return Ok(());
                }
                let id = self.fresh_id("layer");
                model::require(["add", "toggle", "delete", "rename"].contains(&action))?;
                let mut page = self.session.document.pages[self.page].external();
                let layers = page["layers"].as_array_mut().unwrap();
                if action == "add" {
                    layers.push(json!({"id":id,"name":format!("图层 {}",layers.len()+1),"visible":true,"elements":[]}));
                } else {
                    model::require(index < layers.len())?;
                    match action {
                        "toggle" => {
                            layers[index]["visible"] = json!(layers[index]["visible"] != true)
                        }
                        "delete" => {
                            model::require(layers.len() > 1)?;
                            layers.remove(index);
                        }
                        _ => {
                            model::require(model::text(&v["name"], 1, 256))?;
                            layers[index]["name"] = v["name"].clone();
                        }
                    }
                }
                self.edit_page(|p| *p = page.clone())?;
                if action == "add" {
                    self.active_layer = page["layers"].as_array().unwrap().len() - 1;
                } else {
                    self.active_layer = self
                        .active_layer
                        .min(page["layers"].as_array().unwrap().len() - 1);
                }
                let layers = page["layers"].as_array().unwrap();
                if layers[self.active_layer]["visible"] != true {
                    self.active_layer = layers
                        .iter()
                        .position(|l| l["visible"] == true)
                        .unwrap_or(0);
                }
                Ok(())
            }
            "tape" => {
                let action = v["action"].as_str().unwrap_or("");
                model::require(["add", "update", "delete", "clear"].contains(&action))?;
                let index = v["index"].as_u64().unwrap_or(0) as usize;
                let id = self.fresh_id("tape");
                let view = self.viewport;
                let mut page = self.session.document.pages[self.page].external();
                if !page["tapes"].is_array() {
                    page["tapes"] = json!([])
                }
                let tapes = page["tapes"].as_array_mut().unwrap();
                match action{"add"=>tapes.push(json!({"id":id,"x":view.x+view.width*0.25,"y":view.y+view.height*0.4,"width":(view.width*0.5).max(4.0).min(5000.0),"height":40,"angle":-15})),"clear"=>tapes.clear(),_=>{model::require(index<tapes.len())?;if action=="delete"{tapes.remove(index);}else{for key in ["x","y","width","height","angle"]{if v.get(key).is_some(){tapes[index][key]=v[key].clone()}}}}}
                self.edit_page(|p| *p = page.clone())
            }
            "photo" => {
                let background = v["background"] == true;
                let id = self.fresh_id("photo");
                let w = v["pixelWidth"].as_f64().unwrap_or(0.0);
                let h = v["pixelHeight"].as_f64().unwrap_or(0.0);
                model::require(
                    w >= 1.0 && h >= 1.0 && w <= 8192.0 && h <= 8192.0 && w * h <= 16777216.0,
                )?;
                let scale = (self.viewport.width * 0.7 / w)
                    .min(self.viewport.height * 0.7 / h)
                    .min(1.0);
                let w = w * scale;
                let h = h * scale;
                let photo = json!({"id":id,"kind":"image","src":v["src"],"x":self.viewport.x+(self.viewport.width-w)/2.0,"y":self.viewport.y+(self.viewport.height-h)/2.0,"width":w,"height":h,"angle":0,"opacity":if background{0.5}else{1.0}});
                model::photo(&photo)?;
                if !background {
                    model::require(
                        self.session.document.pages[self.page]["layers"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .any(|l| l["visible"] == true),
                    )?;
                }
                let layer_index = self.drawing_layer().unwrap_or(0);
                self.edit_page(|p| {
                    if background {
                        p["background"] = photo.clone()
                    } else {
                        p["layers"][layer_index]["elements"]
                            .as_array_mut()
                            .unwrap()
                            .push(photo.clone());
                    }
                })?;
                if !background {
                    self.set_tool("lasso")?;
                    self.selected = vec![id]
                }
                Ok(())
            }
            "background" => {
                let mut page = self.session.document.pages[self.page].external();
                model::require(page["background"].is_object())?;
                if v["action"] == "remove" {
                    page.as_object_mut().unwrap().remove("background");
                } else {
                    let b = &mut page["background"];
                    if let Some(scale) = v["scale"].as_f64() {
                        model::require(scale.is_finite() && scale > 0.01 && scale <= 20.0)?;
                        let w = b["width"].as_f64().unwrap();
                        let h = b["height"].as_f64().unwrap();
                        b["x"] = json!(b["x"].as_f64().unwrap() + w * (1.0 - scale) / 2.0);
                        b["y"] = json!(b["y"].as_f64().unwrap() + h * (1.0 - scale) / 2.0);
                        b["width"] = json!(w * scale);
                        b["height"] = json!(h * scale);
                    }
                    for key in ["x", "y", "width", "height", "angle", "opacity"] {
                        if v.get(key).is_some() {
                            b[key] = v[key].clone();
                        }
                    }
                }
                self.edit_page(|p| *p = page.clone())
            }
            "selectionWidth" => {
                let width = v["value"]
                    .as_f64()
                    .filter(|n| n.is_finite() && (0.5..=100.0).contains(n))
                    .ok_or_else(|| Error::new("InvalidInput", "Invalid selection width."))?;
                let ids = self.selected.clone();
                self.edit_page(|p| {
                    for l in p["layers"].as_array_mut().unwrap() {
                        for e in l["elements"].as_array_mut().unwrap() {
                            if e["kind"] == "stroke" && ids.iter().any(|id| e["id"] == id.as_str())
                            {
                                e["width"] = json!(width);
                            }
                        }
                    }
                })
            }
            "selectionScale" => {
                let scale = v["value"]
                    .as_f64()
                    .filter(|n| n.is_finite() && (0.1..=10.0).contains(n))
                    .ok_or_else(|| Error::new("InvalidInput", "Invalid selection scale."))?;
                let b = self
                    .selection_bounds()
                    .ok_or_else(|| Error::new("InvalidInput", "No selection."))?;
                let page = &self.session.document.pages[self.page];
                let sx = if page["infinite"] != false {
                    scale
                } else {
                    scale.min((page["width"].as_f64().unwrap() - b.x) / b.width.max(0.001))
                };
                let sy = if page["infinite"] != false {
                    scale
                } else {
                    scale.min((page["height"].as_f64().unwrap() - b.y) / b.height.max(0.001))
                };
                model::require(sx > 0.0 && sy > 0.0)?;
                let ids = self.selected.clone();
                self.edit_page(|p| crate::native_edit::transform(p, &ids, b, 0.0, 0.0, sx, sy))
            }
            "selectionArrange" => {
                let action = v["action"].as_str().unwrap_or("");
                let mut page = self.session.document.pages[self.page].external();
                crate::native_edit::arrange(&mut page, &self.selected, action)?;
                self.edit_page(|p| *p = page.clone())
            }
            "selectionText" => {
                model::require(self.selected.len() == 1 && model::text(&v["text"], 1, 100000))?;
                let id = self.selected[0].clone();
                let exists = self.session.document.pages[self.page]["layers"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .flat_map(|l| l["elements"].as_array().unwrap())
                    .any(|e| e["id"] == id && e["kind"] == "text");
                model::require(exists)?;
                self.edit_page(|p| {
                    for l in p["layers"].as_array_mut().unwrap() {
                        for e in l["elements"].as_array_mut().unwrap() {
                            if e["id"] == id {
                                e["text"] = v["text"].clone();
                            }
                        }
                    }
                })
            }
            "selectionColor" => {
                model::require(model::color(&v["color"]))?;
                let opacity = v
                    .get("opacity")
                    .map(|value| {
                        value
                            .as_f64()
                            .filter(|n| n.is_finite() && (0.0..=1.0).contains(n))
                            .ok_or_else(|| Error::new("InvalidInput", "Invalid selection opacity."))
                    })
                    .transpose()?;
                let ids = self.selected.clone();
                self.edit_page(|p| {
                    for l in p["layers"].as_array_mut().unwrap() {
                        for e in l["elements"].as_array_mut().unwrap() {
                            if e["kind"] != "image" && ids.iter().any(|id| e["id"] == id.as_str()) {
                                e["color"] = v["color"].clone();
                                if e["kind"] == "stroke" {
                                    if let Some(opacity) = opacity {
                                        e["opacity"] = json!(opacity);
                                    }
                                }
                            }
                        }
                    }
                })
            }
            _ => Err(Error::new(
                "UnknownAction",
                "Unsupported native document change.",
            )),
        }
    }
}
pub fn tape_polygons(page: &Value) -> Vec<Value> {
    page["tapes"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|t| {
            let (cx, cy, w, h, a) = (
                t["x"].as_f64().unwrap(),
                t["y"].as_f64().unwrap(),
                t["width"].as_f64().unwrap() / 2.0,
                t["height"].as_f64().unwrap() / 2.0,
                t["angle"].as_f64().unwrap().to_radians(),
            );
            json!([(-w, -h), (w, -h), (w, h), (-w, h)]
                .iter()
                .map(|(x, y)| json!({"x":cx+x*a.cos()-y*a.sin(),"y":cy+x*a.sin()+y*a.cos()}))
                .collect::<Vec<_>>())
        })
        .collect()
}
