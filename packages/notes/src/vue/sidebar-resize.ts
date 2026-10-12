import { h, onBeforeUnmount, ref, type Ref } from "vue";

const preference = "cubeoffice.notes.sidebarWidth";
const minimum = 160;
/** Owns the view-only page rail width, pointer capture and keyboard resizing. */
export function useSidebarResize(
	root: Ref<HTMLElement | undefined>,
	fit: () => void,
	label: () => string,
) {
	const defaultWidth = () =>
		typeof window !== "undefined" && window.innerWidth < 760 ? 206 : 184;
	const initial = () => {
		try {
			const saved = Number(localStorage.getItem(preference));
			return saved >= minimum && saved <= 440 ? saved : defaultWidth();
		} catch {
			return defaultWidth();
		}
	};
	const width = ref(initial()),
		resizing = ref(false),
		maximum = ref(440);
	let drag: { id: number; x: number; width: number; target: HTMLElement } | undefined;
	let frame = 0;
	function bounds() {
		const available =
			root.value?.clientWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1024);
		const overlay = typeof window !== "undefined" && window.innerWidth <= 760;
		maximum.value = Math.max(minimum, Math.min(440, available - (overlay ? 72 : 360)));
	}
	function remember() {
		try {
			localStorage.setItem(preference, String(width.value));
		} catch {
			/* Width remains usable when storage is unavailable. */
		}
	}
	function set(value: number, persist = false) {
		bounds();
		const next = Math.round(Math.max(minimum, Math.min(maximum.value, value)));
		if (width.value !== next) {
			width.value = next;
			if (!frame)
				frame = requestAnimationFrame(() => {
					frame = 0;
					fit();
				});
		}
		if (persist) remember();
	}
	function finish(event?: PointerEvent) {
		if (!drag || (event && event.pointerId !== drag.id)) return;
		const active = drag;
		drag = undefined;
		resizing.value = false;
		if (active.target.hasPointerCapture(active.id))
			active.target.releasePointerCapture(active.id);
		remember();
	}
	function key(event: KeyboardEvent) {
		const delta = event.shiftKey ? 24 : 8;
		const next =
			event.key === "ArrowLeft"
				? width.value - delta
				: event.key === "ArrowRight"
					? width.value + delta
					: event.key === "Home"
						? minimum
						: event.key === "End"
							? maximum.value
							: event.key === "Enter"
								? defaultWidth()
								: undefined;
		if (next !== undefined) {
			event.preventDefault();
			event.stopPropagation();
			set(next, true);
		}
	}
	onBeforeUnmount(() => {
		if (frame) cancelAnimationFrame(frame);
		finish();
	});
	return {
		width,
		resizing,
		clampToViewport: () => set(width.value),
		renderHandle: () =>
			h(
				"div",
				{
					class: "cube-notes__sidebar-resizer",
					role: "separator",
					tabindex: 0,
					"aria-label": label(),
					title: label(),
					"aria-orientation": "vertical",
					"aria-valuemin": minimum,
					"aria-valuemax": maximum.value,
					"aria-valuenow": width.value,
					onPointerdown: (event: PointerEvent) => {
						if (event.button !== 0 || drag) return;
						event.preventDefault();
						event.stopPropagation();
						bounds();
						const target = event.currentTarget as HTMLElement;
						drag = {
							id: event.pointerId,
							x: event.clientX,
							width: width.value,
							target,
						};
						target.setPointerCapture(event.pointerId);
						resizing.value = true;
					},
					onPointermove: (event: PointerEvent) => {
						if (drag?.id === event.pointerId) set(drag.width + event.clientX - drag.x);
					},
					onPointerup: finish,
					onPointercancel: finish,
					onLostpointercapture: finish,
					onDblclick: () => set(defaultWidth(), true),
					onKeydown: key,
				},
				h("span", { "aria-hidden": "true" }),
			),
	};
}
