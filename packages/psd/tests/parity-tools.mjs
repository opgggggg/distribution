import test from "node:test";
import assert from "node:assert/strict";
import { loadPsd, makeDocument, rasterLayer, solidBitmap, pixelAt } from "./helpers.mjs";
const p = await loadPsd();
function session(bitmap = solidBitmap(p, 16, 16, 120, 80, 30)) {
	return new p.PsdEditorSession(
		makeDocument(p, [rasterLayer(p, "L1", "Pixels", { bitmap, left: 8, top: 8 })], {
			width: 32,
			height: 32,
		}),
	);
}
test("motion blur expands layer bounds, preserves hue through alpha, and undoes", () => {
	const s = session(solidBitmap(p, 1, 1, 255, 0, 0));
	s.apply([
		{
			type: "filter.apply",
			layerId: "L1",
			kind: "motion-blur",
			params: { distance: 8, angle: 0 },
		},
	]);
	const l = s.peekDocument().layers[0];
	assert.ok(l.left < 8);
	assert.ok(l.bitmap.width > 1);
	let seen = 0;
	for (let i = 0; i < l.bitmap.data.length; i += 4)
		if (l.bitmap.data[i + 3]) {
			seen++;
			assert.equal(l.bitmap.data[i], 255);
			assert.equal(l.bitmap.data[i + 1], 0);
		}
	assert.ok(seen > 1);
	s.undo();
	assert.equal(s.peekDocument().layers[0].bitmap.width, 1);
});
test("blur selection constrains expanded pixels, lens identity and distortion are alpha-correct", () => {
	const s = session();
	s.apply([
		{ type: "selection.set", shape: "rectangle", x: 12, y: 12, width: 4, height: 4 },
		{ type: "filter.apply", layerId: "L1", kind: "gaussian-blur", params: { radius: 2 } },
	]);
	const l = s.peekDocument().layers[0];
	assert.equal(pixelAt(l.bitmap, 8 - l.left, 8 - l.top)[3], 255);
	assert.equal(pixelAt(l.bitmap, 7 - l.left, 8 - l.top)[3], 0);
	const b = solidBitmap(p, 16, 16, 255, 0, 0);
	assert.deepEqual(p.applyFilter(b, "lens-correction", { distortion: 0 }), b);
	const out = p.applyFilter(b, "lens-correction", { distortion: -100 });
	assert.ok(out.data[3] < 255);
	for (let i = 0; i < out.data.length; i += 4)
		if (out.data[i + 3]) assert.equal(out.data[i], 255);
});
test("rounded rectangle leaves transparent corners with filled center and supports undo", () => {
	const s = session(solidBitmap(p, 16, 16, 0, 0, 0, 0));
	s.apply([
		{
			type: "shape.apply",
			layerId: "L1",
			shape: "rounded-rectangle",
			x: 8,
			y: 8,
			width: 16,
			height: 16,
			cornerRadius: 6,
			fill: { r: 255, g: 0, b: 0 },
		},
	]);
	const l = s.peekDocument().layers[0];
	assert.equal(pixelAt(l.bitmap, 8 - l.left, 8 - l.top)[3], 0);
	assert.deepEqual(pixelAt(l.bitmap, 16 - l.left, 16 - l.top), [255, 0, 0, 255]);
	s.undo();
	assert.ok(s.peekDocument().layers[0].bitmap.data.every((v) => v === 0));
});
test("projective distortion preserves source through PSD save and subsequent affine transforms", () => {
	const s = session(),
		source = s.peekDocument().layers[0].bitmap;
	const corners = [
		{ x: 10, y: 8 },
		{ x: 23, y: 10 },
		{ x: 24, y: 24 },
		{ x: 8, y: 24 },
	];
	s.apply([
		{ type: "layer.mask", layerId: "L1", operation: "reveal-all" },
		{ type: "transform.apply", layerId: "L1", operation: "distort", corners },
	]);
	const warped = s.peekDocument().layers[0];
	assert.equal(warped.sourceTransform.source, source);
	assert.equal(warped.sourceTransform.matrix.length, 9);
	assert.ok(warped.mask);
	const r = p.readPsd(p.writePsd(s.peekDocument()));
	assert.equal(r.layers[0].sourceTransform.matrix.length, 9);
	assert.deepEqual(r.layers[0].sourceTransform.source.data, source.data);
	assert.deepEqual(p.composePsdDocument(r).data, p.composePsdDocument(s.peekDocument()).data);
	const after = new p.PsdEditorSession(r);
	after.apply([
		{ type: "transform.apply", layerId: r.layers[0].id, operation: "rotate", degrees: 30 },
	]);
	assert.deepEqual(after.peekDocument().layers[0].sourceTransform.source.data, source.data);
	s.undo();
	assert.equal(s.peekDocument().layers[0].bitmap, source);
});
test("folded quadrilaterals reject atomically and identity projective mapping preserves pixels", () => {
	const s = session(),
		before = s.peekDocument().layers[0].bitmap;
	assert.throws(
		() =>
			s.apply([
				{
					type: "transform.apply",
					layerId: "L1",
					operation: "distort",
					corners: [
						{ x: 8, y: 8 },
						{ x: 24, y: 24 },
						{ x: 24, y: 8 },
						{ x: 8, y: 24 },
					],
				},
			]),
		/convex/,
	);
	assert.equal(s.peekDocument().layers[0].bitmap, before);
	s.apply([
		{
			type: "transform.apply",
			layerId: "L1",
			operation: "distort",
			corners: [
				{ x: 8, y: 8 },
				{ x: 24, y: 8 },
				{ x: 24, y: 24 },
				{ x: 8, y: 24 },
			],
		},
	]);
	assert.deepEqual(s.peekDocument().layers[0].bitmap.data, before.data);
});

