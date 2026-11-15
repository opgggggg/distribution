<script setup lang="ts">
import { pathData, type VectorObject } from "./model";
defineProps<{ object: VectorObject }>();
</script>

<template>
	<g
		v-if="!object.hidden"
		:data-vector-id="object.id"
		:transform="`matrix(${object.matrix.join(' ')})`"
		:fill="object.fill ?? 'none'"
		:fill-opacity="object.fillAlpha"
	>
		<path
			v-if="object.kind === 'path'"
			:d="pathData(object.commands)"
			:fill-rule="object.fillRule"
			:stroke="object.stroke ?? 'none'"
			:stroke-opacity="object.strokeAlpha"
			:stroke-width="object.strokeWidth"
			:stroke-linecap="(['butt', 'round', 'square'] as const)[object.strokeCap]"
			:stroke-linejoin="(['miter', 'round', 'bevel'] as const)[object.strokeJoin]"
			:stroke-miterlimit="object.miterLimit"
		/>
		<text v-else font-family="Arial, sans-serif" :font-size="object.size">{{
			object.text
		}}</text>
	</g>
</template>
