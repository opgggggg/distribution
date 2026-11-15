import { fileURLToPath } from "node:url";

const root = fileURLToPath(
	new URL("../../../als-office/apps/desktop/src/", import.meta.url),
).replaceAll("\\", "/");
const appearance = fileURLToPath(new URL("./graphics/appearance.ts", import.meta.url));
const output = fileURLToPath(new URL("./graphics/output.ts", import.meta.url));
const download = root + "download-bridge.ts";
const illustrator = fileURLToPath(new URL("./graphics/illustrator.ts", import.meta.url));

function replaceOnce(source, before, after) {
	if (source.split(before).length !== 2) {
		throw new Error("Upstream graphics integration point changed.");
	}
	return source.replace(before, after);
}

export function cubeOfficeGraphicsPlugin() {
	return {
		name: "cubeoffice-graphics",
		enforce: "pre",
		transform(source, id) {
			const path = id.replaceAll("\\", "/");
			if (path === root + "format-contributions.ts") {
				return {
					code:
						`import { requireIllustratorPreview } from ${JSON.stringify(illustrator)};\n` +
						replaceOnce(
							source,
							"> = {\n\tdocx: async (bytes) => {",
							"> = {\n\tai: async (bytes) => requireIllustratorPreview(bytes),\n\tdocx: async (bytes) => {",
						),
					map: null,
				};
			}
			if (path === root + "app/surface-export.ts") {
				return {
					code:
						`import { exportTextSurfacePdf } from ${JSON.stringify(output)};\n` +
						replaceOnce(
							source,
							"? tab.document.conversion",
							`? editor.format === "text"
								? exportTextSurfacePdf(editor, guard.signal)
								: tab.document.conversion`,
						),
					map: null,
				};
			}
			if (path === root + "app/file-commands.ts") {
				return {
					code: replaceOnce(
						source,
						"if (!isTauri() || !tab?.editor) return;",
						`if (!isTauri() || !tab?.editor) return;
		if (tab.editor.format === "ofd") {
			const exposed = tab.editor.exposed as { printDocument?: () => Promise<void> } | undefined;
			if (!exposed?.printDocument) return;
			await exposed.printDocument();
			return;
		}`,
					),
					map: null,
				};
			}
			if (path === root + "recent-previews.ts") {
				return {
					code:
						`import { capturePdfOutputPreview } from ${JSON.stringify(output)};\n` +
						replaceOnce(
							source,
							"const preview = await captureDocumentPreview(surface);",
							`const editor = handle as import("@yaochn/als-office-editor-ui/vue").UiArtifactSurfaceHandle;
				const nativePreview = editor.format === "pdf" || editor.format === "ai"
					? await capturePdfOutputPreview(editor)
					: undefined;
				if (!stillCurrent()) return;
				const preview = nativePreview ?? await captureDocumentPreview(surface);`,
						),
					map: null,
				};
			}
			if (path !== root + "App.vue") return;
			source = replaceOnce(
				source,
				'<script setup lang="ts">',
				`<script setup lang="ts">
import { graphicsAppearance, toggleGraphicsAppearance } from ${JSON.stringify(appearance)};
import { canOutputDocument, rasterizePdfFirstPage } from ${JSON.stringify(output)};
import { saveBlobToChosenPath } from ${JSON.stringify(download)};

async function chooseDocumentOutput(event: Event): Promise<void> {
	const select = event.target as HTMLSelectElement;
	const action = select.value;
	select.value = "";
	const tab = activeTab.value;
	if (!tab?.editor || !canOutputDocument(tab.editor)) return;
	if (action === "print") {
		await printCurrent();
		return;
	}
	if (action !== "pdf" && action !== "png") return;
	const editor = tab.editor;
	await withBusy(appLanguage.value === "zh-CN" ? "正在准备导出…" : "Preparing export…", async () => {
		const pdf = () => editor.format === "ofd" ? editor.export({ format: "pdf" }) : exportFileOf(tab, true)("pdf");
		const blob = action === "png" && (editor.format === "psd" || editor.format === "image")
			? await editor.export({ format: "png" })
			: await pdf().then((pdf) => action === "png" ? rasterizePdfFirstPage(pdf) : pdf);
		if (activeTab.value?.id !== tab.id) throw new Error("The active document changed during export.");
		const name = (tab.document.name.replace(/\\.[^.]+$/u, "") || "Document") + "." + action;
		await saveBlobToChosenPath(blob, name);
	});
}
`,
			);
			source = replaceOnce(
				source,
				'class="desktop-app"',
				`class="desktop-app"
				:data-graphics-appearance="document?.format === 'psd' || document?.format === 'ai' ? graphicsAppearance : undefined"`,
			);
			source = replaceOnce(
				source,
				'<div class="desktop-titlebar__actions" data-no-drag>',
				`<div class="desktop-titlebar__actions" data-no-drag>
				<select
					v-if="nativeRuntime && canOutputDocument(activeTab?.editor)"
					class="desktop-output-menu"
					:disabled="busy"
					:aria-label="appLanguage === 'zh-CN' ? '打印或导出' : 'Print or export'"
					@change="chooseDocumentOutput"
				>
					<option value="">{{ appLanguage === 'zh-CN' ? '输出…' : 'Output…' }}</option>
					<option v-if="!isWindowsHost()" value="print">{{ appLanguage === 'zh-CN' ? '打印' : 'Print' }}</option>
					<option value="pdf">{{ appLanguage === 'zh-CN' ? '导出 PDF' : 'Export PDF' }}</option>
					<option value="png">{{ appLanguage === 'zh-CN' ? '首页图片（PNG）' : 'First page (PNG)' }}</option>
				</select>
				<button
					v-if="document?.format === 'psd' || document?.format === 'ai'"
					type="button"
					:aria-pressed="graphicsAppearance === 'dark'"
					@click="toggleGraphicsAppearance"
				>
					{{ appLanguage === 'zh-CN' ? '深色外观' : 'Dark appearance' }}
				</button>`,
			);
			return { code: source, map: null };
		},
	};
}
