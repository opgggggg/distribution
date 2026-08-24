<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { DOCX_VUE_FORMAT_CONTRIBUTION } from "@yaochn/als-office-docx/vue";
import {
	UiArtifactFormatRegistry,
	UiEditorI18nProvider,
	UiRibbonModeProvider,
	setUiEditorFileSink,
	type EditorArtifactFormat,
	type UiArtifactSurfaceBinding,
	type UiArtifactSurfaceHandle,
	type UiArtifactSurfaceInput,
} from "@yaochn/als-office-editor-ui/vue";
import { MARKDOWN_VUE_FORMAT_CONTRIBUTION } from "@yaochn/als-office-markdown/vue";
import { PDF_VUE_FORMAT_CONTRIBUTION } from "@yaochn/als-office-pdf/vue";
import { PPTX_VUE_FORMAT_CONTRIBUTION } from "@yaochn/als-office-pptx/vue";
import { VSDX_VUE_FORMAT_CONTRIBUTION } from "@yaochn/als-office-vsdx/vue";
import {
	JMP_VUE_FORMAT_CONTRIBUTION,
	XLSX_VUE_FORMAT_CONTRIBUTION,
} from "@yaochn/als-office-xlsx/vue";

import DesktopWelcomePanel from "../../../../als-office/apps/desktop/src/DesktopWelcomePanel.vue";
import CliActivityPanel from "../../../../als-office/apps/desktop/src/CliActivityPanel.vue";
import AboutDialog from "../../../../als-office/apps/desktop/src/AboutDialog.vue";
import SettingsDialog from "../../../../als-office/apps/desktop/src/SettingsDialog.vue";
import type {
	CliActivityEntry,
	CliControlStatus,
} from "../../../../als-office/apps/desktop/src/activity-types";
import appLogoUrl from "../../../../als-office/apps/desktop/src/assets/office-editor-mark.svg";
import appMarkUrl from "../../AppScope/resources/base/media/app_icon.png";
import { APP_PROFILE } from "./app-profile.generated";
import {
	applyDesktopPreferences,
	loadDesktopPreferences,
	saveDesktopPreferences,
} from "../../../../als-office/apps/desktop/src/preferences";
import {
	consumeHarmonyIntent,
	isAndroidHost,
	isHarmonyHost,
	nativeHostLabel,
	parseNativeAssistantCommand,
	readNativeOpenDocument,
	saveBlobWithHost,
	setMobilePresentationLandscape,
	startHarmonyWindowMove,
	toggleHarmonyWindowMaximize,
	type NativeAssistantCommandDescriptor,
} from "./harmony-host";
import {
	listHarmonyAutosaves,
	writeHarmonyAutosave,
	type HarmonyAutosaveRecord,
} from "./autosave-store";

interface HarmonyFormatOption {
	format: EditorArtifactFormat;
	label: string;
	documentLabel: string;
	shortLabel: string;
	icon: string;
	extension: string;
	baseName: string;
	editable: boolean;
}

interface HarmonyDocumentTab {
	id: string;
	autosaveId: string;
	fileName: string;
	format: EditorArtifactFormat;
	extension: string;
	source: Blob | undefined;
	modelValue: unknown;
	editor: UiArtifactSurfaceHandle | null;
	autosaveStatus: "idle" | "pending" | "saving" | "saved" | "error";
	autosaveRevision: string | undefined;
	autosavedAt: number | undefined;
	mobileMode: "reading" | "editing";
	mobileAutofocusPending: boolean;
}

interface MobileDocxPosition {
	blockId: string;
	offset: number;
	affinity?: "forward" | "backward";
}

interface MobileDocxSelection {
	kind: string;
	anchor: MobileDocxPosition;
	focus: MobileDocxPosition;
	isCollapsed?: boolean;
	text?: string;
	objectIds?: string[];
}

interface MobileDocxEditor {
	getSelection(): MobileDocxSelection | null;
	setSelection(selection: MobileDocxSelection | null): MobileDocxSelection | null;
	focus(): void;
	editor: {
		getSelectionFormat(): {
			bold?: boolean;
			italic?: boolean;
			underline?: string;
			listType?: string | null;
		};
	};
	writePort: {
		dispatchCommand(command: Record<string, unknown>): unknown;
	};
	applyTextFormat(format: {
		bold?: boolean;
		italic?: boolean;
		underline?: "none" | "single";
	}): void;
	applyParagraphFormat(format: {
		listType?: "bullet" | "decimal" | null;
		styleId?: string;
	}): void;
	insertPicture(
		blob: Blob,
		at: MobileDocxPosition,
		options?: { fileName?: string; altText?: string },
	): Promise<unknown>;
}

interface MobileMarkdownEditor {
	getSelection(): { start: number; end: number; direction?: "forward" | "backward" | "none" };
	setSelection(selection: {
		start: number;
		end: number;
		direction?: "forward" | "backward" | "none";
	}): unknown;
	apply(action: Record<string, unknown>, options?: Record<string, unknown>): unknown;
	focus(): void;
}

const HOME_TAB_ID = "home";
const FORMAT_OPTIONS: readonly HarmonyFormatOption[] = [
	{
		format: "docx",
		label: "Word",
		documentLabel: "Word 文档",
		shortLabel: "DOCX",
		icon: "W",
		extension: "docx",
		baseName: "Document",
		editable: true,
	},
	{
		format: "pptx",
		label: "PowerPoint",
		documentLabel: "演示文稿",
		shortLabel: "PPTX",
		icon: "P",
		extension: "pptx",
		baseName: "Presentation",
		editable: true,
	},
	{
		format: "xlsx",
		label: "Excel",
		documentLabel: "Excel 工作簿",
		shortLabel: "XLSX",
		icon: "X",
		extension: "xlsx",
		baseName: "Workbook",
		editable: true,
	},
	{
		format: "vsdx",
		label: "Visio",
		documentLabel: "Visio 绘图",
		shortLabel: "VSDX",
		icon: "V",
		extension: "vsdx",
		baseName: "Drawing",
		editable: true,
	},
	{
		format: "markdown",
		label: "Markdown",
		documentLabel: "Markdown 文档",
		shortLabel: "MD",
		icon: "M",
		extension: "md",
		baseName: "Notes",
		editable: true,
	},
	{
		format: "pdf",
		label: "PDF",
		documentLabel: "PDF 文档（只读）",
		shortLabel: "PDF",
		icon: "PDF",
		extension: "pdf",
		baseName: "Document",
		editable: false,
	},
	{
		format: "jmp",
		label: "JMP",
		documentLabel: "JMP 数据表（只读）",
		shortLabel: "JMP",
		icon: "JMP",
		extension: "jmp",
		baseName: "Data Table",
		editable: false,
	},
];
const OPEN_ACCEPT = ".docx,.pptx,.xlsx,.jmp,.vsdx,.md,.markdown,.pdf,.drawio";
const formats = new UiArtifactFormatRegistry([
	DOCX_VUE_FORMAT_CONTRIBUTION,
	PPTX_VUE_FORMAT_CONTRIBUTION,
	XLSX_VUE_FORMAT_CONTRIBUTION,
	JMP_VUE_FORMAT_CONTRIBUTION,
	VSDX_VUE_FORMAT_CONTRIBUTION,
	MARKDOWN_VUE_FORMAT_CONTRIBUTION,
	PDF_VUE_FORMAT_CONTRIBUTION,
]);
const formatOptions = new Map(FORMAT_OPTIONS.map((option) => [option.format, option]));
const editableFormats = FORMAT_OPTIONS.filter((option) => option.editable);
const welcomePanelFormats = FORMAT_OPTIONS.map((option) => ({ label: option.shortLabel }));
const welcomePanelCopy = {
	title: "一句指令，直接修改文档",
	subtitle: "助手会直接处理你当前打开的文件。",
	undoable: "可撤销",
	overviewLabel: "AI 辅助编辑概览",
	supportedFilesLabel: "支持的文件类型",
	connectedWorkspaceLabel: "{count} 种格式 · 一个互联工作区",
	askInAppLabel: "在 AI 应用中提问",
	askPrompt: "“优化摘要、更新预算并对齐幻灯片内容。”",
} as const;
const aboutCopy = {
	checkForUpdates: "检查更新…",
	done: "完成",
	checkingForUpdates: "正在检查更新…",
	description: "在移动设备上打开、编辑和查看文档，并通过 AI 助手协同处理内容。",
	close: "关闭“关于 {app}”",
	version: "版本 {version}",
	formatsLabel: "支持的文档格式",
} as const;
const settingsCopy = {
	title: "系统设置",
	subtitle: `选择 ${APP_PROFILE.name} 在这台移动设备上的工作方式。`,
	close: "关闭系统设置",
	general: "通用",
	language: "语言",
	languageHelp: "设置应用与编辑器使用的界面语言。",
	systemLanguage: "跟随系统",
	english: "English",
	chinese: "简体中文",
	updates: "更新",
	autoUpdates: "自动检查更新",
	autoUpdatesHelp: "应用启动后自动检查经过签名验证的新版本。",
	ai: "AI 连接",
	autoActivity: "收到 AI 请求时显示活动面板",
	autoActivityHelp: "小艺或其他 AI 工具调用当前工作区时自动展开活动侧边栏。",
	accessibility: "辅助功能",
	reduceMotion: "减弱界面动态效果",
	reduceMotionHelp: "尽量减少应用中的脉冲和过渡动画。",
	restore: "恢复默认设置",
	done: "完成",
} as const;
const tabs = ref<HarmonyDocumentTab[]>([]);
const autosaveHistory = ref<HarmonyAutosaveRecord[]>([]);
const activeId = ref(HOME_TAB_ID);
const saving = ref(false);
const opening = ref(false);
const error = ref("");
const newMenuOpen = ref(false);
const appMenuOpen = ref(false);
const aboutDialogOpen = ref(false);
const settingsDialogOpen = ref(false);
const activityOpen = ref(false);
const mobileRibbonOpen = ref(false);
const mobileRibbonSection = ref<"format" | "insert">("format");
const mobileSearchOpen = ref(false);
const mobileMoreOpen = ref(false);
const mobileInsertMenuOpen = ref(false);
const mobileInsertLinkOpen = ref(false);
const mobileInsertLinkUrl = ref("");
const mobileLayout = ref(false);
const mobileTextEditing = ref(false);
const mobilePptxViewing = ref(false);
const mobilePptxSingleView = ref(false);
const mobilePptxZoomLabel = ref("100%");
const mobilePortrait = ref(true);
const mobileDocxImageInput = ref<HTMLInputElement | null>(null);
const activityEntries = ref<CliActivityEntry[]>([]);
const lastActivity = ref("");
const newMenuHost = ref<HTMLElement | null>(null);
const appMenuHost = ref<HTMLElement | null>(null);
const appMenu = ref<HTMLElement | null>(null);
const appMenuTrigger = ref<HTMLButtonElement | null>(null);
const preferences = ref(loadDesktopPreferences());
const surfaceRefs = new Map<string, (instance: unknown) => void>();
const formatCounters = new Map<EditorArtifactFormat, number>();
let tabCounter = 0;
let activityCounter = 0;
let phoneMediaQuery: MediaQueryList | undefined;
let mobileImeSyncFrame: number | undefined;
let pendingMobileDocxImagePosition: MobileDocxPosition | null = null;
type MobilePptxSlideDirection = "previous" | "next";
type MobilePptxSlideDrag = {
	direction: MobilePptxSlideDirection;
	currentFrame: HTMLElement;
	adjacentFrame: HTMLElement | null;
	adjacentWasHidden: boolean;
	adjacentAriaHidden: string | null;
	travel: number;
};
type MobilePptxGesture = {
	primaryId: number;
	pointers: Map<number, { x: number; y: number }>;
	startX: number;
	startY: number;
	startTime: number;
	startScrollLeft: number;
	startScrollTop: number;
	startAtLeft: boolean;
	startAtRight: boolean;
	viewport: HTMLElement;
	pinching: boolean;
	moved: boolean;
	axis?: "pan" | "slide";
	slideDrag?: MobilePptxSlideDrag;
};
let mobilePptxGesture: MobilePptxGesture | undefined;
let mobilePptxZoomObserver: MutationObserver | undefined;
let mobilePptxSlideSettling = false;
let mobilePptxSettlingDrag: MobilePptxSlideDrag | undefined;
let mobilePptxSlideSettleToken = 0;

const harmonyControlStatus: CliControlStatus = {
	listening: true,
	socket: null,
	version: 1,
};

const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeId.value) ?? null);
const homeActive = computed(() => activeId.value === HOME_TAB_ID);
const activeEditable = computed(() =>
	activeTab.value ? optionFor(activeTab.value.format).editable : false,
);
const activeMobileEditing = computed(
	() =>
		Boolean(activeTab.value && optionFor(activeTab.value.format).editable) &&
		(!mobileLayout.value || activeTab.value?.mobileMode === "editing"),
);
const restorableAutosaves = computed(() => {
	const openAutosaveIds = new Set(tabs.value.map((tab) => tab.autosaveId));
	return autosaveHistory.value
		.filter((record) => !openAutosaveIds.has(record.id))
		.sort((left, right) => right.savedAt - left.savedAt);
});
const mobileFormatLabel = computed(() => {
	switch (activeTab.value?.format) {
		case "xlsx":
		case "jmp":
			return "单元格";
		case "pptx":
		case "vsdx":
			return "样式";
		case "pdf":
			return "批注";
		default:
			return "格式";
	}
});
const activeAutosaveLabel = computed(() => {
	const tab = activeTab.value;
	if (!mobileLayout.value || !tab || !optionFor(tab.format).editable) return "";
	switch (tab.autosaveStatus) {
		case "pending":
			return "等待自动保存…";
		case "saving":
			return "正在自动保存…";
		case "saved":
			return "已自动保存";
		case "error":
			return "自动保存失败 · 将重试";
		default:
			return optionFor(tab.format).documentLabel;
	}
});
const mobileEditingStatusLabel = computed(() => {
	if (saving.value || activeTab.value?.autosaveStatus === "saving") return "保存中…";
	switch (activeTab.value?.autosaveStatus) {
		case "pending":
			return "等待保存…";
		case "saved":
			return "已保存";
		case "error":
			return "保存失败";
		default:
			return "编辑中";
	}
});
const mobileReadingStatusLabel = computed(() => {
	const tab = activeTab.value;
	if (!tab) return "";
	if (!optionFor(tab.format).editable) return "只读";
	if (tab.autosaveStatus === "saving") return "查看模式 · 保存中…";
	if (tab.autosaveStatus === "saved") return "查看模式 · 已保存";
	if (tab.autosaveStatus === "error") return "查看模式 · 保存失败";
	return "查看模式";
});

const AUTOSAVE_DELAY_MS = 5_000;
const AUTOSAVE_RETRY_MS = 15_000;
const autosaveTimers = new Map<string, number>();
const autosaveOperations = new Map<string, Promise<void>>();
const autosaveUnsubscribers = new Map<string, () => void>();
const autosaveQueued = new Set<string>();
let autosavesRestored = false;

