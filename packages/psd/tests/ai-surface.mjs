import test from "node:test";
import assert from "node:assert/strict";
import { loadPsd, makeDocument, rasterLayer, solidBitmap } from "./helpers.mjs";

const psd = await loadPsd();

function newHost(options = {}) {
	const layers = options.layers ?? [
		rasterLayer(psd, "L1", "Background", { bitmap: solidBitmap(psd, 32, 32, 9, 9, 9) }),
		rasterLayer(psd, "L2", "Hero", { bitmap: solidBitmap(psd, 16, 16, 200, 0, 0) }),
	];
	const document = makeDocument(psd, layers, options.documentOptions ?? {});
	const session = new psd.PsdEditorSession(document);
	const adapter = {
		session,
		document: () => session.peekDocument(),
		getSelection: () => ({ layerIds: ["L2"] }),
		...options.adapter,
	};
	return { api: psd.createPsdAiApi(adapter), session, adapter };
}

// --- manifest gate ---

test("manifest discovery index carries no schemas and a stable hash", () => {
	const { api } = newHost();
	const manifest = api.getManifest();
	assert.ok(manifest.manifestHash.startsWith("m2-"));
	assert.ok(manifest.commands.length > 20);
	assert.ok(manifest.commands.every((entry) => !("schema" in entry)));
	assert.equal(manifest.manifestHash, api.getManifest().manifestHash);
	assert.ok(manifest.coordinateSpace.origin === "top-left");
});

test("exact types return signatures; json-schema returns the machine form with $defs", () => {
	const { api } = newHost();
	const signatures = api.getManifest({ types: ["stroke.apply"] });
	assert.equal(signatures.signatures.length, 1);
	assert.match(signatures.signatures[0], /stroke\.apply/);

	const machine = api.getManifest({ types: ["stroke.apply"], format: "json-schema" });
	assert.ok(machine.schemas["stroke.apply"]);
	assert.ok(machine.$defs.point, "reachable defs are included");
});

test("every editor action field is published by its AI schema", () => {
	for (const type of psd.PSD_ACTION_TYPES) {
		const action = psd.psdActionDescriptor(type);
		const ai = psd.psdAiCommandDescriptor(type);
		assert.ok(ai, `${type} has an AI command`);
		const properties = Object.keys(ai.schema.properties)
			.filter((field) => field !== "type")
			.sort();
		assert.deepEqual(
			properties,
			[...action.required, ...action.optional].sort(),
			`${type} publishes every accepted field`,
		);
		assert.deepEqual(
			ai.schema.required.filter((field) => field !== "type").sort(),
			[...action.required].sort(),
			`${type} requiredness matches the action validator`,
		);
		assert.equal(ai.effect, "write");
		assert.ok(ai.group, `${type} has a command group`);
	}
});

test("unknown groups and types are reported tolerantly", () => {
	const { api } = newHost();
	const manifest = api.getManifest({ groups: ["layers", "nonsense"] });
	assert.deepEqual(manifest.unknown.groups, ["nonsense"]);
	assert.ok(manifest.commands.every((entry) => entry.group === "layers"));

	const byType = api.getManifest({ types: ["layer.explode"] });
	assert.ok(byType.unknown.types[0].startsWith("layer.explode"));
});

test("read-only sessions omit write commands entirely", () => {
	const { api } = newHost({ adapter: { readOnly: true } });
	const manifest = api.getManifest();
	assert.ok(manifest.unavailable);
	assert.ok(manifest.commands.every((entry) => entry.effect === "read"));
});

// --- validator gate ---

test("unknown commands get did-you-mean; write-shaped ones get ReadOnly in read sessions", async () => {
	const { api } = newHost();
	await assert.rejects(
		api.execute({ type: "layer.rname", layerId: "L1", name: "x" }),
		(error) => {
			assert.equal(error.code, "NotSupported");
			assert.match(error.message, /layer\.rename/);
			return true;
		},
	);

	const readOnly = newHost({ adapter: { readOnly: true } });
	await assert.rejects(
		readOnly.api.execute({ type: "layer.setBananas" }),
		(error) => error.code === "ReadOnly",
	);
});

test("unknown nested fields are rejected with a path", async () => {
	const { api } = newHost();
	await assert.rejects(
		api.execute({
			type: "fill.apply",
			layerId: "L1",
			color: { r: 1, g: 2, b: 3, a: 9 },
		}),
		(error) => {
			assert.equal(error.code, "InvalidArgument");
			assert.match(error.path ?? "", /color/);
			return true;
		},
	);
});

