<script setup lang="ts">
import { ref, shallowRef, watch, nextTick, onBeforeUnmount } from "vue";
import {
	readImagePreview,
	imageExtension,
	decodeImage,
	imageCanvas,
	canvasBlob,
} from "./image-document";
const props = defineProps<{ source: Blob; fileName: string; readonly?: boolean }>();
const toolsDialog = ref<HTMLDialogElement>();
let toolsFocus: HTMLElement | null = null;
const current = shallowRef<Blob>(props.source),
	preview = shallowRef<Blob>();
const past: Blob[] = [],
	future: Blob[] = [];
const revision = ref(0),
	page = ref(0),
	pages = ref(1),
	zoom = ref(100),
	busy = ref(false),
	error = ref("");
const tools = ref(false),
	mode = ref<"view" | "ink">("view"),
	inkCanvas = ref<HTMLCanvasElement>();
const color = ref("#d92d20"),
	penWidth = ref(4),
	caption = ref("");
const maxSide = ref(1600),
	quality = ref(90);
const crop = ref({ x: 0, y: 0, width: 100, height: 100 });
const position = ref({ x: 10, y: 85 });
watch(tools, async (value) => {
	if (value) {
		toolsFocus = document.activeElement as HTMLElement;
		await nextTick();
		toolsDialog.value?.showModal();
	} else {
		toolsDialog.value?.close();
		toolsFocus?.focus({ preventScroll: true });
	}
});
const url = ref(""),
	imageSize = ref({ width: 1, height: 1 });
let generation = 0,
	drawing: number | null = null;
