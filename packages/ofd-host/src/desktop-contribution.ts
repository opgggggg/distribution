import { OFD_VUE_FORMAT_CONTRIBUTION } from "@cubexp/ofd/office-vue";
import {
	createUiArtifactSurfaceHandle,
	type UiArtifactFormatContribution,
} from "@yaochn/als-office-editor-ui/vue";
import { acquireSession } from "./session-lease";
import { authorize, nativeAvailable } from "./bridge";
import DesktopOfdSurface from "./DesktopOfdSurface.vue";
const base = OFD_VUE_FORMAT_CONTRIBUTION;
export const CUBEOFFICE_OFD_CONTRIBUTION: UiArtifactFormatContribution = {
	...base,
	plugin: {
		...base.plugin,
		async open(input, context) {
			const session = await base.plugin.open(input, context);
			if (!nativeAvailable()) return session;
			if (input.source === undefined) throw new Error("Document source is missing");
			const lease = await acquireSession(
				input.source,
				input.fileName ?? "document.ofd",
				session.artifactId,
				context?.signal ?? new AbortController().signal,
			);
			return {
				...session,
				async export(request) {
					for (const document of lease.info.documents)
						await authorize(lease.info, document.index, "export");
					return session.export(request);
				},
				close() {
					session.close();
					void lease.release();
				},
			};
		},
	},
	converters: base.converters?.map((converter) => ({
		...converter,
		async convert(input, context) {
			if (!nativeAvailable()) return converter.convert(input, context);
			if (input.kind !== "bytes") throw new Error("OFD conversion requires bytes");
			const lease = await acquireSession(
				input.blob,
				input.fileName ?? "document.ofd",
				`conversion:${crypto.randomUUID()}`,
				context?.signal ?? new AbortController().signal,
			);
			try {
				for (const document of lease.info.documents)
					await authorize(lease.info, document.index, "export");
				return await converter.convert(input, context);
			} finally {
				await lease.release();
			}
		},
	})),
	createBinding(input) {
		return {
			component: DesktopOfdSurface,
			props: { source: input.source, fileName: input.fileName, artifactId: input.artifactId },
		};
	},
	adaptExposed(exposed) {
		return createUiArtifactSurfaceHandle(base.plugin.manifest, exposed, {
			nativeExportFormat: "ofd",
			role: "viewer",
			readonly: true,
		});
	},
};
