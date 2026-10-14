<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from "vue";
import { PdfViewer, type PdfViewerApi } from "@yaochn/als-office-pdf/vue";
import type { PdfDocument, PdfSelection } from "@yaochn/als-office-pdf";
import { editPdfDocument } from "@yaochn/als-office-pdf/processing";
import { mobilePdfFonts } from "./font-resolver";
import { changePdfPages, addPdfSignature, type PdfPageOperation } from "./pdf-operations";
const props = defineProps<{ source: Blob; fileName: string; readonly?: boolean }>();
const viewer = ref<PdfViewerApi>(),
	root = ref<HTMLElement>(),
	tools = ref(false),
	signature = ref<HTMLCanvasElement>();
const toolsDialog = ref<HTMLDialogElement>();
let toolsFocus: HTMLElement | null = null;
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
function selected(next: PdfSelection | null) {
	if (!tools.value || next) selection.value = next;
}
const page = ref(1),
	pageCount = ref(0),
	targetPage = ref(1),
	busy = ref(false),
	error = ref("");
const text = ref(""),
	color = ref("#205c4e"),
	selection = ref<PdfSelection | null>(null);
const box = ref({ x: 0.55, y: 0.8, width: 0.35, height: 0.08 });
const revision = ref(0),
	ink = ref(false);
const past: Uint8Array[] = [],
	future: Uint8Array[] = [],
	listeners = new Set<() => void>();
let lastBytes: Uint8Array | undefined,
	lastViewerRevision = 0,
	ownChange = false,
	captureSequence = 0,
	drawing: number | null = null;
