import { open, SeekMode } from '@tauri-apps/plugin-fs';
import { RangeTextBlob, EDITABLE_TEXT_MAX_BYTES } from '@cubexp/text/large-file';
import { TEXT_EXTENSIONS } from '@cubexp/text/formats';

export function isLargeTextFile(size: number, fileName: string): boolean {
	const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
	return size > EDITABLE_TEXT_MAX_BYTES && (TEXT_EXTENSIONS as readonly string[]).includes(extension);
}

/** Native reads are bounded; no readFile or whole-file IPC occurs for large source files. */
export async function readLargeTextArtifact(path: string) {
	const name = path.split(/[\\/]/).pop() ?? path;
	if (!(TEXT_EXTENSIONS as readonly string[]).includes(name.split('.').pop()?.toLowerCase() ?? '')) return;
	const handle = await open(path, { read: true });
	let info;
	try { info = await handle.stat(); } finally { await handle.close(); }
	if (!isLargeTextFile(info.size, name)) return;
	const size = info.size, modified = info.mtime?.getTime();
	const source = new RangeTextBlob(async (start, end, signal) => {
		signal?.throwIfAborted();
		const file = await open(path, { read: true });
		try {
			const current = await file.stat();
			if (current.size !== size || current.mtime?.getTime() !== modified) throw new Error('The file changed on disk. Reopen it to continue browsing.');
			await file.seek(start, SeekMode.Start);
			const result = new Uint8Array(end - start);
			let filled = 0;
			while (filled < result.length) {
				signal?.throwIfAborted();
				const count = await file.read(result.subarray(filled));
				if (!count) throw new Error('Unexpected end of file. Reopen the file.');
				filled += count;
			}
			return result;
		} finally { await file.close(); }
	}, size);
	return { path, name, format: name.split('.').pop()!.toLowerCase(), bytes: new Uint8Array(), source, openedAt: new Date().toISOString() };
}
