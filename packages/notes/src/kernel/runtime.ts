/** The same ABI is exported by the portable Rust library and the WASM build. */
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
}
export class NotesRustKernel {
	private instance?: WebAssembly.Instance;
	private photos = new Map<string, string>();
	private sourceIds = new Map<string, string>();
	private pages = new Map<string, import("../model.js").NotePage>();
	private images = new Map<string, import("../model.js").InkImage>();
	constructor(module: WebAssembly.Module, plugins: unknown[] = []) {
		this.instance = new WebAssembly.Instance(module);
		if (this.api().office_abi_version() !== 1) throw Error("Unsupported notes kernel ABI.");
		this.request({ op: "configure", plugins });
	}
	private api(): Exports {
		if (!this.instance) throw Error("Notebook kernel is closed.");
		return this.instance.exports as unknown as Exports;
	}
	private call(
		op: "office_request" | "office_open" | "office_save",
		bytes?: Uint8Array,
	): Uint8Array {
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
				const error = JSON.parse(new TextDecoder().decode(output));
				throw Object.assign(Error(error.message), { code: error.code });
			}
			return output;
		} finally {
			if (ptr !== undefined) api.office_dealloc(ptr, bytes!.length);
			api.office_output_clear();
		}
	}
	request<T = unknown>(request: unknown): T {
		let data = request as Record<string, unknown>;
		if ((data.op === "init" || data.op === "initSave") && data.history)
			data = {
				...data,
				history: sharedHistory(
					data.document as import("../model.js").Notebook,
					data.history as import("../history.js").NoteHistoryState,
				),
			};
		if (data.document) {
			const d = data.document as import("../model.js").Notebook;
			data = { ...data, document: { ...d, pages: d.pages.map((p) => this.encodePage(p)) } };
		}
		if (data.page)
			data = { ...data, page: this.encodePage(data.page as import("../model.js").NotePage) };
		const result = JSON.parse(
			new TextDecoder().decode(
				this.call("office_request", new TextEncoder().encode(JSON.stringify(data))),
			),
		);
		if (data.op === "init" || data.op === "initSave") this.clear();
		return this.decode(result) as T;
	}
	open<T = unknown>(bytes: Uint8Array): T {
		const result = JSON.parse(new TextDecoder().decode(this.call("office_open", bytes)));
		this.clear();
		return this.decode(result) as T;
	}
	private encodePage(page: import("../model.js").NotePage) {
		const image = (p: import("../model.js").InkImage) => ({
			...p,
			src: this.sourceIds.has(p.src) ? `@wire-photo:${this.sourceIds.get(p.src)}` : p.src,
		});
		return {
			...page,
			...(page.background ? { background: image(page.background) } : {}),
			layers: page.layers.map((l) => ({
				...l,
				elements: l.elements.map((e) => (e.kind === "image" ? image(e) : e)),
			})),
		};
	}
	private clear() {
		this.photos.clear();
		this.sourceIds.clear();
		this.pages.clear();
		this.images.clear();
	}
	private decode(result: Record<string, unknown>): unknown {
		if (result.wireVersion !== 1) return result;
		for (const [id, source] of Object.entries(result.photos as Record<string, string>)) {
			this.photos.set(id, source);
			this.sourceIds.set(source, id);
		}
		const image = (p: import("../model.js").InkImage) => {
			const key = JSON.stringify(p),
				cached = this.images.get(key);
			if (cached) return cached;
			const id = p.src.startsWith("@wire-photo:") ? p.src.slice(12) : undefined;
			const src = id === undefined ? p.src : this.photos.get(id);
			if (!src) throw Error("Missing Rust notes photo projection.");
			const photo = { ...p, src };
			this.images.set(key, photo);
			return photo;
		};
		for (const [id, page] of Object.entries(
			result.pagePool as Record<string, import("../model.js").NotePage>,
		)) {
			this.pages.set(id, {
				...page,
				...(page.background ? { background: image(page.background) } : {}),
				layers: page.layers.map((l) => ({
					...l,
					elements: l.elements.map((e) => (e.kind === "image" ? image(e) : e)),
				})),
			});
		}
		const document = (doc: Record<string, unknown>) => ({
			...doc,
			pages: (doc.pages as number[]).map((id) => {
				const p = this.pages.get(String(id));
				if (!p) throw Error("Missing Rust notes page projection.");
				return p;
			}),
		});
		result.document = document(result.document as Record<string, unknown>);
		if (result.frames)
			result.frames = (
				result.frames as { id: number; document: Record<string, unknown> }[]
			).map((f) => ({ ...f, document: document(f.document) }));
		const keepPages = new Set((result.keepPages as number[]).map(String)),
			keepPhotos = new Set((result.keepPhotos as number[]).map(String));
		for (const id of this.pages.keys()) if (!keepPages.has(id)) this.pages.delete(id);
		for (const [id, src] of this.photos)
			if (!keepPhotos.has(id)) {
				this.photos.delete(id);
				this.sourceIds.delete(src);
			}
		const activeImages = new Set<import("../model.js").InkImage>();
		for (const p of this.pages.values()) {
			if (p.background) activeImages.add(p.background);
			for (const l of p.layers)
				for (const e of l.elements) if (e.kind === "image") activeImages.add(e);
		}
		for (const [key, p] of this.images) if (!activeImages.has(p)) this.images.delete(key);
		return result;
	}

	save(): Uint8Array {
		return this.call("office_save");
	}
	close(): void {
		this.instance = undefined;
		this.clear();
	}
}

/** Marshal shared immutable pages once. Rust performs validation, limits and persistence. */
function sharedHistory(
	document: import("../model.js").Notebook,
	state: import("../history.js").NoteHistoryState,
) {
	const refs = new Map(document.pages.map((p, i) => [p, -i - 1]));
	const current: string[] = [];
	const photos: Record<string, string> = {};
	const images = new Map<string, number>();
	const pagePhotos = (p: import("../model.js").NotePage) => [
		...(p.background ? [p.background] : []),
		...p.layers.flatMap((l) => l.elements.filter((e) => e.kind === "image")),
	];
	for (const p of document.pages)
		for (const image of pagePhotos(p))
			if (!current.includes(image.src)) current.push(image.src);
	const pages: import("../model.js").NotePage[] = [];
	const image = (e: import("../model.js").InkImage) => {
		const index = current.indexOf(e.src);
		if (index >= 0) return { ...e, src: `@current-photo:${index}` };
		if (!images.has(e.src)) {
			const id = images.size;
			images.set(e.src, id);
			photos[String(id)] = e.src;
		}
		return { ...e, src: `@photo:${images.get(e.src)}` };
	};
	const frame = (d: import("../model.js").Notebook) => ({
		title: d.title,
		pages: d.pages.map((p) => {
			let ref = refs.get(p);
			if (ref === undefined) {
				ref = pages.length;
				refs.set(p, ref);
				pages.push({
					...p,
					...(p.background ? { background: image(p.background) } : {}),
					layers: p.layers.map((l) => ({
						...l,
						elements: l.elements.map((e) => (e.kind === "image" ? image(e) : e)),
					})),
				});
			}
			return ref;
		}),
	});
	const past = state.past.map(frame),
		future = state.future.map(frame);
	return { format: "cubeoffice-note-history", version: 1, pages, past, future, photos };
}
