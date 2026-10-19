import {
	defineComponent,
	h,
	ref,
	shallowRef,
	watch,
	onMounted,
	onBeforeUnmount,
	type PropType,
} from "vue";
import type { InkImage } from "../model.js";
import type { Point } from "../geometry.js";
import { photoCenter, photoAngle, transformPhoto, turnPoint } from "../photo-geometry.js";
import { unrotateLocal, rotateVector } from "../view-rotation.js";
import { icon } from "./icons.js";
const middle = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const theta = (a: Point, b: Point) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
export const BackgroundOverlay = defineComponent({
	name: "NoteBackgroundAdjustment",
	props: {
		photo: { type: Object as PropType<InkImage>, required: true },
		zoom: { type: Number, required: true },
		origin: { type: Object as PropType<Point>, required: true },
		rotation: { type: Number, default: 0 },
		locale: { type: String, default: "zh-CN" },
	},
	emits: ["preview", "update"],
	setup(props, { emit, expose }) {
		const root = ref<HTMLElement>(),
			preview = shallowRef<InkImage>();
		const contacts = new Map<number, Point>();
		let gesture:
			| {
					base: InkImage;
					mode: "move" | "rotate" | "resize";
					origin: Point;
					pivot: Point;
					initialVector?: Point;
					pair?: { center: Point; distance: number; angle: number };
			  }
			| undefined;
		const t = (zh: string, en: string) => (props.locale.startsWith("zh") ? zh : en);
		function reset() {
			const ids = [...contacts.keys()];
			contacts.clear();
			gesture = undefined;
			preview.value = undefined;
			emit("preview", undefined);
			for (const id of ids)
				if (root.value?.hasPointerCapture(id)) root.value.releasePointerCapture(id);
		}
		expose({
			cancel: reset,
			showPreview: (photo: InkImage | undefined) => (preview.value = photo),
		});
		const visibility = () => {
			if (document.hidden) reset();
		};
		onMounted(() => {
			window.addEventListener("blur", reset);
			document.addEventListener("visibilitychange", visibility);
		});
		onBeforeUnmount(() => {
			reset();
			window.removeEventListener("blur", reset);
			document.removeEventListener("visibilitychange", visibility);
		});
		watch(() => [props.photo, props.zoom, props.rotation, props.origin], reset);
		function point(e: PointerEvent): Point {
			const paper = root.value!.closest<HTMLElement>(".cube-notes__paper")!,
				box = paper.getBoundingClientRect();
			const local = unrotateLocal(
				{ x: e.clientX - box.left, y: e.clientY - box.top },
				props.rotation % 2 ? box.height : box.width,
				props.rotation % 2 ? box.width : box.height,
				props.rotation,
			);
			return {
				x: props.origin.x + local.x / props.zoom,
				y: props.origin.y + local.y / props.zoom,
			};
		}
		function down(e: PointerEvent, mode: "move" | "rotate" | "resize" = "move", corner = "se") {
			if (e.pointerType === "mouse" && e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation();
			if (contacts.size >= 2) return;
			const p = point(e);
			contacts.set(e.pointerId, p);
			root.value!.setPointerCapture(e.pointerId);
			if (contacts.size === 1) {
				const base = { ...props.photo },
					center = photoCenter(base);
				let pivot = center;
				if (mode === "resize") {
					const offset = turnPoint(
						{
							x: ((corner.includes("w") ? 1 : -1) * base.width) / 2,
							y: ((corner.includes("n") ? 1 : -1) * base.height) / 2,
						},
						base.angle ?? 0,
					);
					pivot = { x: center.x + offset.x, y: center.y + offset.y };
				}
				gesture = {
					base,
					mode,
					origin: p,
					pivot,
					initialVector: { x: p.x - pivot.x, y: p.y - pivot.y },
				};
				preview.value = base;
			} else if (gesture) {
				const [a, b] = [...contacts.values()];
				gesture = {
					base: { ...(preview.value ?? props.photo) },
					mode: "move",
					origin: p,
					pivot: middle(a, b),
					pair: {
						center: middle(a, b),
						distance: Math.max(12 / props.zoom, Math.hypot(a.x - b.x, a.y - b.y)),
						angle: theta(a, b),
					},
				};
			}
		}
		function move(e: PointerEvent) {
			if (!gesture || !contacts.has(e.pointerId)) return;
			e.preventDefault();
			e.stopPropagation();
			const p = point(e);
			contacts.set(e.pointerId, p);
			const g = gesture;
			let next: InkImage;
			if (contacts.size === 2 && g.pair) {
				const [a, b] = [...contacts.values()],
					center = middle(a, b),
					scale = Math.hypot(a.x - b.x, a.y - b.y) / g.pair.distance,
					angle = photoAngle(theta(a, b) - g.pair.angle);
				next = transformPhoto(g.base, g.pair.center, scale, angle, {
					x: center.x - g.pair.center.x,
					y: center.y - g.pair.center.y,
				});
			} else if (g.mode === "rotate") {
				let angle = photoAngle(
					(g.base.angle ?? 0) + theta(g.pivot, p) - theta(g.pivot, g.origin),
				);
				const snap = Math.round(angle / 90) * 90;
				if (Math.abs(angle - snap) < 3) angle = snap;
				next = transformPhoto(g.base, g.pivot, 1, angle - (g.base.angle ?? 0));
			} else if (g.mode === "resize") {
				const v = g.initialVector!,
					distance = v.x * v.x + v.y * v.y;
				next = transformPhoto(
					g.base,
					g.pivot,
					distance ? ((p.x - g.pivot.x) * v.x + (p.y - g.pivot.y) * v.y) / distance : 1,
					0,
				);
			} else
				next = transformPhoto(g.base, photoCenter(g.base), 1, 0, {
					x: p.x - g.origin.x,
					y: p.y - g.origin.y,
				});
			preview.value = next;
			emit("preview", next);
		}
		function up(e: PointerEvent) {
			if (!gesture || !contacts.has(e.pointerId)) return;
			e.preventDefault();
			e.stopPropagation();
			contacts.delete(e.pointerId);
			if (root.value?.hasPointerCapture(e.pointerId))
				root.value.releasePointerCapture(e.pointerId);
			if (contacts.size) {
				const p = [...contacts.values()][0];
				gesture = {
					base: { ...(preview.value ?? props.photo) },
					mode: "move",
					origin: p,
					pivot: photoCenter(preview.value ?? props.photo),
				};
				return;
			}
			const next = preview.value;
			reset();
			if (next) emit("update", next);
		}
		const handlers = {
			onPointermove: move,
			onPointerup: up,
			onPointercancel: reset,
			onLostpointercapture: (e: PointerEvent) => {
				if (contacts.has(e.pointerId)) reset();
			},
		};
		return () => {
			const photo = preview.value ?? props.photo,
				c = photoCenter(photo);
			return h("div", { ref: root, class: "cube-notes__background-overlay", ...handlers }, [
				h(
					"div",
					{
						class: "cube-notes__background-box",
						style: {
							left: `${(c.x - props.origin.x) * props.zoom}px`,
							top: `${(c.y - props.origin.y) * props.zoom}px`,
							width: `${photo.width * props.zoom}px`,
							height: `${photo.height * props.zoom}px`,
							transform: `translate(-50%,-50%) rotate(${photo.angle ?? 0}deg)`,
						},
					},
					[
						h("div", {
							role: "button",
							tabindex: 0,
							class: "cube-notes__background-grab",
							"aria-label": t("移动背景图", "Move background image"),
							onPointerdown: (e: PointerEvent) => down(e),
							onKeydown: (e: KeyboardEvent) => {
								const delta: Record<string, Point> = {
									ArrowLeft: { x: -1, y: 0 },
									ArrowRight: { x: 1, y: 0 },
									ArrowUp: { x: 0, y: -1 },
									ArrowDown: { x: 0, y: 1 },
								};
								if (!delta[e.key]) return;
								e.preventDefault();
								e.stopPropagation();
								const d = rotateVector(delta[e.key], -props.rotation),
									amount = e.shiftKey ? 20 : 2;
								emit(
									"update",
									transformPhoto(props.photo, photoCenter(props.photo), 1, 0, {
										x: d.x * amount,
										y: d.y * amount,
									}),
								);
							},
						}),
						...["nw", "ne", "sw", "se"].map((corner) =>
							h(
								"button",
								{
									type: "button",
									class: `cube-notes__background-corner is-${corner}`,
									"aria-label": `${t("缩放背景图", "Resize background image")} ${corner}`,
									onPointerdown: (e: PointerEvent) => down(e, "resize", corner),
									onKeydown: (e: KeyboardEvent) => {
										if (!["ArrowUp", "ArrowDown"].includes(e.key)) return;
										e.preventDefault();
										e.stopPropagation();
										emit(
											"update",
											transformPhoto(
												props.photo,
												photoCenter(props.photo),
												e.key === "ArrowUp" ? 1.05 : 1 / 1.05,
												0,
											),
										);
									},
								},
								h("span"),
							),
						),
						h(
							"button",
							{
								type: "button",
								class: "cube-notes__background-rotate",
								"aria-label": t("旋转背景图", "Rotate background image"),
								onPointerdown: (e: PointerEvent) => down(e, "rotate"),
								onKeydown: (e: KeyboardEvent) => {
									if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
									e.preventDefault();
									e.stopPropagation();
									emit(
										"update",
										transformPhoto(
											props.photo,
											photoCenter(props.photo),
											1,
											(e.key === "ArrowRight" ? 1 : -1) *
												(e.shiftKey ? 15 : 1),
										),
									);
								},
							},
							icon("rotate"),
						),
					],
				),
			]);
		};
	},
});
