import { fileURLToPath } from "node:url";

const root = fileURLToPath(
	new URL("../../../als-office/apps/desktop/src/", import.meta.url),
).replaceAll("\\", "/");
const appearance = fileURLToPath(new URL("./graphics/appearance.ts", import.meta.url));
const output = fileURLToPath(new URL("./graphics/output.ts", import.meta.url));
const download = root + "download-bridge.ts";
const illustrator = fileURLToPath(new URL("./graphics/illustrator.ts", import.meta.url));

const illustratorMenuCommands = fileURLToPath(
	new URL("./graphics/illustrator/menu-commands.ts", import.meta.url),
);
const illustratorNativeMenu = fileURLToPath(
	new URL("./graphics/illustrator/native-menu.ts", import.meta.url),
);

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
						`import { requireIllustratorSource } from ${JSON.stringify(illustrator)};\n` +
						replaceOnce(
							source,
							"> = {\n\tdocx: async (bytes) => {",
							"> = {\n\tai: async (bytes) => requireIllustratorSource(bytes),\n\tdocx: async (bytes) => {",
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
			if (path === root + "app/persistence.ts") {
				const vectorImport = fileURLToPath(
					new URL("./graphics/illustrator/import.ts", import.meta.url),
				);
				source = replaceOnce(
					source,
					"let path = destination || tab.document.path;",
					`const illustrator = tab.document.format === "ai";
		const vectorSurface = tab.editor.exposed as { requiresSaveAs?: () => boolean } | undefined;
		const copyingIllustrator = illustrator && vectorSurface?.requiresSaveAs?.() === true;
		if (illustrator && !destination && tab.document.path &&
			(copyingIllustrator || !(await canOverwriteVectorFile(tab.document.path)))) {
			if (!interactive) throw new Error("Save this Illustrator document to a separate .ai file.");
			const name = tab.document.name.replace(/\\.ai$/i, "") + " - edited.ai";
			destination = (await chooseSavePath({ name, format: "ai" })) ?? undefined;
			if (!destination) throw new DOMException("Save As was cancelled.", "AbortError");
		}
		let path = destination || tab.document.path;
		if (illustrator && !/\\.ai$/i.test(path))
			throw new Error("Use an .ai extension for the editable Illustrator copy.");`,
				);
				source = replaceOnce(
					source,
					"const fingerprint = await contentFingerprint(new Uint8Array(await blob.arrayBuffer()));",
					`if (illustrator && expected !== "missing" &&
				(copyingIllustrator || !(await canOverwriteVectorFile(path))))
				throw new Error("Choose a new filename to preserve the original Illustrator artwork.");
			const fingerprint = await contentFingerprint(new Uint8Array(await blob.arrayBuffer()));`,
				);
				return {
					code:
						`import { readFile as readVectorFile } from "@tauri-apps/plugin-fs";
import { isCubeOfficeVectorFile } from ${JSON.stringify(vectorImport)};
async function canOverwriteVectorFile(path: string): Promise<boolean> {
	return isCubeOfficeVectorFile(await readVectorFile(path));
}
` + source,
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
			if (path === root + "desktop-host.ts") {
				source = replaceOnce(
					source,
					"print(): void;",
					`print(): void;
	exportDocument?(format: "pdf" | "png"): void;
	illustratorCommand?(command: IllustratorCommand): void;`,
				);
				source = replaceOnce(
					source,
					"setCheckingForUpdates(checking: boolean): void;",
					`setCheckingForUpdates(checking: boolean): void;
	setExportEnabled?(enabled: boolean): void;
	setIllustratorState?(state: IllustratorMenuState | null, interactive: boolean): void;`,
				);
				source = replaceOnce(
					source,
					"const fileMenu = await Submenu.new({",
					`const exportItems = actions.exportDocument ? await Promise.all(
		(["pdf", "png"] as const).map(async (format) => [format, await MenuItem.new({
			id: menuItemId("export-" + format),
			text: graphicsExportLabel(format, menuCopy.file === "文件"),
			enabled: false,
			action: () => focusedActions.exportDocument?.(format),
		})] as const),
	) : [];
	const fileMenu = await Submenu.new({`,
				);
				source = replaceOnce(
					source,
					"saveAsItem,\n\t\t\tprintItem,",
					`saveAsItem,
			...exportItems.map(([, item]) => item),
			printItem,`,
				);
				source = replaceOnce(
					source,
					"const menu = await Menu.new({ items: [appMenu, fileMenu, editMenu] });",
					`const menu = await Menu.new({ items: [appMenu, fileMenu, editMenu] });
	const illustratorMenu = focusedActions.illustratorCommand
		? await createIllustratorNativeMenu(menu, menuItemId, focusedActions.illustratorCommand, menuCopy.file === "文件")
		: undefined;`,
				);
				source = replaceOnce(
					source,
					"void menu.close();",
					`illustratorMenu?.dispose();
			void menu.close();`,
				);
				source = replaceOnce(
					source,
					"setMenuCopy: (next) => {",
					`setIllustratorState: illustratorMenu?.setState,
		setExportEnabled: (enabled) => {
			for (const [, item] of exportItems) void item.setEnabled(enabled);
		},
		setMenuCopy: (next) => {
			illustratorMenu?.setLanguage(next.file === "文件");
			for (const [format, item] of exportItems)
				void item.setText(graphicsExportLabel(format, next.file === "文件"));`,
				);
				return {
					code:
						`import { graphicsExportLabel } from ${JSON.stringify(output)};
import { createIllustratorNativeMenu } from ${JSON.stringify(illustratorNativeMenu)};
import type { IllustratorCommand, IllustratorMenuState } from ${JSON.stringify(illustratorMenuCommands)};
` + source,
					map: null,
				};
			}
			if (path === root + "app/lifecycle.ts") {
				source = replaceOnce(
					source,
					"createDesktopLifecycle(ports: DesktopLifecyclePorts)",
					`createDesktopLifecycle(
	ports: DesktopLifecyclePorts,
	exportDocument?: (format: "pdf" | "png") => Promise<void>,
	illustratorCommand?: (command: IllustratorCommand) => void,
)`,
				);
				source = replaceOnce(
					source,
					"print: () => void ports.printCurrent(),",
					`print: () => void ports.printCurrent(),
					exportDocument,
					illustratorCommand,`,
				);
				return {
					code:
						`import type { IllustratorCommand } from ${JSON.stringify(illustratorMenuCommands)};\n` +
						source,
					map: null,
				};
			}
			if (path === root + "SettingsDialog.vue") {
				source = replaceOnce(
					source,
					'<script setup lang="ts">',
					`<script setup lang="ts">
import { useUiEditorI18n } from "@yaochn/als-office-editor-ui/vue";
import { graphicsAppearancePreference, setGraphicsAppearancePreference } from ${JSON.stringify(appearance)};

const i18n = useUiEditorI18n();
const appearanceCopy = computed(() => i18n.value.locale === "zh-CN"
	? { label: "外观", help: "设置 PSD 和 Illustrator 编辑器的外观。", system: "跟随系统", light: "浅色", dark: "深色" }
	: { label: "Appearance", help: "Choose the appearance of the PSD and Illustrator editors.", system: "Follow System", light: "Light", dark: "Dark" });
const appearanceOptions = computed<UiSelectOption[]>(() => [
	{ value: "system", label: appearanceCopy.value.system },
	{ value: "light", label: appearanceCopy.value.light },
	{ value: "dark", label: appearanceCopy.value.dark },
]);`,
				);
				source = replaceOnce(
					source,
					"function restoreDefaults(): void {",
					`function restoreDefaults(): void {
	setGraphicsAppearancePreference("system");`,
				);
				source = replaceOnce(
					source,
					'</section>\n\n\t\t\t<section\n\t\t\t\tv-if="autoUpdateEnabled"',
					`	<div class="settings-dialog__row settings-dialog__row--select">
					<span>
						<strong>{{ appearanceCopy.label }}</strong>
						<small>{{ appearanceCopy.help }}</small>
					</span>
					<div class="settings-dialog__language-select">
						<UiSelect
							:aria-label="appearanceCopy.label"
							:model-value="graphicsAppearancePreference"
							:options="appearanceOptions"
							@update:model-value="setGraphicsAppearancePreference"
						/>
					</div>
				</div>
			</section>

			<section
				v-if="autoUpdateEnabled"`,
				);
				return { code: source, map: null };
			}
			if (path !== root + "App.vue") return;
			source = replaceOnce(
				source,
				'<script setup lang="ts">',
				`<script setup lang="ts">
import { graphicsAppearance } from ${JSON.stringify(appearance)};
import { canOutputDocument, graphicsExportLabel, rasterizePdfFirstPage } from ${JSON.stringify(output)};
import { saveBlobToChosenPath } from ${JSON.stringify(download)};

import type { IllustratorCommand, IllustratorMenuSurface } from ${JSON.stringify(illustratorMenuCommands)};

function activeIllustratorSurface(): IllustratorMenuSurface | undefined {
	const editor = activeTab.value?.editor;
	return editor?.format === "ai" ? editor.exposed as IllustratorMenuSurface : undefined;
}

function runIllustratorMenuCommand(command: IllustratorCommand) {
	if (!busy.value && !transferBusy.value)
		activeIllustratorSurface()?.runIllustratorCommand?.(command);
}

async function exportGraphicsDocument(action: "pdf" | "png"): Promise<void> {
	const tab = activeTab.value;
	if (busy.value || !tab?.editor || !canOutputDocument(tab.editor)) return;
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
				"createDesktopLifecycle(desktopOwnerPorts.desktopLifecycle(desktopPorts))",
				`createDesktopLifecycle(desktopOwnerPorts.desktopLifecycle(desktopPorts), exportGraphicsDocument, runIllustratorMenuCommand)`,
			);
			source = replaceOnce(
				source,
				"watch(menuCopy, (next) => menuHandle.value?.setMenuCopy(next));",
				`watch(menuCopy, (next) => menuHandle.value?.setMenuCopy(next));
watch(
	[menuHandle, () => !busy.value && canOutputDocument(activeTab.value?.editor)],
	([menu, enabled]) => menu?.setExportEnabled?.(enabled),
);
watch(
	[
		menuHandle,
		() => activeIllustratorSurface()?.getIllustratorMenuState?.() ?? null,
		() => !busy.value && !transferBusy.value,
	],
	([menu, state, interactive]) => menu?.setIllustratorState?.(state, interactive),
);`,
			);
			source = replaceOnce(
				source,
				'<button type="button" role="menuitem" @click="showSettingsFromInWindowMenu">',
				`<template v-if="nativeRuntime && canOutputDocument(activeTab?.editor)">
						<button type="button" role="menuitem" :disabled="busy" @click="closeInWindowMenu(); exportGraphicsDocument('pdf')">
							{{ graphicsExportLabel('pdf', appLanguage === 'zh-CN') }}
						</button>
						<button type="button" role="menuitem" :disabled="busy" @click="closeInWindowMenu(); exportGraphicsDocument('png')">
							{{ graphicsExportLabel('png', appLanguage === 'zh-CN') }}
						</button>
					</template>
					<button type="button" role="menuitem" @click="showSettingsFromInWindowMenu">`,
			);
			return { code: source, map: null };
		},
	};
}
