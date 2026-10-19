import { defineComponent, h, onBeforeUnmount, onMounted, ref, type PropType } from "vue";
import type { Point } from "../geometry.js";
import { icon } from "./icons.js";

/** Transient tools at the pen tip. Uses client coordinates, independent of canvas zoom/rotation. */
export const PencilMenu = defineComponent({
	name: "CubePencilMenu",
	props: {
		anchor: { type: Object as PropType<Point>, required: true },
		boundary: { type: Object as PropType<HTMLElement>, required: true },
		tool: { type: String, required: true },
		eraserMode: { type: String, default: "stroke" },
		color: { type: String, required: true },
		width: { type: Number, required: true },
		widths: { type: Array as PropType<readonly number[]>, required: true },
		colors: { type: Array as PropType<string[]>, required: true },
		canUndo: Boolean,
		canRedo: Boolean,
		translate: { type: Function as PropType<(label: string) => string>, required: true },
	},
	emits: ["close", "tool", "color", "width", "palette", "sample", "undo", "redo"],
	setup(props, { emit }) {
		const panel = ref<HTMLElement>();
		const position = ref({ left: "0px", top: "0px", visibility: "hidden" });
		const close = () => emit("close");
		const outside = (e: PointerEvent) => {
			if (!panel.value?.contains(e.target as Node)) close();
		};
		const escape = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			e.preventDefault();
			e.stopPropagation();
			close();
		};
		onMounted(() => {
			const edge = props.boundary.getBoundingClientRect(),
				box = panel.value!.getBoundingClientRect();
			const visual = window.visualViewport;
			const left = Math.max(edge.left, visual?.offsetLeft ?? 0) + 8;
			const top = Math.max(edge.top, visual?.offsetTop ?? 0) + 8;
			const right =
				Math.min(
					edge.right,
					(visual?.offsetLeft ?? 0) + (visual?.width ?? window.innerWidth),
				) - 8;
			const bottom =
				Math.min(
					edge.bottom,
					(visual?.offsetTop ?? 0) + (visual?.height ?? window.innerHeight),
				) - 8;
			position.value = {
				left: `${Math.max(left, Math.min(right - box.width, props.anchor.x + 18))}px`,
				top: `${Math.max(
					top,
					Math.min(
						bottom - box.height,
						props.anchor.y - box.height - 18 >= top
							? props.anchor.y - box.height - 18
							: props.anchor.y + 22,
					),
				)}px`,
				visibility: "visible",
			};
			document.addEventListener("pointerdown", outside, true);
			document.addEventListener("keydown", escape, true);
			window.addEventListener("resize", close);
			window.addEventListener("blur", close);
			props.boundary.addEventListener("scroll", close, true);
		});
		onBeforeUnmount(() => {
			document.removeEventListener("pointerdown", outside, true);
			document.removeEventListener("keydown", escape, true);
			window.removeEventListener("resize", close);
			window.removeEventListener("blur", close);
			props.boundary.removeEventListener("scroll", close, true);
		});
		const act = (action: () => void) => {
			action();
			close();
		};
		const button = (
			label: string,
			glyph: string,
			action: () => void,
			active = false,
			disabled = false,
		) =>
			h(
				"button",
				{
					type: "button",
					title: props.translate(label),
					"aria-label": props.translate(label),
					class: ["cube-notes__button", active && "is-active"],
					disabled,
					...(glyph === "pen" || glyph === "eraser" ? { "aria-pressed": active } : {}),
					onClick: () => act(action),
				},
				icon(glyph),
			);
		return () =>
			h(
				"div",
				{
					ref: panel,
					class: "cube-notes__pencil-menu",
					role: "toolbar",
					"aria-label": props.translate("快捷工具"),
					style: position.value,
					onContextmenu: (e: Event) => e.preventDefault(),
				},
				[
					h("div", { class: "cube-notes__pencil-actions" }, [
						button(
							"画笔",
							"pen",
							() => emit("tool", "pen"),
							props.tool === "pen" || props.tool === "highlighter",
						),
						button(
							props.eraserMode === "path" ? "轨迹橡皮擦" : "整笔橡皮擦",
							"eraser",
							() => emit("tool", "eraser"),
							props.tool === "eraser",
						),
						button("更多颜色", "palette", () => emit("palette")),
						button("撤销", "undo", () => emit("undo"), false, !props.canUndo),
						button("重做", "redo", () => emit("redo"), false, !props.canRedo),
					]),
					h(
						"div",
						{
							class: "cube-notes__pencil-actions",
							role: "group",
							"aria-label": props.translate("常用颜色"),
						},
						props.colors.map((color) =>
							h(
								"button",
								{
									type: "button",
									"aria-label": `${props.translate("笔迹颜色")} ${color}`,
									"aria-pressed": props.color === color,
									class: "cube-notes__pencil-swatch",
									onClick: () => act(() => emit("color", color)),
								},
								h(
									"span",
									{ style: { background: color } },
									props.color === color ? [icon("check")] : [],
								),
							),
						),
					),
					h(
						"div",
						{
							class: "cube-notes__pencil-widths",
							role: "group",
							"aria-label": props.translate("常用粗细"),
						},
						props.widths.map((width, i) =>
							h(
								"button",
								{
									type: "button",
									"aria-label": `${props.translate("笔迹粗细")} ${width} pt`,
									"aria-pressed": props.width === width,
									class: props.width === width && "is-active",
									onClick: () => act(() => emit("width", width)),
								},
								[
									h("span", { style: { height: `${[2, 5, 9][i] ?? 9}px` } }),
									`${width} pt`,
								],
							),
						),
					),
					h(
						"button",
						{
							type: "button",
							class: "cube-notes__pencil-sample",
							"aria-label": props.translate("取色"),
							onClick: () => act(() => emit("sample", props.anchor)),
						},
						[icon("eyedropper"), props.translate("取色")],
					),
				],
			);
	},
});