function notify() {
	listeners.forEach((fn) => fn());
}
async function loaded(document: PdfDocument) {
	pageCount.value = document.pageCount;
	if (!lastBytes && viewer.value) lastBytes = await viewer.value.exportPdf();
}
async function recordInline() {
	const api = viewer.value;
	if (!api || ownChange || !api.getDocument()) return;
	const token = ++captureSequence,
		state = api.getState();
	if (state.revision === lastViewerRevision) return;
	const bytes = await api.exportPdf();
	if (token !== captureSequence || ownChange || api.getState().revision !== state.revision)
		return;
	if (lastBytes) {
		past.push(lastBytes);
		while (
			past.length > 1 &&
			(past.length > 20 ||
				past.reduce((size, bytes) => size + bytes.byteLength, 0) > 32 * 1024 * 1024)
		)
			past.shift();
	}
	future.length = 0;
	lastBytes = bytes;
	lastViewerRevision = state.revision;
	revision.value++;
	notify();
}
watch(
	() => viewer.value?.getState().revision,
	() => {
		void recordInline().catch((cause) => (error.value = (cause as Error).message));
	},
);
watch(
	() => props.readonly,
	(value) => {
		if (value) tools.value = false;
	},
);
onBeforeUnmount(() => {
	captureSequence++;
	toolsDialog.value?.close();
});
async function update(transform: (bytes: Uint8Array) => Promise<Uint8Array>, history = true) {
	const api = viewer.value;
	if (!api || props.readonly || busy.value) return;
	busy.value = true;
	error.value = "";
	try {
		await recordInline();
		const baseRevision = api.getState().revision;
		const before = await api.exportPdf();
		const after = await transform(before.slice());
		if (props.readonly) throw new Error("已退出编辑，请重新进入编辑后重试。");
		ownChange = true;
		captureSequence++;
		await api.applyPdfBytes(after, { baseRevision });
		if (history) {
			past.push(before);
			while (
				past.length > 1 &&
				(past.length > 20 ||
					past.reduce((size, bytes) => size + bytes.byteLength, 0) > 32 * 1024 * 1024)
			)
				past.shift();
			future.length = 0;
		}
		lastBytes = after;
		lastViewerRevision = api.getState().revision;
		revision.value++;
		notify();
		return true;
	} catch (cause) {
		error.value = (cause as Error).message;
		throw cause;
	} finally {
		ownChange = false;
		busy.value = false;
	}
}
async function pageOperation(type: PdfPageOperation["type"]) {
	try {
		await update((bytes) =>
			changePdfPages(bytes, { type, page: page.value, target: targetPage.value }),
		);
	} catch {
		/* Error remains beside the operation. */
	}
}
async function annotation(type: "Highlight" | "Text" | "FreeText") {
	const at = selection.value;
	if (type === "Highlight" && !at?.bbox) {
		error.value = "请先选中页面上的文字，再添加高亮。";
		return;
	}
	if (type !== "Highlight" && !text.value.trim()) {
		error.value = "请输入批注或填写文字。";
		return;
	}
	try {
		await update(
			async (bytes) =>
				new Uint8Array(
					await (
						await editPdfDocument(
							bytes,
							{
								annotations: [
									{
										operation: "add",
										pageNumber: at?.pageNumber ?? page.value,
										type,
										contents: text.value,
										color: color.value,
										rect: type === "Highlight" ? at!.bbox! : box.value,
									},
								],
							},
							{
								fontBytes: viewer.value?.getFormFontBytes(),
								fontResolver: mobilePdfFonts,
							},
						)
					).arrayBuffer(),
				),
		);
		text.value = "";
	} catch {
		/* Error remains visible. */
	}
}
function signatureDown(event: PointerEvent) {
	if (drawing !== null || props.readonly) return;
	drawing = event.pointerId;
	const canvas = signature.value!,
		rect = canvas.getBoundingClientRect(),
		context = canvas.getContext("2d")!;
	canvas.setPointerCapture(event.pointerId);
	context.strokeStyle = "#18221d";
	context.lineWidth = 3;
	context.lineCap = "round";
	context.lineJoin = "round";
	const x = ((event.clientX - rect.left) / rect.width) * canvas.width,
		y = ((event.clientY - rect.top) / rect.height) * canvas.height;
	context.beginPath();
	context.moveTo(x, y);
	context.lineTo(x + 0.01, y);
	context.stroke();
	ink.value = true;
}
function signatureMove(event: PointerEvent) {
	if (drawing !== event.pointerId) return;
	const canvas = signature.value!,
		rect = canvas.getBoundingClientRect(),
		context = canvas.getContext("2d")!;
	context.lineTo(
		((event.clientX - rect.left) / rect.width) * canvas.width,
		((event.clientY - rect.top) / rect.height) * canvas.height,
	);
	context.stroke();
}
async function sign() {
	if (!signature.value || !ink.value) {
		error.value = "请先在签名区域手写签名。";
		return;
	}
	const png = await new Promise<Blob>((resolve, reject) =>
		signature.value!.toBlob((blob) =>
			blob ? resolve(blob) : reject(new Error("签名生成失败。")),
		),
	);
	const bytes = new Uint8Array(await png.arrayBuffer()),
		destination = { ...box.value },
		destinationPage = page.value;
	try {
		await update((source) => addPdfSignature(source, bytes, destinationPage, destination));
	} catch {
		/* Keep signature and input for retry. */
	}
}
async function undo() {
	if (props.readonly || busy.value) return;
	await recordInline();
	if (!past.length) return;
	const before = await viewer.value!.exportPdf(),
		previous = past[past.length - 1];
	if (!(await update(async () => previous, false))) return;
	past.pop();
	future.push(before);
}
async function redo() {
	if (props.readonly || busy.value || !future.length) return;
	const before = await viewer.value!.exportPdf(),
		next = future[future.length - 1];
	if (!(await update(async () => next, false))) return;
	future.pop();
	past.push(before);
}
defineExpose({
	getDocument: () => viewer.value?.getDocument(),
	getLoadError: () => error.value,
	isBusy: () => busy.value,
	getRevision: () => revision.value,
	isDirty: () => revision.value > 0 || Boolean(viewer.value?.getState().dirty),
	subscribe: (fn: () => void) => {
		listeners.add(fn);
		return () => listeners.delete(fn);
	},
	exportFile: async () => {
		if (!viewer.value) throw new Error("PDF 尚未加载。");
		return new Blob([(await viewer.value.exportPdf()) as BlobPart], {
			type: "application/pdf",
		});
	},
	openTools: () => {
		const selected = viewer.value?.getSelection();
		if (selected) selection.value = selected;
		tools.value = true;
	},
	handleBack: () => {
		if (tools.value) {
			tools.value = false;
			return true;
		}
		return false;
	},
	undo,
	redo,
});
</script>
<template>
	<section ref="root" class="mobile-pdf" aria-label="PDF 查看与编辑">
		<PdfViewer
			ref="viewer"
			:source="source"
			:file-name="fileName"
			:editable="!readonly"
			:chrome="true"
			:comments="false"
			:ai="true"
			:font-resolver="mobilePdfFonts"
			@loaded="loaded"
			@selection-change="selected"
			@update:page="page = $event"
			@error="error = $event.message"
		/>
		<dialog
			ref="toolsDialog"
			@cancel.prevent="tools = false"
			class="mobile-tools"
			aria-label="PDF 工具"
			@keydown.esc="tools = false"
		>
			<header>
				<strong>PDF 工具</strong
				><button aria-label="关闭 PDF 工具" @click="tools = false">关闭</button>
			</header>
			<p v-if="error" role="alert">{{ error }}</p>
			<fieldset :disabled="readonly || busy">
				<legend>填写与批注</legend>
				<p>可直接填写页面中的表单。选中文字后，可在这里添加高亮。</p>
				<label>文字或批注<input v-model="text" /></label
				><label>颜色<input v-model="color" type="color" /></label>
				<button @click="annotation('Highlight')">高亮选中文字</button
				><button @click="annotation('Text')">添加批注</button
				><button @click="annotation('FreeText')">填写文字</button>
			</fieldset>
			<fieldset :disabled="readonly || busy">
				<legend>手写签名</legend>
				<canvas
					ref="signature"
					width="600"
					height="180"
					aria-label="手写签名区域"
					@pointerdown="signatureDown"
					@pointermove="signatureMove"
					@pointerup="drawing = null"
					@pointercancel="drawing = null"
				/>
				<button
					@click="
						signature?.getContext('2d')?.clearRect(0, 0, 600, 180);
						ink = false;
					"
				>
					清除签名</button
				><button @click="sign">放入当前页</button>
			</fieldset>
			<fieldset :disabled="readonly || busy">
				<legend>文字与签名位置</legend>
				<label
					v-for="(label, key) in {
						x: '左侧位置',
						y: '顶部位置',
						width: '宽度',
						height: '高度',
					}"
					:key="key"
					>{{ label
					}}<input
						v-model.number="box[key]"
						type="range"
						:min="key === 'width' || key === 'height' ? 0.01 : 0"
						max="1"
						step=".01"
				/></label>
			</fieldset>
			<fieldset :disabled="readonly || busy">
				<legend>页面整理</legend>
				<label
					>当前页<input
						v-model.number="page"
						type="number"
						min="1"
						:max="pageCount"
						inputmode="numeric"
						@change="viewer?.setPage(page)"
				/></label>
				<button @click="pageOperation('rotate')">旋转当前页</button>
				<label
					>移到第几页<input
						v-model.number="targetPage"
						type="number"
						min="1"
						:max="pageCount"
						inputmode="numeric" /></label
				><button @click="pageOperation('move')">移动当前页</button>
				<button :disabled="pageCount < 2" @click="pageOperation('delete')">
					删除当前页（可撤销）
				</button>
			</fieldset>
			<p role="status">
				{{ busy ? "正在处理 PDF…" : "改动支持撤销，保存或分享后可在其他应用中查看。" }}
			</p>
		</dialog>
	</section>
</template>
<style scoped>
.mobile-pdf {
	position: relative;
	height: 100%;
	min-height: 0;
}
.mobile-pdf :deep(.als-ofs-pdf-viewer) {
	height: 100%;
}
canvas {
	display: block;
	width: 100%;
	height: 120px;
	background: #fff;
	border: 1px solid var(--android-outline);
	border-radius: 8px;
	touch-action: none;
}
</style>
