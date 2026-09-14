import { fileURLToPath } from 'node:url';

function replaceOnce(source, before, after) {
	if (source.split(before).length !== 2) throw new Error('Upstream desktop large-file integration changed; update the CubeOffice adapter.');
	return source.replace(before, after);
}

/** Generic lazy-Blob support layered on the pinned upstream host, with fail-closed compatibility checks. */
export function cubeOfficeLargeTextPlugin() {
	const desktopHost = fileURLToPath(new URL('../../../als-office/apps/desktop/src/desktop-host.ts', import.meta.url));
	const desktopApp = fileURLToPath(new URL('../../../als-office/apps/desktop/src/App.vue', import.meta.url));
	const helper = fileURLToPath(new URL('./large-text-file.ts', import.meta.url));
	return {
		name: 'cubeoffice-large-text', enforce: 'pre',
		transform(source, id) {
			if (id === desktopHost) {
				source = replaceOnce(source, '\tbytes: Uint8Array;\n\topenedAt: string;', '\tbytes: Uint8Array;\n\tsource?: Blob;\n\topenedAt: string;');
				source = replaceOnce(source, 'export async function readArtifact(path: string): Promise<DesktopArtifact> {', 'export async function readArtifact(path: string): Promise<DesktopArtifact> {\n\tconst ranged = await readLargeTextArtifact(path);\n\tif (ranged) return ranged;');
				return { code: `import { readLargeTextArtifact } from ${JSON.stringify(helper)};\n${source}`, map: null };
			}
			if (id !== desktopApp) return;
			source = replaceOnce(source, '<script setup lang="ts">', `<script setup lang="ts">\nimport { isLargeTextFile } from ${JSON.stringify(helper)};`);
			source = replaceOnce(source, 'const source = next.bytes.byteLength\n\t\t? new Blob([next.bytes as BlobPart], { type: mimeTypeForFormat(next.format) })\n\t\t: null;', 'const source = next.source ?? (next.bytes.byteLength\n\t\t? new Blob([next.bytes as BlobPart], { type: mimeTypeForFormat(next.format) })\n\t\t: null);');
			source = replaceOnce(source, 'function readDirty(tab: ArtifactTab): boolean {', 'function readDirty(tab: ArtifactTab): boolean {\n\tif (tab.document.source && !tab.editor?.capabilities.edit) return false;');
			source = replaceOnce(source, 'formatFileSize(bytes.byteLength)', 'formatFileSize(tab.document.source?.size ?? bytes.byteLength)');
			source = replaceOnce(source, '(tab.document.conversion?.sourceBytes ?? tab.document.bytes).byteLength', '(tab.document.source?.size ?? (tab.document.conversion?.sourceBytes ?? tab.document.bytes).byteLength)');
			source = replaceOnce(source, '(artifact.conversion?.sourceBytes ?? artifact.bytes).byteLength', '(artifact.source?.size ?? (artifact.conversion?.sourceBytes ?? artifact.bytes).byteLength)');
			source = replaceOnce(source, 'bytes: new Uint8Array(await blob.arrayBuffer()),', '...(isLargeTextFile(blob.size, fileName) ? { bytes: new Uint8Array(), source: blob } : { bytes: new Uint8Array(await blob.arrayBuffer()) }),');
			return { code: source, map: null };
		},
	};
}
