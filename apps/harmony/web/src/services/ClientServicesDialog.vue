<script setup lang="ts">
import { onMounted, ref } from "vue";
import ClientServices from "./ClientServices.vue";
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
onMounted(() => dialog.value?.showModal());
</script>
<template>
	<dialog ref="dialog" class="client-services-dialog" aria-label="反馈与更新" @cancel.prevent="emit('close')">
		<header><h1>反馈与更新</h1><button type="button" @click="emit('close')">关闭</button></header>
		<ClientServices />
	</dialog>
</template>
<style scoped>
.client-services-dialog { width: min(640px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); box-sizing: border-box; overflow: auto; padding: 24px; border: 1px solid var(--office-border, #d9dce8); border-radius: 16px; color: var(--office-text, #202335); background: var(--office-surface, #fff); }
.client-services-dialog::backdrop { background: rgb(0 0 0 / 45%); }
header { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
h1 { font-size: 20px; }
.client-services-dialog :deep(button), .client-services-dialog :deep(input), .client-services-dialog :deep(textarea) { font: inherit; min-height: 44px; max-width: 100%; box-sizing: border-box; }
.client-services-dialog :deep(button) { cursor: pointer; padding: 8px 16px; margin: 4px; }
.client-services-dialog :deep(label) { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 16px 0; }
.client-services-dialog :deep(textarea), .client-services-dialog :deep(input) { width: 100%; }
.client-services-dialog :deep(p) { line-height: 1.6; overflow-wrap: anywhere; }
.client-services-dialog :deep(code) { overflow-wrap: anywhere; }
.client-services-dialog :deep(:focus-visible) { outline: 2px solid #4f46e5; outline-offset: 3px; }
.client-services-dialog :deep(button:disabled) { opacity: .5; cursor: wait; }
</style>
