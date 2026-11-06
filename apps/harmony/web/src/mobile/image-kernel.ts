import { createImageArtifactPlugin, type ImageAiCommand } from "@yaochn/als-office-image";

/** Detached source-backed Rust commands; the host retains its bounded Blob history.
 * Pixel decoding/rendering remains with the upstream browser image exporter.
 */
export async function transformMobileImage(
	source: Blob,
	commands: readonly ImageAiCommand[],
	signal?: AbortSignal,
): Promise<{ blob: Blob; kernel: string }> {
	const session = await createImageArtifactPlugin({ signal }).open({
		source,
		fileName: "Image.png",
		access: "readWrite",
	});
	try {
		if (!session.execute) throw new Error("Image kernel does not support editing.");
		await session.execute({ commands, baseRevision: session.getState().revision });
		// The upstream plugin is now native-only and fails if its kernel cannot load.
		return { blob: await session.export({ format: "png", signal }), kernel: "wasm" };
	} finally {
		session.close();
	}
}