test("load pixels and black mask selections use canvas positions and undo", () => {
	const s = session(solidBitmap(p, 4, 4, 100, 0, 0));
	s.apply([{ type: "selection.fromLayer", layerId: "L1", source: "pixels" }]);
	let mask = p.rasterizeSelection(s.peekDocument().selection, 32, 32);
	assert.equal(mask[8 * 32 + 8], 255);
	assert.equal(mask[0], 0);
	s.apply([
		{ type: "layer.mask", layerId: "L1", operation: "hide-all" },
		{ type: "selection.fromLayer", layerId: "L1", source: "mask-black" },
	]);
	mask = p.rasterizeSelection(s.peekDocument().selection, 32, 32);
	assert.ok(mask.some((v) => v === 255));
	s.undo();
	assert.equal(s.peekDocument().layers[0].mask, undefined);
});
test("cross-project layer import remaps group IDs and preserves masks with one undo", () => {
	const source = session(),
		target = session();
	source.apply([
		{ type: "layer.mask", layerId: "L1", operation: "hide-all" },
		{ type: "layer.group", layerIds: ["L1"] },
	]);
	const data = p.psdBytesToBase64(p.writePsd(source.peekDocument()));
	const result = target.apply([{ type: "layer.import", psdBase64: data }]);
	assert.equal(result.createdIds.length, 1);
	const nodes = [];
	p.walkPsdLayers(target.peekDocument().layers, (l) => nodes.push(l));
	assert.equal(new Set(nodes.map((l) => l.id)).size, nodes.length);
	assert.ok(nodes.at(-1).mask);
	target.undo();
	assert.equal(target.peekDocument().layers.length, 1);
	assert.equal(source.peekDocument().layers[0].children[0].id, "L1");
	assert.throws(() => target.apply([{ type: "layer.import", psdBase64: "not a psd" }]));
	assert.equal(target.peekDocument().layers.length, 1);
});

