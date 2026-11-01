/** Synchronous public writer APIs stay synchronous, including their first call.
 * Only this small stateless Rust module is inlined; full document kernels stay lazy. */
import { WRITER_WASM_BASE64 } from "./writer-generated.js";
let compiled: WebAssembly.Module | undefined;
interface WriterExports extends WebAssembly.Exports {
	memory: WebAssembly.Memory;
	office_abi_version(): number;
	office_alloc(size: number): number;
	office_dealloc(ptr: number, size: number): void;
	office_open(ptr: number, len: number): number;
	office_request(ptr: number, len: number): number;
	office_save(): number;
	office_output_ptr(): number;
	office_output_len(): number;
	office_output_clear(): void;
}
const MAX_BYTES = 128 * 1024 * 1024;
function write(op: "office_open" | "office_request", input: Uint8Array): Uint8Array<ArrayBuffer> {
	compiled ??= new WebAssembly.Module(
		Uint8Array.from(atob(WRITER_WASM_BASE64), (c) => c.charCodeAt(0)),
	);
	const api = new WebAssembly.Instance(compiled).exports as WriterExports;
	if (api.office_abi_version() !== 1) throw Error("Unsupported CubeOffice writer ABI.");
	const result = (status: number) => {
		const output = new Uint8Array(
			api.memory.buffer,
			api.office_output_ptr(),
			api.office_output_len(),
		).slice();
		api.office_output_clear();
		if (status !== 0) {
			const error = JSON.parse(new TextDecoder().decode(output));
			throw Object.assign(
				error.code === "LimitExceeded" || error.code === "InvalidScale"
					? new RangeError(error.message)
					: new Error(error.message),
				{ code: error.code },
			);
		}
		return output;
	};
	const ptr = api.office_alloc(input.length);
	try {
		new Uint8Array(api.memory.buffer, ptr, input.length).set(input);
		result(api[op](ptr, input.length));
	} finally {
		api.office_dealloc(ptr, input.length);
	}
	return result(api.office_save());
}
export function writeOfdImages(
	pages: readonly { bytes: Uint8Array; width: number; height: number }[],
	id: string,
): Uint8Array<ArrayBuffer> {
	const header = new TextEncoder().encode(
		JSON.stringify({
			id,
			pages: pages.map((p) => ({
				length: p.bytes.byteLength,
				width: p.width,
				height: p.height,
			})),
		}),
	);
	const length = pages.reduce((n, p) => n + p.bytes.byteLength, 4 + header.length);
	if (length > MAX_BYTES) throw new RangeError("Writer output exceeds the archive budget.");
	const input = new Uint8Array(length);
	new DataView(input.buffer).setUint32(0, header.length, true);
	input.set(header, 4);
	let offset = 4 + header.length;
	for (const page of pages) {
		input.set(page.bytes, offset);
		offset += page.bytes.byteLength;
	}
	return write("office_open", input);
}
export function writeOfdDocx(pages: readonly string[]): Uint8Array<ArrayBuffer> {
	const input = new TextEncoder().encode(JSON.stringify({ op: "docx", pages }));
	if (input.length > MAX_BYTES) throw new RangeError("Text writer exceeds its size budget.");
	return write("office_request", input);
}
export function ofdDisplayRequest(request: object): Uint8Array<ArrayBuffer> {
	const input = new TextEncoder().encode(JSON.stringify(request));
	if (input.length > MAX_BYTES) throw new RangeError("OFD display exceeds its size budget.");
	return write("office_request", input);
}
