import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNotebook, clone, validateNotebook } from "../dist/model.js";
import { NoteHistory } from "../dist/history.js";
import { listBrushPlugins } from "../dist/brushes.js";
import { readNotebookState, writeNotebook, writeXopp, readXopp } from "../dist/codec.js";
import { NotesRustKernel } from "../dist/kernel/runtime.js";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const cli = path.join(
	root,
	`target/debug/cubeoffice-notes${process.platform === "win32" ? ".exe" : ""}`,
);
const module = await WebAssembly.compile(
	readFileSync(path.join(root, "packages/notes/src/kernel/notes-kernel.wasm")),
);
const temp = mkdtempSync(path.join(os.tmpdir(), "cube-notes-rust-"));
assert.deepEqual(
	JSON.parse(readFileSync(path.join(root, "crates/notes-core/brushes.json"), "utf8")),
	JSON.parse(
		JSON.stringify(
			listBrushPlugins().map(({ render, pressureFactor, ...metadata }) => metadata),
		),
	),
	"Rust brush validation metadata must match the registered UI brush definitions",
);
const roundtrip = async (book, history) => {
	const file = path.join(temp, "before.cubenote"),
		output = path.join(temp, "after.cubenote");
	writeFileSync(file, new Uint8Array(await writeNotebook(book, history).arrayBuffer()));
	execFileSync(cli, [file, output]);
	const restored = readNotebookState(new Uint8Array(readFileSync(output)));
	assert.deepEqual(restored.document, book);
	assert.deepEqual(
		restored.history,
		history && (history.past.length || history.future.length) ? history : undefined,
	);
	const core = new NotesRustKernel(module);
	try {
		const state = core.open(new Uint8Array(readFileSync(file)));
		assert.equal(state.kernel, "rust");
		assert.deepEqual(state.document, book);
		const written = readNotebookState(core.save());
		assert.deepEqual(written.document, book);
		assert.deepEqual(written.history, restored.history);
	} finally {
		core.close();
	}
};
try {
	const book = createNotebook("水彩 / Sketch 🎨", true),
		p = book.pages[0],
		layer = p.layers[0];
	p.background = {
		id: "background",
		kind: "image",
		src: "data:image/png;base64,AAAA",
		x: -40,
		y: -30,
		width: 100,
		height: 120,
		opacity: 0.3,
		angle: 45,
	};
	p.tapes = [{ id: "tape", x: -30, y: 40, width: 200, height: 20, angle: -20 }];
	p.scenes = [{ id: "scene", name: "学习区域", x: -50, y: -50, width: 400, height: 400 }];
	for (const plugin of listBrushPlugins())
		layer.elements.push({
			id: "brush-" + plugin.id,
			kind: "stroke",
			tool: "pen",
			penStyle: plugin.id,
			brushVersion: plugin.version ?? 1,
			brushSeed: 4294967295,
			brushSettings: Object.fromEntries(
				(plugin.parameters ?? []).map((p) => [p.id, p.default]),
			),
			color: "#aBcD01",
			width: plugin.defaults.width,
			opacity: 0.7,
			pressure: plugin.supportsPressure,
			points: [
				{ x: -10, y: 20, pressure: 0.2 },
				{ x: 25, y: 40, pressure: 0.8, width: 4 },
			],
			cutouts: [
				[
					{ x: 1, y: 2 },
					{ x: 5, y: 2 },
					{ x: 5, y: 8 },
					{ x: 1, y: 8 },
				],
			],
			erasures: [
				{
					width: 8,
					height: 4,
					points: [
						{ x: -2, y: 3 },
						{ x: 10, y: 20 },
					],
				},
			],
		});
	layer.elements.push({
		id: "text",
		kind: "text",
		text: "中文\nUndo 🎨",
		x: -20,
		y: 50,
		size: 20,
		color: "#101010",
		font: "sans-serif",
	});
	layer.elements.push({ ...p.background, id: "photo", angle: -90 });
	for (const [id, shape] of [
		["rect", "rectangle"],
		["oval", "ellipse"],
	])
		layer.elements.push({
			id,
			kind: "stroke",
			tool: "pen",
			color: "#101010",
			width: 2,
			opacity: 1,
			pressure: false,
			shape,
			points: [
				{ x: 0, y: 0, pressure: 0.5 },
				{ x: 40, y: 40, pressure: 0.5 },
			],
		});
	layer.elements.push({
		id: "connector",
		kind: "stroke",
		tool: "pen",
		color: "#101010",
		width: 2,
		opacity: 1,
		pressure: false,
		connector: {
			from: { elementId: "rect", side: "right" },
			to: { elementId: "oval", side: "left" },
		},
		points: [
			{ x: 40, y: 20, pressure: 0.5 },
			{ x: 0, y: 20, pressure: 0.5 },
		],
	});
	book.extension = { vendor: "opaque metadata", values: [1, true] };
	validateNotebook(book);
	const validator = new NotesRustKernel(module);
	const invalidCases = [
		(d) => {
			d.version = 2;
		},
		(d) => {
			d.title = "x".repeat(4097);
		},
		(d) => {
			d.pages = [];
		},
		(d) => {
			d.pages[0].width = 5001;
		},
		(d) => {
			d.pages[0].infinite = "yes";
		},
		(d) => {
			d.pages[0].color = "red";
		},
		(d) => {
			d.pages[0].background.src = "https://example.org/photo.png";
		},
		(d) => {
			d.pages[0].background.angle = 361;
		},
		(d) => {
			d.pages[0].tapes[0].angle = 181;
		},
		(d) => {
			d.pages[0].scenes[0].name = " ";
		},
		(d) => {
			d.pages[0].layers[0].visible = 1;
		},
		(d) => {
			d.pages[0].layers[0].id = d.pages[0].id;
		},
		(d) => {
			d.pages[0].layers[0].elements[0].penStyle = "missing";
		},
		(d) => {
			d.pages[0].layers[0].elements[0].brushVersion = 1000;
		},
		(d) => {
			d.pages[0].layers[0].elements[0].brushSeed = -1;
		},
		(d) => {
			d.pages[0].layers[0].elements[0].brushSettings = { unknown: 1 };
		},
		(d) => {
			d.pages[0].layers[0].elements[0].points = [];
		},
		(d) => {
			d.pages[0].layers[0].elements[0].points[0].pressure = 2;
		},
		(d) => {
			d.pages[0].layers[0].elements[0].points[0].x = 1e10;
		},
		(d) => {
			d.pages[0].layers[0].elements[0].points[0].width = 201;
		},
		(d) => {
			d.pages[0].layers[0].elements[0].cutouts[0].pop();
		},
		(d) => {
			d.pages[0].layers[0].elements[0].erasures[0].width = 0;
		},
		(d) => {
			d.pages[0].layers[0].elements.at(-1).connector.from.elementId = "missing";
		},
		(d) => {
			d.pages[0].layers[0].elements.at(-1).connector.to.elementId = "rect";
		},
	];
	for (const mutate of invalidCases) {
		const invalid = clone(book);
		mutate(invalid);
		assert.throws(() => validateNotebook(invalid));
		assert.throws(() => validator.request({ op: "validate", document: invalid }));
	}
	validator.close();
	await roundtrip(book);
	delete book.extension; // v1 historical frames store title/pages only, including in the TS oracle.
	const h = new NoteHistory(book);
	for (let i = 0; i < 6; i++)
		h.commitPage(p.id, (page) => {
			page.background.src = `data:image/png;base64,A${i}AA`;
			page.layers[0].elements[0].points[0].x = i;
		});
	h.undo();
	h.undo();
	await roundtrip(h.document, h.capture());
	const core = new NotesRustKernel(module);
	core.request({ op: "init", document: h.document, history: h.capture(), includeFrames: true });
	assert.deepEqual(readNotebookState(core.save()).history, h.capture());
	const before = core.request({ op: "state" });
	const invalid = clone(h.document);
	invalid.pages[0].layers[0].id = invalid.pages[0].id;
	assert.throws(() => core.request({ op: "replace", document: invalid, baseRevision: 0 }));
	assert.equal(core.request({ op: "state" }).revision, before.revision);
	core.request({ op: "undo", baseRevision: 0 });
	assert.deepEqual(core.request({ op: "state" }).document, h.capture().past.at(-1));
	assert.equal(core.request({ op: "markSaved", revision: 0 }).dirty, true);
	core.request({ op: "redo", baseRevision: 1 });
	assert.deepEqual(core.request({ op: "state" }).document, h.document);
	core.close();
	const simple = createNotebook("XOPP & <drawing>", true);
	simple.pages[0].layers[0].elements.push({
		id: "ink",
		kind: "stroke",
		tool: "pen",
		color: "#012345",
		width: 2,
		opacity: 0.7,
		pressure: true,
		penStyle: "fountain",
		points: [
			{ x: -30, y: 8, pressure: 0.2 },
			{ x: 20, y: 40, pressure: 0.7 },
		],
	});
	const xopp = new NotesRustKernel(module);
	xopp.request({ op: "init", document: simple });
	xopp.request({ op: "exportFormat", format: "xopp" });
	const rustXopp = readXopp(xopp.save(), "Imported");
	const tsXopp = readXopp(new Uint8Array(await writeXopp(simple).arrayBuffer()), "Imported");
	const stripIds = (v) =>
		JSON.parse(JSON.stringify(v, (key, value) => (key === "id" ? undefined : value)));
	assert.deepEqual(stripIds(rustXopp), stripIds(tsXopp));
	const source = new Uint8Array(await writeXopp(simple).arrayBuffer());
	const reopened = xopp.open(source);
	assert.deepEqual(stripIds(reopened.document), stripIds(readXopp(source, "Imported notebook")));
	xopp.close();
	console.log(
		"PASS native and WASM: all built-in brush metadata, background/photos, masks, erasures, scenes, extensions, persisted undo/redo, stale saves, atomic rejection and XOPP parity",
	);
} finally {
	rmSync(temp, { recursive: true, force: true });
}