test("group transform shares a pivot, transforms descendants once and undoes atomically", () => {
	const s = session();
	s.apply([{ type: "layer.group", layerIds: ["L1"] }]);
	const group = s.peekDocument().layers[0],
		original = group.children[0].bitmap;
	s.apply([
		{
			type: "transform.selection",
			layerIds: [group.id, "L1"],
			dx: 5,
			dy: 3,
			scaleX: 2,
			scaleY: 2,
		},
	]);
	const l = s.peekDocument().layers[0].children[0];
	assert.equal(l.left, 5);
	assert.equal(l.top, 3);
	assert.equal(l.bitmap.width, 32);
	assert.equal(l.sourceTransform.source, original);
	s.undo();
	assert.equal(s.peekDocument().layers[0].children[0].left, 8);
});
test("combining a layer selection leaves the previous cached selection intact for undo", () => {
	const s = session();
	s.apply([{ type: "selection.set", shape: "rectangle", x: 0, y: 0, width: 2, height: 2 }]);
	const previous = s.peekDocument().selection;
	const cached = p.rasterizeSelection(previous, 32, 32),
		snapshot = cached.slice();
	s.apply([{ type: "selection.fromLayer", layerId: "L1", source: "pixels", combine: "add" }]);
	assert.deepEqual(cached, snapshot);
	s.undo();
	assert.deepEqual(p.rasterizeSelection(s.peekDocument().selection, 32, 32), snapshot);
});

test("new transparent documents preserve dimensions and resolution through PSD", () => {
	const d = p.createBlankPsdDocument({
		width: 13,
		height: 7,
		resolutionPpi: 300,
		background: null,
	});
	assert.equal(d.layers[0].bitmap.data[3], 0);
	const r = p.readPsd(p.writePsd(d));
	assert.equal(r.width, 13);
	assert.equal(r.height, 7);
	assert.equal(r.resolutionPpi, 300);
	assert.throws(() => p.createBlankPsdDocument({ width: 30000, height: 30000 }), /pixel/);
});
test("TIFF imports RGBA pixels and honors orientation", async () => {
	const { default: UTIF } = await import("utif");
	const rgba = new Uint8Array([
		255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255, 0, 255, 255, 255, 255, 0,
		255, 255,
	]);
	const bytes = new Uint8Array(UTIF.encodeImage(rgba.buffer, 2, 3));
	const decoded = p.decodePsdTiff(bytes);
	assert.equal(decoded.width, 2);
	assert.equal(decoded.height, 3);
	assert.deepEqual([...decoded.data], [...rgba]);
	// Insert orientation by replacing an optional resolution-unit IFD entry.
	const view = new DataView(bytes.buffer),
		little = bytes[0] === 73,
		offset = view.getUint32(4, little),
		count = view.getUint16(offset, little);
	let found = false;
	for (let i = 0; i < count; i++) {
		const at = offset + 2 + i * 12;
		if (view.getUint16(at, little) === 296) {
			view.setUint16(at, 274, little);
			view.setUint16(at + 8, 6, little);
			found = true;
			break;
		}
	}
	assert.ok(found);
	const rotated = p.decodePsdTiff(bytes);
	assert.equal(rotated.width, 3);
	assert.equal(rotated.height, 2);
	assert.deepEqual([...rotated.data.slice(0, 4)], [0, 255, 255, 255]);
});

test("foreground masks multiply existing masks, preserve source pixels, save and undo", () => {
	const s = session(),
		original = s.peekDocument().layers[0].bitmap;
	s.apply([{ type: "layer.mask", layerId: "L1", operation: "hide-all" }]);
	const data = p.psdBytesToBase64(new Uint8Array(256).fill(180));
	s.apply([
		{ type: "mask.set", layerId: "L1", width: 16, height: 16, dataBase64: data, combine: true },
	]);
	assert.equal(s.peekDocument().layers[0].bitmap, original);
	assert.equal(s.peekDocument().layers[0].mask.data[0], 0);
	s.undo();
	s.apply([
		{
			type: "mask.set",
			layerId: "L1",
			width: 16,
			height: 16,
			dataBase64: data,
			combine: false,
		},
	]);
	const read = p.readPsd(p.writePsd(s.peekDocument()));
	assert.equal(read.layers[0].mask.data[0], 180);
	assert.throws(
		() =>
			s.apply([
				{ type: "mask.set", layerId: "L1", width: 16, height: 16, dataBase64: "/w==" },
			]),
		/byte count/,
	);
	assert.equal(s.peekDocument().layers[0].mask.data[0], 180);
});

test("photo-sized foreground mask payload is accepted beyond normal text limits", () => {
	const doc = p.createBlankPsdDocument({ width: 256, height: 256 });
	const session = new p.PsdEditorSession(doc);
	session.apply([
		{
			type: "mask.set",
			layerId: "L1",
			width: 256,
			height: 256,
			dataBase64: p.psdBytesToBase64(new Uint8Array(65536).fill(255)),
		},
	]);
	assert.equal(session.peekDocument().layers[0].mask.data.length, 65536);
});

