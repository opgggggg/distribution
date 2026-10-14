import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync, strToU8, unzipSync, strFromU8, zipSync } from "fflate";
import {
	createNotebook,
	createPage,
	uid,
	inkWidth,
	validateNotebook,
	readNotebook,
	readXopp,
	writeNotebook,
	writeXopp,
	NoteHistory,
	hitStroke,
	lassoSelect,
	shapePoints,
} from "../dist/index.js";
import { pageSvg } from "../dist/render.js";
import { NOTES_ARTIFACT_PLUGIN } from "../dist/office.js";

function stroke() {
	return {
		id: uid(),
		kind: "stroke",
		tool: "pen",
		color: "#234abc",
		opacity: 1,
		width: 2,
		pressure: true,
		points: [
			{ x: 10, y: 20, pressure: 0.2 },
			{ x: 20, y: 30, pressure: 0.8 },
			{ x: 40, y: 40, pressure: 0.4 },
		],
	};
}
function populated() {
	const book = createNotebook("会议 & <笔记>");
	book.pages[0].layers[0].elements.push(stroke(), {
		id: uid(),
		kind: "text",
		x: 40,
		y: 60,
		size: 18,
		color: "#112233",
		text: '中文\n<script>"hello" & world',
	});
	book.pages.push(createPage("grid"));
	return book;
}

