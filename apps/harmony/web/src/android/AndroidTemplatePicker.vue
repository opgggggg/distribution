<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { isOffline } from "../harmony-host";
import {
	fetchDocumentTemplates,
	downloadDocumentTemplate,
	loadTemplatePreview,
	type DocumentTemplate,
	type DocumentTemplateSource,
} from "../../../../../als-office/apps/desktop/src/document-templates";
import Icon from "./AndroidIcon.vue";

const props = defineProps<{ source: DocumentTemplateSource }>();
const emit = defineEmits<{ close: []; choose: [file: { name: string; blob: Blob } | null] }>();
const dialog = ref<HTMLDialogElement>();
const templates = ref<DocumentTemplate[]>([]);
const previews = ref<Record<string, string>>({});
const loading = ref(false);
const downloading = ref(false);
const error = ref("");
let controller = new AbortController();
let previousFocus: HTMLElement | null = null;
function releasePreviews() {
	Object.values(previews.value).forEach(URL.revokeObjectURL);
	previews.value = {};
}
async function load() {
	controller.abort();
	controller = new AbortController();
	const { signal } = controller;
	releasePreviews();
	error.value = "";
	loading.value = true;
	try {
		const found = await fetchDocumentTemplates(props.source, {
			format: "pptx",
			locale: "zh-CN",
			signal,
		});
		if (signal.aborted) return;
		templates.value = found;
		loading.value = false;
		await Promise.all(
			found.map(async (template) => {
				if (!template.previewUrl) return;
				try {
					const url = await loadTemplatePreview(template.previewUrl, signal);
					if (signal.aborted) URL.revokeObjectURL(url);
					else previews.value[template.id] = url;
				} catch {
					/* A missing preview does not block creating a presentation. */
				}
			}),
		);
	} catch {
		// A request that fails because the connection dropped is the offline case
		// again; only a reachable server that misbehaves is worth reporting.
		if (signal.aborted) return;
		templates.value = [];
		if (!isOffline()) error.value = "模板加载失败，请检查网络后重试，也可以新建空白演示文稿。";
	} finally {
		if (!signal.aborted) loading.value = false;
	}
}
async function choose(template: DocumentTemplate) {
	if (downloading.value) return;
	downloading.value = true;
	error.value = "";
	const { signal } = controller;
	try {
		const bytes = await downloadDocumentTemplate(template, signal);
		if (!signal.aborted)
			emit("choose", {
				name: `${template.name}.pptx`,
				blob: new Blob([bytes.slice().buffer as ArrayBuffer]),
			});
	} catch {
		if (!signal.aborted) error.value = "模板下载失败，请重新选择模板重试。";
	} finally {
		if (!signal.aborted) downloading.value = false;
	}
}
// Coming back online while the sheet is open fills the gallery in; losing the
// connection takes the stale error away rather than leaving it on screen.
function handleOnline() {
	if (!templates.value.length && !downloading.value) void load();
}
function handleOffline() {
	error.value = "";
}
onMounted(() => {
	previousFocus = document.activeElement as HTMLElement;
	dialog.value?.showModal();
	window.addEventListener("online", handleOnline);
	window.addEventListener("offline", handleOffline);
	void load();
});
onBeforeUnmount(() => {
	controller.abort();
	releasePreviews();
	window.removeEventListener("online", handleOnline);
	window.removeEventListener("offline", handleOffline);
	dialog.value?.close();
	previousFocus?.focus({ preventScroll: true });
});
</script>

<template>
	<dialog
		ref="dialog"
		class="android-sheet android-template-sheet"
		aria-labelledby="android-template-title"
		@cancel.prevent="emit('close')"
		@click.self="emit('close')"
	>
		<div class="android-sheet-content">
			<header>
				<h2 id="android-template-title">选择演示模板</h2>
				<button
					class="android-icon-button"
					aria-label="关闭模板选择"
					@click="emit('close')"
				>
					<Icon name="close" />
				</button>
			</header>
			<div v-if="error" class="android-template-error" role="alert">
				<span>{{ error }}</span>
				<button aria-label="关闭错误提示" @click="error = ''"><Icon name="close" /></button>
				<button :disabled="downloading" @click="load">重新加载</button>
			</div>
			<p v-if="loading || downloading" role="status" class="android-sheet-description">
				{{ downloading ? "正在下载模板…" : "正在加载模板…" }}
			</p>
			<div class="android-template-grid">
				<button
					class="android-template-card"
					:disabled="downloading"
					@click="emit('choose', null)"
				>
					<span class="android-template-preview"><Icon name="plus" /></span
					><strong>空白演示文稿</strong>
				</button>
				<template v-if="loading">
					<div
						v-for="placeholder in 2"
						:key="`template-placeholder-${placeholder}`"
						class="android-template-card android-template-skeleton"
						aria-hidden="true"
					>
						<span class="android-template-preview"></span>
						<strong></strong>
						<small></small>
					</div>
				</template>
				<button
					v-for="template in templates"
					:key="template.id"
					class="android-template-card"
					:disabled="downloading"
					@click="choose(template)"
				>
					<span class="android-template-preview"
						><img
							v-if="previews[template.id]"
							:src="previews[template.id]"
							alt="" /><Icon v-else name="file"
					/></span>
					<strong>{{ template.name }}</strong
					><small>{{ template.description }}</small>
				</button>
			</div>
		</div>
	</dialog>
</template>

<style scoped>
.android-template-sheet {
	--android-primary: #08705f;
	--android-card: #fff;
	--android-surface: #f6f8f7;
	--android-container: #eef4f1;
	--android-text: #202624;
	--android-secondary: #68716d;
	--android-outline: #dce6e1;
	box-sizing: border-box;
	overflow-y: auto;
}
.android-template-card {
	cursor: pointer;
}
.android-template-card:hover:not(:disabled) {
	border-color: var(--android-primary);
	background: #f0f8f4;
}
.android-template-card:focus-visible {
	outline: 2px solid var(--android-primary);
	outline-offset: 2px;
}
.android-template-card:disabled {
	cursor: wait;
	opacity: 0.65;
}
@media (min-width: 768px) {
	.android-template-sheet {
		inset: 0;
		margin: auto;
		width: min(880px, calc(100vw - 64px));
		max-width: 880px;
		max-height: calc(100dvh - 64px);
		border-radius: 20px;
		box-shadow: 0 20px 80px rgb(11 31 27 / 28%);
	}
	.android-template-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
	}
	.android-sheet-content {
		padding: 0 24px 24px;
	}
	.android-sheet header {
		margin: 0 -24px 20px;
	}
}
</style>
