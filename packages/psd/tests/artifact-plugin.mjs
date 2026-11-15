import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ArtifactEngine } from "@yaochn/als-office-editor-core";
import { loadPsd } from "./helpers.mjs";

const psd = await loadPsd();
const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(path.join(here, "fixtures/sample-layers.psd"));

test("PSD plugin creates, detects, edits, exports, and reopens native artifacts", async () => {
	assert.equal(psd.PSD_FORMAT_MANIFEST.id, "psd");
	assert.equal(psd.PSD_FORMAT_MANIFEST.capabilities["layer-editing"], true);
	const engine = new ArtifactEngine([psd.PSD_ARTIFACT_PLUGIN]);
	const session = await engine.create({
		format: "psd",
		artifactId: "contract-psd",
		options: { width: 32, height: 24, resolutionPpi: 144 },
	});
	assert.deepEqual(session.getState(), { revision: 0, dirty: false, readonly: false });
	const context = await session.execute({ commands: [{ type: "context.get" }] });
	assert.equal(context.wrote, false);
	assert.equal(context.noop, true);
	assert.equal(context.result.values[0].canvas.width, 32);

	const write = await session.execute({
		commands: [
			{
				type: "layer.add",
				name: "Contract layer",
				color: { r: 20, g: 40, b: 60 },
				rect: { x: 2, y: 3, width: 8, height: 6 },
			},
		],
		baseRevision: 0,
		summary: "Add contract layer",
	});
	assert.equal(write.wrote, true);
	assert.equal(write.noop, false);
	assert.equal(session.getState().dirty, true);
	const blob = await session.export();
	assert.ok(blob.size > 0);
	await engine.close(session.artifactId);

	const detected = await engine.open({ source: blob, artifactId: "detected-psd" });
	assert.equal(detected.format, "psd");
	assert.equal(detected.getState().readonly, false);
	await engine.closeAll();
});

test("PSD plugin probes native bytes and enforces read-only access", async () => {
	assert.equal(await psd.PSD_ARTIFACT_PLUGIN.canOpen({ source: fixture }), true);
	assert.equal(
		await psd.PSD_ARTIFACT_PLUGIN.canOpen({ source: new Uint8Array([1, 2, 3]) }),
		false,
	);
	const session = await psd.PSD_ARTIFACT_PLUGIN.open({
		source: fixture,
		artifactId: "readonly-psd",
		access: "read",
	});
	assert.equal(session.getState().readonly, true);
	await assert.rejects(
		session.execute({ commands: [{ type: "layer.add", name: "Nope" }] }),
		/read-only|unavailable/iu,
	);
	await session.close();
});