watch(activeId, () => {
	if (mobilePptxViewing.value) {
		mobilePptxViewing.value = false;
		void setMobilePresentationLandscape(false);
	}
	closeMobileRibbon();
	mobileSearchOpen.value = false;
	mobileMoreOpen.value = false;
	mobileInsertMenuOpen.value = false;
	mobileInsertLinkOpen.value = false;
	mobileTextEditing.value = false;
	mobilePptxSingleView.value = false;
	mobilePptxGesture = undefined;
	syncMobileImeInset();
	void nextTick(() => showMobilePptxOverview(activeTab.value));
});

watch(
	preferences,
	(next) => {
		applyDesktopPreferences(next);
		saveDesktopPreferences(next);
	},
	{ deep: true, immediate: true },
);

function optionFor(format: EditorArtifactFormat): HarmonyFormatOption {
	const option = formatOptions.get(format);
	if (!option) throw new Error(`不支持 ${format.toUpperCase()} 格式。`);
	return option;
}

function reportError(cause: unknown): void {
	error.value = cause instanceof Error ? cause.message : String(cause);
}

function surfaceInput(tab: HarmonyDocumentTab): UiArtifactSurfaceInput {
	const option = optionFor(tab.format);
	const readonly = !option.editable || (mobileLayout.value && tab.mobileMode !== "editing");
	return {
		artifactId: tab.id,
		fileName: tab.fileName,
		source: tab.source,
		modelValue: tab.modelValue,
		// Keep one live editor component mounted while mobile mode changes so its
		// model, selection, zoom and undo stack survive. `readonly` controls the
		// interaction state; the lightweight viewer is reserved for true read-only
		// formats such as PDF/JMP.
		role: option.editable ? "editor" : "viewer",
		readonly,
		headerMode: "compact",
		ribbonMode: mobileLayout.value ? "mobile" : "desktop",
		services: {
			updateSource: (source: Blob | undefined) => (tab.source = source),
			updateModelValue: (value: unknown) => (tab.modelValue = value),
			reportError,
		},
	};
}

function surfaceBinding(tab: HarmonyDocumentTab): UiArtifactSurfaceBinding {
	const binding = formats.require(tab.format).createBinding(surfaceInput(tab));
	if (!mobileLayout.value) return binding;
	if (tab.format === "markdown") {
		return {
			...binding,
			props: {
				...binding.props,
				// Source mode is the keyboard-native editing surface on phones. The
				// richer visual and preview modes remain unchanged on larger screens.
				viewMode: "source",
				leftPanel: false,
				rightPanel: false,
				statusBar: false,
			},
		};
	}
	if (tab.format === "pptx") {
		return {
			...binding,
			props: {
				...binding.props,
				// Phone reading is a continuous, full-width slide list. The explicit
				// prop also makes the intended initial view available before the runtime
				// finishes importing a large deck, instead of relying only on a later click.
				slideViewMode:
					tab.mobileMode === "reading" && mobilePortrait.value && !mobilePptxViewing.value
						? "all"
						: "single",
			},
		};
	}
	if (tab.format !== "docx") return binding;
	return {
		...binding,
		props: {
			...binding.props,
			// A phone cannot make an A4 print page readable without shrinking its text.
			// Web layout reflows the same document model to the available width; the
			// saved DOCX keeps its real page size, margins and font sizes unchanged.
			layout: "web",
			showRuler: false,
			webViewportMinHeight: 0,
		},
	};
}

function untitledName(option: HarmonyFormatOption): string {
	const count = (formatCounters.get(option.format) ?? 0) + 1;
	formatCounters.set(option.format, count);
	return `${option.baseName}${count > 1 ? ` ${count}` : ""}.${option.extension}`;
}

async function addDocument(
	format: EditorArtifactFormat,
	fileName: string,
	source?: Blob,
	options: {
		autosaveId?: string;
		autosavedAt?: number;
		activate?: boolean;
		mobileMode?: "reading" | "editing";
	} = {},
): Promise<void> {
	const id = `harmony-artifact-${++tabCounter}`;
	const option = optionFor(format);
	// DocumentViewPicker files are backed by a temporary native URI. ArkWeb can
	// read that handle to open a document, but a later PPTX export may receive an
	// empty second read. Materialize it once so editing, autosave and Save As all
	// share a stable in-memory Blob.
	const stableSource = source
		? new Blob([await source.arrayBuffer()], {
				type: source.type || "application/octet-stream",
			})
		: undefined;
	const modelValue = await formats.prepareModelValue(format, stableSource);
	tabs.value.push({
		id,
		autosaveId: options.autosaveId ?? createAutosaveId(),
		fileName,
		format,
		extension: option.extension,
		source: stableSource,
		modelValue,
		editor: null,
		autosaveStatus: options.autosavedAt ? "saved" : "idle",
		autosaveRevision: undefined,
		autosavedAt: options.autosavedAt,
		mobileMode:
			options.mobileMode ??
			(option.editable && stableSource === undefined ? "editing" : "reading"),
		mobileAutofocusPending:
			mobileLayout.value &&
			stableSource === undefined &&
			(format === "docx" || format === "markdown"),
	});
	if (options.activate !== false) activeId.value = id;
	error.value = "";
}

