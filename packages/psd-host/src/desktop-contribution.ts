import { pngAsPdf } from "../../../profiles/cubeoffice/desktop/graphics/output";
import { graphicsAppearance } from "../../../profiles/cubeoffice/desktop/graphics/appearance";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { PSD_VUE_FORMAT_CONTRIBUTION, createPsdImageServicesFromTransport } from "@cubexp/psd/vue";
import { psdBase64ToBytes } from "@cubexp/psd";
const imageServices = createPsdImageServicesFromTransport(async (operation, bytes, settings) => {
	const result = await invoke<{ id: string; length: number }>("profile_service_upload", bytes, {
		headers: {
			"x-profile-upload": encodeURIComponent(
				JSON.stringify({ kind: "psd-image", operation, ...settings }),
			),
		},
	});
	try {
		if (
			!Number.isSafeInteger(result.length) ||
			result.length <= 0 ||
			result.length > 64 * 1024 * 1024
		)
			throw Error("Invalid native image length");
		const png = new Uint8Array(result.length);
		for (let offset = 0; offset < png.length; ) {
			const chunk = await invoke<{ data: string }>("profile_service_call", {
				method: "psd.image.read",
				params: { id: result.id, offset },
			});
			const data = psdBase64ToBytes(chunk.data);
			if (!data.length || offset + data.length > png.length)
				throw Error("Invalid native image chunk");
			png.set(data, offset);
			offset += data.length;
		}
		return png;
	} finally {
		await invoke("profile_service_call", {
			method: "psd.image.release",
			params: { id: result.id },
		});
	}
});
export const CUBEOFFICE_PSD_CONTRIBUTION = {
	...PSD_VUE_FORMAT_CONTRIBUTION,
	adaptExposed(...args: Parameters<typeof PSD_VUE_FORMAT_CONTRIBUTION.adaptExposed>) {
		const surface = PSD_VUE_FORMAT_CONTRIBUTION.adaptExposed(...args);
		if (!surface) return null;
		return {
			...surface,
			export: async (request: Parameters<typeof surface.export>[0] = {}) => {
				if (request.format !== "pdf") return surface.export(request);
				const png = await surface.export({ ...request, format: "png" });
				return pngAsPdf(png, request.signal);
			},
		};
	},

	createBinding(input: Parameters<typeof PSD_VUE_FORMAT_CONTRIBUTION.createBinding>[0]) {
		const binding = PSD_VUE_FORMAT_CONTRIBUTION.createBinding(input);
		let destination: string | null = null;
		let fingerprint: string | undefined;
		const persistPsd = async (blob: Blob, context: { fileName: string; revision: number }) => {
			if (!destination) {
				const selected = await save({
					defaultPath: context.fileName,
					filters: [{ name: "Photoshop document", extensions: ["psd"] }],
				});
				if (!selected) return { persisted: false, reason: "Save cancelled" };
				fingerprint = await invoke<string>("artifact_fingerprint", { path: selected });
				destination = selected;
			}
			await invoke("write_artifact_atomic", {
				path: destination,
				bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
				expectedFingerprint: fingerprint,
			});
			fingerprint = await invoke<string>("artifact_fingerprint", { path: destination });
			return { persisted: true, versionId: fingerprint };
		};
		return {
			...binding,
			props: {
				...binding.props,
				imageServices,
				persistPsd,
				getAppearance: () => graphicsAppearance.value,
				showAppearanceToggle: false,
			},
		};
	},
};
