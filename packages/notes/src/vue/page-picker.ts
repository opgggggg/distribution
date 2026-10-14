import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch, type Ref } from "vue";

/** Mobile page navigation floats below its trigger without resizing the canvas. */
export function usePagePicker(
	root: Ref<HTMLElement | undefined>,
	mobile: Ref<boolean>,
	open: Ref<boolean>,
	pageCount: () => number,
) {
	const id = `cube-notes-pages-${useId()}`;
	const panel = ref<HTMLElement>();
	const placement = ref({ left: 12, top: 64, width: 320, height: 400 });
	let anchor: HTMLElement | undefined;
	const syncAnchor = () => {
		anchor?.setAttribute("aria-haspopup", "dialog");
		anchor?.setAttribute("aria-controls", id);
		anchor?.setAttribute("aria-expanded", String(open.value));
	};
	function place() {
		if (!mobile.value || !open.value) return;
		const viewport = window.visualViewport;
		const left = viewport?.offsetLeft ?? 0;
		const top = viewport?.offsetTop ?? 0;
		const width = viewport?.width ?? window.innerWidth;
		const height = viewport?.height ?? window.innerHeight;
		const bounds = anchor?.isConnected
			? anchor.getBoundingClientRect()
			: root.value?.querySelector(".cube-notes__top-pages")?.getBoundingClientRect();
		const panelWidth = Math.min(320, width - 24);
		const panelTop = Math.max(
			top + 12,
			bounds ? bounds.bottom + 8 : (root.value?.getBoundingClientRect().top ?? top) + 8,
		);
		placement.value = {
			left: Math.max(
				left + 12,
				Math.min(
					left + width - panelWidth - 12,
					bounds ? bounds.left + bounds.width / 2 - panelWidth / 2 : left + 12,
				),
			),
			top: panelTop,
			width: panelWidth,
			height: Math.max(
				0,
				Math.min(560, top + height - panelTop - 12, 216 + Math.ceil(pageCount() / 2) * 184),
			),
		};
	}
	function close(restoreFocus = false) {
		open.value = false;
		syncAnchor();
		if (restoreFocus) anchor?.focus({ preventScroll: true });
	}
	function toggle(trigger?: HTMLElement) {
		if (!(trigger instanceof HTMLElement) && !anchor?.isConnected)
			trigger = root.value?.querySelector<HTMLElement>(".cube-notes__top-pages") ?? undefined;
		if (trigger instanceof HTMLElement && trigger !== anchor) {
			anchor?.setAttribute("aria-expanded", "false");
			anchor = trigger;
		}
		open.value = !open.value;
		syncAnchor();
		place();
	}
	function outside(event: PointerEvent) {
		if (!mobile.value || !open.value) return;
		const path = event.composedPath();
		if ((anchor && path.includes(anchor)) || (panel.value && path.includes(panel.value)))
			return;
		close();
		// The tap that dismisses the picker must not also paint a stroke.
		if (event.target instanceof Element && event.target.closest(".cube-notes__viewport")) {
			event.preventDefault();
			event.stopPropagation();
		}
	}
	function key(event: KeyboardEvent) {
		if (!mobile.value || !open.value || event.key !== "Escape") return;
		event.preventDefault();
		event.stopPropagation();
		close(true);
	}
	watch([open, mobile], () => {
		syncAnchor();
		if (!mobile.value || !open.value) return;
		place();
		void nextTick(() => {
			panel.value
				?.querySelector<HTMLElement>('[aria-current="page"]')
				?.focus({ preventScroll: true });
		});
	});
	watch(pageCount, place);
	onMounted(() => {
		document.addEventListener("pointerdown", outside, true);
		document.addEventListener("keydown", key, true);
		window.addEventListener("resize", place);
		window.visualViewport?.addEventListener("resize", place);
		window.visualViewport?.addEventListener("scroll", place);
	});
	onBeforeUnmount(() => {
		close();
		document.removeEventListener("pointerdown", outside, true);
		document.removeEventListener("keydown", key, true);
		window.removeEventListener("resize", place);
		window.visualViewport?.removeEventListener("resize", place);
		window.visualViewport?.removeEventListener("scroll", place);
	});
	return {
		id,
		panel,
		toggle,
		close,
		style: computed(() =>
			mobile.value
				? Object.fromEntries(
						Object.entries(placement.value).map(([key, value]) => [key, `${value}px`]),
					)
				: undefined,
		),
	};
}
