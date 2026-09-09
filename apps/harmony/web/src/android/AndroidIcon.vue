<script setup lang="ts">
defineProps<{ name: string }>();
const paths: Record<string, string> = {
	"align-left": "M4 5h16M4 10h10M4 15h16M4 20h10",
	"align-center": "M4 5h16M7 10h10M4 15h16M7 20h10",
	"align-right": "M4 5h16M10 10h10M4 15h16M10 20h10",
	"align-justify": "M4 5h16M4 10h16M4 15h16M4 20h16",
	"list-bullet": "M8 6h12M8 12h12M8 18h12M3 6h.01M3 12h.01M3 18h.01",
	"list-number": "M9 6h11M9 12h11M9 18h11M3 4h1v5M2 9h4M2 14c0-2 3-2 3 0l-3 5h3",
	back: "m12 5-7 7 7 7M5 12h15",
	close: "m6 6 12 12M18 6 6 18",
	more: "M12 5h.01M12 12h.01M12 19h.01",
	search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
	folder: "M3 7V5h6l2 2h10v13H3V7Z",
	plus: "M12 5v14M5 12h14",
	file: "M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h6",
	recent: "M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2",
	settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
	edit: "m4 20 4-1L20 7l-3-3L5 16l-1 4Zm10-13 3 3",
	check: "m5 12 4 4L19 6",
	save: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
	undo: "m8 4-5 5 5 5M3 9h10a7 7 0 0 1 7 7",
	redo: "m16 4 5 5-5 5M21 9h-10a7 7 0 0 0-7 7",
	chevron: "m9 5 7 7-7 7",
	keyboard: "M3 4h18v12H3V4Zm3 4h.01M10 8h.01M14 8h.01M18 8h.01M7 12h10m-8 7 3 3 3-3",
	play: "m8 4 12 8-12 8V4Z",
	bold: "M7 4h6a4 4 0 0 1 0 8H7V4Zm0 8h7a4 4 0 0 1 0 8H7v-8Z",
	format: "M4 5h16M12 5v15M8 20h8",
	image: "M3 4h18v16H3V4Zm1 13 5-5 4 4 3-3 5 5M8 8h.01",
};
</script>
<template>
	<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
		<path :d="paths[name] || paths.file" />
	</svg>
</template>
