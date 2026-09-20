import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

function compile(relative, dependencies = {}, globals = {}) {
	const path = new URL(relative, import.meta.url);
	const exports = {};
	vm.runInNewContext(
		ts.transpileModule(readFileSync(path, "utf8"), {
			compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
		}).outputText,
		{
			exports,
			require: (name) => {
				if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
				return dependencies[name];
			},
			console,
			setTimeout,
			clearTimeout,
			...globals,
		},
		{ filename: path.pathname },
	);
	return exports;
}

const modelModule = compile("../../apps/harmony/entry/src/main/ets/tabs/NativeTabGroups.ets");
const { NativeTabGroup, NativeTabGroups } = modelModule;

test("moves preserve unique ownership, source selection, insertion and fixed Home", () => {
	const model = new NativeTabGroups();
	const a = new NativeTabGroup("a", "home-a"),
		b = new NativeTabGroup("b", "home-b");
	a.documents = ["one", "two", "three"];
	a.active = "two";
	b.documents = ["four"];
	b.active = "four";
	model.groups.set("a", a);
	model.groups.set("b", b);
	assert.equal(model.move("two", "b", "four"), true);
	assert.deepEqual([...a.documents], ["one", "three"]);
	assert.equal(a.active, "three");
	assert.deepEqual([...b.documents], ["two", "four"]);
	assert.equal(b.active, "two");
	assert.equal(model.move("home-a", "b"), false);
	assert.equal(model.move("one", "b", "missing"), false);
	assert.equal(model.move("two", "a", "one"), true);
	assert.deepEqual([...a.documents], ["two", "one", "three"]);
	model.remove("two");
	model.remove("one");
	model.remove("three");
	assert.equal(a.active, "home-a");
});

function setup() {
	class BuilderNode {
		frame = {
			parent: null,
			getParent() {
				return this.parent;
			},
		};
		build() {}
		getFrameNode() {
			return this.frame;
		}
		dispose() {
			assert.equal(this.frame.parent, null, "dispose only after detach");
			this.disposed = true;
		}
	}
	class NodeController {
		rebuild() {
			if (this.previous) this.previous.parent = null;
			if (this.root) {
				assert.equal(this.root.parent, null, "a live Web must never have two parents");
				this.root.parent = this;
			}
			this.previous = this.root;
		}
	}
	class Bridge {
		initialize() {}
		setNativeTabs(host) {
			this.host = host;
		}
		setAppWindow(win) {
			this.win = win;
		}
	}
	class Services {
		initialize() {}
	}
	const callbacks = new Map();
	const makeWindow = () => ({
		on(name, handler) {
			callbacks.set(name, handler);
		},
		getUIContext() {
			return {};
		},
		async showWindow() {},
		getWindowProperties() {
			return { windowRect: { left: 0, top: 0, width: 1000, height: 700 } };
		},
	});
	const module = compile(
		"../../apps/harmony/entry/src/main/ets/tabs/NativeTabs.ets",
		{
			"@kit.ArkUI": {
				BuilderNode,
				NodeController,
				window: { WindowEventType: { WINDOW_ACTIVE: 2 } },
			},
			"@kit.ArkWeb": { webview: { WebviewController: class {} } },
			"../bridge/HarmonyDocumentBridge": { HarmonyDocumentBridge: Bridge },
			"../bridge/HarmonyClientServices": { HarmonyClientServices: Services },
			"../pages/HarmonyWeb": { HarmonyWeb() {}, HarmonyWebParams: class {} },
			"./NativeTabGroups": modelModule,
		},
		{ wrapBuilder: (builder) => builder },
	);
	const manager = module.nativeTabs;
	manager.initialize({ getMainWindowSync: makeWindow }, {});
	return { manager, makeWindow, callbacks };
}

