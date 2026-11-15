import test from "node:test";
import assert from "node:assert/strict";
import {
	loadPsd,
	makeDocument,
	rasterLayer,
	solidBitmap,
	emptyLocks,
	pixelAt,
	makeTySh,
} from "./helpers.mjs";

const psd = await loadPsd();

function sampleDocument() {
	const mask = {
		top: 2,
		left: 2,
		bottom: 6,
		right: 10,
		defaultColor: 255,
		disabled: false,
		data: new Uint8Array(8 * 4).fill(128),
	};
	return makeDocument(
		psd,
		[
			rasterLayer(psd, "L1", "背景 Background", {
				bitmap: solidBitmap(psd, 64, 48, 210, 40, 20),
			}),
			{
				kind: "group",
				id: "L2",
				name: "Group 组",
				visible: true,
				opacity: 0.75,
				blendMode: "multiply",
				clipping: false,
				locks: emptyLocks(),
				preservedBlocks: [],
				open: false,
				children: [
					rasterLayer(psd, "L3", "dot", {
						top: 8,
						left: 12,
						opacity: 0.5,
						blendMode: "screen",
						bitmap: solidBitmap(psd, 10, 6, 5, 250, 90, 200),
						locks: {
							transparency: true,
							composite: false,
							position: false,
							all: false,
						},
						mask,
						preservedBlocks: [
							{ signature: "8BIM", key: "abcd", data: new Uint8Array([1, 2, 3]) },
						],
					}),
				],
			},
		],
		{
			resolutionPpi: 144,
			preservedGlobalBlocks: [
				{ signature: "8BIM", key: "Patt", data: new Uint8Array([7, 7, 7, 7, 7]) },
			],
			globalLayerMaskInfo: new Uint8Array(0),
		},
	);
}

test("read(write(doc)) preserves structure, pixels, and preserved bytes", () => {
	const original = sampleDocument();
	const bytes = psd.writePsd(original);
	const reread = psd.readPsd(bytes);

	assert.equal(reread.width, 64);
	assert.equal(reread.height, 48);
	assert.equal(reread.colorMode, "rgb");
	assert.equal(reread.editable, true);
	assert.equal(reread.resolutionPpi, 144);

	assert.equal(reread.layers.length, 2);
	const [background, group] = reread.layers;
	assert.equal(background.name, "背景 Background");
	assert.deepEqual(pixelAt(background.bitmap, 0, 0), [210, 40, 20, 255]);

	assert.equal(group.kind, "group");
	assert.equal(group.name, "Group 组");
	assert.equal(group.open, false);
	assert.equal(group.blendMode, "multiply");
	assert.ok(Math.abs(group.opacity - 0.75) < 0.01);

	const dot = group.children[0];
	assert.equal(dot.kind, "raster");
	assert.equal(dot.top, 8);
	assert.equal(dot.left, 12);
	assert.equal(dot.blendMode, "screen");
	assert.ok(Math.abs(dot.opacity - 0.5) < 0.01);
	assert.equal(dot.locks.transparency, true);
	assert.deepEqual(pixelAt(dot.bitmap, 3, 3), [5, 250, 90, 200]);

	// Layer mask round trip.
	assert.ok(dot.mask);
	assert.equal(dot.mask.left, 2);
	assert.equal(dot.mask.right, 10);
	assert.equal(dot.mask.data[0], 128);

	// Source preservation: unknown blocks byte-identical.
	assert.equal(dot.preservedBlocks.length, 1);
	assert.equal(dot.preservedBlocks[0].key, "abcd");
	assert.deepEqual([...dot.preservedBlocks[0].data], [1, 2, 3]);
	assert.equal(reread.preservedGlobalBlocks.length, 1);
	assert.equal(reread.preservedGlobalBlocks[0].key, "Patt");
	assert.deepEqual([...reread.preservedGlobalBlocks[0].data], [7, 7, 7, 7, 7]);
});

test("write is stable: a second round trip is byte-identical", () => {
	const original = sampleDocument();
	const bytes1 = psd.writePsd(original);
	const bytes2 = psd.writePsd(psd.readPsd(bytes1));
	assert.equal(bytes2.length, bytes1.length);
	assert.deepEqual([...bytes2], [...bytes1]);
});

test("browser text formatting metadata survives a PSD round trip", () => {
	const style = {
		fontFamily: "Times New Roman",
		fontSize: 28,
		bold: true,
		italic: true,
		underline: false,
		strikethrough: true,
		color: { r: 21, g: 43, b: 65 },
	};
	const document = makeDocument(psd, [
		{
			kind: "text",
			id: "L9",
			name: "Styled title",
			visible: true,
			opacity: 1,
			blendMode: "normal",
			clipping: false,
			locks: emptyLocks(),
			preservedBlocks: [],
			top: 2,
			left: 3,
			bitmap: solidBitmap(psd, 40, 20, 21, 43, 65, 200),
			text: { text: "Styled", raw: makeTySh(psd, "Styled"), style },
		},
	]);
	const bytes = psd.writePsd(document);
	const reread = psd.readPsd(bytes);
	assert.equal(reread.layers[0].kind, "text");
	assert.deepEqual(reread.layers[0].text.style, style);
	assert.deepEqual([...psd.writePsd(reread)], [...bytes]);
});

test("grayscale documents keep their color mode", () => {
	const document = makeDocument(
		psd,
		[rasterLayer(psd, "L1", "gray", { bitmap: solidBitmap(psd, 8, 8, 99, 99, 99, 200) })],
		{ colorMode: "grayscale", width: 8, height: 8 },
	);
	const reread = psd.readPsd(psd.writePsd(document));
	assert.equal(reread.colorMode, "grayscale");
	assert.equal(reread.editable, true);
	assert.deepEqual(pixelAt(reread.layers[0].bitmap, 4, 4), [99, 99, 99, 200]);
});

