<script setup lang="ts">
defineProps<{ message: string }>();
const emit = defineEmits<{ dismiss: [] }>();
</script>
<template>
	<div v-if="message" class="harmony-feedback" role="alert">
		<span>{{ message }}</span>
		<button type="button" aria-label="关闭错误提示" @click="emit('dismiss')">×</button>
	</div>
</template>