test("native archive preserves multiple pages, layers, pressure, CJK text and bookmarks", async () => {
	const book = populated();
	book.pages[1].bookmarked = true;
	book.pages[1].layers.push({ id: uid(), name: "Hidden", visible: false, elements: [stroke()] });
	const blob = writeNotebook(book);
	const bytes = new Uint8Array(await blob.arrayBuffer());
	assert.equal(blob.type, "application/vnd.cubexp.notebook+zip");
	assert.deepEqual(readNotebook(bytes), book);
	assert.equal(strFromU8(unzipSync(bytes).mimetype), blob.type);
});
test("Xournal round trip retains ink widths, page sizes, layers and text", async () => {
	const book = populated(),
		ink = book.pages[0].layers[0].elements[0];
	book.pages[0].layers[0].elements.push({
		...stroke(),
		id: uid(),
		tool: "highlighter",
		pressure: false,
		width: 14,
		opacity: 0.5,
		color: "#facc15",
	});
	const result = readNotebook(new Uint8Array(await writeXopp(book).arrayBuffer()), "test.xopp");
	assert.equal(result.pages.length, 2);
	assert.equal(result.pages[0].layers[0].name, book.pages[0].layers[0].name);
	assert.equal(result.pages[1].paper, "grid");
	assert.deepEqual(
		result.pages[0].layers[0].elements[1].text,
		book.pages[0].layers[0].elements[1].text,
	);
	const output = result.pages[0].layers[0].elements[0];
	ink.points
		.slice(1)
		.forEach((p, i) =>
			assert.ok(Math.abs(output.points[i + 1].width - inkWidth(ink, p)) < 0.001),
		);
	assert.equal(result.pages[0].layers[0].elements[2].opacity, 0.5);
});
test("reads ordinary Xournal++ capStyle, highlighter alpha and nominal/segment widths", () => {
	const xml =
		'<xournal fileversion="4"><title>Xournal++ document</title><page width="595.28" height="841.89"><background type="solid" color="#ffffffff" style="ruled"/><layer name="Notes"><stroke tool="pen" color="#000000ff" width="2 1 3" capStyle="round">10 20 30 40 50 60</stroke><stroke tool="highlighter" color="#ffff007f" width="12" capStyle="round">20 20 40 20</stroke></layer></page></xournal>';
	const book = readXopp(gzipSync(strToU8(xml)));
	assert.equal(book.pages[0].layers[0].name, "Notes");
	assert.equal(book.pages[0].layers[0].elements[0].points[2].width, 3);
	assert.equal(book.pages[0].layers[0].elements[1].opacity, 0.5);
	assert.equal(readNotebook(zipSync({ "content.xml": strToU8(xml) })).pages.length, 1);
});
test("unsupported Xournal objects, transformed text and paper configs are rejected without dropping content", () => {
	const xml = (element) =>
		`<xournal><page width="595" height="842"><background type="solid" color="white" style="plain"/><layer>${element}</layer></page></xournal>`;
	assert.throws(
		() => readXopp(strToU8(xml("<image>data</image>"))),
		/Unsupported Xournal content/,
	);
	assert.throws(
		() =>
			readXopp(
				strToU8(xml('<text matrix="1 0 0 1 2 3" size="12" color="black">rotated</text>')),
			),
		/text attribute/,
	);
	assert.throws(
		() => readXopp(strToU8(xml("").replace('type="solid"', 'type="pdf"'))),
		/backgrounds are not supported/,
	);
	assert.throws(
		() =>
			readXopp(strToU8(xml("").replace('style="plain"', 'style="graph" config="raster=12"'))),
		/configurations/,
	);
});
test("Xournal export refuses settings that would be lost", () => {
	const book = createNotebook();
	book.pages[0].bookmarked = true;
	assert.throws(() => writeXopp(book), /cannot preserve/);
	book.pages[0].bookmarked = false;
	book.pages[0].paper = "dotted";
	assert.throws(() => writeXopp(book), /cannot preserve/);
});
test("malformed geometry, duplicate ids, newer schemas and entity expansion are rejected", () => {
	const book = populated();
	book.pages[0].layers[0].elements[0].points[0].x = NaN;
	assert.throws(() => validateNotebook(book), /Invalid/);
	const duplicate = populated();
	duplicate.pages[1].id = duplicate.pages[0].id;
	assert.throws(() => writeNotebook(duplicate), /Invalid/);
	assert.throws(() => validateNotebook({ ...createNotebook(), version: 2 }), /unsupported/);
	assert.throws(
		() => readXopp(strToU8('<!DOCTYPE xournal [<!ENTITY a "b">]><xournal/>')),
		/Unsupported/,
	);
	assert.throws(() => readXopp(strToU8("<xournal><page>")), /Invalid|background/);
});
test("one gesture is one history transaction and save acknowledgement cannot clear later edits", () => {
	const history = new NoteHistory(createNotebook());
	const ink = stroke();
	history.commit((doc) => doc.pages[0].layers[0].elements.push(ink));
	const saving = history.getRevision();
	history.commit((doc) => doc.pages.push(createPage()));
	history.markSaved(saving);
	assert.equal(history.isDirty(), true);
	history.undo();
	assert.equal(history.document.pages.length, 1);
	history.undo();
	assert.equal(history.document.pages[0].layers[0].elements.length, 0);
	history.redo();
	assert.equal(history.document.pages[0].layers[0].elements.length, 1);
	history.markSaved(history.getRevision());
	assert.equal(history.isDirty(), false);
	assert.equal(
		history.commit(() => {}),
		false,
	);
});
test("stroke eraser and lasso catch sparse line segments as well as dots", () => {
	const ink = {
		...stroke(),
		pressure: false,
		points: [
			{ x: 0, y: 30, pressure: 0.5 },
			{ x: 100, y: 30, pressure: 0.5 },
		],
	};
	assert.equal(hitStroke(ink, { x: 50, y: 30 }, 3), true);
	assert.equal(hitStroke(ink, { x: 50, y: 50 }, 3), false);
	assert.deepEqual(
		lassoSelect(
			[ink],
			[
				{ x: 40, y: 20 },
				{ x: 60, y: 20 },
				{ x: 60, y: 40 },
				{ x: 40, y: 40 },
			],
		),
		[ink.id],
	);
	assert.equal(shapePoints("ellipse", { x: 0, y: 0 }, { x: 20, y: 20 }).length, 65);
});
test("ink transactions share untouched pages while retaining independent undo snapshots", () => {
	const book = populated(),
		history = new NoteHistory(book),
		firstId = book.pages[0].id;
	history.commitPage(firstId, (page) => page.layers[0].elements.push(stroke()));
	assert.equal(history.document.pages[1], book.pages[1]);
	assert.notEqual(history.document.pages[0], book.pages[0]);
	assert.equal(book.pages[0].layers[0].elements.length, 2);
	history.undo();
	assert.equal(history.document.pages[0].layers[0].elements.length, 2);
	assert.equal(
		history.isDirty(),
		true,
		"the new redo state still needs saving even at the original canvas",
	);
	history.redo();
	assert.equal(history.document.pages[0].layers[0].elements.length, 3);
});
test("thumbnails escape text and font names, never execute user markup", () => {
	const book = populated();
	book.pages[0].layers[0].elements[1].font = 'sans" onload="alert(1)';
	const svg = pageSvg(book.pages[0]);
	assert.ok(svg.includes("&lt;script&gt;"));
	assert.ok(svg.includes("&quot;"));
	assert.ok(!svg.includes("<script>"));
	assert.ok(!svg.includes('onload="alert'));
});
test("headless sessions create, edit and export; readonly and closed sessions reject writes", async () => {
	const session = await NOTES_ARTIFACT_PLUGIN.create({
		format: "notes",
		fileName: "会议.cubenote",
	});
	session.update((doc) => doc.pages[0].layers[0].elements.push(stroke()));
	assert.equal(session.getState().dirty, true);
	const copy = session.getNotebook();
	copy.pages.length = 0;
	assert.equal(session.getNotebook().pages.length, 1);
	const blob = await session.export();
	const readonly = await NOTES_ARTIFACT_PLUGIN.open({ source: blob, access: "read" });
	assert.throws(() => readonly.update((doc) => doc.pages.push(createPage())), /read-only/);
	assert.equal(readonly.capabilities.edit, false);
	session.close();
	await assert.rejects(session.export(), /closed/);
});