test("switch, detach ownership and merge reuse exactly the same live Web nodes", async () => {
	const { manager, makeWindow } = setup();
	await manager.start("main");
	await manager.open("home-main", JSON.stringify({ id: "document-one", fileName: "A.md" }));
	await manager.open("document-one", JSON.stringify({ id: "document-two", fileName: "B.md" }));
	const one = manager.sessions.get("document-one"),
		two = manager.sessions.get("document-two");
	one.editorSelection = 17;
	one.undo = ["original", "edited"];
	await manager.select("main", one.id);
	manager.register("other", makeWindow());
	await manager.start("other");
	assert.equal(manager.beginDrag(one.id), true);
	await manager.drop("other");
	await manager.endDrag(false, 50, 50);
	assert.equal(manager.sessions.get(one.id), one);
	assert.equal(manager.model.owner(one.id).id, "other");
	assert.equal(manager.windows.get("main").attached, two.id);
	assert.equal(one.node.getFrameNode().parent, manager.windows.get("other").container);
	assert.equal(one.bridge.win, manager.windows.get("other").window);
	manager.beginDrag(one.id);
	await manager.drop("main", two.id);
	await manager.endDrag(false, 0, 0);
	assert.equal(manager.sessions.get(one.id), one);
	assert.equal(one.editorSelection, 17);
	assert.deepEqual(one.undo, ["original", "edited"]);
	assert.equal(manager.windows.get("other").attached, "home-other");
	assert.deepEqual([...manager.model.groups.get("main").documents], [one.id, two.id]);
});

test("cancelled native drag changes neither order nor WebView ownership", async () => {
	const { manager } = setup();
	await manager.start("main");
	await manager.open("home-main", JSON.stringify({ id: "document-one", fileName: "A.md" }));
	const session = manager.sessions.get("document-one");
	manager.beginDrag(session.id);
	await manager.endDrag(true, 500, 600);
	assert.equal(manager.windows.size, 1);
	assert.equal(manager.windows.get("main").attached, session.id);
	assert.equal(manager.sessions.get(session.id), session);
});

test("failed destination mount restores source ownership and both active surfaces", async () => {
	const { manager, makeWindow } = setup();
	await manager.start("main");
	await manager.open("home-main", JSON.stringify({ id: "document-one", fileName: "A.md" }));
	manager.register("other", makeWindow());
	await manager.start("other");
	const mount = manager.mount.bind(manager);
	manager.mount = async (group, id) => {
		if (group.model.id === "other" && id === "document-one")
			throw new Error("injected mount failure");
		return mount(group, id);
	};
	manager.beginDrag("document-one");
	await assert.rejects(manager.drop("other"), /mount failure/);
	await assert.rejects(manager.endDrag(false, 0, 0), /mount failure/);
	assert.equal(manager.model.owner("document-one").id, "main");
	assert.equal(manager.windows.get("main").attached, "document-one");
	assert.equal(manager.windows.get("other").attached, "home-other");
	assert.equal(manager.hasDrag(), false);
});

test("closing a dirty tab waits for its own reply and cancellation keeps it live", async () => {
	const { manager } = setup();
	await manager.start("main");
	await manager.open("home-main", JSON.stringify({ id: "document-one", fileName: "A.md" }));
	const session = manager.sessions.get("document-one");
	session.info.ready = true;
	const close = manager.closeTab(session.id);
	await new Promise((resolve) => setImmediate(resolve));
	const command = JSON.parse(session.takeCommand());
	assert.equal(manager.respond("home-main", command.request, true), false);
	assert.equal(manager.respond(session.id, command.request, false), true);
	await close;
	assert.equal(manager.sessions.get(session.id), session);
	const confirmed = manager.closeTab(session.id);
	await new Promise((resolve) => setImmediate(resolve));
	manager.respond(session.id, JSON.parse(session.takeCommand()).request, true);
	await confirmed;
	assert.equal(session.node.disposed, true);
	assert.equal(manager.windows.get("main").attached, "home-main");
});
