import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = resolve(root, "profiles/cubeoffice/wasm-assets.ts");
const source = await readFile(manifest, "utf8");
const expected = new Map();
for (const match of source.matchAll(/import \w+ from "([^"]+\.wasm)\?url"/g)) {
	const path = resolve(dirname(manifest), match[1]);
	const bytes = await readFile(path);
	if (!WebAssembly.validate(bytes)) throw Error(`Invalid upstream kernel ${path}`);
	expected.set(path.split("/").pop(), createHash("sha256").update(bytes).digest("hex"));
}
if (expected.size !== 11) throw Error(`Expected 11 matching kernel assets, got ${expected.size}`);
const notes = await readFile(resolve(root, "packages/notes/src/kernel/notes-kernel.wasm"));
if (!WebAssembly.validate(notes)) throw Error("Invalid CubeOffice notes Rust kernel");
expected.set("notes-kernel.wasm", createHash("sha256").update(notes).digest("hex"));
const formats = await readFile(resolve(root, "packages/kernels/src/formats-kernel.wasm"));
if (!WebAssembly.validate(formats)) throw Error("Invalid CubeOffice formats Rust kernel");
expected.set("formats-kernel.wasm", createHash("sha256").update(formats).digest("hex"));
const writerSource = await readFile(
	resolve(root, "packages/kernels/src/writer-generated.ts"),
	"utf8",
);
const writerBase64 = writerSource.match(/WRITER_WASM_BASE64 = "([A-Za-z0-9+/=]+)"/)?.[1];
if (!writerBase64 || !WebAssembly.validate(Buffer.from(writerBase64, "base64")))
	throw Error("Invalid synchronous Rust writer kernel");
for (const directory of process.argv.slice(2)) {
	const notices = await readFile(resolve(directory, "cubeoffice-rust-licenses.txt"));
	if (!notices.equals(await readFile(resolve(root, "packages/kernels/THIRD_PARTY_LICENSES.txt"))))
		throw Error(`${directory}: missing or mismatched Rust dependency notices`);
	const assets = resolve(directory, "assets");
	const actual = new Map();
	for (const name of await readdir(assets)) {
		if (!name.endsWith(".wasm")) continue;
		const bytes = await readFile(resolve(assets, name));
		actual.set(createHash("sha256").update(bytes).digest("hex"), name);
	}
	for (const [name, hash] of expected)
		if (!actual.has(hash)) throw Error(`${directory}: missing or mismatched ${name}`);
	let writerIncluded = false;
	for (const name of await readdir(assets)) {
		if (
			name.endsWith(".js") &&
			(await readFile(resolve(assets, name), "utf8")).includes(writerBase64)
		) {
			writerIncluded = true;
			break;
		}
	}
	if (!writerIncluded) throw Error(`${directory}: missing or mismatched synchronous Rust writer`);
	console.log(
		`${directory}: all ${expected.size} external Rust WASM artifacts and the synchronous Rust writer match their source builds`,
	);
}
