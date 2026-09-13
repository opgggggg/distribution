import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { DOMParser, type Element } from "@xmldom/xmldom";
import { abort, type ReadOptions } from "./types.js";
export type XmlElement = Element;
export function escapeXml(value: unknown): string {
	return String(value ?? "").replace(
		/[&<>"']/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
	);
}
export function children(node: XmlElement, local?: string): XmlElement[] {
	return Array.from(node.childNodes).filter(
		(child): child is XmlElement =>
			child.nodeType === 1 && (!local || child.localName === local),
	);
}
export function descendants(node: XmlElement, local: string): XmlElement[] {
	return Array.from(node.getElementsByTagNameNS("*", local));
}
export function first(node: XmlElement, local: string): XmlElement | undefined {
	return descendants(node, local)[0];
}
export function attr(node: XmlElement, name: string, fallback = ""): string {
	for (const a of Array.from(node.attributes)) if (a.localName === name) return a.value;
	return fallback;
}
export function parseXml(source: string): XmlElement {
	if (/<!DOCTYPE|<!ENTITY/i.test(source))
		throw new Error("DTD and entity declarations are not supported.");
	const doc = new DOMParser({
		onError: (level, message) => {
			if (level !== "warning") throw new Error(`Invalid XML: ${message}`);
		},
	}).parseFromString(source, "application/xml");
	if (!doc.documentElement) throw new Error("Missing XML document element.");
	return doc.documentElement;
}
export function resolvePath(base: string, reference: string): string {
	if (!reference || /[\\\u0000-\u001f]/u.test(reference) || /^[a-z][a-z\d+.-]*:/i.test(reference))
		throw new Error("Invalid archive resource path.");
	const parts = reference.startsWith("/") ? [] : base.split("/").slice(0, -1);
	for (const part of reference.split("/")) {
		if (!part || part === ".") continue;
		if (part === "..") {
			if (!parts.length) throw new Error("Archive resource escapes its root.");
			parts.pop();
		} else parts.push(part);
	}
	return parts.join("/");
}
export class Archive {
	constructor(readonly files: Record<string, Uint8Array>) {}
	static async open(
		input: Blob | Uint8Array | ArrayBuffer,
		options: ReadOptions = {},
	): Promise<Archive> {
		abort(options.signal);
		const size = input instanceof Blob ? input.size : input.byteLength;
		if (size > (options.maxSourceBytes ?? 64 * 1024 * 1024))
			throw new RangeError("Document exceeds the source size budget.");
		const bytes =
			input instanceof Blob
				? new Uint8Array(await input.arrayBuffer())
				: input instanceof Uint8Array
					? input
					: new Uint8Array(input);
		let total = 0,
			entries = 0;
		const names = new Set<string>();
		const files = unzipSync(bytes, {
			filter: (entry) => {
				if (++entries > (options.maxEntries ?? 10000))
					throw new RangeError("Too many archive entries.");
				total += entry.originalSize;
				if (total > (options.maxExpandedBytes ?? 128 * 1024 * 1024))
					throw new RangeError("Document exceeds the expanded size budget.");
				if (entry.name.endsWith("/")) return false;
				const name = resolvePath("", entry.name);
				if (name !== entry.name || names.has(name))
					throw new Error("Non-canonical or duplicate archive entry.");
				names.add(name);
				return true;
			},
		});
		abort(options.signal);
		return new Archive(files);
	}
	text(path: string): string {
		const data = this.files[path];
		if (!data) throw new Error(`Missing document part: ${path}`);
		return strFromU8(data);
	}
	xml(path: string): XmlElement {
		return parseXml(this.text(path));
	}
}
export function zip(parts: Record<string, string | Uint8Array>): Uint8Array {
	return zipSync(
		Object.fromEntries(
			Object.entries(parts).map(([key, value]) => [
				key,
				typeof value === "string" ? strToU8(value) : value,
			]),
		),
		{ level: 0 },
	);
}
export function dataUri(bytes: Uint8Array, mime: string): string {
	let data = "";
	for (let i = 0; i < bytes.length; i += 8192)
		data += String.fromCharCode(...bytes.subarray(i, i + 8192));
	return `data:${mime};base64,${btoa(data)}`;
}
export function rasterMime(bytes: Uint8Array): "image/png" | "image/jpeg" | undefined {
	if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71)
		return "image/png";
	if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
	return undefined;
}
export function number(value: string | undefined, fallback = 0): number {
	const result = Number(value);
	return value?.trim() && Number.isFinite(result) ? result : fallback;
}
export function length(value: string, fallback = 0): number {
	const match = /^(-?\d+(?:\.\d+)?)(mm|cm|in|pt|pc|px)?$/.exec(value.trim());
	if (!match) return fallback;
	return (
		Number(match[1]) *
		({ mm: 96 / 25.4, cm: 96 / 2.54, in: 96, pt: 96 / 72, pc: 16, px: 1 }[match[2] || "px"] ??
			1)
	);
}
export function svgPage(width: number, height: number, content: string, defs = ""): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs}</defs><rect width="100%" height="100%" fill="white"/>${content}</svg>`;
}
