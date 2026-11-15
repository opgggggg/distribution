<script setup lang="ts">
import { UiColorPicker } from "@yaochn/als-office-editor-ui/vue";
import { usePsdEditorContext } from "./psd-editor-context";

const editor = usePsdEditorContext();

const SWATCHES = [
	"#000000",
	"#FFFFFF",
	"#7F7F7F",
	"#D94B3D",
	"#F2B84B",
	"#5DBB63",
	"#35A7C8",
	"#3E78D6",
	"#7E57C2",
];
</script>

<template>
	<div class="als-ofs-psd-color">
		<div
			class="als-ofs-psd-color__field"
			:style="{ '--als-ofs-psd-current-color': editor.foreground.value }"
			aria-hidden="true"
		/>

		<div class="als-ofs-psd-color__pickers">
			<UiColorPicker
				v-model="editor.foreground.value"
				label="Foreground"
				show-label
				:disabled="editor.readonly.value"
			/>
			<UiColorPicker
				v-model="editor.background.value"
				label="Background"
				show-label
				:disabled="editor.readonly.value"
			/>
		</div>

		<div class="als-ofs-psd-color__swatches" role="group" aria-label="Color swatches">
			<button
				v-for="color in SWATCHES"
				:key="color"
				type="button"
				class="als-ofs-psd-color__swatch"
				:aria-label="`Set foreground to ${color}`"
				:aria-pressed="editor.foreground.value.toUpperCase() === color"
				:disabled="editor.readonly.value"
				:style="{ '--als-ofs-psd-swatch': color }"
				@click="editor.foreground.value = color"
			/>
		</div>
	</div>
</template>
