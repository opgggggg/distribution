import { readFileSync } from "node:fs";
import { createHash, createPublicKey, verify } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import assert from "node:assert/strict";

const [command, ...args] = process.argv.slice(2);
if (command === "signature") {
	const [publicFile, artifact] = args;
	const pub = Buffer.from(readFileSync(publicFile, "utf8").trim(), "base64")
		.toString()
		.trim()
		.split("\n");
	const rawKey = Buffer.from(pub[1], "base64");
	assert.equal(rawKey.length, 42);
	const key = createPublicKey({
		key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawKey.subarray(10)]),
		format: "der",
		type: "spki",
	});
	const lines = Buffer.from(readFileSync(artifact + ".sig", "utf8").trim(), "base64")
		.toString()
		.trim()
		.split("\n");
	const signature = Buffer.from(lines[1], "base64");
	assert.equal(signature.length, 74);
	assert(signature.subarray(2, 10).equals(rawKey.subarray(2, 10)), "Updater signing key changed");
	const algorithm = signature.subarray(0, 2).toString();
	assert(["ED", "Ed"].includes(algorithm));
	const content = readFileSync(artifact);
	const message =
		algorithm === "ED" ? createHash("blake2b512").update(content).digest() : content;
	assert(verify(null, message, key, signature.subarray(10)), "Invalid artifact signature");
	assert(lines[2].startsWith("trusted comment: "));
	assert(
		verify(
			null,
			Buffer.concat([
				signature.subarray(10),
				Buffer.from(lines[2].slice("trusted comment: ".length)),
			]),
			key,
			Buffer.from(lines[3], "base64"),
		),
		"Invalid trusted comment",
	);
	console.log("Signature verified:", path.basename(artifact));
} else if (command === "config") {
	const [file, version, publicFile] = args;
	const c = JSON.parse(readFileSync(file, "utf8"));
	assert.equal(c.productName, "CubeOffice");
	assert.equal(c.identifier, "com.cubexp.office");
	assert.equal(c.version, version);
	assert.equal(c.bundle.createUpdaterArtifacts, true);
	assert.deepEqual(c.plugins.updater.endpoints, ["https://cubexp.com/updates/latest.json"]);
	assert.equal(c.plugins.updater.pubkey.trim(), readFileSync(publicFile, "utf8").trim());
} else if (command === "feed") {
	const [source, file, version, code] = args;
	const require = createRequire(path.join(path.resolve(source), "package.json"));
	const ts = require("typescript");
	const text = readFileSync(
		path.join(source, "apps/harmony/web/src/services/client-services.ts"),
		"utf8",
	);
	const js = ts.transpileModule(text, {
		compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
	}).outputText;
	const { validateRelease } = await import(
		"data:text/javascript;base64," + Buffer.from(js).toString("base64")
	);
	const release = validateRelease(JSON.parse(readFileSync(file, "utf8")));
	assert.equal(release.versionName, version);
	assert.equal(release.versionCode, Number(code));
	assert.match(release.sha256, /^[a-f0-9]{64}$/);
	console.log("Actual Android client feed validator passed");
} else {
	throw new Error("Expected signature, config or feed");
}