function createAutosaveId(): string {
	return typeof crypto.randomUUID === "function"
		? crypto.randomUUID()
		: `autosave-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function revisionToken(revision: number | string): string {
	return `${typeof revision}:${String(revision)}`;
}

function clearAutosaveTimer(tabId: string): void {
	const timer = autosaveTimers.get(tabId);
	if (timer !== undefined) window.clearTimeout(timer);
	autosaveTimers.delete(tabId);
}

function autosaveIsCurrent(tab: HarmonyDocumentTab): boolean {
	if (!tab.editor || tab.autosaveStatus !== "saved") return false;
	return tab.autosaveRevision === revisionToken(tab.editor.getState().revision);
}

function scheduleAutosave(tab: HarmonyDocumentTab, delay = AUTOSAVE_DELAY_MS): void {
	if (!mobileLayout.value || !optionFor(tab.format).editable || !tab.editor) return;
	clearAutosaveTimer(tab.id);
	if (autosaveOperations.has(tab.id)) {
		autosaveQueued.add(tab.id);
		return;
	}
	tab.autosaveStatus = "pending";
	autosaveTimers.set(
		tab.id,
		window.setTimeout(() => {
			autosaveTimers.delete(tab.id);
			void runAutosave(tab);
		}, delay),
	);
}

async function persistAutosave(
	tab: HarmonyDocumentTab,
	blob: Blob,
	revision: string,
): Promise<void> {
	const savedAt = Date.now();
	const record: HarmonyAutosaveRecord = {
		id: tab.autosaveId,
		fileName: tab.fileName,
		format: tab.format,
		blob,
		savedAt,
	};
	await writeHarmonyAutosave(record);
	const historyIndex = autosaveHistory.value.findIndex((item) => item.id === record.id);
	if (historyIndex < 0) autosaveHistory.value.push(record);
	else autosaveHistory.value.splice(historyIndex, 1, record);
	tab.autosaveRevision = revision;
	tab.autosavedAt = savedAt;
	tab.autosaveStatus = "saved";
}

function runAutosave(tab: HarmonyDocumentTab): Promise<void> {
	const existing = autosaveOperations.get(tab.id);
	if (existing) {
		autosaveQueued.add(tab.id);
		return existing;
	}
	const operation = (async () => {
		const editor = tab.editor;
		if (!mobileLayout.value || !editor || !optionFor(tab.format).editable) return;
		const startingState = editor.getState();
		const startingRevision = revisionToken(startingState.revision);
		if (!startingState.dirty && tab.autosaveRevision === startingRevision) {
			tab.autosaveStatus = "saved";
			return;
		}
		tab.autosaveStatus = "saving";
		try {
			// Export does not clear the editor's dirty state before IndexedDB commits.
			// The Host treats a matching persisted revision as safe when closing.
			const blob = await editor.export({ format: tab.format });
			await persistAutosave(tab, blob, startingRevision);
		} catch (cause) {
			tab.autosaveStatus = "error";
			console.error("HarmonyOS automatic save failed", cause);
		}
	})().finally(() => {
		autosaveOperations.delete(tab.id);
		const editor = tab.editor;
		const queued = autosaveQueued.delete(tab.id);
		const revisionChanged =
			editor !== null && tab.autosaveRevision !== revisionToken(editor.getState().revision);
		if (queued || revisionChanged || tab.autosaveStatus === "error") {
			scheduleAutosave(
				tab,
				tab.autosaveStatus === "error" ? AUTOSAVE_RETRY_MS : AUTOSAVE_DELAY_MS,
			);
		}
	});
	autosaveOperations.set(tab.id, operation);
	return operation;
}

function bindAutosave(tab: HarmonyDocumentTab): void {
	autosaveUnsubscribers.get(tab.id)?.();
	autosaveUnsubscribers.delete(tab.id);
	clearAutosaveTimer(tab.id);
	if (!mobileLayout.value || !tab.editor || !optionFor(tab.format).editable) return;
	if (tab.autosavedAt && tab.autosaveRevision === undefined) {
		tab.autosaveRevision = revisionToken(tab.editor.getState().revision);
	}
	const unsubscribe = tab.editor.subscribe((state) => {
		const revision = revisionToken(state.revision);
		if (state.dirty && revision !== tab.autosaveRevision) scheduleAutosave(tab);
	});
	autosaveUnsubscribers.set(tab.id, unsubscribe);
	const state = tab.editor.getState();
	if (state.dirty && revisionToken(state.revision) !== tab.autosaveRevision) {
		scheduleAutosave(tab);
	}
}

async function flushAutosaves(): Promise<void> {
	if (!mobileLayout.value) return;
	const pending: Promise<void>[] = [];
	for (const tab of tabs.value) {
		if (!optionFor(tab.format).editable || !tab.editor) continue;
		clearAutosaveTimer(tab.id);
		const state = tab.editor.getState();
		if (state.dirty && revisionToken(state.revision) !== tab.autosaveRevision) {
			pending.push(runAutosave(tab));
		}
	}
	await Promise.allSettled(pending);
}

async function restoreAutosaves(): Promise<void> {
	if (autosavesRestored) return;
	autosavesRestored = true;
	try {
		autosaveHistory.value = (await listHarmonyAutosaves()).filter(
			(record) => formatOptions.get(record.format)?.editable,
		);
	} catch (cause) {
		console.error("Could not load HarmonyOS automatic save history", cause);
	}
}

async function restoreHistoricalDocument(record: HarmonyAutosaveRecord): Promise<void> {
	const openTab = tabs.value.find((tab) => tab.autosaveId === record.id);
	if (openTab) {
		selectTab(openTab.id);
		return;
	}
	if (opening.value) return;
	opening.value = true;
	error.value = "";
	try {
		await addDocument(record.format, record.fileName, record.blob, {
			autosaveId: record.id,
			autosavedAt: record.savedAt,
			mobileMode: "reading",
		});
	} catch (cause) {
		reportError(cause);
	} finally {
		opening.value = false;
	}
}

const historyDateTime = new Intl.DateTimeFormat("zh-CN", {
	month: "numeric",
	day: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});

function historyTimeLabel(savedAt: number): string {
	return historyDateTime.format(new Date(savedAt));
}

async function createDocument(format: EditorArtifactFormat): Promise<void> {
	if (opening.value) return;
	const option = optionFor(format);
	if (!option.editable) return;
	newMenuOpen.value = false;
	opening.value = true;
	try {
		await addDocument(format, untitledName(option));
	} catch (cause) {
		reportError(cause);
	} finally {
		opening.value = false;
	}
}

function updateActivity(entry: CliActivityEntry): void {
	const index = activityEntries.value.findIndex((candidate) => candidate.id === entry.id);
	if (index >= 0) activityEntries.value[index] = entry;
	else activityEntries.value.unshift(entry);
	lastActivity.value = new Date(entry.at).toLocaleTimeString("zh-CN");
}

function assistantCommandTitle(command: NativeAssistantCommandDescriptor): string {
	const assistant = command.source === "harmonyos" ? "小艺" : "系统助手";
	switch (command.command) {
		case "home":
			return `${assistant}打开文档工作区首页`;
		case "activity":
			return `${assistant}打开 AI 活动`;
		case "recent":
			return `${assistant}查看最近文档`;
		case "open-recent":
			return `${assistant}打开最近文档`;
		case "new-document":
			return `${assistant}新建 ${command.format?.toUpperCase() ?? "文档"}`;
		case "set-mode":
			return `${assistant}切换${command.mode === "editing" ? "编辑" : "阅读"}模式`;
	}
}

async function executeNativeAssistantCommand(
	command: NativeAssistantCommandDescriptor,
): Promise<void> {
	if (preferences.value.openAiActivityAutomatically) activityOpen.value = true;
	const startedAt = performance.now();
	const entry: CliActivityEntry = {
		id: `assistant-intent-${Date.now()}-${++activityCounter}`,
		at: new Date().toISOString(),
		op: "intent.execute",
		title: assistantCommandTitle(command),
		summary:
			command.source === "harmonyos"
				? "Intents Kit · JumpFunctionPage"
				: "Android Intent · Assistant action",
		status: "running",
		detail: JSON.stringify(command, null, 2),
	};
	updateActivity(entry);

	try {
		switch (command.command) {
			case "home":
			case "recent":
				selectTab(HOME_TAB_ID);
				break;
			case "activity":
				activityOpen.value = true;
				break;
			case "open-recent": {
				await restoreAutosaves();
				const recent = [...autosaveHistory.value].sort(
					(left, right) => right.savedAt - left.savedAt,
				)[0];
				if (recent) await restoreHistoricalDocument(recent);
				else selectTab(HOME_TAB_ID);
				break;
			}
			case "new-document":
				if (!command.format) throw new Error("新建文档指令缺少文件格式。");
				await createDocument(command.format);
				break;
			case "set-mode": {
				const tab = activeTab.value;
				if (!tab) throw new Error("当前没有打开的文档。");
				if (!optionFor(tab.format).editable) throw new Error("当前文档只支持阅读。");
				if (command.mode === "editing") {
					setMobileDocumentMode(tab, "editing");
				} else {
					await flushAutosaves();
					setMobileDocumentMode(tab, "reading");
				}
				break;
			}
		}
		updateActivity({
			...entry,
			status: "ok",
			durationMs: Math.round(performance.now() - startedAt),
			target: activeTab.value?.id,
		});
	} catch (cause) {
		updateActivity({
			...entry,
			status: "error",
			durationMs: Math.round(performance.now() - startedAt),
			detail: cause instanceof Error ? cause.message : String(cause),
		});
		reportError(cause);
	}
}

async function consumePendingNativeIntent(): Promise<void> {
	for (;;) {
		const pendingIntent = consumeHarmonyIntent();
		if (!pendingIntent) break;
		try {
			const file = await readNativeOpenDocument(pendingIntent);
			if (file) {
				opening.value = true;
				error.value = "";
				await addFile(file);
				continue;
			}
			const assistantCommand = parseNativeAssistantCommand(pendingIntent);
			if (!assistantCommand) throw new Error("系统传入了不受支持的助手指令。");
			await executeNativeAssistantCommand(assistantCommand);
		} catch (cause) {
			reportError(cause);
		}
	}
	opening.value = false;
}

function handleNativeDocument(): void {
	void consumePendingNativeIntent();
}

function extensionOf(fileName: string): string {
	return /\.([^.]+)$/u.exec(fileName)?.[1]?.toLocaleLowerCase() ?? "";
}

function replaceFileExtension(fileName: string, extension: string): string {
	return `${fileName.replace(/\.[^.]+$/u, "") || "Untitled"}.${extension}`;
}

async function addFile(file: File): Promise<void> {
	const extension = extensionOf(file.name);
	const direct = formats.get(extension as EditorArtifactFormat);
	if (direct) {
		await addDocument(direct.plugin.manifest.id, file.name, file);
		return;
	}
	const converter = await formats.engine.conversions.resolveImport(
		{
			source: file,
			fileName: file.name,
			...(file.type ? { mimeType: file.type } : {}),
		},
		{ openable: (format) => formats.get(format) !== undefined },
	);
	if (!converter) throw new Error("不支持这个文件类型。请选择 Office、PDF 或 Markdown 文件。");
	const targetFormat = converter.manifest.target.format;
	const targetExtension = converter.manifest.target.extensions[0] ?? targetFormat;
	const converted = await formats.engine.conversions.convert(
		{
			kind: "bytes",
			blob: file,
			fileName: file.name,
			sourceFormat: converter.manifest.source.format,
		},
		targetFormat,
	);
	await addDocument(targetFormat, replaceFileExtension(file.name, targetExtension), converted);
}

async function open(event: Event): Promise<void> {
	const input = event.currentTarget as HTMLInputElement;
	const file = input.files?.[0];
	input.value = "";
	if (!file || opening.value) return;
	newMenuOpen.value = false;
	opening.value = true;
	error.value = "";
	try {
		await addFile(file);
	} catch (cause) {
		reportError(cause);
	} finally {
		opening.value = false;
	}
}

function selectTab(id: string): void {
	if (id === HOME_TAB_ID || tabs.value.some((tab) => tab.id === id)) activeId.value = id;
}

function closeTab(id: string): void {
	const index = tabs.value.findIndex((tab) => tab.id === id);
	if (index < 0) return;
	const tab = tabs.value[index];
	if (
		tab?.editor?.getState().dirty &&
		!autosaveIsCurrent(tab) &&
		!window.confirm(`关闭“${tab.fileName}”并放弃未保存的更改？`)
	) {
		return;
	}
	clearAutosaveTimer(id);
	autosaveUnsubscribers.get(id)?.();
	autosaveUnsubscribers.delete(id);
	autosaveQueued.delete(id);
	formats.unmount(id);
	surfaceRefs.delete(id);
	tabs.value.splice(index, 1);
	if (activeId.value !== id) return;
	activeId.value = tabs.value[Math.min(index, tabs.value.length - 1)]?.id ?? HOME_TAB_ID;
}

function setTabSurface(tab: HarmonyDocumentTab, instance: unknown): void {
	if (!instance) {
		clearAutosaveTimer(tab.id);
		autosaveUnsubscribers.get(tab.id)?.();
		autosaveUnsubscribers.delete(tab.id);
		formats.unmount(tab.id);
		tab.editor = null;
		return;
	}
	if (tab.editor?.exposed === instance) return;
	tab.editor = formats.mount(tab.format, surfaceInput(tab), instance);
	bindAutosave(tab);
	if (tab.mobileAutofocusPending && tab.id === activeId.value) {
		tab.mobileAutofocusPending = false;
		void nextTick(() => enterMobileEditing(tab, { focusText: true }));
	}
	if (tab.format === "pptx" && tab.mobileMode === "reading" && tab.id === activeId.value) {
		void showMobilePptxOverview(tab);
	}
}

function refreshTabSurface(tab: HarmonyDocumentTab): void {
	const exposed = tab.editor?.exposed;
	if (!exposed) return;
	tab.editor = formats.mount(tab.format, surfaceInput(tab), exposed);
	bindAutosave(tab);
}

function setMobileDocumentMode(tab: HarmonyDocumentTab, mode: "reading" | "editing"): void {
	if (!optionFor(tab.format).editable || tab.mobileMode === mode) return;
	tab.mobileMode = mode;
	refreshTabSurface(tab);
}

function surfaceRef(tab: HarmonyDocumentTab): (instance: unknown) => void {
	let reference = surfaceRefs.get(tab.id);
	if (!reference) {
		reference = (instance) => setTabSurface(tab, instance);
		surfaceRefs.set(tab.id, reference);
	}
	return reference;
}

function closeMenus(event: PointerEvent): void {
	if (!newMenuHost.value?.contains(event.target as Node)) newMenuOpen.value = false;
	if (!appMenuHost.value?.contains(event.target as Node)) appMenuOpen.value = false;
}

async function openAppMenu(focusFirstItem = false): Promise<void> {
	newMenuOpen.value = false;
	appMenuOpen.value = true;
	if (!focusFirstItem) return;
	await nextTick();
	appMenu.value?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
}

function closeAppMenu(returnFocus = false): void {
	appMenuOpen.value = false;
	if (returnFocus) appMenuTrigger.value?.focus();
}

function showAbout(): void {
	closeAppMenu();
	settingsDialogOpen.value = false;
	aboutDialogOpen.value = true;
}

function showSettings(): void {
	closeAppMenu();
	aboutDialogOpen.value = false;
	settingsDialogOpen.value = true;
}

function toggleNewMenu(): void {
	appMenuOpen.value = false;
	newMenuOpen.value = !newMenuOpen.value;
}

async function undoActive(): Promise<void> {
	try {
		await activeTab.value?.editor?.undo?.();
	} catch (cause) {
		reportError(cause);
	}
}

async function redoActive(): Promise<void> {
	try {
		await activeTab.value?.editor?.redo?.();
	} catch (cause) {
		reportError(cause);
	}
}

async function saveActive(): Promise<void> {
	const tab = activeTab.value;
	if (!tab?.editor?.save || saving.value) return;
	saving.value = true;
	error.value = "";
	try {
		clearAutosaveTimer(tab.id);
		await autosaveOperations.get(tab.id);
		const blob = await tab.editor.save();
		await persistAutosave(tab, blob, revisionToken(tab.editor.getState().revision));
		await saveBlobWithHost(blob, tab.fileName);
		mobileMoreOpen.value = false;
	} catch (cause) {
		reportError(cause);
	} finally {
		saving.value = false;
	}
}

async function openActiveSearch(): Promise<void> {
	error.value = "";
	if (mobileSearchOpen.value) {
		mobileSearchOpen.value = false;
		return;
	}
	closeMobileRibbon();
	mobileMoreOpen.value = false;
	mobileSearchOpen.value = true;
	await nextTick();
	await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	const surface = document.querySelector<HTMLElement>(
		'.harmony-documents__surface[data-active="true"]',
	);
	const selectors = [
		".als-ofs-ui-search-box__input",
		".als-ofs-ui-search-box__compact-trigger",
		'[aria-label*="Search"]',
		'[aria-label*="搜索"]',
		'[aria-label*="查找"]',
		'[title*="Search"]',
		'[title*="搜索"]',
		'[title*="查找"]',
	];
	for (const selector of selectors) {
		const control = surface?.querySelector<HTMLElement>(selector);
		if (control) {
			control.click();
			return;
		}
	}
	mobileSearchOpen.value = false;
	reportError("当前文档格式暂不提供页面内查找。");
}

async function openMobileRibbonTab(tabId?: "home" | "insert"): Promise<void> {
	if (!activeTab.value || !activeMobileEditing.value) return;
	const activeElement = document.activeElement;
	if (activeElement instanceof HTMLElement && activeDocumentSurface()?.contains(activeElement)) {
		activeElement.blur();
	}
	mobileRibbonSection.value = tabId === "insert" ? "insert" : "format";
	mobileRibbonOpen.value = true;
	mobileSearchOpen.value = false;
	mobileMoreOpen.value = false;
	mobileInsertMenuOpen.value = false;
	mobileInsertLinkOpen.value = false;
	await nextTick();
	if (!tabId) return;
	const surface = document.querySelector<HTMLElement>(
		'.harmony-documents__surface[data-active="true"]',
	);
	const tab = surface?.querySelector<HTMLButtonElement>(
		`[data-ribbon-tab="${CSS.escape(tabId)}"]`,
	);
	if (tab && tab.getAttribute("aria-selected") !== "true") tab.click();
}

function closeMobileRibbon(): void {
	mobileRibbonOpen.value = false;
}

function activeDocumentSurface(): HTMLElement | null {
	return document.querySelector<HTMLElement>('.harmony-documents__surface[data-active="true"]');
}

function activeDocxEditor(): MobileDocxEditor | null {
	const exposed = activeTab.value?.editor?.exposed;
	if (!exposed || typeof exposed !== "object") return null;
	const editor = exposed as Partial<MobileDocxEditor>;
	return typeof editor.applyTextFormat === "function" &&
		typeof editor.applyParagraphFormat === "function" &&
		typeof editor.insertPicture === "function" &&
		typeof editor.focus === "function" &&
		typeof editor.setSelection === "function" &&
		typeof editor.writePort?.dispatchCommand === "function" &&
		typeof editor.editor?.getSelectionFormat === "function"
		? (editor as MobileDocxEditor)
		: null;
}

function activeMarkdownEditor(): MobileMarkdownEditor | null {
	const exposed = activeTab.value?.editor?.exposed;
	if (!exposed || typeof exposed !== "object") return null;
	const editor = exposed as Partial<MobileMarkdownEditor>;
	return typeof editor.getSelection === "function" &&
		typeof editor.setSelection === "function" &&
		typeof editor.apply === "function" &&
		typeof editor.focus === "function"
		? (editor as MobileMarkdownEditor)
		: null;
}

function refocusMobileMarkdownEditor(editor: MobileMarkdownEditor): void {
	requestAnimationFrame(() => {
		editor.focus();
		mobileTextEditing.value = true;
		syncMobileImeInset();
	});
}

function runMobileMarkdownTextFormat(mark: "bold" | "italic" | "code" | "link"): void {
	const editor = activeMarkdownEditor();
	if (!editor) {
		reportError("Markdown 编辑器仍在准备，请稍后重试。");
		return;
	}
	const range = editor.getSelection();
	editor.apply(
		{
			type: "formatText",
			range: { start: range.start, end: range.end },
			mark,
			...(mark === "link" ? { href: "https://" } : {}),
		},
		{ origin: "user", selection: range },
	);
	refocusMobileMarkdownEditor(editor);
}

function insertMobileMarkdownBlock(block: "heading" | "bullet-list"): void {
	const editor = activeMarkdownEditor();
	if (!editor) {
		reportError("Markdown 编辑器仍在准备，请稍后重试。");
		return;
	}
	const selection = editor.getSelection();
	editor.apply(
		{
			type: "insertBlock",
			offset: selection.start,
			block,
			...(block === "heading" ? { level: 2 } : {}),
		},
		{ origin: "user", selection },
	);
	refocusMobileMarkdownEditor(editor);
}

function addMobilePptxSlide(): void {
	const addButton = activeDocumentSurface()?.querySelector<HTMLButtonElement>(
		".als-ofs-pptx-mobile-slide-controls__add button",
	);
	if (!addButton) {
		reportError("演示文稿仍在准备，请稍后重试。");
		return;
	}
	addButton.click();
}

function mobilePptxCommand(labels: readonly string[]): HTMLElement | null {
	const insertGroup = activeDocumentSurface()?.querySelector<HTMLElement>(
		'[data-ribbon-group="insert"]',
	);
	if (!insertGroup) return null;
	for (const label of labels) {
		const control = insertGroup.querySelector<HTMLElement>(
			`[aria-label="${CSS.escape(label)}"], [title="${CSS.escape(label)}"]`,
		);
		if (control) return control;
	}
	return null;
}

function setMobilePptxView(mode: "all" | "single"): boolean {
	const surface = activeDocumentSurface();
	const button =
		mode === "all"
			? surface?.querySelector<HTMLButtonElement>(
					'[title="幻灯片浏览视图"], [title="Slide Sorter View"], .als-ofs-pptx-mobile-slide-controls [aria-label="显示所有幻灯片"], .als-ofs-pptx-mobile-slide-controls [aria-label="Show all slides"]',
				)
			: surface?.querySelector<HTMLButtonElement>(
					'[title="普通视图"], [title="Normal View"]',
				);
	if (!button) return false;
	button.click();
	mobilePptxSingleView.value = mode === "single";
	mobilePptxGesture = undefined;
	return true;
}

function showMobilePptxSlides(): void {
	if (!setMobilePptxView("all")) reportError("幻灯片导航仍在准备，请稍后重试。");
}

async function showMobilePptxOverview(
	tab: HarmonyDocumentTab | null = activeTab.value,
): Promise<void> {
	if (
		!mobileLayout.value ||
		!tab ||
		tab.id !== activeId.value ||
		tab.format !== "pptx" ||
		tab.mobileMode !== "reading" ||
		!mobilePortrait.value ||
		mobilePptxViewing.value
	)
		return;
	try {
		await tab.editor?.ready();
		await nextTick();
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		if (tab.id === activeId.value && tab.mobileMode === "reading") setMobilePptxView("all");
	} catch {
		// Loading and import errors are already surfaced by the presentation editor.
	}
}

function stepMobilePptxSlide(direction: MobilePptxSlideDirection, animate = true): void {
	if (mobilePptxSlideSettling) return;
	const labels =
		direction === "previous"
			? ["上一张幻灯片", "Previous slide"]
			: ["下一张幻灯片", "Next slide"];
	const button = labels
		.map((label) =>
			activeDocumentSurface()?.querySelector<HTMLButtonElement>(
				`.als-ofs-pptx-mobile-slide-controls [aria-label="${CSS.escape(label)}"]`,
			),
		)
		.find(Boolean);
	if (!button || button.disabled) return;
	button.click();
	if (animate) animateMobilePptxSlideEntry(direction);
}

let mobilePptxSlideAnimationToken = 0;

function animateMobilePptxSlideEntry(direction: MobilePptxSlideDirection): void {
	if (!mobilePptxViewing.value) return;
	const token = ++mobilePptxSlideAnimationToken;
	requestAnimationFrame(() => {
		if (token !== mobilePptxSlideAnimationToken) return;
		const frame = activeDocumentSurface()?.querySelector<HTMLElement>(
			'#dropzone[data-editor-view="single"] .als-ofs-pptx-slide-frame[data-editor-active-slide="true"]',
		);
		if (!frame) return;
		frame.classList.remove(
			"harmony-pptx-slide-enter-from-left",
			"harmony-pptx-slide-enter-from-right",
		);
		// Restart the directional animation when users switch repeatedly before the
		// previous transition finishes. This keeps rapid swipes responsive.
		void frame.offsetWidth;
		const animationClass =
			direction === "next"
				? "harmony-pptx-slide-enter-from-right"
				: "harmony-pptx-slide-enter-from-left";
		frame.classList.add(animationClass);
		frame.addEventListener(
			"animationend",
			() => {
				if (token === mobilePptxSlideAnimationToken) frame.classList.remove(animationClass);
			},
			{ once: true },
		);
	});
}

function mobilePptxZoomControls(): HTMLElement | null {
	return (
		activeDocumentSurface()?.querySelector<HTMLElement>(".als-ofs-pptx-mobile-zoom-controls") ??
		null
	);
}

function syncMobilePptxZoomLabel(): void {
	mobilePptxZoomLabel.value =
		mobilePptxZoomControls()
			?.querySelector<HTMLElement>(".als-ofs-pptx-mobile-zoom-controls__output")
			?.textContent?.trim() || "100%";
}

function bindMobilePptxZoomObserver(): void {
	mobilePptxZoomObserver?.disconnect();
	mobilePptxZoomObserver = undefined;
	const output = mobilePptxZoomControls()?.querySelector<HTMLElement>(
		".als-ofs-pptx-mobile-zoom-controls__output",
	);
	if (!output) return;
	syncMobilePptxZoomLabel();
	mobilePptxZoomObserver = new MutationObserver(syncMobilePptxZoomLabel);
	mobilePptxZoomObserver.observe(output, { characterData: true, childList: true, subtree: true });
}

function runMobilePptxZoom(command: "in" | "out" | "fit"): void {
	const controls = mobilePptxZoomControls();
	if (!controls) return;
	const target =
		command === "fit"
			? controls.querySelector<HTMLButtonElement>(
					".als-ofs-pptx-mobile-zoom-controls__output",
				)
			: controls.querySelector<HTMLButtonElement>(
					command === "in"
						? '[aria-label="放大"], [aria-label="Zoom in"]'
						: '[aria-label="缩小"], [aria-label="Zoom out"]',
				);
	target?.click();
	requestAnimationFrame(syncMobilePptxZoomLabel);
}

async function startMobilePptxViewing(): Promise<void> {
	const tab = activeTab.value;
	if (!mobileLayout.value || !tab || tab.format !== "pptx" || tab.mobileMode !== "reading")
		return;
	closeMobileRibbon();
	mobileSearchOpen.value = false;
	mobileMoreOpen.value = false;
	activityOpen.value = false;
	setMobilePptxView("single");
	mobilePptxViewing.value = true;
	mobilePptxSingleView.value = true;
	mobilePptxGesture = undefined;
	await nextTick();
	bindMobilePptxZoomObserver();
	await setMobilePresentationLandscape(true);
}

function stopMobilePptxViewing(): void {
	mobilePptxViewing.value = false;
	mobilePptxSlideAnimationToken += 1;
	mobilePptxZoomObserver?.disconnect();
	mobilePptxZoomObserver = undefined;
	if (mobilePptxGesture?.slideDrag) clearMobilePptxSlideDrag(mobilePptxGesture.slideDrag);
	if (mobilePptxSettlingDrag) clearMobilePptxSlideDrag(mobilePptxSettlingDrag);
	mobilePptxGesture = undefined;
	mobilePptxSettlingDrag = undefined;
	mobilePptxSlideSettling = false;
	mobilePptxSlideSettleToken += 1;
	void setMobilePresentationLandscape(false);
	void nextTick(() => showMobilePptxOverview(activeTab.value));
}

function prepareMobilePptxSlideDrag(
	gesture: MobilePptxGesture,
	direction: MobilePptxSlideDirection,
): MobilePptxSlideDrag | undefined {
	const frames = Array.from(
		activeDocumentSurface()?.querySelectorAll<HTMLElement>(
			'#dropzone[data-editor-view="single"] .als-ofs-pptx-slide-frame',
		) ?? [],
	);
	const currentIndex = frames.findIndex((frame) => frame.dataset.editorActiveSlide === "true");
	const currentFrame = frames[currentIndex];
	if (!currentFrame) return undefined;
	const adjacentFrame = frames[currentIndex + (direction === "next" ? 1 : -1)] ?? null;
	const currentRect = currentFrame.getBoundingClientRect();
	const drag: MobilePptxSlideDrag = {
		direction,
		currentFrame,
		adjacentFrame,
		adjacentWasHidden: adjacentFrame?.hidden ?? true,
		adjacentAriaHidden: adjacentFrame?.getAttribute("aria-hidden") ?? null,
		// Use one viewport at fitted zoom, but keep enlarged slides from visually
		// overlapping while the next/previous page enters beside them.
		travel: Math.max(gesture.viewport.clientWidth, currentRect.width + 16, 1),
	};
	currentFrame.classList.remove(
		"harmony-pptx-slide-enter-from-left",
		"harmony-pptx-slide-enter-from-right",
	);
	currentFrame.classList.add("harmony-pptx-slide-drag-current");
	if (adjacentFrame) {
		adjacentFrame.hidden = false;
		adjacentFrame.setAttribute("aria-hidden", "true");
		adjacentFrame.classList.add("harmony-pptx-slide-drag-adjacent");
		adjacentFrame.style.setProperty("--harmony-pptx-drag-left", `${currentRect.left}px`);
		adjacentFrame.style.setProperty("--harmony-pptx-drag-top", `${currentRect.top}px`);
		adjacentFrame.style.setProperty("--harmony-pptx-drag-width", `${currentRect.width}px`);
		adjacentFrame.style.setProperty("--harmony-pptx-drag-height", `${currentRect.height}px`);
		adjacentFrame.style.setProperty(
			"--harmony-pptx-drag-origin",
			`${direction === "next" ? drag.travel : -drag.travel}px`,
		);
	}
	return drag;
}

function setMobilePptxSlideDragOffset(
	drag: MobilePptxSlideDrag,
	offset: number,
	settling = false,
): void {
	const visibleOffset = drag.adjacentFrame ? offset : offset * 0.22;
	for (const frame of [drag.currentFrame, drag.adjacentFrame]) {
		if (!frame) continue;
		frame.classList.toggle("is-settling", settling);
		frame.style.setProperty("--harmony-pptx-drag-x", `${visibleOffset}px`);
	}
}

function clearMobilePptxSlideDrag(drag: MobilePptxSlideDrag, restoreAdjacent = true): void {
	for (const frame of [drag.currentFrame, drag.adjacentFrame]) {
		if (!frame) continue;
		frame.classList.remove(
			"harmony-pptx-slide-drag-current",
			"harmony-pptx-slide-drag-adjacent",
			"is-settling",
		);
		for (const property of [
			"--harmony-pptx-drag-x",
			"--harmony-pptx-drag-origin",
			"--harmony-pptx-drag-left",
			"--harmony-pptx-drag-top",
			"--harmony-pptx-drag-width",
			"--harmony-pptx-drag-height",
		])
			frame.style.removeProperty(property);
	}
	if (!drag.adjacentFrame) return;
	if (restoreAdjacent) drag.adjacentFrame.hidden = drag.adjacentWasHidden;
	if (drag.adjacentAriaHidden == null) drag.adjacentFrame.removeAttribute("aria-hidden");
	else drag.adjacentFrame.setAttribute("aria-hidden", drag.adjacentAriaHidden);
}

function settleMobilePptxSlideDrag(drag: MobilePptxSlideDrag, commit: boolean): void {
	const token = ++mobilePptxSlideSettleToken;
	mobilePptxSlideSettling = true;
	mobilePptxSettlingDrag = drag;
	const target = commit ? (drag.direction === "next" ? -drag.travel : drag.travel) : 0;
	setMobilePptxSlideDragOffset(drag, target, true);
	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	window.setTimeout(
		() => {
			if (token !== mobilePptxSlideSettleToken) return;
			mobilePptxSlideSettling = false;
			mobilePptxSettlingDrag = undefined;
			if (commit) stepMobilePptxSlide(drag.direction, false);
			clearMobilePptxSlideDrag(drag, !commit);
		},
		reducedMotion ? 0 : 190,
	);
}

function beginMobilePptxSwipe(event: PointerEvent): void {
	const tab = activeTab.value;
	if (!mobileLayout.value || tab?.format !== "pptx" || tab.mobileMode !== "reading") return;
	if (mobilePptxSlideSettling) return;
	if (event.pointerType === "mouse" && event.button !== 0) return;
	if (
		!(event.target instanceof Element) ||
		event.target.closest("button, input, select, a") ||
		!activeDocumentSurface()?.querySelector("#dropzone[data-editor-view='single']")
	)
		return;
	const viewport = event.target.closest<HTMLElement>("[data-stage-region='viewer']");
	if (!viewport) return;
	if (mobilePptxGesture) {
		mobilePptxGesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		mobilePptxGesture.pinching = mobilePptxGesture.pointers.size >= 2;
		if (mobilePptxGesture.pinching && mobilePptxGesture.slideDrag) {
			clearMobilePptxSlideDrag(mobilePptxGesture.slideDrag);
			mobilePptxGesture.slideDrag = undefined;
		}
		return;
	}
	const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
	mobilePptxGesture = {
		primaryId: event.pointerId,
		pointers: new Map([[event.pointerId, { x: event.clientX, y: event.clientY }]]),
		startX: event.clientX,
		startY: event.clientY,
		startTime: performance.now(),
		startScrollLeft: viewport.scrollLeft,
		startScrollTop: viewport.scrollTop,
		startAtLeft: viewport.scrollLeft <= 2,
		startAtRight: viewport.scrollLeft >= maxScrollLeft - 2,
		viewport,
		pinching: false,
		moved: false,
	};
}

function updateMobilePptxSwipe(event: PointerEvent): void {
	const gesture = mobilePptxGesture;
	if (!gesture || !gesture.pointers.has(event.pointerId)) return;
	gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
	if (gesture.pointers.size >= 2) {
		gesture.pinching = true;
		return;
	}
	if (gesture.pinching || gesture.primaryId !== event.pointerId) return;
	const dx = event.clientX - gesture.startX;
	const dy = event.clientY - gesture.startY;
	if (Math.hypot(dx, dy) < 8) return;
	gesture.moved = true;
	const viewport = gesture.viewport;
	const canPanX = viewport.scrollWidth > viewport.clientWidth + 2;
	const canPanY = viewport.scrollHeight > viewport.clientHeight + 2;
	if (!gesture.axis) {
		const horizontal = Math.abs(dx) > Math.abs(dy) * 1.15;
		const crossedPageEdge = dx > 0 ? gesture.startAtLeft : gesture.startAtRight;
		gesture.axis =
			mobilePptxViewing.value && horizontal && (!canPanX || crossedPageEdge)
				? "slide"
				: "pan";
	}
	if (gesture.axis === "slide") {
		const direction: MobilePptxSlideDirection = dx < 0 ? "next" : "previous";
		if (gesture.slideDrag?.direction !== direction) {
			if (gesture.slideDrag) clearMobilePptxSlideDrag(gesture.slideDrag);
			gesture.slideDrag = prepareMobilePptxSlideDrag(gesture, direction);
		}
		if (gesture.slideDrag) setMobilePptxSlideDragOffset(gesture.slideDrag, dx);
	} else {
		if (canPanX) viewport.scrollLeft = gesture.startScrollLeft - dx;
		if (canPanY) viewport.scrollTop = gesture.startScrollTop - dy;
	}
	event.preventDefault();
}

function finishMobilePptxSwipe(event: PointerEvent): void {
	const gesture = mobilePptxGesture;
	if (!gesture || !gesture.pointers.has(event.pointerId)) return;
	gesture.pointers.delete(event.pointerId);
	if (gesture.pointers.size > 0) return;
	mobilePptxGesture = undefined;
	if (gesture.pinching || gesture.primaryId !== event.pointerId) return;
	const dx = event.clientX - gesture.startX;
	const dy = event.clientY - gesture.startY;
	if (gesture.slideDrag) {
		const distance = Math.abs(dx);
		const velocity = distance / Math.max(performance.now() - gesture.startTime, 1);
		const threshold = Math.min(120, Math.max(64, gesture.slideDrag.travel * 0.16));
		const commit =
			Boolean(gesture.slideDrag.adjacentFrame) &&
			(distance >= threshold || (distance >= 32 && velocity >= 0.55));
		event.preventDefault();
		settleMobilePptxSlideDrag(gesture.slideDrag, commit);
		return;
	}
	const horizontalSwipe = Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.25;
	if (!horizontalSwipe) return;
	const canPanX = gesture.viewport.scrollWidth > gesture.viewport.clientWidth + 2;
	const crossedPageEdge = dx > 0 ? gesture.startAtLeft : gesture.startAtRight;
	if (canPanX && (!crossedPageEdge || Math.abs(dx) < 72)) return;
	event.preventDefault();
	stepMobilePptxSlide(dx < 0 ? "next" : "previous");
}

function cancelMobilePptxSwipe(event: PointerEvent): void {
	const gesture = mobilePptxGesture;
	if (!gesture) return;
	gesture.pointers.delete(event.pointerId);
	if (gesture.pointers.size !== 0) return;
	if (gesture.slideDrag) clearMobilePptxSlideDrag(gesture.slideDrag);
	mobilePptxGesture = undefined;
}

function addMobilePptxTextBox(): void {
	const control = mobilePptxCommand(["文本框", "Text Box"]);
	if (!control) {
		reportError("文本框工具仍在准备，请稍后重试。");
		return;
	}
	control.click();
}

function openMobilePptxImagePicker(): void {
	const imageInput = activeDocumentSurface()?.querySelector<HTMLInputElement>(
		'[data-ribbon-group="insert"] input[type="file"][accept*="image"]',
	);
	if (!imageInput) {
		reportError("图片工具仍在准备，请稍后重试。");
		return;
	}
	imageInput.click();
}

async function openMobilePptxShapePicker(): Promise<void> {
	await openMobileRibbonTab("insert");
	const control = mobilePptxCommand(["插入形状", "Insert shape"]);
	if (!control) {
		reportError("形状工具仍在准备，请稍后重试。");
		return;
	}
	control.click();
}

function runMobileDocxTextFormat(command: "bold" | "italic" | "underline"): void {
	const editor = activeDocxEditor();
	if (!editor) {
		reportError("Word 编辑器仍在准备，请稍后重试。");
		return;
	}
	const selection = editor.getSelection();
	if (!selection || selection.kind !== "text") {
		reportError("请先将光标放入正文，或选择需要设置格式的文字。");
		return;
	}
	const current = editor.editor.getSelectionFormat();
	if (command === "bold") editor.applyTextFormat({ bold: current.bold !== true });
	else if (command === "italic") editor.applyTextFormat({ italic: current.italic !== true });
	else {
		editor.applyTextFormat({
			underline: current.underline === "single" ? "none" : "single",
		});
	}
}

function toggleMobileDocxBulletList(): void {
	const editor = activeDocxEditor();
	if (!editor) {
		reportError("Word 编辑器仍在准备，请稍后重试。");
		return;
	}
	const selection = editor.getSelection();
	if (!selection || selection.kind !== "text") {
		reportError("请先将光标放入正文，或选择需要设置的段落。");
		return;
	}
	const current = editor.editor.getSelectionFormat();
	editor.applyParagraphFormat({ listType: current.listType === "bullet" ? null : "bullet" });
}

function closeMobileInsertMenu(): void {
	mobileInsertMenuOpen.value = false;
	mobileInsertLinkOpen.value = false;
	mobileInsertLinkUrl.value = "";
}

function openMobileInsertMenu(): void {
	if (activeTab.value?.format !== "docx") {
		void openMobileRibbonTab("insert");
		return;
	}
	dismissMobileKeyboard();
	closeMobileRibbon();
	mobileSearchOpen.value = false;
	mobileMoreOpen.value = false;
	mobileInsertMenuOpen.value = true;
}

function mobileDocxLastParagraphSelection(editor: MobileDocxEditor): MobileDocxSelection | null {
	const paragraphs = Array.from(
		activeDocumentSurface()?.querySelectorAll<HTMLElement>(
			".als-ofs-docx-word-paragraph[data-word-block-id]",
		) ?? [],
	);
	const paragraph = paragraphs.at(-1);
	const blockId = paragraph?.dataset.wordBlockId;
	if (!blockId) return null;
	const parsedOffset = Number(paragraph.dataset.wordOffsetEnd);
	const inlineEndOffsets = Array.from(
		paragraph.querySelectorAll<HTMLElement>("[data-word-inline-offset-end]"),
	).map((inline) => Number(inline.dataset.wordInlineOffsetEnd));
	const finalInlineOffset = Math.max(0, ...inlineEndOffsets.filter(Number.isFinite));
	const offset = Number.isFinite(parsedOffset) ? parsedOffset : finalInlineOffset;
	return editor.setSelection({
		kind: "text",
		anchor: { blockId, offset },
		focus: { blockId, offset },
		isCollapsed: true,
		text: "",
	});
}

function mobileDocxNearestParagraphSelection(
	editor: MobileDocxEditor,
	clientY: number,
): MobileDocxSelection | null {
	const paragraphs = Array.from(
		activeDocumentSurface()?.querySelectorAll<HTMLElement>(
			".als-ofs-docx-word-paragraph[data-word-block-id]",
		) ?? [],
	);
	const paragraph = paragraphs.reduce<HTMLElement | null>((nearest, candidate) => {
		if (!nearest) return candidate;
		const distance = (element: HTMLElement): number => {
			const rect = element.getBoundingClientRect();
			return clientY < rect.top
				? rect.top - clientY
				: clientY > rect.bottom
					? clientY - rect.bottom
					: 0;
		};
		return distance(candidate) < distance(nearest) ? candidate : nearest;
	}, null);
	const blockId = paragraph?.dataset.wordBlockId;
	if (!paragraph || !blockId) return mobileDocxLastParagraphSelection(editor);
	const rect = paragraph.getBoundingClientRect();
	const end = Math.max(
		Number(paragraph.dataset.wordOffsetEnd ?? 0),
		...Array.from(paragraph.querySelectorAll<HTMLElement>("[data-word-inline-offset-end]")).map(
			(inline) => Number(inline.dataset.wordInlineOffsetEnd ?? 0),
		),
	);
	const offset = clientY <= rect.top + rect.height / 2 ? 0 : end;
	return editor.setSelection({
		kind: "text",
		anchor: { blockId, offset },
		focus: { blockId, offset },
		isCollapsed: true,
		text: "",
	});
}

function ensureMobileDocxTextSelection(editor: MobileDocxEditor): MobileDocxSelection | null {
	const current = editor.getSelection();
	return current?.kind === "text" ? current : mobileDocxLastParagraphSelection(editor);
}

function mobileDocxTextSelection(): {
	editor: MobileDocxEditor;
	selection: MobileDocxSelection;
} | null {
	const editor = activeDocxEditor();
	const selection = editor ? ensureMobileDocxTextSelection(editor) : null;
	if (!editor || !selection || selection.kind !== "text") {
		reportError("请先将光标放入正文，或选择需要处理的文字。");
		return null;
	}
	return { editor, selection };
}

function applyMobileDocxStyle(styleId: "Normal" | `Heading${1 | 2 | 3}` | "Quote"): void {
	const context = mobileDocxTextSelection();
	if (!context) return;
	context.editor.applyParagraphFormat({ styleId });
	closeMobileInsertMenu();
}

function toggleMobileDocxList(listType: "bullet" | "decimal"): void {
	const context = mobileDocxTextSelection();
	if (!context) return;
	const current = context.editor.editor.getSelectionFormat();
	context.editor.applyParagraphFormat({
		listType: current.listType === listType ? null : listType,
	});
	closeMobileInsertMenu();
}

function insertMobileDocxTable(): void {
	const context = mobileDocxTextSelection();
	if (!context) return;
	context.editor.writePort.dispatchCommand({
		type: "table.insert",
		at: context.selection.anchor,
		rows: 2,
		columns: 2,
	});
	closeMobileInsertMenu();
}

function insertMobileDocxPageBreak(): void {
	const context = mobileDocxTextSelection();
	if (!context) return;
	context.editor.writePort.dispatchCommand({
		type: "break.insert",
		at: context.selection.anchor,
		breakType: "page",
	});
	closeMobileInsertMenu();
}

function insertMobileDocxHorizontalLine(): void {
	const context = mobileDocxTextSelection();
	if (!context) return;
	context.editor.writePort.dispatchCommand({
		type: "horizontalLine.insert",
		afterBlockId: context.selection.anchor.blockId,
	});
	closeMobileInsertMenu();
}

async function openMobileDocxLink(): Promise<void> {
	const context = mobileDocxTextSelection();
	if (!context) return;
	if (context.selection.isCollapsed !== false) {
		reportError("请先选择要添加链接的文字。");
		return;
	}
	mobileInsertLinkOpen.value = true;
	await nextTick();
	document.querySelector<HTMLInputElement>(".harmony-mobile-insert-link input")?.focus();
}

function submitMobileDocxLink(): void {
	const context = mobileDocxTextSelection();
	if (!context) return;
	const raw = mobileInsertLinkUrl.value.trim();
	if (!raw) {
		reportError("请输入链接地址。");
		return;
	}
	const url = /^[a-z][a-z\d+.-]*:/iu.test(raw) ? raw : `https://${raw}`;
	try {
		new URL(url);
	} catch {
		reportError("链接地址格式不正确。");
		return;
	}
	context.editor.writePort.dispatchCommand({ type: "link.add", range: context.selection, url });
	closeMobileInsertMenu();
}

