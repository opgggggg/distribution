import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from "vue";
import { icon } from "./icons.js";
import type { MaskingTape } from "../model.js";
type Point = { x: number; y: number };
const angle = (a: number) => ((a + 540) % 360) - 180;
const snap = (a: number) => {
	const n = Math.round(a / 15) * 15;
	return Math.abs(a - n) < 2.5 ? n : a;
};
export const TapeOverlay = defineComponent({
	name: "NotesMaskingTape",
	props: {
		tapes: { type: Array as PropType<MaskingTape[]>, required: true },
		zoom: { type: Number, required: true },
		editable: Boolean,
		infinite: Boolean,
		origin: { type: Object as PropType<Point>, default: () => ({ x: 0, y: 0 }) },
		active: String,
		locale: { type: String, default: "zh-CN" },
	},
	emits: ["update", "select"],
	setup(props, { emit }) {
		const preview = ref<MaskingTape>();
		const contacts = new Map<number, Point>();
		let gesture:
			| {
					tape: MaskingTape;
					mode: "move" | "rotate" | "left" | "right";
					origin: Point;
					center: Point;
					rotation: number;
					pairAngle?: number;
					pairCenter?: Point;
					fixed?: Point;
			  }
			| undefined;
		const t = (zh: string, en: string) => (props.locale.startsWith("zh") ? zh : en);
		const middle = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
		const theta = (a: Point, b: Point) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
		function reset() {
			contacts.clear();
			gesture = undefined;
			preview.value = undefined;
		}
		watch(() => [props.editable, props.zoom, props.tapes], reset);
		const visibility = () => {
			if (document.hidden) reset();
		};
		onMounted(() => {
			window.addEventListener("blur", reset);
			document.addEventListener("visibilitychange", visibility);
		});
		onBeforeUnmount(() => {
			window.removeEventListener("blur", reset);
			document.removeEventListener("visibilitychange", visibility);
			reset();
		});
		function point(e: PointerEvent) {
			const paper = (e.currentTarget as HTMLElement)
				.closest(".cube-notes__paper")!
				.getBoundingClientRect();
			return {
				x: props.origin.x + (e.clientX - paper.left) / props.zoom,
				y: props.origin.y + (e.clientY - paper.top) / props.zoom,
			};
		}
		function down(
			e: PointerEvent,
			tape: MaskingTape,
			mode: "move" | "rotate" | "left" | "right" = "move",
		) {
			if (!props.editable || (e.pointerType === "mouse" && e.button !== 0)) return;
			e.preventDefault();
			e.stopPropagation();
			if (contacts.size >= 2 || (contacts.size && gesture?.mode !== "move")) return;
			if (gesture && gesture.tape.id !== tape.id) return;
			emit("select", tape.id);
			const p = point(e);
			contacts.set(e.pointerId, p);
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
			if (contacts.size === 1) {
				const radians = (tape.angle * Math.PI) / 180,
					sign = mode === "left" ? 1 : -1;
				gesture = {
					tape: { ...tape },
					mode,
					origin: p,
					center: { x: tape.x, y: tape.y },
					rotation: theta(tape, p),
					fixed: {
						x: tape.x + (sign * Math.cos(radians) * tape.width) / 2,
						y: tape.y + (sign * Math.sin(radians) * tape.width) / 2,
					},
				};
				preview.value = { ...tape };
			} else if (contacts.size === 2 && gesture?.mode === "move") {
				const [a, b] = [...contacts.values()];
				gesture.tape = { ...preview.value! };
				gesture.pairAngle = theta(a, b);
				gesture.pairCenter = middle(a, b);
			}
		}
		function move(e: PointerEvent) {
			if (!gesture || !contacts.has(e.pointerId)) return;
			e.preventDefault();
			contacts.set(e.pointerId, point(e));
			const base = gesture.tape,
				p = contacts.get(e.pointerId)!,
				next = { ...base };
			if (contacts.size >= 2 && gesture.mode === "move") {
				const [a, b] = [...contacts.values()],
					center = middle(a, b);
				next.x += center.x - gesture.pairCenter!.x;
				next.y += center.y - gesture.pairCenter!.y;
				next.angle = snap(angle(base.angle + theta(a, b) - gesture.pairAngle!));
			} else if (gesture.mode === "move") {
				next.x += p.x - gesture.origin.x;
				next.y += p.y - gesture.origin.y;
			} else if (gesture.mode === "rotate")
				next.angle = snap(angle(base.angle + theta(gesture.center, p) - gesture.rotation));
			else {
				const radians = (base.angle * Math.PI) / 180,
					c = Math.cos(radians),
					s = Math.sin(radians),
					sign = gesture.mode === "left" ? -1 : 1,
					length = Math.max(
						24,
						Math.min(
							5000,
							sign * ((p.x - gesture.fixed!.x) * c + (p.y - gesture.fixed!.y) * s),
						),
					);
				next.width = length;
				next.x = gesture.fixed!.x + (sign * c * length) / 2;
				next.y = gesture.fixed!.y + (sign * s * length) / 2;
			}
			const paper = (e.currentTarget as HTMLElement)
				.closest(".cube-notes__paper")!
				.getBoundingClientRect();
			if (!props.infinite) next.x = Math.max(0, Math.min(paper.width / props.zoom, next.x));
			if (!props.infinite) next.y = Math.max(0, Math.min(paper.height / props.zoom, next.y));
			preview.value = next;
		}
		function finish(e: PointerEvent, commit: boolean) {
			if (!gesture || !contacts.has(e.pointerId)) return;
			if (!commit) {
				reset();
				return;
			}
			contacts.delete(e.pointerId);
			if (contacts.size) {
				gesture.tape = { ...preview.value! };
				gesture.origin = [...contacts.values()][0];
				gesture.pairAngle = undefined;
				gesture.pairCenter = undefined;
				return;
			}
			const value = preview.value,
				original = props.tapes.find((t) => t.id === value?.id);
			reset();
			if (
				value &&
				original &&
				["x", "y", "angle", "width"].some(
					(k) => value[k as keyof MaskingTape] !== original[k as keyof MaskingTape],
				)
			)
				emit("update", value.id, {
					x: value.x,
					y: value.y,
					angle: value.angle,
					width: value.width,
				});
		}
		const handlers = {
			onPointermove: move,
			onPointerup: (e: PointerEvent) => finish(e, true),
			onPointercancel: (e: PointerEvent) => finish(e, false),
			onLostpointercapture: (e: PointerEvent) => finish(e, false),
		};
		return () =>
			h(
				"div",
				{
					class: ["cube-notes__tapes", props.editable && "is-editing"],
					"aria-label": t("美纹纸", "Masking tape"),
				},
				props.tapes.map((tape) => {
					const shown = preview.value?.id === tape.id ? preview.value : tape,
						selected = props.editable && tape.id === props.active,
						width = shown.width * props.zoom,
						height = shown.height * props.zoom;
					return h(
						"div",
						{
							key: tape.id,
							class: ["cube-notes__tape", selected && "is-active"],
							"data-tape-id": tape.id,
							style: {
								left: `${(shown.x - props.origin.x) * props.zoom}px`,
								top: `${(shown.y - props.origin.y) * props.zoom}px`,
								width: `${width}px`,
								height: `${height}px`,
								transform: `translate(-50%,-50%) rotate(${shown.angle}deg)`,
							},
						},
						[
							h("span", { class: "cube-notes__tape-paper" }),
							props.editable
								? h("div", {
										role: "button",
										tabindex: 0,
										class: "cube-notes__tape-grab",
										"aria-label": `${t("移动美纹纸", "Move masking tape")} ${props.tapes.indexOf(tape) + 1}`,
										"aria-pressed": selected,
										onPointerdown: (e: PointerEvent) => down(e, tape),
										...handlers,
										onKeydown: (e: KeyboardEvent) => {
											const delta: Record<string, [number, number]> = {
												ArrowLeft: [-1, 0],
												ArrowRight: [1, 0],
												ArrowUp: [0, -1],
												ArrowDown: [0, 1],
											};
											if (!delta[e.key]) return;
											e.preventDefault();
											e.stopPropagation();
											emit("select", tape.id);
											if (e.altKey)
												emit("update", tape.id, {
													angle: angle(
														tape.angle +
															(delta[e.key][0] + delta[e.key][1]) *
																(e.shiftKey ? 15 : 1),
													),
												});
											else
												emit("update", tape.id, {
													x:
														tape.x +
														delta[e.key][0] * (e.shiftKey ? 20 : 2),
													y:
														tape.y +
														delta[e.key][1] * (e.shiftKey ? 20 : 2),
												});
										},
									})
								: null,
							selected
								? [
										...(["left", "right"] as const).map((side) =>
											h(
												"button",
												{
													type: "button",
													class: `cube-notes__tape-end is-${side}`,
													"aria-label": t(
														side === "left"
															? "调整胶带左端"
															: "调整胶带右端",
														side === "left"
															? "Resize tape left end"
															: "Resize tape right end",
													),
													onPointerdown: (e: PointerEvent) =>
														down(e, tape, side),
													...handlers,
												},
												h("span"),
											),
										),
										h(
											"button",
											{
												type: "button",
												class: "cube-notes__tape-rotate",
												"aria-label": t(
													"旋转美纹纸",
													"Rotate masking tape",
												),
												onPointerdown: (e: PointerEvent) =>
													down(e, tape, "rotate"),
												...handlers,
											},
											icon("redo"),
										),
										h(
											"output",
											{
												class: "cube-notes__tape-angle",
												"aria-label": t("旋转角度", "Rotation"),
												style: {
													transform: `translate(-50%,-50%) rotate(${-shown.angle}deg)`,
												},
											},
											`${Math.round(shown.angle)}°`,
										),
									]
								: null,
						],
					);
				}),
			);
	},
});
