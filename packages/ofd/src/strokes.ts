import { ofdDisplayRequest } from "@cubexp/kernels/sync";
import type { Matrix } from "./geometry.js";
/** Shared Rust geometry authority; synchronous viewer/export APIs are unchanged. */
export function strokeScale(matrix: Matrix): number {
	return JSON.parse(new TextDecoder().decode(ofdDisplayRequest({ op: "strokeScale", matrix })));
}
export function deviceLineWidth(width: number, transformScale: number, deviceScale = 1): number {
	return JSON.parse(new TextDecoder().decode(ofdDisplayRequest({ op: "deviceLineWidth", width, transformScale, deviceScale })));
}
export function svgAtDeviceScale(svg: string, scale: number): string {
	return new TextDecoder().decode(ofdDisplayRequest({ op: "svgAtDeviceScale", svg, scale }));
}