test("conditional action requirements are rejected at the AI boundary", async () => {
	const cases = [
		{
			command: { type: "transform.apply", layerId: "L1", operation: "rotate" },
			path: "degrees",
		},
		{
			command: {
				type: "stroke.apply",
				layerId: "L1",
				tool: "brush",
				points: [{ x: 1, y: 1 }],
				size: 4,
			},
			path: "color",
		},
		{
			command: {
				type: "stroke.apply",
				layerId: "L1",
				tool: "clone",
				points: [{ x: 1, y: 1 }],
				size: 4,
			},
			path: "sourceOffset",
		},
		{
			command: {
				type: "shape.apply",
				layerId: "L1",
				shape: "rectangle",
				x: 0,
				y: 0,
				width: 4,
				height: 4,
			},
			path: "fill",
		},
	];
	for (const { command, path } of cases) {
		const { api } = newHost();
		await assert.rejects(
			api.execute(command),
			(error) => error.code === "InvalidArgument" && error.path === path,
			`${command.type} rejects missing ${path}`,
		);
	}
});

// --- authorship gate ---

test("host-assigned fields are refused on any command", async () => {
	const { api } = newHost();
	for (const field of ["actorId", "timestamp", "source"]) {
		await assert.rejects(
			api.execute({ type: "layer.rename", layerId: "L1", name: "x", [field]: "forged" }),
			(error) => error.code === "InvalidArgument" && error.path === field,
		);
	}
});

// --- transaction + write-result gate ---

test("writes report truthful created/affected/deleted ids and revision", async () => {
	const { api, session } = newHost();
	const result = await api.execute([
		{ type: "layer.add", name: "fresh", color: { r: 0, g: 0, b: 255 } },
		{ type: "layer.rename", layerId: "L2", name: "Hero 2" },
		{ type: "layer.delete", layerIds: ["L1"] },
	]);
	assert.equal(result.success, true);
	assert.equal(result.revision, session.getRevision());
	assert.equal(result.createdIds.length, 1);
	assert.ok(result.affectedIds.includes("L2"));
	assert.deepEqual(result.deletedIds, ["L1"]);
	assert.ok(!result.noop);
});

test("no-effect writes report noop", async () => {
	const { api } = newHost();
	const result = await api.execute({ type: "layer.setVisible", layerId: "L2", visible: true });
	assert.equal(result.noop, true);
});

test("a batch is atomic and a mid-batch failure leaves the document untouched", async () => {
	const { api, session } = newHost();
	await assert.rejects(
		api.execute([
			{ type: "layer.rename", layerId: "L1", name: "will not stick" },
			{ type: "layer.delete", layerIds: ["nope"] },
		]),
	);
	assert.equal(session.peekDocument().layers[0].name, "Background");
	assert.equal(session.getRevision(), 0);
});

test("reads observe writes that precede them in the batch", async () => {
	const { api } = newHost();
	const result = await api.execute([
		{ type: "layer.rename", layerId: "L2", name: "Renamed mid-batch" },
		{ type: "layer.get", layerId: "L2" },
	]);
	assert.equal(result.values[1].name, "Renamed mid-batch");
});

test("baseRevision conflicts refuse before execution", async () => {
	const { api, session } = newHost();
	session.apply([{ type: "layer.rename", layerId: "L1", name: "user edit" }]);
	await assert.rejects(
		api.execute({ type: "layer.rename", layerId: "L1", name: "stale" }, { baseRevision: 0 }),
		(error) => error.code === "RevisionConflict",
	);
	assert.equal(session.peekDocument().layers[0].name, "user edit");
});

test("permission is asked for every write before any execution", async () => {
	const asked = [];
	const { api, session } = newHost({
		adapter: {
			permission: (action) => {
				asked.push(action.type);
				return action.type !== "layer.delete";
			},
		},
	});
	await assert.rejects(
		api.execute([
			{ type: "layer.rename", layerId: "L1", name: "x" },
			{ type: "layer.delete", layerIds: ["L2"] },
		]),
		(error) => error.code === "PermissionDenied",
	);
	assert.deepEqual(asked, ["layer.rename", "layer.delete"]);
	assert.equal(session.getRevision(), 0, "a refusal leaves the document untouched");
});

// --- readonly gate ---

