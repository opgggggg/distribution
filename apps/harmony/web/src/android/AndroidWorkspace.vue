<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { EditorArtifactFormat } from "@yaochn/als-office-editor-ui/vue";
import { APP_PROFILE } from "../app-profile.generated";
import appMark from "../../../AppScope/resources/base/media/app_icon.png";
import { UiCheckbox } from "@yaochn/als-office-editor-ui/vue";
import { OPEN_ACCEPT } from "../open-formats";
import Icon from "./AndroidIcon.vue";
import AndroidServices from "./AndroidServices.vue";
interface DocumentItem {
	id: string;
	fileName: string;
	format: EditorArtifactFormat;
	autosaveStatus?: string;
	savedAt?: number;
}
const props = defineProps<{
	documents: DocumentItem[];
	history: DocumentItem[];
	active: DocumentItem | null;
	editing: boolean;
	opening: boolean;
	saving: boolean;
	ready: boolean;
	status: string;
	editable: boolean;
	reduceMotion: boolean;
	immersive: boolean;
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
	close: [];
	undo: [];
	redo: [];
	search: [];
	format: [];
	insert: [];
	keyboard: [];
	newSlide: [];
	present: [];
	text: [command: string];
	motion: [value: boolean];
}>();
const servicesPanel = ref<InstanceType<typeof AndroidServices>>();
const destination = ref("files");
const query = ref("");
const filter = ref("all");
const sheet = ref<"" | "new" | "more" | "format" | "documents">("");
const dialog = ref<HTMLDialogElement>();
const picker = ref<HTMLInputElement>();
const formats = [
	{ id: "docx", label: "文字文档", detail: "写作、报告与信函", mark: "W" },
	{ id: "xlsx", label: "电子表格", detail: "数据、清单与预算", mark: "X" },
	{ id: "pptx", label: "演示文稿", detail: "想法与分享", mark: "P" },
	{ id: "markdown", label: "Markdown", detail: "轻量笔记与写作", mark: "M" },
	{ id: "vsdx", label: "流程图", detail: "流程与结构", mark: "V" },
] as const;
const allDocuments = computed(() => [...props.documents, ...props.history]);
const visibleDocuments = computed(() =>
	allDocuments.value.filter(
		(item) =>
			(filter.value === "all" || item.format === filter.value) &&
			item.fileName.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()),
	),
);
const sheetTitle = computed(
	() =>
		({ "": "", new: "新建", more: "文档操作", format: "文字格式", documents: "切换文档" })[
			sheet.value
		] || "",
);
let previousFocus: HTMLElement | null = null;
watch(sheet, async (value) => {
	if (value) {
		previousFocus = document.activeElement as HTMLElement;
		await nextTick();
		if (!dialog.value?.open) dialog.value?.showModal();
	} else {
		dialog.value?.close();
		previousFocus?.focus({ preventScroll: true });
	}
});
watch(
	() => props.active?.id,
	() => {
		sheet.value = "";
	},
);
onMounted(() => document.documentElement.classList.add("als-ofs-mobile-ui"));
onBeforeUnmount(() => {
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
	if (props.documents.some((doc) => doc.id === item.id))
		return "已打开 · " + item.format.toUpperCase();
	return (
		"本地草稿 · " +
		new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(item.savedAt)
	);
}
</script>

<template>
	<header v-show="!immersive" class="android-topbar">
		<template v-if="active">
			<button class="android-icon-button" aria-label="返回" @click="emit('back')">
				<Icon name="back" />
			</button>
			<button
				class="android-document-title"
				aria-label="切换文档"
				@click="sheet = 'documents'"
			>
				<strong>{{ active.fileName }}</strong
				><small role="status">{{ status }}</small>
			</button>
			<button
				v-if="editing"
				class="android-icon-button"
				aria-label="完成编辑"
				:disabled="saving"
				@click="emit('finish')"
			>
				<Icon name="check" />
			</button>
			<button
				class="android-icon-button"
				aria-label="更多文档操作"
				aria-haspopup="dialog"
				@click="sheet = 'more'"
			>
				<Icon name="more" />
			</button>
		</template>
		<template v-else>
			<img :src="appMark" alt="" width="36" height="36" />
			<strong class="android-brand">{{ APP_PROFILE.name }}</strong>
			<span class="android-local-badge">本地工作区</span>
		</template>
	</header>
	<section v-show="!active" class="android-library" aria-label="文档工作区">
		<div class="android-library-scroll">
			<template v-if="destination !== 'settings'">
				<div class="android-page-title">
					<h1>你的文档</h1>
					<p>随时打开，接着完成。</p>
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
				<div class="android-filters" aria-label="文件类型">
					<button
						v-for="item in [
							{ id: 'all', label: '全部' },
							...formats,
							{ id: 'pdf', label: 'PDF' },
							{ id: 'image', label: '图片' },
							{ id: 'jmp', label: 'JMP' },
						]"
						:key="item.id"
						:aria-pressed="filter === item.id"
						@click="filter = item.id"
					>
						{{ item.label }}
					</button>
				</div>
				<button class="android-open-card" :disabled="opening" @click="picker?.click()">
					<span class="android-folder-icon"><Icon name="folder" /></span
					><span><strong>从设备打开</strong><small>浏览文件、下载和云盘</small></span
					><Icon name="chevron" />
				</button>
				<div class="android-list-heading">
					<h2>
						{{ query || filter !== "all" ? "搜索结果" : "最近与草稿" }}
					</h2>
					<span>{{ visibleDocuments.length }} 个</span>
				</div>
				<div v-if="opening" class="android-progress" role="status">
					正在准备文档，请稍候…
				</div>
				<div v-if="visibleDocuments.length" class="android-file-list">
					<button
						v-for="item in visibleDocuments"
						:key="item.id"
						class="android-file-row"
						:disabled="opening"
						@click="select(item)"
					>
						<span class="android-file-type" :data-format="item.format"
							><Icon name="file" /><small>{{
								item.format === "markdown" ? "MD" : item.format.toUpperCase()
							}}</small></span
						>
						<span class="android-file-copy"
							><strong>{{ item.fileName }}</strong
							><small>{{ dateLabel(item) }}</small></span
						><Icon name="chevron" />
					</button>
				</div>
				<div v-else-if="!opening" class="android-empty">
					<span><Icon :name="query || filter !== 'all' ? 'search' : 'file'" /></span>
					<h2>{{ query || filter !== "all" ? "没有匹配的文档" : "从一份文档开始" }}</h2>
					<p>
						{{
							query || filter !== "all"
								? "换个名称，或试试其他文件类型。"
								: "打开设备中的文件，或新建一份文档。编辑草稿会保存在这台设备上。"
						}}
					</p>
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
					草稿保存在本机。需要交付时，请另存到文件。
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
						编辑时会自动保存本地草稿。“另存到文件”可以将结果保存到你选择的位置，不会自动覆盖原文件。
					</p>
					<p>清除应用数据或卸载应用会移除本地草稿。重要文档请另存到文件。</p>
				</section>
				<section class="android-settings-card android-about">
					<img :src="appMark" alt="" width="48" height="48" />
					<h2>{{ APP_PROFILE.name }}</h2>
					<p>版本 {{ APP_PROFILE.versionName }}</p>
					<p>文档、表格、演示与笔记，随身处理。</p>
				</section>
			</template>
			<div v-show="destination === 'settings'"><AndroidServices ref="servicesPanel" /></div>
		</div>
		<button
			v-if="destination !== 'settings'"
			class="android-fab"
			:disabled="opening"
			aria-haspopup="dialog"
			@click="sheet = 'new'"
		>
			<Icon name="plus" />新建
		</button>
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
		v-if="active && !immersive"
		class="android-editor-tools"
		:aria-label="editing ? '编辑工具' : '阅读工具'"
	>
		<template v-if="editing">
			<button :disabled="!ready" aria-label="撤销" @pointerdown.prevent @click="emit('undo')">
				<Icon name="undo" /><span>撤销</span>
			</button>
			<button
				aria-label="格式"
				:disabled="!ready"
				@pointerdown.prevent
				@click="active.format === 'markdown' ? (sheet = 'format') : emit('format')"
			>
				<Icon name="format" /><span>格式</span>
			</button>
			<button
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
		<template v-else>
			<button aria-label="查找" :disabled="!ready" @click="emit('search')">
				<Icon name="search" /><span>查找</span>
			</button>
			<button
				v-if="active.format === 'pptx'"
				aria-label="播放"
				:disabled="!ready"
				@click="emit('present')"
			>
				<Icon name="play" /><span>播放</span>
			</button>
			<span class="android-tool-spacer" />
			<button
				v-if="editable"
				class="android-edit-cta"
				aria-label="编辑文档"
				:disabled="!ready"
				@click="emit('edit')"
			>
				<Icon name="edit" /><span>编辑文档</span>
			</button>
			<span v-else class="android-readonly">只读文档</span>
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
		class="android-sheet"
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
			<template v-if="sheet === 'new'"
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
			<template v-else-if="sheet === 'more'"
				><p class="android-sheet-description">{{ active?.fileName }}</p>
				<button
					class="android-sheet-row"
					:disabled="!editable || !ready || saving"
					@click="action('save')"
				>
					<Icon name="save" /><span
						><strong>另存到文件</strong><small>选择保存位置，保留原文件</small></span
					></button
				><button class="android-sheet-row" :disabled="!ready" @click="action('search')">
					<Icon name="search" /><span>查找文档内容</span></button
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
