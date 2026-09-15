/**
 * Drives `bridge.js`'s `window.cubeofficeServices` against a fake WKWebView message
 * handler: the shim has to satisfy the synchronous contract the shared settings panel
 * was written against (Android's `@JavascriptInterface`), and nothing else on iOS does.
 *
 * Run from the repository root: node apps/ios/tests/services.cjs
 */
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

function loadBridge(clientInfo) {
	const posted = [];
	const handler = { postMessage: (message) => posted.push(message) };
	const window = {
		__auroraIosClientInfo: clientInfo,
		webkit: { messageHandlers: { auroraHost: handler, auroraServices: handler } },
		crypto: {
			randomUUID: () => "id-" + posted.length + "-" + Math.random().toString(36).slice(2),
		},
	};
	const context = vm.createContext({ window });
	vm.runInContext(fs.readFileSync("apps/ios/App/Resources/bridge.js", "utf8"), context);
	// Messages are built inside the vm realm; round-trip them before comparing.
	const last = () => JSON.parse(JSON.stringify(posted[posted.length - 1]));
	return { window, posted, last };
}

const identity = {
	client_id: "0F3A6C1E-2B7D-4C88-9E10-5A6B7C8D9E01",
	version: "1.4.2",
	versionCode: 1004002,
	platform: "ios-ipad",
	arch: "arm64",
	locale: "zh-Hans-CN",
	sdk: 0,
	automatic: false,
	lastCheck: 0,
	updateChannel: "appstore",
};

// A host that injected no identity offers no services at all, which is what the panel
// checks before it reports the client as too old to serve.
assert.equal(loadBridge(null).window.cubeofficeServices, undefined);

const { window, posted, last } = loadBridge({ ...identity });
const services = window.cubeofficeServices;
assert.deepEqual(JSON.parse(services.getInfo()), identity);

// setAutomatic answers getInfo immediately; the host only records it.
services.setAutomatic(true);
assert.equal(JSON.parse(services.getInfo()).automatic, true);
assert.deepEqual(last(), { name: "setAutomatic", enabled: true });
services.copyClientId();
assert.deepEqual(last(), { name: "copyClientId" });

// One request per operation at a time: the second never reaches the host.
const feedback = services.request("feedback", '{"message":"reproducible crash on open"}');
assert.ok(feedback);
assert.deepEqual(last(), {
	name: "request",
	id: feedback,
	operation: "feedback",
	input: '{"message":"reproducible crash on open"}',
});
assert.equal(services.request("feedback", "{}"), "");
assert.equal(services.request("updates", "{}".repeat(6001)), "");

// Nothing to take until the host settles, and the result is delivered exactly once.
assert.equal(services.takeResult(feedback), "");
const response = '{"ok":true,"data":{"feedback_id":"fb-1"}}';
assert.equal(window.__auroraIosHost.settleServiceRequest(feedback, response), true);
assert.equal(services.takeResult(feedback), response);
assert.equal(services.takeResult(feedback), "");
assert.equal(window.__auroraIosHost.settleServiceRequest(feedback, response), false);
// The operation is free again once it settled.
assert.ok(services.request("feedback", "{}"));

// A settled update check is the only thing that moves lastCheck, so the panel's daily
// opt-in check does not repeat on the next mount.
const updates = services.request("updates", "{}");
assert.equal(JSON.parse(services.getInfo()).lastCheck, 0);
window.__auroraIosHost.settleServiceRequest(updates, '{"ok":false,"error":"offline"}');
assert.equal(JSON.parse(services.getInfo()).lastCheck, 0);
const retried = services.request("updates", "{}");
window.__auroraIosHost.settleServiceRequest(
	retried,
	'{"ok":true,"data":{"channel":"appstore","available":false}}',
);
assert.ok(JSON.parse(services.getInfo()).lastCheck > 0);

// A host that cannot take the message must report busy rather than a dangling id.
window.webkit.messageHandlers.auroraServices = undefined;
assert.equal(services.request("feedback", "{}"), "");

console.log("iOS client-services shim checks passed");
