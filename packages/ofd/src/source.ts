import { abort, type ReadOptions } from "./types.js";

export type OfdSource = Blob | ArrayBuffer | Uint8Array | string;

/** Load a viewer source with the same byte budget and cancellation as the parser. */
export async function readSource(
	source: OfdSource,
	options: ReadOptions = {},
): Promise<Uint8Array> {
	abort(options.signal);
	const limit = options.maxSourceBytes ?? 64 * 1024 * 1024;
	if (!Number.isSafeInteger(limit) || limit <= 0)
		throw new RangeError("Invalid source size budget.");
	const check = (size: number) => {
		if (size > limit) throw new RangeError("Document exceeds the source size budget.");
		abort(options.signal);
	};
	if (typeof source !== "string") {
		check(source instanceof Blob ? source.size : source.byteLength);
		const bytes =
			source instanceof Uint8Array
				? source
				: new Uint8Array(source instanceof Blob ? await source.arrayBuffer() : source);
		check(bytes.byteLength);
		return bytes;
	}
	const response = await fetch(source, { signal: options.signal });
	const reader = response.body?.getReader();
	try {
		if (!response.ok) throw new Error(`Unable to load OFD: HTTP ${response.status}`);
		check(Number(response.headers.get("content-length")) || 0);
		if (!reader) throw new Error("The OFD response has no body.");
		const chunks: Uint8Array[] = [];
		let size = 0;
		while (true) {
			const { value, done } = await reader.read();
			abort(options.signal);
			if (done) break;
			size += value.byteLength;
			check(size);
			chunks.push(value);
		}
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return bytes;
	} finally {
		if (reader) {
			await reader.cancel().catch(() => {});
			reader.releaseLock();
		}
	}
}
