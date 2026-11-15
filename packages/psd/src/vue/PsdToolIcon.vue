<script setup lang="ts">
import type { PsdToolId } from "./component-types";
import { PSD_TOOL_ICON_PATHS } from "./psd-tool-icons";

withDefaults(
	defineProps<{
		tool: PsdToolId;
		size?: number;
	}>(),
	{ size: 18 },
);
</script>

<template>
	<svg
		class="als-ofs-psd-tool-icon"
		:data-tool-icon="tool"
		:style="{ width: `${size}px`, height: `${size}px` }"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		focusable="false"
	>
		<path v-for="path in PSD_TOOL_ICON_PATHS[tool]" :key="path" :d="path" />
	</svg>
</template>
