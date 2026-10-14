import type { BrushPlugin } from "../src/brushes.js";

/** Example extension: registerBrushPlugin(charcoalBrush) before loading a notebook. */
export const charcoalBrush: BrushPlugin = {
	id: "example:charcoal",
	label: "炭笔",
	labelEn: "Charcoal",
	hint: "颗粒排线与柔和阴影",
	hintEn: "Grainy shading",
	glyph: "pencil",
	tipPaths: ["M10 43L15 14H29L34 43Z"],
	defaults: { color: "#292524", width: 12, pressure: true, opacity: 0.8 },
	maxWidth: 60,
	supportsPressure: true,
	usesGrain: true,
	xournal: false,
	strength: { label: "不透明度", labelEn: "Opacity", min: 0.1, step: 0.05 },
	parameters: [
		{
			id: "softness",
			label: "柔软度",
			labelEn: "Softness",
			min: 0,
			max: 100,
			step: 5,
			default: 50,
		},
	],
	pressureFactor: (p) => 0.5 + p,
	render: (stroke, geometry) => {
		const softness = (stroke.brushSettings?.softness ?? 50) / 100;
		return [
			{ path: geometry.path(), opacity: stroke.opacity * (0.05 + softness * 0.15) },
			{
				path: geometry.path(1 - softness * 0.15),
				opacity: stroke.opacity * 0.85,
				grain: true,
			},
		];
	},
};
