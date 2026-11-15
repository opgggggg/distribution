<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { UiDialog, UiButton } from "@yaochn/als-office-editor-ui/vue";
import {
	defaultLiveAdjustment,
	autoLevels,
	cloneDocumentStructure,
	composePsdDocument,
	PsdEditorSession,
	validateLiveAdjustment,
	LEVEL_CHANNELS,
	type PsdLiveAdjustment,
	type PsdLiveAdjustmentKind,
	type PsdAdjustmentSetAction,
	type PsdLayerNode,
	type PsdBitmap,
} from "@cubexp/psd";
import { usePsdEditorContext } from "./psd-editor-context";
const open = defineModel<boolean>({ default: false }),
	props = defineProps<{ kind: PsdLiveAdjustmentKind; layerId?: string }>(),
	editor = usePsdEditorContext();
const draft = ref<PsdLiveAdjustment>(defaultLiveAdjustment("levels")),
	preview = ref(true),
	error = ref(""),
	channel = ref<(typeof LEVEL_CHANNELS)[number]>("rgb"),
	hueRange = ref(-1);
const names = {
	grain: "Film Grain",
	levels: "Levels",
	"hue-saturation": "Hue / Saturation",
	exposure: "Exposure",
	"gradient-map": "Gradient Map",
};
const levelFields = [
	{ key: "inBlack", label: "Input black", min: 0, max: 254, step: 1 },
	{ key: "inWhite", label: "Input white", min: 1, max: 255, step: 1 },
	{ key: "gamma", label: "Gamma", min: 0.01, max: 9.99, step: 0.01 },
	{ key: "outBlack", label: "Output black", min: 0, max: 255, step: 1 },
	{ key: "outWhite", label: "Output white", min: 0, max: 255, step: 1 },
] as const;
const hueFields = [
	{ key: "hue", label: "Hue", min: -180, max: 180 },
	{ key: "saturation", label: "Saturation", min: -100, max: 100 },
	{ key: "lightness", label: "Lightness", min: -100, max: 100 },
] as const;
const hueTarget = computed(() =>
	draft.value.kind === "hue-saturation"
		? hueRange.value < 0
			? draft.value
			: draft.value.ranges[hueRange.value]
		: null,
);
let input: PsdBitmap | null = null,
	aboveLayerId: string | undefined,
	frame: number | null = null;
