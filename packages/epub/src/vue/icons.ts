import { h, type VNode } from "vue";

/** 24px stroke icons drawn for this reader; stroke follows currentColor. */
const PATHS = {
	back: ["M15 5l-7 7 7 7"],
	"chevron-left": ["M14.5 6l-6 6 6 6"],
	"chevron-right": ["M9.5 6l6 6-6 6"],
	contents: ["M8 6h12", "M8 12h12", "M8 18h12", "M4 6h.01", "M4 12h.01", "M4 18h.01"],
	sidebar: ["M4 5h16v14H4z", "M9.5 5v14"],
	search: ["M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z", "M15.5 15.5L20 20"],
	bookmark: ["M7 4h10v16l-5-3.6L7 20z"],
	type: ["M4 18l4.5-12h1L14 18", "M5.7 14h6.6", "M15 18l2.75-7h.5L21 18", "M15.9 15.6h4.2"],
	sun: ["M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M12 2.5v2", "M12 19.5v2", "M4.6 4.6l1.4 1.4", "M18 18l1.4 1.4", "M2.5 12h2", "M19.5 12h2", "M4.6 19.4L6 18", "M18 6l1.4-1.4"],
	moon: ["M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"],
	close: ["M6 6l12 12", "M18 6L6 18"],
	note: ["M5 19h4L19 9a2.8 2.8 0 0 0-4-4L5 15z", "M13.5 6.5l4 4"],
	notes: ["M6 4h9l3 3v13H6z", "M9 10h6", "M9 14h6", "M9 18h3"],
	copy: ["M9 9h10v11H9z", "M5 15V4h10"],
	trash: ["M5 7h14", "M10 11v6", "M14 11v6", "M7 7l1 13h8l1-13", "M9.5 7V4.5h5V7"],
	undo: ["M9 14L4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"],
	minus: ["M6 12h12"],
	plus: ["M12 6v12", "M6 12h12"],
	check: ["M5 12.5l4.5 4.5L19 7.5"],
	highlight: ["M4 20h7", "M14.5 4.5l5 5L11 18H6v-5z"],
	book: ["M5 4.5h9.5A3.5 3.5 0 0 1 18 8v11.5H8.5A3.5 3.5 0 0 1 5 16z", "M5 16a3.5 3.5 0 0 1 3.5-3.5H18"],
} as const;

export type ReaderIconName = keyof typeof PATHS;

export function icon(name: ReaderIconName, options: { filled?: boolean; size?: number } = {}): VNode {
	const size = options.size ?? 22;
	return h("svg", {
		class: "cubexp-epub-icon", width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": "true",
		fill: options.filled ? "currentColor" : "none", stroke: "currentColor", "stroke-width": 1.7,
		"stroke-linecap": "round", "stroke-linejoin": "round",
	}, PATHS[name].map(d => h("path", { d })));
}