test("every write entry point fails in a read-only session", async () => {
	const { api } = newHost({ adapter: { readOnly: true } });
	for (const type of psd.PSD_ACTION_TYPES) {
		await assert.rejects(
			api.execute({ type, layerId: "L1" }),
			(error) => error.code === "ReadOnly",
			`${type} must be refused`,
		);
	}
});

test("read-only documents (unsupported modes) auto-report read access", () => {
	const layers = [rasterLayer(psd, "L1", "x", { bitmap: solidBitmap(psd, 4, 4, 1, 1, 1) })];
	const document = makeDocument(psd, layers);
	document.editable = false;
	const session = new psd.PsdEditorSession(document);
	const api = psd.createPsdAiApi({ session, document: () => session.peekDocument() });
	assert.equal(api.getContext().access, "read");
});

// --- response budget gate ---

test("context.get stays constant-size on large documents", () => {
	const layers = Array.from({ length: 500 }, (_, index) =>
		rasterLayer(psd, `L${index + 1}`, `Layer with a fairly long descriptive name ${index}`, {
			bitmap: solidBitmap(psd, 1, 1, 0, 0, 0),
		}),
	);
	const { api } = newHost({ layers });
	assert.equal(api.getContext().layerCount, 500);
	const bytes = JSON.stringify(api.getContext()).length;
	assert.ok(bytes <= 1_000, `context is ${bytes} bytes`);
});

test("document.get refuses over budget instead of trimming", async () => {
	const layers = Array.from({ length: 500 }, (_, index) =>
		rasterLayer(psd, `L${index + 1}`, `Layer ${index} `.repeat(20), {
			bitmap: solidBitmap(psd, 1, 1, 0, 0, 0),
		}),
	);
	const { api } = newHost({
		layers,
		adapter: { maxResponseBytes: 20_000 },
	});
	await assert.rejects(api.execute({ type: "document.get" }), (error) => {
		assert.equal(error.code, "LimitExceeded");
		assert.match(error.message, /layers\.list/);
		return true;
	});
});

test("layers.list pages by default and truncates honestly under pressure", async () => {
	const layers = Array.from({ length: 120 }, (_, index) =>
		rasterLayer(psd, `L${index + 1}`, `Layer ${index}`, {
			bitmap: solidBitmap(psd, 1, 1, 0, 0, 0),
		}),
	);
	const { api } = newHost({ layers });
	const page = (await api.execute({ type: "layers.list" })).values[0];
	assert.equal(page.returned, 50);
	assert.equal(page.total, 120);

	const squeezed = newHost({ layers, adapter: { maxResponseBytes: 2_000 } });
	const tight = (await squeezed.api.execute({ type: "layers.list" })).values[0];
	assert.ok(tight.truncated, "truncation is marked");
	assert.equal(tight.items.length, tight.returned);
	assert.ok(tight.returned < 50);
});

test("batch size and request byte limits are enforced", async () => {
	const { api } = newHost();
	await assert.rejects(
		api.execute(Array.from({ length: 101 }, () => ({ type: "context.get" }))),
		(error) => error.code === "LimitExceeded",
	);
	await assert.rejects(
		api.execute({
			type: "layer.rename",
			layerId: "L1",
			name: "x".repeat(300_000),
		}),
		(error) => error.code === "LimitExceeded",
	);
});

// --- reads ---

test("text.find matches names and text layers", async () => {
	const { api } = newHost();
	const result = await api.execute({ type: "text.find", query: "hero" });
	assert.equal(result.values[0].items[0].layerId, "L2");
	assert.equal(result.values[0].items[0].field, "name");
});

test("text.find and history.get page with truthful totals", async () => {
	const layers = Array.from({ length: 6 }, (_, index) =>
		rasterLayer(psd, `L${index + 1}`, `Hero ${index}`, {
			bitmap: solidBitmap(psd, 1, 1, index, 0, 0),
		}),
	);
	const { api } = newHost({ layers });
	const found = (await api.execute({ type: "text.find", query: "hero", offset: 2, limit: 2 }))
		.values[0];
	assert.equal(found.total, 6);
	assert.equal(found.offset, 2);
	assert.equal(found.returned, 2);

	for (let index = 0; index < 4; index++) {
		await api.execute({ type: "layer.rename", layerId: "L1", name: `Renamed ${index}` });
	}
	const history = (await api.execute({ type: "history.get", offset: 1, limit: 2 })).values[0];
	assert.equal(history.total, 5);
	assert.equal(history.offset, 1);
	assert.equal(history.returned, 2);
	assert.equal(history.canUndo, true);
});

