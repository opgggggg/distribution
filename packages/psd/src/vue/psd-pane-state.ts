import {
	computed,
	inject,
	reactive,
	ref,
	watch,
	type ComputedRef,
	type InjectionKey,
	type Ref,
} from "vue";
import type { UiIconName } from "@yaochn/als-office-editor-ui/vue";
import { readPsdPaneVisible, writePsdPaneVisible } from "./psd-pane-visibility-storage";

export interface PsdPaneDefinition {
	id: string;
	label: string;
	icon: UiIconName;
}

export const PSD_PANE_DEFINITIONS = [
	{ id: "color", label: "Color", icon: "palette" },
	{ id: "history", label: "History", icon: "history" },
	{ id: "info", label: "Info", icon: "info" },
	{ id: "properties", label: "Properties", icon: "inspect" },
	{ id: "layers", label: "Layers", icon: "pane-group" },
] as const satisfies readonly PsdPaneDefinition[];

export type PsdPaneId = (typeof PSD_PANE_DEFINITIONS)[number]["id"];
export type PsdUpperPaneId = Extract<PsdPaneId, "color" | "history" | "info">;

const UPPER_PANE_IDS: readonly PsdUpperPaneId[] = ["color", "history", "info"];

export interface PsdPaneState {
	upperTab: Ref<PsdUpperPaneId>;
	visibility: Record<PsdPaneId, boolean>;
	anyVisible: ComputedRef<boolean>;
	togglePane(pane: PsdPaneId): void;
}

export const PSD_PANE_STATE: InjectionKey<PsdPaneState> = Symbol("psd-pane-state");

export function createPsdPaneState(): PsdPaneState {
	const visibility = reactive<Record<PsdPaneId, boolean>>(
		Object.fromEntries(
			PSD_PANE_DEFINITIONS.map((pane) => [pane.id, readPsdPaneVisible(pane.id)]),
		) as Record<PsdPaneId, boolean>,
	);
	const upperTab = ref<PsdUpperPaneId>(
		UPPER_PANE_IDS.find((pane) => visibility[pane]) ?? "color",
	);
	const anyVisible = computed(() => PSD_PANE_DEFINITIONS.some((pane) => visibility[pane.id]));

	for (const pane of PSD_PANE_DEFINITIONS) {
		watch(
			() => visibility[pane.id],
			(visible) => writePsdPaneVisible(pane.id, visible),
		);
	}

	function togglePane(pane: PsdPaneId): void {
		const visible = !visibility[pane];
		visibility[pane] = visible;
		if (UPPER_PANE_IDS.includes(pane as PsdUpperPaneId)) {
			if (visible) upperTab.value = pane as PsdUpperPaneId;
			else if (upperTab.value === pane) {
				const fallback = UPPER_PANE_IDS.find((candidate) => visibility[candidate]);
				if (fallback) upperTab.value = fallback;
			}
		}
	}

	return {
		upperTab,
		visibility,
		anyVisible,
		togglePane,
	};
}

export function usePsdPaneState(): PsdPaneState {
	const state = inject(PSD_PANE_STATE);
	if (!state) throw new Error("PSD pane state is not provided");
	return state;
}