test("composite matches the composed layers after a round trip", () => {
	const original = sampleDocument();
	const reread = psd.readPsd(psd.writePsd(original));
	const composedOriginal = psd.composePsdDocument(original);
	const composite = reread.composite;
	assert.ok(composite);
	let maxDelta = 0;
	for (let i = 0; i < composedOriginal.data.length; i++) {
		maxDelta = Math.max(maxDelta, Math.abs(composedOriginal.data[i] - composite.data[i]));
	}
	assert.ok(maxDelta <= 1, `composite deviates by ${maxDelta}`);
});

function rawFixture({ compression = 0, truncateChannel = false, omitComposite = false } = {}) {
	// Hand-build a minimal 2x2 single-layer RGB file with raw channels.
	const writer = new psd.PsdByteWriter();
	writer.signature("8BPS");
	writer.u16(1);
	writer.zeros(6);
	writer.u16(3);
	writer.u32(2); // height
	writer.u32(2); // width
	writer.u16(8);
	writer.u16(3); // rgb
	writer.section(1, () => {}); // color mode data
	writer.section(1, () => {}); // image resources
	writer.section(2, () => {
		writer.section(
			4,
			() => {
				writer.i16(1); // one layer, no global alpha
				writer.i32(0);
				writer.i32(0);
				writer.i32(2);
				writer.i32(2);
				writer.u16(3);
				for (const id of [0, 1, 2]) {
					writer.i16(id);
					writer.u32(2 + (truncateChannel ? 3 : 4));
				}
				writer.signature("8BIM");
				writer.signature("norm");
				writer.u8(255);
				writer.u8(0);
				writer.u8(0x08);
				writer.u8(0);
				writer.section(1, () => {
					writer.section(1, () => {});
					writer.section(1, () => {});
					writer.pascalString("raw", 4);
				});
				for (const value of [10, 20, 30]) {
					writer.u16(compression); // layer compression
					writer.bytes(new Uint8Array(truncateChannel ? 3 : 4).fill(value));
				}
			},
			true,
		);
		writer.section(1, () => {});
	});
	if (omitComposite) return writer.toBytes();
	// Composite: raw, 3 planes.
	writer.u16(0);
	for (const value of [10, 20, 30]) {
		writer.bytes(Uint8Array.from([value, value, value, value]));
	}

	return writer.toBytes();
}

test("raw (uncompressed) channel data decodes", () => {
	const document = psd.readPsd(rawFixture());
	assert.equal(document.layers.length, 1);
	assert.deepEqual(pixelAt(document.layers[0].bitmap, 1, 1), [10, 20, 30, 255]);
	assert.deepEqual(pixelAt(document.composite, 0, 0), [10, 20, 30, 255]);
});

test("unsupported bit depths fail with a conversion hint instead of a blank read-only document", () => {
	for (const depth of [1, 16, 32]) {
		const bytes = rawFixture();
		new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(22, depth);
		assert.throws(() => psd.readPsd(bytes), /not supported.*8-bit RGB PSD/);
	}
});

test("PSB is rejected before reading PSD-sized section lengths", () => {
	const bytes = rawFixture();
	bytes[5] = 2;
	assert.throws(() => psd.readPsd(bytes), /PSB is not supported/);
});

test("reserved and unsupported color codes never silently become RGB", () => {
	for (const [code, message] of [
		[5, /Invalid color mode/],
		[6, /Invalid color mode/],
		[7, /MULTICHANNEL/],
		[8, /DUOTONE/],
		[9, /LAB/],
		[99, /Invalid color mode/],
	]) {
		const bytes = rawFixture();
		new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(24, code);
		assert.throws(() => psd.readPsd(bytes), message);
	}
});

test("undecodable layer channels fall back to the composite and cannot be overwritten", () => {
	for (const options of [{ compression: 2 }, { compression: 3 }, { truncateChannel: true }]) {
		const document = psd.readPsd(rawFixture(options));
		assert.equal(document.editable, false);
		assert.ok(
			document.openWarnings.some((warning) => warning.includes("could not be decoded")),
		);
		assert.deepEqual(pixelAt(document.composite, 0, 0), [10, 20, 30, 255]);
		assert.deepEqual([...psd.composePsdDocument(document).data], [...document.composite.data]);
		assert.throws(() => psd.writePsd(document), /read-only/);
	}
});

test("undecodable layers without a usable composite fail instead of displaying damaged pixels", () => {
	assert.throws(
		() => psd.readPsd(rawFixture({ compression: 2, omitComposite: true })),
		/cannot be safely displayed/,
	);
	assert.throws(
		() => psd.readPsd(rawFixture({ compression: 2 }), { skipComposite: true }),
		/cannot be safely displayed/,
	);
});

test("flattened RGB PSD becomes an editable layer and survives save", () => {
	const writer = new psd.PsdByteWriter();
	writer.signature("8BPS");
	writer.u16(1);
	writer.zeros(6);
	writer.u16(3);
	writer.u32(1);
	writer.u32(1);
	writer.u16(8);
	writer.u16(3);
	writer.u32(0);
	writer.u32(0);
	writer.u32(0);
	writer.u16(0);
	writer.bytes(Uint8Array.from([10, 20, 30]));
	const document = psd.readPsd(writer.toBytes());
	assert.deepEqual(pixelAt(document.composite, 0, 0), [10, 20, 30, 255]);
	assert.equal(document.layers.length, 1);
	assert.deepEqual(
		[...psd.composePsdDocument(psd.readPsd(psd.writePsd(document))).data],
		[...document.composite.data],
	);
});
