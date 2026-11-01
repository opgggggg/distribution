import { FormatsKernel, loadFormatsKernel } from "@cubexp/kernels";
import { DOMParser, type Element } from "@xmldom/xmldom";
import { abort, type ReadOptions } from "./types.js";
export type XmlElement = Element;
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
const booleanAttributes = new Set([
	"Fill",
	"Stroke",
	"Visible",
	"Italic",
	"Bold",
	"Serif",
	"FixedWidth",
	"Current",
	"Expanded",
	"Print",
	"NoZoom",
	"NoRotate",
	"ReadOnly",
	"NewWindow",
	"Repeat",
	"Synchronous",
	"HideToolbar",
	"HideMenubar",
	"HideWindowUI",
]);
export function attr(node: XmlElement, name: string, fallback = ""): string {
	for (const a of Array.from(node.attributes))
		if (a.localName === name)
			return booleanAttributes.has(name)
				? a.value === "1"
					? "true"
					: a.value === "0"
						? "false"
						: a.value
				: a.value;
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
	private kernel?: FormatsKernel;
	constructor(
		readonly files: Record<string, Uint8Array>,
		kernel?: FormatsKernel,
		readonly renderOverrides: ReadonlyMap<string, Uint8Array> = new Map(),
	) {
		this.files = kernel ? files : Object.assign(Object.create(null), files);
		this.kernel = kernel;
	}
	core(): FormatsKernel {
		if (!this.kernel) {
			const core = new FormatsKernel("ofd");
			core.request({ op: "initParts" });
			try {
				for (const [path, data] of Object.entries(this.files)) core.setPart(path, data);
				this.kernel = core;
			} catch (error) {
				core.close();
				throw error;
			}
		}
		return this.kernel;
	}
	static fromKernel(kernel: FormatsKernel): Archive {
		const paths = new Set(kernel.request<{ paths: string[] }>({ op: "state" }).paths),
			cache = new Map<string, Uint8Array>(),
			overrides = new Map<string, Uint8Array>();
		const get = (path: string) => {
			if (overrides.has(path)) return overrides.get(path);
			if (!paths.has(path)) return undefined;
			let value = cache.get(path);
			if (!value) {
				kernel.request({ op: "part", path });
				value = kernel.save();
				cache.set(path, value);
			}
			return value;
		};
		const files = new Proxy(Object.create(null) as Record<string, Uint8Array>, {
			get: (_target, path) => (typeof path === "string" ? get(path) : undefined),
			ownKeys: () => [...new Set([...paths, ...overrides.keys()])],
			has: (_target, path) =>
				typeof path === "string" && (paths.has(path) || overrides.has(path)),
			getOwnPropertyDescriptor: (_target, path) =>
				typeof path === "string" && (paths.has(path) || overrides.has(path))
					? { enumerable: true, configurable: true }
					: undefined,
			set: (_target, path, value) => {
				if (typeof path !== "string" || !(value instanceof Uint8Array))
					throw TypeError("Archive resources must be bytes.");
				overrides.set(path, value);
				return true;
			},
		});
		return new Archive(files, kernel, overrides);
	}
	static async open(
		input: Blob | Uint8Array | ArrayBuffer,
		options: ReadOptions = {},
	): Promise<Archive> {
		abort(options.signal);
		for (const key of [
			"maxSourceBytes",
			"maxExpandedBytes",
			"maxEntries",
			"maxPages",
			"maxObjects",
			"maxSvgBytes",
		] as const) {
			const value = options[key];
			if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0))
				throw new RangeError(`${key} must be a positive safe integer.`);
		}
		const size = input instanceof Blob ? input.size : input.byteLength;
		if (size > (options.maxSourceBytes ?? 64 * 1024 * 1024))
			throw new RangeError("Document exceeds the source size budget.");
		const bytes =
			input instanceof Blob
				? new Uint8Array(await input.arrayBuffer())
				: input instanceof Uint8Array
					? input
					: new Uint8Array(input);
		await loadFormatsKernel();
		abort(options.signal);
		const kernel = new FormatsKernel(
			"ofd",
			"utf-8",
			Object.fromEntries(Object.entries(options).filter(([key]) => key.startsWith("max"))),
		);
		try {
			kernel.open(bytes);
			abort(options.signal);
			return Archive.fromKernel(kernel);
		} catch (error) {
			kernel.close();
			throw error;
		}
	}

	text(path: string): string {
		const data = this.files[path];
		if (!data) throw new Error(`Missing document part: ${path}`);
		// OFD XML commonly uses UTF-8, but XML also permits UTF-16 BOMs.
		const encoding =
			data[0] === 0xff && data[1] === 0xfe
				? "utf-16le"
				: data[0] === 0xfe && data[1] === 0xff
					? "utf-16be"
					: "utf-8";
		return new TextDecoder(encoding, { fatal: true }).decode(data);
	}
	xml(path: string): XmlElement {
		return parseXml(this.text(path));
	}
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
