<script setup lang="ts">
import { ref } from "vue";
import {
	UiRibbonCommandButton,
	UiRibbonGroup,
	UiRibbonPopover,
	UiRibbonSurface,
	UiRibbonTabs,
	UiSearchBox,
	useUiEditorI18n,
	useUiEditorPalette,
	type UiSearchResultItem,
} from "@yaochn/als-office-editor-ui/vue";

defineProps<{
	searchLabel: string;
	query: string;
	results: UiSearchResultItem[];
	activeResult?: string;
	sidebarLabel: string;
	sidebarOpen: boolean;
	bookmarkLabel: string;
	bookmarked: boolean;
	appearanceLabel: string;
	ready: boolean;
}>();

defineEmits<{
	search: [query: string];
	selectResult: [id: string];
	submitSearch: [direction: 1 | -1];
	toggleSidebar: [];
	toggleBookmark: [];
}>();

const palette = useUiEditorPalette();
const i18n = useUiEditorI18n();
const tab = ref("home");
const appearanceOpen = ref(false);
</script>

<template>
	<div
		class="cubeoffice-epub-ribbon als-ofs-ui-editor-shell als-ofs-editor-ui"
		:data-editor-palette="palette"
		data-editor-ribbon-mode="desktop"
	>
		<UiRibbonSurface mode="desktop" :active-tab="tab" aria-label="EPUB">
			<template #tabs>
				<UiRibbonTabs
					v-model="tab"
					mode="desktop"
					:items="[{ id: 'home', label: i18n.t('pdf.home') }]"
				/>
				<div class="als-ofs-ui-editor-shell__find als-ofs-ui-ribbon-tab-actions">
					<UiSearchBox
						:aria-label="searchLabel"
						:placeholder="searchLabel"
						:items="results"
						:model-value="query"
						:active-id="activeResult"
						:disabled="!ready"
						@update:model-value="$emit('search', $event)"
						@select="$emit('selectResult', $event.id)"
						@submit="$emit('submitSearch', $event)"
					/>
				</div>
			</template>
			<template #commands>
				<UiRibbonGroup :label="i18n.t('pdf.file')">
					<UiRibbonCommandButton
						data-editor-file-command="open"
						icon="open-file"
						:label="i18n.t('common.open')"
						size="lg"
					/>
				</UiRibbonGroup>
				<UiRibbonGroup :label="i18n.t('pdf.view')">
					<UiRibbonCommandButton
						icon="metadata"
						size="lg"
						:label="sidebarLabel"
						:disabled="!ready"
						:active="sidebarOpen"
						@activate="$emit('toggleSidebar')"
					/>
					<UiRibbonCommandButton
						icon="bookmark"
						size="lg"
						:label="bookmarkLabel"
						:disabled="!ready"
						:active="bookmarked"
						@activate="$emit('toggleBookmark')"
					/>
					<UiRibbonPopover
						v-model="appearanceOpen"
						icon="font"
						size="lg"
						:label="appearanceLabel"
						:content-aria-label="appearanceLabel"
						menu-indicator
					>
						<slot />
					</UiRibbonPopover>
				</UiRibbonGroup>
			</template>
		</UiRibbonSurface>
	</div>
</template>

<style scoped>
.cubeoffice-epub-ribbon {
	flex: 0 0 auto;
	height: auto;
}
</style>
