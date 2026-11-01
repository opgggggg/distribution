import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readOfdDocument, openOfdPackage } from "../dist/index.js";
import { renderNativeSvg } from "../dist/render-node.js";
import { FormatsKernel, loadFormatsKernel } from "@cubexp/kernels";
const fixtures = JSON.parse(
	await readFile(new URL("./fixtures/rust-render.json", import.meta.url), "utf8"),
);
const font = await readFile(
	new URL(
		"../../standard_fonts/LiberationSans-Regular.ttf",
		import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"),
	),
);
function source(item) {
	return zipSync(
		{
			...Object.fromEntries(Object.entries(item.parts).map(([p, s]) => [p, strToU8(s)])),
			...Object.fromEntries(
				Object.entries(item.binaryParts ?? {}).map(([p, b]) => [
					p,
					new Uint8Array(Buffer.from(b, "base64")),
				]),
			),
		},
		{ level: 0 },
	);
}
function options(item) {
	return {
		...(item.fontOverrides
			? {
					fonts: Object.fromEntries(
						Object.keys(item.fontOverrides).map((key) => [key, font]),
					),
				}
			: {}),
		...(item.colorProvider
			? {
					colorConverter: (_values, space) =>
						space.profile?.[0] === 1 ? [12, 100, 200] : [0, 0, 0],
				}
			: {}),
	};
}
function structure(document) {
	return JSON.parse(
		JSON.stringify(document, (key, value) =>
			key === "svg" || key === "html" ? "<rendered separately>" : value,
		),
	);
}
async function pixels(svg) {
	const png = await renderNativeSvg(svg, 240, "sans-serif"),
		image = await loadImage(Buffer.from(png)),
		canvas = createCanvas(image.width, image.height),
		ctx = canvas.getContext("2d");
	ctx.drawImage(image, 0, 0);
	return {
		width: image.width,
		height: image.height,
		data: ctx.getImageData(0, 0, image.width, image.height).data,
	};
}
for (const fixture of fixtures.cases)
	test(`Rust complete page matches original semantics and pixels: ${fixture.name}`, async (t) => {
		const actual = await readOfdDocument(source(fixture), options(fixture));
		assert.deepEqual(structure(actual), structure(fixture.expected));
		for (let i = 0; i < actual.pages.length; i++) {
			const [a, b] = await Promise.all([
				pixels(actual.pages[i].svg),
				pixels(fixture.expected.pages[i].svg),
			]);
			assert.equal(a.width, b.width);
			assert.equal(a.height, b.height);
			let error = 0,
				max = 0;
			for (let j = 0; j < a.data.length; j++) {
				const delta = Math.abs(a.data[j] - b.data[j]);
				error += delta;
				max = Math.max(max, delta);
			}
			const mean = error / a.data.length / 255;
			t.diagnostic(`page ${i}: normalized mean error ${mean}, maximum channel delta ${max}`);
			assert.ok(mean <= 0.00001 && max <= 2, `${fixture.name}: mean ${mean}, max ${max}`);
		}
	});
test("throwing color providers and invalid results leave the core reusable and its source unchanged", async () => {
	await loadFormatsKernel();
	const core = new FormatsKernel("ofd"),
		input = source(fixtures.cases.find((c) => c.colorProvider));
	try {
		core.open(input);
		core.request({ op: "renderBegin" });
		core.setColorProvider(() => {
			throw Error("provider offline");
		});
		assert.throws(
			() => core.request({ op: "render", options: { colorConverter: true } }),
			/provider offline/,
		);
		core.setColorProvider(() => {
			core.request({ op: "state" });
			return [0, 0, 0];
		});
		assert.throws(
			() => core.request({ op: "render", options: { colorConverter: true } }),
			/cannot re-enter/,
		);
		core.setColorProvider(
			() =>
				new Proxy([0, 0, 0], {
					get(target, key) {
						if (key === "0") core.request({ op: "state" });
						return Reflect.get(target, key);
					},
				}),
		);
		assert.throws(
			() => core.request({ op: "render", options: { colorConverter: true } }),
			/cannot re-enter/,
		);
		core.setColorProvider(() => {
			const failure = new Error();
			Object.defineProperty(failure, "message", {
				get() {
					core.close();
					return "unreachable";
				},
			});
			throw failure;
		});
		assert.throws(
			() => core.request({ op: "render", options: { colorConverter: true } }),
			/color provider failed/,
		);
		core.setColorProvider(() => [NaN, 0, 0]);
		assert.throws(
			() => core.request({ op: "render", options: { colorConverter: true } }),
			/Invalid colorConverter/,
		);
		core.setColorProvider(() => [12, 100, 200]);
		assert.equal(
			core.request({ op: "render", options: { colorConverter: true } }).pages.length,
			1,
		);
		core.request({ op: "renderEnd" });
		core.request({ op: "source" });
		assert.deepEqual(core.save(), input);
	} finally {
		core.close();
	}
});
test("font/render asset stages and decoded overrides never enter the source package or another document", async () => {
	await loadFormatsKernel();
	const input = source(fixtures.cases[0]),
		a = new FormatsKernel("ofd"),
		b = new FormatsKernel("ofd");
	try {
		for (const core of [a, b]) {
			core.open(input);
			core.request({ op: "renderBegin" });
		}
		a.setPart(
			"Doc/Page.xml",
			new TextEncoder().encode(
				"<Page><Area><PhysicalBox>0 0 10 10</PhysicalBox></Area><Content/></Page>",
			),
			true,
		);
		a.setRenderAsset("font", font);
		assert.ok(a.request({ op: "render", options: {} }).pages[0].width < 40);
		assert.ok(b.request({ op: "render", options: {} }).pages[0].width > 100);
		a.request({ op: "renderEnd" });
		a.request({ op: "renderBegin" });
		assert.ok(a.request({ op: "render", options: {} }).pages[0].width > 100);
		a.request({ op: "renderEnd" });
		a.request({ op: "write" });
		assert.deepEqual(a.save(), input);
		assert.equal(a.request({ op: "state" }).dirty, false);
	} finally {
		a.close();
		b.close();
	}
});
test("Rust enforces renderer limits and repeated calls cannot retain stale diagnostics or styles", async () => {
	const input = source(fixtures.cases[0]);
	await assert.rejects(readOfdDocument(input, { maxObjects: 1 }), /Too many OFD objects/);
	await assert.rejects(readOfdDocument(input, { maxSvgBytes: 16 }), /size budget/);
	const [a, b] = await Promise.all([
		readOfdDocument(input),
		readOfdDocument(
			source(fixtures.cases.find((c) => c.fontOverrides)),
			options(fixtures.cases.find((c) => c.fontOverrides)),
		),
	]);
	assert.equal(a.pages.length, 1);
	assert.equal(b.pages.length, 1);
	assert.deepEqual(structure(a), structure(fixtures.cases[0].expected));
	const pkg = await openOfdPackage(input);
	assert.equal(pkg.dirty, false);
	assert.deepEqual(new Uint8Array(await pkg.write().arrayBuffer()), input);
});
