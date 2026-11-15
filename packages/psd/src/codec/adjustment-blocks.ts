/** Native PSD adjustment blocks. Unsupported variants fail closed into read-only composite preview. */
import { PsdByteReader, PsdByteWriter } from "./binary";
import type { PsdPreservedBlock } from "./document";
import {
	defaultLiveAdjustment,
	validateLiveAdjustment,
	LEVEL_CHANNELS,
	type PsdLiveAdjustment,
} from "../render/adjustment-layers";
export const LIVE_ADJUSTMENT_KEYS = ["levl", "hue2", "expA", "grdm", "cGrn"];
function floatWrite(w: PsdByteWriter, n: number) {
	const b = new Uint8Array(4);
	new DataView(b.buffer).setFloat32(0, n);
	w.bytes(b);
}
function floatRead(r: PsdByteReader) {
	const b = r.bytesView(4);
	return new DataView(b.buffer, b.byteOffset, 4).getFloat32(0);
}
export function encodeAdjustmentBlock(a: PsdLiveAdjustment): PsdPreservedBlock {
	validateLiveAdjustment(a);
	const w = new PsdByteWriter();
	let key: string;
	if (a.kind === "grain") {
		key = "cGrn";
		w.u16(1);
		w.f64(a.amount);
		w.f64(a.size);
		w.f64(a.roughness);
		w.u32(a.seed);
	} else if (a.kind === "levels") {
		key = "levl";
		w.u16(2);
		const identity = defaultLiveAdjustment("levels") as typeof a;
		for (let i = 0; i < 63; i++) {
			const c = i < 4 ? a.channels[LEVEL_CHANNELS[i]] : identity.channels.rgb;
			for (const n of [
				c.inBlack,
				c.inWhite,
				c.outBlack,
				c.outWhite,
				Math.round(c.gamma * 100),
			])
				w.u16(n);
		}
	} else if (a.kind === "exposure") {
		key = "expA";
		w.u16(1);
		for (const n of [a.exposure, a.offset, a.gamma]) floatWrite(w, n);
		w.u16(0);
	} else if (a.kind === "hue-saturation") {
		key = "hue2";
		w.u16(2);
		w.u8(a.colorize ? 1 : 0);
		w.u8(0);
		for (const n of [
			a.colorHue > 180 ? a.colorHue - 360 : a.colorHue,
			a.colorSaturation,
			a.colorLightness,
			a.hue,
			a.saturation,
			a.lightness,
		])
			w.i16(n);
		for (const r of a.ranges)
			for (const n of [...r.handles, r.hue, r.saturation, r.lightness]) w.i16(n);
	} else {
		key = "grdm";
		w.u16(1);
		w.u8(a.reverse ? 1 : 0);
		w.u8(0);
		w.unicodeString("Gradient Map");
		w.u16(a.stops.length);
		for (const s of a.stops) {
			w.u32(Math.round(s.position * 4096));
			w.u32(Math.round(s.midpoint * 100));
			w.u16(0);
			for (const c of [s.color.r, s.color.g, s.color.b]) w.u16(c * 257);
			w.u16(0);
			w.u16(0);
		}
		w.u16(2);
		for (const pos of [0, 4096]) {
			w.u32(pos);
			w.u32(50);
			w.u16(255);
		}
		w.u16(2);
		w.u16(4096);
		w.u16(32);
		w.u16(0);
		w.u32(0);
		w.u16(0);
		w.u16(0);
		w.u32(4096);
		w.u16(3);
		for (let i = 0; i < 4; i++) w.u16(0);
		for (let i = 0; i < 4; i++) w.u16(32768);
		w.u32(0);
	}
	return { signature: "8BIM", key, data: w.toBytes() };
}
export function decodeAdjustmentBlock(key: string, bytes: Uint8Array): PsdLiveAdjustment {
	const r = new PsdByteReader(bytes);
	let a: PsdLiveAdjustment;
	if (key === "cGrn") {
		if (r.u16() !== 1) throw new Error("Unsupported grain version");
		a = { kind: "grain", amount: r.f64(), size: r.f64(), roughness: r.f64(), seed: r.u32() };
		if (r.remaining()) throw new Error("Invalid grain data");
	} else if (key === "levl") {
		if (r.u16() !== 2) throw new Error("Unsupported levels version");
		a = defaultLiveAdjustment("levels") as Extract<PsdLiveAdjustment, { kind: "levels" }>;
		for (const c of LEVEL_CHANNELS)
			a.channels[c] = {
				inBlack: r.u16(),
				inWhite: r.u16(),
				outBlack: r.u16(),
				outWhite: r.u16(),
				gamma: r.u16() / 100,
			};
	} else if (key === "expA") {
		if (r.u16() !== 1) throw new Error("Unsupported exposure version");
		a = { kind: "exposure", exposure: floatRead(r), offset: floatRead(r), gamma: floatRead(r) };
	} else if (key === "hue2") {
		if (r.u16() !== 2) throw new Error("Unsupported hue version");
		const colorize = !!r.u8();
		r.u8();
		const colorHue = (r.i16() + 360) % 360,
			colorSaturation = r.i16(),
			colorLightness = r.i16(),
			hue = r.i16(),
			saturation = r.i16(),
			lightness = r.i16();
		a = {
			kind: "hue-saturation",
			colorize,
			colorHue,
			colorSaturation,
			colorLightness,
			hue,
			saturation,
			lightness,
			ranges: Array.from({ length: 6 }, () => ({
				handles: [r.i16(), r.i16(), r.i16(), r.i16()],
				hue: r.i16(),
				saturation: r.i16(),
				lightness: r.i16(),
			})),
		};
	} else if (key === "grdm") {
		const version = r.u16();
		if (version !== 1) throw new Error("Only classic solid RGB gradient maps are supported");
		const reverse = !!r.u8();
		if (r.u8()) throw new Error("Dithered gradient maps are unsupported");
		r.unicodeString();
		const count = r.u16();
		if (count < 2 || count > 32) throw new Error("Invalid gradient stop count");
		const stops = Array.from({ length: count }, () => {
			const position = r.u32(),
				midpoint = r.u32() / 100;
			if (r.u16() !== 0) throw new Error("Gradient stop must be RGB");
			const color = {
				r: Math.round(r.u16() / 257),
				g: Math.round(r.u16() / 257),
				b: Math.round(r.u16() / 257),
			};
			r.skip(4);
			return { position, midpoint, color };
		});
		const opacityCount = r.u16();
		if (opacityCount > 64) throw new Error("Invalid gradient opacity count");
		for (let i = 0; i < opacityCount; i++) {
			r.skip(8);
			if (r.u16() !== 255) throw new Error("Transparent gradient maps are unsupported");
		}
		if (r.u16() !== 2) throw new Error("Invalid gradient expansion");
		const interpolation = r.u16();
		if (!interpolation || r.u16() !== 32 || r.u16() !== 0)
			throw new Error("Unsupported gradient variant");
		r.skip(30);
		a = {
			kind: "gradient-map",
			reverse,
			stops: stops.map((s) => ({ ...s, position: s.position / interpolation })),
		};
	} else throw new Error("Unsupported adjustment block");
	validateLiveAdjustment(a);
	return a;
}
