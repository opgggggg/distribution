/** Frozen independent reference; production code never imports this module. */
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";
export const OFD_ORACLE_COMMIT = "43022d3584827e6adb89c18f1d7fa5b50ed17b21";
const root = fileURLToPath(new URL("../", import.meta.url));
let loaded;
const directory = path.join(root, ".cache/notes-qa/ofd-render-oracle", OFD_ORACLE_COMMIT);
export async function originalOfdModule(name) {
	if (
		!["read", "write", "signatures", "package", "archive", "validate", "codecs", "strokes"].includes(
			name,
		)
	)
		throw Error("Unsupported oracle entry");
	await originalOfdRenderer();
	return import(pathToFileURL(path.join(directory, `${name}.mjs`)).href);
}
export function originalOfdRenderer() {
	return (loaded ??= (async () => {
		const scratch = path.join(root, ".cache/notes-qa/ofd-render-oracle", OFD_ORACLE_COMMIT);
		await mkdir(scratch, { recursive: true });
		const queue = ["read", "write", "signatures", "package", "validate", "strokes"],
			seen = new Set();
		while (queue.length) {
			const name = queue.shift();
			if (seen.has(name)) continue;
			seen.add(name);
			const result = spawnSync(
				"git",
				["show", `${OFD_ORACLE_COMMIT}:packages/ofd/src/${name}.ts`],
				{ cwd: root, encoding: "utf8" },
			);
			if (result.status !== 0) throw Error(result.stderr);
			const source = ts
				.transpileModule(result.stdout, {
					compilerOptions: {
						target: ts.ScriptTarget.ES2022,
						module: ts.ModuleKind.ES2022,
					},
				})
				.outputText.replace(
					/((?:from\s*|import\()\s*["'])\.\/([a-zA-Z0-9/_-]+)\.js(["'])/g,
					(_all, prefix, file, quote) => {
						queue.push(file);
						return `${prefix}./${file}.mjs${quote}`;
					},
				);
			await writeFile(path.join(scratch, `${name}.mjs`), source);
		}
		return import(pathToFileURL(path.join(scratch, "read.mjs")).href);
	})());
}
