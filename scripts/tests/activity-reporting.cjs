const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const source = fs
	.readFileSync("als-office/apps/desktop/src/activity-reporting.ts", "utf8")
	.replace(/^import .*;$/gm, "")
	.replace("export function", "function");
const js = ts.transpileModule(source, {
	compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
(async () => {
	const stored = new Map(),
		handlers = new Map();
	let calls = 0,
		fail = true,
		tick;
	const surface = {
		addEventListener: (name, fn) => handlers.set(name, fn),
		removeEventListener: (name) => handlers.delete(name),
	};
	const context = {
		DESKTOP_APP_PROFILE: {
			clientServices: {
				activityEndpoint: "https://example.test/activity",
				clientIdStorageKey: "install",
			},
		},
		getClientContext: () => ({ clientId: "stable-client-1234567890", locale: "en" }),
		document: { ...surface, visibilityState: "visible" },
		window: {
			...surface,
			setInterval: (fn) => ((tick = fn), 1),
			clearInterval: () => {
				tick = null;
			},
		},
		localStorage: {
			getItem: (key) => stored.get(key),
			setItem: (key, value) => stored.set(key, value),
		},
		invoke: async (name, { input }) => {
			assert.equal(name, "report_activity");
			assert.equal(input.clientId, "stable-client-1234567890");
			calls++;
			if (fail) throw Error("offline");
			return new Date().toISOString().slice(0, 10);
		},
	};
	vm.createContext(context);
	vm.runInContext(js + ";globalThis.start=installActivityReporting;", context);
	const flush = () => new Promise((resolve) => setImmediate(resolve));
	const stop = context.start();
	await flush();
	assert.equal(calls, 1);
	assert.equal(stored.size, 0);
	fail = false;
	tick();
	await flush();
	assert.equal(calls, 2);
	assert.equal(stored.size, 1);
	handlers.get("focus")();
	tick();
	await flush();
	assert.equal(calls, 2);
	stored.clear();
	context.document.visibilityState = "hidden";
	tick();
	await flush();
	assert.equal(calls, 2);
	context.document.visibilityState = "visible";
	handlers.get("visibilitychange")();
	await flush();
	assert.equal(calls, 3);
	stop();
	assert.equal(handlers.size, 0);
	assert.equal(tick, null);
	context.DESKTOP_APP_PROFILE.clientServices.activityEndpoint = "";
	context.start();
	await flush();
	assert.equal(calls, 3);
	console.log(
		"Foreground collection: retry, daily deduplication, hidden state, cleanup and profile opt-in passed",
	);
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
