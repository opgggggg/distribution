import {
	createUiArtifactSurfaceHandle,
	type UiArtifactSurfaceHandle,
	type UiArtifactSurfaceInput,
} from "@yaochn/als-office-editor-ui/vue";
import type { ArtifactFormatManifest } from "@yaochn/als-office-editor-core";
export function mobileSurface(
	manifest: ArtifactFormatManifest,
	exposed: unknown,
	input: UiArtifactSurfaceInput,
	format: string,
): UiArtifactSurfaceHandle | null {
	const base = createUiArtifactSurfaceHandle(manifest, exposed, {
		readonly: input.readonly,
		nativeExportFormat: format,
	});
	if (!base) return null;
	const api = exposed as { getDocument?: () => unknown; getLoadError?: () => string };
	return {
		...base,
		async ready(signal) {
			for (let attempt = 0; attempt < 1800; attempt++) {
				if (signal?.aborted) throw new DOMException("Loading cancelled", "AbortError");
				if (api.getDocument?.()) return;
				if (api.getLoadError?.()) throw new Error(api.getLoadError());
				await new Promise<void>((resolve) => setTimeout(resolve, 16));
			}
			throw new Error("文件加载超时，请重新打开。");
		},
	};
}
