import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";
import { openXlsxEditing } from "@yaochn/als-office-xlsx";

const source = await readFile(
	new URL("../../apps/harmony/web/src/tsv-import.ts", import.meta.url),
	"utf8",
);
const compiled = ts
	.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
	})
	.outputText.replaceAll(
		'"@yaochn/als-office-xlsx"',
		JSON.stringify(import.meta.resolve("@yaochn/als-office-xlsx")),
	);
const { TSV_TO_XLSX_CONVERTER: converter } = await import(
	`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("TSV native import preserves quoted lines, Unicode and formula-like text through XLSX export", async () => {
	const text = 'Name\tValue\n"Line\nBreak"\t"=2+2"\n中文\t001';
	for (const blob of [new Blob([text]), new Blob([Buffer.from("\ufeff" + text, "utf16le")])]) {
		const output = await converter.convert({ kind: "bytes", blob, fileName: "data.tsv" });
		const { session } = await openXlsxEditing(output);
		try {
			assert.equal(session.getCellValue("data", "A2"), "Line\nBreak");
			assert.equal(session.getCellValue("data", "B2"), "=2+2");
			assert.equal(session.getCellValue("data", "A3"), "中文");
			assert.equal(session.getCellValue("data", "B3"), "001");
		} finally {
			session.dispose();
		}
	}
});

test("TSV import rejects cancelled and over-budget sources", async () => {
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(
		converter.convert(
			{ kind: "bytes", blob: new Blob(["a\tb"]), fileName: "data.tsv" },
			{ signal: controller.signal },
		),
		{ name: "AbortError" },
	);
	await assert.rejects(
		converter.convert({ kind: "bytes", blob: { size: 64 * 1024 * 1024 + 1 } }),
		/64 MiB/,
	);
});
