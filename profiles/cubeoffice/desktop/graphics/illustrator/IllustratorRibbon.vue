<script setup lang="ts">
import { computed, ref } from "vue";
import {
	UiRibbonCommandButton,
	UiRibbonGroup,
	UiRibbonSurface,
	UiRibbonTabs,
	useUiEditorI18n,
	type UiIconName,
} from "@yaochn/als-office-editor-ui/vue";
import {
	illustratorCommands,
	type IllustratorCommand,
	type IllustratorMenuState,
} from "./menu-commands";

const props = defineProps<{ state: IllustratorMenuState | null }>();
const emit = defineEmits<{ command: [command: IllustratorCommand] }>();
const i18n = useUiEditorI18n();
const language = computed(() => (i18n.value.locale === "zh-CN" ? 1 : 0));
const tabs = [
	{ id: "home", labels: ["Home", "开始"] },
	{ id: "object", labels: ["Object", "对象"] },
	{ id: "select", labels: ["Select", "选择"] },
	{ id: "view", labels: ["View", "视图"] },
	{ id: "window", labels: ["Window", "窗口"] },
] as const;
const tabItems = computed(() =>
	tabs.map(({ id, labels }) => ({ id, label: labels[language.value] })),
);
const tab = ref("home");
const collapsed = ref(false);

type CommandGroup = {
	labels: readonly [string, string];
	commands: readonly (readonly [IllustratorCommand, UiIconName])[];
};
const groups: Partial<Record<string, CommandGroup[]>> = {
	object: [
		{
			labels: ["Grouping", "编组"],
			commands: [
				["group", "group"],
				["ungroup", "ungroup"],
			],
		},
		{
			labels: ["Arrange", "排列"],
			commands: [
				["bringToFront", "bring-front"],
				["bringForward", "bring-forward"],
				["sendBackward", "send-backward"],
				["sendToBack", "send-back"],
			],
		},
	],
	select: [
		{
			labels: ["Selection", "选择范围"],
			commands: [
				["selectAll", "pane-selection"],
				["deselect", "close"],
				["inverse", "shape"],
			],
		},
	],
	view: [
		{
			labels: ["Zoom", "缩放"],
			commands: [
				["zoomIn", "zoom-in"],
				["zoomOut", "minus"],
				["actualSize", "exact-size"],
			],
		},
		{ labels: ["Artboard", "画板"], commands: [["fitArtboard", "fit-page"]] },
	],
	window: [
		{
			labels: ["Panels", "面板"],
			commands: [
				["layers", "send-back"],
				["properties", "panel"],
				["artboards", "whole-page"],
			],
		},
	],
};
function checked(command: IllustratorCommand): boolean | undefined {
	if (command === "layers" || command === "properties" || command === "artboards")
		return props.state?.checked[command] ?? false;
}
</script>

<template>
	<UiRibbonSurface
		class="vector-ribbon"
		mode="desktop"
		:aria-label="language ? 'Illustrator 功能区' : 'Illustrator ribbon'"
		:active-tab="tab"
		:collapsed="collapsed"
	>
		<template #tabs>
			<UiRibbonTabs
				v-model="tab"
				v-model:collapsed="collapsed"
				mode="desktop"
				:items="tabItems"
				@select="collapsed = false"
				@reselect="collapsed = !collapsed"
			/>
		</template>
		<template #commands>
			<slot v-if="tab === 'home'" name="home" :language="language" />
			<UiRibbonGroup
				v-for="{ labels, commands } in groups[tab]"
				:key="labels[0]"
				:label="labels[language]"
			>
				<UiRibbonCommandButton
					v-for="[command, icon] in commands"
					:key="command"
					:label="illustratorCommands[command][language]"
					:icon="icon"
					:size="commands.length === 1 || tab === 'select' ? 'lg' : 'sm'"
					:active="checked(command)"
					:presentation="checked(command) === undefined ? 'command' : 'check'"
					:disabled="!state?.enabled[command]"
					@activate="emit('command', command)"
				/>
			</UiRibbonGroup>
			<slot v-if="tab === 'object'" name="object" :language="language" />
			<slot name="context" :language="language" />
		</template>
	</UiRibbonSurface>
</template>
