<script setup lang="ts">
type IconName =
	| "adjust"
	| "brush"
	| "chevron"
	| "crop"
	| "download"
	| "eye"
	| "eye-off"
	| "hand"
	| "history"
	| "image"
	| "layers"
	| "marquee"
	| "more"
	| "move"
	| "redo"
	| "search"
	| "sparkles"
	| "text"
	| "undo"
	| "zoom-in"
	| "zoom-out";

defineProps<{ name: IconName; size?: number }>();
</script>

<template>
	<svg
		class="ofk-psd-icon"
		:viewBox="name === 'more' ? '0 0 24 24' : '0 0 24 24'"
		:width="size || 18"
		:height="size || 18"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<template v-if="name === 'move'">
			<path
				d="M12 2v20M2 12h20M12 2l-3 3m3-3 3 3M22 12l-3-3m3 3-3 3M12 22l3-3m-3 3-3-3M2 12l3 3m-3-3 3-3"
			/>
		</template>
		<template v-else-if="name === 'marquee'">
			<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 3" />
		</template>
		<template v-else-if="name === 'brush'">
			<path d="m14.5 5.5 4-4 4 4-11 11-4 1 1-4 6-6Z" />
			<path d="M8 17c-1 3-3 4-6 3 2-1 1-4 4-5" />
		</template>
		<template v-else-if="name === 'crop'">
			<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14" />
		</template>
		<template v-else-if="name === 'text'">
			<path d="M5 4h14M12 4v16M8 20h8" />
		</template>
		<template v-else-if="name === 'hand'">
			<path
				d="M7 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v8c0 5-3 8-8 8-3 0-5-2-7-5l-2-3a2 2 0 0 1 3-2l2 2"
			/>
		</template>
		<template v-else-if="name === 'search' || name === 'zoom-in' || name === 'zoom-out'">
			<circle cx="10.5" cy="10.5" r="6.5" />
			<path d="m16 16 5 5" />
			<path v-if="name !== 'search'" d="M7.5 10.5h6" />
			<path v-if="name === 'zoom-in'" d="M10.5 7.5v6" />
		</template>
		<template v-else-if="name === 'eye' || name === 'eye-off'">
			<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
			<circle cx="12" cy="12" r="2.5" />
			<path v-if="name === 'eye-off'" d="m3 3 18 18" />
		</template>
		<template v-else-if="name === 'layers'">
			<path d="m12 3 9 5-9 5-9-5 9-5Z" />
			<path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
		</template>
		<template v-else-if="name === 'adjust'">
			<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4" />
			<circle cx="16" cy="6" r="2" />
			<circle cx="8" cy="12" r="2" />
			<circle cx="14" cy="18" r="2" />
		</template>
		<template v-else-if="name === 'history'">
			<path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
			<path d="M3 3v5h5M12 7v5l3 2" />
		</template>
		<template v-else-if="name === 'undo' || name === 'redo'">
			<path v-if="name === 'undo'" d="M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6" />
			<path v-else d="m15 7 5 5-5 5m4-5h-8a6 6 0 0 0-6 6" />
		</template>
		<template v-else-if="name === 'download'">
			<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 20h16" />
		</template>
		<template v-else-if="name === 'image'">
			<rect x="3" y="4" width="18" height="16" rx="2" />
			<circle cx="8" cy="9" r="1.5" />
			<path d="m4 17 5-5 4 4 2-2 5 5" />
		</template>
		<template v-else-if="name === 'sparkles'">
			<path
				d="M12 3c.4 4.5 2.9 7 7 7-4.1.4-6.6 2.9-7 7-.4-4.1-2.9-6.6-7-7 4.1 0 6.6-2.5 7-7ZM19 16c.2 2 1.3 3.2 3 3.5-1.7.2-2.8 1.4-3 3.5-.2-2.1-1.3-3.3-3-3.5 1.7-.3 2.8-1.5 3-3.5Z"
			/>
		</template>
		<template v-else-if="name === 'chevron'">
			<path d="m8 10 4 4 4-4" />
		</template>
		<template v-else>
			<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
			<circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
			<circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
		</template>
	</svg>
</template>
