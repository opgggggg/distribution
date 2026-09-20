import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
	assertRendererBranding,
	brandDesktopSource,
	withNativeBranding,
} from "../cubeoffice-branding.mjs";
import { cubeOfficeBrandingPlugin } from "../../profiles/cubeoffice/desktop/branding-plugin.mjs";
import { assertMcpBranding } from "../check-desktop-branding.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const upstream = path.join(root, "als-office/apps/desktop");
const read = (file) => readFileSync(path.join(upstream, file), "utf8");

test("packaged MCP regression checks descriptions as well as the server name", () => {
	const replies = () => [
		{ id: 1, result: { serverInfo: { name: "CubeOffice" }, instructions: "Use CubeOffice" } },
		{
			id: 2,
			result: { tools: [{ name: "office_status", description: "Read CubeOffice status" }] },
		},
	];
	assertMcpBranding(replies());
	const oldInstructions = replies();
	oldInstructions[0].result.instructions = "Use AuroraPrime Office";
	assert.throws(() => assertMcpBranding(oldInstructions));
	const oldTool = replies();
	oldTool[1].result.tools[0].description = "Open AuroraPrime Office";
	assert.throws(() => assertMcpBranding(oldTool), /upstream branding/);
	assert.throws(() => assertMcpBranding([{ id: 1, error: { message: "failed" } }]));
});

test("real runtime copy uses CubeOffice in Chinese/English AI UI, PDF errors and SVG accessibility text", () => {
	const plugin = cubeOfficeBrandingPlugin();
	for (const file of [
		"src/AiConnections.vue",
		"src/pdf-export-guard.ts",
		"src/assets/office-editor-mark.svg",
	]) {
		const result = plugin.transform(read(file), path.join(upstream, file));
		assert.ok(result, `fixture no longer exercises the upstream leak: ${file}`);
		assert.doesNotMatch(result.code, /AuroraPrime/);
		assert.match(result.code, /CubeOffice/);
		assertRendererBranding({ "runtime.js": { type: "chunk", code: result.code } });
	}
	assert.equal(
		plugin.transform('"AuroraPrime Office"', "/unrelated/project/src/app.ts"),
		undefined,
	);
});

test("new upstream renderer branding fails packaging even if a transform misses it", () => {
	const plugin = cubeOfficeBrandingPlugin();
	assert.throws(
		() =>
			plugin.generateBundle(
				{},
				{ "new.js": { type: "chunk", code: 'title="AuroraPrime Office"' } },
			),
		/new.js/,
	);
	assert.throws(
		() =>
			assertRendererBranding({
				"icon.svg": {
					type: "asset",
					source: Buffer.from('<svg aria-label="AuroraPrime Office"/>'),
				},
			}),
		/icon.svg/,
	);
	assertRendererBranding({ "app.js": { type: "chunk", code: 'title="CubeOffice"' } });
	assertRendererBranding({
		"docx.js": {
			type: "chunk",
			code: 'keys=["AuroraPrime.StyleRoles.v1","AuroraPrime.TemplateProfile.v1."]',
		},
	});
});

function fixture(t) {
	const temp = mkdtempSync(path.join(os.tmpdir(), "cubeoffice-branding-"));
	t.after(() => rmSync(temp, { recursive: true, force: true }));
	const native = path.join(temp, "als-office/apps/desktop/src-tauri");
	mkdirSync(path.join(native, "src"), { recursive: true });
	mkdirSync(path.join(native, "native"));
	const originals = new Map();
	for (const file of ["native_tabs.rs", "ai_connect.rs", "mcp_server.rs", "cli_protocol.rs"]) {
		const full = path.join(native, "src", file);
		const text = read(`src-tauri/src/${file}`);
		originals.set(full, text);
		writeFileSync(full, text);
	}
	return {
		temp,
		native,
		originals,
		journal: path.join(temp, "profiles/cubeoffice/desktop/generated/native-branding.json"),
	};
}

test("native window title, CLI and MCP copy are branded; managed connection identity is preserved", (t) => {
	const { temp, native, originals, journal } = fixture(t);
	withNativeBranding(temp, (env) => {
		const get = (file) => readFileSync(path.join(native, "src", file), "utf8");
		assert.match(get("native_tabs.rs"), /\.unwrap_or\("CubeOffice"\)/);
		assert.match(get("cli_protocol.rs"), /const APP_NAME: &str = "CubeOffice"/);
		assert.doesNotMatch(get("mcp_server.rs"), /AuroraPrime/);
		assert.match(get("ai_connect.rs"), /Install CubeOffice in Applications/);
		assert.match(
			get("ai_connect.rs"),
			/CODEX_BLOCK_START: &str = "# AuroraPrime Office connection/,
		);
		assert.match(
			get("ai_connect.rs"),
			/CODEX_BLOCK_END: &str = "# End AuroraPrime Office connection"/,
		);
		assert.match(get("ai_connect.rs"), /CONNECTION_ID: &str = "auroraprime-office"/);
		// Tauri's nested beforeBuildCommand uses the same overlay, never restores it early.
		withNativeBranding(temp, () => assert.match(get("native_tabs.rs"), /CubeOffice/), env);
		assert.match(get("native_tabs.rs"), /\.unwrap_or\("CubeOffice"\)/);
		assert.throws(
			() => withNativeBranding(temp, () => assert.fail("concurrent build ran"), {}),
			/locked/,
		);
	});
	for (const [file, original] of originals) assert.equal(readFileSync(file, "utf8"), original);
	assert.equal(existsSync(journal), false);
});

