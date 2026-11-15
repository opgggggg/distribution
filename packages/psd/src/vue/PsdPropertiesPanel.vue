<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { UiButton, UiField, UiIcon, UiInput, UiTextarea } from "@yaochn/als-office-editor-ui/vue";
import type { PsdEditorAction } from "@cubexp/psd";
import { usePsdEditorContext } from "./psd-editor-context";
import { readPsdWidgetCollapsed, writePsdWidgetCollapsed } from "./psd-widget-storage";

const editor = usePsdEditorContext();
const active = computed(() => editor.activeLayer.value);
const fieldId = useId();
const expanded = ref({
	transform: !readPsdWidgetCollapsed("properties.transform"),
	text: !readPsdWidgetCollapsed("properties.text"),
	document: !readPsdWidgetCollapsed("properties.document"),
});

watch(
	expanded,
	(value) => {
		writePsdWidgetCollapsed("properties.transform", !value.transform);
		writePsdWidgetCollapsed("properties.text", !value.text);
		writePsdWidgetCollapsed("properties.document", !value.document);
	},
	{ deep: true },
);

function toggleSection(section: keyof typeof expanded.value): void {
	expanded.value[section] = !expanded.value[section];
}

const positionX = ref(0);
const positionY = ref(0);
watch(
	() => [active.value, editor.revision.value] as const,
	() => {
		const layer = active.value;
		if (layer && layer.kind !== "group") {
			positionX.value = layer.left;
			positionY.value = layer.top;
		}
	},
	{ immediate: true },
);

function commitPosition(): void {
	const layer = active.value;
	if (!layer || layer.kind === "group" || editor.readonly.value) return;
	const dx = Math.round(Number(positionX.value) - layer.left);
	const dy = Math.round(Number(positionY.value) - layer.top);
	if (!dx && !dy) return;
	editor.apply([{ type: "layer.move", layerId: layer.id, dx, dy } as PsdEditorAction], "Move");
}

const textDraft = ref("");
watch(
	() => [active.value, editor.revision.value] as const,
	() => {
		const layer = active.value;
		if (layer?.kind === "text") textDraft.value = layer.text.text;
	},
	{ immediate: true },
);

function commitText(): void {
	const layer = active.value;
	if (!layer || layer.kind !== "text" || editor.readonly.value) return;
	if (textDraft.value === layer.text.text || !textDraft.value.trim()) return;
	editor.apply(
		[{ type: "text.setContent", layerId: layer.id, text: textDraft.value } as PsdEditorAction],
		"Edit Text",
	);
}

const documentInfo = computed(() => {
	const document = editor.document.value;
	if (!document) return null;
	return {
		size: `${document.width} × ${document.height} px`,
		mode: `${document.colorMode.toUpperCase()} / ${document.bitsPerChannel}-bit`,
		resolution: document.resolutionPpi ? `${Math.round(document.resolutionPpi)} ppi` : "—",
	};
});
</script>

<template>
	<div class="als-ofs-psd-properties">
		<section
			v-if="active && active.kind !== 'group' && !active.curves && !active.adjustment"
			class="als-ofs-psd-properties__section"
		>
			<h4 class="als-ofs-psd-properties__heading">
				<button
					type="button"
					class="als-ofs-psd-properties__section-toggle"
					:aria-expanded="expanded.transform"
					:aria-controls="`${fieldId}-transform-panel`"
					@click="toggleSection('transform')"
				>
					<UiIcon
						:name="expanded.transform ? 'chevron-down' : 'chevron-right'"
						:size="12"
					/>
					Transform
				</button>
			</h4>
			<div
				v-show="expanded.transform"
				:id="`${fieldId}-transform-panel`"
				class="als-ofs-psd-properties__grid"
			>
				<UiField label="X" :label-id="`${fieldId}-x`">
					<UiInput
						:aria-labelledby="`${fieldId}-x`"
						v-model="positionX"
						type="number"
						:disabled="editor.readonly.value"
						@change="commitPosition"
						@keydown.enter="commitPosition"
					/>
				</UiField>
				<UiField label="Y" :label-id="`${fieldId}-y`">
					<UiInput
						:aria-labelledby="`${fieldId}-y`"
						v-model="positionY"
						type="number"
						:disabled="editor.readonly.value"
						@change="commitPosition"
						@keydown.enter="commitPosition"
					/>
				</UiField>
				<UiField label="W" :label-id="`${fieldId}-w`">
					<UiInput
						:aria-labelledby="`${fieldId}-w`"
						:model-value="active.bitmap.width"
						type="number"
						disabled
					/>
				</UiField>
				<UiField label="H" :label-id="`${fieldId}-h`">
					<UiInput
						:aria-labelledby="`${fieldId}-h`"
						:model-value="active.bitmap.height"
						type="number"
						disabled
					/>
				</UiField>
			</div>
		</section>

		<p
			v-if="
				active &&
				active.kind !== 'group' &&
				active.sourceTransform?.rendered === active.bitmap
			"
			class="als-ofs-psd-properties__section"
		>
			Transform source: {{ active.sourceTransform?.source.width }} ×
			{{ active.sourceTransform?.source.height }} px. Scale and rotation reuse these original
			pixels. Painting starts a new source.
		</p>
		<section v-if="active?.kind === 'text'" class="als-ofs-psd-properties__section">
			<h4 class="als-ofs-psd-properties__heading">
				<button
					type="button"
					class="als-ofs-psd-properties__section-toggle"
					:aria-expanded="expanded.text"
					:aria-controls="`${fieldId}-text-panel`"
					@click="toggleSection('text')"
				>
					<UiIcon :name="expanded.text ? 'chevron-down' : 'chevron-right'" :size="12" />
					Text
				</button>
			</h4>
			<div
				v-show="expanded.text"
				:id="`${fieldId}-text-panel`"
				class="als-ofs-psd-properties__section-body"
			>
				<UiTextarea
					v-model="textDraft"
					class="als-ofs-psd-properties__text"
					aria-label="Text content"
					:rows="4"
					:disabled="editor.readonly.value"
				/>
				<UiButton kind="primary" :disabled="editor.readonly.value" @click="commitText">
					Apply text
				</UiButton>
				<p class="als-ofs-psd-properties__hint">
					Re-rendered with browser fonts; styling stays approximate.
				</p>
			</div>
		</section>

		<section v-if="documentInfo" class="als-ofs-psd-properties__section">
			<h4 class="als-ofs-psd-properties__heading">
				<button
					type="button"
					class="als-ofs-psd-properties__section-toggle"
					:aria-expanded="expanded.document"
					:aria-controls="`${fieldId}-document-panel`"
					@click="toggleSection('document')"
				>
					<UiIcon
						:name="expanded.document ? 'chevron-down' : 'chevron-right'"
						:size="12"
					/>
					Document
				</button>
			</h4>
			<div
				v-show="expanded.document"
				:id="`${fieldId}-document-panel`"
				class="als-ofs-psd-properties__section-body"
			>
				<dl class="als-ofs-psd-properties__facts">
					<div>
						<dt>Size</dt>
						<dd>{{ documentInfo.size }}</dd>
					</div>
					<div>
						<dt>Mode</dt>
						<dd>{{ documentInfo.mode }}</dd>
					</div>
					<div>
						<dt>Resolution</dt>
						<dd>{{ documentInfo.resolution }}</dd>
					</div>
				</dl>
				<p
					v-for="warning in editor.document.value?.openWarnings ?? []"
					:key="warning"
					class="als-ofs-psd-properties__warning"
				>
					{{ warning }}
				</p>
			</div>
		</section>
	</div>
</template>
