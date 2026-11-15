export const illustratorCommands = {
	group: ["Group", "编组"],
	ungroup: ["Ungroup", "取消编组"],
	bringToFront: ["Bring to Front", "置于顶层"],
	bringForward: ["Bring Forward", "上移一层"],
	sendBackward: ["Send Backward", "下移一层"],
	sendToBack: ["Send to Back", "置于底层"],
	selectAll: ["All on Active Artboard", "全选当前画板"],
	deselect: ["Deselect", "取消选择"],
	inverse: ["Inverse", "反向选择"],
	zoomIn: ["Zoom In", "放大"],
	zoomOut: ["Zoom Out", "缩小"],
	actualSize: ["Actual Size", "实际大小"],
	fitArtboard: ["Fit Artboard in Window", "画板适合窗口"],
	layers: ["Layers", "图层"],
	properties: ["Properties", "属性"],
	artboards: ["Artboards", "画板"],
} as const;

export type IllustratorCommand = keyof typeof illustratorCommands;
export type IllustratorMenuState = {
	enabled: Readonly<Record<IllustratorCommand, boolean>>;
	checked: Readonly<Record<"layers" | "properties" | "artboards", boolean>>;
};
export interface IllustratorMenuSurface {
	getIllustratorMenuState(): IllustratorMenuState | null;
	runIllustratorCommand(command: IllustratorCommand): void;
}
