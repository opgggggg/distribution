<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { UiEditorDock, UiIcon, UiPanelResizer } from "@yaochn/als-office-editor-ui/vue";
import PsdColorPanel from "./PsdColorPanel.vue";
import PsdInfoPanel from "./PsdInfoPanel.vue";
import PsdPropertiesPanel from "./PsdPropertiesPanel.vue";
import PsdHistoryPanel from "./PsdHistoryPanel.vue";
import PsdLayersPanel from "./PsdLayersPanel.vue";
import { usePsdPaneState, type PsdUpperPaneId } from "./psd-pane-state";
import { readPsdWidgetCollapsed, writePsdWidgetCollapsed } from "./psd-widget-storage";

/**
 * Photoshop-style right column: one resizable dock holding stable, stacked
 * document panels. Tool selection never changes this column.
 */

const width = ref(288);
const paneState = usePsdPaneState();
const upperTab = paneState.upperTab;
const upperCollapsed = ref(readPsdWidgetCollapsed("right.color-history"));
const middleCollapsed = ref(readPsdWidgetCollapsed("right.properties"));
const lowerCollapsed = ref(readPsdWidgetCollapsed("right.layers"));
const upperHeight = ref(184);
const middleHeight = ref(216);
const stackElement = ref<HTMLElement | null>(null);
const stackHeight = ref(0);
const upperId = useId();
const lowerId = useId();
const PANEL_HEADER_HEIGHT = 32;
const PANEL_MIN_HEIGHT = 120;
const LOWER_MIN_HEIGHT = 260;
const RESIZER_HEIGHT = 5;
type RightPanelGroup = "upper" | "middle" | "lower";

const upperVisible = computed(
	() => paneState.visibility.color || paneState.visibility.history || paneState.visibility.info,
);
const middleVisible = computed(() => paneState.visibility.properties);
const lowerVisible = computed(() => paneState.visibility.layers);
const visibleGroups = computed<RightPanelGroup[]>(() => [
	...(upperVisible.value ? (["upper"] as const) : []),
	...(middleVisible.value ? (["middle"] as const) : []),
	...(lowerVisible.value ? (["lower"] as const) : []),
]);

watch(upperCollapsed, (collapsed) => writePsdWidgetCollapsed("right.color-history", collapsed));
watch(middleCollapsed, (collapsed) => writePsdWidgetCollapsed("right.properties", collapsed));
watch(lowerCollapsed, (collapsed) => writePsdWidgetCollapsed("right.layers", collapsed));

// Reserve a usable layer list before distributing space to the inspectors.
// Shrink their scrollable bodies on short windows; never shrink Layers to zero.
const allocatedHeights = computed(() => {
 const groups = visibleGroups.value;
 const result: Partial<Record<RightPanelGroup, number>> = {};
 const available = Math.max(0, (stackHeight.value || 660) - RESIZER_HEIGHT * Math.max(0, groups.length - 1));
 const last = groups.at(-1);
 if (!last) return result;
 const tail = groupCollapsed(last) ? PANEL_HEADER_HEIGHT : last === "lower" ? LOWER_MIN_HEIGHT : PANEL_MIN_HEIGHT;
 const prefix = groups.slice(0, -1);
 const room = Math.max(0, available - tail - prefix.length * PANEL_HEADER_HEIGHT);
 const wanted = prefix.map(group => Math.max(0, currentGroupHeight(group) - PANEL_HEADER_HEIGHT));
 const total = wanted.reduce((sum, value) => sum + value, 0);
 let used = 0;
 prefix.forEach((group, index) => {
  const requested = PANEL_HEADER_HEIGHT + Math.floor(wanted[index] * Math.min(1, room / (total || 1)));
  const height = requested < 96 ? PANEL_HEADER_HEIGHT : requested;
  result[group] = height; used += height;
 });
 result[last] = groupCollapsed(last) ? tail : Math.max(tail, available - used);
 return result;
});
const stackStyle = computed(() => ({gridTemplateRows: visibleGroups.value.map(group => `${allocatedHeights.value[group]}px`).join(` ${RESIZER_HEIGHT}px `)}));
function renderedHeight(group: RightPanelGroup): number { return allocatedHeights.value[group] ?? PANEL_HEADER_HEIGHT; }

