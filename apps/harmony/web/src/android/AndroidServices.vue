<script setup lang="ts">
import { ref } from "vue";
import ClientServices from "../services/ClientServices.vue";
const services = ref<InstanceType<typeof ClientServices>>();
defineExpose({ handleBack: () => services.value?.handleBack() ?? false });
</script>
<template><ClientServices ref="services" /></template>
