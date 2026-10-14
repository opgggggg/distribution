import { strFromU8, strToU8 } from "fflate";
import { HISTORY_LIMITS, type NoteHistoryState } from "./history.js";
import { LIMITS, validateNotebook, type Notebook, type NotePage } from "./model.js";

interface Frame {
	title: string;
	pages: number[];
}
interface StoredHistory {
	format: "cubeoffice-note-history";
	version: 1;
	pages: NotePage[];
	past: Frame[];
	future: Frame[];
}

/** Negative page references use the current document; shared pages are stored once. */
export function encodeHistory(
	document: Notebook,
	state: NoteHistoryState,
	budget: number,
): Uint8Array | undefined {
	budget = Math.min(budget, HISTORY_LIMITS.bytes);
	if (budget < 128 || (!state.past.length && !state.future.length)) return;
	const pool: NotePage[] = [],
		sizes: number[] = [],
		uses: number[] = [];
	const keys = new Map<string, number>();
	document.pages.forEach((page, i) => keys.set(JSON.stringify(page), -i - 1));
	const frame = (book: Notebook): Frame => ({
		title: book.title,
		pages: book.pages.map((page) => {
			const json = JSON.stringify(page),
				existing = keys.get(json);
			if (existing !== undefined) {
				if (existing >= 0) uses[existing]++;
				return existing;
			}
			const index = pool.length;
			keys.set(json, index);
			pool.push(page);
			sizes.push(strToU8(json).length + 1);
			uses.push(1);
			return index;
		}),
	});
	const past = state.past.map(frame),
		future = state.future.map(frame);
	const frameSize = (f: Frame) => strToU8(JSON.stringify(f)).length + 1;
	let size =
		128 +
		sizes.reduce((a, b) => a + b, 0) +
		[...past, ...future].reduce((a, f) => a + frameSize(f), 0);
	// Discard the farthest steps first, retaining the nearest undo and redo states.
	while (past.length + future.length > HISTORY_LIMITS.steps || size > budget) {
		const removed = (past.length >= future.length ? past : future).shift();
		if (!removed) return;
		size -= frameSize(removed);
		for (const index of removed.pages)
			if (index >= 0 && --uses[index] === 0) size -= sizes[index];
	}
	if (!past.length && !future.length) return;
	const pages: NotePage[] = [],
		remap = new Map<number, number>();
	pool.forEach((page, i) => {
		if (uses[i]) {
			remap.set(i, pages.length);
			pages.push(page);
		}
	});
	const remapFrames = (frames: Frame[]) =>
		frames.map((f) => ({ ...f, pages: f.pages.map((i) => (i < 0 ? i : remap.get(i)!)) }));
	const stored: StoredHistory = {
		format: "cubeoffice-note-history",
		version: 1,
		pages,
		past: remapFrames(past),
		future: remapFrames(future),
	};
	restoreHistory(stored, document);
	return strToU8(JSON.stringify(stored));
}

export function decodeHistory(bytes: Uint8Array, document: Notebook): NoteHistoryState {
	if (bytes.length > HISTORY_LIMITS.bytes)
		throw new Error("Invalid or oversized notebook undo/redo history.");
	return restoreHistory(JSON.parse(strFromU8(bytes)), document);
}
function restoreHistory(data: StoredHistory, document: Notebook): NoteHistoryState {
	const fail = (): never => {
		throw new Error("Invalid or unsupported notebook undo/redo history.");
	};
	if (
		!data ||
		data.format !== "cubeoffice-note-history" ||
		data.version !== 1 ||
		!Array.isArray(data.pages) ||
		data.pages.length > HISTORY_LIMITS.steps * LIMITS.pages ||
		!Array.isArray(data.past) ||
		!Array.isArray(data.future) ||
		data.past.length + data.future.length > HISTORY_LIMITS.steps
	)
		fail();
	const info = new Map<NotePage, { ids: string[]; points: number; elements: number }>();
	function indexPage(page: NotePage) {
		const ids = [page.id, ...(page.scenes ?? []).map((s) => s.id)];
		let points = 0,
			elements = 0;
		for (const layer of page.layers) {
			ids.push(layer.id);
			for (const e of layer.elements) {
				ids.push(e.id);
				elements++;
				if (e.kind === "stroke") points += e.points.length;
			}
		}
		info.set(page, { ids, points, elements });
	}
	document.pages.forEach(indexPage);
	// Validate each unique historical page once, rather than repeatedly walking
	// millions of unchanged ink points for every history frame.
	for (const page of data.pages) {
		validateNotebook({
			format: "cubeoffice-notebook",
			version: 1,
			title: "History",
			pages: [page],
		});
		indexPage(page);
	}
	const used = new Set<number>();
	const restore = (frames: Frame[]) =>
		frames.map((f) => {
			if (
				!f ||
				typeof f.title !== "string" ||
				f.title.length > 4096 ||
				!Array.isArray(f.pages) ||
				!f.pages.length ||
				f.pages.length > LIMITS.pages
			)
				fail();
			const ids = new Set<string>();
			let points = 0,
				elements = 0;
			const pages = f.pages.map((reference) => {
				if (
					!Number.isInteger(reference) ||
					reference < -document.pages.length ||
					reference >= data.pages.length
				)
					fail();
				const page = reference < 0 ? document.pages[-reference - 1] : data.pages[reference];
				if (reference >= 0) used.add(reference);
				const metadata = info.get(page)!;
				points += metadata.points;
				elements += metadata.elements;
				if (points > LIMITS.points || elements > LIMITS.elements) fail();
				for (const id of metadata.ids) {
					if (ids.has(id)) fail();
					ids.add(id);
				}
				return page;
			});
			return { format: "cubeoffice-notebook", version: 1, title: f.title, pages } as Notebook;
		});
	const state = { past: restore(data.past), future: restore(data.future) };
	if (used.size !== data.pages.length) fail();
	return state;
}
