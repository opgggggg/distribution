<script setup lang="ts">
import Icon from "./android/AndroidIcon.vue";

defineProps<{
	fileName: string;
	status: string;
	statusState?: string;
	editing: boolean;
	editable: boolean;
	ready: boolean;
	saving: boolean;
	menuOpen: boolean;
}>();
const emit = defineEmits<{
	back: [];
	documents: [];
	edit: [];
	finish: [];
	more: [];
}>();
</script>

<template>
	<nav class="document-topbar" aria-label="文档操作" :data-editing="editing">
		<button type="button" class="document-topbar__icon" aria-label="返回" @click="emit('back')">
			<Icon name="back" />
		</button>
		<button
			type="button"
			class="document-topbar__title"
			aria-label="切换文档"
			:title="fileName"
			@click="emit('documents')"
		>
			<strong>{{ fileName }}</strong>
			<small role="status" :data-autosave-state="statusState">{{ status }}</small>
		</button>
		<div class="document-topbar__actions">
			<slot />
			<button
				v-if="editable"
				type="button"
				class="document-topbar__mode"
				:aria-label="editing ? '完成编辑' : '编辑文档'"
				:disabled="!ready || saving"
				@pointerdown.prevent
				@click="editing ? emit('finish') : emit('edit')"
			>
				<Icon :name="editing ? 'check' : 'edit'" />
				<span>{{ editing ? "完成" : "编辑" }}</span>
			</button>
			<button
				type="button"
				class="document-topbar__icon"
				aria-label="更多文档操作"
				aria-haspopup="dialog"
				:aria-expanded="menuOpen"
				@pointerdown.prevent
				@click="emit('more')"
			>
				<Icon name="more" />
			</button>
		</div>
	</nav>
</template>

<style scoped>
.document-topbar {
	--document-bar-accent: var(--android-primary, #205c4e);
	--document-bar-on-accent: var(--android-on-primary, #fff);
	--document-bar-surface: var(--android-surface, #f8faf7);
	--document-bar-text: var(--android-text, #1a211e);
	--document-bar-muted: var(--android-secondary, #56615a);
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	min-width: 0;
	min-height: var(--harmony-mobile-header-height, 64px);
	padding: 8px 12px;
	box-sizing: border-box;
	color: var(--document-bar-text);
	background: var(--document-bar-surface);
	border: 0;
	box-shadow: inset 0 -1px 0 var(--android-outline, #dce3dc);
	-webkit-user-select: none;
	user-select: none;
	-webkit-touch-callout: none;
}
.document-topbar button {
	font-family: inherit;
	border: 0;
	cursor: pointer;
	touch-action: manipulation;
	transition: background-color 150ms ease;
}
.document-topbar button:disabled,
.document-topbar__actions :slotted(button:disabled) {
	opacity: 0.45;
	cursor: default;
}
.document-topbar button:focus-visible,
.document-topbar__actions :slotted(button:focus-visible) {
	outline: 2px solid var(--document-bar-accent);
	outline-offset: 2px;
}
.document-topbar__title {
	flex: 1;
	min-width: 0;
	min-height: 48px;
	padding: 4px;
	text-align: left;
	color: inherit;
	background: transparent;
	border-radius: 8px;
}
.document-topbar__title strong,
.document-topbar__title small {
	display: block;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.document-topbar__title strong {
	font-size: 16px;
	line-height: 1.35;
	font-weight: 600;
}
.document-topbar__title small {
	margin-top: 2px;
	font-size: 12px;
	line-height: 1.35;
	color: var(--document-bar-muted);
}
.document-topbar__title small[data-autosave-state="error"] {
	color: #b42318;
}
.document-topbar__actions {
	display: flex;
	align-items: center;
	flex-shrink: 0;
	gap: 8px;
}
.document-topbar__icon,
.document-topbar__actions :slotted(button) {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: 0 0 48px;
	width: 48px;
	min-width: 48px;
	height: 48px;
	padding: 12px;
	border: 0;
	border-radius: 12px;
	color: var(--document-bar-accent);
	background: transparent;
}
.document-topbar__mode {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	width: 84px;
	height: 48px;
	padding: 0 10px;
	border-radius: 14px;
	font-size: 14px;
	font-weight: 600;
	color: var(--document-bar-on-accent);
	background: var(--document-bar-accent);
}
.document-topbar__icon:active,
.document-topbar__title:active,
.document-topbar__actions :slotted(button:active),
.document-topbar__actions :slotted(button[aria-expanded="true"]) {
	background: color-mix(in srgb, var(--document-bar-accent) 12%, transparent);
}
.document-topbar__mode:active:not(:disabled) {
	background: color-mix(in srgb, var(--document-bar-accent) 85%, #000);
}
.document-topbar :deep(svg) {
	width: 24px;
	height: 24px;
	flex-shrink: 0;
	fill: none;
	stroke: currentColor;
	stroke-width: 1.8;
	stroke-linecap: round;
	stroke-linejoin: round;
}
.document-topbar__mode :deep(svg) {
	flex: 0 0 20px;
	width: 20px;
	height: 20px;
}
.document-topbar__mode span {
	flex-shrink: 0;
	white-space: nowrap;
}
@media (max-width: 420px) {
	.document-topbar {
		gap: 4px;
		padding-inline: 8px;
	}
	.document-topbar__actions {
		gap: 4px;
	}
	.document-topbar__mode {
		width: 76px;
	}
}
@media (prefers-reduced-motion: reduce) {
	.document-topbar button {
		transition: none;
	}
}
</style>
