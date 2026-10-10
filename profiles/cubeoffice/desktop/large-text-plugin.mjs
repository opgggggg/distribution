import { fileURLToPath } from "node:url";

function replaceOnce(source, before, after) {
	if (source.split(before).length !== 2)
		throw new Error(
			"Upstream desktop large-file integration changed; update the CubeOffice adapter.",
		);
	return source.replace(before, after);
}

/** Lazy text sources follow the upstream host's extracted document owners. */
export function cubeOfficeLargeTextPlugin() {
	const root = fileURLToPath(
		new URL("../../../als-office/apps/desktop/src/", import.meta.url),
	).replaceAll("\\", "/");
	const helper = fileURLToPath(new URL("./large-text-file.ts", import.meta.url));
	const patches = {
		"desktop-host.ts": [
			[
				"\tbytes: Uint8Array;\n\topenedAt: string;",
				"\tbytes: Uint8Array;\n\tsource?: Blob;\n\topenedAt: string;",
			],
			[
				"export async function readArtifact(path: string): Promise<DesktopArtifact> {",
				`export async function readArtifact(path: string): Promise<DesktopArtifact> {\n\tconst ranged = await readLargeTextArtifact(path);\n\tif (ranged) return ranged;`,
			],
		],
		"app/document-opening.ts": [
			[
				"const source = next.bytes.byteLength\n\t\t\t? new Blob([next.bytes as BlobPart], { type: mimeTypeForFormat(next.format) })\n\t\t\t: null;",
				"const source = next.source ?? (next.bytes.byteLength\n\t\t\t? new Blob([next.bytes as BlobPart], { type: mimeTypeForFormat(next.format) })\n\t\t\t: null);",
			],
		],
		"app/dirty-state.ts": [
			[
				"function readDirty(tab: ArtifactTab): boolean {",
				"function readDirty(tab: ArtifactTab): boolean {\n\t\tif (tab.document.source && !tab.editor?.capabilities.edit) return false;",
			],
		],
		"App.vue": [
			[
				"formatFileSize(bytes.byteLength)",
				"formatFileSize(tab.document.source?.size ?? bytes.byteLength)",
			],
		],
		"app/cli-documents.ts": [
			[
				"(tab.document.conversion?.sourceBytes ?? tab.document.bytes).byteLength",
				"(tab.document.source?.size ?? (tab.document.conversion?.sourceBytes ?? tab.document.bytes).byteLength)",
			],
		],
		"app/recent-documents.ts": [
			[
				"(artifact.conversion?.sourceBytes ?? artifact.bytes).byteLength",
				"(artifact.source?.size ?? (artifact.conversion?.sourceBytes ?? artifact.bytes).byteLength)",
			],
		],
		"app/lifecycle.ts": [
			[
				"bytes: new Uint8Array(await blob.arrayBuffer()),",
				"...(isLargeTextFile(blob.size, fileName) ? { bytes: new Uint8Array(), source: blob } : { bytes: new Uint8Array(await blob.arrayBuffer()) }),",
			],
		],
		"app/disk-sync.ts": [
			[
				"const source = new Blob([next.bytes as BlobPart], { type: mimeTypeForFormat(next.format) });",
				"const source = next.source ?? new Blob([next.bytes as BlobPart], { type: mimeTypeForFormat(next.format) });",
			],
		],
	};
	return {
		name: "cubeoffice-large-text",
		enforce: "pre",
		transform(source, id) {
			if (id.includes("?")) return;
			const name = id.split("?")[0].replaceAll("\\", "/").slice(root.length);
			if (!id.replaceAll("\\", "/").startsWith(root) || !patches[name]) return;
			for (const [before, after] of patches[name])
				source = replaceOnce(source, before, after);
			if (name === "desktop-host.ts")
				source = `import { readLargeTextArtifact } from ${JSON.stringify(helper)};\n${source}`;
			if (name === "app/lifecycle.ts")
				source = `import { isLargeTextFile } from ${JSON.stringify(helper)};\n${source}`;
			return { code: source, map: null };
		},
	};
}
