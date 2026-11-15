<script setup lang="ts">
import { UiColorPicker, UiIcon, UiTooltip } from "@yaochn/als-office-editor-ui/vue";
import { usePsdEditorContext } from "./psd-editor-context";
import type { PsdToolId } from "./component-types";
import PsdToolIcon from "./PsdToolIcon.vue";
import { PSD_TOOLS } from "./psd-tools";

const editor = usePsdEditorContext();
const GROUP_STARTS = new Set<PsdToolId>([
	"marquee",
	"crop",
	"eyedropper",
	"brush",
	"clone",
	"gradient",
	"shape",
	"hand",
]);

function pick(tool: PsdToolId): void {
	if (editor.tool.value === tool) {
		editor.toolOptionsOpen.value = !editor.toolOptionsOpen.value;
		return;
	}
	editor.tool.value = tool;
	editor.toolOptionsOpen.value = true;
}

function activateDefault(tool: PsdToolId): void {
	if (tool === "hand") editor.viewCommand.value = "fit";
	else if (tool === "zoom") editor.viewCommand.value = "actual";
}

function resetColors(): void {
	editor.foreground.value = "#000000";
	editor.background.value = "#ffffff";
}

function onToolbarKeydown(event: KeyboardEvent): void {
	if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
	event.preventDefault();
	const toolbar = event.currentTarget as HTMLElement;
	const buttons = Array.from(toolbar.querySelectorAll<HTMLButtonElement>("button[data-tool-id]"));
	const active = buttons.indexOf(document.activeElement as HTMLButtonElement);
	const next =
		event.key === "Home"
			? 0
			: event.key === "End"
				? buttons.length - 1
				: (active + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
	buttons[next]?.focus();
}
</script>

<template>
	<aside class="als-ofs-psd-toolstrip" aria-label="Tools">
		<div
			class="als-ofs-psd-toolstrip__tools"
			role="toolbar"
			aria-orientation="vertical"
			@keydown="onToolbarKeydown"
		>
			<template v-for="entry in PSD_TOOLS" :key="entry.id">
				<i
					v-if="GROUP_STARTS.has(entry.id)"
					class="als-ofs-psd-toolstrip__separator"
					aria-hidden="true"
				/>
				<UiTooltip :text="`${entry.label} (${entry.key})`" side="right">
					<button
						type="button"
						class="als-ofs-editor-ui als-ofs-ui-icon-button als-ofs-psd-toolstrip__tool"
						:data-tool-id="entry.id"
						:data-active="editor.tool.value === entry.id ? 'true' : undefined"
						:title="`${entry.label} (${entry.key})`"
						:aria-pressed="editor.tool.value === entry.id"
						:aria-expanded="
							editor.tool.value === entry.id
								? editor.toolOptionsOpen.value
								: undefined
						"
						:aria-controls="
							editor.tool.value === entry.id ? 'als-ofs-psd-tool-options' : undefined
						"
						:aria-label="entry.label"
						:aria-keyshortcuts="entry.key"
						:tabindex="editor.tool.value === entry.id ? 0 : -1"
						@click="pick(entry.id)"
						@dblclick="activateDefault(entry.id)"
					>
						<PsdToolIcon :tool="entry.id" />
					</button>
				</UiTooltip>
			</template>
		</div>
		<div class="als-ofs-psd-toolstrip__colors">
			<button
				type="button"
				class="als-ofs-psd-toolstrip__default-colors"
				aria-label="Default colors (D)"
				title="Default colors (D)"
				@click="resetColors"
			>
				<i />
				<i />
			</button>
			<div class="als-ofs-psd-toolstrip__swatch als-ofs-psd-toolstrip__swatch--foreground">
				<UiColorPicker v-model="editor.foreground.value" compact label="Foreground color" />
			</div>
			<div class="als-ofs-psd-toolstrip__swatch als-ofs-psd-toolstrip__swatch--background">
				<UiColorPicker v-model="editor.background.value" compact label="Background color" />
			</div>
			<button
				type="button"
				class="als-ofs-psd-toolstrip__swap"
				aria-label="Swap colors (X)"
				title="Swap colors (X)"
				@click="editor.swapColors()"
			>
				<UiIcon name="reload" :size="12" />
			</button>
		</div>
	</aside>
</template>
