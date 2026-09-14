import { QCMS_BASE64 } from "./qcms-data.js";
import type { ReadOptions } from "./types.js";
interface QcmsExports extends WebAssembly.Exports {
	memory: WebAssembly.Memory;
	__wbindgen_externrefs: WebAssembly.Table;
	__wbindgen_malloc: (size: number, align: number) => number;
	__wbindgen_start: () => void;
	qcms_enable_iccv4: () => void;
	qcms_transformer_from_memory: (
		ptr: number,
		length: number,
		type: number,
		intent: number,
	) => number;
	qcms_convert_one: (id: number, c: number) => number;
	qcms_convert_three: (id: number, r: number, g: number, b: number) => number;
	qcms_convert_four: (id: number, c: number, m: number, y: number, k: number) => number;
	qcms_drop_transformer: (id: number) => void;
}
let compiled: Promise<WebAssembly.Module> | undefined;
export async function createIccConverter(): Promise<{
	convert: NonNullable<ReadOptions["colorConverter"]>;
	dispose: () => void;
}> {
	compiled ??= WebAssembly.compile(Uint8Array.from(atob(QCMS_BASE64), (c) => c.charCodeAt(0)));
	const module = await compiled;
	let wasm: QcmsExports;
	const functions: Record<string, WebAssembly.ImportValue> = {};
	for (const imported of WebAssembly.Module.imports(module)) {
		if (imported.name.includes("wbindgen_throw"))
			functions[imported.name] = (ptr: number, len: number) => {
				throw new Error(
					new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, ptr, len)),
				);
			};
		else if (imported.name.includes("copy_result")) functions[imported.name] = () => {};
		else if (imported.name === "__wbindgen_init_externref_table")
			functions[imported.name] = () => {
				const table = wasm.__wbindgen_externrefs,
					offset = table.grow(4);
				table.set(0, undefined);
				[undefined, null, true, false].forEach((value, i) => table.set(offset + i, value));
			};
		else throw new Error(`Unsupported QCMS import ${imported.name}.`);
	}
	wasm = (await WebAssembly.instantiate(module, { "./qcms_bg.js": functions }))
		.exports as QcmsExports;
	wasm.__wbindgen_start();
	wasm.qcms_enable_iccv4();
	const transforms = new Map<Uint8Array, Map<number, number>>();
	let disposed = false;
	const convert: NonNullable<ReadOptions["colorConverter"]> = (values, space) => {
		if (disposed) throw new Error("ICC converter is closed.");
		if (!space.profile) {
			if (values.length === 1) return [values[0] * 255, values[0] * 255, values[0] * 255];
			if (values.length === 4)
				return [
					255 * (1 - values[0]) * (1 - values[3]),
					255 * (1 - values[1]) * (1 - values[3]),
					255 * (1 - values[2]) * (1 - values[3]),
				];
			return [values[0] * 255, values[1] * 255, values[2] * 255];
		}
		const type = values.length === 1 ? 3 : values.length === 4 ? 5 : 0;
		let byType = transforms.get(space.profile);
		if (!byType) {
			byType = new Map();
			transforms.set(space.profile, byType);
		}
		let id = byType.get(type);
		if (id === undefined) {
			const ptr = wasm.__wbindgen_malloc(space.profile.length, 1);
			new Uint8Array(wasm.memory.buffer).set(space.profile, ptr);
			id = wasm.qcms_transformer_from_memory(ptr, space.profile.length, type, 0);
			if (!id) throw new Error("Invalid or unsupported OFD ICC profile.");
			byType.set(type, id);
		}
		const c = values.map((v) => Math.max(0, Math.min(255, Math.round(v * 255))));
		const rgb =
			values.length === 1
				? wasm.qcms_convert_one(id, c[0])
				: values.length === 4
					? wasm.qcms_convert_four(id, c[0], c[1], c[2], c[3])
					: wasm.qcms_convert_three(id, c[0], c[1], c[2]);
		return [(rgb >>> 16) & 255, (rgb >>> 8) & 255, rgb & 255];
	};
	return {
		convert,
		dispose: () => {
			if (disposed) return;
			disposed = true;
			for (const values of transforms.values())
				for (const id of values.values()) wasm.qcms_drop_transformer(id);
			transforms.clear();
		},
	};
}