function openMobileDocxImagePicker(): void {
	const context = mobileDocxTextSelection();
	if (!context) return;
	pendingMobileDocxImagePosition = { ...context.selection.anchor };
	mobileDocxImageInput.value?.click();
}

async function insertSelectedMobileDocxImages(event: Event): Promise<void> {
	const input = event.currentTarget as HTMLInputElement;
	const files = Array.from(input.files ?? []).filter((file) => file.type.startsWith("image/"));
	input.value = "";
	if (!files.length) return;
	const editor = activeDocxEditor();
	let at = pendingMobileDocxImagePosition ?? editor?.getSelection()?.anchor ?? null;
	pendingMobileDocxImagePosition = null;
	if (!editor || !at) {
		reportError("无法确定图片插入位置，请重新将光标放入正文。");
		return;
	}
	try {
		for (const file of files) {
			await editor.insertPicture(file, at, { fileName: file.name, altText: file.name });
			at = editor.getSelection()?.anchor ?? at;
		}
		closeMobileInsertMenu();
	} catch (cause) {
		reportError(cause);
	}
}

function openFullMobileInsertRibbon(): void {
	closeMobileInsertMenu();
	void openMobileRibbonTab("insert");
}

function dismissMobileKeyboard(): void {
	const activeElement = document.activeElement;
	if (activeElement instanceof HTMLElement && activeDocumentSurface()?.contains(activeElement)) {
		activeElement.blur();
	}
	mobileTextEditing.value = false;
	syncMobileImeInset();
}

