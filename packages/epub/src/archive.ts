import { unzipSync } from "fflate";

export type EpubSource = Blob | ArrayBuffer | Uint8Array;

export interface ArchiveEntry {
	name: string;
	/** Uncompressed size in bytes. */
	size: number;
}

/**
 * Read-only ZIP access that inflates one entry at a time. Books routinely carry
 * tens of megabytes of images; only the chapter on screen needs to be in memory.
 */
export class EpubArchive {
	readonly entries: ReadonlyMap<string, ArchiveEntry>;
	private readonly folded = new Map<string, string>();
	private readonly cache = new Map<string, Uint8Array>();

	constructor(private readonly bytes: Uint8Array) {
		const entries = new Map<string, ArchiveEntry>();
		try {
			unzipSync(bytes, {
				filter(file) {
					if (!file.name.endsWith("/")) entries.set(file.name, { name: file.name, size: file.originalSize });
					return false;
				},
			});
		} catch (reason) {
			throw new Error(`This file is not a valid EPUB archive (${reason instanceof Error ? reason.message : String(reason)}).`);
		}
		this.entries = entries;
		for (const name of entries.keys()) this.folded.set(name.toLowerCase(), name);
	}

	static async from(source: EpubSource): Promise<EpubArchive> {
		const bytes = source instanceof Uint8Array ? source
			: source instanceof ArrayBuffer ? new Uint8Array(source)
			: new Uint8Array(await source.arrayBuffer());
		return new EpubArchive(bytes);
	}

	get byteLength(): number { return this.bytes.byteLength; }

	/** Entry names are case-sensitive in ZIP, but many books get the case of their own links wrong. */
	resolve(path: string): string | undefined {
		if (this.entries.has(path)) return path;
		return this.folded.get(path.toLowerCase());
	}

	has(path: string): boolean { return this.resolve(path) !== undefined; }

	size(path: string): number { const name = this.resolve(path); return name ? this.entries.get(name)!.size : 0; }

	read(path: string): Uint8Array | undefined {
		const name = this.resolve(path);
		if (!name) return undefined;
		const cached = this.cache.get(name);
		if (cached) return cached;
		const result = unzipSync(this.bytes, { filter: file => file.name === name })[name];
		// Small text resources (OPF, nav, CSS) are re-read on every chapter; images are not.
		if (result && result.byteLength < 256 * 1024) this.cache.set(name, result);
		return result;
	}

	readText(path: string): string | undefined {
		const bytes = this.read(path);
		return bytes ? decodeText(bytes) : undefined;
	}

	source(): Uint8Array { return this.bytes; }
}

export function decodeText(bytes: Uint8Array): string {
	if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
	if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
	const head = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
	const declared = /encoding\s*=\s*["']([\w-]+)["']/i.exec(head)?.[1] ?? /charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1];
	try {
		return new TextDecoder(declared && !/^utf-?8$/i.test(declared) ? declared : "utf-8").decode(bytes);
	} catch {
		return new TextDecoder("utf-8").decode(bytes);
	}
}
