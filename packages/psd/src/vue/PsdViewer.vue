<script setup lang="ts">
import PsdEditor from "./PsdEditor.vue";
import type { PsdSource } from "./component-types";

withDefaults(
	defineProps<{
		source?: PsdSource | null;
		fileName?: string;
		chrome?: boolean;
	}>(),
	{
		source: null,
		fileName: "document.psd",
		chrome: true,
	},
);
</script>

<template>
	<PsdEditor
		class="als-ofs-psd-viewer"
		:source="source"
		:file-name="fileName"
		:chrome="chrome"
		:readonly="true"
		:ribbon="false"
		:left-panel="false"
	/>
</template>
