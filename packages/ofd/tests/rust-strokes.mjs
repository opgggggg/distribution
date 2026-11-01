import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DOMParser } from "@xmldom/xmldom";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { svgAtDeviceScale, strokeScale, deviceLineWidth } from "../dist/strokes.js";
import { renderNativeSvg } from "../dist/render-node.js";
const fixture = JSON.parse(
	await readFile(new URL("./fixtures/rust-strokes.json", import.meta.url), "utf8"),
);
const close = (a, b) =>
	assert.ok(Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b)), `${a} != ${b}`);
test("synchronous Rust stroke geometry matches 41 original projections", () => {
	for (const item of fixture.matrices) close(strokeScale(item.matrix), item.expected);
	for (const item of fixture.widths)
		close(deviceLineWidth(item.width, item.transformScale, item.deviceScale), item.expected);
});
for (const item of fixture.cases)
	test(`Rust final stroke attributes and pixels match the original at scale ${item.scale}`, async () => {
		const actual = svgAtDeviceScale(item.svg, item.scale);
		const nodes = (svg) =>
			Array.from(
				new DOMParser()
					.parseFromString(svg, "application/xml")
					.getElementsByTagName("path"),
			);
		const got = nodes(actual),
			expected = nodes(item.expected);
		assert.equal(got.length, expected.length);
		for (let i = 0; i < got.length; i++) {
			close(
				Number(got[i].getAttribute("stroke-width")),
				Number(expected[i].getAttribute("stroke-width")),
			);
			close(
				Number(got[i].getAttribute("stroke-miterlimit")),
				Number(expected[i].getAttribute("stroke-miterlimit")),
			);
		}
		const pixels = async (svg) => {
			const image = await loadImage(
				Buffer.from(await renderNativeSvg(svg, 160, "sans-serif")),
			);
			const canvas = createCanvas(image.width, image.height),
				ctx = canvas.getContext("2d");
			ctx.drawImage(image, 0, 0);
			return ctx.getImageData(0, 0, image.width, image.height).data;
		};
		assert.deepEqual(await pixels(actual), await pixels(item.expected));
	});
test("Rust device-scale rewriting preserves unrelated XML and rejects invalid requests", () => {
	const input = fixture.cases[0].svg,
		output = svgAtDeviceScale(input, 2);
	assert.ok(output.includes("<!-- keep > &lt; -->"));
	assert.ok(output.includes('data-note="中文 &amp; &quot; >"'));
	for (const scale of [0, -1, NaN, Infinity])
		assert.throws(() => svgAtDeviceScale(input, scale), RangeError);
	assert.throws(() => deviceLineWidth(-1, 1), /non-negative/);
	assert.throws(() => svgAtDeviceScale('<!DOCTYPE svg><svg data-ofd-line-width="1"/>', 1), /DTD/);
	assert.equal(svgAtDeviceScale("<svg/>", 1), "<svg/>");
	assert.match(svgAtDeviceScale(input, 2), /stroke-width="0.132291/);
});