const bins = ref<number[]>(Array(256).fill(0));
const histogram = computed(() => {
	const max = Math.max(1, ...bins.value);
	return bins.value.map((n, x) => `M${x} 70V${70 - (n / max) * 68}`).join(" ");
});
function updateHistogram() {
	const counts = Array(256).fill(0);
	if (input)
		for (let p = 0; p < input.data.length; p += 4) {
			const c =
				channel.value === "rgb"
					? Math.round((input.data[p] + input.data[p + 1] + input.data[p + 2]) / 3)
					: input.data[p + LEVEL_CHANNELS.indexOf(channel.value) - 1];
			counts[c] += input.data[p + 3] / 255;
		}
	bins.value = counts;
}
function getInput() {
	if (!editor.document.value) return null;
	const doc = cloneDocumentStructure(editor.document.value),
		anchor = props.layerId ?? aboveLayerId;
	let found = false;
	function cut(layers: PsdLayerNode[]): PsdLayerNode[] {
		const out: PsdLayerNode[] = [];
		for (const layer of layers) {
			if (found) break;
			if (layer.id === anchor) {
				if (!props.layerId) out.push(layer);
				found = true;
				break;
			}
			if (layer.kind === "group") layer.children = cut(layer.children);
			out.push(layer);
		}
		return out;
	}
	if (anchor) doc.layers = cut(doc.layers);
	return composePsdDocument(doc);
}
function action(): PsdAdjustmentSetAction {
	return {
		type: "adjustment.set",
		adjustment: draft.value,
		...(props.layerId
			? { layerId: props.layerId }
			: { name: names[draft.value.kind], ...(aboveLayerId ? { aboveLayerId } : {}) }),
	};
}
function showPreview() {
	error.value = "";
	try {
		validateLiveAdjustment(draft.value);
	} catch (e) {
		error.value = String(e);
		editor.previewDocument.value = null;
		return;
	}
	if (!open.value || !preview.value || !editor.document.value) {
		editor.previewDocument.value = null;
		return;
	}
	try {
		const session = new PsdEditorSession(cloneDocumentStructure(editor.document.value));
		session.apply([action()]);
		editor.previewDocument.value = session.peekDocument();
	} catch (e) {
		error.value = String(e);
		editor.previewDocument.value = null;
	}
}
function schedule() {
	if (frame !== null) return;
	frame = requestAnimationFrame(() => {
		frame = null;
		showPreview();
	});
}
function clear() {
	if (frame !== null) cancelAnimationFrame(frame);
	frame = null;
	editor.previewDocument.value = null;
}
watch(open, (v) => {
	clear();
	if (!v) return;
	const l = editor.activeLayer.value;
	aboveLayerId = l?.id;
	draft.value =
		l && l.kind !== "group" && props.layerId && l.adjustment
			? JSON.parse(JSON.stringify(l.adjustment))
			: defaultLiveAdjustment(props.kind);
	channel.value = "rgb";
	hueRange.value = -1;
	preview.value = true;
	input = getInput();
	updateHistogram();
	showPreview();
});
watch([draft, preview], schedule, { deep: true });
watch(channel, updateHistogram);
onBeforeUnmount(clear);
function apply() {
	showPreview();
	if (error.value) return;
	clear();
	const result = editor.apply([action()], `${names[draft.value.kind]} adjustment`);
	if (result) {
		if (result.createdIds[0]) editor.selectLayer(result.createdIds[0]);
		open.value = false;
	}
}
function hex(c: { r: number; g: number; b: number }) {
	return "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function setColor(index: number, event: Event) {
	if (draft.value.kind !== "gradient-map") return;
	const h = (event.target as HTMLInputElement).value;
	draft.value.stops[index].color = {
		r: parseInt(h.slice(1, 3), 16),
		g: parseInt(h.slice(3, 5), 16),
		b: parseInt(h.slice(5, 7), 16),
	};
}
function addStop() {
	if (draft.value.kind !== "gradient-map") return;
	const stops = draft.value.stops;
	let i = 0;
	for (let j = 1; j < stops.length - 1; j++)
		if (stops[j + 1].position - stops[j].position > stops[i + 1].position - stops[i].position)
			i = j;
	const l = stops[i],
		r = stops[i + 1];
	stops.splice(i + 1, 0, {
		position: (l.position + r.position) / 2,
		midpoint: 0.5,
		color: {
			r: Math.round((l.color.r + r.color.r) / 2),
			g: Math.round((l.color.g + r.color.g) / 2),
			b: Math.round((l.color.b + r.color.b) / 2),
		},
	});
}
</script>
<template>
	<UiDialog
		v-model="open"
		:title="`${names[draft.kind]} adjustment`"
		description="Edit a live adjustment layer. Source pixels stay unchanged."
		size="md"
	>
		<div class="psd-adjustment">
			<template v-if="draft.kind === 'levels'">
				<label
					>Channel
					<select v-model="channel">
						<option v-for="c in LEVEL_CHANNELS" :key="c" :value="c">
							{{ c.toUpperCase() }}
						</option>
					</select></label
				>
				<svg
					viewBox="0 0 256 72"
					role="img"
					aria-label="Histogram of layers below the adjustment"
				>
					<path :d="histogram" />
				</svg>
				<label v-for="f in levelFields" :key="f.key"
					>{{ f.label
					}}<input
						v-model.number="draft.channels[channel][f.key]"
						type="number"
						:min="f.min"
						:max="f.max"
						:step="f.step"
				/></label>
				<UiButton :disabled="!input" @click="input && (draft = autoLevels(input))"
					>Auto levels</UiButton
				>
			</template>
			<template v-else-if="draft.kind === 'grain'">
				<label
					>Amount<input
						v-model.number="draft.amount"
						type="number"
						min="0"
						max="100"
						step="1"
				/></label>
				<label
					>Grain size<input
						v-model.number="draft.size"
						type="number"
						min="0.5"
						max="20"
						step="0.5"
				/></label>
				<label
					>Roughness<input
						v-model.number="draft.roughness"
						type="number"
						min="0"
						max="100"
						step="1"
				/></label>
				<label
					>Seed<input
						v-model.number="draft.seed"
						type="number"
						min="0"
						max="4294967295"
						step="1"
				/></label>
				<p>
					PSD saves a flattened view for other editors and embeds editable layers for this
					editor. Removing embedded data loses those layers.
				</p>
			</template>
			<template v-else-if="draft.kind === 'exposure'">
				<label
					>Exposure (EV)<input
						v-model.number="draft.exposure"
						type="number"
						min="-20"
						max="20"
						step="0.1" /></label
				><label
					>Offset<input
						v-model.number="draft.offset"
						type="number"
						min="-0.5"
						max="0.5"
						step="0.01" /></label
				><label
					>Gamma correction<input
						v-model.number="draft.gamma"
						type="number"
						min="0.01"
						max="9.99"
						step="0.01"
				/></label>
			</template>
			<template v-else-if="draft.kind === 'hue-saturation'">
				<label><input v-model="draft.colorize" type="checkbox" />Colorize</label>
				<template v-if="draft.colorize"
					><label
						>Color hue<input
							v-model.number="draft.colorHue"
							type="number"
							min="0"
							max="360" /></label
					><label
						>Color saturation<input
							v-model.number="draft.colorSaturation"
							type="number"
							min="0"
							max="100" /></label
					><label
						>Color lightness<input
							v-model.number="draft.colorLightness"
							type="number"
							min="-100"
							max="100" /></label
				></template>
				<template v-else
					><label
						>Color range<select v-model.number="hueRange">
							<option :value="-1">Master</option>
							<option
								v-for="(c, i) in [
									'Reds',
									'Yellows',
									'Greens',
									'Cyans',
									'Blues',
									'Magentas',
								]"
								:key="c"
								:value="i"
							>
								{{ c }}
							</option>
						</select></label
					><template v-if="hueTarget"
						><label v-for="f in hueFields" :key="f.key"
							>{{ f.label
							}}<input
								v-model.number="hueTarget[f.key]"
								type="number"
								:min="f.min"
								:max="f.max" /></label
					></template>
					<fieldset v-if="hueRange >= 0">
						<legend>Range edges (degrees)</legend>
						<label
							v-for="(name, i) in ['Fade in', 'Range start', 'Range end', 'Fade out']"
							:key="name"
							>{{ name
							}}<input
								v-model.number="draft.ranges[hueRange].handles[i]"
								type="number"
								min="0"
								max="360"
						/></label></fieldset
				></template>
			</template>
			<template v-else-if="draft.kind === 'gradient-map'">
				<label><input v-model="draft.reverse" type="checkbox" />Reverse gradient</label>
				<div v-for="(stop, i) in draft.stops" :key="i" class="stop">
					<label
						>Color {{ i + 1
						}}<input
							type="color"
							:value="hex(stop.color)"
							@input="setColor(i, $event)" /></label
					><label
						>Position<input
							v-model.number="stop.position"
							type="number"
							min="0"
							max="1"
							step="0.01"
							:disabled="i === 0 || i === draft.stops.length - 1" /></label
					><label
						>Midpoint<input
							v-model.number="stop.midpoint"
							type="number"
							min="0.01"
							max="0.99"
							step="0.01" /></label
					><UiButton
						:disabled="i === 0 || i === draft.stops.length - 1"
						@click="draft.stops.splice(i, 1)"
						>Remove stop</UiButton
					>
				</div>
				<UiButton :disabled="draft.stops.length >= 32" @click="addStop"
					>Add color stop</UiButton
				>
			</template>
			<p v-if="error" role="alert">{{ error }}</p>
			<label><input v-model="preview" type="checkbox" />Preview on canvas</label
			><UiButton @click="draft = defaultLiveAdjustment(draft.kind)"
				>Reset adjustment</UiButton
			>
		</div>
		<template #footer
			><UiButton @click="open = false">Cancel</UiButton
			><UiButton kind="primary" :disabled="!!error" @click="apply"
				>Apply adjustment</UiButton
			></template
		>
	</UiDialog>
</template>
<style scoped>
.psd-adjustment {
	display: grid;
	gap: 12px;
}
.psd-adjustment label {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}
.psd-adjustment input[type="number"],
.psd-adjustment select {
	background: transparent;
	color: inherit;
	border: 1px solid #888;
	border-radius: 4px;
	padding: 6px;
	width: 120px;
}
.psd-adjustment input[type="checkbox"] {
	margin-right: auto;
}
.psd-adjustment svg {
	width: 100%;
	height: 90px;
	background: #20252c;
}
.psd-adjustment svg path {
	stroke: #a5bded;
	stroke-width: 1;
	fill: none;
}
.psd-adjustment fieldset,
.stop {
	display: grid;
	gap: 8px;
	border: 1px solid #888;
	border-radius: 4px;
	padding: 10px;
}
.psd-adjustment p[role="alert"] {
	color: #b52323;
}
</style>
