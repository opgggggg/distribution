/** One WASM instance per document; failures are visible, never a JS authority fallback. */
interface Exports {
	memory: WebAssembly.Memory;
	office_abi_version(): number;
	office_alloc(size: number): number;
	office_dealloc(ptr: number, size: number): void;
	office_request(ptr: number, size: number): number;
	office_open(ptr: number, size: number): number;
	office_save(): number;
	office_output_ptr(): number;
	office_output_len(): number;
	office_output_clear(): void;
	cubeoffice_formats_upload(ptr: number, size: number): number;
}
export interface ColorRequest {
	components: number[];
	type: string;
	bitsPerComponent: number;
	profilePath?: string | null;
}
let pending: Promise<WebAssembly.Module> | undefined;
let compiled: WebAssembly.Module | undefined;
export function loadFormatsKernel(): Promise<WebAssembly.Module> {
	return (pending ??= (async () => {
		let url = new URL("./formats-kernel.wasm", import.meta.url);
		let bytes: BufferSource;
		if (url.protocol === "file:" && typeof process !== "undefined" && process.versions?.node) {
			const module = "node:fs/promises";
			const { readFile } = await import(/* @vite-ignore */ module);
			bytes = await readFile(url);
		} else {
			if (url.protocol === "file:" && url.pathname.startsWith("/android_asset/web/assets/"))
				url = new URL(
					`https://appassets.androidplatform.net/assets/web/assets/${url.pathname.split("/").pop()}`,
				);
			const response = await fetch(url);
			if (!response.ok)
				throw Error(`CubeOffice Rust formats kernel could not load (${response.status}).`);
			bytes = await response.arrayBuffer();
		}
		return (compiled = await WebAssembly.compile(bytes));
	})().catch((error) => {
		pending = undefined;
		throw error;
	}));
}
// Avoid a Node type dependency in browser packages.
declare const process: { versions?: { node?: string } } | undefined;
export class FormatsKernel {
	private instance?: WebAssembly.Instance;
	private inColorProvider = false;
	private colorProvider?: (request: ColorRequest) => readonly number[];
	constructor(
		format: "text" | "epub" | "ofd" | "pdf",
		encoding = "utf-8",
		options: Record<string, unknown> = {},
	) {
		if (!compiled)
			throw Error("Call loadFormatsKernel() before constructing a format document.");
		this.instance = new WebAssembly.Instance(compiled, {
			cubeoffice_ofd_host_v1: {
				color: (ptr: number, size: number, reply: number) =>
					this.colorReply(ptr, size, reply),
			},
		});
		if (this.api().office_abi_version() !== 1)
			throw Error("Unsupported CubeOffice formats ABI.");
		this.request({ op: "configure", format, encoding, ...options });
	}
	/** A provider is synchronous and must not re-enter this document's request API. */
	setColorProvider(provider?: (request: ColorRequest) => readonly number[]) {
		this.colorProvider = provider;
	}
	private colorReply(ptr: number, size: number, replyPtr: number): number {
		const api = this.api();
		let output: unknown,
			status = 0;
		this.inColorProvider = true;
		try {
			if (!this.colorProvider) throw Error("No OFD color provider is configured.");
			const request = JSON.parse(
				new TextDecoder().decode(new Uint8Array(api.memory.buffer, ptr, size)),
			);
			const result = this.colorProvider(request);
			if (result.length !== 3) throw Error("Invalid colorConverter RGB result.");
			// Returned arrays can have accessors/proxies too. Keep the guard active
			// while reading them and copy only the three required numeric channels.
			const rgb = [result[0], result[1], result[2]];
			if (rgb.some((v) => !Number.isFinite(v) || v < 0 || v > 255))
				throw Error("Invalid colorConverter RGB result.");
			output = rgb;
		} catch (error) {
			status = 1;
			let message = "OFD color provider failed.";
			try {
				message = String(error instanceof Error ? error.message : error).slice(0, 4096);
			} catch {
				/* Provider-owned error accessors may throw. */
			}
			output = { error: message };
		} finally {
			this.inColorProvider = false;
		}
		const bytes = new TextEncoder().encode(JSON.stringify(output));
		const outputPtr = api.office_alloc(bytes.length);
		new Uint8Array(api.memory.buffer, outputPtr, bytes.length).set(bytes);
		const reply = new DataView(api.memory.buffer);
		reply.setUint32(replyPtr, outputPtr, true);
		reply.setUint32(replyPtr + 4, bytes.length, true);
		return status;
	}
	private api(): Exports {
		if (!this.instance) throw Error("The document kernel is closed.");
		return this.instance.exports as unknown as Exports;
	}
	private call(
		op: "office_open" | "office_request" | "office_save" | "cubeoffice_formats_upload",
		bytes?: Uint8Array,
	): Uint8Array<ArrayBuffer> {
		if (this.inColorProvider)
			throw Error("OFD color providers cannot re-enter their rendering document.");
		const api = this.api();
		let ptr: number | undefined;
		try {
			if (bytes) {
				ptr = api.office_alloc(bytes.length);
				new Uint8Array(api.memory.buffer, ptr, bytes.length).set(bytes);
			}
			const status = op === "office_save" ? api.office_save() : api[op](ptr!, bytes!.length);
			const output = new Uint8Array(
				api.memory.buffer,
				api.office_output_ptr(),
				api.office_output_len(),
			).slice();
			if (status !== 0) {
				const e = JSON.parse(new TextDecoder().decode(output));
				const error =
					e.code === "InvalidEncoding" || e.code === "BinaryData"
						? new TypeError(e.message)
						: e.code === "LimitExceeded" || e.code === "InvalidRange"
							? new RangeError(e.message)
							: new Error(e.message);
				throw Object.assign(error, { code: e.code });
			}
			return output;
		} finally {
			if (ptr !== undefined) api.office_dealloc(ptr, bytes!.length);
			api.office_output_clear();
		}
	}
	request<T = unknown>(request: unknown): T {
		return JSON.parse(
			new TextDecoder().decode(
				this.call("office_request", new TextEncoder().encode(JSON.stringify(request))),
			),
		);
	}
	open<T = unknown>(bytes: Uint8Array): T {
		return JSON.parse(new TextDecoder().decode(this.call("office_open", bytes)));
	}
	setPart<T = unknown>(path: string, bytes: Uint8Array, render = false): T {
		const prepared = this.request<{ extensionVersion: number }>({
			op: "preparePart",
			path,
			render,
		});
		if (
			prepared.extensionVersion !== 1 ||
			typeof this.api().cubeoffice_formats_upload !== "function"
		)
			throw Error("Unsupported OFD binary upload extension.");
		return JSON.parse(new TextDecoder().decode(this.call("cubeoffice_formats_upload", bytes)));
	}
	setRenderAsset(key: string, bytes: Uint8Array): void {
		const prepared = this.request<{ extensionVersion: number }>({ op: "prepareAsset", key });
		if (prepared.extensionVersion !== 1) throw Error("Unsupported OFD asset upload extension.");
		this.call("cubeoffice_formats_upload", bytes);
	}
	setPdfImage(bytes: Uint8Array): void {
		const prepared = this.request<{ extensionVersion: number }>({ op: "preparePdfImage" });
		if (prepared.extensionVersion !== 1) throw Error("Unsupported PDF image upload extension.");
		this.call("cubeoffice_formats_upload", bytes);
	}
	save(): Uint8Array<ArrayBuffer> {
		return this.call("office_save");
	}
	close() {
		if (this.inColorProvider)
			throw Error("OFD color providers cannot close their rendering document.");
		this.instance = undefined;
		this.colorProvider = undefined;
	}
}
export interface Match {
	from: number;
	to: number;
}
let search: FormatsKernel | undefined;
/** Input has already been sanitized by its renderer. Coordinates are original UTF-16. */
export function searchText(text: string, query: string, limit = 500): Match[] {
	return (search ??= new FormatsKernel("text")).request({ op: "search", text, query, limit });
}