const listeners = new Set<() => void>();
function notify() {
	listeners.forEach((fn) => fn());
}
watch(
	[current, page, () => props.fileName],
	async () => {
		const token = ++generation;
		error.value = "";
		try {
			const result = await readImagePreview(current.value, props.fileName, page.value);
			if (token !== generation) return;
			preview.value = result.blob;
			pages.value = result.pages;
			const image = await decodeImage(result.blob);
			if (token !== generation) return;
			imageSize.value = { width: image.naturalWidth, height: image.naturalHeight };
			URL.revokeObjectURL(url.value);
			url.value = URL.createObjectURL(result.blob);
		} catch (cause) {
			if (token === generation) error.value = (cause as Error).message;
		}
	},
	{ immediate: true },
);
watch(
	() => props.readonly,
	(value) => {
		if (value) {
			tools.value = false;
			mode.value = "view";
		}
	},
);
onBeforeUnmount(() => {
	generation++;
	URL.revokeObjectURL(url.value);
	toolsDialog.value?.close();
});
function commit(blob: Blob) {
	past.push(current.value);
	while (
		past.length > 1 &&
		(past.length > 20 || past.reduce((size, blob) => size + blob.size, 0) > 32 * 1024 * 1024)
	)
		past.shift();
	future.length = 0;
	current.value = blob;
	page.value = 0;
	revision.value++;
	notify();
}
async function raster(): Promise<HTMLImageElement> {
	if (!preview.value) throw new Error("图片尚未加载。");
	return decodeImage(preview.value);
}
async function mutate(operation: (image: HTMLImageElement) => Promise<Blob>) {
	if (props.readonly || busy.value) return;
	busy.value = true;
	error.value = "";
	const before = current.value;
	try {
		const edited = await operation(await raster());
		if (props.readonly || current.value !== before)
			throw new Error("图片状态已改变，请重新执行操作。");
		commit(edited);
		return true;
	} catch (cause) {
		error.value = (cause as Error).message;
		return false;
	} finally {
		busy.value = false;
	}
}
function rotate() {
	return mutate(async (image) => {
		const canvas = imageCanvas(image.naturalHeight, image.naturalWidth),
			ctx = canvas.getContext("2d")!;
		ctx.translate(canvas.width, 0);
		ctx.rotate(Math.PI / 2);
		ctx.drawImage(image, 0, 0);
		return canvasBlob(canvas);
	});
}
function applyCrop() {
	return mutate(async (image) => {
		const { x, y, width, height } = crop.value;
		if (
			![x, y, width, height].every(Number.isFinite) ||
			x < 0 ||
			y < 0 ||
			width <= 0 ||
			height <= 0 ||
			x + width > 100 ||
			y + height > 100
		)
			throw new Error("裁剪范围必须在图片内，宽高须大于零。");
		const canvas = imageCanvas(
			Math.max(1, (image.naturalWidth * width) / 100),
			Math.max(1, (image.naturalHeight * height) / 100),
		);
		canvas
			.getContext("2d")!
			.drawImage(
				image,
				(image.naturalWidth * x) / 100,
				(image.naturalHeight * y) / 100,
				(image.naturalWidth * width) / 100,
				(image.naturalHeight * height) / 100,
				0,
				0,
				canvas.width,
				canvas.height,
			);
		crop.value = { x: 0, y: 0, width: 100, height: 100 };
		return canvasBlob(canvas);
	});
}
function resize() {
	return mutate(async (image) => {
		if (!Number.isFinite(maxSide.value) || maxSide.value < 1 || maxSide.value > 8192)
			throw new Error("最长边须在 1–8192 像素之间。");
		const ratio = Math.min(
			1,
			maxSide.value / Math.max(image.naturalWidth, image.naturalHeight),
		);
		const canvas = imageCanvas(
			Math.max(1, image.naturalWidth * ratio),
			Math.max(1, image.naturalHeight * ratio),
		);
		canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
		return canvasBlob(canvas);
	});
}
function text() {
	if (!caption.value.trim()) return;
	return mutate(async (image) => {
		const canvas = imageCanvas(image.naturalWidth, image.naturalHeight),
			ctx = canvas.getContext("2d")!;
		ctx.drawImage(image, 0, 0);
		ctx.fillStyle = color.value;
		ctx.font = `${Math.max(20, canvas.width / 30)}px sans-serif`;
		ctx.fillText(
			caption.value,
			(canvas.width * position.value.x) / 100,
			(canvas.height * position.value.y) / 100,
		);
		caption.value = "";
		return canvasBlob(canvas);
	});
}
function startInk() {
	tools.value = false;
	mode.value = "ink";
	const canvas = inkCanvas.value;
	if (canvas) {
		canvas.width = Math.min(1200, imageSize.value.width);
		canvas.height = Math.round((canvas.width * imageSize.value.height) / imageSize.value.width);
	}
}
function point(event: PointerEvent) {
	const canvas = inkCanvas.value!,
		rect = canvas.getBoundingClientRect();
	return {
		x: ((event.clientX - rect.left) / rect.width) * canvas.width,
		y: ((event.clientY - rect.top) / rect.height) * canvas.height,
	};
}
function inkDown(event: PointerEvent) {
	if (mode.value !== "ink" || props.readonly || drawing !== null) return;
	drawing = event.pointerId;
	const canvas = inkCanvas.value!,
		ctx = canvas.getContext("2d")!,
		at = point(event);
	canvas.setPointerCapture(event.pointerId);
	ctx.strokeStyle = color.value;
	ctx.lineWidth = penWidth.value;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.beginPath();
	ctx.moveTo(at.x, at.y);
	ctx.lineTo(at.x + 0.01, at.y);
	ctx.stroke();
}
function inkMove(event: PointerEvent) {
	if (drawing !== event.pointerId) return;
	const at = point(event),
		ctx = inkCanvas.value!.getContext("2d")!;
	ctx.lineTo(at.x, at.y);
	ctx.stroke();
}
function inkEnd() {
	drawing = null;
}
async function applyInk() {
	const canvas = inkCanvas.value;
	if (!canvas) return;
	const overlay = await canvasBlob(canvas);
	const applied = await mutate(async (image) => {
		const result = imageCanvas(image.naturalWidth, image.naturalHeight),
			ctx = result.getContext("2d")!;
		ctx.drawImage(image, 0, 0);
		ctx.drawImage(await decodeImage(overlay), 0, 0, result.width, result.height);
		return canvasBlob(result);
	});
	if (applied) mode.value = "view";
	return applied;
}
async function exportFile(format?: string): Promise<Blob> {
	const snapshot = current.value,
		name = props.fileName, exportQuality = quality.value / 100, exportPage = page.value;
    if (snapshot === props.source && (!format || format === "image" || format === "original")) return snapshot;
	if (!format || format === "image" || format === "original") {
		if (
			!revision.value ||
			["png", "gif", "svg", "tif", "tiff", "emf", "wmf"].includes(imageExtension(name))
		)
			return snapshot;
		format = imageExtension(name);
	}
	const type =
		format === "jpg" || format === "jpeg"
			? "image/jpeg"
			: format === "webp"
				? "image/webp"
				: "image/png";
	const rendered = await readImagePreview(snapshot, name, exportPage),
		image = await decodeImage(rendered.blob);
	const canvas = imageCanvas(image.naturalWidth, image.naturalHeight),
		ctx = canvas.getContext("2d")!;
	if (type === "image/jpeg") {
		ctx.fillStyle = "#fff";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}
	ctx.drawImage(image, 0, 0);
	return canvasBlob(canvas, type, exportQuality);
}
function getEditWarning() {
	return !["png", "jpg", "jpeg", "webp"].includes(imageExtension(props.fileName)) &&
		revision.value === 0
		? `编辑将把当前第 ${page.value + 1} 页／帧转换为 PNG。动画、多页和矢量结构不会保留在编辑副本中；原文件仍可分享。继续？`
		: "";
}
async function prepareEditing() {
	if (!getEditWarning()) return undefined;
	const image = await raster(),
		canvas = imageCanvas(image.naturalWidth, image.naturalHeight);
	canvas.getContext("2d")!.drawImage(image, 0, 0);
	current.value = await canvasBlob(canvas);
	page.value = 0;
	past.length = future.length = 0;
	revision.value++;
	notify();
	return props.fileName.replace(/\.[^.]+$/, ".png");
}
defineExpose({
	getDocument: () => (url.value ? preview.value : undefined),
	getLoadError: () => error.value,
	isBusy: () => busy.value,
	getRevision: () => revision.value,
	isDirty: () => current.value !== props.source,
	subscribe: (fn: () => void) => {
		listeners.add(fn);
		return () => listeners.delete(fn);
	},
	exportFile,
	getEditWarning,
	prepareEditing,
	finishEditing: async () => {
		if (mode.value === "ink" && !(await applyInk()))
			throw new Error(error.value || "标注尚未保存，请重试。");
	},
	openTools: () => (tools.value = true),
	handleBack: () => {
		if (tools.value) {
			tools.value = false;
			return true;
		}
		if (mode.value === "ink") {
			void applyInk();
			return true;
		}
		return false;
	},
	undo: () => {
		if (props.readonly || busy.value || !past.length) return;
		future.push(current.value);
		current.value = past.pop()!;
		revision.value++;
		notify();
	},
	redo: () => {
		if (props.readonly || busy.value || !future.length) return;
		past.push(current.value);
		current.value = future.pop()!;
		revision.value++;
		notify();
	},
});
</script>
<template>
	<section class="mobile-image" aria-label="图片查看与编辑">
		<p v-if="error" role="alert">{{ error }}</p>
		<div class="mobile-image__navigation">
			<button :disabled="page === 0 || busy || !readonly" @click="page--">上一页</button>
			<span role="status"
				>{{ page + 1 }} / {{ pages }} · {{ imageSize.width }} × {{ imageSize.height }}</span
			>
			<button :disabled="page + 1 >= pages || busy || !readonly" @click="page++">
				下一页
			</button>
		</div>
		<div class="mobile-image__viewport">
			<div class="mobile-image__picture" :style="{ width: zoom + '%' }">
				<img v-if="url" :src="url" :alt="fileName" draggable="false" />
				<canvas
					ref="inkCanvas"
					v-show="mode === 'ink'"
					aria-label="图片手写标注区域"
					@pointerdown="inkDown"
					@pointermove="inkMove"
					@pointerup="inkEnd"
					@pointercancel="inkEnd"
				/>
			</div>
		</div>
		<div class="mobile-image__navigation">
			<button @click="zoom = Math.max(25, zoom - 25)">缩小</button
			><button @click="zoom = 100">适应宽度</button
			><button @click="zoom = Math.min(800, zoom + 25)">放大</button>
		</div>
		<div v-if="mode === 'ink'" class="mobile-image__navigation">
			<button @click="mode = 'view'">取消标注</button
			><button :disabled="busy" @click="applyInk">应用标注</button>
		</div>
		<dialog
			ref="toolsDialog"
			@cancel.prevent="tools = false"
			class="mobile-tools"
			aria-label="图片工具"
			@keydown.esc="tools = false"
		>
			<header>
				<strong>图片工具</strong
				><button aria-label="关闭图片工具" @click="tools = false">关闭</button>
			</header>
			<button :disabled="readonly || busy" @click="rotate">向右旋转 90°</button>
			<fieldset :disabled="readonly || busy">
				<legend>裁剪区域（百分比）</legend>
				<label
					v-for="(label, key) in { x: '左', y: '上', width: '宽', height: '高' }"
					:key="key"
					>{{ label
					}}<input
						v-model.number="crop[key]"
						type="number"
						min="0"
						max="100"
						inputmode="decimal"
				/></label>
				<button @click="applyCrop">应用裁剪</button>
			</fieldset>
			<fieldset :disabled="readonly || busy">
				<legend>缩小与标注</legend>
				<label
					>JPEG / WebP 导出质量<input
						v-model.number="quality"
						type="range"
						min="10"
						max="100"
				/></label>
				<label
					>最长边（像素）<input
						v-model.number="maxSide"
						type="number"
						min="1"
						max="8192"
						inputmode="numeric" /></label
				><button @click="resize">缩小图片</button>
				<label>标注颜色<input v-model="color" type="color" /></label
				><label
					>笔宽<input v-model.number="penWidth" type="range" min="1" max="20"
				/></label>
				<button @click="startInk">手写标注</button
				><label>标注文字<input v-model="caption" /></label>
				<label
					>文字横向位置<input
						v-model.number="position.x"
						type="range"
						min="0"
						max="90" /></label
				><label
					>文字纵向位置<input v-model.number="position.y" type="range" min="5" max="95"
				/></label>
				<button @click="text">添加文字</button>
			</fieldset>
			<p role="status">
				{{ busy ? "正在处理图片…" : "图片改动支持撤销；完成后保存或分享。" }}
			</p>
		</dialog>
	</section>
</template>
<style scoped>
.mobile-image {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	background: var(--android-surface);
	color: var(--android-text);
}
.mobile-image__viewport {
	flex: 1;
	min-height: 0;
	overflow: auto;
	padding: 12px;
}
.mobile-image__picture {
	position: relative;
	margin: auto;
	min-width: 25%;
}
.mobile-image__picture img {
	display: block;
	width: 100%;
	height: auto;
}
.mobile-image__picture canvas {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	touch-action: none;
}
.mobile-image__navigation {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	flex-wrap: wrap;
	padding: 8px;
}
button {
	min-height: 48px;
	padding: 8px 12px;
	border: 1px solid var(--android-outline);
	border-radius: 8px;
	background: var(--android-surface);
	color: inherit;
	font: inherit;
}
button:disabled {
	opacity: 0.45;
}
.mobile-image__navigation span {
	flex: 1;
	text-align: center;
	font-size: 13px;
}
</style>
