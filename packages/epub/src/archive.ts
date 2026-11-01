import { FormatsKernel, loadFormatsKernel } from "@cubexp/kernels";
export type EpubSource = Blob | ArrayBuffer | Uint8Array;
export interface ArchiveEntry {
	name: string;
	size: number;
}
/** Rust owns ZIP parsing, bounded resource inflation and package metadata. */
export class EpubArchive {
	readonly entries: ReadonlyMap<string, ArchiveEntry>;
	private folded = new Map<string, string>();
	private cache = new Map<string, Uint8Array>();
	private kernel: FormatsKernel;
	readonly bookProjection: unknown;
	constructor(private readonly bytes: Uint8Array) {
		this.kernel = new FormatsKernel("epub");
		try {
			this.bookProjection = this.kernel.open(bytes);
		} catch (error) {
			this.kernel.close();
			throw error;
		}
		this.entries = new Map(
			(this.bookProjection as { entries: ArchiveEntry[] }).entries.map((e) => [e.name, e]),
		);
		for (const name of this.entries.keys()) this.folded.set(name.toLowerCase(), name);
	}
	static async from(source: EpubSource): Promise<EpubArchive> {
		await loadFormatsKernel();
		const bytes =
			source instanceof Uint8Array
				? source
				: source instanceof ArrayBuffer
					? new Uint8Array(source)
					: new Uint8Array(await source.arrayBuffer());
		return new EpubArchive(bytes);
	}
	get byteLength() {
		return this.bytes.byteLength;
	}
	resolve(path: string) {
		return this.entries.has(path) ? path : this.folded.get(path.toLowerCase());
	}
	has(path: string) {
		return this.resolve(path) !== undefined;
	}
	size(path: string) {
		const name = this.resolve(path);
		return name ? this.entries.get(name)!.size : 0;
	}
	read(path: string, deobfuscate = false): Uint8Array | undefined {
		const name = this.resolve(path);
		if (!name) return undefined;
		const key = `${deobfuscate ? "decoded:" : "raw:"}${name}`;
		const cached = this.cache.get(key);
		if (cached) return cached.slice();
		const found = this.kernel.request<{ found: boolean }>({
			op: "resource",
			path: name,
			deobfuscate,
		});
		if (!found.found) return undefined;
		const bytes = this.kernel.save();
		// Bounded small-resource cache; large photos stay in the compressed archive.
		if (bytes.length < 256 * 1024 && this.cache.size < 128) this.cache.set(key, bytes.slice());
		return bytes;
	}
	readText(path: string, deobfuscate = false): string | undefined {
		return (
			this.kernel.request<{ text: string | null }>({ op: "resourceText", path, deobfuscate })
				.text ?? undefined
		);
	}
	source() {
		return this.bytes;
	}
	close() {
		this.cache.clear();
		this.kernel.close();
	}
}
/** Compatibility helper for callers decoding standalone resources. */
export function decodeText(bytes: Uint8Array): string {
	if (bytes[0] === 255 && bytes[1] === 254) return new TextDecoder("utf-16le").decode(bytes);
	if (bytes[0] === 254 && bytes[1] === 255) return new TextDecoder("utf-16be").decode(bytes);
	const head = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
	const declared =
		/encoding\s*=\s*["']([\w-]+)["']/i.exec(head)?.[1] ??
		/charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1];
	try {
		return new TextDecoder(declared ?? "utf-8").decode(bytes);
	} catch {
		return new TextDecoder().decode(bytes);
	}
}