test("pixel.sample reads composite and raw layer pixels in canvas coordinates", async () => {
	const { api } = newHost();
	const composite = (await api.execute({ type: "pixel.sample", x: 0, y: 0 })).values[0];
	assert.deepEqual(composite.color, { r: 200, g: 0, b: 0, a: 255 });
	assert.equal(composite.hex, "#C80000");
	assert.equal(composite.source, "composite");

	const layer = (await api.execute({ type: "pixel.sample", x: 0, y: 0, layerId: "L1" }))
		.values[0];
	assert.deepEqual(layer.color, { r: 9, g: 9, b: 9, a: 255 });
	assert.deepEqual(layer.source, { layerId: "L1" });
});

test("layer.get exposes editable text style", async () => {
	const { api } = newHost();
	const created = await api.execute({
		type: "text.addLayer",
		text: "AI text",
		x: 5,
		y: 7,
	});
	const layerId = created.createdIds[0];
	const style = {
		fontFamily: "Georgia",
		fontSize: 28,
		bold: true,
		italic: true,
		underline: false,
		strikethrough: false,
		color: { r: 10, g: 20, b: 30 },
	};
	await api.execute({ type: "text.setStyle", layerId, style });
	const detail = (await api.execute({ type: "layer.get", layerId })).values[0];
	assert.equal(detail.text, "AI text");
	assert.deepEqual(detail.textStyle, style);
});

test("view.reveal requires a host handler and never mutates", async () => {
	const revealed = [];
	const withHandler = newHost({ adapter: { revealLayer: (id) => revealed.push(id) } });
	const result = await withHandler.api.execute({ type: "view.reveal", layerId: "L2" });
	assert.deepEqual(revealed, ["L2"]);
	assert.equal(result.values[0].revealed, true);
	assert.equal(withHandler.session.getRevision(), 0);
	await assert.rejects(
		withHandler.api.execute({ type: "view.reveal", layerId: "missing" }),
		(error) => error.code === "InvalidArgument" && error.path === "layerId",
	);

	const readOnly = newHost({
		adapter: { readOnly: true, revealLayer: (id) => revealed.push(id) },
	});
	assert.ok(readOnly.api.getManifest().commands.some((entry) => entry.type === "view.reveal"));
	await readOnly.api.execute({ type: "view.reveal", layerId: "L1" });

	const withoutHandler = newHost();
	await assert.rejects(
		withoutHandler.api.execute({ type: "view.reveal", layerId: "L2" }),
		(error) => error.code === "NotSupported",
	);
});

// --- persistence ---

test("document.save is host-gated, single-command, and idempotent per revision", async () => {
	let persistCalls = 0;
	const { api } = newHost({
		adapter: {
			persist: () => {
				persistCalls++;
				return { persisted: true, versionId: `v${persistCalls}` };
			},
		},
	});
	await assert.rejects(
		api.execute([{ type: "document.save" }, { type: "context.get" }]),
		(error) => error.code === "InvalidArgument",
	);
	const first = await api.execute({ type: "document.save" });
	assert.equal(first.persistence.persisted, true);
	const second = await api.execute({ type: "document.save" });
	assert.equal(second.persistence.unchanged, true);
	assert.equal(persistCalls, 1);
});

test("document.save is absent without a persist handler", () => {
	const { api } = newHost();
	assert.ok(!api.getManifest().commands.some((entry) => entry.type === "document.save"));
});

test("writes offer post-commit persistence to the host", async () => {
	const triggers = [];
	const { api } = newHost({
		adapter: {
			persist: (request) => {
				triggers.push(request.trigger);
				return { persisted: true };
			},
		},
	});
	const result = await api.execute({ type: "layer.rename", layerId: "L1", name: "saved" });
	assert.deepEqual(triggers, ["write"]);
	assert.equal(result.persistence.persisted, true);
});

// --- change notifications ---

test("subscribers hear about transactions and history moves", async () => {
	const { api, session } = newHost();
	const reasons = [];
	const unsubscribe = api.subscribe((reason) => reasons.push(reason));
	await api.execute({ type: "layer.rename", layerId: "L1", name: "x" });
	session.undo();
	unsubscribe();
	session.redo();
	assert.deepEqual(reasons, ["transaction", "history"]);
});
