#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function assertMcpBranding(replies) {
	const initialized = replies.find((reply) => reply.id === 1)?.result;
	const listed = replies.find((reply) => reply.id === 2)?.result;
	assert.equal(initialized?.serverInfo?.name, "CubeOffice");
	assert.match(initialized?.instructions ?? "", /CubeOffice/);
	assert.ok(listed?.tools?.some((tool) => tool.name === "office_status"));
	assert.doesNotMatch(
		JSON.stringify(replies),
		/AuroraPrime/,
		"Packaged MCP instructions/tool descriptions retain upstream branding",
	);
}

export function checkDesktopBranding(binary) {
	const home = mkdtempSync(path.join(os.tmpdir(), "cubeoffice-mcp-branding-"));
	try {
		// Keep the protocol probe away from real AI settings and open documents.
		// Copy just the CLI: no sibling app can be auto-launched, even if a build
		// accidentally compiled the wrong application identifier.
		const probe = path.join(home, path.basename(binary));
		copyFileSync(binary, probe);
		chmodSync(probe, 0o700);
		const requests = [
			{
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-11-25",
					clientInfo: { name: "cubeoffice-branding-check", version: "1" },
				},
			},
			{ jsonrpc: "2.0", id: 2, method: "tools/list" },
		];
		const result = spawnSync(probe, ["mcp"], {
			input: requests.map((request) => JSON.stringify(request) + "\n").join(""),
			encoding: "utf8",
			timeout: 10_000,
			maxBuffer: 4 * 1024 * 1024,
			env: {
				...process.env,
				HOME: home,
				USERPROFILE: home,
				APPDATA: home,
				XDG_DATA_HOME: home,
			},
		});
		if (result.error) throw result.error;
		assert.equal(result.status, 0, result.stderr);
		const replies = result.stdout
			.trim()
			.split(/\r?\n/)
			.map((line) => JSON.parse(line));
		assertMcpBranding(replies);
		console.log("Packaged CubeOffice MCP branding and handshake passed");
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	if (!process.argv[2])
		throw new Error("Usage: node scripts/check-desktop-branding.mjs /path/to/cubeoffice[.exe]");
	checkDesktopBranding(path.resolve(process.argv[2]));
}
