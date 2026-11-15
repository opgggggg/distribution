<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{ svg: string; width: number; height: number }>();
const frame = ref<HTMLElement>();
const url = ref("");
let observer: IntersectionObserver | undefined;

function loadPreview() {
	if (url.value) URL.revokeObjectURL(url.value);
	url.value = URL.createObjectURL(new Blob([props.svg], { type: "image/svg+xml" }));
}

onMounted(() => {
	if (!frame.value || typeof IntersectionObserver === "undefined") {
		loadPreview();
		return;
	}
	observer = new IntersectionObserver((entries) => {
		if (!entries.some((entry) => entry.isIntersecting)) return;
		loadPreview();
		observer?.disconnect();
	});
	observer.observe(frame.value);
});
watch(
	() => props.svg,
	() => {
		if (url.value) loadPreview();
	},
);
onBeforeUnmount(() => {
	observer?.disconnect();
	if (url.value) URL.revokeObjectURL(url.value);
});
</script>

<template>
	<span ref="frame" class="ofd-page-preview" :style="{ aspectRatio: width / height }">
		<img v-if="url" :src="url" alt="" />
	</span>
</template>

<style scoped>
.ofd-page-preview {
	display: block;
	width: 100%;
	max-height: 230px;
	background: white;
}
.ofd-page-preview img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: contain;
}
</style>
