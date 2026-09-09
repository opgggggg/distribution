<script setup lang="ts">
import ClientServices from "../../../apps/harmony/web/src/services/ClientServices.vue";
import { createDesktopClientServices } from "./client-services";
const props = defineProps<{ version: string; locale: string }>();
let service: ReturnType<typeof createDesktopClientServices> | undefined;
let error = "";
try { service = createDesktopClientServices(props.version, props.locale); }
catch { error = "无法保存客户端编号，请检查应用存储后重新打开设置。"; }
</script>
<template>
	<section class="cubeoffice-client-settings">
		<p v-if="error" role="alert">{{ error }}</p>
		<ClientServices v-else :service="service" hide-updates />
	</section>
</template>
<style scoped>
.cubeoffice-client-settings { border-top: 1px solid var(--office-border, #ddd); padding-top: 16px; }
.cubeoffice-client-settings :deep(label) { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 12px 0; }
.cubeoffice-client-settings :deep(textarea), .cubeoffice-client-settings :deep(input) { width: 100%; box-sizing: border-box; font: inherit; min-height: 44px; }
.cubeoffice-client-settings :deep(button) { min-height: 44px; margin: 4px; cursor: pointer; font: inherit; }
.cubeoffice-client-settings :deep(p) { line-height: 1.6; }
.cubeoffice-client-settings :deep(code) { overflow-wrap: anywhere; }
.cubeoffice-client-settings :deep(:focus-visible) { outline: 2px solid #4f46e5; outline-offset: 2px; }
.cubeoffice-client-settings :deep(button:disabled) { opacity: .5; cursor: wait; }
</style>
