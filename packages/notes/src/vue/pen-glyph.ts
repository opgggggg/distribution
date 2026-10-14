import { getBrushPlugin } from "../brushes.js";
import { h } from "vue";
import type { PenStyle } from "../model.js";

export type TrayTool = PenStyle | "highlighter" | "eraser" | "lasso";
/** Vector pen silhouettes: each tool keeps its own tip, material and ink band. */
export function penGlyph(tool: TrayTool, color: string, width: number, scope: string) {
	const plugin = getBrushPlugin(tool),
		glyph = plugin?.glyph ?? tool;
	const barrel = `${scope}-${tool}-barrel`,
		tip = `${scope}-${tool}-tip`;
	const path = (d: string, fill: string, extra = {}) =>
		h("path", { d: d.replace(/([a-zA-Z])/g, " $1 ").trim(), fill, ...extra });
	// ArkWeb's emulator GPU can drop convex SVG fills while retaining their outline.
	// Short rectangular scanlines preserve the same silhouette through its rect renderer.
	const polygon = (points: string, fill: string, extra = {}) => {
		const vertices = points.split(" ").map((pair) => pair.split(",").map(Number));
		const top = Math.min(...vertices.map((p) => p[1])),
			bottom = Math.max(...vertices.map((p) => p[1]));
		const rows = [];
		for (let y = top; y < bottom; y += 0.5) {
			const scan = y + 0.25,
				intersections: number[] = [];
			for (let i = 0; i < vertices.length; i++) {
				const a = vertices[i],
					b = vertices[(i + 1) % vertices.length];
				if ((a[1] <= scan && b[1] > scan) || (b[1] <= scan && a[1] > scan))
					intersections.push(a[0] + ((scan - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
			}
			intersections.sort((a, b) => a - b);
			for (let i = 0; i + 1 < intersections.length; i += 2)
				rows.push(
					h("rect", {
						x: intersections[i],
						y,
						width: intersections[i + 1] - intersections[i],
						height: Math.min(0.6, bottom - y),
						fill,
					}),
				);
		}
		return h("g", [...rows, h("polygon", { points, fill: "none", ...extra })]);
	};
	const body = h("rect", {
		x: 11,
		y: 43,
		width: 22,
		height: 77,
		rx: 5,
		fill: `url(#${barrel})`,
		stroke: "#8b929c",
		"stroke-opacity": 0.32,
		"stroke-width": 0.6,
	});
	const bambooBody = [
		path("M14 42H30V120H14Z", "#b98442"),
		path("M14 42H18V120H14Z", "#ebcd93", { opacity: 0.6 }),
		path("M16 48V118M27 48V118", "none", {
			stroke: "#674520",
			"stroke-opacity": 0.35,
			"stroke-width": 0.8,
		}),
		path("M14 60H30M14 98H30", "none", { stroke: "#664720", "stroke-width": 2 }),
		h("rect", { x: 14, y: 43, width: 16, height: 5, fill: "#303037" }),
	];
	const band = h("rect", { x: 11, y: 65, width: 22, height: 6, fill: color });
	let head;
	if (glyph === "ballpoint")
		head = [
			polygon("17,43 21,16 23,16 27,43", `url(#${barrel})`, {
				stroke: "#8b929c",
				"stroke-width": 0.6,
			}),
			polygon("21,16 22,9 23,16", color),
		];
	else if (glyph === "fountain")
		head = [
			polygon("22,8 13,29 17,43 27,43 31,29", `url(#${barrel})`, {
				stroke: "#9b9ca1",
				"stroke-width": 0.7,
			}),
			path("M22 10V32", "none", { stroke: color, "stroke-width": 1 }),
			h("circle", { cx: 22, cy: 31, r: 1.8, fill: color }),
		];
	else if (glyph === "brush")
		head = [
			path("M22 4C22 17 13 29 15 39C17 44 27 44 29 39C32 29 23 18 22 4Z", `url(#${tip})`),
			path("M19 24C15 32 18 38 19 39M24 27L27 38", "none", {
				stroke: "#ffffff",
				"stroke-opacity": 0.3,
				"stroke-width": 0.7,
			}),
		];
	else if (glyph === "pencil")
		head = [polygon("11,42 22,8 33,42", "#dfc29d"), polygon("18,21 22,8 26,21", color)];
	else if (glyph === "watercolor")
		head = [
			path("M22 10C20 17 15 27 17 34C18 39 27 39 28 32C29 25 25 16 22 10Z", `url(#${tip})`),
			h("rect", { x: 16, y: 36, width: 12, height: 11, rx: 2, fill: "#c3c9d0" }),
		];
	else if (glyph === "marker")
		head = [
			h("rect", { x: 13, y: 16, width: 18, height: 28, rx: 5, fill: color }),
			h("rect", { x: 14, y: 42, width: 16, height: 5, fill: `url(#${barrel})` }),
		];
	else if (glyph === "crayon")
		head = [polygon("10,45 15,20 22,16 29,20 34,45", color), path("M12 45H32V58H12Z", color)];
	else if (glyph === "reed")
		head = [
			polygon("11,43 16,18 31,8 33,43", "#d6b27c"),
			polygon("16,18 31,8 29,17 16,26", color),
			path("M24 17L21 36", "none", { stroke: color, "stroke-width": 1 }),
		];
	else if (glyph === "spray")
		head = [
			h("rect", { x: 16, y: 12, width: 12, height: 10, rx: 2, fill: "#5b6472" }),
			h("circle", { cx: 25, cy: 16, r: 2, fill: color }),
			h("rect", { x: 11, y: 23, width: 22, height: 24, rx: 6, fill: `url(#${barrel})` }),
			...[
				[-1, 7],
				[2, 3],
				[7, 8],
				[9, 2],
			].map(([x, y]) =>
				h("circle", { cx: 29 + x, cy: 10 - y, r: 1, fill: color, opacity: 0.65 }),
			),
		];
	else if (glyph === "oil")
		head = [
			polygon("10,28 10,9 16,7 28,7 34,9 34,28", `url(#${tip})`),
			path("M14 10V27M19 9V27M25 9V27M30 10V27", "none", {
				stroke: "#ffffff",
				"stroke-opacity": 0.35,
				"stroke-width": 0.8,
			}),
			h("rect", { x: 10, y: 28, width: 24, height: 17, rx: 2, fill: `url(#${barrel})` }),
		];
	else if (glyph === "highlighter")
		head = [
			polygon("14,33 14,15 30,8 30,29", color),
			polygon("14,33 15,44 29,44 30,29", `url(#${barrel})`),
		];
	else if (glyph === "eraser")
		head = [
			h("rect", {
				x: 11,
				y: 14,
				width: 22,
				height: 34,
				rx: 6,
				fill: "#ee929b",
				stroke: "#d88790",
				"stroke-width": 0.5,
			}),
		];
	else
		head = [
			h("ellipse", {
				cx: 22,
				cy: 26,
				rx: 12,
				ry: 15,
				fill: "none",
				stroke: "#6d7583",
				"stroke-width": 2,
				"stroke-dasharray": "2 2",
			}),
			path("M16 37C25 35 24 44 16 46", "none", { stroke: "#6d7583", "stroke-width": 1.5 }),
		];
	if (plugin?.tipPaths) head = plugin.tipPaths.map((d) => path(d, color));
	const pencilBody = [
		path("M11 42H33V120H11Z", color),
		path("M11 42H17V120H11Z", "#ffffff", { opacity: 0.4 }),
		path("M27 42H33V120H27Z", "#000000", { opacity: 0.12 }),
		path("M17 44V120M27 44V120", "none", {
			stroke: "#ffffff",
			"stroke-opacity": 0.3,
			"stroke-width": 0.5,
		}),
	];
	return h(
		"svg",
		{ class: "cube-notes__pen-glyph", viewBox: "0 0 44 120", "aria-hidden": "true" },
		[
			h("defs", [
				h("linearGradient", { id: barrel, x1: "0%", x2: "100%", y1: "0%", y2: "0%" }, [
					h("stop", { offset: "0", "stop-color": "#c5cbd2" }),
					h("stop", { offset: ".25", "stop-color": "#ffffff" }),
					h("stop", { offset: ".65", "stop-color": "#f1f3f5" }),
					h("stop", { offset: "1", "stop-color": "#bcc3cc" }),
				]),
				h("linearGradient", { id: tip, x1: "0%", x2: "100%", y1: "0%", y2: "0%" }, [
					h("stop", { offset: "0", "stop-color": color, "stop-opacity": 0.6 }),
					h("stop", { offset: ".5", "stop-color": color }),
					h("stop", { offset: "1", "stop-color": color, "stop-opacity": 0.75 }),
				]),
			]),
			h("g", { key: "tip", "data-pen-tip": glyph }, head),
			...(glyph === "brush"
				? bambooBody
				: glyph === "pencil" || glyph === "crayon" || glyph === "reed"
					? pencilBody
					: [body, ...(glyph === "eraser" || glyph === "lasso" ? [] : [band])]),
			...(glyph === "watercolor"
				? [
						h("rect", {
							x: 16,
							y: 79,
							width: 12,
							height: 26,
							rx: 5,
							fill: color,
							opacity: 0.13,
						}),
						path("M16 95Q22 91 28 95", "none", {
							stroke: color,
							"stroke-opacity": 0.45,
						}),
					]
				: []),
			glyph !== "lasso"
				? h(
						"text",
						{
							x: 22,
							y: 91,
							fill: ["brush", "pencil", "crayon", "reed"].includes(glyph)
								? "#ffffff"
								: "#5a626e",
							"font-size": 9,
							"font-family": "system-ui",
							"text-anchor": "middle",
						},
						`${width}`,
					)
				: null,
		],
	);
}
