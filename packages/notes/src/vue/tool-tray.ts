import {
	defineComponent,
	h,
	nextTick,
	onBeforeUnmount,
	onMounted,
	ref,
	watch,
	type PropType,
} from "vue";
import { uid, type PenStyle } from "../model.js";
import { icon } from "./icons.js";
import { penGlyph } from "./pen-glyph.js";
import type { NoteTool } from "./canvas.js";

interface PenOption {
	id: PenStyle;
	label: string;
	color: string;
	width: number;
}
export const ToolTray = defineComponent({
	name: "NotesToolTray",
	props: {
		pens: { type: Array as PropType<PenOption[]>, required: true },
		tool: { type: String as PropType<NoteTool>, required: true },
		penStyle: { type: String as PropType<PenStyle>, required: true },
		color: { type: String, required: true },
		highlighterColor: { type: String, required: true },
		highlighterWidth: { type: Number, required: true },
		eraserWidth: { type: Number, required: true },
		wide: Boolean,
		disabled: Boolean,
		canUndo: Boolean,
		canRedo: Boolean,
		locale: { type: String, default: "zh-CN" },
	},
	emits: ["pen", "tool", "settings", "undo", "redo", "color", "colors", "more", "move"],
	setup(props, { emit, expose }) {
		const root = ref<HTMLElement>(),
			strip = ref<HTMLElement>();
		const offset = ref({ x: 0, y: 0 }),
			scope = uid();
		let drag:
			| {
					id: number;
					x: number;
					y: number;
					offset: { x: number; y: number };
					left: number;
					top: number;
			  }
			| undefined;
		let resize: ResizeObserver | undefined;
		const t = (zh: string, en: string) => (props.locale.startsWith("zh") ? zh : en);
		function reset() {
			offset.value = { x: 0, y: 0 };
		}
		function clamp(x: number, y: number, left?: number, top?: number) {
			const box = root.value?.getBoundingClientRect(),
				host = root.value?.closest(".cube-notes")?.getBoundingClientRect();
			if (!box || !host) return;
			const baseX = left ?? box.left - offset.value.x,
				baseY = top ?? box.top - offset.value.y;
			offset.value = {
				x: Math.max(
					host.left + 12 - baseX,
					Math.min(host.right - box.width - 12 - baseX, x),
				),
				y: Math.max(
					host.top + 64 - baseY,
					Math.min(host.bottom - box.height - 12 - baseY, y),
				),
			};
		}
		async function reveal() {
			await nextTick();
			const button = strip.value?.querySelector<HTMLElement>(
				props.tool === "pen"
					? `[data-pen-style="${props.penStyle}"]`
					: `[data-tool="${props.tool}"]`,
			);
			if (button && strip.value) {
				const a = button.getBoundingClientRect(),
					b = strip.value.getBoundingClientRect();
				if (a.left < b.left) strip.value.scrollLeft -= b.left - a.left + 4;
				else if (a.right > b.right) strip.value.scrollLeft += a.right - b.right + 4;
			}
		}
		watch(
			() => [props.penStyle, props.tool, props.wide],
			() => {
				void reveal();
			},
		);
		onMounted(() => {
			resize = new ResizeObserver(() => {
				clamp(offset.value.x, offset.value.y);
				void reveal();
			});
			if (root.value) resize.observe(root.value.closest(".cube-notes")!);
			void reveal();
		});
		onBeforeUnmount(() => resize?.disconnect());
		expose({
			reset,
			bounds: () => root.value?.getBoundingClientRect(),
			anchor: (type?: string) =>
				root.value
					?.querySelector(
						type === "colors" ? '[data-tray-action="colors"]' : '[aria-pressed="true"]',
					)
					?.getBoundingClientRect(),
		});
		const action = (
			label: string,
			glyph: string,
			type: "undo" | "redo" | "colors" | "more",
			disabled = false,
		) =>
			h(
				"button",
				{
					type: "button",
					class: "cube-notes__tray-action",
					"aria-label": label,
					"data-tray-action": type,
					title: label,
					disabled: props.disabled || disabled,
					onClick: () => emit(type),
				},
				icon(glyph),
			);
		return () =>
			h(
				"div",
				{
					ref: root,
					class: ["cube-notes__dock", "cube-notes__tool-tray", props.wide && "is-wide"],
					style: { "--tray-x": `${offset.value.x}px`, "--tray-y": `${offset.value.y}px` },
					role: "toolbar",
					"aria-label": t("画笔工具盒", "Drawing tools"),
				},
				[
					h(
						"button",
						{
							type: "button",
							class: "cube-notes__tray-grip",
							"aria-label": t("移动画笔工具栏", "Move drawing tools"),
							title: t(
								"拖动工具栏；双击或按 Home 复位",
								"Drag tools; double-click or press Home to reset",
							),
							onDblclick: reset,
							onPointerdown: (e: PointerEvent) => {
								if (e.pointerType === "mouse" && e.button !== 0) return;
								e.preventDefault();
								emit("move");
								const box = root.value!.getBoundingClientRect();
								drag = {
									id: e.pointerId,
									x: e.clientX,
									y: e.clientY,
									offset: { ...offset.value },
									left: box.left - offset.value.x,
									top: box.top - offset.value.y,
								};
								(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
							},
							onPointermove: (e: PointerEvent) => {
								if (drag?.id === e.pointerId)
									clamp(
										drag.offset.x + e.clientX - drag.x,
										drag.offset.y + e.clientY - drag.y,
										drag.left,
										drag.top,
									);
							},
							onPointerup: () => {
								drag = undefined;
							},
							onPointercancel: () => {
								drag = undefined;
							},
							onLostpointercapture: () => {
								drag = undefined;
							},
							onKeydown: (e: KeyboardEvent) => {
								const d: Record<string, [number, number]> = {
									ArrowLeft: [-1, 0],
									ArrowRight: [1, 0],
									ArrowUp: [0, -1],
									ArrowDown: [0, 1],
								};
								if (e.key === "Home") {
									e.preventDefault();
									reset();
								} else if (d[e.key]) {
									e.preventDefault();
									emit("move");
									clamp(
										offset.value.x + d[e.key][0] * (e.shiftKey ? 30 : 10),
										offset.value.y + d[e.key][1] * (e.shiftKey ? 30 : 10),
									);
								}
							},
						},
						h("span"),
					),
					h("div", { class: "cube-notes__tray-history" }, [
						action(t("撤销", "Undo"), "undo", "undo", !props.canUndo),
						action(t("重做", "Redo"), "redo", "redo", !props.canRedo),
					]),
					h(
						"div",
						{
							ref: strip,
							class: "cube-notes__pen-strip",
							role: "group",
							"aria-label": t("笔型", "Pen style"),
						},
						[
							...props.pens.map((pen) =>
								h(
									"button",
									{
										key: pen.id,
										type: "button",
										class: [
											"cube-notes__pen-tool",
											props.tool === "pen" &&
												props.penStyle === pen.id &&
												"is-active",
										],
										"aria-label": pen.label,
										title: pen.label,
										"aria-pressed":
											props.tool === "pen" && props.penStyle === pen.id,
										"data-pen-style": pen.id,
										"data-tool": props.penStyle === pen.id ? "pen" : undefined,
										disabled: props.disabled,
										onClick: () => {
											if (props.tool === "pen" && props.penStyle === pen.id)
												emit("settings");
											else emit("pen", pen.id);
										},
									},
									[penGlyph(pen.id, pen.color, pen.width, scope)],
								),
							),
							...(
								[
									[
										"highlighter",
										t("荧光笔", "Highlighter"),
										props.highlighterColor,
										props.highlighterWidth,
									],
									[
										"eraser",
										t("整笔橡皮擦", "Stroke eraser"),
										"#ee929b",
										props.eraserWidth,
									],
									["lasso", t("套索", "Lasso"), "#6d7583", 0],
								] as const
							).map(([tool, label, color, width]) =>
								h(
									"button",
									{
										key: tool,
										type: "button",
										class: [
											"cube-notes__pen-tool",
											props.tool === tool && "is-active",
										],
										"aria-label": label,
										title: label,
										"aria-pressed": props.tool === tool,
										"data-tool": tool,
										disabled: props.disabled,
										onClick: () => {
											if (props.tool === tool && tool !== "lasso")
												emit("settings");
											else emit("tool", tool);
										},
									},
									[penGlyph(tool, color, width, scope)],
								),
							),
						],
					),
					props.wide
						? h(
								"div",
								{
									class: "cube-notes__tray-colors",
									role: "group",
									"aria-label": t("笔迹颜色", "Ink color"),
								},
								[
									...["#222b40", "#2563eb", "#15803d", "#facc15", "#dc3658"].map(
										(color) =>
											h(
												"button",
												{
													type: "button",
													class: [
														"cube-notes__tray-swatch",
														props.color === color && "is-active",
													],
													"aria-label": `${t("笔迹颜色", "Ink color")} ${color}`,
													"aria-pressed": props.color === color,
													disabled: props.disabled,
													onClick: () => emit("color", color),
												},
												h("span", { style: { background: color } }),
											),
									),
									action(t("更多颜色", "More colors"), "palette", "colors"),
								],
							)
						: h(
								"button",
								{
									type: "button",
									class: "cube-notes__tray-action cube-notes__tray-current-color",
									"aria-label": t("更多颜色", "More colors"),
									title: t("更多颜色", "More colors"),
									disabled: props.disabled,
									onClick: () => emit("colors"),
								},
								h("span", { style: { background: props.color } }),
							),
					action(t("更多工具", "More tools"), "more", "more"),
				],
			);
	},
});
