import { isInfinitePage, pageContentBounds } from "../board.js";
import { preservePigmentIdentity } from "../brushes/pigment.js";
import { NoteColorPicker } from "./color-picker.js";
import {
	listBrushPlugins,
	getBrushPlugin,
	subscribeBrushPlugins,
	brushDefaults,
} from "../brushes.js";
import {
	computed,
	defineComponent,
	h,
	nextTick,
	onBeforeUnmount,
	onMounted,
	ref,
	shallowRef,
	watch,
} from "vue";
import { readNotebookState, writeNotebook, writeXopp } from "../codec.js";
import { nativeNotesFormat } from "../formats.js";
import { bounds, translate, type Bounds, type Point } from "../geometry.js";
import { NoteHistory, type NoteHistoryState } from "../history.js";
import {
	clone,
	createNotebook,
	createPage,
	LIMITS,
	pageElements,
	uid,
	type AnchorSide,
	type NoteScene,
	type MaskingTape,
	type InkElement,
	type InkPoint,
	type InkStroke,
	type InkText,
	type Notebook,
	type PaperStyle,
	type PenStyle,
} from "../model.js";
import { exportNotesPdf } from "../pdf.js";
import { exportNotesImages, exportNotesPagePng } from "../image.js";
import { pageSvgUrl, strokeSvg } from "../render.js";
import { NoteCanvas, type NoteTool } from "./canvas.js";
import { icon } from "./icons.js";
import { ToolTray } from "./tool-tray.js";
import {
	anchorPoint,
	connectable,
	connectorPoints,
	createConnectedShape,
	nearestSide,
	refreshConnections,
	resizeElements,
	selectionBounds,
} from "../manipulation.js";
import { useSidebarResize } from "./sidebar-resize.js";

const english: Record<string, string> = {
	区域: "Scenes",
	保存区域: "Save scene",
	区域名称: "Scene name",
	重命名区域: "Rename scene",
	删除区域: "Delete scene",
	"保存选中区域或当前视图，随时跳回。": "Save a selection or this view to return to it later.",
	还没有区域书签: "No saved scenes yet",
	吸附设置: "Snapping",
	网格吸附: "Snap to grid",
	对齐辅助线: "Alignment guides",
	"按住 Option / Alt 暂时关闭吸附": "Hold Option / Alt to bypass snapping",
	排列选中内容: "Arrange selection",
	左对齐: "Align left",
	水平居中: "Align centers",
	顶部对齐: "Align top",
	水平等距: "Distribute horizontally",
	垂直等距: "Distribute vertically",
	放大选中内容: "Enlarge selection",
	缩小选中内容: "Shrink selection",
	添加连接形状: "Add connected shape",
	缩放选中内容: "Resize selection",
	单击或圈选内容: "Click or circle to select",
	"拖动箭头连接形状，空白处创建下一个":
		"Drag arrows to connect; drop on empty paper to add a shape",
	手指: "Touch",
	调整页面面板宽度: "Resize pages panel",
	笔型: "Pen type",
	查看全部: "Show all",
	扩展为无限画布: "Extend to infinite canvas",
	"无限画布 · 向任意方向延伸": "Infinite canvas · extend in any direction",
	圆珠笔: "Ballpoint",
	钢笔: "Fountain",
	毛笔: "Brush",
	均匀线条: "Uniform line",
	柔和压感: "Gentle pressure",
	明显粗细变化: "Expressive pressure",
	铅笔: "Pencil",
	水彩: "Watercolor",
	纸张颗粒: "Paper grain",
	柔边叠色: "Soft color washes",
	浓度: "Color strength",
	更多工具: "More tools",
	摆放美纹纸: "Place masking tape",
	"单指移动 · 双指旋转 · 拖端点调整":
		"Drag to move · Two fingers to rotate · Drag ends to resize",
	美纹纸: "Masking tape",
	"拖动胶带调整位置；贴好后开始绘画，撕下保留留白。":
		"Drag tape into place, paint, then peel to reveal clean edges.",
	贴一条: "Add strip",
	四边留白: "Frame edges",
	选中胶带: "Selected tape",
	胶带: "Tape",
	胶带长度: "Tape length",
	胶带宽度: "Tape width",
	旋转角度: "Rotation",
	撕下选中胶带: "Peel selected",
	全部撕下: "Peel all",
	开始绘画: "Start painting",
	选择颜色: "Choose color",
	复位工具栏: "Reset drawing tools",
	"叠画可加深颜色；调低浓度，铺一层淡淡的水彩。":
		"Layer strokes for deeper color, or lower color strength for a light wash.",
	"铅笔带纸张颗粒，反复排线可以加深阴影。":
		"Pencil has paper grain; layer your hatching to deepen shadows.",
	"手指：慢写粗、快写细；压感笔：轻写细、重写粗。":
		"Finger: slow strokes are thicker, fast strokes thinner. Pressure pen: press harder for thicker strokes.",
	形状: "Shapes",
	画笔设置: "Pen settings",
	工具设置: "Tool settings",
	视图选项: "View options",
	完成书写: "Done drawing",
	更多颜色: "More colors",
	常用颜色: "Favorite colors",
	常用粗细: "Favorite widths",
	点击已选工具调整设置: "Tap the active tool to adjust settings",
	未修改: "Unmodified",
	手写笔记: "Handwritten notes",
	页面: "Pages",
	画笔: "Pen",
	荧光笔: "Highlighter",
	整笔橡皮擦: "Stroke eraser",
	套索: "Lasso",
	移动视图: "Pan",
	文字: "Text",
	直线: "Line",
	矩形: "Rectangle",
	椭圆: "Ellipse",
	撤销: "Undo",
	重做: "Redo",
	保存: "Save",
	导出: "Export",
	纸张: "Paper",
	关闭: "Close",
	笔迹颜色: "Ink color",
	自定义颜色: "Custom color",
	笔迹粗细: "Stroke width",
	压感: "Pressure",
	取消取色: "Cancel eyedropper",
	手指书写: "Draw with finger",
	"仅触控笔书写，手指移动页面": "Pen writes; fingers move the page",
	添加页面: "Add page",
	上一页: "Previous page",
	下一页: "Next page",
	页面操作: "Page actions",
	复制页面: "Duplicate page",
	删除页面: "Delete page",
	向前移动: "Move earlier",
	向后移动: "Move later",
	书签: "Bookmark",
	只看书签: "Bookmarks only",
	全部页面: "All pages",
	没有书签页: "No bookmarked pages",
	空白: "Blank",
	横线: "Ruled",
	方格: "Grid",
	点阵: "Dotted",
	纸张模板: "Paper template",
	纸张颜色: "Paper color",
	纸张尺寸: "Paper size",
	横向: "Landscape",
	纵向: "Portrait",
	完成: "Done",
	取消: "Cancel",
	复制选中内容: "Duplicate selection",
	删除选中内容: "Delete selection",
	选中内容: "Selection",
	适合宽度: "Fit width",
	缩放: "Zoom",
	"正在打开笔记…": "Opening notebook…",
	"正在导出…": "Exporting…",
	未保存更改: "Unsaved changes",
	已保存到文件: "Saved to file",
	只读模式: "Read only",
	"新笔记 · 尚未保存到文件": "New notebook · not saved to file",
	单击页面添加文字: "Click the page to add text",
	"圈选笔迹，再拖动选区移动": "Circle ink, then drag the selection to move it",
	擦除整条笔迹: "Erase a whole stroke",
	正在书写: "Writing",
	笔记名称: "Notebook name",
	编辑文字: "Edit text",
	文字大小: "Text size",
	"调整纸张尺寸不会缩放笔迹。": "Changing paper size keeps ink at its original size.",
	"CubeOffice 笔记": "CubeOffice notebook",
	"保留笔迹、纸张与书签，可继续编辑": "Retains editable ink, paper and bookmarks",
	"PDF 文档": "PDF document",
	"PNG 图片（当前页）": "PNG image (current page)",
	"保留纸张和笔迹，导出完整当前页": "Export the complete current page with paper and ink",
	"全部页面图片（ZIP）": "All page images (ZIP)",
	"每页一张 PNG 图片，按页码打包": "One PNG per page, numbered and packaged together",
	"适合分享与打印，导出页面外观": "Page appearance for sharing and printing",
	"Xournal++ 笔记": "Xournal++ notebook",
	"基础笔迹和文字；连接线转为笔迹，不含区域书签":
		"Basic ink and text; connections become ink, scenes are not supported",
	清除本页: "Clear page",
	"清除本页内容？": "Clear all content on this page?",
	"删除当前页面？": "Delete the current page?",
	"此操作可以撤销。": "You can undo this action.",
	清除: "Clear",
	删除: "Delete",
	笔迹与文字: "Ink and text",
	"没有可见图层，请先显示一个图层。": "Show a layer before writing.",
	图层: "Layers",
	新建图层: "Add layer",
	显示图层: "Show layer",
	隐藏图层: "Hide layer",
};
const tools: { id: NoteTool; label: string; key: string; glyph?: string }[] = [
	{ id: "pen", label: "画笔", key: "P" },
	{ id: "highlighter", label: "荧光笔", key: "H" },
	{ id: "eraser", label: "整笔橡皮擦", key: "E" },
	{ id: "lasso", label: "套索", key: "L" },
	{ id: "hand", label: "移动视图", key: "V" },
	{ id: "text", label: "文字", key: "T" },
	{ id: "line", label: "直线", key: "I" },
	{ id: "rectangle", label: "矩形", key: "R" },
	{ id: "ellipse", label: "椭圆", key: "O" },
];
const palette = [
	"#222b40",
	"#4f46e5",
	"#2563eb",
	"#dc3658",
	"#15803d",
	"#c77d15",
	"#facc15",
	"#ffffff",
];
const highlighterPalette = ["#facc15", "#86efac", "#f9a8d4", "#93c5fd"];
interface TextDraft {
	id: string;
	existing: boolean;
	x: number;
	y: number;
	text: string;
	size: number;
	color: string;
}
export interface NotesSaveOptions {
	signal?: AbortSignal;
	deliver?: (blob: Blob) => Promise<void>;
}

