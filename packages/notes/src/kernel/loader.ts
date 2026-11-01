let compiled: Promise<WebAssembly.Module> | undefined;
/** Only packaged code is loaded; failure is visible instead of silently changing authority. */
export function compileNotesKernel(): Promise<WebAssembly.Module> {
	return (compiled ??= (async () => {
		let url = new URL("./notes-kernel.wasm", import.meta.url);
		if (url.protocol === "file:" && typeof document === "undefined") {
			const fsModule = "node:fs/promises";
			const { readFile } = await import(/* @vite-ignore */ fsModule);
			return WebAssembly.compile(await readFile(url));
		}
		if (url.protocol === "file:" && url.pathname.startsWith("/android_asset/web/assets/"))
			url = new URL(
				`https://appassets.androidplatform.net/assets/web/assets/${url.pathname.split("/").pop()}`,
			);
		const response = await fetch(url);
		if (!response.ok) throw Error(`Notes Rust kernel could not load (${response.status}).`);
		return WebAssembly.compile(await response.arrayBuffer());
	})());
}