test("build failure restores byte-for-byte upstream sources", (t) => {
	const { temp, originals, journal } = fixture(t);
	assert.throws(
		() =>
			withNativeBranding(temp, () => {
				throw new Error("compiler failed");
			}),
		/compiler failed/,
	);
	for (const [file, original] of originals) assert.equal(readFileSync(file, "utf8"), original);
	assert.equal(existsSync(journal), false);
});

test("concurrent source edits are preserved and leave recovery evidence", (t) => {
	const { temp, native, journal } = fixture(t);
	const file = path.join(native, "src/native_tabs.rs");
	assert.throws(
		() => withNativeBranding(temp, () => writeFileSync(file, "user edit")),
		/Source edited during/,
	);
	assert.equal(readFileSync(file, "utf8"), "user edit");
	assert.equal(existsSync(journal), true);
});

test("branding handles new literal occurrences and is idempotent", () => {
	const source =
		'"AuroraPrime Office"; "AuroraPrime connection"; "com.yaochn.office-editor"; "auroraprime-office"';
	const branded = brandDesktopSource(source);
	assert.equal(
		branded,
		'"CubeOffice"; "CubeOffice connection"; "com.yaochn.office-editor"; "auroraprime-office"',
	);
	assert.equal(brandDesktopSource(branded), branded);
});

test(
	"actual build entry brands native sources through the child process and restores on nonzero exit",
	{ skip: process.platform === "win32" },
	(t) => {
		const { temp, originals, journal } = fixture(t);
		for (const folder of [
			"scripts",
			"bin",
			"profiles/cubeoffice/desktop",
			"als-office/apps/desktop/scripts",
		])
			mkdirSync(path.join(temp, folder), { recursive: true });
		for (const name of ["run-cubeoffice-desktop.mjs", "cubeoffice-branding.mjs"])
			writeFileSync(
				path.join(temp, "scripts", name),
				readFileSync(path.join(root, "scripts", name)),
			);
		writeFileSync(
			path.join(temp, "scripts/prepare-ofd-host.mjs"),
			"// No native compilation in this integration test.\n",
		);
		writeFileSync(
			path.join(temp, "profiles/cubeoffice/desktop/catalog.mjs"),
			'export const defaultProfile="cubeoffice"; export const profiles={cubeoffice:{},"cubeoffice-huawei":{}}; export const resolveDesktopAppProfileId=(id)=>id==="huawei"?"cubeoffice-huawei":id;',
		);
		writeFileSync(
			path.join(temp, "bin/npm"),
			`#!${process.execPath}
const fs = require('node:fs');
if (process.argv.includes('build') && process.env.CUBEOFFICE_NATIVE_BRANDING_SESSION) {
  if (!fs.readFileSync('src-tauri/src/native_tabs.rs','utf8').includes('.unwrap_or("CubeOffice")')) process.exit(9);
  console.log('nested renderer saw branded native sources');
}
`,
			{ mode: 0o755 },
		);
		writeFileSync(
			path.join(temp, "als-office/apps/desktop/scripts/build-desktop.mjs"),
			`
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const title = readFileSync('src-tauri/src/native_tabs.rs','utf8');
assert.ok(title.includes('.unwrap_or("CubeOffice")'));
assert.equal(process.env.DESKTOP_APP_PROFILE, process.env.EXPECT_PROFILE);
const renderer = spawnSync(process.execPath, ['../../../scripts/run-cubeoffice-desktop.mjs', '--renderer-only'], {stdio:'inherit',env:process.env});
assert.equal(renderer.status, 0);
assert.equal(readFileSync('src-tauri/src/native_tabs.rs','utf8'), title);
console.log('native builder saw CubeOffice');
process.exit(Number(process.env.BUILD_EXIT));
`,
		);
		for (const [channel, status] of [
			["direct", 0],
			["huawei", 7],
		]) {
			const result = spawnSync(
				process.execPath,
				[
					path.join(temp, "scripts/run-cubeoffice-desktop.mjs"),
					...(channel === "huawei" ? ["--channel", channel] : []),
				],
				{
					encoding: "utf8",
					env: {
						...process.env,
						PATH: `${path.join(temp, "bin")}${path.delimiter}${process.env.PATH}`,
						CUBEOFFICE_CHANNEL: "",
						DESKTOP_APP_PROFILE: "",
						CUBEOFFICE_NATIVE_BRANDING_SESSION: "",
						EXPECT_PROFILE: channel === "direct" ? "cubeoffice" : "cubeoffice-huawei",
						BUILD_EXIT: String(status),
					},
				},
			);
			assert.equal(result.status, status, result.stderr);
			assert.match(result.stdout, /native builder saw CubeOffice/);
			assert.match(result.stdout, /nested renderer saw branded native sources/);
			for (const [file, original] of originals)
				assert.equal(readFileSync(file, "utf8"), original);
			assert.equal(existsSync(journal), false);
		}
	},
);