export interface NotesEditorApi {
	exportFile(format?: string, options?: NotesSaveOptions): Promise<Blob>;
	saveFile(options?: NotesSaveOptions): Promise<Blob>;
	getNotebook(): Notebook;
	getRevision(): number | string;
	isDirty(): boolean;
	subscribe(listener: () => void): () => void;
	setDocumentName(value: string): void;
	undo(): void;
	redo(): void;
	togglePages(): void;
	showViewOptions(): void;
}
export const NotesEditor = defineComponent({
	name: "CubeOfficeNotesEditor",
	props: {
		source: null,
		fileName: { type: String, default: "Notebook.cubenote" },
		readonly: Boolean,
		compact: Boolean,
		hostReadingMenu: Boolean,
		nativeColorPicker: Boolean,
		locale: { type: String, default: "zh-CN" },
	},
	emits: ["loaded", "error", "save", "export"],
	setup(props, { emit, expose }) {
		const t = (label: string) =>
			props.locale.startsWith("zh") ? label : (english[label] ?? label);
		const root = ref<HTMLElement>(),
			canvas = ref<{
				cancel(): void;
				viewBounds(): Bounds;
				focusView(b: Bounds): void;
				sampleColor(x: number, y: number): string | undefined;
			}>();
		const history = shallowRef<NoteHistory>(),
			book = shallowRef<Notebook>(),
			revision = ref(0),
			dirty = ref(false);
		const ready = ref(false),
			error = ref(""),
			busy = ref(false),
			drawing = ref(false),
			active = ref(0),
			tool = ref<NoteTool>("pen"),
			selected = ref<string[]>([]);
		const sidebar = ref(
				!props.compact && typeof window !== "undefined" && window.innerWidth >= 760,
			),
			bookmarksOnly = ref(false),
			railTab = ref<"pages" | "scenes">("pages"),
			snapGrid = ref(false),
			alignGuides = ref(true),
			selectionPosition = ref({ x: 8, y: 8 }),
			sceneName = ref(""),
			editingScene = ref<{ pageId: string; scene: NoteScene }>();
		const penStyle = ref<PenStyle>("fountain");
		const penStyles = ref(listBrushPlugins());
		const penPresets: Record<
			string,
			{
				color: string;
				width: number;
				pressure: boolean;
				opacity: number;
				settings: Record<string, number>;
			}
		> = {};
		function refreshBrushes() {
			penStyles.value = [...listBrushPlugins()];
			for (const plugin of penStyles.value)
				penPresets[plugin.id] ??= {
					...plugin.defaults,
					settings: brushDefaults(plugin.id),
				};
		}
		refreshBrushes();
		const unsubscribeBrushes = subscribeBrushPlugins(refreshBrushes);
		const activeBrush = computed(() => getBrushPlugin(penStyle.value)!);
		const inkSettings = ref<Record<string, number>>(brushDefaults(penStyle.value));
		const brushLabel = (plugin: { label: string; labelEn: string }) =>
			props.locale.startsWith("zh") ? plugin.label : plugin.labelEn;

		const mobile = ref(
			props.compact || (typeof window !== "undefined" && window.innerWidth < 760),
		);
		const paletteOpen = ref(true),
			rootWidth = ref(typeof window !== "undefined" ? window.innerWidth : 390),
			tray = ref<{
				reset(): void;
				bounds(): DOMRect | undefined;
				anchor(type?: string): DOMRect | undefined;
			}>(),
			trayPopover = ref<Record<string, string>>();
		const highlighterOpacity = ref(0.5),
			colorSampling = ref(false),
			sampledColor = ref(""),
			samplePoint = ref({ x: 0, y: 0 });
		const inkOpacity = ref(1),
			pressure = ref(true),
			fingerDraw = ref(mobile.value),
			color = ref(palette[0]),
			penWidth = ref(2),
			highlighterWidth = ref(14),
			eraserWidth = ref(10);
		let penColor = palette[0],
			highlighterColor = highlighterPalette[0];
		const zoom = ref(1),
			fitMode = ref(true),
			fitPage = ref(false),
			fitCover = ref(mobile.value),
			draft = ref<TextDraft>(),
			textInput = ref<HTMLTextAreaElement>();
		const name = ref(props.fileName),
			savedOnce = ref(false);
		const draftVersion = ref(0);
		const modal = ref<
				| ""
				| "paper"
				| "export"
				| "pages"
				| "layers"
				| "clear"
				| "delete"
				| "ink"
				| "tape"
				| "colors"
				| "palette"
				| "tools"
				| "snap"
				| "selection"
				| "scene"
				| "view"
			>(""),
			dialog = ref<HTMLDialogElement>();
		const popover = computed(() =>
			["ink", "colors", "palette", "tools", "snap", "selection", "view", "tape"].includes(
				modal.value,
			),
		);
		const activeTape = ref(""),
			tapeEditing = ref(false);
		const page = computed(
			() => book.value?.pages[Math.min(active.value, (book.value?.pages.length ?? 1) - 1)],
		);
		const width = computed(() =>
			tool.value === "highlighter"
				? highlighterWidth.value
				: tool.value === "eraser"
					? eraserWidth.value
					: penWidth.value,
		);
		const rail = useSidebarResize(
			root,
			() => {
				if (fitMode.value && !drawing.value) fit();
			},
			() => t("调整页面面板宽度"),
		);
		const thumbCache = new WeakMap<object, string>();
		const listeners = new Set<() => void>();
		let unsubscribe: (() => void) | undefined,
			generation = 0,
			observer: ResizeObserver | undefined,
			previousFocus: HTMLElement | null = null;
		const pageTitle = (index: number) =>
			props.locale.startsWith("zh") ? `第 ${index + 1} 页` : `Page ${index + 1}`;
		function current(): NoteHistory {
			if (!ready.value || !history.value) throw new Error("Notebook is not loaded.");
			return history.value;
		}
		function report(reason: unknown) {
			if (reason instanceof Error && reason.name === "AbortError") return;
			error.value = reason instanceof Error ? reason.message : String(reason);
			emit("error", reason);
		}
		function sync() {
			if (!history.value) return;
			book.value = history.value.document;
			revision.value = history.value.getRevision();
			dirty.value = history.value.isDirty();
			active.value = Math.min(active.value, book.value.pages.length - 1);
			const ids = new Set(page.value ? pageElements(page.value).map((e) => e.id) : []);
			selected.value = selected.value.filter((id) => ids.has(id));
			for (const listener of listeners) listener();
		}
		watch(
			() => props.fileName,
			(value) => {
				name.value = value;
			},
		);
		watch(
			() => props.source,
			async (source) => {
				const token = ++generation;
				ready.value = false;
				error.value = "";
				draft.value = undefined;
				selected.value = [];
				active.value = 0;
				unsubscribe?.();
				history.value?.close();
				try {
					let document: Notebook;
					let storedHistory: NoteHistoryState | undefined;
					if (source === undefined || source === null)
						document = createNotebook(name.value.replace(/\.[^.]+$/, ""), true);
					else {
						if (source instanceof Blob && source.size > LIMITS.bytes)
							throw new Error("Notebook exceeds the 64 MB editing limit.");
						const bytes =
							source instanceof Blob
								? new Uint8Array(await source.arrayBuffer())
								: source instanceof Uint8Array
									? source
									: source instanceof ArrayBuffer
										? new Uint8Array(source)
										: undefined;
						if (!bytes) throw new Error("Unsupported notebook source.");
						const restored = readNotebookState(bytes, name.value);
						document = restored.document;
						storedHistory = restored.history;
					}
					if (token !== generation) return;
					history.value = new NoteHistory(document, false, storedHistory);
					unsubscribe = history.value.subscribe(sync);
					ready.value = true;
					savedOnce.value = false;
					sync();
					await nextTick();
					if (token !== generation) return;
					fit();
					emit("loaded");
				} catch (reason) {
					if (token === generation) report(reason);
				}
			},
			{ immediate: true },
		);
		watch(modal, async (value) => {
			if (value) {
				finishText();
				previousFocus = document.activeElement as HTMLElement;
				await nextTick();
				if (popover.value) {
					if (modal.value === "colors" && !props.nativeColorPicker)
						dialog.value?.focus({ preventScroll: true });
					else
						dialog.value
							?.querySelector<HTMLElement>("button,input")
							?.focus({ preventScroll: true });
				} else if (!dialog.value?.open) dialog.value?.showModal();
			} else {
				dialog.value?.close?.();
				previousFocus?.focus({ preventScroll: true });
			}
		});
		function placeTrayPopover() {
			trayPopover.value = undefined;
			if (!mobile.value || !popover.value || !tray.value || !dialog.value || !root.value)
				return;
			const host = root.value.getBoundingClientRect(),
				box = tray.value.bounds();
			if (!box) return;
			const above = box.top - host.top - 76,
				below = host.bottom - box.bottom - 24,
				useAbove = above >= below,
				maxHeight =
					modal.value === "colors" && !props.nativeColorPicker
						? Math.max(120, host.height - 88)
						: Math.max(120, useAbove ? above : below);
			const menu = dialog.value.getBoundingClientRect(),
				height = Math.min(dialog.value.scrollHeight + 2, maxHeight),
				anchor = tray.value.anchor(modal.value === "colors" ? "colors" : undefined) ?? box;
			const top = useAbove
				? Math.max(modal.value === "colors" ? 12 : 64, box.top - host.top - height - 12)
				: box.bottom - host.top + 12;
			trayPopover.value = {
				left: `${Math.max(12, Math.min(host.width - menu.width - 12, anchor.left + anchor.width / 2 - host.left - menu.width / 2))}px`,
				top: `${top}px`,
				right: "auto",
				bottom: "auto",
				maxHeight: `${maxHeight}px`,
			};
		}
		watch(
			[modal, penStyle, tool, rootWidth, mobile],
			async () => {
				await nextTick();
				placeTrayPopover();
			},
			{ flush: "post" },
		);
		watch(
			() => [page.value?.tapes?.length, activeTape.value],
			async () => {
				await nextTick();
				placeTrayPopover();
			},
			{ flush: "post" },
		);
		watch(
			() => props.readonly,
			(readonly, previous) => {
				if (readonly && !previous) {
					tapeEditing.value = false;
					modal.value = "";
					finishText(true);
					selected.value = [];
					canvas.value?.cancel();
				}
			},
		);
		watch(active, () => {
			tapeEditing.value = false;
			activeTape.value = "";
			selected.value = [];
			draft.value = undefined;
			if (fitMode.value) nextTick(() => fit());
		});
		watch(
			() => `${page.value?.id}:${page.value?.width}:${page.value?.height}`,
			() => {
				if (fitMode.value) nextTick(() => fit());
			},
		);
		function commit(change: (document: Notebook) => void) {
			if (props.readonly) return;
			try {
				current().commit(change);
			} catch (reason) {
				report(reason);
			}
		}
		function changePage(change: (p: NonNullable<typeof page.value>) => void) {
			const id = page.value?.id;
			if (!id || props.readonly) return;
			try {
				current().commitPage(id, (p) => {
					change(p);
					refreshConnections(p);
					if (!isInfinitePage(p))
						for (const tape of p.tapes ?? []) {
							tape.x = Math.min(tape.x, p.width);
							tape.y = Math.min(tape.y, p.height);
						}
					if (!isInfinitePage(p))
						for (const s of p.scenes ?? []) {
							s.x = Math.min(s.x, p.width - 1);
							s.y = Math.min(s.y, p.height - 1);
							s.width = Math.min(s.width, p.width - s.x);
							s.height = Math.min(s.height, p.height - s.y);
						}
				});
			} catch (reason) {
				report(reason);
			}
		}
		function add(element: InkElement) {
			changePage((p) => {
				const layer = [...p.layers].reverse().find((l) => l.visible);
				if (!layer) throw new Error(t("没有可见图层，请先显示一个图层。"));
				layer.elements.push(element);
			});
		}
		function resizeSelection(to: Bounds) {
			if (!page.value) return;
			const from = selectionBounds(
				pageElements(page.value).filter((e) => selected.value.includes(e.id)),
			);
			if (from)
				changePage((p) =>
					resizeElements(
						p.layers
							.flatMap((l) => l.elements)
							.filter((e) => selected.value.includes(e.id)),
						from,
						to,
					),
				);
		}
		function scaleSelection(factor: number) {
			if (!page.value) return;
			const b = selectionBounds(
				pageElements(page.value).filter((e) => selected.value.includes(e.id)),
			);
			if (b)
				resizeSelection({
					...b,
					width: isInfinitePage(page.value)
						? b.width * factor
						: Math.min(page.value.width - b.x, b.width * factor),
					height: isInfinitePage(page.value)
						? b.height * factor
						: Math.min(page.value.height - b.y, b.height * factor),
				});
		}
		function arrangeSelection(action: string) {
			changePage((p) => {
				const elements = pageElements(p).filter(
					(e) => selected.value.includes(e.id) && !(e.kind === "stroke" && e.connector),
				);
				const b = selectionBounds(elements);
				if (!b || elements.length < 2) return;
				if (action === "horizontal" || action === "vertical") {
					if (elements.length < 3) return;
					const axis = action === "horizontal" ? "x" : "y",
						length = axis === "x" ? "width" : "height";
					elements.sort((a, b) => bounds(a)[axis] - bounds(b)[axis]);
					const gap =
						(b[length] - elements.reduce((sum, e) => sum + bounds(e)[length], 0)) /
						(elements.length - 1);
					let cursor = b[axis];
					for (const e of elements) {
						const box = bounds(e);
						translate(
							e,
							axis === "x" ? cursor - box.x : 0,
							axis === "y" ? cursor - box.y : 0,
						);
						cursor += box[length] + gap;
					}
				} else
					for (const e of elements) {
						const box = bounds(e);
						translate(
							e,
							action === "left"
								? b.x - box.x
								: action === "center"
									? b.x + b.width / 2 - box.x - box.width / 2
									: 0,
							action === "top" ? b.y - box.y : 0,
						);
					}
			});
		}
		function connectShape(id: string, side: AnchorSide, point: Point, targetId?: string) {
			let nextId = "";
			changePage((p) => {
				const all = p.layers.flatMap((l) => l.elements),
					source = all.find((e) => e.id === id);
				if (!source || !connectable(source)) return;
				let target = all.find((e) => e.id === targetId);
				const layer = [...p.layers].reverse().find((l) => l.visible);
				if (!layer) return;
				if (!target || !connectable(target)) {
					target = createConnectedShape(source, point, p);
					layer.elements.push(target);
				}
				if (!connectable(target) || target.id === id) return;
				const to = nearestSide(target, anchorPoint(source, side));
				layer.elements.push({
					id: uid(),
					kind: "stroke",
					tool: "pen",
					width: source.width,
					color: source.color,
					pressure: false,
					opacity: 1,
					connector: {
						from: { elementId: id, side },
						to: { elementId: target.id, side: to },
					},
					points: connectorPoints(anchorPoint(source, side), anchorPoint(target, to)),
				});
				nextId = target.id;
			});
			if (nextId) selected.value = [nextId];
		}
		function quickConnect(side: AnchorSide = "right") {
			const source =
				page.value && pageElements(page.value).find((e) => e.id === selected.value[0]);
			if (!source || !connectable(source)) return;
			const b = bounds(source),
				p = anchorPoint(source, side);
			connectShape(source.id, side, {
				x:
					p.x +
					(side === "right" ? b.width / 2 + 50 : side === "left" ? -b.width / 2 - 50 : 0),
				y:
					p.y +
					(side === "bottom"
						? b.height / 2 + 50
						: side === "top"
							? -b.height / 2 - 50
							: 0),
			});
		}
		function openScene(existing?: { pageId: string; scene: NoteScene }) {
			finishText();
			editingScene.value = existing;
			sceneName.value =
				existing?.scene.name ?? `${t("区域")} ${(page.value?.scenes?.length ?? 0) + 1}`;
			modal.value = "scene";
		}
		function saveScene() {
			const name = sceneName.value.trim().slice(0, 256);
			if (!name || !page.value) return;
			const existing = editingScene.value;
			if (existing)
				commit((doc) => {
					const scene = doc.pages
						.find((p) => p.id === existing.pageId)
						?.scenes?.find((s) => s.id === existing.scene.id);
					if (scene) scene.name = name;
				});
			else {
				const b =
					selectionBounds(
						pageElements(page.value).filter((e) => selected.value.includes(e.id)),
					) ?? canvas.value?.viewBounds();
				if (!b) return;
				changePage((p) => {
					if ((p.scenes?.length ?? 0) >= 200) return;
					const x = isInfinitePage(p) ? b.x : Math.max(0, Math.min(p.width - 1, b.x)),
						y = isInfinitePage(p) ? b.y : Math.max(0, Math.min(p.height - 1, b.y));
					(p.scenes ??= []).push({
						id: uid(),
						name,
						x,
						y,
						width: isInfinitePage(p)
							? b.width
							: Math.max(1, Math.min(p.width - x, b.width)),
						height: isInfinitePage(p)
							? b.height
							: Math.max(1, Math.min(p.height - y, b.height)),
					});
				});
			}
			modal.value = "";
			railTab.value = "scenes";
			sidebar.value = true;
		}
		async function goScene(index: number, scene: NoteScene) {
			fitMode.value = false;
			navigate(index);
			await nextTick();
			canvas.value?.focusView(scene);
		}
		function sceneRail() {
			const scenes = book.value!.pages.flatMap((p, index) =>
				(p.scenes ?? []).map((scene) => ({ p, index, scene })),
			);
			return h("div", { class: "cube-notes__scene-list" }, [
				choice(
					"保存区域",
					() => openScene(),
					false,
					props.readonly || (page.value?.scenes?.length ?? 0) >= 200,
				),
				!scenes.length
					? h("div", { class: "cube-notes__scene-empty" }, [
							icon("scene"),
							h("strong", t("还没有区域书签")),
							h("p", t("保存选中区域或当前视图，随时跳回。")),
						])
					: null,
				...scenes.map(({ p, index, scene }) =>
					h("div", { class: "cube-notes__scene-card", key: scene.id }, [
						h(
							"button",
							{
								class: "cube-notes__scene-link",
								onClick: () => goScene(index, scene),
							},
							[
								icon("scene"),
								h("span", [h("strong", scene.name), h("small", pageTitle(index))]),
							],
						),
						h("div", { class: "cube-notes__scene-actions" }, [
							button(
								"重命名区域",
								"edit",
								() => openScene({ pageId: p.id, scene }),
								props.readonly,
							),
							button(
								"向前移动",
								"up",
								() =>
									commit((doc) => {
										const a = doc.pages.find((v) => v.id === p.id)!.scenes!,
											i = a.findIndex((v) => v.id === scene.id);
										if (i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]];
									}),
								props.readonly || p.scenes![0].id === scene.id,
							),
							button(
								"向后移动",
								"down",
								() =>
									commit((doc) => {
										const a = doc.pages.find((v) => v.id === p.id)!.scenes!,
											i = a.findIndex((v) => v.id === scene.id);
										if (i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]];
									}),
								props.readonly || p.scenes!.at(-1)!.id === scene.id,
							),
							button(
								"删除区域",
								"trash",
								() =>
									commit((doc) => {
										const page = doc.pages.find((v) => v.id === p.id)!;
										page.scenes = page.scenes?.filter((v) => v.id !== scene.id);
									}),
								props.readonly,
							),
						]),
					]),
				),
			]);
		}
		function erase(ids: string[]) {
			if (!ids.length) return;
			changePage((p) =>
				p.layers.forEach((l) => {
					l.elements = l.elements.filter((e) => !ids.includes(e.id));
				}),
			);
		}
		function moveSelection(dx: number, dy: number) {
			if (!dx && !dy) return;
			changePage((p) =>
				p.layers.forEach((l) =>
					l.elements
						.filter((e) => selected.value.includes(e.id))
						.forEach((e) => {
							if (e.kind !== "stroke" || !e.connector) translate(e, dx, dy);
						}),
				),
			);
		}
		function duplicateSelection() {
			const ids: string[] = [];
			const remap = new Map<string, string>();
			changePage((p) => {
				p.layers.forEach((l) => {
					const copies = l.elements
						.filter((e) => selected.value.includes(e.id))
						.map((e) => {
							const copy = clone(e);
							preservePigmentIdentity(copy);
							copy.id = uid();
							remap.set(e.id, copy.id);
							ids.push(copy.id);
							translate(copy, 12, 12);
							return copy;
						});
					l.elements.push(...copies);
				});
				for (const e of p.layers.flatMap((l) => l.elements))
					if (ids.includes(e.id) && e.kind === "stroke" && e.connector) {
						for (const a of [e.connector.from, e.connector.to])
							a.elementId = remap.get(a.elementId) ?? a.elementId;
					}
			});
			// Clone connections in the same transaction rather than adding another undo step.
			selected.value = ids;
		}
		function setColor(value: string, opacity?: number) {
			if (!/^#[\da-f]{6}$/i.test(value)) return;
			canvas.value?.cancel();
			value = value.toLowerCase();
			color.value = value;
			if (typeof opacity === "number" && Number.isFinite(opacity)) {
				opacity = Math.max(0, Math.min(1, opacity));
				if (tool.value === "highlighter") highlighterOpacity.value = opacity;
				else inkOpacity.value = opacity;
			}
			if (tool.value === "highlighter") highlighterColor = value;
			else penColor = value;
			if (selected.value.length)
				changePage((p) =>
					p.layers.forEach((l) =>
						l.elements
							.filter((e) => selected.value.includes(e.id))
							.forEach((e) => {
								e.color = value;
								if (e.kind === "stroke" && typeof opacity === "number")
									e.opacity = opacity;
							}),
					),
				);
		}
		function setOpacity(value: number) {
			if (!Number.isFinite(value)) return;
			canvas.value?.cancel();
			value = Math.max(0, Math.min(1, value));
			if (tool.value === "highlighter") highlighterOpacity.value = value;
			else inkOpacity.value = value;
			if (selected.value.length)
				changePage((p) =>
					p.layers.forEach((l) =>
						l.elements.forEach((e) => {
							if (e.kind === "stroke" && selected.value.includes(e.id))
								e.opacity = value;
						}),
					),
				);
		}
		function stopColorSample() {
			if (!colorSampling.value) return;
			canvas.value?.cancel();
			colorSampling.value = false;
			modal.value = "colors";
		}
		async function startColorSample() {
			canvas.value?.cancel();
			const Picker = (
				window as unknown as {
					EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> };
				}
			).EyeDropper;
			if (Picker) {
				try {
					const result = await new Picker().open();
					setColor(result.sRGBHex);
				} catch (reason) {
					if ((reason as Error).name !== "AbortError") report(reason);
				}
				return;
			}
			modal.value = "";
			sampledColor.value = "";
			colorSampling.value = true;
		}
		function moveColorSample(e: PointerEvent) {
			e.preventDefault();
			e.stopPropagation();
			const value = canvas.value?.sampleColor(e.clientX, e.clientY);
			if (value) sampledColor.value = value;
			const box = root.value!.getBoundingClientRect();
			samplePoint.value = {
				x: Math.max(12, Math.min(box.width - 56, e.clientX - box.left)),
				y: Math.max(12, e.clientY - box.top - 64),
			};
		}
		function selectPenStyle(value: PenStyle) {
			penPresets[penStyle.value] = {
				color: penColor,
				width: penWidth.value,
				pressure: pressure.value,
				opacity: inkOpacity.value,
				settings: { ...inkSettings.value },
			};
			const preset = penPresets[value];
			penStyle.value = value;
			penColor = color.value = preset.color;
			penWidth.value = preset.width;
			pressure.value = preset.pressure;
			inkOpacity.value = preset.opacity;
			inkSettings.value = { ...preset.settings };
		}
		function selectTool(value: NoteTool) {
			tapeEditing.value = false;
			finishText();
			tool.value = value;
			if (["pen", "highlighter", "eraser"].includes(value)) paletteOpen.value = true;
			else if (["text", "line", "rectangle", "ellipse"].includes(value))
				paletteOpen.value = false;
			color.value = value === "highlighter" ? highlighterColor : penColor;
			selected.value = [];
		}
		function setWidth(value: number) {
			if (tool.value === "highlighter") highlighterWidth.value = value;
			else if (tool.value === "eraser") eraserWidth.value = value;
			else penWidth.value = value;
			if (selected.value.length)
				changePage((p) =>
					p.layers.forEach((l) =>
						l.elements
							.filter((e) => selected.value.includes(e.id))
							.forEach((e) => {
								if (e.kind === "stroke") {
									const ratio = value / e.width;
									e.points.forEach((p) => {
										if (p.width !== undefined) p.width *= ratio;
									});
									e.width = value;
								}
							}),
					),
				);
		}
		function addPage() {
			finishText();
			const previous = page.value;
			if (!previous || (book.value?.pages.length ?? 0) >= LIMITS.pages) return;
			const index = active.value + 1;
			commit((doc) =>
				doc.pages.splice(index, 0, {
					...createPage(previous.paper, previous.width, previous.height, previous.color),
					infinite: isInfinitePage(previous),
				}),
			);
			active.value = index;
		}
		function duplicatePage() {
			const p = page.value;
			if (!p || (book.value?.pages.length ?? 0) >= LIMITS.pages) return;
			const copy = clone(p);
			copy.id = uid();
			const remap = new Map<string, string>();
			copy.scenes?.forEach((s) => (s.id = uid()));
			copy.tapes?.forEach((tape) => (tape.id = uid()));
			copy.layers.forEach((l) => {
				l.id = uid();
				l.elements.forEach((e) => {
					preservePigmentIdentity(e);
					const id = uid();
					remap.set(e.id, id);
					e.id = id;
				});
			});
			for (const e of copy.layers.flatMap((l) => l.elements))
				if (e.kind === "stroke" && e.connector)
					for (const a of [e.connector.from, e.connector.to])
						a.elementId = remap.get(a.elementId)!;
			refreshConnections(copy);
			const index = active.value + 1;
			commit((doc) => doc.pages.splice(index, 0, copy));
			active.value = index;
			modal.value = "";
		}
		function deletePage() {
			if (!book.value || book.value.pages.length <= 1) return;
			commit((doc) => doc.pages.splice(active.value, 1));
			selected.value = [];
			modal.value = "";
		}
		function reorder(direction: number) {
			const target = active.value + direction;
			if (!book.value || target < 0 || target >= book.value.pages.length) return;
			commit((doc) => {
				const [p] = doc.pages.splice(active.value, 1);
				doc.pages.splice(target, 0, p);
			});
			active.value = target;
		}
		function openTape() {
			finishText();
			canvas.value?.cancel();
			selected.value = [];
			activeTape.value = page.value?.tapes?.[0]?.id ?? "";
			if (!activeTape.value) addTape();
			tapeEditing.value = true;
			modal.value = "";
		}
		function addTape(frame = false) {
			const p = page.value;
			if (!p || props.readonly) return;
			const view = canvas.value?.viewBounds();
			const usableHeight = view
				? Math.max(100 / zoom.value, view.height - (mobile.value ? 210 : 120) / zoom.value)
				: p.height * 0.65;
			const area =
				isInfinitePage(p) && view ? view : { x: 0, y: 0, width: p.width, height: p.height };
			const margin = Math.min(area.width, area.height) * 0.09,
				strip = 18;
			const tapes: MaskingTape[] = frame
				? [
						{
							id: uid(),
							x: area.x + area.width / 2,
							y: area.y + margin,
							width: Math.min(5000, area.width - margin * 2 + strip),
							height: strip,
							angle: 0,
						},
						{
							id: uid(),
							x: area.x + area.width / 2,
							y: area.y + area.height - margin,
							width: Math.min(5000, area.width - margin * 2 + strip),
							height: strip,
							angle: 0,
						},
						{
							id: uid(),
							x: area.x + margin,
							y: area.y + area.height / 2,
							width: Math.min(5000, area.height - margin * 2 + strip),
							height: strip,
							angle: 90,
						},
						{
							id: uid(),
							x: area.x + area.width - margin,
							y: area.y + area.height / 2,
							width: Math.min(5000, area.height - margin * 2 + strip),
							height: strip,
							angle: 90,
						},
					]
				: [
						{
							id: uid(),
							x: view ? view.x + view.width / 2 : p.width / 2,
							y: view
								? isInfinitePage(p)
									? view.y + 56 / zoom.value + usableHeight * 0.3
									: Math.min(
											p.height,
											view.y + 56 / zoom.value + usableHeight * 0.3,
										)
								: p.height / 3,
							width: Math.max(
								80,
								Math.min(5000, (view?.width ?? p.width) * 0.7, usableHeight * 1.25),
							),
							height: 24,
							angle: 0,
						},
					];
			if ((p.tapes?.length ?? 0) + tapes.length > 24) return;
			commit((doc) => {
				(doc.pages[active.value].tapes ??= []).push(...tapes);
			});
			activeTape.value = tapes[0].id;
		}
		function updateTape(id: string, patch: Partial<MaskingTape>) {
			if (props.readonly || !page.value?.tapes?.some((t) => t.id === id)) return;
			commit((doc) => {
				const p = doc.pages[active.value],
					tape = p.tapes!.find((t) => t.id === id)!;
				Object.assign(tape, patch);
				if (!isInfinitePage(p)) tape.x = Math.max(0, Math.min(p.width, tape.x));
				if (!isInfinitePage(p)) tape.y = Math.max(0, Math.min(p.height, tape.y));
			});
		}
		function removeTape(all = false) {
			commit((doc) => {
				const p = doc.pages[active.value];
				p.tapes = all ? [] : p.tapes?.filter((t) => t.id !== activeTape.value);
			});
			activeTape.value = page.value?.tapes?.[0]?.id ?? "";
		}
		function togglePages() {
			if (!ready.value) return;
			finishText();
			canvas.value?.cancel();
			modal.value = "";
			tapeEditing.value = false;
			railTab.value = "pages";
			sidebar.value = !sidebar.value;
			if (fitMode.value) nextTick(() => fit());
		}
		function navigate(index: number) {
			finishText();
			canvas.value?.cancel();
			active.value = index;
			if (window.innerWidth < 760) sidebar.value = false;
		}
		function fit(fullPage = fitPage.value, cover = fitCover.value) {
			if (page.value && isInfinitePage(page.value)) {
				fitMode.value = false;
				if (pageElements(page.value).length)
					canvas.value?.focusView(pageContentBounds(page.value));
				else zoom.value = 1;
				return;
			}
			const stage = root.value?.querySelector(".cube-notes__viewport");
			if (stage && page.value) {
				fitMode.value = true;
				fitPage.value = fullPage;
				fitCover.value = cover;
				zoom.value = Math.max(
					0.25,
					Math.min(
						4,
						mobile.value && cover && !fullPage
							? Math.max(
									stage.clientWidth / page.value.width,
									stage.clientHeight / page.value.height,
								)
							: (stage.clientWidth - (mobile.value ? 0 : 48)) / page.value.width,
						fullPage
							? (stage.clientHeight - (window.innerWidth < 760 ? 44 : 64)) /
									page.value.height
							: 4,
					),
				);
			}
		}
		function setZoom(value: number) {
			fitMode.value = false;
			zoom.value = Math.max(
				page.value && isInfinitePage(page.value) ? 0.000001 : 0.25,
				Math.min(4, value),
			);
		}
		function startText(point: InkPoint, existing?: InkText) {
			finishText();
			if (snapGrid.value && !existing)
				point = {
					...point,
					x: Math.round(point.x / 20) * 20,
					y: Math.round(point.y / 20) * 20,
				};
			draftVersion.value = 0;
			draft.value = {
				id: existing?.id ?? uid(),
				existing: Boolean(existing),
				x: existing?.x ?? point.x,
				y: existing?.y ?? point.y,
				text: existing?.text ?? "",
				size: existing?.size ?? 16,
				color: existing?.color ?? color.value,
			};
			nextTick(() => {
				textInput.value?.focus();
				textInput.value?.select();
			});
		}
		function applyDraft(document: Notebook, value: TextDraft) {
			const p = document.pages.find((p) => p.id === page.value?.id);
			if (!p) return;
			if (value.existing) {
				for (const layer of p.layers) {
					const existing = layer.elements.find((e) => e.id === value.id);
					if (existing?.kind === "text") {
						existing.text = value.text;
						existing.size = value.size;
					}
				}
			} else if (value.text.trim()) {
				const layer = [...p.layers].reverse().find((l) => l.visible);
				if (!layer) throw new Error(t("没有可见图层，请先显示一个图层。"));
				layer.elements.push({
					id: value.id,
					kind: "text",
					x: value.x,
					y: value.y,
					text: value.text,
					size: value.size,
					color: value.color,
				});
			}
		}
		function finishText(readonlyTransition = false) {
			const value = draft.value;
			if (!value) return;
			if (props.readonly && !readonlyTransition) return;
			draft.value = undefined;
			try {
				current().commit((document) => applyDraft(document, value));
			} catch (reason) {
				report(reason);
			}
			for (const listener of listeners) listener();
		}
		function changedDraft() {
			draftVersion.value++;
			for (const listener of listeners) listener();
		}
		function snapshot() {
			const document = clone(current().document);
			if (draft.value) applyDraft(document, draft.value);
			return document;
		}

		function undo() {
			finishText();
			canvas.value?.cancel();
			selected.value = [];
			if (!props.readonly) current().undo();
		}
		function redo() {
			finishText();
			canvas.value?.cancel();
			selected.value = [];
			if (!props.readonly) current().redo();
		}
		async function exportFile(
			format: string = nativeNotesFormat(name.value),
			options: NotesSaveOptions = {},
		): Promise<Blob> {
			options.signal?.throwIfAborted();
			const document = snapshot();
			if (["notes", "cubenote"].includes(format))
				return writeNotebook(
					document,
					current().capture(draft.value ? document : undefined),
				);
			if (["xopp", "xoj"].includes(format)) return writeXopp(document);
			if (format === "pdf") return exportNotesPdf(document, options.signal);
			if (format === "png")
				return exportNotesPagePng(document.pages[active.value], options.signal);
			if (format === "png-zip") return exportNotesImages(document, options.signal);
			throw new Error(`Unsupported notebook export: ${format}`);
		}
		async function saveFile(options: NotesSaveOptions = {}): Promise<Blob> {
			finishText();
			const runtime = current(),
				snapshot = runtime.getRevision();
			const blob = await exportFile(nativeNotesFormat(name.value), options);
			await options.deliver?.(blob);
			options.signal?.throwIfAborted();
			if (options.deliver && runtime === history.value) {
				runtime.markSaved(snapshot);
				savedOnce.value = true;
			}
			return blob;
		}
		expose({
			isDirty: () => dirty.value || Boolean(draft.value && draftVersion.value > 0),
			getRevision: () =>
				draft.value && draftVersion.value
					? `${revision.value}:text-${draftVersion.value}`
					: revision.value,
			getNotebook: snapshot,
			subscribe(listener: () => void) {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
			exportFile,
			saveFile,
			undo,
			redo,
			togglePages,
			showViewOptions: () => {
				if (ready.value) modal.value = "view";
			},
			setDocumentName: (value: string) => {
				name.value = value;
			},
		});
		function shortcut(event: KeyboardEvent) {
			if (colorSampling.value) {
				if (event.key === "Escape") {
					event.preventDefault();
					stopColorSample();
				}
				return;
			}
			if (modal.value && event.key === "Escape") {
				modal.value = "";
				event.preventDefault();
				return;
			}
			if ((event.target as HTMLElement)?.closest("input, textarea, select") || modal.value)
				return;
			const modifier = event.ctrlKey || event.metaKey;
			if (modifier && event.key.toLowerCase() === "s") {
				event.preventDefault();
				event.stopPropagation();
				finishText();
				emit("save");
				return;
			}
			if (props.readonly || !ready.value) return;
			if (modifier && ["z", "y"].includes(event.key.toLowerCase())) {
				event.preventDefault();
				event.stopPropagation();
				event.shiftKey || event.key.toLowerCase() === "y" ? redo() : undo();
			} else if (["Delete", "Backspace"].includes(event.key) && selected.value.length) {
				event.preventDefault();
				event.stopPropagation();
				erase(selected.value);
				selected.value = [];
			} else if (event.key === "Escape") {
				draft.value = undefined;
				selected.value = [];
				canvas.value?.cancel();
			} else if (!modifier && event.key.startsWith("Arrow") && selected.value.length) {
				event.preventDefault();
				const amount = event.shiftKey ? 10 : 1;
				moveSelection(
					event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0,
					event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0,
				);
			} else if (!modifier) {
				const match = tools.find((t) => t.key.toLowerCase() === event.key.toLowerCase());
				if (match) {
					selectTool(match.id);
					event.preventDefault();
				}
			}
		}
		onMounted(() => {
			window.addEventListener("blur", stopColorSample);
			observer = new ResizeObserver(() => {
				rootWidth.value = root.value?.clientWidth ?? window.innerWidth;
				mobile.value =
					props.compact || (root.value?.clientWidth ?? window.innerWidth) < 760;
				rail.clampToViewport();
				if (fitMode.value && !drawing.value) fit();
				void nextTick(placeTrayPopover);
			});
			if (root.value) observer.observe(root.value);
		});
		onBeforeUnmount(() => {
			generation++;
			window.removeEventListener("blur", stopColorSample);
			observer?.disconnect();
			unsubscribe?.();
			unsubscribeBrushes();
			history.value?.close();
			listeners.clear();
			dialog.value?.close?.();
		});
		const button = (
			label: string,
			glyph: string,
			action: () => void,
			disabled = false,
			active = false,
			extra: Record<string, unknown> = {},
		) =>
			h(
				"button",
				{
					type: "button",
					title: t(label),
					"aria-label": t(label),
					class: ["cube-notes__button", active && "is-active"],
					disabled,
					onClick: () => action(),
					...extra,
				},
				icon(glyph),
			);
		const choice = (label: string, action: () => void, active = false, disabled = false) =>
			h(
				"button",
				{
					type: "button",
					class: ["cube-notes__choice", active && "is-active"],
					"aria-pressed": active,
					disabled,
					onClick: () => action(),
				},
				t(label),
			);
		function colorControls(all = false) {
			const colors = tool.value === "highlighter" ? highlighterPalette : palette;
			const favorites = colors.slice(0, 3);
			if (!all && !favorites.includes(color.value)) favorites[2] = color.value;
			return h(
				"div",
				{ class: "cube-notes__swatches", role: "group", "aria-label": t("笔迹颜色") },
				(all ? colors : favorites).map((c) =>
					h(
						"button",
						{
							type: "button",
							class: ["cube-notes__swatch", color.value === c && "is-active"],
							style: { "--ink-color": c },
							title: c,
							"aria-label": `${t("笔迹颜色")} ${c}`,
							"aria-pressed": color.value === c,
							disabled: !ready.value || props.readonly || busy.value,
							onClick: () => setColor(c),
						},
						[
							h(
								"span",
								{ class: "cube-notes__color-dot" },
								color.value === c ? [icon("check")] : [],
							),
						],
					),
				),
			);
		}
		function widthControl() {
			return h("label", { class: "cube-notes__width" }, [
				h("span", t("笔迹粗细")),
				h("input", {
					type: "range",
					min: 0.5,
					max:
						tool.value === "pen"
							? activeBrush.value.maxWidth
							: tool.value === "highlighter" || tool.value === "eraser"
								? 30
								: 10,
					step: 0.5,
					value: width.value,
					"aria-label": t("笔迹粗细"),
					onInput: (e: Event) => setWidth(Number((e.target as HTMLInputElement).value)),
				}),
				h("output", `${width.value.toFixed(1)} pt`),
			]);
		}
		function penPreview(style: PenStyle, size: number, pressureEnabled = true, token = "card") {
			const stroke: InkStroke = {
				id: "preview",
				kind: "stroke",
				tool: "pen",
				color:
					token === "active" || style === penStyle.value
						? color.value
						: penPresets[style].color,
				width: Math.min(size, 24),
				opacity: token === "active" ? inkOpacity.value : penPresets[style].opacity,
				pressure: pressureEnabled && getBrushPlugin(style)?.supportsPressure !== false,
				brushSettings: token === "active" ? inkSettings.value : penPresets[style].settings,
				penStyle: style,
				brushVersion: getBrushPlugin(style)?.version ?? 1,
				points: Array.from({ length: 65 }, (_, i) => {
					const t = i / 64;
					return {
						x: 12 + 216 * t,
						y: 30 + 10 * Math.sin(t * Math.PI * 3),
						pressure: 0.1 + 0.8 * Math.sin(t * Math.PI),
					};
				}),
			};
			return h("svg", {
				viewBox: "0 0 240 60",
				"aria-hidden": "true",
				innerHTML: strokeSvg(stroke, `preview-${style}-${token}`),
			});
		}
		function modalContents() {
			if (modal.value === "tape") {
				const tape = page.value?.tapes?.find((item) => item.id === activeTape.value);
				return tape
					? [
							h(
								"div",
								{ class: "cube-notes__tape-widths" },
								[12, 24, 48].map((height) =>
									choice(
										`${height} pt`,
										() => updateTape(tape.id, { height }),
										tape.height === height,
									),
								),
							),
							h("label", { class: "cube-notes__tape-setting" }, [
								h("span", [
									t("胶带宽度"),
									h("output", `${Math.round(tape.height)} pt`),
								]),
								h("input", {
									type: "range",
									min: 6,
									max: 120,
									step: 2,
									value: tape.height,
									"aria-label": t("胶带宽度"),
									onChange: (e: Event) =>
										updateTape(tape.id, {
											height: Number((e.target as HTMLInputElement).value),
										}),
								}),
							]),
							choice("完成", () => (modal.value = "")),
						]
					: [];
			}
			if (modal.value === "palette")
				return [
					h("div", { class: "cube-notes__view-actions" }, [
						choice("文字", () => {
							selectTool("text");
							modal.value = "";
						}),
						choice("形状", () => {
							modal.value = "tools";
						}),
						choice("移动视图", () => {
							selectTool("hand");
							modal.value = "";
						}),
						choice("画笔设置", () => {
							selectTool("pen");
							modal.value = "ink";
						}),
						choice("纸张", () => {
							modal.value = "paper";
						}),
						choice("美纹纸", openTape),
						choice("图层", () => {
							modal.value = "layers";
						}),
						choice("视图选项", () => {
							modal.value = "view";
						}),
						choice("复位工具栏", () => {
							tray.value?.reset();
							modal.value = "";
						}),
					]),
				];
			if (modal.value === "colors")
				return [
					...(!props.nativeColorPicker ? [] : [colorControls(true)]),
					!props.nativeColorPicker
						? h(NoteColorPicker, {
								value: color.value,
								titleId: "cube-notes-dialog-title",
								locale: props.locale,
								opacity:
									tool.value === "highlighter"
										? highlighterOpacity.value
										: inkOpacity.value,
								onOpacity: setOpacity,
								onClose: () => (modal.value = ""),
								onSample: startColorSample,
								onChange: setColor,
								onLayout: () => void nextTick(placeTrayPopover),
							})
						: h("label", { class: "cube-notes__custom-color" }, [
								h("span", t("自定义颜色")),
								h("input", {
									type: "color",
									value: color.value,
									"aria-label": t("自定义颜色"),
									onClick: () => canvas.value?.cancel(),
									onChange: (e: Event) =>
										setColor((e.target as HTMLInputElement).value),
									onBlur: () => {
										if (modal.value === "colors") canvas.value?.cancel();
									},
									onInput: (e: Event) =>
										setColor((e.target as HTMLInputElement).value),
								}),
							]),
				];
			if (modal.value === "view")
				return [
					h("div", { class: "cube-notes__view-actions" }, [
						choice("页面", togglePages),
						choice(
							page.value && isInfinitePage(page.value) ? "查看全部" : "适合宽度",
							() => {
								fit(false, false);
								modal.value = "";
							},
						),
						...(!props.readonly
							? [
									choice("吸附设置", () => (modal.value = "snap")),
									choice("纸张", () => (modal.value = "paper")),
									choice("保存区域", () => openScene()),
									choice("页面操作", () => (modal.value = "pages")),
								]
							: []),
						choice("导出", () => (modal.value = "export")),
					]),
					!props.readonly
						? h("label", { class: "cube-notes__toggle" }, [
								h("input", {
									type: "checkbox",
									checked: fingerDraw.value,
									disabled: props.readonly,
									onChange: (e: Event) =>
										(fingerDraw.value = (e.target as HTMLInputElement).checked),
								}),
								t("手指书写"),
							])
						: null,
					h("label", { class: "cube-notes__mobile-zoom" }, [
						t("缩放"),
						h(
							"select",
							{
								"aria-label": t("缩放"),
								value: String(Math.round(zoom.value * 100)),
								onChange: (e: Event) =>
									setZoom(Number((e.target as HTMLSelectElement).value) / 100),
							},
							Array.from(
								new Set([
									25,
									50,
									75,
									100,
									150,
									200,
									300,
									400,
									Math.round(zoom.value * 100),
								]),
							)
								.sort((a, b) => a - b)
								.map((value) => h("option", { value: String(value) }, `${value}%`)),
						),
					]),
				];
			const p = page.value;
			if (!p) return [];
			if (modal.value === "scene")
				return [
					h("label", { class: "cube-notes__scene-name" }, [
						h("span", t("区域名称")),
						h("input", {
							value: sceneName.value,
							maxlength: 256,
							autofocus: true,
							"aria-label": t("区域名称"),
							onInput: (e: Event) =>
								(sceneName.value = (e.target as HTMLInputElement).value),
							onKeydown: (e: KeyboardEvent) => {
								if (e.key === "Enter") {
									e.preventDefault();
									saveScene();
								}
							},
						}),
					]),
					h("div", { class: "cube-notes__row" }, [
						choice("取消", () => (modal.value = "")),
						choice("保存", saveScene, false, !sceneName.value.trim()),
					]),
				];
			if (modal.value === "snap")
				return [
					...[
						["网格吸附", snapGrid],
						["对齐辅助线", alignGuides],
					].map(([label, value]) =>
						h("label", { class: "cube-notes__toggle" }, [
							h("input", {
								type: "checkbox",
								checked: (value as typeof snapGrid).value,
								onChange: (e: Event) =>
									((value as typeof snapGrid).value = (
										e.target as HTMLInputElement
									).checked),
							}),
							t(label as string),
						]),
					),
					h("p", { class: "cube-notes__hint" }, t("按住 Option / Alt 暂时关闭吸附")),
				];
			if (modal.value === "selection")
				return [
					colorControls(true),
					widthControl(),
					h(
						"div",
						{ class: "cube-notes__arrange-options" },
						[
							["左对齐", "left"],
							["水平居中", "center"],
							["顶部对齐", "top"],
							["水平等距", "horizontal"],
							["垂直等距", "vertical"],
						].map(([label, action]) =>
							choice(
								label,
								() => arrangeSelection(action),
								false,
								selected.value.length <
									(["horizontal", "vertical"].includes(action) ? 3 : 2),
							),
						),
					),
					h("div", { class: "cube-notes__row" }, [
						choice("缩小选中内容", () => scaleSelection(0.9)),
						choice("放大选中内容", () => scaleSelection(1.1)),
					]),
				];
			if (modal.value === "tools")
				return [
					h(
						"div",
						{ class: "cube-notes__shape-options" },
						tools
							.filter((item) => ["line", "rectangle", "ellipse"].includes(item.id))
							.map((item) =>
								h(
									"button",
									{
										type: "button",
										class: [
											"cube-notes__shape-option",
											tool.value === item.id && "is-active",
										],
										"data-tool": item.id,
										onClick: () => {
											selectTool(item.id);
											modal.value = "";
										},
									},
									[icon(item.id), h("span", t(item.label))],
								),
							),
					),
				];
			if (modal.value === "ink")
				return [
					tool.value === "pen" && !mobile.value
						? h(
								"div",
								{
									class: "cube-notes__pen-styles",
									role: "group",
									"aria-label": t("笔型"),
								},
								penStyles.value.map((style) =>
									h(
										"button",
										{
											type: "button",
											class: [
												"cube-notes__pen-style",
												penStyle.value === style.id && "is-active",
											],
											"aria-label": brushLabel(style),
											"aria-pressed": penStyle.value === style.id,
											"data-pen-style": style.id,
											onClick: () => selectPenStyle(style.id),
										},
										[
											penPreview(
												style.id,
												Math.min(style.defaults.width, 18),
											),
											h("strong", brushLabel(style)),
											h(
												"small",
												props.locale.startsWith("zh")
													? style.hint
													: style.hintEn,
											),
										],
									),
								),
							)
						: null,
					h(
						"div",
						{ class: "cube-notes__ink-preview" },
						tool.value === "pen"
							? [penPreview(penStyle.value, width.value, pressure.value, "active")]
							: [
									h("span", {
										style: {
											background: color.value,
											height: `${Math.min(width.value, 16)}px`,
											opacity: tool.value === "highlighter" ? 0.5 : 1,
										},
									}),
								],
					),
					...(!mobile.value
						? [
								h("h3", t("笔迹颜色")),
								colorControls(true),
								h("label", { class: "cube-notes__custom-color" }, [
									h("span", t("自定义颜色")),
									h("input", {
										type: "color",
										value: color.value,
										"aria-label": t("自定义颜色"),
										onInput: (e: Event) =>
											setColor((e.target as HTMLInputElement).value),
									}),
								]),
							]
						: []),
					h("h3", t("笔迹粗细")),
					widthControl(),
					tool.value === "pen" && activeBrush.value.strength
						? h("label", { class: "cube-notes__width cube-notes__width--strength" }, [
								h("span", brushLabel(activeBrush.value.strength)),
								h("input", {
									type: "range",
									min: activeBrush.value.strength.min * 100,
									max: 100,
									step: activeBrush.value.strength.step * 100,
									value: Math.round(inkOpacity.value * 100),
									"aria-label": brushLabel(activeBrush.value.strength),
									onInput: (e: Event) => {
										inkOpacity.value =
											Number((e.target as HTMLInputElement).value) / 100;
									},
								}),
								h("output", `${Math.round(inkOpacity.value * 100)}%`),
							])
						: null,
					...(tool.value === "pen"
						? (activeBrush.value.parameters ?? []).map((parameter) =>
								h(
									"label",
									{ class: "cube-notes__width cube-notes__width--parameter" },
									[
										h("span", brushLabel(parameter)),
										h("input", {
											type: "range",
											min: parameter.min,
											max: parameter.max,
											step: parameter.step,
											value:
												inkSettings.value[parameter.id] ??
												parameter.default,
											"aria-label": brushLabel(parameter),
											onInput: (e: Event) => {
												inkSettings.value = {
													...inkSettings.value,
													[parameter.id]: Number(
														(e.target as HTMLInputElement).value,
													),
												};
											},
										}),
										h(
											"output",
											String(
												inkSettings.value[parameter.id] ??
													parameter.default,
											),
										),
									],
								),
							)
						: []),
					tool.value === "pen"
						? h(
								"p",
								{ class: "cube-notes__hint" },
								props.locale.startsWith("zh")
									? activeBrush.value.hint
									: activeBrush.value.hintEn,
							)
						: null,
					h("label", { class: "cube-notes__toggle" }, [
						h("input", {
							type: "checkbox",
							checked: pressure.value,
							disabled: tool.value !== "pen" || !activeBrush.value.supportsPressure,
							onChange: (e: Event) => {
								pressure.value = (e.target as HTMLInputElement).checked;
							},
						}),
						t("压感"),
					]),
					tool.value === "pen" && activeBrush.value.supportsPressure
						? h(
								"p",
								{ class: "cube-notes__hint" },
								t("手指：慢写粗、快写细；压感笔：轻写细、重写粗。"),
							)
						: null,
				];
			if (modal.value === "paper")
				return [
					h("h3", t("纸张模板")),
					h(
						"div",
						{ class: "cube-notes__paper-options" },
						(["plain", "ruled", "grid", "dotted"] as PaperStyle[]).map((style, i) =>
							h(
								"button",
								{
									type: "button",
									class: [
										"cube-notes__template",
										p.paper === style && "is-active",
									],
									"aria-pressed": p.paper === style,
									onClick: () =>
										changePage((p) => {
											p.paper = style;
										}),
								},
								[
									h("span", { class: ["cube-notes__sample", `paper-${style}`] }),
									t(["空白", "横线", "方格", "点阵"][i]),
								],
							),
						),
					),
					h("h3", t("纸张颜色")),
					h(
						"div",
						{ class: "cube-notes__swatches" },
						["#ffffff", "#fffdf7", "#eef5fc", "#202b3f"].map((c) =>
							h(
								"button",
								{
									type: "button",
									style: { background: c },
									class: ["cube-notes__swatch", p.color === c && "is-active"],
									"aria-label": `${t("纸张颜色")} ${c}`,
									"aria-pressed": p.color === c,
									onClick: () =>
										changePage((p) => {
											p.color = c;
										}),
								},
								p.color === c ? [icon("check")] : [],
							),
						),
					),
					...(isInfinitePage(p)
						? [h("p", { class: "cube-notes__hint" }, t("无限画布 · 向任意方向延伸"))]
						: [
								choice("扩展为无限画布", () => {
									changePage((p) => {
										p.infinite = true;
									});
									modal.value = "";
								}),
								h("h3", t("纸张尺寸")),
								h(
									"div",
									{ class: "cube-notes__row" },
									[
										["A4", 595.28, 841.89],
										["A5", 419.53, 595.28],
										["Letter", 612, 792],
									].map(([label, w, height]) =>
										choice(
											String(label),
											() =>
												changePage((p) => {
													p.width = Number(w);
													p.height = Number(height);
												}),
											Math.abs(Math.min(p.width, p.height) - Number(w)) < 1,
										),
									),
								),
								h("div", { class: "cube-notes__row" }, [
									choice(
										"纵向",
										() =>
											changePage((p) => {
												const w = Math.min(p.width, p.height),
													height = Math.max(p.width, p.height);
												p.width = w;
												p.height = height;
											}),
										p.height >= p.width,
									),
									choice(
										"横向",
										() =>
											changePage((p) => {
												const w = Math.max(p.width, p.height),
													height = Math.min(p.width, p.height);
												p.width = w;
												p.height = height;
											}),
										p.width > p.height,
									),
								]),
								h(
									"p",
									{ class: "cube-notes__hint" },
									t("调整纸张尺寸不会缩放笔迹。"),
								),
							]),
				];
			if (modal.value === "pages")
				return [
					choice("纸张", () => {
						modal.value = "paper";
					}),
					choice("添加页面", () => {
						addPage();
						modal.value = "";
					}),
					choice("复制页面", duplicatePage),
					h("div", { class: "cube-notes__row" }, [
						choice("向前移动", () => reorder(-1), false, active.value === 0),
						choice(
							"向后移动",
							() => reorder(1),
							false,
							active.value === book.value!.pages.length - 1,
						),
					]),
					choice(
						"书签",
						() =>
							changePage((p) => {
								p.bookmarked = !p.bookmarked;
							}),
						p.bookmarked,
					),
					choice("图层", () => {
						modal.value = "layers";
					}),
					choice("清除本页", () => {
						modal.value = "clear";
					}),
					choice(
						"删除页面",
						() => {
							modal.value = "delete";
						},
						false,
						book.value!.pages.length <= 1,
					),
				];
			if (modal.value === "layers")
				return [
					...p.layers.map((layer) =>
						h("div", { class: "cube-notes__layer" }, [
							h("span", layer.name),
							choice(
								layer.visible ? "隐藏图层" : "显示图层",
								() =>
									changePage((p) => {
										const l = p.layers.find((l) => l.id === layer.id)!;
										l.visible = !l.visible;
									}),
								layer.visible,
							),
						]),
					),
					choice(
						"新建图层",
						() =>
							changePage((p) => {
								p.layers.push({
									id: uid(),
									name: `${t("图层")} ${p.layers.length + 1}`,
									visible: true,
									elements: [],
								});
							}),
						false,
						p.layers.length >= 100,
					),
				];
			if (modal.value === "export")
				return [
					...[
						["cubenote", "CubeOffice 笔记", "保留笔迹、纸张与书签，可继续编辑"],
						["pdf", "PDF 文档", "适合分享与打印，导出页面外观"],
						["png", "PNG 图片（当前页）", "保留纸张和笔迹，导出完整当前页"],
						["png-zip", "全部页面图片（ZIP）", "每页一张 PNG 图片，按页码打包"],
						["xopp", "Xournal++ 笔记", "基础笔迹和文字；连接线转为笔迹，不含区域书签"],
					].map(([format, label, help]) =>
						h(
							"button",
							{
								class: "cube-notes__export-option",
								disabled: busy.value,
								onClick: async () => {
									busy.value = true;
									error.value = "";
									try {
										const fileName = `${name.value.replace(/\.[^.]+$/, "")}${format === "png" ? `-page-${active.value + 1}.png` : format === "png-zip" ? "-pages.zip" : `.${format}`}`;
										const blob = await exportFile(format);
										emit("export", blob, fileName, format);
										modal.value = "";
									} catch (reason) {
										report(reason);
									} finally {
										busy.value = false;
									}
								},
							},
							[
								icon(format === "cubenote" ? "save" : "export"),
								h("span", [h("strong", t(label)), h("small", t(help))]),
							],
						),
					),
				];
			return [
				h("p", t(modal.value === "delete" ? "删除当前页面？" : "清除本页内容？")),
				h("p", { class: "cube-notes__hint" }, t("此操作可以撤销。")),
				h("div", { class: "cube-notes__row" }, [
					choice("取消", () => {
						modal.value = "";
					}),
					h(
						"button",
						{
							class: "cube-notes__choice is-danger",
							onClick: () => {
								if (modal.value === "delete") deletePage();
								else {
									changePage((p) =>
										p.layers.forEach((l) => {
											l.elements = [];
										}),
									);
									modal.value = "";
								}
							},
						},
						t(modal.value === "delete" ? "删除" : "清除"),
					),
				]),
			];
		}
		const trayPens = computed(() => {
			void color.value;
			return penStyles.value.map((style) => ({
				id: style.id,
				label: brushLabel(style),
				color: style.id === penStyle.value ? penColor : penPresets[style.id].color,
				width: style.id === penStyle.value ? penWidth.value : penPresets[style.id].width,
			}));
		});
		return () => {
			const p = page.value,
				count = book.value?.pages.length ?? 0;
			const writable = ready.value && !props.readonly && !busy.value;
			const state = props.readonly
				? t("只读模式")
				: dirty.value || (draft.value && draftVersion.value > 0)
					? t("未保存更改")
					: savedOnce.value
						? t("已保存到文件")
						: props.source
							? t("未修改")
							: t("新笔记 · 尚未保存到文件");
			const dock = !props.readonly
				? mobile.value
					? paletteOpen.value
						? h(ToolTray, {
								ref: tray,
								locale: props.locale,
								wide: rootWidth.value >= 680,
								pens: trayPens.value,
								tool: tool.value,
								penStyle: penStyle.value,
								color: color.value,
								highlighterColor,
								highlighterWidth: highlighterWidth.value,
								eraserWidth: eraserWidth.value,
								disabled: !writable,
								canUndo: history.value?.canUndo(),
								canRedo: history.value?.canRedo(),
								onPen: (style: PenStyle) => {
									selectPenStyle(style);
									selectTool("pen");
								},
								onTool: (value: NoteTool) => selectTool(value),
								onSettings: () => {
									modal.value = "ink";
								},
								onUndo: undo,
								onRedo: redo,
								onColor: setColor,
								onColors: () => {
									modal.value = "colors";
								},
								onMore: () => {
									modal.value = "palette";
								},
								onMove: () => {
									modal.value = "";
								},
							})
						: h("div", { class: "cube-notes__dock" }, [
								h(
									"div",
									{
										class: "cube-notes__toolbar",
										role: "toolbar",
										"aria-label": t("笔迹与文字"),
									},
									[
										h("div", { class: "cube-notes__tools" }, [
											button(
												"画笔",
												"pen",
												() => selectTool("pen"),
												!writable,
												false,
												{ "data-tool": "pen", "aria-pressed": false },
											),
											button(
												"文字",
												"text",
												() => selectTool("text"),
												!writable,
												tool.value === "text",
												{
													"data-tool": "text",
													"aria-pressed": tool.value === "text",
												},
											),
											button(
												"形状",
												"shapes",
												() => {
													modal.value =
														modal.value === "tools" ? "" : "tools";
												},
												!writable,
												["line", "rectangle", "ellipse"].includes(
													tool.value,
												),
											),
										]),
									],
								),
							])
					: h("div", { class: "cube-notes__dock" }, [
							h(
								"div",
								{
									class: "cube-notes__toolbar",
									role: "toolbar",
									"aria-label": t("笔迹与文字"),
								},
								[
									h("div", { class: "cube-notes__tools" }, [
										...tools
											.filter(
												(item) =>
													!["line", "rectangle", "ellipse"].includes(
														item.id,
													),
											)
											.map((item) =>
												button(
													item.label,
													item.id,
													() => {
														if (
															tool.value === item.id &&
															[
																"pen",
																"highlighter",
																"eraser",
															].includes(item.id)
														)
															modal.value =
																modal.value === "ink" ? "" : "ink";
														else selectTool(item.id);
													},
													!writable,
													tool.value === item.id,
													{
														title: `${t(item.label)} (${item.key})`,
														"aria-pressed": tool.value === item.id,
														"data-tool": item.id,
														"data-pen-label":
															item.id === "pen"
																? t(
																		penStyles.value.find(
																			(style) =>
																				style.id ===
																				penStyle.value,
																		)!.label,
																	)
																: undefined,
													},
												),
											),
										button(
											"形状",
											["line", "rectangle", "ellipse"].includes(tool.value)
												? tool.value
												: "shapes",
											() => {
												modal.value =
													modal.value === "tools" ? "" : "tools";
											},
											!writable,
											["line", "rectangle", "ellipse"].includes(tool.value),
										),
									]),
									h(
										"div",
										{
											class: "cube-notes__properties",
											role: "group",
											"aria-label": t("工具设置"),
										},
										["hand", "lasso"].includes(tool.value)
											? [
													h(
														"span",
														{ class: "cube-notes__tool-hint" },
														t(
															tool.value === "lasso"
																? "单击或圈选内容"
																: "仅触控笔书写，手指移动页面",
														),
													),
													tool.value === "lasso" ? colorControls() : null,
												]
											: [
													tool.value !== "eraser"
														? colorControls()
														: h(
																"span",
																{
																	class: "cube-notes__tool-hint",
																},
																t("擦除整条笔迹"),
															),
													tool.value !== "eraser"
														? button(
																"更多颜色",
																"palette",
																() => {
																	modal.value =
																		modal.value === "ink"
																			? ""
																			: "ink";
																},
																!writable,
															)
														: null,
													h(
														"div",
														{
															class: "cube-notes__widths",
															role: "group",
															"aria-label": t("常用粗细"),
														},
														(tool.value === "highlighter"
															? [8, 14, 22]
															: tool.value === "eraser"
																? [5, 10, 20]
																: tool.value === "pen"
																	? (activeBrush.value
																			.quickWidths ?? [
																			activeBrush.value
																				.defaults.width / 2,
																			activeBrush.value
																				.defaults.width,
																			Math.min(
																				activeBrush.value
																					.maxWidth,
																				activeBrush.value
																					.defaults
																					.width * 2,
																			),
																		])
																	: [1, 2, 4]
														).map((value, index) =>
															h(
																"button",
																{
																	type: "button",
																	class: [
																		"cube-notes__width-preset",
																		value === width.value &&
																			"is-active",
																	],
																	"aria-label": `${t("笔迹粗细")} ${value} pt`,
																	"aria-pressed":
																		value === width.value,
																	disabled: !writable,
																	onClick: () => setWidth(value),
																},
																[
																	h("span", {
																		class: "cube-notes__width-dot",
																		"aria-hidden": "true",
																		style: {
																			width: `${[4, 8, 14][index]}px`,
																			height: `${[4, 8, 14][index]}px`,
																		},
																	}),
																	h(
																		"small",
																		{ "aria-hidden": "true" },
																		`${value}pt`,
																	),
																],
															),
														),
													),
													button(
														"画笔设置",
														"settings",
														() => {
															modal.value =
																modal.value === "ink" ? "" : "ink";
														},
														!writable,
													),
												],
									),
								],
							),
						])
				: null;

			return h(
				"section",
				{
					ref: root,
					class: [
						"cube-notes",
						props.compact && "cube-notes--compact",
						mobile.value && "cube-notes--mobile",
						mobile.value && !props.readonly && paletteOpen.value && "is-writing",
						mobile.value && !props.readonly && paletteOpen.value && "has-pen-tray",
						rail.resizing.value && "is-resizing-sidebar",
					],
					style: { "--notes-sidebar-width": `${rail.width.value}px` },
					"data-readonly": props.readonly,
					"data-host-reading-menu": props.hostReadingMenu,
					"aria-label": t("手写笔记"),
					onKeydown: shortcut,
					onPointerdownCapture: (e: PointerEvent) => {
						if (
							popover.value &&
							modal.value !== "tape" &&
							!(e.target as HTMLElement).closest(
								".cube-notes__popover,.cube-notes__dock,.cube-notes__selection-bar,.cube-notes__tapes,[data-popover-trigger]",
							)
						)
							modal.value = "";
					},
				},
				[
					tapeEditing.value && !props.readonly
						? h(
								"nav",
								{
									class: "cube-notes__tape-controls",
									"aria-label": t("摆放美纹纸"),
								},
								[
									h("small", t("单指移动 · 双指旋转 · 拖端点调整")),
									h("div", [
										button(
											"贴一条",
											"plus",
											() => addTape(),
											(p?.tapes?.length ?? 0) >= 24,
										),
										button(
											"四边留白",
											"scene",
											() => addTape(true),
											(p?.tapes?.length ?? 0) > 20,
										),
										button(
											"胶带宽度",
											"settings",
											() =>
												(modal.value =
													modal.value === "tape" ? "" : "tape"),
											!activeTape.value,
											false,
											{ "data-popover-trigger": true },
										),
										button(
											"撕下选中胶带",
											"trash",
											() => removeTape(),
											!activeTape.value,
										),
										choice(
											"全部撕下",
											() => removeTape(true),
											false,
											!p?.tapes?.length,
										),
										button(
											"开始绘画",
											"check",
											() => {
												modal.value = "";
												selectTool("pen");
											},
											false,
											true,
										),
									]),
								],
							)
						: null,
					mobile.value && !props.hostReadingMenu
						? button("页面", "pages", togglePages, !ready.value, sidebar.value, {
								class: "cube-notes__button cube-notes__top-pages",
								"aria-expanded": sidebar.value,
							})
						: null,
					h("header", { class: "cube-notes__header" }, [
						button("页面", "pages", togglePages, !ready.value, sidebar.value, {
							"aria-expanded": sidebar.value,
						}),
						h("div", { class: "cube-notes__title" }, [
							h("strong", name.value.replace(/\.[^.]+$/, "")),
							h("span", { role: "status" }, drawing.value ? t("正在书写") : state),
						]),
						!props.readonly && (!mobile.value || !paletteOpen.value)
							? h("div", { class: "cube-notes__history" }, [
									button(
										"撤销",
										"undo",
										undo,
										!writable || !history.value?.canUndo(),
									),
									button(
										"重做",
										"redo",
										redo,
										!writable || !history.value?.canRedo(),
									),
								])
							: null,
						button("美纹纸", "tape", openTape, !writable),
						button(
							"纸张",
							"paper",
							() => {
								modal.value = "paper";
							},
							!writable,
						),
						button(
							"吸附设置",
							"snap",
							() => (modal.value = modal.value === "snap" ? "" : "snap"),
							!ready.value,
							snapGrid.value,
							{ "data-popover-trigger": true },
						),

						button(
							"保存",
							mobile.value ? "export" : "save",
							() => {
								finishText();
								emit("save");
							},
							!writable,
						),
						mobile.value && paletteOpen.value && !props.readonly
							? button(
									"完成书写",
									"check",
									() => {
										paletteOpen.value = false;
										selectTool("lasso");
										modal.value = "";
									},
									!writable,
									false,
									{ class: "cube-notes__button cube-notes__done-drawing" },
								)
							: null,
						button(
							"导出",
							"export",
							() => {
								modal.value = "export";
							},
							!ready.value || busy.value,
						),
						mobile.value && props.readonly && !props.hostReadingMenu
							? button(
									"视图选项",
									"more",
									() => {
										modal.value = "view";
									},
									!ready.value,
									false,
									{
										class: "cube-notes__button cube-notes__reader-options",
										"data-popover-trigger": true,
									},
								)
							: null,
					]),
					error.value
						? h("div", { class: "cube-notes__error", role: "alert" }, [
								h("span", error.value),
								button("关闭", "close", () => {
									error.value = "";
								}),
							])
						: null,
					h("div", { class: "cube-notes__body" }, [
						sidebar.value && book.value
							? h(
									"aside",
									{ class: "cube-notes__sidebar", "aria-label": t("页面") },
									[
										h("div", { class: "cube-notes__sidebar-header" }, [
											h("strong", `${t("页面")} · ${count}`),
											button(
												"添加页面",
												"plus",
												addPage,
												!writable || count >= LIMITS.pages,
											),
											button("关闭", "close", () => {
												sidebar.value = false;
												nextTick(() => {
													if (fitMode.value) fit();
												});
											}),
										]),
										h(
											"div",
											{
												class: "cube-notes__rail-tabs",
												role: "group",
												"aria-label": t("页面"),
											},
											[
												choice(
													"页面",
													() => (railTab.value = "pages"),
													railTab.value === "pages",
												),
												choice(
													"区域",
													() => (railTab.value = "scenes"),
													railTab.value === "scenes",
												),
											],
										),
										railTab.value === "scenes" ? sceneRail() : null,
										railTab.value === "pages"
											? h("div", { class: "cube-notes__page-filters" }, [
													choice(
														"全部页面",
														() => {
															bookmarksOnly.value = false;
														},
														!bookmarksOnly.value,
													),
													choice(
														"只看书签",
														() => {
															bookmarksOnly.value = true;
														},
														bookmarksOnly.value,
													),
												])
											: null,
										railTab.value === "pages"
											? h(
													"div",
													{ class: "cube-notes__page-list" },
													book.value.pages.map((notePage, index) =>
														bookmarksOnly.value && !notePage.bookmarked
															? null
															: h(
																	"button",
																	{
																		class: [
																			"cube-notes__thumbnail",
																			index ===
																				active.value &&
																				"is-active",
																		],
																		"aria-label":
																			pageTitle(index),
																		"aria-current":
																			index === active.value
																				? "page"
																				: undefined,
																		onClick: () =>
																			navigate(index),
																	},
																	[
																		h("img", {
																			alt: "",
																			loading: "lazy",
																			src:
																				thumbCache.get(
																					notePage,
																				) ??
																				(() => {
																					const url =
																						pageSvgUrl(
																							notePage,
																						);
																					thumbCache.set(
																						notePage,
																						url,
																					);
																					return url;
																				})(),
																		}),
																		h("span", [
																			pageTitle(index),
																			notePage.bookmarked
																				? icon("bookmark")
																				: null,
																		]),
																	],
																),
													),
												)
											: null,
										railTab.value === "pages" &&
										bookmarksOnly.value &&
										!book.value.pages.some((p) => p.bookmarked)
											? h("p", { class: "cube-notes__hint" }, t("没有书签页"))
											: null,
										rail.renderHandle(),
									],
								)
							: null,
						h("main", { class: "cube-notes__stage" }, [
							dock,
							h(
								"div",
								{ class: "cube-notes__canvas-stage" },
								p && ready.value
									? [
											h(NoteCanvas, {
												ref: canvas,
												page: p,
												tool: tapeEditing.value ? "hand" : tool.value,
												color: color.value,
												width: width.value,
												inkOpacity: inkOpacity.value,
												highlighterOpacity: highlighterOpacity.value,
												pressure: pressure.value,
												penStyle: penStyle.value,
												brushSettings: inkSettings.value,
												fingerDraw: fingerDraw.value,
												readonly: props.readonly,
												editTapes: tapeEditing.value,
												activeTape: activeTape.value,
												onTapeUpdate: (
													id: string,
													patch: Partial<MaskingTape>,
												) => updateTape(id, patch),
												onTapeSelect: (id: string) =>
													(activeTape.value = id),
												zoom: zoom.value,
												selected: selected.value,
												snapGrid: snapGrid.value,
												alignGuides: alignGuides.value,
												locale: props.locale,
												onLayout: (position: { x: number; y: number }) =>
													(selectionPosition.value = position),
												onResize: resizeSelection,
												onConnect: connectShape,
												onAdd: (e: InkElement) => {
													add(e);
													if (e.kind === "stroke" && e.shape) {
														tool.value = "lasso";
														selected.value = [e.id];
													}
												},
												onErase: erase,
												onMove: moveSelection,
												onSelect: (ids: string[]) => {
													// Clone connections in the same transaction rather than adding another undo step.
													selected.value = ids;
												},
												onText: startText,
												onZoom: setZoom,
												onGesture: (value: boolean) => {
													drawing.value = value;
												},
											}),
											selected.value.length &&
											!drawing.value &&
											!props.readonly
												? h(
														"div",
														{
															class: "cube-notes__selection-bar",
															style: {
																left: `${selectionPosition.value.x}px`,
																top: `${selectionPosition.value.y}px`,
															},
															role: "toolbar",
															"aria-label": t("选中内容"),
														},
														[
															h("span", `${selected.value.length}`),
															colorControls(),
															h(
																"button",
																{
																	type: "button",
																	class: "cube-notes__button cube-notes__selection-color",
																	style: {
																		"--ink-color": color.value,
																	},
																	"aria-label": t("笔迹颜色"),
																	title: t("笔迹颜色"),
																	onClick: () =>
																		(modal.value =
																			modal.value ===
																			"selection"
																				? ""
																				: "selection"),
																},
																h("span", {
																	class: "cube-notes__color-dot",
																}),
															),
															button(
																"排列选中内容",
																"settings",
																() =>
																	(modal.value =
																		modal.value === "selection"
																			? ""
																			: "selection"),
																!writable,
															),
															selected.value.length === 1 &&
															pageElements(p).some(
																(e) =>
																	e.id === selected.value[0] &&
																	connectable(e),
															)
																? button(
																		"添加连接形状",
																		"connector",
																		() => quickConnect(),
																		!writable,
																	)
																: null,
															selected.value.length === 1 &&
															pageElements(p).find(
																(e) => e.id === selected.value[0],
															)?.kind === "text"
																? button(
																		"编辑文字",
																		"edit",
																		() => {
																			const text =
																				pageElements(
																					p,
																				).find(
																					(e) =>
																						e.id ===
																						selected
																							.value[0],
																				) as InkText;
																			startText(
																				{
																					x: text.x,
																					y: text.y,
																					pressure: 0.5,
																				},
																				text,
																			);
																		},
																		!writable,
																	)
																: null,
															button(
																"保存区域",
																"scene",
																() => openScene(),
																!writable,
															),
															button(
																"复制选中内容",
																"copy",
																duplicateSelection,
																!writable,
															),
															button(
																"删除选中内容",
																"trash",
																() => {
																	erase(selected.value);
																	selected.value = [];
																},
																!writable,
															),
														],
													)
												: null,
											draft.value
												? h("div", { class: "cube-notes__text-box" }, [
														h(
															"label",
															{
																class: "cube-notes__sr",
																for: "cube-note-text",
															},
															t("编辑文字"),
														),
														h("textarea", {
															ref: textInput,
															id: "cube-note-text",
															value: draft.value.text,
															rows: 5,
															"aria-label": t("编辑文字"),
															onInput: (e: Event) => {
																if (draft.value) {
																	draft.value.text = (
																		e.target as HTMLTextAreaElement
																	).value;
																	changedDraft();
																}
															},
															onKeydown: (e: KeyboardEvent) => {
																if (e.key === "Escape")
																	draft.value = undefined;
																else if (
																	(e.ctrlKey || e.metaKey) &&
																	e.key === "Enter"
																)
																	finishText();
															},
														}),
														h("div", { class: "cube-notes__row" }, [
															h("label", [
																t("文字大小"),
																h("input", {
																	type: "number",
																	min: 6,
																	max: 100,
																	value: draft.value.size,
																	onChange: (e: Event) => {
																		if (draft.value) {
																			draft.value.size =
																				Math.max(
																					6,
																					Math.min(
																						100,
																						Number(
																							(
																								e.target as HTMLInputElement
																							).value,
																						) || 16,
																					),
																				);
																			changedDraft();
																		}
																	},
																}),
															]),
															choice("取消", () => {
																draft.value = undefined;
															}),
															choice("完成", finishText),
														]),
													])
												: null,
										]
									: h(
											"p",
											{ class: "cube-notes__loading", role: "status" },
											error.value ? "" : t("正在打开笔记…"),
										),
							),
						]),
					]),
					mobile.value
						? props.readonly
							? null
							: h(
									"nav",
									{
										class: "cube-notes__mobile-navigation",
										"aria-label": t("视图选项"),
									},
									[
										button(
											"视图选项",
											"fit",
											() =>
												(modal.value =
													modal.value === "view" ? "" : "view"),
											!ready.value,
											modal.value === "view",
											{ "data-popover-trigger": true },
										),
									],
								)
						: h("footer", { class: "cube-notes__footer" }, [
								h("div", { class: "cube-notes__row" }, [
									button(
										"上一页",
										"left",
										() => navigate(active.value - 1),
										!ready.value || active.value === 0,
									),
									h("span", `${active.value + 1} / ${count || 1}`),
									button(
										"下一页",
										"right",
										() => navigate(active.value + 1),
										!ready.value || active.value >= count - 1,
									),
									button(
										"添加页面",
										"plus",
										addPage,
										!writable || count >= LIMITS.pages,
									),
									button("保存区域", "scene", () => openScene(), !writable),
									button(
										"书签",
										"bookmark",
										() =>
											changePage((p) => {
												p.bookmarked = !p.bookmarked;
											}),
										!writable,
										p?.bookmarked,
									),
									button(
										"页面操作",
										"more",
										() => {
											modal.value = "pages";
										},
										!writable,
									),
								]),
								!props.readonly
									? h(
											"button",
											{
												class: [
													"cube-notes__button",
													"cube-notes__finger-button",
													fingerDraw.value && "is-active",
												],
												"aria-label": t("手指书写"),
												"aria-pressed": fingerDraw.value,
												onClick: () => {
													fingerDraw.value = !fingerDraw.value;
												},
											},
											t("手指"),
										)
									: null,
								h("div", { class: "cube-notes__row cube-notes__zoom" }, [
									h(
										"select",
										{
											value: String(Math.round(zoom.value * 100)),
											"aria-label": t("缩放"),
											onChange: (e: Event) =>
												setZoom(
													Number((e.target as HTMLSelectElement).value) /
														100,
												),
										},
										Array.from(
											new Set([
												25,
												50,
												75,
												100,
												125,
												150,
												200,
												300,
												400,
												Math.round(zoom.value * 100),
											]),
										)
											.sort((a, b) => a - b)
											.map((value) =>
												h("option", { value: String(value) }, `${value}%`),
											),
									),
									button(
										p && isInfinitePage(p) ? "查看全部" : "适合宽度",
										"fit",
										() => fit(false, false),
										!ready.value,
									),
								]),
							]),
					colorSampling.value
						? h(
								"div",
								{
									class: "cube-notes__color-sampling",
									onPointerdown: moveColorSample,
									onPointermove: moveColorSample,
									onPointerup: (e: PointerEvent) => {
										moveColorSample(e);
										if (sampledColor.value) setColor(sampledColor.value);
										stopColorSample();
									},
									onPointercancel: stopColorSample,
								},
								[
									h(
										"span",
										{
											class: "cube-notes__color-loupe",
											style: {
												left: `${samplePoint.value.x}px`,
												top: `${samplePoint.value.y}px`,
												background: sampledColor.value || "#fff",
											},
										},
										sampledColor.value.toUpperCase(),
									),
									h(
										"button",
										{
											type: "button",
											class: "cube-notes__color-sampling-cancel",
											onPointerdown: (e: PointerEvent) => e.stopPropagation(),
											onPointerup: (e: PointerEvent) => e.stopPropagation(),
											onClick: stopColorSample,
										},
										t("取消取色"),
									),
								],
							)
						: null,
					h(
						popover.value ? "div" : "dialog",
						{
							ref: dialog,
							class: [
								"cube-notes__dialog",
								popover.value && "cube-notes__popover",
								modal.value === "colors" &&
									!props.nativeColorPicker &&
									"cube-notes__native-colors",
							],
							tabindex: -1,
							role: popover.value ? "dialog" : undefined,
							style: popover.value
								? { display: "block", ...trayPopover.value }
								: undefined,
							"aria-labelledby": "cube-notes-dialog-title",
							onCancel: () => {
								modal.value = "";
							},
							onClick: (e: MouseEvent) => {
								if (e.target === dialog.value) {
									const box = dialog.value!.getBoundingClientRect();
									if (
										e.clientX < box.left ||
										e.clientX > box.right ||
										e.clientY < box.top ||
										e.clientY > box.bottom
									)
										modal.value = "";
								}
							},
						},
						[
							modal.value === "colors" && !props.nativeColorPicker
								? null
								: h("header", [
										h(
											"h2",
											{ id: "cube-notes-dialog-title" },
											t(
												modal.value === "tape"
													? "美纹纸"
													: modal.value === "palette"
														? "更多工具"
														: modal.value === "colors"
															? "选择颜色"
															: modal.value === "view"
																? "视图选项"
																: modal.value === "scene"
																	? "保存区域"
																	: modal.value === "snap"
																		? "吸附设置"
																		: modal.value ===
																			  "selection"
																			? "排列选中内容"
																			: modal.value === "ink"
																				? "画笔设置"
																				: modal.value ===
																					  "tools"
																					? "形状"
																					: modal.value ===
																						  "paper"
																						? "纸张"
																						: modal.value ===
																							  "export"
																							? "导出"
																							: modal.value ===
																								  "layers"
																								? "图层"
																								: "页面操作",
											),
										),
										button("关闭", "close", () => {
											modal.value = "";
										}),
									]),
							modal.value ? modalContents() : null,
							busy.value ? h("p", { role: "status" }, t("正在导出…")) : null,
							error.value
								? h("p", { role: "alert", class: "cube-notes__error" }, error.value)
								: null,
							!(modal.value === "colors" && !props.nativeColorPicker) &&
							!["export", "clear", "delete", "scene", "tape"].includes(modal.value)
								? h("footer", [
										choice("完成", () => {
											modal.value = "";
										}),
									])
								: null,
						],
					),
				],
			);
		};
	},
});
