import { inverse3 } from "../render/projective";
/** Native `curv` adjustment data and versioned optional CubeExp layer metadata.
 * cXfm: u16 version, u32 source width/height, six f64 affine coefficients,
 * u32 baked width/height, i32 left/top, u32 FNV-1a, then source RGBA bytes. Other readers use
 * the standard baked channels. A changed baked bitmap invalidates the source.
 * cMsk: u8 version, u8 linked flag. The PSD mask-relative-position bit is NOT
 * a linkage flag and is deliberately not used for this application setting.
 */
import {
	LIVE_ADJUSTMENT_KEYS,
	encodeAdjustmentBlock,
	decodeAdjustmentBlock,
} from "./adjustment-blocks";
import { PsdByteReader, PsdByteWriter } from "./binary";
import { walkPsdLayers, type PsdLayerNode, type PsdPreservedBlock } from "./document";
import {
	currentSourceTransform,
	multiplyAffine,
	toMatrix3,
	type PsdAffine,
} from "../render/affine";
import { CURVE_CHANNELS, identityCurves, validateCurves, type PsdCurves } from "../render/curves";
function checksum(bytes: Uint8ClampedArray): number {
	let h = 2166136261;
	for (const b of bytes) h = Math.imul(h ^ b, 16777619);
	return h >>> 0;
}
export function encodeCurves(curves: PsdCurves): Uint8Array {
	validateCurves(curves);
	const w = new PsdByteWriter();
	w.u8(0);
	w.u16(1);
	w.u32(15);
	const points = (i: number) => {
		const p = curves[CURVE_CHANNELS[i]];
		w.u16(p.length);
		for (const v of p) {
			w.u16(v.y);
			w.u16(v.x);
		}
	};
	for (let i = 0; i < 4; i++) points(i);
	w.signature("Crv ");
	w.u16(4);
	w.u32(4);
	for (let i = 0; i < 4; i++) {
		w.u16(i);
		points(i);
	}
	return w.toBytes();
}
export function decodeCurves(bytes: Uint8Array): PsdCurves {
	const r = new PsdByteReader(bytes);
	if (r.u8() !== 0 || r.u16() !== 1) throw new Error("Unsupported curves version");
	const bits = r.u32();
	if (bits & ~15) throw new Error("Unsupported curves channels");
	const curves = identityCurves();
	for (let c = 0; c < 4; c++)
		if (bits & (1 << c)) {
			const count = r.u16();
			if (count < 2 || count > 19) throw new Error("Invalid curve point count");
			curves[CURVE_CHANNELS[c]] = Array.from({ length: count }, () => {
				const y = r.u16(),
					x = r.u16();
				return { x, y };
			});
		}
	validateCurves(curves);
	return curves;
}
export function layerExtensionBlocks(layer: PsdLayerNode): PsdPreservedBlock[] {
	const blocks: PsdPreservedBlock[] = [];
	const add = (key: string, data: Uint8Array) => blocks.push({ signature: "8BIM", key, data });
	if (layer.mask) add("cMsk", new Uint8Array([1, layer.mask.linked === false ? 0 : 1]));
	if (layer.kind === "group") return blocks;
	if (layer.curves) add("curv", encodeCurves(layer.curves));
	if (layer.adjustment) blocks.push(encodeAdjustmentBlock(layer.adjustment));
	if (layer.sourceTransform?.rendered === layer.bitmap) {
		const s = currentSourceTransform(layer),
			w = new PsdByteWriter();
		w.u16(s.matrix.length === 9 ? 2 : 1);
		w.u32(s.source.width);
		w.u32(s.source.height);
		for (const n of s.matrix) w.f64(n);
		w.u32(layer.bitmap.width);
		w.u32(layer.bitmap.height);
		w.i32(layer.left);
		w.i32(layer.top);
		w.u32(checksum(layer.bitmap.data));
		w.bytes(
			new Uint8Array(
				s.source.data.buffer,
				s.source.data.byteOffset,
				s.source.data.byteLength,
			),
		);
		add("cXfm", w.toBytes());
	}
	return blocks;
}
export function restoreLayerExtensions(layers: PsdLayerNode[], warnings: string[]): void {
	walkPsdLayers(layers, (layer) => {
		const keep: PsdPreservedBlock[] = [];
		for (const b of layer.preservedBlocks) {
			if (!["cMsk", "cXfm", "curv", ...LIVE_ADJUSTMENT_KEYS].includes(b.key)) {
				keep.push(b);
				continue;
			}
			try {
				if (LIVE_ADJUSTMENT_KEYS.includes(b.key) && layer.kind !== "group")
					layer.adjustment = decodeAdjustmentBlock(b.key, b.data);
				else if (b.key === "cMsk") {
					if (b.data.length === 2 && b.data[0] === 1 && layer.mask)
						layer.mask.linked = b.data[1] !== 0;
				} else if (layer.kind !== "group" && b.key === "curv")
					layer.curves = decodeCurves(b.data);
				else if (layer.kind !== "group" && b.key === "cXfm") {
					const r = new PsdByteReader(b.data);
					const version = r.u16();
					if (version !== 1 && version !== 2)
						throw new Error("Unsupported transform source version");
					const width = r.u32(),
						height = r.u32(),
						matrix = Array.from({ length: version === 2 ? 9 : 6 }, () =>
							r.f64(),
						) as unknown as PsdAffine;
					const rw = r.u32(),
						rh = r.u32(),
						left = r.i32(),
						top = r.i32(),
						hash = r.u32();
					if (
						!width ||
						!height ||
						width > 30000 ||
						height > 30000 ||
						width * height > 80_000_000 ||
						r.remaining() !== width * height * 4 ||
						!matrix.every(Number.isFinite)
					)
						throw new Error("Invalid transform source");
					inverse3(toMatrix3(matrix));
					if (
						rw === layer.bitmap.width &&
						rh === layer.bitmap.height &&
						hash === checksum(layer.bitmap.data)
					)
						layer.sourceTransform = {
							source: {
								width,
								height,
								data: new Uint8ClampedArray(r.bytesView(width * height * 4)),
							},
							matrix: multiplyAffine(
								[1, 0, 0, 1, layer.left - left, layer.top - top],
								matrix,
							),
							rendered: layer.bitmap,
							left: layer.left,
							top: layer.top,
						};
				}
			} catch (error) {
				if (b.key === "curv" || LIVE_ADJUSTMENT_KEYS.includes(b.key)) {
					keep.push(b);
					warnings.push(
						`Layer "${layer.name}" adjustment could not be decoded: ${String(error)}`,
					);
				} /* Optional private metadata can be discarded; standard baked pixels remain valid. */
			}
		}
		layer.preservedBlocks = keep;
	});
}
