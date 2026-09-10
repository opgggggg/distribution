const fs = require("node:fs");
const assert = require("node:assert/strict");
const ts = require("typescript");
(async () => {
	const { getDesktopAppProfile } = await import("../../profiles/cubeoffice/desktop/catalog.mjs");
	const { resolveProfileRuntimeEnv } =
		await import("../../als-office/apps/desktop/scripts/desktop-profiles.mjs");
	const profile = getDesktopAppProfile("cubeoffice");
	assert.equal(
		profile.settingsExtensionModule,
		undefined,
		"desktop no longer embeds the mobile feedback form",
	);
	const env = resolveProfileRuntimeEnv(profile);
	assert.equal(env.DESKTOP_FEEDBACK_BACKEND, "rest");
	assert.equal(env.DESKTOP_FEEDBACK_ENDPOINT, "https://cubexp.com/api/v1/feedback");
	assert.equal(env.DESKTOP_ERROR_LOG_ENDPOINT, "https://cubexp.com/api/v1/logs");
	const defaults = resolveProfileRuntimeEnv({
		id: "office",
		name: "Office",
		identifier: "office",
	});
	assert.equal(defaults.DESKTOP_FEEDBACK_BACKEND, "compose");
	assert.equal(defaults.DESKTOP_FEEDBACK_ENDPOINT, "");
	assert.equal(defaults.DESKTOP_ERROR_LOG_ENDPOINT, "");
	globalThis.__clientProfile = profile;
	const source = fs
		.readFileSync("als-office/apps/desktop/src/client-context.ts", "utf8")
		.replace(
			'import { DESKTOP_APP_PROFILE } from "./app-profile";',
			"const DESKTOP_APP_PROFILE = globalThis.__clientProfile;",
		);
	const js = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
	}).outputText;
	const { getClientContext } = await import(
		"data:text/javascript;base64," + Buffer.from(js).toString("base64")
	);
	const stored = new Map([["cubeoffice.client-id", "existing-installation-id-123"]]);
	global.localStorage = {
		getItem: (k) => stored.get(k) ?? null,
		setItem: (k, v) => stored.set(k, v),
	};
	assert.deepEqual(getClientContext("en"), {
		clientId: "existing-installation-id-123",
		locale: "en",
	});
	stored.clear();
	const first = getClientContext("zh-CN");
	assert.match(first.clientId, /^[a-zA-Z0-9_-]{20,80}$/);
	assert.equal(getClientContext("en").clientId, first.clientId);
	global.localStorage = {
		getItem: () => {
			throw new Error("storage unavailable");
		},
	};
	assert.throws(() => getClientContext("en"), /storage unavailable/);
	profile.clientServices = undefined;
	assert.deepEqual(getClientContext("en"), {}, "Compose does not collect installation identity");
	console.log(
		"Shared desktop profile routing, legacy installation identity, storage failures and Compose anonymity passed.",
	);
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
