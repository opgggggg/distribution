import assert from "node:assert/strict";
import { test } from "node:test";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import {
	createNotebook,
	createPage,
	clone,
	uid,
	NoteHistory,
	HISTORY_LIMITS,
	readNotebook,
	readNotebookState,
	writeNotebook,
} from "../dist/index.js";
import { encodeHistory, decodeHistory } from "../dist/history-codec.js";
import { NOTES_ARTIFACT_PLUGIN } from "../dist/office.js";

const ink = (penStyle) => ({
	id: uid(),
	kind: "stroke",
	tool: "pen",
	penStyle,
	width: 6,
	opacity: penStyle === "watercolor" ? 0.4 : 1,
	color: "#2563eb",
	pressure: true,
	points: [
		{ x: 20, y: 30, pressure: 0.2 },
		{ x: 100, y: 80, pressure: 0.8 },
	],
});
async function reload(history, document = history.document) {
	const bytes = new Uint8Array(
		await writeNotebook(document, history.capture(document)).arrayBuffer(),
	);
	const restored = readNotebookState(bytes);
	return new NoteHistory(restored.document, false, restored.history);
}

test("native save restores both history stacks and the exact partially-undone cursor", async () => {
	const history = new NoteHistory(createNotebook("试画"));
	const states = [clone(history.document)],
		page = history.document.pages[0].id;
	for (const style of ["pencil", "watercolor"]) {
		history.commitPage(page, (p) => p.layers[0].elements.push(ink(style)));
		states.push(clone(history.document));
	}
	history.commit((book) => book.pages.push(createPage("plain")));
	states.push(clone(history.document));
	history.commitPage(page, (p) => {
		p.paper = "plain";
		p.bookmarked = true;
	});
	states.push(clone(history.document));
	history.undo();
	history.undo();
	const restored = await reload(history);
	assert.deepEqual(restored.document, states[2]);
	assert.equal(restored.isDirty(), false);
	assert.equal(restored.canUndo(), true);
	assert.equal(restored.canRedo(), true);
	for (let i = 1; i >= 0; i--) {
		restored.undo();
		assert.deepEqual(restored.document, states[i]);
	}
	assert.equal(restored.canUndo(), false);
	for (let i = 1; i <= 4; i++) {
		restored.redo();
		assert.deepEqual(restored.document, states[i]);
	}
	assert.equal(restored.canRedo(), false);
	const again = await reload(restored);
	again.undo();
	assert.deepEqual(again.document, states[3]);
});

test("redo after returning to saved content survives restart, and a new edit clears it", async () => {
	const history = new NoteHistory(createNotebook()),
		page = history.document.pages[0].id;
	history.commitPage(page, (p) => p.layers[0].elements.push(ink("brush")));
	history.markSaved(history.getRevision());
	history.undo();
	history.redo();
	assert.equal(history.isDirty(), false, "identical cursor/stacks are clean again");
	history.commitPage(page, (p) => p.layers[0].elements.push(ink("pencil")));
	history.undo();
	assert.equal(
		history.isDirty(),
		true,
		"redo stack is a persistent change even when canvas is saved",
	);
	const restored = await reload(history);
	assert.equal(restored.canRedo(), true);
	restored.redo();
	assert.equal(restored.document.pages[0].layers[0].elements.length, 2);
	restored.undo();
	assert.equal(restored.isDirty(), false);
	restored.commitPage(page, (p) => p.layers[0].elements.push(ink("watercolor")));
	assert.equal(restored.canRedo(), false);
	assert.equal((await reload(restored)).canRedo(), false);
	const saving = restored.getRevision();
	restored.undo();
	restored.markSaved(saving);
	assert.equal(restored.isDirty(), true, "a stale save cannot acknowledge later undo/redo");
});

test("pending text in a recovery export becomes one undo step without mutating the live editor", async () => {
	const history = new NoteHistory(createNotebook());
	const document = clone(history.document);
	document.pages[0].layers[0].elements.push({
		id: uid(),
		kind: "text",
		x: 20,
		y: 20,
		color: "#222b40",
		size: 16,
		text: "尚未结束的文字",
	});
	const restored = await reload(history, document);
	assert.equal(history.canUndo(), false);
	restored.undo();
	assert.deepEqual(restored.document, history.document);
	restored.redo();
	assert.deepEqual(restored.document, document);
});