function isCollapsed(group: RightPanelGroup): boolean {
 return groupCollapsed(group) || renderedHeight(group) <= PANEL_HEADER_HEIGHT;
}
function setCollapsed(group: RightPanelGroup, collapsed: boolean) {
 if (group === "upper") upperCollapsed.value = collapsed;
 else if (group === "middle") middleCollapsed.value = collapsed;
 else lowerCollapsed.value = collapsed;
}
function openGroup(group: RightPanelGroup) {
 // On short windows an explicitly opened inspector takes priority. All
 // headers stay available so returning to Layers is always one click.
 if (isCollapsed(group) && stackHeight.value < 550) {
  for (const other of visibleGroups.value) if (other !== group) setCollapsed(other, true);
 }
 setCollapsed(group, false);
}
function toggleGroup(group: RightPanelGroup) {
 if (isCollapsed(group)) openGroup(group); else setCollapsed(group, true);
}

let stopResize: (() => void) | undefined;
let stackResizeObserver: ResizeObserver | undefined;

function currentUpperHeight(): number {
	return upperCollapsed.value ? PANEL_HEADER_HEIGHT : upperHeight.value;
}

function currentMiddleHeight(): number {
	return middleCollapsed.value ? PANEL_HEADER_HEIGHT : middleHeight.value;
}

function currentLowerHeight(): number {
	return lowerCollapsed.value ? PANEL_HEADER_HEIGHT : LOWER_MIN_HEIGHT;
}

function groupCollapsed(group: RightPanelGroup): boolean {
	if (group === "upper") return upperCollapsed.value;
	if (group === "middle") return middleCollapsed.value;
	return lowerCollapsed.value;
}

function currentGroupHeight(group: RightPanelGroup): number {
	if (group === "upper") return currentUpperHeight();
	if (group === "middle") return currentMiddleHeight();
	return currentLowerHeight();
}

function maximumHeight(boundary: "upper" | "middle"): number {
	const availableHeight =
		stackHeight.value || stackElement.value?.getBoundingClientRect().height || 0;
	const groups = visibleGroups.value;
	const reservedHeight = groups.reduce((total, group, index) => {
		if (group === boundary) return total;
		const last = index === groups.length - 1;
		if (!groupCollapsed(group) && last) {
			return total + (group === "lower" ? LOWER_MIN_HEIGHT : PANEL_MIN_HEIGHT);
		}
		return total + currentGroupHeight(group);
	}, 0);
	return Math.max(
		PANEL_MIN_HEIGHT,
		availableHeight - reservedHeight - RESIZER_HEIGHT * Math.max(0, groups.length - 1),
	);
}

function setBoundaryHeight(boundary: "upper" | "middle", value: number): void {
 openGroup(boundary);
	const next = Math.round(Math.min(maximumHeight(boundary), Math.max(PANEL_MIN_HEIGHT, value)));
	if (boundary === "upper") {
		upperCollapsed.value = false;
		upperHeight.value = next;
	} else {
		middleCollapsed.value = false;
		middleHeight.value = next;
	}
}

function startResize(event: PointerEvent, boundary: "upper" | "middle"): void {
	const stack = stackElement.value;
	if (!stack) return;
	event.preventDefault();
	stopResize?.();
	const rect = stack.getBoundingClientRect();
	const onMove = (moveEvent: PointerEvent) => {
		const offset =
			boundary === "upper"
				? moveEvent.clientY - rect.top
				: moveEvent.clientY - rect.top - renderedHeight("upper") - RESIZER_HEIGHT;
		setBoundaryHeight(boundary, offset);
	};
	const onUp = () => stopResize?.();
	document.body.classList.add("als-ofs-psd-is-row-resizing");
	document.addEventListener("pointermove", onMove);
	document.addEventListener("pointerup", onUp, { once: true });
	stopResize = () => {
		document.body.classList.remove("als-ofs-psd-is-row-resizing");
		document.removeEventListener("pointermove", onMove);
		document.removeEventListener("pointerup", onUp);
		stopResize = undefined;
	};
}

function resizeWithKeyboard(event: KeyboardEvent, boundary: "upper" | "middle"): void {
	if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
	event.preventDefault();
	const current = boundary === "upper" ? currentUpperHeight() : currentMiddleHeight();
	const next =
		event.key === "Home"
			? PANEL_MIN_HEIGHT
			: event.key === "End"
				? maximumHeight(boundary)
				: current + (event.key === "ArrowUp" ? -16 : 16);
	setBoundaryHeight(boundary, next);
}