async function enterMobileEditing(
	tab: HarmonyDocumentTab | null = activeTab.value,
	options: {
		focusText?: boolean;
		clientX?: number;
		clientY?: number;
		markdownSelection?: { start: number; end: number };
	} = {},
): Promise<void> {
	if (!mobileLayout.value || !tab || tab.id !== activeId.value || !optionFor(tab.format).editable)
		return;
	setMobileDocumentMode(tab, "editing");
	closeMobileRibbon();
	mobileSearchOpen.value = false;
	mobileMoreOpen.value = false;
	closeMobileInsertMenu();
	await nextTick();
	await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	if (activeId.value !== tab.id || !options.focusText) return;

	if (tab.format === "markdown") {
		const editor = activeMarkdownEditor();
		if (!editor) return;
		if (options.markdownSelection) {
			editor.setSelection({ ...options.markdownSelection, direction: "none" });
		}
		editor.focus();
		mobileTextEditing.value = true;
		syncMobileImeInset();
		return;
	}
	if (tab.format !== "docx") return;
	const editor = activeDocxEditor();
	if (!editor) return;
	editor.focus();
	const { clientX, clientY } = options;
	const surface = activeDocumentSurface();
	const target =
		clientX === undefined || clientY === undefined
			? null
			: document.elementFromPoint(clientX, clientY);
	const canvas = target?.closest<HTMLElement>(".als-ofs-docx-word-canvas");
	if (target && canvas && surface?.contains(canvas)) {
		const pointerId = 901;
		target.dispatchEvent(
			new PointerEvent("pointerdown", {
				bubbles: true,
				button: 0,
				buttons: 1,
				clientX,
				clientY,
				pointerId,
				pointerType: "touch",
			}),
		);
		target.dispatchEvent(
			new PointerEvent("pointerup", {
				bubbles: true,
				button: 0,
				buttons: 0,
				clientX,
				clientY,
				pointerId,
				pointerType: "touch",
			}),
		);
	}
	requestAnimationFrame(() => {
		if (editor.getSelection()?.kind !== "text" && clientY !== undefined) {
			mobileDocxNearestParagraphSelection(editor, clientY);
		} else if (editor.getSelection()?.kind !== "text") {
			ensureMobileDocxTextSelection(editor);
		}
		editor.focus();
		mobileTextEditing.value = true;
		syncMobileImeInset();
	});
}

function finishMobileEditing(): void {
	const tab = activeTab.value;
	dismissMobileKeyboard();
	closeMobileRibbon();
	mobileSearchOpen.value = false;
	mobileMoreOpen.value = false;
	closeMobileInsertMenu();
	if (!tab || !mobileLayout.value || !optionFor(tab.format).editable) return;
	setMobileDocumentMode(tab, "reading");
	if (tab.format === "pptx") void showMobilePptxOverview(tab);
	void flushAutosaves();
}

function openMobileDocumentOptions(): void {
	if (mobileMoreOpen.value) {
		mobileMoreOpen.value = false;
		return;
	}
	dismissMobileKeyboard();
	closeMobileRibbon();
	mobileSearchOpen.value = false;
	mobileMoreOpen.value = true;
}

function isMobileDocumentTextTarget(target: EventTarget | null): boolean {
	if (!(target instanceof Element) || !mobileLayout.value || !activeMobileEditing.value)
		return false;
	const surface = activeDocumentSurface();
	if (!surface?.contains(target)) return false;
	return Boolean(
		target.closest(
			'[contenteditable="true"][role="textbox"], textarea[data-als-ofs-native-control="editor-surface"]',
		),
	);
}

/**
 * Android WebView implementations do not agree on whether opening the IME
 * resizes the layout viewport or only the visual viewport. In the latter case
 * the grid's bottom row remains behind the keyboard. Publish just that covered
 * distance so CSS can lift the Word input toolbar without moving it on hosts
 * that already honour adjustResize.
 */
function syncMobileImeInset(): void {
	if (mobileImeSyncFrame !== undefined) cancelAnimationFrame(mobileImeSyncFrame);
	mobileImeSyncFrame = requestAnimationFrame(() => {
		mobileImeSyncFrame = undefined;
		const viewport = window.visualViewport;
		const editingTextDocument =
			mobileLayout.value &&
			(activeTab.value?.format === "docx" || activeTab.value?.format === "markdown") &&
			(mobileTextEditing.value || isMobileDocumentTextTarget(document.activeElement));
		if (!viewport || !editingTextDocument) {
			document.documentElement.style.setProperty("--harmony-mobile-ime-inset", "0px");
			return;
		}
		const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
		const visibleBottom = viewport.offsetTop + viewport.height;
		const coveredHeight = Math.max(0, Math.round(layoutHeight - visibleBottom));
		// Ignore small browser/system-bar movements. A software keyboard covers a
		// materially larger part of a phone viewport.
		const imeInset = coveredHeight >= 96 ? coveredHeight : 0;
		document.documentElement.style.setProperty("--harmony-mobile-ime-inset", `${imeInset}px`);
	});
}

function handleMobileFocusIn(event: FocusEvent): void {
	mobileTextEditing.value = isMobileDocumentTextTarget(event.target);
	syncMobileImeInset();
}

function handleMobileFocusOut(): void {
	window.setTimeout(() => {
		mobileTextEditing.value = isMobileDocumentTextTarget(document.activeElement);
		syncMobileImeInset();
	}, 0);
}

function handleMobileDocumentAreaClick(event: MouseEvent, tab: HarmonyDocumentTab): void {
	if (!mobileLayout.value || tab.id !== activeId.value) return;
	const target = event.target;
	if (!(target instanceof Element)) return;
	if (tab.mobileMode === "reading" && tab.format === "pptx" && mobilePptxViewing.value) {
		// The visible presentation controls proxy the hidden native slide navigator.
		// Let those programmatic clicks reach the runtime while blocking canvas edits.
		if (target.closest(".als-ofs-pptx-mobile-slide-controls")) return;
		event.preventDefault();
		event.stopPropagation();
		return;
	}
	if (tab.mobileMode === "reading" && tab.format === "pptx" && !mobilePptxViewing.value) {
		if (target.closest("button, input, select, a")) return;
		// Portrait reading is a continuous vertical deck. A slide tap must not
		// collapse the overview into the desktop-style single-slide canvas.
		event.preventDefault();
		event.stopPropagation();
		return;
	}
	if (
		tab.mobileMode === "reading" &&
		(tab.format === "docx" || tab.format === "markdown") &&
		optionFor(tab.format).editable
	) {
		const textarea = target.closest<HTMLTextAreaElement>(
			"textarea[data-als-ofs-native-control='editor-surface']",
		);
		void enterMobileEditing(tab, {
			focusText: true,
			clientX: event.clientX,
			clientY: event.clientY,
			...(textarea
				? {
						markdownSelection: {
							start: textarea.selectionStart,
							end: textarea.selectionEnd,
						},
					}
				: {}),
		});
		return;
	}
	if (tab.format !== "docx" || tab.mobileMode !== "editing") return;
	if (
		target.closest(
			"button, input, textarea, select, a, [role='dialog'], [data-word-header-footer]",
		)
	)
		return;
	if (
		!target.closest(
			".als-ofs-docx-word-page, .als-ofs-docx-word-canvas__document, .als-ofs-docx-word-canvas__viewport",
		)
	)
		return;
	const editor = activeDocxEditor();
	if (!editor) return;
	const clickedDocumentContent = target.closest(
		"[data-word-block-id], [data-word-inline-offset-start], [data-word-caret-offset]",
	);
	window.setTimeout(() => {
		if (!isMobileDocumentTextTarget(document.activeElement)) editor.focus();
		// A tap on real text/cells already has an accurate browser caret. A tap on
		// the empty remainder of a short page has no DOM text position, so place
		// the caret explicitly at the end of the final paragraph instead of letting
		// contenteditable fall back to the first paragraph or a stale selection.
		if (!clickedDocumentContent) {
			// Focus itself can emit a selectionchange with contenteditable's root as
			// the caret. Let that event settle before publishing the real model range.
			requestAnimationFrame(() => {
				mobileDocxNearestParagraphSelection(editor, event.clientY);
				mobileTextEditing.value = true;
				syncMobileImeInset();
			});
			return;
		}
		mobileTextEditing.value = true;
		syncMobileImeInset();
	}, 0);
}

