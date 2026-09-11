<script setup lang="ts">
import { ref } from "vue";
import { UiEditorI18nProvider } from "@yaochn/als-office-editor-ui/vue";
import ClientServices from "../services/ClientServices.vue";
const services = ref<InstanceType<typeof ClientServices>>();
defineExpose({ handleBack: () => services.value?.handleBack() ?? false });
</script>
<template>
	<UiEditorI18nProvider locale="zh-CN"><ClientServices ref="services" /></UiEditorI18nProvider>
</template>