export interface PdfImagePage {
	bytes: Uint8Array;
	width: number;
	height: number;
	mime?: "image/png" | "image/jpeg";
}
/** One bounded raw frame and one Rust write for all raster pages. */
export async function writePdfImages(
	pages: readonly PdfImagePage[],
): Promise<Uint8Array<ArrayBuffer>> {
	const header = new TextEncoder().encode(
		JSON.stringify({
			pages: pages.map((page) => ({
				length: page.bytes.byteLength,
				width: page.width,
				height: page.height,
				mime: page.mime ?? "image/png",
			})),
		}),
	);
	const size = pages.reduce((n, page) => n + page.bytes.byteLength, 4 + header.length);
	if (size > 128 * 1024 * 1024) throw new RangeError("PDF images exceed their byte budget.");
	const frame = new Uint8Array(size);
	new DataView(frame.buffer).setUint32(0, header.length, true);
	frame.set(header, 4);
	let offset = 4 + header.length;
	for (const page of pages) {
		frame.set(page.bytes, offset);
		offset += page.bytes.byteLength;
	}
	await loadFormatsKernel();
	const core = new FormatsKernel("pdf", "utf-8", { imagePages: true });
	try {
		core.open(frame);
		return core.save();
	} finally {
		core.close();
	}
}