function handleEditorKeepIme(): void {
	if (!mobileLayout.value || activeTab.value?.format !== "docx" || !isAndroidHost()) return;
	window.auroraHarmonyHost?.keepSoftKeyboard?.();
}

function showMobileHome(): void {
	dismissMobileKeyboard();
	closeMobileRibbon();
	mobileSearchOpen.value = false;
	mobileMoreOpen.value = false;
	closeMobileInsertMenu();
	selectTab(HOME_TAB_ID);
}

/** Android delegates the system Back action here before it closes the Activity. */
function handleNativeBack(): boolean {
	if (mobilePptxViewing.value) {
		stopMobilePptxViewing();
		return true;
	}
	if (mobileInsertMenuOpen.value) {
		closeMobileInsertMenu();
		return true;
	}
	if (mobileMoreOpen.value) {
		mobileMoreOpen.value = false;
		return true;
	}
	if (mobileRibbonOpen.value) {
		closeMobileRibbon();
		return true;
	}
	if (mobileSearchOpen.value) {
		mobileSearchOpen.value = false;
		return true;
	}
	if (activityOpen.value) {
		activityOpen.value = false;
		return true;
	}
	if (
		activeTab.value?.format === "pptx" &&
		activeTab.value.mobileMode === "reading" &&
		activeDocumentSurface()?.querySelector("#dropzone[data-editor-view='single']")
	) {
		setMobilePptxView("all");
		return true;
	}
	if (mobileTextEditing.value || isMobileDocumentTextTarget(document.activeElement)) {
		dismissMobileKeyboard();
		return true;
	}
	if (activeMobileEditing.value) {
		void finishMobileEditing();
		return true;
	}
	if (activeTab.value) {
		showMobileHome();
		return true;
	}
	return false;
}

function syncMobileLayout(event?: MediaQueryListEvent): void {
	mobileLayout.value = event?.matches ?? phoneMediaQuery?.matches ?? false;
	mobilePortrait.value = window.innerHeight >= window.innerWidth;
	for (const tab of tabs.value) refreshTabSurface(tab);
	if (mobileLayout.value) void restoreAutosaves();
	if (!mobileLayout.value) {
		if (mobilePptxViewing.value) stopMobilePptxViewing();
		closeMobileRibbon();
		mobileSearchOpen.value = false;
		mobileMoreOpen.value = false;
	}
}

function syncMobileOrientation(): void {
	mobilePortrait.value = window.innerHeight >= window.innerWidth;
	if (mobilePortrait.value && !mobilePptxViewing.value) {
		void nextTick(() => showMobilePptxOverview(activeTab.value));
	}
}

function handleVisibilityChange(): void {
	if (document.visibilityState === "hidden") void flushAutosaves();
}

interface PendingWindowDrag {
	pointerId: number;
	startX: number;
	startY: number;
}

interface LastWindowClick {
	time: number;
	x: number;
	y: number;
}

let pendingWindowDrag: PendingWindowDrag | null = null;
let lastWindowClick: LastWindowClick | null = null;

