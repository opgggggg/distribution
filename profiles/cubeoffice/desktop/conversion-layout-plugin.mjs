import { fileURLToPath } from "node:url";

const app = fileURLToPath(
	new URL("../../../als-office/apps/desktop/src/App.vue", import.meta.url),
).replaceAll("\\", "/");

/** Mount converted Office files in the same read-only editor shells as native Office files. */
export function cubeOfficeConversionLayoutPlugin() {
	return {
		name: "cubeoffice-conversion-layout",
		enforce: "pre",
		transform(source, id) {
			if (id.replaceAll("\\", "/") !== app) return;
			const replacements = [
				[
					"const conversionReadonly = Boolean(tab.document.conversion);",
					`const conversionReadonly = Boolean(tab.document.conversion);
	const useOfficeEditor = usesOfficeConversionEditor(tab);`,
				],
				[
					'{ role: "viewer" as const, readonly: true }',
					'{ role: useOfficeEditor ? "editor" as const : "viewer" as const, readonly: true }',
				],
				[
					"surfaceProps: desktopSurfaceProps(tab.document.format),",
					`surfaceProps: {
			...desktopSurfaceProps(tab.document.format),
			...(useOfficeEditor && tab.document.format === "pptx" ? { editor: true } : {}),
			...(tab.document.conversion?.sourceFormat === "rtf" ? { rightPanel: false } : {}),
		},`,
				],
				[
					"const activeConversion = computed(() => activeTab.value?.document.conversion ?? null);",
					`function usesOfficeConversionEditor(tab: ArtifactTab | null): boolean {
	return Boolean(tab?.document.conversion &&
		["docx", "xlsx", "pptx", "vsdx"].includes(tab.document.format));
}
const activeConversion = computed(() => activeTab.value?.document.conversion ?? null);
const useOfficeConversionEditor = computed(() => usesOfficeConversionEditor(activeTab.value));`,
				],
				[
					'<div class="desktop-titlebar__actions" data-no-drag>',
					`<div class="desktop-titlebar__actions" data-no-drag>
				<button
					v-if="activeConversion && useOfficeConversionEditor && !activeTab?.opening && !activeTab?.openError"
					type="button"
					:disabled="busy"
					@click="convertCurrentReadonlyArtifact"
				>
					{{ shellCopy.convertToFormat.replace('{format}', activeConversion.targetFormat.toUpperCase()) }}
				</button>`,
				],
				[
					`<ReadonlyConversionRibbon
					v-if="activeConversion && !activeTab?.opening && !activeTab?.openError"`,
					`<ReadonlyConversionRibbon
					v-if="activeConversion && !useOfficeConversionEditor && !activeTab?.opening && !activeTab?.openError"
					data-editor-palette="alphalife"`,
				],
			];
			for (const [before, after] of replacements) {
				if (source.split(before).length !== 2) {
					throw new Error(
						"Upstream desktop conversion layout changed; update the CubeOffice adapter.",
					);
				}
				source = source.replace(before, after);
			}
			return { code: source, map: null };
		},
	};
}
