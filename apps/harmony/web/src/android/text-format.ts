export interface AndroidTextFormat {
	fontFamily?: string;
	fontSizePt?: number;
	bold?: boolean;
	italic?: boolean;
	underline?: string;
	strikethrough?: boolean;
	color?: string;
	alignment?: "left" | "center" | "right" | "justify";
	styleId?: string;
	listType?: "bullet" | "decimal" | "multilevel" | null;
	lineSpacing?: number;
}