function prepareHarmonyWindowMove(event: PointerEvent): void {
	const target = event.target as HTMLElement;
	if (target.closest("button, label, input, [data-no-drag]")) return;
	const previous = lastWindowClick;
	const isDoubleClick =
		previous !== null &&
		event.timeStamp - previous.time <= 400 &&
		Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 6;
	if (isDoubleClick) {
		lastWindowClick = null;
		pendingWindowDrag = null;
		event.preventDefault();
		toggleHarmonyWindowMaximize();
		return;
	}
	lastWindowClick = {
		time: event.timeStamp,
		x: event.clientX,
		y: event.clientY,
	};
	pendingWindowDrag = {
		pointerId: event.pointerId,
		startX: event.clientX,
		startY: event.clientY,
	};
	(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function moveHarmonyWindow(event: PointerEvent): void {
	const pending = pendingWindowDrag;
	if (!pending || pending.pointerId !== event.pointerId) return;
	if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) < 4) return;
	pendingWindowDrag = null;
	(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
	startHarmonyWindowMove();
}

function cancelHarmonyWindowMove(event: PointerEvent): void {
	if (pendingWindowDrag?.pointerId !== event.pointerId) return;
	pendingWindowDrag = null;
	const header = event.currentTarget as HTMLElement;
	if (header.hasPointerCapture(event.pointerId)) header.releasePointerCapture(event.pointerId);
}

onMounted(() => {
	document.addEventListener("pointerdown", closeMenus);
	document.addEventListener("focusin", handleMobileFocusIn);
	document.addEventListener("focusout", handleMobileFocusOut);
	window.addEventListener("als-office-editor-keep-ime", handleEditorKeepIme);
	phoneMediaQuery = window.matchMedia(
		"(max-width: 600px), (max-height: 600px) and (pointer: coarse)",
	);
	syncMobileLayout();
	document.addEventListener("visibilitychange", handleVisibilityChange);
	window.addEventListener("pagehide", flushAutosaves);
	window.addEventListener("aurora-native-document", handleNativeDocument);
	phoneMediaQuery.addEventListener("change", syncMobileLayout);
	window.visualViewport?.addEventListener("resize", syncMobileImeInset);
	window.visualViewport?.addEventListener("scroll", syncMobileImeInset);
	window.addEventListener("resize", syncMobileImeInset);
	window.addEventListener("resize", syncMobileOrientation);
	window.auroraHandleBack = handleNativeBack;
	setUiEditorFileSink(async ({ blob, fileName: outputName, intent }) => {
		saving.value = true;
		error.value = "";
		try {
			const tab = activeTab.value;
			if (mobileLayout.value && tab?.editor && intent !== "export") {
				await persistAutosave(tab, blob, revisionToken(tab.editor.getState().revision));
			}
			await saveBlobWithHost(blob, outputName);
		} catch (cause) {
			reportError(cause);
			throw cause;
		} finally {
			saving.value = false;
		}
	});
	void consumePendingNativeIntent();
});

onBeforeUnmount(() => {
	mobilePptxZoomObserver?.disconnect();
	mobilePptxZoomObserver = undefined;
	if (mobilePptxGesture?.slideDrag) clearMobilePptxSlideDrag(mobilePptxGesture.slideDrag);
	if (mobilePptxSettlingDrag) clearMobilePptxSlideDrag(mobilePptxSettlingDrag);
	mobilePptxSlideSettleToken += 1;
	document.removeEventListener("pointerdown", closeMenus);
	document.removeEventListener("focusin", handleMobileFocusIn);
	document.removeEventListener("focusout", handleMobileFocusOut);
	window.removeEventListener("als-office-editor-keep-ime", handleEditorKeepIme);
	document.removeEventListener("visibilitychange", handleVisibilityChange);
	window.removeEventListener("pagehide", flushAutosaves);
	window.removeEventListener("aurora-native-document", handleNativeDocument);
	phoneMediaQuery?.removeEventListener("change", syncMobileLayout);
	phoneMediaQuery = undefined;
	window.visualViewport?.removeEventListener("resize", syncMobileImeInset);
	window.visualViewport?.removeEventListener("scroll", syncMobileImeInset);
	window.removeEventListener("resize", syncMobileImeInset);
	window.removeEventListener("resize", syncMobileOrientation);
	if (mobilePptxViewing.value) void setMobilePresentationLandscape(false);
	if (mobileImeSyncFrame !== undefined) cancelAnimationFrame(mobileImeSyncFrame);
	document.documentElement.style.removeProperty("--harmony-mobile-ime-inset");
	delete window.auroraHandleBack;
	setUiEditorFileSink(null);
	for (const tab of tabs.value) {
		clearAutosaveTimer(tab.id);
		autosaveUnsubscribers.get(tab.id)?.();
	}
	autosaveUnsubscribers.clear();
	for (const tab of tabs.value) formats.unmount(tab.id);
});
</script>

<template>
	<main
		class="harmony-app"
		:class="{
			'has-document': !homeActive,
			'is-mobile-ribbon-open': mobileRibbonOpen,
			'is-mobile-ribbon-insert': mobileRibbonOpen && mobileRibbonSection === 'insert',
			'is-mobile-search-open': mobileSearchOpen,
			'is-mobile-more-open': mobileMoreOpen,
			'is-mobile-insert-open': mobileInsertMenuOpen,
			'is-pptx-viewing': mobilePptxViewing,
		}"
	>
		<header
			class="harmony-chrome"
			:class="{ 'is-harmony-host': isHarmonyHost() }"
			@pointerdown="prepareHarmonyWindowMove"
			@pointermove="moveHarmonyWindow"
			@pointerup="cancelHarmonyWindowMove"
			@pointercancel="cancelHarmonyWindowMove"
		>
			<span
				ref="appMenuHost"
				class="harmony-app-menu"
				data-no-drag
				@keydown.esc.stop.prevent="closeAppMenu(true)"
			>
				<button
					ref="appMenuTrigger"
					type="button"
					class="harmony-app-menu__trigger"
					:aria-label="`${APP_PROFILE.name} 菜单`"
					aria-haspopup="menu"
					:aria-expanded="appMenuOpen"
					:title="`${APP_PROFILE.name} 菜单`"
					@click="appMenuOpen ? closeAppMenu() : openAppMenu()"
					@keydown.down.prevent="openAppMenu(true)"
				>
					<img class="harmony-chrome__mark" :src="appLogoUrl" alt="" draggable="false" />
				</button>
				<span
					v-if="appMenuOpen"
					ref="appMenu"
					class="harmony-app-menu__menu"
					role="menu"
					:aria-label="APP_PROFILE.name"
				>
					<button type="button" role="menuitem" @click="showAbout">
						关于 {{ APP_PROFILE.name }}
					</button>
					<button type="button" role="menuitem" @click="showSettings">
						<span>系统设置…</span>
						<kbd class="harmony-app-menu__shortcut">Ctrl+,</kbd>
					</button>
				</span>
			</span>
			<strong class="harmony-chrome__brand">{{ APP_PROFILE.name }}</strong>
			<nav class="harmony-tabs" aria-label="打开的文档">
				<button
					type="button"
					class="harmony-tabs__home"
					:data-active="homeActive ? 'true' : undefined"
					:aria-current="homeActive ? 'page' : undefined"
					@click="selectTab(HOME_TAB_ID)"
				>
					<svg viewBox="0 0 16 16" aria-hidden="true">
						<path d="M2.6 7.1 8 2.7l5.4 4.4V13H2.6zM6.4 13V9.4h3.2V13" />
					</svg>
					<span>Home</span>
				</button>
				<div
					v-for="tab in tabs"
					:key="tab.id"
					class="harmony-tabs__tab"
					:data-active="tab.id === activeId ? 'true' : undefined"
					:data-format="tab.format"
				>
					<button
						type="button"
						class="harmony-tabs__select"
						:aria-current="tab.id === activeId ? 'page' : undefined"
						:title="tab.fileName"
						@click="selectTab(tab.id)"
					>
						<span class="harmony-tabs__kind">{{
							optionFor(tab.format).shortLabel
						}}</span>
						<span class="harmony-tabs__name">{{ tab.fileName }}</span>
					</button>
					<button
						type="button"
						class="harmony-tabs__close"
						:aria-label="`关闭 ${tab.fileName}`"
						@click="closeTab(tab.id)"
					>
						×
					</button>
				</div>
			</nav>
			<div class="harmony-chrome__actions">
				<div ref="newMenuHost" class="harmony-new">
					<button
						type="button"
						class="harmony-new__trigger"
						aria-label="新建文档"
						:aria-expanded="newMenuOpen"
						aria-haspopup="menu"
						:disabled="opening"
						@click="toggleNewMenu"
					>
						<svg class="harmony-action-icon" viewBox="0 0 20 20" aria-hidden="true">
							<path d="M5.5 2.75h6l3 3V17.25h-9zM11.5 2.75v3h3M10 8v5M7.5 10.5h5" />
						</svg>
						<span class="harmony-action-label">新建</span>
						<svg class="harmony-new__chevron" viewBox="0 0 12 12" aria-hidden="true">
							<path d="m2.5 4.25 3.5 3.5 3.5-3.5" />
						</svg>
					</button>
					<div v-if="newMenuOpen" class="harmony-new__menu" role="menu">
						<button
							v-for="option in editableFormats"
							:key="option.format"
							type="button"
							role="menuitem"
							:data-format="option.format"
							@click="createDocument(option.format)"
						>
							<span>{{ option.icon }}</span>
							<b>{{ option.label }}</b>
							<small>{{ option.shortLabel }}</small>
						</button>
					</div>
				</div>
				<label
					class="harmony-open"
					:aria-label="opening ? '正在打开文档' : '打开文档'"
					:aria-disabled="opening"
				>
					<svg class="harmony-action-icon" viewBox="0 0 20 20" aria-hidden="true">
						<path d="M2.75 6.25h5l1.5-2h8v11.5H2.75zM2.75 7.75h14.5" />
					</svg>
					<span class="harmony-action-label">{{ opening ? "打开中…" : "打开" }}</span>
					<input type="file" :accept="OPEN_ACCEPT" :disabled="opening" @change="open" />
				</label>
				<button
					type="button"
					class="harmony-ai-toggle"
					:data-active="activityOpen ? 'true' : undefined"
					aria-label="AI 活动"
					:aria-expanded="activityOpen"
					@click="activityOpen = !activityOpen"
				>
					<span class="harmony-ai-toggle__status" aria-hidden="true" />
					<svg class="harmony-action-icon" viewBox="0 0 20 20" aria-hidden="true">
						<path
							d="M10 2.5c.6 3 2.1 4.5 5.1 5.1-3 .6-4.5 2.1-5.1 5.1-.6-3-2.1-4.5-5.1-5.1C7.9 7 9.4 5.5 10 2.5ZM15.4 12.5c.25 1.35.95 2.05 2.3 2.3-1.35.25-2.05.95-2.3 2.3-.25-1.35-.95-2.05-2.3-2.3 1.35-.25 2.05-.95 2.3-2.3Z"
						/>
					</svg>
					<span class="harmony-action-label">AI 活动</span>
				</button>
				<span class="harmony-chrome__badge">
					{{ nativeHostLabel() }}
				</span>
			</div>
			<div
				v-if="activeTab"
				class="harmony-mobile-document-header"
				:class="{
					'is-editing': activeMobileEditing,
					'is-reading': !activeMobileEditing,
				}"
				data-no-drag
			>
				<button type="button" aria-label="返回首页" @click="showMobileHome">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="m14.5 5-7 7 7 7" />
					</svg>
				</button>
				<template v-if="activeMobileEditing">
					<div
						class="harmony-mobile-edit-header__status"
						:data-autosave-state="activeTab.autosaveStatus"
						aria-live="polite"
					>
						<template v-if="mobileTextEditing">{{ mobileEditingStatusLabel }}</template>
						<template v-else>
							<strong>{{ activeTab.fileName }}</strong>
							<small>{{ activeAutosaveLabel }}</small>
						</template>
					</div>
					<div class="harmony-mobile-edit-header__actions">
						<button
							type="button"
							aria-label="撤销"
							@pointerdown.prevent
							@click="undoActive"
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<path d="M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6" />
							</svg>
						</button>
						<button
							type="button"
							aria-label="重做"
							@pointerdown.prevent
							@click="redoActive"
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<path d="m15 7 5 5-5 5m4-5h-8a6 6 0 0 0-6 6" />
							</svg>
						</button>
						<button
							v-if="mobileTextEditing"
							type="button"
							aria-label="更多文档选项"
							:aria-expanded="mobileMoreOpen"
							@pointerdown.prevent
							@click="openMobileDocumentOptions"
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<circle cx="5" cy="12" r="1.4" />
								<circle cx="12" cy="12" r="1.4" />
								<circle cx="19" cy="12" r="1.4" />
							</svg>
						</button>
						<button
							type="button"
							class="is-done"
							aria-label="完成编辑"
							@pointerdown.prevent
							@click="finishMobileEditing"
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<path d="m5 12.5 4.2 4.2L19 7" />
							</svg>
						</button>
					</div>
				</template>
				<template v-else>
					<button
						type="button"
						class="harmony-mobile-document-header__title"
						aria-label="切换文档"
						:aria-expanded="mobileMoreOpen"
						@click="mobileMoreOpen = !mobileMoreOpen"
					>
						<span
							class="harmony-mobile-document-header__format"
							:data-format="activeTab.format"
						>
							{{ optionFor(activeTab.format).shortLabel }}
						</span>
						<span>
							<strong>{{ activeTab.fileName }}</strong>
							<small
								:data-autosave-state="activeTab.autosaveStatus"
								aria-live="polite"
								>{{ saving ? "正在保存到文件…" : mobileReadingStatusLabel }}</small
							>
						</span>
						<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>
					</button>
					<div class="harmony-mobile-document-header__actions">
						<button
							v-if="activeTab.format !== 'pptx'"
							type="button"
							aria-label="查找文档内容"
							:aria-pressed="mobileSearchOpen"
							@click="openActiveSearch"
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<circle cx="11" cy="11" r="6" />
								<path d="m16 16 4 4" />
							</svg>
						</button>
						<button
							v-if="activeTab.format !== 'pptx'"
							type="button"
							:aria-label="activityOpen ? '关闭 AI 活动' : '打开 AI 活动'"
							:aria-pressed="activityOpen"
							@click="activityOpen = !activityOpen"
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<path
									d="M12 3c.7 3.7 2.6 5.6 6.3 6.3-3.7.7-5.6 2.6-6.3 6.3-.7-3.7-2.6-5.6-6.3-6.3C9.4 8.6 11.3 6.7 12 3Zm6 13c.3 1.5 1 2.2 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.3 2.2-1 2.5-2.5Z"
								/>
							</svg>
						</button>
						<button
							v-if="activeTab.format === 'pptx' && mobilePortrait"
							type="button"
							class="is-view-action"
							aria-label="横屏观看"
							@click="startMobilePptxViewing"
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<rect x="3" y="6" width="18" height="12" rx="2" />
								<path d="m8 3-2 2 2 2M16 21l2-2-2-2" />
							</svg>
							<span>横屏</span>
						</button>
						<button
							v-if="activeEditable"
							type="button"
							class="is-edit-action"
							aria-label="编辑文档"
							@click="enterMobileEditing(activeTab)"
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<path d="m5 19 3.7-.8L19 7.9 16.1 5 5.8 15.3 5 19Z" />
								<path d="m14.7 6.4 2.9 2.9" />
							</svg>
							<span>编辑</span>
						</button>
					</div>
				</template>
			</div>
		</header>

		<p v-if="error" class="harmony-feedback" role="alert">{{ error }}</p>

		<div class="harmony-body" :class="{ 'has-activity': activityOpen }">
			<div class="harmony-workspace">
				<section v-show="homeActive" class="harmony-home">
					<div class="harmony-home__hero">
						<span class="harmony-home__eyebrow">与你的 AI 应用协同工作</span>
						<h1>让 AI 助手直接处理你的文档</h1>
						<p>
							连接豆包、Claude、ChatGPT 或其他 AI
							助手，即可处理当前文档中的标题、表格、
							单元格、幻灯片与图形。文件会保留在多标签工作区中。
						</p>
						<div class="harmony-home__actions">
							<button
								type="button"
								class="is-primary"
								@click="createDocument('docx')"
							>
								新建 Word 文档
							</button>
							<label class="harmony-open is-secondary" :aria-disabled="opening">
								<span>{{ opening ? "打开中…" : "打开任意支持文件" }}</span>
								<input
									type="file"
									:accept="OPEN_ACCEPT"
									:disabled="opening"
									@change="open"
								/>
							</label>
						</div>
						<small class="harmony-home__hint">
							支持 DOCX、PPTX、XLSX、VSDX、Markdown、PDF、JMP 与 draw.io 导入。
						</small>
					</div>

					<aside class="harmony-home__documents">
						<header>
							<span><b>打开的文档</b><small>当前会话 · 所有格式</small></span>
							<strong>{{ tabs.length }}</strong>
						</header>
						<button
							v-for="tab in tabs"
							:key="tab.id"
							type="button"
							@click="selectTab(tab.id)"
						>
							<span class="harmony-home__file-icon" :data-format="tab.format">
								{{ optionFor(tab.format).icon }}
							</span>
							<span
								><b>{{ tab.fileName }}</b
								><small>{{ optionFor(tab.format).documentLabel }}</small></span
							>
							<i>打开</i>
						</button>
						<div
							v-if="!tabs.length && !restorableAutosaves.length"
							class="harmony-home__empty"
						>
							<svg viewBox="0 0 48 48" aria-hidden="true">
								<path d="M12 7.5h17l7 7V40.5H12z" />
								<path d="M29 7.5v8h7M18 23h12M18 29h12M18 35h8" />
							</svg>
							<b>还没有打开的文档</b>
							<small>新建一种文件，或从设备中选择支持的格式。</small>
						</div>
						<section
							v-if="restorableAutosaves.length"
							class="harmony-home__history"
							aria-label="历史文档"
						>
							<header>
								<span
									><b>历史文档</b><small>设备自动保存 · 点击继续编辑</small></span
								>
								<strong>{{ restorableAutosaves.length }}</strong>
							</header>
							<button
								v-for="record in restorableAutosaves"
								:key="record.id"
								type="button"
								:disabled="opening"
								@click="restoreHistoricalDocument(record)"
							>
								<span class="harmony-home__file-icon" :data-format="record.format">
									{{ optionFor(record.format).icon }}
								</span>
								<span>
									<b>{{ record.fileName }}</b>
									<small
										>{{ optionFor(record.format).documentLabel }} ·
										{{ historyTimeLabel(record.savedAt) }}</small
									>
								</span>
								<i>{{ opening ? "恢复中…" : "恢复" }}</i>
							</button>
						</section>
					</aside>

					<section
						class="harmony-home__panels"
						:aria-label="welcomePanelCopy.overviewLabel"
					>
						<DesktopWelcomePanel
							:copy="welcomePanelCopy"
							:formats="welcomePanelFormats"
						/>
					</section>
				</section>

				<section v-if="tabs.length" v-show="!homeActive" class="harmony-documents">
					<div
						v-for="tab in tabs"
						v-show="tab.id === activeId"
						:key="tab.id"
						class="harmony-documents__surface"
						:data-active="tab.id === activeId ? 'true' : undefined"
						:data-format="tab.format"
						:data-mobile-mode="mobileLayout ? tab.mobileMode : undefined"
						@click.capture="handleMobileDocumentAreaClick($event, tab)"
						@pointerdown.capture="beginMobilePptxSwipe"
						@pointermove.capture="updateMobilePptxSwipe"
						@pointerup.capture="finishMobilePptxSwipe"
						@pointercancel.capture="cancelMobilePptxSwipe"
					>
						<UiEditorI18nProvider locale="zh-CN">
							<UiRibbonModeProvider :mode="mobileLayout ? 'mobile' : 'desktop'">
								<component
									:is="surfaceBinding(tab).component"
									:ref="surfaceRef(tab)"
									v-bind="surfaceBinding(tab).props"
								/>
							</UiRibbonModeProvider>
						</UiEditorI18nProvider>
					</div>
				</section>
			</div>

			<CliActivityPanel
				v-if="activityOpen"
				language="zh-CN"
				:entries="activityEntries"
				:status="harmonyControlStatus"
				:last-poll="lastActivity"
				:client-id="isHarmonyHost() ? 'xiaoyi' : 'android'"
				:client-label="isHarmonyHost() ? '小艺' : 'Android'"
				:document-open="Boolean(activeTab)"
				:connection-label="
					isHarmonyHost()
						? 'Intents Kit 已就绪'
						: isAndroidHost()
							? 'Android 文件桥接已就绪'
							: '浏览器预览模式'
				"
				:connection-tone="isHarmonyHost() ? 'live' : 'warn'"
				:connection-detail="
					isHarmonyHost()
						? '通过 HarmonyOS Intents Kit 调用'
						: isAndroidHost()
							? '支持系统文件选择、保存与本地自动保存'
							: '未连接移动端原生桥接'
				"
				@clear="activityEntries = []"
				@close="activityOpen = false"
			>
				<template #connect>
					<div v-if="isHarmonyHost()" class="harmony-ai-connect">
						<span class="harmony-ai-connect__badge">小艺 · Intents Kit</span>
						<h3>已接入功能一步达</h3>
						<p>
							小艺可直接打开工作区、AI 活动，并新建 Word、PowerPoint、Excel、 Visio 与
							Markdown 文档。
						</p>
						<ul>
							<li><b>端侧执行器</b><span>已配置</span></li>
							<li><b>JumpFunctionPage</b><span>前台模式</span></li>
							<li><b>小艺开放平台</b><span>上架前注册与审核</span></li>
						</ul>
						<small>
							自然语言修改正文需要在开放平台继续注册带文档参数的自定义意图。
						</small>
					</div>
					<div v-else class="harmony-ai-connect">
						<span class="harmony-ai-connect__badge">Android · Native Bridge</span>
						<h3>本地文档能力已连接</h3>
						<p>可以从系统文件中打开文档、另存编辑结果，并自动恢复尚未导出的修改。</p>
						<ul>
							<li><b>系统文件选择器</b><span>已配置</span></li>
							<li><b>分块保存</b><span>已配置</span></li>
							<li><b>第三方 AI 调用</b><span>待接入 Android Intent</span></li>
						</ul>
					</div>
				</template>
			</CliActivityPanel>
		</div>

		<div
			v-if="mobileRibbonOpen && activeTab"
			class="harmony-mobile-ribbon-scrim"
			aria-hidden="true"
			@click="closeMobileRibbon"
		/>
		<button
			v-if="mobileRibbonOpen && activeTab"
			type="button"
			class="harmony-mobile-ribbon-done"
			@click="closeMobileRibbon"
		>
			完成
		</button>

		<nav
			v-if="activeTab && activeMobileEditing"
			class="harmony-mobile-toolbar"
			:class="{
				'is-input-toolbar': activeTab.format === 'docx' || activeTab.format === 'markdown',
				'is-pptx-toolbar': activeTab.format === 'pptx',
			}"
			aria-label="文档编辑工具"
		>
			<template v-if="activeTab.format === 'docx'">
				<button
					type="button"
					class="has-divider-after"
					aria-label="插入内容"
					@pointerdown.prevent
					@click="openMobileInsertMenu"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<circle cx="12" cy="12" r="8.5" />
						<path d="M12 8v8M8 12h8" />
					</svg>
				</button>
				<button
					type="button"
					aria-label="文字格式"
					@pointerdown.prevent
					@click="openMobileRibbonTab('home')"
				>
					<strong aria-hidden="true">T</strong>
				</button>
				<button
					type="button"
					aria-label="加粗"
					@pointerdown.prevent
					@click="runMobileDocxTextFormat('bold')"
				>
					<strong aria-hidden="true">B</strong>
				</button>
				<button
					type="button"
					aria-label="斜体"
					@pointerdown.prevent
					@click="runMobileDocxTextFormat('italic')"
				>
					<strong class="is-italic" aria-hidden="true">I</strong>
				</button>
				<button
					type="button"
					aria-label="下划线"
					@pointerdown.prevent
					@click="runMobileDocxTextFormat('underline')"
				>
					<strong class="is-underline" aria-hidden="true">U</strong>
				</button>
				<button
					type="button"
					aria-label="项目符号列表"
					@pointerdown.prevent
					@click="toggleMobileDocxBulletList"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<circle cx="5" cy="7" r="1" />
						<circle cx="5" cy="12" r="1" />
						<circle cx="5" cy="17" r="1" />
						<path d="M9 7h10M9 12h10M9 17h10" />
					</svg>
				</button>
				<button
					type="button"
					aria-label="插入图片"
					@pointerdown.prevent
					@click="openMobileDocxImagePicker"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<rect x="4" y="5" width="16" height="14" rx="1.5" />
						<circle cx="9" cy="10" r="1.5" />
						<path d="m6 17 4-4 3 3 2-2 3 3" />
					</svg>
				</button>
				<button
					type="button"
					class="has-divider-before"
					aria-label="收起键盘"
					@pointerdown.prevent
					@click="dismissMobileKeyboard"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<rect x="3.5" y="5" width="17" height="11" rx="1.5" />
						<path d="M7 9h.01M10 9h.01M13 9h.01M16 9h.01M7 12h10m-7 7 2 2 2-2" />
					</svg>
				</button>
			</template>
			<template v-else-if="activeTab.format === 'markdown'">
				<button
					type="button"
					class="has-divider-after"
					aria-label="插入内容"
					@pointerdown.prevent
					@click="openMobileRibbonTab('insert')"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<circle cx="12" cy="12" r="8.5" />
						<path d="M12 8v8M8 12h8" />
					</svg>
				</button>
				<button
					type="button"
					aria-label="完整格式工具"
					@pointerdown.prevent
					@click="openMobileRibbonTab('home')"
				>
					<strong aria-hidden="true">T</strong>
				</button>
				<button
					type="button"
					aria-label="加粗"
					@pointerdown.prevent
					@click="runMobileMarkdownTextFormat('bold')"
				>
					<strong aria-hidden="true">B</strong>
				</button>
				<button
					type="button"
					aria-label="斜体"
					@pointerdown.prevent
					@click="runMobileMarkdownTextFormat('italic')"
				>
					<strong class="is-italic" aria-hidden="true">I</strong>
				</button>
				<button
					type="button"
					aria-label="二级标题"
					@pointerdown.prevent
					@click="insertMobileMarkdownBlock('heading')"
				>
					<strong aria-hidden="true">H</strong>
				</button>
				<button
					type="button"
					aria-label="项目符号列表"
					@pointerdown.prevent
					@click="insertMobileMarkdownBlock('bullet-list')"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<circle cx="5" cy="7" r="1" />
						<circle cx="5" cy="12" r="1" />
						<circle cx="5" cy="17" r="1" />
						<path d="M9 7h10M9 12h10M9 17h10" />
					</svg>
				</button>
				<button
					type="button"
					aria-label="插入链接"
					@pointerdown.prevent
					@click="runMobileMarkdownTextFormat('link')"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="m9.5 14.5 5-5M7 17H6a4 4 0 0 1 0-8h3M17 7h1a4 4 0 1 1 0 8h-3" />
					</svg>
				</button>
				<button
					type="button"
					class="has-divider-before"
					aria-label="收起键盘"
					@pointerdown.prevent
					@click="dismissMobileKeyboard"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<rect x="3.5" y="5" width="17" height="11" rx="1.5" />
						<path d="M7 9h.01M10 9h.01M13 9h.01M16 9h.01M7 12h10m-7 7 2 2 2-2" />
					</svg>
				</button>
			</template>
			<template v-else-if="activeTab.format === 'pptx'">
				<button
					type="button"
					aria-label="幻灯片"
					@pointerdown.prevent
					@click="showMobilePptxSlides"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<rect x="4" y="4" width="6" height="6" rx="1" />
						<rect x="14" y="4" width="6" height="6" rx="1" />
						<rect x="4" y="14" width="6" height="6" rx="1" />
						<rect x="14" y="14" width="6" height="6" rx="1" />
					</svg>
					<span>幻灯片</span>
				</button>
				<button
					type="button"
					aria-label="新增幻灯片"
					@pointerdown.prevent
					@click="addMobilePptxSlide"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<rect x="3.5" y="5" width="17" height="14" rx="2" />
						<path d="M12 8v8M8 12h8" />
					</svg>
					<span>新建</span>
				</button>
				<button
					type="button"
					aria-label="插入文本框"
					@pointerdown.prevent
					@click="addMobilePptxTextBox"
				>
					<strong aria-hidden="true">T</strong>
					<span>文本</span>
				</button>
				<button
					type="button"
					aria-label="插入图片"
					@pointerdown.prevent
					@click="openMobilePptxImagePicker"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<rect x="4" y="5" width="16" height="14" rx="1.5" />
						<circle cx="9" cy="10" r="1.5" />
						<path d="m6 17 4-4 3 3 2-2 3 3" />
					</svg>
					<span>图片</span>
				</button>
				<button
					type="button"
					aria-label="插入形状"
					@pointerdown.prevent
					@click="openMobilePptxShapePicker"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<rect x="4" y="4" width="8" height="8" rx="1.5" />
						<circle cx="16" cy="16" r="4" />
					</svg>
					<span>形状</span>
				</button>
				<button
					type="button"
					aria-label="更多"
					:aria-expanded="mobileMoreOpen"
					@pointerdown.prevent
					@click="openMobileDocumentOptions"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<circle cx="5" cy="12" r="1.2" />
						<circle cx="12" cy="12" r="1.2" />
						<circle cx="19" cy="12" r="1.2" />
					</svg>
					<span>更多</span>
				</button>
			</template>
			<template v-else>
				<button
					type="button"
					:disabled="!activeEditable"
					aria-label="撤销"
					@pointerdown.prevent
					@click="undoActive"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6" />
					</svg>
					<span>撤销</span>
				</button>
				<button
					type="button"
					:disabled="!activeEditable"
					aria-label="重做"
					@click="redoActive"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="m15 7 5 5-5 5m4-5h-8a6 6 0 0 0-6 6" />
					</svg>
					<span>重做</span>
				</button>
				<button
					type="button"
					:disabled="!activeEditable"
					:aria-pressed="mobileRibbonOpen && mobileRibbonSection === 'format'"
					@pointerdown.prevent
					@click="
						mobileRibbonOpen && mobileRibbonSection === 'format'
							? closeMobileRibbon()
							: openMobileRibbonTab('home')
					"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M5 6h14M8 6v12m-3 0h6M14 10h5M14 14h5M14 18h5" />
					</svg>
					<span>{{ mobileFormatLabel }}</span>
				</button>
				<button
					type="button"
					:disabled="!activeEditable"
					aria-label="插入内容"
					:aria-pressed="mobileRibbonOpen && mobileRibbonSection === 'insert'"
					@pointerdown.prevent
					@click="
						mobileRibbonOpen && mobileRibbonSection === 'insert'
							? closeMobileRibbon()
							: openMobileRibbonTab('insert')
					"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
					<span>插入</span>
				</button>
				<button
					type="button"
					:aria-expanded="mobileMoreOpen"
					@click="
						mobileMoreOpen = !mobileMoreOpen;
						closeMobileRibbon();
						mobileSearchOpen = false;
					"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<circle cx="5" cy="12" r="1.2" />
						<circle cx="12" cy="12" r="1.2" />
						<circle cx="19" cy="12" r="1.2" />
					</svg>
					<span>更多</span>
				</button>
			</template>
		</nav>

		<nav v-if="mobilePptxViewing" class="harmony-pptx-viewer-controls" aria-label="横屏观看">
			<button
				type="button"
				aria-label="上一张幻灯片"
				@click="stepMobilePptxSlide('previous')"
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
			</button>
			<button type="button" aria-label="下一张幻灯片" @click="stepMobilePptxSlide('next')">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
			</button>
			<i aria-hidden="true" />
			<button type="button" aria-label="缩小幻灯片" @click="runMobilePptxZoom('out')">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>
			</button>
			<button
				type="button"
				class="is-zoom-value"
				aria-label="适应窗口"
				@click="runMobilePptxZoom('fit')"
			>
				{{ mobilePptxZoomLabel }}
			</button>
			<button type="button" aria-label="放大幻灯片" @click="runMobilePptxZoom('in')">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>
			</button>
			<i aria-hidden="true" />
			<button
				type="button"
				class="is-exit"
				aria-label="退出横屏观看"
				@click="stopMobilePptxViewing"
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
			</button>
		</nav>

		<p
			v-if="
				mobileLayout &&
				activeTab?.format === 'pptx' &&
				activeTab.mobileMode === 'reading' &&
				mobilePptxSingleView &&
				!mobilePptxViewing
			"
			class="harmony-pptx-gesture-hint"
		>
			双指缩放 · 单指移动 · 左右滑动切换
		</p>

		<input
			v-if="activeTab?.format === 'docx'"
			ref="mobileDocxImageInput"
			class="harmony-mobile-image-input"
			type="file"
			accept="image/*"
			multiple
			@change="insertSelectedMobileDocxImages"
		/>

		<div
			v-if="mobileInsertMenuOpen && activeTab?.format === 'docx'"
			class="harmony-mobile-insert-backdrop"
			@click.self="closeMobileInsertMenu"
		>
			<section
				class="harmony-mobile-insert-sheet"
				role="dialog"
				aria-modal="true"
				aria-label="添加内容"
			>
				<header>
					<button type="button" aria-label="关闭添加面板" @click="closeMobileInsertMenu">
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="m6 6 12 12M18 6 6 18" />
						</svg>
					</button>
					<strong>添加</strong>
					<span aria-hidden="true" />
				</header>

				<div class="harmony-mobile-insert-sheet__body">
					<section class="harmony-mobile-insert-section">
						<h3>基础</h3>
						<div class="harmony-mobile-insert-headings" aria-label="段落样式">
							<button type="button" @click="applyMobileDocxStyle('Heading1')">
								<b>H1</b><span>标题 1</span>
							</button>
							<button type="button" @click="applyMobileDocxStyle('Heading2')">
								<b>H2</b><span>标题 2</span>
							</button>
							<button type="button" @click="applyMobileDocxStyle('Heading3')">
								<b>H3</b><span>标题 3</span>
							</button>
							<button type="button" @click="applyMobileDocxStyle('Normal')">
								<b>Aa</b><span>正文</span>
							</button>
						</div>
						<div class="harmony-mobile-insert-grid">
							<button type="button" @click="toggleMobileDocxList('decimal')">
								<span class="harmony-mobile-insert-icon"
									><svg viewBox="0 0 24 24">
										<path
											d="M9 7h11M9 12h11M9 17h11M4 6h1v3M4 12h2l-2 3h2M4 17h2v3H4"
										/></svg
								></span>
								<span>有序列表</span>
							</button>
							<button type="button" @click="toggleMobileDocxList('bullet')">
								<span class="harmony-mobile-insert-icon"
									><svg viewBox="0 0 24 24">
										<circle cx="5" cy="7" r="1" />
										<circle cx="5" cy="12" r="1" />
										<circle cx="5" cy="17" r="1" />
										<path d="M9 7h11M9 12h11M9 17h11" /></svg
								></span>
								<span>无序列表</span>
							</button>
							<button type="button" @click="applyMobileDocxStyle('Quote')">
								<span class="harmony-mobile-insert-icon is-text">“</span
								><span>引用</span>
							</button>
							<button type="button" @click="openMobileDocxLink">
								<span class="harmony-mobile-insert-icon"
									><svg viewBox="0 0 24 24">
										<path
											d="m10 13 4-4m-6 8H6a4 4 0 0 1 0-8h3m7-2h2a4 4 0 0 1 0 8h-3"
										/></svg
								></span>
								<span>链接</span>
							</button>
						</div>
					</section>

					<form
						v-if="mobileInsertLinkOpen"
						class="harmony-mobile-insert-link"
						@submit.prevent="submitMobileDocxLink"
					>
						<label for="mobile-docx-link">链接地址</label>
						<div>
							<input
								id="mobile-docx-link"
								v-model="mobileInsertLinkUrl"
								type="url"
								inputmode="url"
								placeholder="https://example.com"
							/>
							<button type="submit">添加</button>
						</div>
					</form>

					<section class="harmony-mobile-insert-section">
						<h3>常用</h3>
						<div class="harmony-mobile-insert-grid is-common">
							<button type="button" @click="openMobileDocxImagePicker">
								<span class="harmony-mobile-insert-icon is-image"
									><svg viewBox="0 0 24 24">
										<rect x="4" y="5" width="16" height="14" rx="1.5" />
										<circle cx="9" cy="10" r="1.5" />
										<path d="m6 17 4-4 3 3 2-2 3 3" /></svg></span
								><span>图片</span>
							</button>
							<button type="button" @click="insertMobileDocxTable">
								<span class="harmony-mobile-insert-icon is-table"
									><svg viewBox="0 0 24 24">
										<rect x="4" y="5" width="16" height="14" rx="1.5" />
										<path d="M4 10h16M10 5v14" /></svg></span
								><span>表格</span>
							</button>
							<button type="button" @click="insertMobileDocxPageBreak">
								<span class="harmony-mobile-insert-icon is-page"
									><svg viewBox="0 0 24 24">
										<path
											d="M6 3h8l4 4v5M14 3v5h4M5 16h14M5 20h14"
										/></svg></span
								><span>分页符</span>
							</button>
							<button type="button" @click="insertMobileDocxHorizontalLine">
								<span class="harmony-mobile-insert-icon is-line"
									><svg viewBox="0 0 24 24"><path d="M4 12h16" /></svg></span
								><span>分隔线</span>
							</button>
							<button type="button" @click="openFullMobileInsertRibbon">
								<span class="harmony-mobile-insert-icon is-more"
									><svg viewBox="0 0 24 24">
										<circle cx="5" cy="12" r="1" />
										<circle cx="12" cy="12" r="1" />
										<circle cx="19" cy="12" r="1" /></svg></span
								><span>更多功能</span>
							</button>
						</div>
					</section>
				</div>
			</section>
		</div>

		<div
			v-if="mobileMoreOpen && activeTab"
			class="harmony-mobile-sheet-backdrop"
			@click.self="mobileMoreOpen = false"
		>
			<section
				class="harmony-mobile-sheet"
				role="dialog"
				aria-modal="true"
				aria-label="文档选项"
			>
				<header>
					<span
						><strong>文档选项</strong><small>{{ activeTab.fileName }}</small></span
					>
					<button type="button" aria-label="关闭文档选项" @click="mobileMoreOpen = false">
						×
					</button>
				</header>
				<div class="harmony-mobile-sheet__actions">
					<button type="button" @click="openActiveSearch">
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<circle cx="11" cy="11" r="6" />
							<path d="m16 16 4 4" />
						</svg>
						<span>查找</span>
					</button>
					<button
						type="button"
						@click="
							activityOpen = true;
							mobileMoreOpen = false;
						"
					>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path
								d="M12 3c.7 3.7 2.6 5.6 6.3 6.3-3.7.7-5.6 2.6-6.3 6.3-.7-3.7-2.6-5.6-6.3-6.3C9.4 8.6 11.3 6.7 12 3Z"
							/>
						</svg>
						<span>AI 活动</span>
					</button>
					<button type="button" @click="showMobileHome">
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="m4 11 8-7 8 7v9h-6v-6h-4v6H4z" /></svg
						><span>首页</span>
					</button>
					<label class="harmony-mobile-sheet__open">
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="M3 7h7l2-2h9v14H3zM3 9h18" /></svg
						><span>打开</span>
						<input
							type="file"
							:accept="OPEN_ACCEPT"
							:disabled="opening"
							@change="open"
						/>
					</label>
					<button type="button" :disabled="!activeEditable || saving" @click="saveActive">
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="M5 3h12l2 2v16H5zM8 3v6h8V3M8 21v-8h8v8" /></svg
						><span>{{ saving ? "保存中" : "保存" }}</span>
					</button>
					<button
						type="button"
						class="is-danger"
						@click="
							closeTab(activeTab.id);
							mobileMoreOpen = false;
						"
					>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="M6 7h12M9 7V4h6v3m-8 0 1 14h8l1-14M10 11v6m4-6v6" /></svg
						><span>关闭</span>
					</button>
				</div>
				<div class="harmony-mobile-sheet__new">
					<strong>新建文档</strong>
					<div>
						<button
							v-for="option in editableFormats"
							:key="option.format"
							type="button"
							:data-format="option.format"
							@click="
								createDocument(option.format);
								mobileMoreOpen = false;
							"
						>
							<span>{{ option.icon }}</span>
							<small>{{ option.shortLabel }}</small>
						</button>
					</div>
				</div>
				<div class="harmony-mobile-sheet__documents">
					<strong>打开的文档</strong>
					<button
						v-for="tab in tabs"
						:key="tab.id"
						type="button"
						:data-active="tab.id === activeId ? 'true' : undefined"
						@click="
							selectTab(tab.id);
							mobileMoreOpen = false;
						"
					>
						<span :data-format="tab.format">{{
							optionFor(tab.format).shortLabel
						}}</span>
						<b>{{ tab.fileName }}</b>
						<small>{{ tab.id === activeId ? "当前" : "打开" }}</small>
					</button>
				</div>
			</section>
		</div>

		<AboutDialog
			v-if="aboutDialogOpen"
			:app-name="APP_PROFILE.name"
			:about-title="`Office for ${nativeHostLabel()}`"
			:logo-url="appMarkUrl"
			:copy="aboutCopy"
			:is-checking-for-updates="false"
			:auto-update-enabled="false"
			:format-labels="welcomePanelFormats.map((format) => format.label)"
			:version="APP_PROFILE.versionName"
			@close="aboutDialogOpen = false"
		/>

		<SettingsDialog
			v-if="settingsDialogOpen"
			v-model="preferences"
			:copy="settingsCopy"
			:auto-update-enabled="false"
			@close="settingsDialogOpen = false"
		/>
	</main>
</template>
