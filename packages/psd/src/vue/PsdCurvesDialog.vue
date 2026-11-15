<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { UiDialog, UiButton } from "@yaochn/als-office-editor-ui/vue";
import {
	identityCurves,
	curveLut,
	cloneDocumentStructure,
	PsdEditorSession,
	type PsdCurves,
	type PsdCurvesSetAction,
} from "@cubexp/psd";
import { usePsdEditorContext } from "./psd-editor-context";
const open = defineModel<boolean>({ default: false });
const props = defineProps<{ layerId?: string }>();
const editor = usePsdEditorContext();
const draft = ref<PsdCurves>(identityCurves()),
	channel = ref<keyof PsdCurves>("rgb"),
	selected = ref(0),
	preview = ref(true);
const points = computed(() => draft.value[channel.value]);
const path = computed(() =>
	Array.from(curveLut(points.value), (y, x) => `${x ? "L" : "M"}${x} ${255 - y}`).join(" "),
);
function action(): PsdCurvesSetAction {
	return {
		type: "curves.set",
		...(props.layerId ? { layerId: props.layerId } : {}),
		curves: draft.value,
	};
}
function showPreview() {
	if (!open.value || !preview.value || !editor.document.value) {
		editor.previewDocument.value = null;
		return;
	}
	try {
		const s = new PsdEditorSession(cloneDocumentStructure(editor.document.value));
		s.apply([action()]);
		editor.previewDocument.value = s.peekDocument();
	} catch (e) {
		editor.lastError.value = String(e);
	}
}
watch(open, (value) => {
	if (value) {
		const layer = editor.activeLayer.value;
		draft.value =
			layer && layer.kind !== "group" && props.layerId && layer.curves
				? structuredClone(JSON.parse(JSON.stringify(layer.curves)))
				: identityCurves();
		channel.value = "rgb";
		selected.value = 0;
		preview.value = true;
		showPreview();
	} else editor.previewDocument.value = null;
});
watch([draft, preview], showPreview, { deep: true });
watch(channel, () => (selected.value = 0));
onBeforeUnmount(() => (editor.previewDocument.value = null));
function apply() {
	editor.previewDocument.value = null;
	const result = editor.apply([action()], "Curves adjustment");
	if (result) {
		if (result.createdIds[0]) editor.selectLayer(result.createdIds[0]);
		open.value = false;
	}
}
function updatePoint(axis: "x" | "y", value: number) {
	const i = selected.value,
		p = points.value[i];
	if (!p || !Number.isFinite(value)) return;
	const low = axis === "x" ? (points.value[i - 1]?.x ?? -1) + 1 : 0,
		high = axis === "x" ? (points.value[i + 1]?.x ?? 256) - 1 : 255;
	p[axis] = Math.max(low, Math.min(high, Math.round(value)));
}
let dragging = false;
function position(e: PointerEvent) {
	const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
	return {
		x: Math.max(0, Math.min(255, Math.round(((e.clientX - r.left) / r.width) * 255))),
		y: Math.max(0, Math.min(255, Math.round(255 - ((e.clientY - r.top) / r.height) * 255))),
	};
}
function down(e: PointerEvent) {
	const p = position(e);
	let i = points.value.findIndex((v) => Math.hypot(v.x - p.x, v.y - p.y) < 12);
	if (i < 0) {
		if (points.value.length >= 19) return;
		i = points.value.findIndex((v) => v.x >= p.x);
		if (i < 0) i = points.value.length;
		if (points.value[i]?.x === p.x) {
			selected.value = i;
		} else {
			points.value.splice(i, 0, p);
			selected.value = i;
		}
	} else selected.value = i;
	dragging = true;
	(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
	if (!dragging) return;
	const p = position(e);
	updatePoint("x", p.x);
	updatePoint("y", p.y);
}
function remove() {
	if (points.value.length <= 2) return;
	points.value.splice(selected.value, 1);
	selected.value = Math.min(selected.value, points.value.length - 1);
}
</script>
<template>
	<UiDialog
		v-model="open"
		title="Curves adjustment"
		description="Click to add a point; drag to shape the curve. Source pixels remain unchanged."
		initial-focus="#psd-curve-channel"
		size="md"
	>
		<div class="psd-curves">
			<label
				>Channel
				<select id="psd-curve-channel" v-model="channel">
					<option value="rgb">RGB</option>
					<option value="red">Red</option>
					<option value="green">Green</option>
					<option value="blue">Blue</option>
				</select></label
			>
			<svg
				viewBox="0 0 255 255"
				role="img"
				aria-label="Curves graph, editable using the point controls below"
				@pointerdown="down"
				@pointermove="move"
				@pointerup="dragging = false"
				@pointercancel="dragging = false"
			>
				<path
					d="M0 64H255 M0 128H255 M0 192H255 M64 0V255 M128 0V255 M192 0V255"
					class="grid"
				/>
				<path d="M0 255L255 0" class="baseline" />
				<path :d="path" class="curve" />
				<circle
					v-for="(p, i) in points"
					:key="i"
					:cx="p.x"
					:cy="255 - p.y"
					:r="i === selected ? 4 : 3"
					:class="{ selected: i === selected }"
				/>
			</svg>
			<div class="point-controls">
				<label
					>Point
					<select v-model.number="selected">
						<option v-for="(p, i) in points" :key="i" :value="i">{{ i + 1 }}</option>
					</select></label
				><label
					>Input
					<input
						type="number"
						min="0"
						max="255"
						:value="points[selected]?.x"
						@input="
							updatePoint('x', Number(($event.target as HTMLInputElement).value))
						" /></label
				><label
					>Output
					<input
						type="number"
						min="0"
						max="255"
						:value="points[selected]?.y"
						@input="
							updatePoint('y', Number(($event.target as HTMLInputElement).value))
						"
				/></label>
			</div>
			<div class="point-controls">
				<UiButton
					:disabled="points.length >= 19"
					@click="
						points.some((p) => p.x === 128)
							? (selected = points.findIndex((p) => p.x === 128))
							: (points.push({ x: 128, y: 128 }),
								points.sort((a, b) => a.x - b.x),
								(selected = points.findIndex((p) => p.x === 128)))
					"
					>Add midpoint</UiButton
				><UiButton :disabled="points.length <= 2" @click="remove">Remove point</UiButton
				><UiButton
					@click="
						draft = identityCurves();
						selected = 0;
					"
					>Reset</UiButton
				>
			</div>
			<label><input v-model="preview" type="checkbox" /> Preview on canvas</label>
		</div>
		<template #footer
			><UiButton @click="open = false">Cancel</UiButton
			><UiButton kind="primary" @click="apply">Apply curves</UiButton></template
		>
	</UiDialog>
</template>
<style scoped>
.psd-curves {
	display: grid;
	gap: 14px;
}
.psd-curves svg {
	width: 256px;
	height: 256px;
	justify-self: center;
	background: #191c22;
	border: 1px solid #666;
	touch-action: none;
	cursor: crosshair;
	overflow: visible;
}
.grid {
	stroke: #444;
	stroke-width: 0.5;
	fill: none;
}
.baseline {
	stroke: #666;
	stroke-dasharray: 3;
	fill: none;
}
.curve {
	stroke: #a5bfff;
	stroke-width: 2;
	fill: none;
}
circle {
	fill: #fff;
	stroke: #253660;
	stroke-width: 1;
}
.selected {
	fill: #a5bfff;
}
.point-controls {
	display: flex;
	gap: 10px;
	flex-wrap: wrap;
}
.point-controls label {
	display: flex;
	align-items: center;
	gap: 6px;
}
.psd-curves input[type="number"] {
	width: 64px;
}
.psd-curves select,
.psd-curves input[type="number"] {
	background: transparent;
	color: inherit;
	border: 1px solid #777;
	border-radius: 4px;
	padding: 5px;
}
</style>