function selectUpper(tab: PsdUpperPaneId): void {
	upperTab.value = tab;
	openGroup("upper");
	if (tab === "info") setBoundaryHeight("upper", Math.max(276, upperHeight.value));
}

onMounted(() => {
	const stack = stackElement.value;
	if (!stack) return;
	const updateHeight = () =>
		(stackHeight.value = Math.round(stack.getBoundingClientRect().height));
	updateHeight();
	if (typeof ResizeObserver !== "undefined") {
		stackResizeObserver = new ResizeObserver(updateHeight);
		stackResizeObserver.observe(stack);
	}
});

onBeforeUnmount(() => {
	stopResize?.();
	stackResizeObserver?.disconnect();
});

function onUpperTabKeydown(event: KeyboardEvent): void {
	if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
	const tablist = (event.currentTarget as HTMLElement).parentElement;
	const tabs = Array.from(tablist?.querySelectorAll<HTMLElement>("[role='tab']") ?? []);
	const current = tabs.indexOf(event.currentTarget as HTMLElement);
	if (current < 0 || tabs.length === 0) return;
	event.preventDefault();
	const nextIndex =
		event.key === "Home"
			? 0
			: event.key === "End"
				? tabs.length - 1
				: (current + (event.key === "ArrowLeft" ? -1 : 1) + tabs.length) % tabs.length;
	const next = tabs[nextIndex];
	const id = next.dataset.panelTab;
	if (id === "color" || id === "history" || id === "info") selectUpper(id);
	next.focus();
}
</script>

