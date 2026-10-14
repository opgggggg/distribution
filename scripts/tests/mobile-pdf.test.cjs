const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { PDFDocument, PDFName } = require("pdf-lib");
const scope = { exports: {} };
vm.runInNewContext(
	ts.transpileModule(
		fs.readFileSync(
			require("node:path").join(
				__dirname,
				"../../apps/harmony/web/src/mobile/pdf-operations.ts",
			),
			"utf8",
		),
		{
			compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
		},
	).outputText,
	{ exports: scope.exports, require, Uint8Array, Blob },
);
const { changePdfPages, addPdfSignature } = scope.exports;
test("page organization preserves form values and widget references across export/reopen", async () => {
	const original = await PDFDocument.create();
	const first = original.addPage([300, 400]);
	original.addPage([500, 600]);
	const field = original.getForm().createTextField("Reference");
	field.setText("Keep this value");
	field.addToPage(first, { x: 20, y: 30, width: 100, height: 20 });
	let bytes = await original.save();
	bytes = await changePdfPages(bytes, { type: "rotate", page: 1 });
	bytes = await changePdfPages(bytes, { type: "move", page: 1, target: 2 });
	let reopened = await PDFDocument.load(bytes);
	assert.equal(reopened.getPage(0).getWidth(), 500);
	assert.equal(reopened.getPage(1).getRotation().angle, 90);
	assert.equal(reopened.getForm().getTextField("Reference").getText(), "Keep this value");
	assert.equal(
		reopened.getForm().getTextField("Reference").acroField.getWidgets()[0].P().toString(),
		reopened.getPage(1).ref.toString(),
	);
	bytes = await changePdfPages(bytes, { type: "delete", page: 1 });
	reopened = await PDFDocument.load(bytes);
	assert.equal(reopened.getPageCount(), 1);
	assert.equal(reopened.getForm().getTextField("Reference").getText(), "Keep this value");
	await assert.rejects(changePdfPages(bytes, { type: "delete", page: 1 }), /至少需要保留一页/);
});
test("signature is embedded into the exported PDF, including rotated pages", async () => {
	const png = Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2foAAAAASUVORK5CYII=",
		"base64",
	);
	const original = await PDFDocument.create();
	original.addPage([300, 400]);
	let bytes = await original.save();
	for (let turn = 0; turn < 4; turn++) {
		const signed = await addPdfSignature(bytes, png, 1, {
			x: 0.1,
			y: 0.2,
			width: 0.3,
			height: 0.1,
		});
		const reopened = await PDFDocument.load(signed);
		assert.ok(reopened.getPage(0).node.Resources().get(PDFName.of("XObject")));
		assert.equal(reopened.getPageCount(), 1);
		bytes = await changePdfPages(bytes, { type: "rotate", page: 1 });
	}
	await assert.rejects(
		addPdfSignature(bytes, png, 1, { x: 0.9, y: 0.2, width: 0.3, height: 0.1 }),
		/页面内/,
	);
});
