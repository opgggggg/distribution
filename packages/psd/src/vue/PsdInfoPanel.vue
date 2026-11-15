<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { UiIcon } from "@yaochn/als-office-editor-ui/vue";
import { walkPsdLayers, type PsdLayerNode, type PsdRgbColor } from "@cubexp/psd";
import type { PsdToolId } from "./component-types";
import { usePsdEditorContext } from "./psd-editor-context";

const editor = usePsdEditorContext();

interface Frame {
	x: number;
	y: number;
	width: number;
	height: number;
}

const TOOL_HINTS: Record<PsdToolId, string> = {
	move: "Click visible content to select it, then drag to move. Hold Shift to add layers to the selection.",
	marquee:
		"Drag to create a selection. Shift adds, Alt subtracts, and Shift+Alt intersects. Ctrl/Cmd disables snapping.",
	lasso: "Drag around an area to create a freeform selection. Shift and Alt combine selections.",
	wand: "Click a color region to select it. Adjust tolerance in the tool options.",
	crop: "Drag a crop boundary, then press Enter to apply or Escape to cancel.",
	eyedropper: "Click or drag over the canvas to sample colors into the foreground swatch.",
	brush: "Drag to paint on the active pixel layer. Alt-click samples a foreground color.",
	eraser: "Drag to erase pixels on the active layer. An active selection limits the erased area.",
	heal: "Paint over a blemish to replace it with nearby texture. J selects healing.",
	blur: "Drag to soften image or mask pixels locally. R selects blur.",
	clone: "Alt-click to set the clone source, then drag to paint sampled pixels.",
	dodge: "Drag to lighten the active layer. Exposure and tonal range are in the tool options.",
	burn: "Drag to darken the active layer. Exposure and tonal range are in the tool options.",
	gradient:
		"Drag from the start to the end of the gradient. An active selection limits the fill.",
	bucket: "Click to fill a contiguous color region on the active layer.",
	shape: "Drag to draw the selected shape. Hold Shift to constrain its proportions or angle.",
	text: "Click the canvas to add text, or click an existing text layer to edit it.",
	hand: "Drag to pan the pasteboard. Hold Space with any tool for temporary Hand mode.",
	zoom: "Click to zoom in and Alt-click to zoom out. Double-click the tool for 100%.",
};

function layerFrame(layer: PsdLayerNode): Frame | null {
	if (layer.kind !== "group") {
		return {
			x: layer.left,
			y: layer.top,
			width: layer.bitmap.width,
			height: layer.bitmap.height,
		};
	}
	return combineFrames(layer.children.map(layerFrame).filter((frame): frame is Frame => !!frame));
}

function combineFrames(frames: readonly Frame[]): Frame | null {
	if (!frames.length) return null;
	const left = Math.min(...frames.map((frame) => frame.x));
	const top = Math.min(...frames.map((frame) => frame.y));
	const right = Math.max(...frames.map((frame) => frame.x + frame.width));
	const bottom = Math.max(...frames.map((frame) => frame.y + frame.height));
	return { x: left, y: top, width: right - left, height: bottom - top };
}

const selectedBounds = computed<Frame | null>(() => {
	void editor.revision.value;
	const document = editor.document.value;
	if (!document) return null;
	const selected = new Set(editor.selectedLayerIds.value);
	const frames: Frame[] = [];
	walkPsdLayers(document.layers, (layer) => {
		if (!selected.has(layer.id)) return;
		const frame = layerFrame(layer);
		if (frame) frames.push(frame);
	});
	return combineFrames(frames);
});

const measurement = computed<Frame | null>(
	() => editor.canvasMeasurement.value ?? editor.marquee.value ?? selectedBounds.value,
);

function rgbToHsb(color: PsdRgbColor): { h: number; s: number; b: number } {
	const r = color.r / 255;
	const g = color.g / 255;
	const b = color.b / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;
	let hue = 0;
	if (delta) {
		if (max === r) hue = ((g - b) / delta) % 6;
		else if (max === g) hue = (b - r) / delta + 2;
		else hue = (r - g) / delta + 4;
		hue *= 60;
		if (hue < 0) hue += 360;
	}
	return {
		h: Math.round(hue),
		s: Math.round((max ? delta / max : 0) * 100),
		b: Math.round(max * 100),
	};
}