test("group free distort uses one homography for all descendants and preserves sources", () => {
	const s = session();
	s.apply([{ type: "layer.group", layerIds: ["L1"] }]);
	const g = s.peekDocument().layers[0],
		original = g.children[0].bitmap;
	s.apply([
		{
			type: "transform.selection",
			layerIds: [g.id],
			corners: [
				{ x: 10, y: 8 },
				{ x: 24, y: 10 },
				{ x: 24, y: 24 },
				{ x: 8, y: 24 },
			],
		},
	]);
	assert.equal(s.peekDocument().layers[0].children[0].sourceTransform.matrix.length, 9);
	assert.equal(s.peekDocument().layers[0].children[0].sourceTransform.source, original);
	s.undo();
	assert.equal(s.peekDocument().layers[0].children[0].bitmap, original);
});

test("copy merged crops the visible composite to selection and leaves source/history alone", () => {
	const s = session();
	s.apply([{ type: "selection.set", shape: "rectangle", x: 10, y: 11, width: 3, height: 4 }]);
	const revision = s.getRevision(),
		out = p.copyPsdMerged(s.peekDocument());
	assert.equal(out.width, 3);
	assert.equal(out.height, 4);
	assert.deepEqual([...out.data.slice(0, 4)], [120, 80, 30, 255]);
	assert.equal(s.getRevision(), revision);
});

test("selected pixels can be cut and moved in one transaction with selection and source restored on undo", () => {
	const s = session(),
		before = s.peekDocument().layers[0].bitmap;
	s.apply([{ type: "selection.set", shape: "rectangle", x: 10, y: 10, width: 2, height: 2 }]);
	s.apply([
		{ type: "layer.fromSelection", sourceLayerId: "L1", dx: 5, dy: 3, cut: true },
		{ type: "selection.translate", dx: 5, dy: 3 },
	]);
	assert.equal(s.peekDocument().layers[1].left, 13);
	assert.equal(s.peekDocument().layers[0].bitmap.data[(2 * 16 + 2) * 4 + 3], 0);
	s.undo();
	assert.equal(s.peekDocument().layers.length, 1);
	assert.equal(s.peekDocument().layers[0].bitmap, before);
});

test("background masks respect selection while leaving unselected image visible", () => {
	const s = session();
	s.apply([
		{ type: "selection.set", shape: "rectangle", x: 10, y: 10, width: 2, height: 2 },
		{
			type: "mask.set",
			layerId: "L1",
			width: 16,
			height: 16,
			dataBase64: p.psdBytesToBase64(new Uint8Array(256)),
			respectSelection: true,
			combine: true,
		},
	]);
	const m = s.peekDocument().layers[0].mask;
	assert.equal(m.data[0], 255);
	assert.equal(m.data[2 * 16 + 2], 0);
});

test("copy active pixels ignores visibility and opacity; copying a mask produces gray coverage", () => {
 const s = session();
 const doc = s.peekDocument(), layer = doc.layers[0];
 layer.visible = false; layer.opacity = 0;
 s.apply([{type:'selection.set',shape:'rectangle',x:8,y:8,width:2,height:2}]);
 const bitmap = p.copyPsdLayer(s.peekDocument(), s.peekDocument().layers[0]);
 assert.equal(bitmap.width, 2); assert.equal(bitmap.height, 2);
 assert.deepEqual(Array.from(bitmap.data.slice(0,4)), [120,80,30,255]);
 const masked = {...s.peekDocument().layers[0], mask:{left:8,top:8,right:9,bottom:9,data:new Uint8Array([72]),defaultColor:255,disabled:false,linked:true}};
 const mask = p.copyPsdLayer(s.peekDocument(), masked, 'mask');
 assert.deepEqual(Array.from(mask.data.slice(0,8)), [72,72,72,255,255,255,255,255]);
});
test("transforming a child cannot bypass its group's position lock", () => {
 const s = session();
 s.apply([{type:'layer.group',layerIds:['L1']}]);
 const group = s.peekDocument().layers[0];
 group.locks.position = true;
 const state = s.getStateId();
 assert.throws(() => s.apply([{type:'transform.selection',layerIds:['L1'],dx:3}]), /locked/);
 assert.equal(s.getStateId(), state);
 assert.equal(s.peekDocument().layers[0].children[0].left,8);
});

