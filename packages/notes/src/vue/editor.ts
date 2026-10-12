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
import { readNotebook, writeNotebook, writeXopp } from "../codec.js";
import { nativeNotesFormat } from "../formats.js";
import { bounds, translate, type Bounds, type Point } from "../geometry.js";
import { NoteHistory } from "../history.js";
import {
	clone,
	createNotebook,
	createPage,
	LIMITS,
	pageElements,
	uid,
	type AnchorSide,
	type NoteScene,
	type InkElement,
	type InkPoint,
	type InkStroke,
	type InkText,
	type Notebook,
	type PaperStyle,
	type PenStyle,
} from "../model.js";
import { exportNotesPdf } from "../pdf.js";
import { pageSvgUrl, outlinePath, strokeOutline } from "../render.js";
import { NoteCanvas, type NoteTool } from "./canvas.js";
import { icon } from "./icons.js";
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
	圆珠笔: "Ballpoint",
	钢笔: "Fountain",
	毛笔: "Brush",
	均匀线条: "Uniform line",
	柔和压感: "Gentle pressure",
	明显粗细变化: "Expressive pressure",
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
const penStyles: { id: PenStyle; label: string; hint: string }[] = [
	{ id: "ballpoint", label: "圆珠笔", hint: "均匀线条" },
	{ id: "fountain", label: "钢笔", hint: "柔和压感" },
	{ id: "brush", label: "毛笔", hint: "明显粗细变化" },
];
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
}
export const NotesEditor = defineComponent({
	name: "CubeOfficeNotesEditor",
	props: {
		source: null,
		fileName: { type: String, default: "Notebook.cubenote" },
		readonly: Boolean,
		compact: Boolean,
		locale: { type: String, default: "zh-CN" },
	},
	emits: ["loaded", "error", "save", "export"],
	setup(props, { emit, expose }) {
		const t = (label: string) =>
			props.locale.startsWith("zh") ? label : (english[label] ?? label);
		const root = ref<HTMLElement>(),
			canvas = ref<{ cancel(): void; viewBounds(): Bounds; focusView(b: Bounds): void }>();
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
		const sidebar = ref(typeof window !== "undefined" && window.innerWidth >= 760),
			bookmarksOnly = ref(false),
			railTab = ref<"pages" | "scenes">("pages"),
			snapGrid = ref(false),
			alignGuides = ref(true),
			selectionPosition = ref({ x: 8, y: 8 }),
			sceneName = ref(""),
			editingScene = ref<{ pageId: string; scene: NoteScene }>();
		const penStyle = ref<PenStyle>("fountain");
		const penPresets: Record<PenStyle, { color: string; width: number; pressure: boolean }> = {
			ballpoint: { color: palette[0], width: 1.5, pressure: false },
			fountain: { color: palette[0], width: 2, pressure: true },
			brush: { color: palette[0], width: 6, pressure: true },
		};
		const mobile = ref(
			props.compact || (typeof window !== "undefined" && window.innerWidth < 760),
		);
		const writing = computed(() => ["pen", "highlighter", "eraser"].includes(tool.value));
		const pressure = ref(true),
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
				| "tools"
				| "snap"
				| "selection"
				| "scene"
				| "view"
			>(""),
			dialog = ref<HTMLDialogElement>();
		const popover = computed(() =>
			["ink", "tools", "snap", "selection", "view"].includes(modal.value),
		);
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
					if (source === undefined || source === null)
						document = createNotebook(name.value.replace(/\.[^.]+$/, ""));
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
						document = readNotebook(bytes, name.value);
					}
					if (token !== generation) return;
					history.value = new NoteHistory(document);
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
					dialog.value
						?.querySelector<HTMLElement>("button,input")
						?.focus({ preventScroll: true });
				} else if (!dialog.value?.open) dialog.value?.showModal();
			} else {
				dialog.value?.close?.();
				previousFocus?.focus({ preventScroll: true });
			}
		});
		watch(
			() => props.readonly,
			(readonly, previous) => {
				if (readonly && !previous) {
					finishText(true);
					selected.value = [];
					canvas.value?.cancel();
				}
			},
		);
		watch(active, () => {
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
					width: Math.min(page.value.width - b.x, b.width * factor),
					height: Math.min(page.value.height - b.y, b.height * factor),
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
					const x = Math.max(0, Math.min(p.width - 1, b.x)),
						y = Math.max(0, Math.min(p.height - 1, b.y));
					(p.scenes ??= []).push({
						id: uid(),
						name,
						x,
						y,
						width: Math.max(1, Math.min(p.width - x, b.width)),
						height: Math.max(1, Math.min(p.height - y, b.height)),
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
		function setColor(value: string) {
			color.value = value;
			if (tool.value === "highlighter") highlighterColor = value;
			else penColor = value;
			if (selected.value.length)
				changePage((p) =>
					p.layers.forEach((l) =>
						l.elements
							.filter((e) => selected.value.includes(e.id))
							.forEach((e) => {
								e.color = value;
							}),
					),
				);
		}
		function selectPenStyle(value: PenStyle) {
			penPresets[penStyle.value] = {
				color: penColor,
				width: penWidth.value,
				pressure: pressure.value,
			};
			const preset = penPresets[value];
			penStyle.value = value;
			penColor = color.value = preset.color;
			penWidth.value = preset.width;
			pressure.value = preset.pressure;
		}
		function selectTool(value: NoteTool) {
			finishText();
			tool.value = value;
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
				doc.pages.splice(
					index,
					0,
					createPage(previous.paper, previous.width, previous.height, previous.color),
				),
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
			copy.layers.forEach((l) => {
				l.id = uid();
				l.elements.forEach((e) => {
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
		function navigate(index: number) {
			finishText();
			canvas.value?.cancel();
			active.value = index;
			if (window.innerWidth < 760) sidebar.value = false;
		}
		function fit(fullPage = fitPage.value, cover = fitCover.value) {
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
			zoom.value = Math.max(0.25, Math.min(4, value));
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
			if (["notes", "cubenote"].includes(format)) return writeNotebook(document);
			if (["xopp", "xoj"].includes(format)) return writeXopp(document);
			if (format === "pdf") return exportNotesPdf(document, options.signal);
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
			setDocumentName: (value: string) => {
				name.value = value;
			},
		});
		function shortcut(event: KeyboardEvent) {
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
			observer = new ResizeObserver(() => {
				mobile.value =
					props.compact || (root.value?.clientWidth ?? window.innerWidth) < 760;
				rail.clampToViewport();
				if (fitMode.value && !drawing.value) fit();
			});
			if (root.value) observer.observe(root.value);
		});
		onBeforeUnmount(() => {
			generation++;
			observer?.disconnect();
			unsubscribe?.();
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
					max: tool.value === "highlighter" || tool.value === "eraser" ? 30 : 10,
					step: 0.5,
					value: width.value,
					"aria-label": t("笔迹粗细"),
					onInput: (e: Event) => setWidth(Number((e.target as HTMLInputElement).value)),
				}),
				h("output", `${width.value.toFixed(1)} pt`),
			]);
		}
		function penPreview(style: PenStyle, size: number, pressureEnabled = true) {
			const stroke: InkStroke = {
				id: "preview",
				kind: "stroke",
				tool: "pen",
				color: color.value,
				width: size,
				opacity: 1,
				pressure: pressureEnabled && style !== "ballpoint",
				penStyle: style,
				points: Array.from({ length: 65 }, (_, i) => {
					const t = i / 64;
					return {
						x: 12 + 216 * t,
						y: 30 + 10 * Math.sin(t * Math.PI * 3),
						pressure: 0.1 + 0.8 * Math.sin(t * Math.PI),
					};
				}),
			};
			return h("svg", { viewBox: "0 0 240 60", "aria-hidden": "true" }, [
				h("path", { d: outlinePath(strokeOutline(stroke)), fill: color.value }),
			]);
		}
		function modalContents() {
			if (modal.value === "view")
				return [
					h("div", { class: "cube-notes__view-actions" }, [
						choice("适合宽度", () => {
							fit(false, false);
							modal.value = "";
						}),
						choice("吸附设置", () => (modal.value = "snap")),
						choice("纸张", () => (modal.value = "paper"), false, props.readonly),
						choice("保存区域", () => openScene(), false, props.readonly),
						choice("页面操作", () => (modal.value = "pages"), false, props.readonly),
						choice("导出", () => (modal.value = "export")),
					]),
					h("label", { class: "cube-notes__toggle" }, [
						h("input", {
							type: "checkbox",
							checked: fingerDraw.value,
							disabled: props.readonly,
							onChange: (e: Event) =>
								(fingerDraw.value = (e.target as HTMLInputElement).checked),
						}),
						t("手指书写"),
					]),
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
					tool.value === "pen"
						? h(
								"div",
								{
									class: "cube-notes__pen-styles",
									role: "group",
									"aria-label": t("笔型"),
								},
								penStyles.map((style) =>
									h(
										"button",
										{
											type: "button",
											class: [
												"cube-notes__pen-style",
												penStyle.value === style.id && "is-active",
											],
											"aria-label": t(style.label),
											"aria-pressed": penStyle.value === style.id,
											"data-pen-style": style.id,
											onClick: () => selectPenStyle(style.id),
										},
										[
											penPreview(style.id, 3),
											h("strong", t(style.label)),
											h("small", t(style.hint)),
										],
									),
								),
							)
						: null,
					h(
						"div",
						{ class: "cube-notes__ink-preview" },
						tool.value === "pen"
							? [penPreview(penStyle.value, width.value, pressure.value)]
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
					h("h3", t("笔迹颜色")),
					colorControls(true),
					h("label", { class: "cube-notes__custom-color" }, [
						h("span", t("自定义颜色")),
						h("input", {
							type: "color",
							value: color.value,
							"aria-label": t("自定义颜色"),
							onInput: (e: Event) => setColor((e.target as HTMLInputElement).value),
						}),
					]),
					h("h3", t("笔迹粗细")),
					widthControl(),
					h("label", { class: "cube-notes__toggle" }, [
						h("input", {
							type: "checkbox",
							checked: pressure.value,
							disabled: tool.value !== "pen" || penStyle.value === "ballpoint",
							onChange: (e: Event) => {
								pressure.value = (e.target as HTMLInputElement).checked;
							},
						}),
						t("压感"),
					]),
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
					h("p", { class: "cube-notes__hint" }, t("调整纸张尺寸不会缩放笔迹。")),
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
										const blob = await exportFile(format);
										emit(
											"export",
											blob,
											`${name.value.replace(/\.[^.]+$/, "")}.${format}`,
											format,
										);
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
					? h("div", { class: "cube-notes__dock" }, [
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
											.filter((item) =>
												(writing.value
													? ["pen", "highlighter", "eraser", "lasso"]
													: ["pen", "text"]
												).includes(item.id),
											)
											.map((item) =>
												button(
													item.label,
													item.id,
													() => {
														if (tool.value === item.id && writing.value)
															modal.value =
																modal.value === "ink" ? "" : "ink";
														else selectTool(item.id);
													},
													!writable,
													tool.value === item.id,
													{
														"data-tool": item.id,
														"aria-pressed": tool.value === item.id,
													},
												),
											),
										writing.value
											? h(
													"button",
													{
														class: "cube-notes__button cube-notes__current-color",
														"aria-label": t("画笔设置"),
														onClick: () =>
															(modal.value =
																modal.value === "ink" ? "" : "ink"),
														disabled: !writable,
													},
													h("span", {
														class: "cube-notes__color-dot",
														style: { "--ink-color": color.value },
													}),
												)
											: button(
													"形状",
													"shapes",
													() =>
														(modal.value =
															modal.value === "tools" ? "" : "tools"),
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
																		penStyles.find(
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
																: tool.value === "pen" &&
																	  penStyle.value === "brush"
																	? [3, 6, 10]
																	: tool.value === "pen" &&
																		  penStyle.value ===
																				"ballpoint"
																		? [1, 1.5, 3]
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
						mobile.value && writing.value && "is-writing",
						rail.resizing.value && "is-resizing-sidebar",
					],
					style: { "--notes-sidebar-width": `${rail.width.value}px` },
					"data-readonly": props.readonly,
					"aria-label": t("手写笔记"),
					onKeydown: shortcut,
					onPointerdownCapture: (e: PointerEvent) => {
						if (
							popover.value &&
							!(e.target as HTMLElement).closest(
								".cube-notes__popover,.cube-notes__dock,.cube-notes__selection-bar,[data-popover-trigger]",
							)
						)
							modal.value = "";
					},
				},
				[
					h("header", { class: "cube-notes__header" }, [
						button(
							"页面",
							"pages",
							() => {
								finishText();
								sidebar.value = !sidebar.value;
								if (fitMode.value) nextTick(() => fit());
							},
							!ready.value,
							sidebar.value,
							{ "aria-expanded": sidebar.value },
						),
						h("div", { class: "cube-notes__title" }, [
							h("strong", name.value.replace(/\.[^.]+$/, "")),
							h("span", { role: "status" }, drawing.value ? t("正在书写") : state),
						]),
						!props.readonly
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
						mobile.value && writing.value && !props.readonly
							? button(
									"完成书写",
									"check",
									() => {
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
												tool: tool.value,
												color: color.value,
												width: width.value,
												pressure: pressure.value,
												penStyle: penStyle.value,
												fingerDraw: fingerDraw.value,
												readonly: props.readonly,
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
						? h(
								"nav",
								{ class: "cube-notes__mobile-navigation", "aria-label": t("页面") },
								[
									button(
										"页面",
										"pages",
										() => {
											finishText();
											sidebar.value = !sidebar.value;
										},
										!ready.value,
										sidebar.value,
										{ "aria-expanded": sidebar.value },
									),
									button(
										"视图选项",
										"fit",
										() => (modal.value = modal.value === "view" ? "" : "view"),
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
										"适合宽度",
										"fit",
										() => fit(false, false),
										!ready.value,
									),
								]),
							]),
					h(
						popover.value ? "div" : "dialog",
						{
							ref: dialog,
							class: ["cube-notes__dialog", popover.value && "cube-notes__popover"],
							role: popover.value ? "dialog" : undefined,
							style: popover.value ? { display: "block" } : undefined,
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
							h("header", [
								h(
									"h2",
									{ id: "cube-notes-dialog-title" },
									t(
										modal.value === "view"
											? "视图选项"
											: modal.value === "scene"
												? "保存区域"
												: modal.value === "snap"
													? "吸附设置"
													: modal.value === "selection"
														? "排列选中内容"
														: modal.value === "ink"
															? "画笔设置"
															: modal.value === "tools"
																? "形状"
																: modal.value === "paper"
																	? "纸张"
																	: modal.value === "export"
																		? "导出"
																		: modal.value === "layers"
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
							!["export", "clear", "delete", "scene"].includes(modal.value)
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