const sampledColor = computed(() => editor.canvasPointer.value?.color ?? null);
const hsb = computed(() => (sampledColor.value ? rgbToHsb(sampledColor.value) : null));
const sampleStyle = computed<CSSProperties>(() => {
	const color = sampledColor.value;
	return {
		"--als-ofs-psd-info-sample": color
			? `rgb(${color.r} ${color.g} ${color.b})`
			: "transparent",
	} as CSSProperties;
});

function formatBytes(bytes: number): string {
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1)} MB`;
}

const documentMemory = computed(() => {
	void editor.revision.value;
	const document = editor.document.value;
	if (!document) return null;
	const compositeBytes = document.width * document.height * 4;
	let layerBytes = 0;
	walkPsdLayers(document.layers, (layer) => {
		if (layer.kind !== "group") layerBytes += layer.bitmap.data.byteLength;
	});
	return {
		composite: formatBytes(compositeBytes),
		total: formatBytes(compositeBytes + layerBytes),
	};
});

const pointerX = computed(() => editor.canvasPointer.value?.x ?? measurement.value?.x ?? null);
const pointerY = computed(() => editor.canvasPointer.value?.y ?? measurement.value?.y ?? null);
const toolHint = computed(() => {
	if (editor.tool.value === "lasso" && editor.lassoMode.value === "bezier") {
		return "Close the Bézier path, then select an anchor to reveal its round handles. Drag a handle to curve the selection; double-click or Option/Alt-drag remains a shortcut, and the path can be resumed later.";
	}
	return TOOL_HINTS[editor.tool.value];
});
const bitDepth = computed(() => editor.document.value?.bitsPerChannel ?? null);

function valueOrDash(value: number | null | undefined, suffix = ""): string {
	return value == null ? "—" : `${Math.round(value)}${suffix}`;
}
</script>

<template>
	<div class="als-ofs-psd-info" aria-label="Live canvas information">
		<section class="als-ofs-psd-info__color" aria-label="Sampled color" :style="sampleStyle">
			<div class="als-ofs-psd-info__color-group">
				<UiIcon name="locate" :size="18" aria-hidden="true" />
				<dl class="als-ofs-psd-info__values">
					<div>
						<dt>H</dt>
						<dd>{{ valueOrDash(hsb?.h, "°") }}</dd>
					</div>
					<div>
						<dt>S</dt>
						<dd>{{ valueOrDash(hsb?.s, "%") }}</dd>
					</div>
					<div>
						<dt>B</dt>
						<dd>{{ valueOrDash(hsb?.b, "%") }}</dd>
					</div>
				</dl>
			</div>
			<div class="als-ofs-psd-info__color-group">
				<span class="als-ofs-psd-info__swatch" aria-hidden="true" />
				<dl class="als-ofs-psd-info__values">
					<div>
						<dt>R</dt>
						<dd>{{ valueOrDash(sampledColor?.r) }}</dd>
					</div>
					<div>
						<dt>G</dt>
						<dd>{{ valueOrDash(sampledColor?.g) }}</dd>
					</div>
					<div>
						<dt>B</dt>
						<dd>{{ valueOrDash(sampledColor?.b) }}</dd>
					</div>
				</dl>
			</div>
			<p class="als-ofs-psd-info__depth">{{ bitDepth ? `${bitDepth}-bit` : "—" }}</p>
		</section>

		<section class="als-ofs-psd-info__geometry" aria-label="Canvas geometry">
			<div class="als-ofs-psd-info__geometry-group">
				<UiIcon name="move" :size="18" aria-hidden="true" />
				<dl class="als-ofs-psd-info__values">
					<div>
						<dt>X</dt>
						<dd>{{ valueOrDash(pointerX) }}</dd>
					</div>
					<div>
						<dt>Y</dt>
						<dd>{{ valueOrDash(pointerY) }}</dd>
					</div>
				</dl>
			</div>
			<div class="als-ofs-psd-info__geometry-group">
				<UiIcon name="crop-fit" :size="18" aria-hidden="true" />
				<dl class="als-ofs-psd-info__values">
					<div>
						<dt>W</dt>
						<dd>{{ valueOrDash(measurement?.width) }}</dd>
					</div>
					<div>
						<dt>H</dt>
						<dd>{{ valueOrDash(measurement?.height) }}</dd>
					</div>
				</dl>
			</div>
		</section>

		<p v-if="documentMemory" class="als-ofs-psd-info__memory">
			Document: {{ documentMemory.composite }} / {{ documentMemory.total }}
		</p>
		<p class="als-ofs-psd-info__hint">{{ toolHint }}</p>
	</div>
</template>