test("display downsampling averages coverage without transparent color fringes", () => {
 const source = p.createPsdBitmap(2, 2);
 source.data.set([255,0,0,255,0,0,255,0,0,0,255,0,0,0,255,0]);
 assert.deepEqual(Array.from(p.halvePsdBitmap(source).data), [255,0,0,64]);
 const odd = solidBitmap(p, 5, 3, 10, 20, 30);
 assert.deepEqual(Array.from(p.halvePsdBitmap(odd).data), [10,20,30,255,10,20,30,255]);
});
test("display pyramid reuses levels and invalidates on a new composite", () => {
 const source = solidBitmap(p, 16, 16, 100, 100, 100), pyramid = new p.PsdDisplayPyramid();
 const small = pyramid.bitmap(source, .25);
 assert.equal(small.width,4); assert.equal(pyramid.bitmap(source,.25),small);
 assert.equal(pyramid.bitmap(source,1),source);
 const next = solidBitmap(p,16,16,200,200,200);
 assert.equal(pyramid.bitmap(next,.25).data[0],200);
 assert.equal(source.data[0],100);
});

test("merge down combines only the immediate lower sibling and undoes atomically", () => {
 const doc = makeDocument(p, [rasterLayer(p,'a','Bottom',{bitmap:solidBitmap(p,4,4,255,0,0)}), rasterLayer(p,'b','Top',{bitmap:solidBitmap(p,4,4,0,255,0)}), rasterLayer(p,'c','Keep',{bitmap:solidBitmap(p,1,1,0,0,255)})], {width:4,height:4});
 const s = new p.PsdEditorSession(doc);
 s.apply([{type:'layer.mergeDown',layerId:'b'}]);
 assert.equal(s.peekDocument().layers.length,2);
 assert.equal(s.peekDocument().layers[1].id,'c');
 assert.deepEqual(Array.from(s.peekDocument().layers[0].bitmap.data.slice(0,4)),[0,255,0,255]);
 s.undo(); assert.deepEqual(s.peekDocument().layers.map(l=>l.id),['a','b','c']);
 assert.throws(()=>s.apply([{type:'layer.mergeDown',layerId:'a'}]),/lower sibling/);
 s.peekDocument().layers[0].locks.all=true;
 assert.throws(()=>s.apply([{type:'layer.mergeDown',layerId:'b'}]),/locked/);
});
test("clipboard placement reports actual selected bounds including inverted selections", () => {
 const s=session();
 assert.deepEqual(p.psdClipboardRegion(s.peekDocument()),{x:0,y:0,width:32,height:32});
 s.apply([{type:'selection.set',shape:'rectangle',x:9,y:11,width:5,height:3}]);
 assert.deepEqual(p.psdClipboardRegion(s.peekDocument()),{x:9,y:11,width:5,height:3});
 s.apply([{type:'selection.invert'}]);
 assert.deepEqual(p.psdClipboardRegion(s.peekDocument()),{x:0,y:0,width:32,height:32});
});
test("selection fill expands a cropped mask and undo restores its exact original bounds", () => {
 const s=session(), layer=s.peekDocument().layers[0];
 layer.mask={left:8,top:8,right:9,bottom:9,data:new Uint8Array([64]),defaultColor:255,disabled:false,linked:true};
 s.apply([{type:'selection.set',shape:'rectangle',x:10,y:10,width:2,height:2}]);
 s.apply([{type:'mask.edit',layerId:'L1',operation:'fill',value:0}]);
 const mask=s.peekDocument().layers[0].mask;
 assert.equal(mask.data[10*32+10],0); assert.equal(mask.data[8*32+8],64); assert.equal(mask.data[0],255);
 s.undo(); assert.equal(s.peekDocument().layers[0].mask.left,8); assert.equal(s.peekDocument().layers[0].mask.data.length,1);
});
