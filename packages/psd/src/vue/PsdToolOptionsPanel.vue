<script setup lang="ts">
import { computed, useId } from "vue";
import { UiCheckbox, UiIconButton, UiSelect, UiSlider } from "@yaochn/als-office-editor-ui/vue";
import type { PsdToolId } from "./component-types";
import PsdToolIcon from "./PsdToolIcon.vue";
import { usePsdEditorContext } from "./psd-editor-context";
import { PSD_TOOLS } from "./psd-tools";

const editor = usePsdEditorContext();
const tool = computed(() => editor.tool.value);
const activeTool = computed(() => PSD_TOOLS.find((entry) => entry.id === tool.value));
const fieldId = useId();

const brushTools = ["brush", "eraser", "clone", "dodge", "burn", "heal", "blur"] as const;
const optionTools: readonly PsdToolId[] = [
	"move",
	...brushTools,
	"bucket",
	"wand",
	"marquee",
	"lasso",
	"crop",
	"eyedropper",
	"gradient",
	"shape",
	"text",
	"hand",
	"zoom",
];
const hasOptions = computed(() => optionTools.includes(tool.value));

function closePanel(): void {
	editor.toolOptionsOpen.value = false;
}

const panelTitle = computed(() => {
	switch (tool.value) {
		case "clone":
			return "Clone Stamp";
		case "bucket":
			return "Paint Bucket";
		case "wand":
			return "Magic Wand";
		case "marquee":
			return "Marquee";
		case "text":
			return "Text Tool";
		default:
			return activeTool.value?.label.replace(/\s*\(.*/, "") ?? "Tool";
	}
});

const showBrush = computed(() => brushTools.includes(tool.value as (typeof brushTools)[number]));

const brushSizeModel = computed({
	get: () => editor.brushSize.value,
	set: (value: number) => (editor.brushSize.value = value),
});
const brushHardnessModel = computed({
	get: () => Math.round(editor.brushHardness.value * 100),
	set: (value: number) => (editor.brushHardness.value = value / 100),
});
const brushOpacityModel = computed({
	get: () => Math.round(editor.brushOpacity.value * 100),
	set: (value: number) => (editor.brushOpacity.value = value / 100),
});
const bucketToleranceModel = computed({
	get: () => editor.bucketTolerance.value,
	set: (value: number) => (editor.bucketTolerance.value = value),
});
const wandToleranceModel = computed({
	get: () => editor.wandTolerance.value,
	set: (value: number) => (editor.wandTolerance.value = value),
});
const selectionFeatherModel = computed({
	get: () => editor.selectionFeather.value,
	set: (value: number) =>
		(editor.selectionFeather.value = Math.min(250, Math.max(0, Math.round(value)))),
});
const textSizeModel = computed({
	get: () => editor.textSize.value,
	set: (value: number) => (editor.textSize.value = value),
});
const shapeStrokeWidthModel = computed({
	get: () => editor.shapeStrokeWidth.value,
	set: (value: number) => (editor.shapeStrokeWidth.value = value),
});
const bucketOpacityModel = computed({
	get: () => Math.round(editor.bucketOpacity.value * 100),
	set: (value: number) => (editor.bucketOpacity.value = value / 100),
});
const gradientOpacityModel = computed({
	get: () => Math.round(editor.gradientOpacity.value * 100),
	set: (value: number) => (editor.gradientOpacity.value = value / 100),
});
const shapeOpacityModel = computed({
	get: () => Math.round(editor.shapeOpacity.value * 100),
	set: (value: number) => (editor.shapeOpacity.value = value / 100),
});
const dodgeBurnExposureModel = computed({
	get: () => Math.round(editor.dodgeBurnExposure.value * 100),
	set: (value: number) => (editor.dodgeBurnExposure.value = value / 100),
});
</script>

<template>
	<section
		v-if="hasOptions && editor.toolOptionsOpen.value"
		id="als-ofs-psd-tool-options"
		class="als-ofs-psd-tool-options"
		:aria-labelledby="`${fieldId}-title`"
	>
		<header class="als-ofs-psd-tool-options__header">
			<PsdToolIcon v-if="activeTool" :tool="activeTool.id" :size="16" />
			<h3 :id="`${fieldId}-title`">{{ panelTitle }}</h3>
			<kbd v-if="activeTool">{{ activeTool.key }}</kbd>
			<UiIconButton
				class="als-ofs-psd-tool-options__close"
				icon="close"
				label="Close tool options"
				title="Close tool options (Esc)"
				@click="closePanel"
			/>
		</header>
		<div class="als-ofs-psd-tool-options__body">
			<template v-if="tool === 'move'">
				<UiSelect
					v-model="editor.transformMode.value"
					aria-label="Transform mode"
					:options="[
						{ value: 'scale', label: 'Scale' },
						{ value: 'distort', label: 'Free Distort' },
					]"
				/>
				<UiCheckbox
					v-model="editor.moveAutoSelect.value"
					label="Auto-select visible pixels"
				/>
				<UiCheckbox
					v-model="editor.showTransformControls.value"
					label="Show transform controls"
				/>
				<p class="als-ofs-psd-tool-options__hint">
					Shift-click layers to select a range. Drag to move with snapping; hold Shift
					while resizing to preserve proportions.
				</p>
			</template>

			<UiSelect
				v-if="tool === 'lasso'"
				v-model="editor.lassoMode.value"
				aria-label="Lasso type"
				:disabled="editor.readonly.value"
				:options="[
					{ value: 'freehand', label: 'Freehand' },
					{ value: 'bezier', label: 'Bezier curve' },
				]"
			/>

			<UiSelect
				v-if="tool === 'marquee' || tool === 'lasso' || tool === 'wand'"
				v-model="editor.selectionMode.value"
				aria-label="Selection mode"
				:disabled="editor.readonly.value"
				:options="[
					{ value: 'replace', label: 'New selection' },
					{ value: 'add', label: 'Add to selection' },
					{ value: 'subtract', label: 'Subtract from selection' },
					{ value: 'intersect', label: 'Intersect with selection' },
				]"
			/>
			<UiSelect
				v-if="tool === 'marquee' || tool === 'lasso' || tool === 'wand'"
				v-model="editor.selectionInteraction.value"
				aria-label="Selection interaction"
				:disabled="editor.readonly.value"
				:options="[
					{ value: 'move', label: 'Create / move selection' },
					{ value: 'edit', label: 'Edit outline points' },
				]"
			/>
			<UiSlider
				v-if="tool === 'marquee' || tool === 'lasso' || tool === 'wand'"
				v-model="selectionFeatherModel"
				label="Feather"
				:min="0"
				:max="250"
				:disabled="editor.readonly.value"
				:output="`${selectionFeatherModel}px`"
			/>
			<p
				v-if="
					(tool === 'marquee' || tool === 'lasso' || tool === 'wand') &&
					editor.selectionInteraction.value === 'edit'
				"
				class="als-ofs-psd-tool-options__hint"
			>
				Drag a square anchor to reshape the selection. Click a path segment to add an
				anchor; drag its round handles to shape a curve. Switch back to Create / move
				selection to drag the whole selection border.
			</p>
			<p
				v-else-if="tool === 'lasso' && editor.lassoMode.value === 'bezier'"
				class="als-ofs-psd-tool-options__hint"
			>
				Click to add anchors; drag while placing one to shape its handles. Click the first
				anchor, double-click, or press Enter to close the path.
			</p>

			<template v-if="showBrush">
				<p v-if="tool === 'heal'">
					Repair with nearby texture; source pixels exclude the stroke. Up to 65,536
					pixels per stroke.
				</p>
				<UiCheckbox
					v-if="tool === 'heal'"
					v-model="editor.retouchSampleMerged.value"
					label="Sample all visible layers"
				/>
				<UiSlider
					v-if="tool === 'blur'"
					v-model="editor.blurRadius.value"
					label="Blur radius"
					:min="0.5"
					:max="30"
					:step="0.5"
					:output="`${editor.blurRadius.value}px`"
				/>

				<span v-if="editor.editTarget.value === 'mask'"
					>Mask ·
					{{
						tool === "blur"
							? "Blur"
							: editor.tool.value === "eraser" || editor.maskPaint.value === "reveal"
								? "White reveals"
								: "Black hides"
					}}</span
				>
				<UiCheckbox
					v-if="tool === 'clone'"
					v-model="editor.cloneAligned.value"
					label="Aligned"
					@update:model-value="editor.cloneOffset.value = null"
				/>
				<UiCheckbox
					v-if="tool === 'clone'"
					v-model="editor.cloneSampleMerged.value"
					label="Sample all visible layers"
				/>
				<p v-if="tool === 'clone'" class="als-ofs-psd-tool-options__hint">
					Alt-click sets the source, then drag to clone. Aligned keeps the source offset
					between strokes; turn it off to restart from the source each time.
				</p>
				<UiSlider
					v-model="brushSizeModel"
					label="Size"
					:min="1"
					:max="300"
					:disabled="editor.readonly.value"
					:output="`${brushSizeModel}px`"
				/>
				<UiSlider
					v-model="brushHardnessModel"
					label="Hardness"
					:min="0"
					:max="100"
					:disabled="editor.readonly.value"
					:output="`${brushHardnessModel}%`"
				/>
				<UiSlider
					v-if="tool !== 'dodge' && tool !== 'burn'"
					v-model="brushOpacityModel"
					label="Opacity"
					:min="1"
					:max="100"
					:disabled="editor.readonly.value"
					:output="`${brushOpacityModel}%`"
				/>
				<template v-if="tool === 'dodge' || tool === 'burn'">
					<UiSelect
						v-model="editor.dodgeBurnRange.value"
						aria-label="Tonal range"
						:disabled="editor.readonly.value"
						:options="[
							{ value: 'shadows', label: 'Shadows' },
							{ value: 'midtones', label: 'Midtones' },
							{ value: 'highlights', label: 'Highlights' },
						]"
					/>
					<UiSlider
						v-model="dodgeBurnExposureModel"
						label="Exposure"
						:min="1"
						:max="100"
						:disabled="editor.readonly.value"
						:output="`${dodgeBurnExposureModel}%`"
					/>
				</template>
			</template>

			<template v-if="tool === 'bucket'">
				<UiSlider
					v-model="bucketToleranceModel"
					label="Tolerance"
					:min="0"
					:max="255"
					:disabled="editor.readonly.value"
					:output="`${bucketToleranceModel}`"
				/>
				<UiSlider
					v-model="bucketOpacityModel"
					label="Opacity"
					:min="1"
					:max="100"
					:disabled="editor.readonly.value"
					:output="`${bucketOpacityModel}%`"
				/>
				<UiCheckbox
					v-model="editor.bucketContiguous.value"
					label="Contiguous"
					:disabled="editor.readonly.value"
				/>
			</template>
			<template v-if="tool === 'wand'">
				<UiSlider
					v-model="wandToleranceModel"
					label="Tolerance"
					:min="0"
					:max="255"
					:disabled="editor.readonly.value"
					:output="`${wandToleranceModel}`"
				/>
				<UiCheckbox
					v-model="editor.wandContiguous.value"
					label="Contiguous"
					:disabled="editor.readonly.value"
				/>
			</template>

			<UiSelect
				v-if="tool === 'marquee'"
				v-model="editor.marqueeShape.value"
				aria-label="Marquee shape"
				:disabled="editor.readonly.value"
				:options="[
					{ value: 'rectangle', label: 'Rectangle' },
					{ value: 'rounded-rectangle', label: 'Rounded Rectangle' },
					{ value: 'ellipse', label: 'Ellipse' },
				]"
			/>

			<template v-if="tool === 'crop'">
				<UiSelect
					v-model="editor.cropAspect.value"
					aria-label="Crop aspect ratio"
					:disabled="editor.readonly.value"
					:options="[
						{ value: 'free', label: 'Unconstrained' },
						{ value: 'original', label: 'Original ratio' },
						{ value: '1:1', label: '1 : 1' },
						{ value: '4:3', label: '4 : 3' },
						{ value: '16:9', label: '16 : 9' },
					]"
				/>
				<p class="als-ofs-psd-tool-options__hint">
					Drag a crop, then press Enter to apply or Escape to cancel.
				</p>
			</template>

			<template v-if="tool === 'eyedropper'">
				<UiSelect
					v-model="editor.eyedropperSample.value"
					aria-label="Eyedropper sample source"
					:options="[
						{ value: 'all', label: 'All layers' },
						{ value: 'current', label: 'Current layer' },
					]"
				/>
				<p class="als-ofs-psd-tool-options__hint">
					Click or drag to sample into the foreground color.
				</p>
			</template>

			<template v-if="tool === 'gradient'">
				<UiSelect
					v-model="editor.gradientType.value"
					aria-label="Gradient type"
					:disabled="editor.readonly.value"
					:options="[
						{ value: 'linear', label: 'Linear' },
						{ value: 'radial', label: 'Radial' },
					]"
				/>
				<UiSlider
					v-model="gradientOpacityModel"
					label="Opacity"
					:min="1"
					:max="100"
					:disabled="editor.readonly.value"
					:output="`${gradientOpacityModel}%`"
				/>
				<UiCheckbox
					v-model="editor.gradientReverse.value"
					label="Reverse colors"
					:disabled="editor.readonly.value"
				/>
				<p class="als-ofs-psd-tool-options__hint">
					Uses the foreground and background colors from the toolbar.
				</p>
			</template>

			<template v-if="tool === 'shape'">
				<UiSlider
					v-if="editor.shapeKind.value === 'rounded-rectangle'"
					v-model="editor.shapeCornerRadius.value"
					label="Corner radius"
					:min="0"
					:max="200"
					:output="`${editor.shapeCornerRadius.value}px`"
				/>
				<UiSelect
					v-model="editor.shapeKind.value"
					aria-label="Shape kind"
					:disabled="editor.readonly.value"
					:options="[
						{ value: 'rectangle', label: 'Rectangle' },
						{ value: 'rounded-rectangle', label: 'Rounded Rectangle' },
						{ value: 'ellipse', label: 'Ellipse' },
						{ value: 'line', label: 'Line' },
					]"
				/>
				<UiCheckbox
					v-model="editor.shapeFillEnabled.value"
					label="Fill (foreground)"
					:disabled="editor.readonly.value"
				/>
				<UiCheckbox
					v-model="editor.shapeStrokeEnabled.value"
					label="Stroke (background)"
					:disabled="editor.readonly.value"
				/>
				<UiSlider
					v-model="shapeStrokeWidthModel"
					label="Stroke width"
					:min="1"
					:max="60"
					:disabled="editor.readonly.value"
					:output="`${shapeStrokeWidthModel}px`"
				/>
				<UiSlider
					v-model="shapeOpacityModel"
					label="Opacity"
					:min="1"
					:max="100"
					:disabled="editor.readonly.value"
					:output="`${shapeOpacityModel}%`"
				/>
				<p class="als-ofs-psd-tool-options__hint">
					Pixels mode: draws destructively on the active layer.
				</p>
			</template>

			<template v-if="tool === 'text'">
				<UiSlider
					v-model="textSizeModel"
					label="Size"
					:min="8"
					:max="200"
					:disabled="editor.readonly.value"
					:output="`${textSizeModel}px`"
				/>
				<p class="als-ofs-psd-tool-options__hint">
					Click empty canvas to add text, or click an existing text layer to edit it. Use
					the canvas controls or Ctrl/Cmd+Enter to apply; Escape cancels.
				</p>
			</template>

			<p v-if="tool === 'hand'" class="als-ofs-psd-tool-options__hint">
				Drag to pan. Hold Space with any tool for temporary Hand; double-click the tool to
				fit.
			</p>
			<p v-if="tool === 'zoom'" class="als-ofs-psd-tool-options__hint">
				Click to zoom in, Alt-click to zoom out; double-click the tool for 100%.
			</p>
		</div>
	</section>
</template>
