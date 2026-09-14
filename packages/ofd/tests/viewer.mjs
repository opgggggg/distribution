import test from "node:test";
import assert from "node:assert/strict";
import { createRenderer, h, nextTick, ref } from "vue";
import { OfdViewer } from "../dist/vue/index.js";
import { ofd } from "./fixtures.mjs";

// Vue's host-independent renderer exercises real watchers/lifecycle without DOM mocks.
function mountViewer(source, extra = {}) {
	const node = (type, text = "") => ({ type, text, children: [], props: {}, parent: null });
	const renderer = createRenderer({
		createElement: node,
		createText: (text) => node("text", text),
		createComment: (text) => node("comment", text),
		setText: (target, text) => {
			target.text = text;
		},
		setElementText: (target, text) => {
			target.text = text;
			target.children = [];
		},
		parentNode: (target) => target.parent,
		nextSibling: (target) =>
			target.parent?.children[target.parent.children.indexOf(target) + 1] ?? null,
		patchProp: (target, key, previous, value) => {
			target.props[key] = value;
		},
		insert(target, parent, anchor = null) {
			if (target.parent)
				target.parent.children.splice(target.parent.children.indexOf(target), 1);
			target.parent = parent;
			const index = anchor ? parent.children.indexOf(anchor) : -1;
			if (index === -1) parent.children.push(target);
			else parent.children.splice(index, 0, target);
		},
		remove(target) {
			if (target.parent)
				target.parent.children.splice(target.parent.children.indexOf(target), 1);
			target.parent = null;
		},
	});
	const active = ref(source),
		viewer = ref();
	const app = renderer.createApp({
		setup: () => () => h(OfdViewer, { source: active.value, ref: viewer, ...extra }),
	});
	app.mount(node("root"));
	return { app, active, viewer };
}
const tick = async () => {
	await new Promise((resolve) => setImmediate(resolve));
	await nextTick();
};

test("viewer drops stale loads, aborts prior fetches and uses custom export backend", async (t) => {
	let release;
	const delayed = new Promise((resolve) => {
		release = resolve;
	});
	let signal,
		previewCount = 0,
		exportCount = 0;
	t.mock.method(globalThis, "fetch", async (_url, options) => {
		signal = options.signal;
		await delayed;
		return new Response(await ofd("old").arrayBuffer());
	});
	const { readOfdDocument } = await import("../dist/index.js");
	const mounted = mountViewer("https://example.invalid/old.ofd", {
		preview: async (source, options) => {
			previewCount++;
			return readOfdDocument(source, options);
		},
		convert: async (_source, _from, _to, options) => {
			exportCount++;
			assert.equal(options.page, 1);
			return {
				files: [{ name: "custom.txt", blob: new Blob(["custom export"]) }],
				diagnostics: [],
			};
		},
	});
	t.after(() => mounted.app.unmount());
	mounted.active.value = ofd("new");
	await tick();
	assert.equal(signal.aborted, true);
	release();
	await tick();
	assert.equal(previewCount, 1);
	assert.match(mounted.viewer.value.getDocument().text, /new/);
	assert.doesNotMatch(mounted.viewer.value.getDocument().text, /old/);
	const exported = await mounted.viewer.value.exportFile("txt", { page: 1 });
	assert.equal(await exported.text(), "custom export");
	assert.equal(exportCount, 1);
});

test("unmount aborts active loading and never emits loaded afterward", async (t) => {
	let signal,
		release,
		loaded = 0;
	t.mock.method(globalThis, "fetch", async (_url, options) => {
		signal = options.signal;
		await new Promise((resolve) => {
			release = resolve;
		});
		return new Response(await ofd().arrayBuffer());
	});
	const mounted = mountViewer("https://example.invalid/file.ofd", {
		onLoaded: () => {
			loaded++;
		},
	});
	mounted.app.unmount();
	assert.equal(signal.aborted, true);
	release();
	await tick();
	assert.equal(loaded, 0);
});

test("Goto remains in the current document when page IDs repeat across bodies", async (t) => {
	const ns = 'xmlns:ofd="http://www.ofdspec.org/2016"';
	const source = ofd("multi", {
		"OFD.xml": `<ofd:OFD ${ns}><ofd:DocBody><ofd:DocRoot>Doc/Document.xml</ofd:DocRoot></ofd:DocBody><ofd:DocBody><ofd:DocRoot>Doc/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>`,
	});
	const mounted = mountViewer(source);
	t.after(() => mounted.app.unmount());
	await tick();
	assert.equal(mounted.viewer.value.getPageCount(), 4);
	mounted.viewer.value.goToPage(2);
	await tick();
	await mounted.viewer.value.executeActions([
		{
			event: "CLICK",
			type: "Goto",
			parameters: {
				name: "ofd:Goto",
				namespace: "http://www.ofdspec.org/2016",
				attributes: {},
				children: [
					{
						name: "ofd:Dest",
						namespace: "http://www.ofdspec.org/2016",
						attributes: { Type: "XYZ", PageID: "2" },
						children: [],
					},
				],
			},
		},
	]);
	assert.equal(mounted.viewer.value.getCurrentPage(), 3);
});

test("a host callback does not enable automatic external actions", async (t) => {
	const opened = [];
	const mounted = mountViewer(ofd(), { actionHost: { openUri: (uri) => opened.push(uri) } });
	t.after(() => mounted.app.unmount());
	await tick();
	const actions = [
		{
			event: "DO",
			type: "URI",
			parameters: {
				name: "ofd:URI",
				namespace: "http://www.ofdspec.org/2016",
				attributes: { URI: "https://example.invalid/document-link" },
				children: [],
			},
		},
	];
	await mounted.viewer.value.executeActions(actions, false);
	assert.deepEqual(opened, []);
	await mounted.viewer.value.executeActions(actions, true);
	assert.deepEqual(opened, ["https://example.invalid/document-link"]);
});
