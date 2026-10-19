<script setup lang="ts">
import {
	computed,
	defineAsyncComponent,
	nextTick,
	onBeforeUnmount,
	onMounted,
	ref,
	watch,
} from "vue";
import type { EditorArtifactFormat } from "@yaochn/als-office-editor-ui/vue";
import { APP_PROFILE } from "../app-profile.generated";
import appMark from "../../../AppScope/resources/base/media/app_icon.png";
import { UiCheckbox } from "@yaochn/als-office-editor-ui/vue";
import type { FileSource } from "../file-delivery";
import { OPEN_ACCEPT } from "../open-formats";
import { unframeNotesPreview } from "@cubexp/notes/thumbnail";
import Icon from "./AndroidIcon.vue";
import DocumentTopbar from "../DocumentTopbar.vue";
const AndroidServices = defineAsyncComponent(() => import("./AndroidServices.vue"));
interface DocumentItem {
	preview?: string;
	id: string;
	fileName: string;
	format: EditorArtifactFormat;
	autosaveStatus?: string;
	savedAt?: number;
	autosavedAt?: number;
	sizeBytes?: number;
	sourceRef?: FileSource;
	originalName?: string;
	originalBlob?: Blob;
	source?: Blob;
	blob?: Blob;
	favorite?: boolean;
	isDraft?: boolean;
}
const props = defineProps<{
	documents: DocumentItem[];
	history: DocumentItem[];
	active: DocumentItem | null;
	editing: boolean;
	opening: boolean;
	openingLabel: string;
	saving: boolean;
	ready: boolean;
	status: string;
	editable: boolean;
	reduceMotion: boolean;
	immersive: boolean;
	exportOptions: { format: string; label: string }[];
}>();
const emit = defineEmits<{
	/** The system picker is opening; the host may start loading format engines. */
	pick: [];
	open: [event: Event];
	select: [id: string];
	restore: [id: string];
	create: [format: EditorArtifactFormat];
	back: [];
	edit: [];
	finish: [];
	save: [];
	deliver: [
		request: {
			intent: "save" | "export" | "share" | "print";
			format?: string;
			original?: boolean;
		},
	];
	favorite: [id: string];
	batch: [ids: string[], action: "share" | "export" | "remove"];
	rename: [id: string];
	delete: [id: string];
	editDocument: [id: string];
	close: [];
	undo: [];
	redo: [];
	notePages: [anchor: HTMLElement];
	noteView: [];
	search: [];
	format: [];
	ribbon: [tab: "data" | "view"];
	error: [message: string];
	insert: [];
	keyboard: [];
	newSlide: [];
	present: [];
	text: [command: string];
	motion: [value: boolean];
}>();
const servicesPanel = ref<InstanceType<typeof AndroidServices>>();
const destination = ref("files");
const servicesVisited = ref(false);
const libraryScroll = ref<HTMLElement>();
const destinationScroll = new Map<string, number>();
watch(destination, async (value, previous) => {
	if (value === "settings") servicesVisited.value = true;
	destinationScroll.set(previous, libraryScroll.value?.scrollTop ?? 0);
	const focused = document.activeElement;
	if (focused instanceof HTMLElement && libraryScroll.value?.contains(focused)) focused.blur();
	await nextTick();
	if (libraryScroll.value) libraryScroll.value.scrollTop = destinationScroll.get(value) ?? 0;
});
const query = ref("");
const filter = ref("all");
const sheet = ref<"" | "new" | "more" | "format" | "documents" | "delivery" | "filters" | "file">(
	"",
);
const dialog = ref<HTMLDialogElement>();
const picker = ref<HTMLInputElement>();
const libraryKind = ref("all");
const sort = ref("recent");
const selecting = ref(false);
const selected = ref<string[]>([]);
const outputFormat = ref("");
const formats = [
	{ id: "notes", label: "手写笔记", detail: "手写、绘图与分页笔记本", mark: "N" },
	{ id: "docx", label: "文字文档", detail: "写作、报告与信函", mark: "W" },
	{ id: "xlsx", label: "电子表格", detail: "数据、清单与预算", mark: "X" },
	{ id: "pptx", label: "演示文稿", detail: "想法与分享", mark: "P" },
	{ id: "markdown", label: "Markdown", detail: "轻量笔记与写作", mark: "M" },
	{ id: "text", label: "纯文本", detail: "文字、日志与源代码", mark: "T" },
	{ id: "vsdx", label: "流程图", detail: "流程与结构", mark: "V" },
] as const;
const allDocuments = computed(() => [...props.documents, ...props.history]);
const fileTypes = [
	{ id: "all", label: "全部类型" },
	...formats,
	{ id: "pdf", label: "PDF" },
	{ id: "image", label: "图片" },
	{ id: "jmp", label: "JMP" },
	{ id: "ofd", label: "OFD" },
	{ id: "epub", label: "EPUB" },
];
const fileMenuId = ref("");
const fileMenuItem = computed(() =>
	allDocuments.value.find((item) => item.id === fileMenuId.value),
);
const libraryTitle = computed(() =>
	query.value
		? "搜索结果"
		: ((
				{
					all: "最近打开",
					files: "已保存的文件",
					drafts: "本机草稿",
					favorites: "我的收藏",
				} as Record<string, string>
			)[libraryKind.value] ?? "最近打开"),
);
const filterLabel = computed(
	() => fileTypes.find((item) => item.id === filter.value)?.label ?? "全部类型",
);
const isFiltered = computed(() => !!query.value || filter.value !== "all");
const emptyTitle = computed(() =>
	isFiltered.value
		? "没有找到文件"
		: ((
				{
					all: "文件都在这里",
					files: "还没有已保存的文件",
					drafts: "还没有草稿",
					favorites: "还没有收藏",
				} as Record<string, string>
			)[libraryKind.value] ?? "文件都在这里"),
);
const emptyDescription = computed(() =>
	isFiltered.value
		? "试试其他名称或文件类型。"
		: ((
				{
					all: "打开设备中的文件，或新建一份文档。",
					files: "保存到原文件后，可在这里找到它。",
					drafts: "编辑中的内容会自动保存在本机。",
					favorites: "在文件操作中收藏，方便下次找到。",
				} as Record<string, string>
			)[libraryKind.value] ?? ""),
);
function sizeOf(item: DocumentItem) {
	return item.sizeBytes ?? item.blob?.size ?? item.source?.size ?? item.originalBlob?.size ?? 0;
}
function sizeLabel(item: DocumentItem) {
	const bytes = sizeOf(item);
	return bytes >= 1024 * 1024
		? `${(bytes / 1024 / 1024).toFixed(1)} MB`
		: `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function locationLabel(item: DocumentItem) {
	return item.isDraft || !item.originalBlob
		? "本机草稿"
		: item.sourceRef
			? (item.sourceRef.location ?? "关联原文件")
			: "已导入文件";
}
function toggleSelection(id: string) {
	selected.value = selected.value.includes(id)
		? selected.value.filter((value) => value !== id)
		: [...selected.value, id];
}
async function pickFile() {
	emit("pick");
	try {
		if (!(await window.auroraHarmonyHost?.openDocumentPicker?.())) picker.value?.click();
	} catch (cause) {
		emit("error", (cause as Error).message || "文件选择失败，请重试。");
	}
}
const visibleDocuments = computed(() =>
	allDocuments.value
		.filter(
			(item) =>
				(filter.value === "all" || item.format === filter.value) &&
				item.fileName
					.toLocaleLowerCase()
					.includes(query.value.trim().toLocaleLowerCase()) &&
				(libraryKind.value === "all" ||
					(libraryKind.value === "favorites" && item.favorite) ||
					(libraryKind.value === "drafts" && (item.isDraft || !item.originalBlob)) ||
					(libraryKind.value === "files" && !item.isDraft && !!item.originalBlob)),
		)
		.sort((a, b) =>
			sort.value === "name"
				? a.fileName.localeCompare(b.fileName, "zh-CN")
				: sort.value === "size"
					? sizeOf(b) - sizeOf(a)
					: (b.savedAt ?? b.autosavedAt ?? 0) - (a.savedAt ?? a.autosavedAt ?? 0),
		),
);
function deliver(intent: "save" | "export" | "share" | "print", original = false) {
	sheet.value = "";
	emit("deliver", {
		intent,
		original,
		format: original || intent === "save" ? undefined : outputFormat.value || undefined,
	});
}
const sheetTitle = computed(
	() =>
		({
			"": "",
			new: "新建",
			more: "文档操作",
			format: "文字格式",
			documents: "切换文档",
			delivery: "保存、转换与分享",
			filters: "筛选与排序",
			file: fileMenuItem.value?.fileName ?? "文件操作",
		})[sheet.value] || "",
);
const menuPosition = ref({
	left: "12px",
	top: "80px",
	width: "280px",
	maxHeight: "calc(100dvh - 24px)",
});
let pressTimer: ReturnType<typeof setTimeout> | undefined;
let pressOrigin: { x: number; y: number } | undefined;
let suppressClickUntil = 0;
function cancelPress() {
	clearTimeout(pressTimer);
	pressTimer = undefined;
	pressOrigin = undefined;
}
function fileMenu(item: DocumentItem, anchor: HTMLElement) {
	cancelPress();
	if (props.opening || props.saving) return;
	fileMenuId.value = item.id;
	const bounds = anchor.getBoundingClientRect();
	const viewport = window.visualViewport;
	const left = viewport?.offsetLeft ?? 0,
		top = viewport?.offsetTop ?? 0;
	const width = viewport?.width ?? window.innerWidth,
		height = viewport?.height ?? window.innerHeight;
	const menuWidth = Math.min(280, width - 24);
	menuPosition.value = {
		left: `${Math.max(left + 12, Math.min(left + width - menuWidth - 12, bounds.left + bounds.width / 2 - menuWidth / 2))}px`,
		top: `${Math.max(top + 12, Math.min(top + height - 304, bounds.top + 48))}px`,
		width: `${menuWidth}px`,
		maxHeight: `${height - 24}px`,
	};
	sheet.value = "file";
}
function beginPress(event: PointerEvent, item: DocumentItem) {
	cancelPress();
	if (event.button !== 0 || selecting.value || props.opening || props.saving) return;
	pressOrigin = { x: event.clientX, y: event.clientY };
	const anchor = event.currentTarget as HTMLElement;
	pressTimer = setTimeout(() => {
		suppressClickUntil = Date.now() + 1000;
		anchor.focus({ preventScroll: true });
		fileMenu(item, anchor);
	}, 500);
}
function movePress(event: PointerEvent) {
	if (
		pressOrigin &&
		Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y) > 10
	)
		cancelPress();
}
function tapFile(item: DocumentItem) {
	if (Date.now() < suppressClickUntil) {
		suppressClickUntil = 0;
		return;
	}
	if (selecting.value) toggleSelection(item.id);
	else select(item);
}
function menuAction(action: "open" | "edit" | "rename" | "delete") {
	const item = fileMenuItem.value;
	sheet.value = "";
	if (!item) return;
	if (action === "open") select(item);
	else if (action === "edit") emit("editDocument", item.id);
	else if (action === "rename") emit("rename", item.id);
	else emit("delete", item.id);
}
let previousFocus: HTMLElement | null = null;
watch(sheet, async (value) => {
	if (value) {
		previousFocus = document.activeElement as HTMLElement;
		await nextTick();
		if (!dialog.value?.open) dialog.value?.showModal();
		if (value === "file" && dialog.value) {
			await nextTick();
			const viewport = window.visualViewport;
			const top = viewport?.offsetTop ?? 0,
				height = viewport?.height ?? window.innerHeight;
			menuPosition.value.top = `${Math.max(top + 12, Math.min(Number.parseFloat(menuPosition.value.top), top + height - dialog.value.getBoundingClientRect().height - 12))}px`;
		}
	} else {
		suppressClickUntil = 0;
		dialog.value?.close();
		previousFocus?.focus({ preventScroll: true });
	}
});
watch(
	() => props.active?.id,
	(id, previous) => {
		sheet.value = "";
		if (!id && previous) {
			query.value = "";
			filter.value = "all";
			selecting.value = false;
			selected.value = [];
			destination.value = "files";
		}
	},
);
function viewportChanged() {
	cancelPress();
	if (sheet.value === "file") sheet.value = "";
}
onMounted(() => {
	document.documentElement.classList.add("als-ofs-mobile-ui");
	window.addEventListener("resize", viewportChanged);
	window.addEventListener("blur", cancelPress);
});
onBeforeUnmount(() => {
	window.removeEventListener("resize", viewportChanged);
	window.removeEventListener("blur", cancelPress);
	cancelPress();
	dialog.value?.close();
	document.documentElement.classList.remove("als-ofs-mobile-ui");
});
function handleBack(): boolean {
	const openMenu = document.querySelector<HTMLElement>(
		'.als-ofs-ui-dropdown__menu[data-state="open"]',
	);
	if (openMenu) {
		openMenu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		return true;
	}
	if (!props.active && destination.value === "settings" && servicesPanel.value?.handleBack())
		return true;
	if (sheet.value) {
		sheet.value = "";
		return true;
	}
	if (selecting.value) {
		selecting.value = false;
		selected.value = [];
		return true;
	}
	if (!props.active && (query.value || filter.value !== "all")) {
		query.value = "";
		filter.value = "all";
		return true;
	}
	if (!props.active && destination.value !== "files") {
		destination.value = "files";
		return true;
	}
	return false;
}
defineExpose({ handleBack });
function select(item: DocumentItem) {
	sheet.value = "";
	props.documents.some((doc) => doc.id === item.id)
		? emit("select", item.id)
		: emit("restore", item.id);
}
function action(name: "save" | "search" | "close" | "present" | "format") {
	sheet.value = "";
	switch (name) {
		case "save":
			emit("save");
			break;
		case "search":
			emit("search");
			break;
		case "close":
			emit("close");
			break;
		case "present":
			emit("present");
			break;
		case "format":
			emit("format");
			break;
	}
}
function text(command: string) {
	sheet.value = "";
	emit("text", command);
}
function dateLabel(item: DocumentItem) {
	if (props.documents.some((doc) => doc.id === item.id)) return "已打开";
	return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(
		item.savedAt ?? item.autosavedAt,
	);
}
function previewLabel(item: DocumentItem): string {
	return item.format === "markdown" ? "MD" : item.format.toUpperCase();
}
const notePreviews = ref<Record<string, { source: string; image: string }>>({});
function previewSource(item: DocumentItem) {
	const cached = notePreviews.value[item.id];
	return cached?.source === item.preview ? cached.image : item.preview;
}
function previewLoaded(event: Event, item: DocumentItem) {
	if (
		item.format !== "notes" ||
		!item.preview ||
		notePreviews.value[item.id]?.source === item.preview
	)
		return;
	const image = unframeNotesPreview(event.target as HTMLImageElement);
	notePreviews.value[item.id] = { source: item.preview, image: image ?? item.preview };
}
</script>

<template>
	<DocumentTopbar
		v-if="active"
		v-show="!immersive"
		class="android-topbar"
		:file-name="active.fileName"
		:status="status"
		:status-state="active.autosaveStatus"
		:editing="editing"
		:editable="editable"
		:ready="ready"
		:saving="saving"
		:menu-open="sheet === 'more'"
		@back="emit('back')"
		@documents="sheet = 'documents'"
		@edit="emit('edit')"
		@finish="emit('finish')"
		@more="sheet = 'more'"
	>
		<button
			v-if="active.format === 'notes'"
			type="button"
			class="android-notes-pages"
			aria-label="页面"
			:disabled="!ready"
			@click="emit('notePages', $event.currentTarget as HTMLElement)"
		>
			<Icon name="pages" />
		</button>
		<button
			v-if="active.format === 'pptx' && !editing"
			type="button"
			aria-label="播放"
			:disabled="!ready"
			@click="emit('present')"
		>
			<Icon name="play" />
		</button>
	</DocumentTopbar>
	<header v-else v-show="!immersive" class="android-topbar android-topbar-home">
		<img :src="appMark" alt="" width="36" height="36" />
		<strong class="android-brand">{{ APP_PROFILE.name.replace(/\s*文档$/, "") }}</strong>
		<span class="android-local-badge">本机文件</span>
	</header>
	<section v-show="!active" class="android-library" aria-label="文档工作区">
		<div ref="libraryScroll" class="android-library-scroll" @scroll="cancelPress">
			<template v-if="destination !== 'settings'">
				<div class="android-home-heading">
					<h1>我的文件</h1>
					<button
						class="android-create-button"
						:disabled="opening"
						aria-haspopup="dialog"
						@click="sheet = 'new'"
					>
						<Icon name="plus" />新建
					</button>
				</div>
				<label class="android-search"
					><Icon name="search" /><input
						v-model="query"
						type="search"
						aria-label="搜索文档名称"
						placeholder="搜索文档名称" /><button
						v-if="query"
						class="android-icon-button"
						aria-label="清除搜索"
						@click="query = ''"
					>
						<Icon name="close" /></button
				></label>
				<button class="android-open-card" :disabled="opening" @click="pickFile">
					<span class="android-folder-icon"><Icon name="folder" /></span>
					<span><strong>从设备打开</strong><small>设备文件与系统云盘</small></span>
					<Icon name="chevron" />
				</button>
				<div class="android-library-tabs" aria-label="文件与草稿">
					<button
						v-for="item in [
							{ id: 'all', label: '最近' },
							{ id: 'files', label: '文件' },
							{ id: 'drafts', label: '草稿' },
							{ id: 'favorites', label: '收藏' },
						]"
						:key="item.id"
						:aria-pressed="libraryKind === item.id"
						@click="libraryKind = item.id"
					>
						{{ item.label }}
					</button>
				</div>
				<div class="android-list-heading">
					<h2>
						{{ libraryTitle
						}}<span v-if="visibleDocuments.length">{{ visibleDocuments.length }}</span>
					</h2>
					<button
						class="android-filter-button"
						:aria-label="`筛选与排序，${filterLabel}`"
						aria-haspopup="dialog"
						@click="sheet = 'filters'"
					>
						{{ filterLabel }}<Icon name="settings" />
					</button>
					<button
						v-if="visibleDocuments.length || selecting"
						class="android-text-button"
						:aria-pressed="selecting"
						@click="
							selecting = !selecting;
							selected = [];
						"
					>
						{{ selecting ? "完成选择" : "多选" }}
					</button>
				</div>
				<div v-if="selecting" class="android-library-actions">
					<template v-if="selecting">
						<button @click="selected = visibleDocuments.map((item) => item.id)">
							全选
						</button>
						<button
							:disabled="!selected.length || saving"
							@click="emit('batch', selected, 'share')"
						>
							分享 {{ selected.length }} 个
						</button>
						<button
							:disabled="!selected.length || saving"
							@click="emit('batch', selected, 'export')"
						>
							逐个另存
						</button>
						<button
							:disabled="!selected.length || saving"
							@click="emit('batch', selected, 'remove')"
						>
							移除本机记录
						</button>
					</template>
				</div>
				<div v-if="visibleDocuments.length" class="android-file-list">
					<div v-for="item in visibleDocuments" :key="item.id" class="android-file-entry">
						<input
							v-if="selecting"
							type="checkbox"
							:aria-label="`选择 ${item.fileName}`"
							:checked="selected.includes(item.id)"
							@change="toggleSelection(item.id)"
						/>
						<button
							class="android-file-row"
							:disabled="opening || saving"
							aria-haspopup="dialog"
							:aria-expanded="sheet === 'file' && fileMenuItem?.id === item.id"
							:aria-label="`打开 ${item.fileName}`"
							aria-description="轻点打开，长按显示文件操作"
							@click="tapFile(item)"
							@pointerdown="beginPress($event, item)"
							@pointermove="movePress"
							@pointerup="cancelPress"
							@pointercancel="cancelPress"
							@pointerleave="cancelPress"
							@contextmenu.prevent="
								fileMenu(item, $event.currentTarget as HTMLElement)
							"
							@keydown.shift.f10.prevent="
								fileMenu(item, $event.currentTarget as HTMLElement)
							"
						>
							<span
								class="android-file-preview"
								:data-format="item.format"
								aria-hidden="true"
							>
								<img
									v-if="item.preview"
									:src="previewSource(item)"
									@load="previewLoaded($event, item)"
									alt=""
									width="112"
									height="128"
									loading="lazy"
								/>
								<Icon v-else name="file" />
							</span>
							<span class="android-file-copy">
								<strong>{{ item.fileName }}</strong>
								<small
									><span class="android-file-format" :data-format="item.format">{{
										previewLabel(item)
									}}</span>
									· {{ sizeLabel(item) }}</small
								>
								<small>{{ locationLabel(item) }} · {{ dateLabel(item) }}</small>
							</span>
							<Icon v-if="item.favorite" name="star" class="android-file-favorite" />
						</button>
						<button
							v-if="!selecting"
							class="android-icon-button"
							:aria-label="`文件操作 ${item.fileName}`"
							:disabled="opening || saving"
							@click="
								fileMenu(item, ($event.currentTarget as HTMLElement).parentElement!)
							"
						>
							<Icon name="more" />
						</button>
					</div>
				</div>
				<div v-else-if="!opening" class="android-empty">
					<div class="android-empty-art" aria-hidden="true">
						<span></span
						><Icon
							:name="
								isFiltered
									? 'search'
									: libraryKind === 'favorites'
										? 'star'
										: 'file'
							"
						/>
					</div>
					<h2>{{ emptyTitle }}</h2>
					<p>{{ emptyDescription }}</p>
					<button
						v-if="query || filter !== 'all'"
						class="android-text-button"
						@click="
							query = '';
							filter = 'all';
						"
					>
						清除筛选
					</button>
				</div>
				<p v-if="visibleDocuments.length" class="android-storage-note">
					草稿保存在本机。保存原文件、另存或分享后即可交付。
				</p>
			</template>
			<template v-else>
				<div class="android-page-title">
					<h1>设置</h1>
					<p>让工作区更适合你。</p>
				</div>
				<section class="android-settings-card">
					<h2>使用偏好</h2>
					<label class="android-setting"
						><span><strong>减少动态效果</strong><small>简化面板和页面过渡</small></span
						><UiCheckbox
							label=""
							:model-value="reduceMotion"
							@change="emit('motion', $event)"
					/></label>
				</section>
				<section class="android-settings-card">
					<h2>文件与草稿</h2>
					<p>
						编辑时自动保存本机草稿。关联可写原文件时可直接保存，也可以另存副本或分享。文件被其他应用修改时，会提示重新打开。
					</p>
					<p>清除应用数据或卸载应用会移除本地草稿。重要文档请另存到文件。</p>
				</section>
				<section class="android-settings-card android-about">
					<img :src="appMark" alt="" width="48" height="48" />
					<h2>{{ APP_PROFILE.name }}</h2>
					<p>版本 {{ APP_PROFILE.versionName }}</p>
					<p>文档、表格、PDF、图片与笔记，随身查看和修改。</p>
				</section>
			</template>
			<div v-show="destination === 'settings'">
				<!-- Retain form and scroll state after the first visit, but keep settings
				     initialization and its code out of the first workspace paint. -->
				<AndroidServices v-if="servicesVisited" ref="servicesPanel" />
			</div>
		</div>
		<nav class="android-navigation" aria-label="主导航">
			<button
				v-for="item in [
					{ id: 'files', label: '文件', icon: 'folder' },
					{ id: 'settings', label: '设置', icon: 'settings' },
				]"
				:key="item.id"
				:aria-current="destination === item.id ? 'page' : undefined"
				@click="destination = item.id"
			>
				<span><Icon :name="item.icon" /></span>{{ item.label }}
			</button>
		</nav>
	</section>
	<nav
		v-if="active && !immersive && active.format !== 'notes' && editing"
		class="android-editor-tools"
		:aria-label="editing ? '编辑工具' : '阅读工具'"
	>
		<template v-if="editing">
			<button :disabled="!ready" aria-label="撤销" @pointerdown.prevent @click="emit('undo')">
				<Icon name="undo" /><span>撤销</span>
			</button>
			<button
				:aria-label="
					active.format === 'pdf'
						? 'PDF 工具'
						: active.format === 'image'
							? '图片工具'
							: active.format === 'text'
								? '查找替换'
								: active.format === 'xlsx'
									? '单元格'
									: '格式'
				"
				:disabled="!ready"
				@pointerdown.prevent
				@click="active.format === 'markdown' ? (sheet = 'format') : emit('format')"
			>
				<Icon name="format" /><span>{{
					active.format === "pdf"
						? "PDF 工具"
						: active.format === "image"
							? "图片工具"
							: active.format === "text"
								? "查找替换"
								: active.format === "xlsx"
									? "单元格"
									: "格式"
				}}</span>
			</button>
			<button
				v-if="active.format !== 'pdf' && active.format !== 'image'"
				aria-label="插入"
				:disabled="!ready"
				@pointerdown.prevent
				@click="emit('insert')"
			>
				<Icon name="plus" /><span>插入</span>
			</button>
			<button
				aria-label="另存"
				:disabled="!ready || saving"
				@pointerdown.prevent
				@click="emit('save')"
			>
				<Icon name="save" /><span>{{ saving ? "保存中" : "另存" }}</span>
			</button>
			<button
				v-if="active.format === 'pptx'"
				aria-label="新幻灯片"
				:disabled="!ready"
				@pointerdown.prevent
				@click="emit('newSlide')"
			>
				<Icon name="file" /><span>新幻灯片</span>
			</button>
			<button v-else aria-label="收起键盘" @pointerdown.prevent @click="emit('keyboard')">
				<Icon name="keyboard" /><span>收起键盘</span>
			</button>
		</template>
	</nav>
	<input
		ref="picker"
		class="android-file-input"
		type="file"
		:accept="OPEN_ACCEPT"
		:disabled="opening"
		tabindex="-1"
		aria-hidden="true"
		@click="emit('pick')"
		@change="emit('open', $event)"
	/>
	<dialog
		ref="dialog"
		:class="['android-sheet', sheet === 'file' && 'android-file-menu']"
		:style="sheet === 'file' ? menuPosition : undefined"
		aria-labelledby="android-sheet-title"
		@cancel.prevent="sheet = ''"
		@click.self="sheet = ''"
	>
		<div class="android-sheet-content">
			<header>
				<h2 id="android-sheet-title">{{ sheetTitle }}</h2>
				<button class="android-icon-button" aria-label="关闭面板" @click="sheet = ''">
					<Icon name="close" />
				</button>
			</header>
			<template v-if="sheet === 'filters'">
				<h3 class="android-sheet-label">文件类型</h3>
				<div class="android-type-grid" aria-label="文件类型">
					<button
						v-for="item in fileTypes"
						:key="item.id"
						:aria-pressed="filter === item.id"
						@click="filter = item.id"
					>
						{{ item.label }}
					</button>
				</div>
				<h3 class="android-sheet-label">排序方式</h3>
				<div class="android-sort-options" aria-label="文件排序">
					<button
						v-for="item in [
							{ id: 'recent', label: '最近修改' },
							{ id: 'name', label: '名称' },
							{ id: 'size', label: '大小' },
						]"
						:key="item.id"
						:aria-pressed="sort === item.id"
						@click="sort = item.id"
					>
						{{ item.label }}
					</button>
				</div>
				<button class="android-filter-done" @click="sheet = ''">完成</button>
			</template>
			<template v-else-if="sheet === 'file' && fileMenuItem">
				<p class="android-sheet-description">
					{{ locationLabel(fileMenuItem) }} · {{ sizeLabel(fileMenuItem) }}
				</p>
				<button class="android-sheet-row" @click="select(fileMenuItem)">
					<Icon name="file" /><span>打开文件</span><Icon name="chevron" />
				</button>
				<button
					class="android-sheet-row"
					:aria-label="`${fileMenuItem.favorite ? '取消收藏' : '收藏'} ${fileMenuItem.fileName}`"
					:disabled="saving"
					@click="
						emit('favorite', fileMenuItem.id);
						sheet = '';
					"
				>
					<Icon name="star" /><span>{{
						fileMenuItem.favorite ? "取消收藏" : "收藏文件"
					}}</span>
				</button>
				<button
					class="android-sheet-row"
					:disabled="saving"
					@click="
						emit('rename', fileMenuItem.id);
						sheet = '';
					"
				>
					<Icon name="edit" /><span>修改文件名</span>
				</button>
				<button
					v-if="formats.some((f) => f.id === fileMenuItem?.format)"
					class="android-sheet-row"
					@click="menuAction('edit')"
				>
					<Icon name="edit" /><span>编辑</span>
				</button>
				<button class="android-sheet-row is-destructive" @click="menuAction('delete')">
					<Icon name="trash" /><span>删除</span>
				</button>
			</template>
			<template v-else-if="sheet === 'new'"
				><p class="android-sheet-description">选择一种文档，开始创作。</p>
				<button
					v-for="format in formats"
					:key="format.id"
					class="android-sheet-row"
					:disabled="opening"
					@click="
						sheet = '';
						emit('create', format.id);
					"
				>
					<span class="android-format-mark" :data-format="format.id">{{
						format.mark
					}}</span
					><span
						><strong>{{ format.label }}</strong
						><small>{{ format.detail }}</small></span
					><Icon name="plus" /></button
			></template>
			<template v-else-if="sheet === 'delivery'">
				<label class="android-output-format"
					>输出格式<select v-model="outputFormat" aria-label="输出格式">
						<option value="">当前格式</option>
						<option
							v-for="item in exportOptions.filter(
								(item) => item.label !== '当前格式',
							)"
							:key="item.format"
							:value="item.format"
						>
							{{ item.label }}
						</option>
					</select></label
				>
				<button
					class="android-sheet-row"
					:disabled="saving || !ready"
					@click="deliver('export')"
				>
					<Icon name="save" /><span>另存所选格式</span>
				</button>
				<button
					class="android-sheet-row"
					:disabled="saving || !ready"
					@click="deliver('share')"
				>
					<Icon name="share" /><span>分享当前内容</span>
				</button>
				<button
					class="android-sheet-row"
					:disabled="saving || !active?.originalBlob"
					@click="deliver('share', true)"
				>
					<Icon name="file" /><span>分享原文件</span>
				</button>
				<button
					v-if="exportOptions.some((item) => item.format === 'pdf')"
					class="android-sheet-row"
					:disabled="saving || !ready"
					@click="
						outputFormat = 'pdf';
						deliver('print');
					"
				>
					<Icon name="print" /><span>打印 PDF</span>
				</button>
				<p class="android-sheet-description">
					分享当前内容包含修改；分享原文件使用上次从设备打开或写回的文件。
				</p>
			</template>
			<template v-else-if="sheet === 'more'"
				><p class="android-sheet-description">{{ active?.fileName }}</p>
				<button
					class="android-sheet-row"
					:disabled="!active?.sourceRef?.writable || !ready || saving"
					@click="deliver('save')"
				>
					<Icon name="save" /><span
						><strong>保存原文件</strong
						><small>{{
							active?.sourceRef?.writable
								? "写回打开的文件，保留本机草稿"
								: "原文件未关联或不可写，请另存副本"
						}}</small></span
					>
				</button>
				<button
					class="android-sheet-row"
					:disabled="!ready || saving"
					@click="
						outputFormat = '';
						sheet = 'delivery';
					"
				>
					<Icon name="share" /><span>转换、分享与打印</span>
				</button>
				<button
					v-if="active?.format === 'notes'"
					class="android-sheet-row"
					:disabled="!ready"
					@click="
						sheet = '';
						emit('noteView');
					"
				>
					<Icon name="file" /><span>页面与缩放</span>
				</button>
				<button
					class="android-sheet-row"
					:disabled="!ready || saving"
					@click="action('save')"
				>
					<Icon name="save" /><span
						><strong>另存到文件</strong><small>选择保存位置，保留原文件</small></span
					></button
				><button
					class="android-sheet-row"
					:disabled="saving || !ready"
					@click="
						sheet = '';
						active && emit('rename', active.id);
					"
				>
					<Icon name="edit" /><span
						><strong>修改文件名</strong
						><small>更新本地名称，下次另存时使用</small></span
					></button
				><button
					v-if="active?.format === 'xlsx' && editing"
					class="android-sheet-row"
					:disabled="!ready"
					@click="
						sheet = '';
						emit('ribbon', 'data');
					"
				>
					<Icon name="format" /><span>筛选与排序</span>
				</button>
				<button
					v-if="active?.format === 'xlsx' && editing"
					class="android-sheet-row"
					:disabled="!ready"
					@click="
						sheet = '';
						emit('ribbon', 'view');
					"
				>
					<Icon name="pages" /><span>冻结表头与显示</span>
				</button>
				<button class="android-sheet-row" :disabled="!ready" @click="action('search')">
					<Icon name="search" /><span>查找文档内容</span></button
				><button
					v-if="editing"
					class="android-sheet-row"
					:disabled="!ready"
					@click="
						sheet = '';
						emit('undo');
					"
				>
					<Icon name="undo" /><span>撤销</span></button
				><button
					class="android-sheet-row"
					:disabled="!ready || !editing"
					@click="
						sheet = '';
						emit('redo');
					"
				>
					<Icon name="redo" /><span>重做</span></button
				><button class="android-sheet-row" @click="sheet = 'documents'">
					<Icon name="recent" /><span>切换文档</span></button
				><button
					class="android-sheet-row"
					:disabled="opening"
					@click="
						sheet = '';
						picker?.click();
					"
				>
					<Icon name="folder" /><span>打开其他文件</span></button
				><button class="android-sheet-row" :disabled="saving" @click="action('close')">
					<Icon name="close" /><span
						><strong>关闭文档</strong
						><small>先保存本地草稿，再返回文件列表</small></span
					>
				</button></template
			>
			<template v-else-if="sheet === 'format'"
				><div class="android-format-grid">
					<button
						v-for="item in [
							{ id: 'bold', label: '加粗' },
							{ id: 'italic', label: '斜体' },
							{ id: 'heading', label: '标题' },
							{ id: 'bullet', label: '项目列表' },
						]"
						:key="item.id"
						@pointerdown.prevent
						@click="text(item.id)"
					>
						{{ item.label }}
					</button>
				</div>
				<button class="android-sheet-row" @click="action('format')">
					<Icon name="format" /><span>更多格式工具</span><Icon name="chevron" /></button
			></template>
			<template v-else-if="sheet === 'documents'"
				><button
					v-for="item in documents"
					:key="item.id"
					class="android-sheet-row"
					:aria-current="active?.id === item.id ? 'true' : undefined"
					@click="select(item)"
				>
					<Icon name="file" /><span>{{ item.fileName }}</span
					><Icon v-if="active?.id === item.id" name="check" /></button
			></template>
		</div>
	</dialog>
</template>
