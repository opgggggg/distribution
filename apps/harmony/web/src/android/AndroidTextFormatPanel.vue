<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { AndroidTextFormat } from "./text-format";
import Icon from "./AndroidIcon.vue";
import ErrorNotice from "../ErrorNotice.vue";
const props = defineProps<{ format: AndroidTextFormat; error: string }>();
const emit = defineEmits<{
	close: [];
	more: [];
	text: [patch: AndroidTextFormat];
	paragraph: [patch: AndroidTextFormat];
	dismissError: [];
}>();
const dialog = ref<HTMLDialogElement>();
const tab = ref("text");
const fonts = computed(() => [
	...new Set([
		props.format.fontFamily || "Aptos",
		"Arial",
		"Calibri",
		"宋体",
		"黑体",
		"微软雅黑",
		"Times New Roman",
	]),
]);
const colors = [
	{ value: "#202624", label: "墨黑" },
	{ value: "#787f87", label: "灰色" },
	{ value: "#c64343", label: "红色" },
	{ value: "#c18a28", label: "金色" },
	{ value: "#238657", label: "绿色" },
	{ value: "#3b6fca", label: "蓝色" },
];
const alignments = [
	{ value: "left", label: "左对齐" },
	{ value: "center", label: "居中" },
	{ value: "right", label: "右对齐" },
	{ value: "justify", label: "两端对齐" },
] as const;
let previousFocus: HTMLElement | null = null;
function size(value: number) {
	if (Number.isFinite(value)) emit("text", { fontSizePt: Math.max(1, Math.min(200, value)) });
}
onMounted(() => {
	previousFocus = document.activeElement as HTMLElement;
	dialog.value?.showModal();
});
onBeforeUnmount(() => {
	dialog.value?.close();
	previousFocus?.focus({ preventScroll: true });
});
</script>
<template>
	<dialog
		ref="dialog"
		class="android-type-panel"
		aria-labelledby="android-type-title"
		@cancel.prevent="emit('close')"
		@click.self="emit('close')"
	>
		<header class="android-type-header">
			<div><h2 id="android-type-title">格式</h2></div>
			<button class="android-type-close" aria-label="关闭格式面板" @click="emit('close')">
				<Icon name="close" />
			</button>
		</header>
		<div class="android-type-tabs" role="tablist" aria-label="格式分类">
			<button
				id="android-type-text-tab"
				role="tab"
				:aria-selected="tab === 'text'"
				aria-controls="android-type-content"
				@click="tab = 'text'"
			>
				文字
			</button>
			<button
				id="android-type-paragraph-tab"
				role="tab"
				:aria-selected="tab === 'paragraph'"
				aria-controls="android-type-content"
				@click="tab = 'paragraph'"
			>
				段落
			</button>
		</div>
		<div
			id="android-type-content"
			class="android-type-content"
			role="tabpanel"
			:aria-labelledby="
				tab === 'text' ? 'android-type-text-tab' : 'android-type-paragraph-tab'
			"
		>
			<ErrorNotice :message="error" @dismiss="emit('dismissError')" />
			<template v-if="tab === 'text'">
				<div class="android-type-font-row">
					<label class="android-type-font"
						><span>字体</span
						><span class="android-type-select"
							><select
								:value="format.fontFamily || 'Aptos'"
								@change="
									emit('text', {
										fontFamily: ($event.target as HTMLSelectElement).value,
									})
								"
							>
								<option v-for="font in fonts" :key="font">
									{{ font }}
								</option></select
							><Icon name="chevron" /></span
					></label>
					<div class="android-type-size">
						<label for="android-type-size">字号</label>
						<div>
							<button
								aria-label="减小字号"
								@click="size((format.fontSizePt || 12) - 1)"
							>
								−</button
							><input
								id="android-type-size"
								type="number"
								min="1"
								max="200"
								:value="format.fontSizePt || 12"
								@change="size(Number(($event.target as HTMLInputElement).value))"
							/><button
								aria-label="增大字号"
								@click="size((format.fontSizePt || 12) + 1)"
							>
								+
							</button>
						</div>
					</div>
				</div>
				<section class="android-type-section">
					<h3>字形</h3>
					<div class="android-type-segments">
						<button
							aria-label="加粗"
							:aria-pressed="Boolean(format.bold)"
							@click="emit('text', { bold: !format.bold })"
						>
							<b>B</b><span>加粗</span>
						</button>
						<button
							aria-label="斜体"
							:aria-pressed="Boolean(format.italic)"
							@click="emit('text', { italic: !format.italic })"
						>
							<i>I</i><span>斜体</span>
						</button>
						<button
							aria-label="下划线"
							:aria-pressed="Boolean(format.underline && format.underline !== 'none')"
							@click="
								emit('text', {
									underline:
										format.underline && format.underline !== 'none'
											? 'none'
											: 'single',
								})
							"
						>
							<u>U</u><span>下划线</span>
						</button>
						<button
							aria-label="删除线"
							:aria-pressed="Boolean(format.strikethrough)"
							@click="emit('text', { strikethrough: !format.strikethrough })"
						>
							<s>S</s><span>删除线</span>
						</button>
					</div>
				</section>
				<section class="android-type-section">
					<h3>文字颜色</h3>
					<div class="android-type-colors">
						<button
							v-for="color in colors"
							:key="color.value"
							:aria-label="color.label"
							:aria-pressed="
								(format.color || '#202624').toLowerCase() === color.value
							"
							@click="emit('text', { color: color.value })"
						>
							<span :style="{ background: color.value }"
								><Icon
									v-if="(format.color || '#202624').toLowerCase() === color.value"
									name="check"
							/></span>
						</button>
						<label class="android-type-custom-color" title="自定义文字颜色"
							><Icon name="plus" /><input
								type="color"
								aria-label="自定义文字颜色"
								:value="
									/^#[\da-f]{6}$/i.test(format.color || '')
										? format.color
										: '#202624'
								"
								@input="
									emit('text', {
										color: ($event.target as HTMLInputElement).value,
									})
								"
						/></label>
					</div>
				</section>
			</template>
			<template v-else>
				<label class="android-type-font"
					><span>段落样式</span
					><span class="android-type-select"
						><select
							:value="format.styleId || 'Normal'"
							@change="
								emit('paragraph', {
									styleId: ($event.target as HTMLSelectElement).value,
								})
							"
						>
							<option value="Normal">正文</option>
							<option value="Heading1">标题 1</option>
							<option value="Heading2">标题 2</option>
							<option value="Heading3">标题 3</option>
							<option value="Quote">引用</option></select
						><Icon name="chevron" /></span
				></label>
				<section class="android-type-section">
					<h3>对齐方式</h3>
					<div class="android-type-segments">
						<button
							v-for="alignment in alignments"
							:key="alignment.value"
							:aria-label="alignment.label"
							:aria-pressed="(format.alignment || 'left') === alignment.value"
							@click="emit('paragraph', { alignment: alignment.value })"
						>
							<Icon :name="`align-${alignment.value}`" /><span>{{
								alignment.label
							}}</span>
						</button>
					</div>
				</section>
				<section class="android-type-section">
					<h3>列表</h3>
					<div class="android-type-lists">
						<button
							:aria-pressed="format.listType === 'bullet'"
							@click="
								emit('paragraph', {
									listType: format.listType === 'bullet' ? null : 'bullet',
								})
							"
						>
							<Icon name="list-bullet" />项目符号</button
						><button
							:aria-pressed="format.listType === 'decimal'"
							@click="
								emit('paragraph', {
									listType: format.listType === 'decimal' ? null : 'decimal',
								})
							"
						>
							<Icon name="list-number" />编号列表
						</button>
					</div>
				</section>
			</template>
		</div>
		<button class="android-type-more" @click="emit('more')">
			全部工具<Icon name="chevron" />
		</button>
	</dialog>
</template>