test("shared page pooling and a smaller history budget keep nearby undo and redo states", async () => {
	const book = createNotebook();
	book.pages.push(...Array.from({ length: 99 }, () => createPage()));
	const history = new NoteHistory(book),
		page = book.pages[0].id;
	for (let i = 0; i < 12; i++)
		history.commitPage(page, (p) => p.layers[0].elements.push(ink("pencil")));
	history.undo();
	history.undo();
	history.undo();
	const full = encodeHistory(history.document, history.capture(), 32 * 1024 * 1024);
	const data = JSON.parse(strFromU8(full));
	assert.equal(
		data.pages.length,
		12,
		"unchanged pages share references instead of repeated snapshots",
	);
	const small = encodeHistory(history.document, history.capture(), 7000);
	assert.ok(small && small.length <= 7000);
	const decoded = decodeHistory(small, history.document);
	assert.ok(decoded.past.length > 0 && decoded.future.length > 0);
	const restored = new NoteHistory(history.document, false, decoded);
	restored.undo();
	assert.equal(restored.document.pages[0].layers[0].elements.length, 8);
	restored.redo();
	restored.redo();
	assert.equal(restored.document.pages[0].layers[0].elements.length, 10);
	assert.equal(encodeHistory(history.document, history.capture(), 1), undefined);
});

test("legacy native files remain readable and malformed historical states cannot be opened", async () => {
	const original = createNotebook();
	const old = new Uint8Array(await writeNotebook(original).arrayBuffer());
	assert.equal(readNotebookState(old).history, undefined);
	assert.deepEqual(readNotebook(old), original);
	const history = new NoteHistory(original);
	history.commit((book) => book.pages.push(createPage()));
	history.undo();
	const bytes = new Uint8Array(
		await writeNotebook(history.document, history.capture()).arrayBuffer(),
	);
	const files = unzipSync(bytes),
		data = JSON.parse(strFromU8(files["history.json"]));
	for (const corrupt of [
		(d) => {
			d.version = 2;
		},
		(d) => {
			d.future[0].pages = [999999];
		},
		(d) => {
			d.future[0].pages = [-1, -1];
		},
		(d) => {
			d.future = Array.from({ length: HISTORY_LIMITS.steps + 1 }, () => d.future[0]);
		},
		(d) => {
			d.pages[0].width = 0;
		},
		(d) => {
			d.pages.push(createPage());
		},
	]) {
		const bad = clone(data);
		corrupt(bad);
		assert.throws(
			() =>
				readNotebookState(
					zipSync({ ...files, "history.json": strToU8(JSON.stringify(bad)) }),
				),
			/Invalid|unsupported/,
		);
	}
});

test("200 drawing steps survive saving at a partially-undone cursor and discard only the oldest extra step", async () => {
	const history = new NoteHistory(createNotebook());
	const page = history.document.pages[0].id;
	for (let i = 0; i < 201; i++)
		history.commitPage(page, (p) =>
			p.layers[0].elements.push(ink(i % 2 ? "watercolor" : "pencil")),
		);
	assert.equal(history.capture().past.length, 200);
	for (let i = 0; i < 51; i++) history.undo();
	const restored = await reload(history);
	assert.equal(restored.document.pages[0].layers[0].elements.length, 150);
	assert.equal(restored.capture().past.length, 149);
	assert.equal(restored.capture().future.length, 51);
	for (let i = 0; i < 149; i++) restored.undo();
	assert.equal(restored.canUndo(), false);
	assert.equal(restored.document.pages[0].layers[0].elements.length, 1);
	for (let i = 0; i < 200; i++) restored.redo();
	assert.equal(restored.canRedo(), false);
	assert.deepEqual(restored.document, history.capture().future[0]);
});

test("headless and readonly sessions restore history through the same native format", async () => {
	const first = await NOTES_ARTIFACT_PLUGIN.create({
		fileName: "画画.cubenote",
		access: "write",
	});
	first.update((b) => b.pages[0].layers[0].elements.push(ink("pencil")));
	first.update((b) => b.pages[0].layers[0].elements.push(ink("watercolor")));
	first.undo();
	const source = await first.export({ format: "cubenote" });
	const second = await NOTES_ARTIFACT_PLUGIN.open({
		source,
		fileName: "画画.cubenote",
		access: "write",
	});
	second.redo();
	assert.equal(second.getNotebook().pages[0].layers[0].elements.length, 2);
	second.undo();
	second.undo();
	assert.equal(second.getNotebook().pages[0].layers[0].elements.length, 0);
	const readonly = await NOTES_ARTIFACT_PLUGIN.open({ source, access: "read" });
	const before = readonly.getNotebook();
	readonly.undo();
	readonly.redo();
	assert.deepEqual(readonly.getNotebook(), before);
	first.close();
	second.close();
	readonly.close();
});