<template>
	<UiEditorDock
		v-model:width="width"
		class="als-ofs-psd-right"
		side="right"
		:resizable="true"
		:min-width="260"
		:max-width="520"
		aria-label="Panels"
	>
		<div ref="stackElement" class="als-ofs-psd-right__stack" :style="stackStyle">
			<section
				v-if="upperVisible"
				class="als-ofs-psd-right__group als-ofs-psd-right__group--upper"
				:data-collapsed="isCollapsed('upper') || undefined"
			>
				<div
					class="als-ofs-psd-right__tabs"
					role="tablist"
					aria-label="Upper panels"
					@dblclick="toggleGroup('upper')"
				>
					<button
						v-if="paneState.visibility.color"
						type="button"
						class="als-ofs-psd-right__tab"
						role="tab"
						:id="`${upperId}-color-tab`"
						:aria-selected="upperTab === 'color'"
						:aria-controls="`${upperId}-panel`"
						data-panel-tab="color"
						:data-active="upperTab === 'color' || undefined"
						:tabindex="upperTab === 'color' ? 0 : -1"
						@click="selectUpper('color')"
						@keydown="onUpperTabKeydown"
					>
						Color
					</button>
					<button
						v-if="paneState.visibility.history"
						type="button"
						class="als-ofs-psd-right__tab"
						role="tab"
						:id="`${upperId}-history-tab`"
						:aria-selected="upperTab === 'history'"
						:aria-controls="`${upperId}-panel`"
						data-panel-tab="history"
						:data-active="upperTab === 'history' || undefined"
						:tabindex="upperTab === 'history' ? 0 : -1"
						@click="selectUpper('history')"
						@keydown="onUpperTabKeydown"
					>
						History
					</button>
					<button
						v-if="paneState.visibility.info"
						type="button"
						class="als-ofs-psd-right__tab"
						role="tab"
						:id="`${upperId}-info-tab`"
						:aria-selected="upperTab === 'info'"
						:aria-controls="`${upperId}-panel`"
						data-panel-tab="info"
						:data-active="upperTab === 'info' || undefined"
						:tabindex="upperTab === 'info' ? 0 : -1"
						@click="selectUpper('info')"
						@keydown="onUpperTabKeydown"
					>
						Info
					</button>
					<button
						type="button"
						class="als-ofs-psd-right__collapse"
						:aria-controls="`${upperId}-panel`"
						:aria-expanded="!isCollapsed('upper')"
						:aria-label="
							isCollapsed('upper') ? 'Expand upper panels' : 'Collapse upper panels'
						"
						:title="isCollapsed('upper') ? 'Expand panels' : 'Collapse panels'"
						@click.stop="toggleGroup('upper')"
						@dblclick.stop
					>
						<UiIcon
							:name="isCollapsed('upper') ? 'chevron-right' : 'chevron-down'"
							:size="13"
						/>
					</button>
				</div>
				<div
					v-show="!isCollapsed('upper')"
					:id="`${upperId}-panel`"
					class="als-ofs-psd-right__body"
					role="tabpanel"
					:aria-labelledby="`${upperId}-${upperTab}-tab`"
				>
					<PsdColorPanel v-if="upperTab === 'color' && paneState.visibility.color" />
					<PsdHistoryPanel
						v-else-if="upperTab === 'history' && paneState.visibility.history"
					/>
					<PsdInfoPanel v-else />
				</div>
			</section>
			<UiPanelResizer
				v-if="upperVisible && visibleGroups.length > 1"
				class="als-ofs-psd-right__resizer"
				orientation="horizontal"
				aria-label="Resize Color and History panels"
				:min="PANEL_HEADER_HEIGHT"
				:max="maximumHeight('upper')"
				:value="renderedHeight('upper')"
				@pointer-down="startResize($event, 'upper')"
				@key-down="resizeWithKeyboard($event, 'upper')"
			/>
			<section
				v-if="middleVisible"
				class="als-ofs-psd-right__group als-ofs-psd-right__group--middle"
				:data-collapsed="isCollapsed('middle') || undefined"
			>
				<div class="als-ofs-psd-right__tabs" @dblclick="toggleGroup('middle')">
					<h3 class="als-ofs-psd-right__title">Properties</h3>
					<button
						type="button"
						class="als-ofs-psd-right__collapse"
						aria-controls="psd-properties-panel"
						:aria-expanded="!isCollapsed('middle')"
						:aria-label="isCollapsed('middle') ? 'Expand Properties' : 'Collapse Properties'"
						:title="isCollapsed('middle') ? 'Expand Properties' : 'Collapse Properties'"
						@click.stop="toggleGroup('middle')"
						@dblclick.stop
					>
						<UiIcon
							:name="isCollapsed('middle') ? 'chevron-right' : 'chevron-down'"
							:size="13"
						/>
					</button>
				</div>
				<div
					v-show="!isCollapsed('middle')"
					id="psd-properties-panel"
					class="als-ofs-psd-right__body"
					role="region"
					aria-label="Properties"
				>
					<PsdPropertiesPanel />
				</div>
			</section>
			<UiPanelResizer
				v-if="middleVisible && lowerVisible"
				class="als-ofs-psd-right__resizer"
				orientation="horizontal"
				aria-label="Resize Properties and Layers panels"
				:min="PANEL_HEADER_HEIGHT"
				:max="maximumHeight('middle')"
				:value="renderedHeight('middle')"
				@pointer-down="startResize($event, 'middle')"
				@key-down="resizeWithKeyboard($event, 'middle')"
			/>
			<section
				v-if="lowerVisible"
				class="als-ofs-psd-right__group als-ofs-psd-right__group--lower"
				:data-collapsed="isCollapsed('lower') || undefined"
			>
				<div class="als-ofs-psd-right__tabs" role="tablist" aria-label="Lower panels">
					<button
						type="button"
						class="als-ofs-psd-right__tab"
						role="tab"
						:id="`${lowerId}-layers-tab`"
						aria-selected="true"
						:aria-controls="`${lowerId}-panel`"
						data-panel-tab="layers"
						data-active="true"
						tabindex="0"
						@click="openGroup('lower')"
					>
						Layers
					</button>
					<button
						type="button"
						class="als-ofs-psd-right__collapse"
						:aria-controls="`${lowerId}-panel`"
						:aria-expanded="!isCollapsed('lower')"
						:aria-label="isCollapsed('lower') ? 'Expand Layers' : 'Collapse Layers'"
						:title="isCollapsed('lower') ? 'Expand Layers' : 'Collapse Layers'"
						@click.stop="toggleGroup('lower')"
					>
						<UiIcon
							:name="isCollapsed('lower') ? 'chevron-right' : 'chevron-down'"
							:size="13"
						/>
					</button>
				</div>
				<div
					v-show="!isCollapsed('lower')"
					:id="`${lowerId}-panel`"
					class="als-ofs-psd-right__body"
					role="tabpanel"
					:aria-labelledby="`${lowerId}-layers-tab`"
				>
					<PsdLayersPanel />
				</div>
			</section>
		</div>
	</UiEditorDock>
</template>