test("pen styles retain native identity, pressure response and Xournal segment widths", async () => {
	const book = createNotebook();
	for (const penStyle of ["ballpoint", "fountain", "brush"])
		book.pages[0].layers[0].elements.push({ ...stroke(), penStyle });
	const native = readNotebook(new Uint8Array(await writeNotebook(book).arrayBuffer()));
	assert.deepEqual(native, book);
	const [ballpoint, fountain, brush] = native.pages[0].layers[0].elements;
	const ratio = (ink) => inkWidth(ink, ink.points[1]) / inkWidth(ink, ink.points[0]);
	assert.equal(ratio(ballpoint), 1);
	assert.ok(ratio(brush) > ratio(fountain));
	assert.ok(ratio(fountain) > 1);
	assert.equal(inkWidth({ ...brush, pressure: false }, brush.points[0]), brush.width);
	assert.equal(
		inkWidth({ ...brush, penStyle: undefined }, brush.points[0]),
		brush.width * (0.3 + 1.4 * brush.points[0].pressure),
	);
	assert.throws(() => writeXopp(book), /cannot preserve this brush plugin/);
	const basic = structuredClone(book);
	basic.pages[0].layers[0].elements.pop();
	const xopp = readNotebook(new Uint8Array(await writeXopp(basic).arrayBuffer()));
	native.pages[0].layers[0].elements
		.slice(0, 2)
		.forEach((ink, i) =>
			ink.points
				.slice(1)
				.forEach((p, j) =>
					assert.ok(
						Math.abs(
							inkWidth(
								xopp.pages[0].layers[0].elements[i],
								xopp.pages[0].layers[0].elements[i].points[j + 1],
							) - inkWidth(ink, p),
						) < 0.001,
					),
				),
		);
	assert.throws(
		() =>
			validateNotebook({
				...book,
				pages: [
					{
						...book.pages[0],
						layers: [
							{
								...book.pages[0].layers[0],
								elements: [{ ...brush, penStyle: "unknown" }],
							},
						],
					},
				],
			}),
		/Invalid/,
	);
});
