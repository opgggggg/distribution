const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const source = fs.readFileSync(path.join(__dirname,'../App/Sources/NativeCanvasProjection.swift'),'utf8');
const cases = `
let image: [String:Double] = ["x":-120,"y":40,"width":744,"height":1017]
for size in [CGSize(width:744,height:1017), CGSize(width:1024,height:600), CGSize(width:375,height:700)] {
  for v: [String:Double] in [image, ["x":-85,"y":21,"width":372,"height":508.5], ["x":-900,"y":-200,"width":1488,"height":2034]] {
    let t = NativeCanvasProjection.transform(from:image,to:v,size:size)
    for x in [-500.0, 0, 300, 1000] { for y in [-400.0, 40, 800, 2000] {
      let p = CGPoint(x:(x-image["x"]!)/image["width"]!*Double(size.width), y:(y-image["y"]!)/image["height"]!*Double(size.height)).applying(t)
      let ex = (x-v["x"]!)/v["width"]!*Double(size.width)
      let ey = (y-v["y"]!)/v["height"]!*Double(size.height)
      precondition(abs(Double(p.x)-ex)<0.000001 && abs(Double(p.y)-ey)<0.000001, "camera projection lost the world anchor")
    }}
  }
}
precondition(NativeCanvasProjection.transform(from:image,to:["x":0,"y":0,"width":0,"height":100],size:CGSize(width:100,height:100)).isIdentity)
precondition(NativeCanvasProjection.transform(from:image,to:["x":Double.nan,"y":0,"width":100,"height":100],size:CGSize(width:100,height:100)).isIdentity)
print("PASS native raster projection preserves world coordinates across pans, zooms and window sizes")
precondition(NativeCanvasProjection.canReuse(image,for:image))
let buffered = NativeCanvasProjection.covering(image)
precondition(NativeCanvasProjection.canReuse(buffered,for:image))
precondition(!NativeCanvasProjection.canReuse(image,for:["x":0,"y":0,"width":10000,"height":10000]))
precondition(!NativeCanvasProjection.canReuse(image,for:["x":0,"y":100,"width":50,"height":50]))
precondition(!NativeCanvasProjection.canReuse(image,for:["x":Double.nan,"y":0,"width":100,"height":100]))
let limit: [String:Double] = ["x":1e9,"y":1e9,"width":1e7,"height":1e7]
precondition(NativeCanvasProjection.covering(limit)==limit)
print("PASS buffered raster reuse respects coverage, detail and camera limits")
`;
const result = spawnSync('swift',['-'],{input:source+cases,encoding:'utf8',timeout:60000});
if(result.stdout) process.stdout.write(result.stdout);
if(result.stderr) process.stderr.write(result.stderr);
if(result.status!==0) throw result.error ?? new Error('Camera projection assertions failed');
