import type { PsdToolId } from "./component-types";

export interface PsdToolEntry {
	id: PsdToolId;
	label: string;
	key: string;
}

export const PSD_TOOLS: readonly PsdToolEntry[] = [
	{ id: "move", label: "Move", key: "V" },
	{ id: "marquee", label: "Marquee (rectangle / ellipse)", key: "M" },
	{ id: "lasso", label: "Lasso", key: "L" },
	{ id: "wand", label: "Magic Wand", key: "W" },
	{ id: "crop", label: "Crop", key: "C" },
	{ id: "eyedropper", label: "Eyedropper", key: "I" },
	{ id: "brush", label: "Brush", key: "B" },
	{ id: "eraser", label: "Eraser", key: "E" },
	{ id: "heal", label: "Spot Healing Brush", key: "J" },
	{ id: "blur", label: "Blur tool", key: "R" },
	{ id: "clone", label: "Clone Stamp (Alt-click to set source)", key: "S" },
	{ id: "dodge", label: "Dodge (lighten)", key: "O" },
	{ id: "burn", label: "Burn (darken)", key: "O" },
	{ id: "gradient", label: "Gradient", key: "G" },
	{ id: "bucket", label: "Paint Bucket", key: "G" },
	{ id: "shape", label: "Shape (rectangle / ellipse / line)", key: "U" },
	{ id: "text", label: "Text (click to add a text layer)", key: "T" },
	{ id: "hand", label: "Hand", key: "H" },
	{ id: "zoom", label: "Zoom", key: "Z" },
];
