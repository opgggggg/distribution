import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
import { validateOfdPackage } from "../dist/validate.js";
import { FormatsKernel, loadFormatsKernel } from "@cubexp/kernels";
const fixture = JSON.parse(
	await readFile(new URL("./fixtures/rust-validation.json", import.meta.url), "utf8"),
);
function source(item) {
	return zipSync(
		{
			...Object.fromEntries(Object.entries(item.parts).map(([p, s]) => [p, strToU8(s)])),
			...Object.fromEntries(
				Object.entries(item.binaryParts ?? {}).map(([p, s]) => [
					p,
					Buffer.from(s, "base64"),
				]),
			),
		},
		{ level: 0 },
	);
}
for (const item of fixture.cases)
	test(`Rust validation preserves original issues, schema details and ordering: ${item.name}`, async () => {
		assert.deepEqual(await validateOfdPackage(source(item)), item.expected);
	});
test("schema replies cannot be omitted, duplicated or redirected to another package part", async () => {
	await loadFormatsKernel();
	const core = new FormatsKernel("ofd");
	try {
		core.open(source(fixture.cases[0]));
		assert.throws(
			() => core.request({ op: "validationFinish", schemas: [] }),
			/Prepare validation/,
		);
		const plan = core.request({ op: "validationPlan" }),
			replies = plan.checkedParts.map((path) => ({ path, issues: [] }));
		assert.throws(() => core.request({ op: "validationFinish", schemas: [] }), /Missing XSD/);
		assert.throws(
			() => core.request({ op: "validationFinish", schemas: [...replies, replies[0]] }),
			/Duplicate XSD/,
		);
		assert.throws(
			() =>
				core.request({
					op: "validationFinish",
					schemas: [{ path: "wrong.xml", issues: [] }],
				}),
			/Unexpected XSD/,
		);
		assert.equal(core.request({ op: "validationFinish", schemas: replies }).valid, true);
		core.request({ op: "source" });
		assert.deepEqual(core.save(), source(fixture.cases[0]));
	} finally {
		core.close();
	}
});
