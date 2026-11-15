import { ref } from "vue";

type GraphicsAppearance = "light" | "dark";
const preferenceKey = "cubeoffice.graphics.appearance";
function readAppearance(): GraphicsAppearance {
	try {
		return localStorage.getItem(preferenceKey) === "dark" ? "dark" : "light";
	} catch {
		return "light";
	}
}
export const graphicsAppearance = ref<GraphicsAppearance>(readAppearance());

export function toggleGraphicsAppearance(): void {
	graphicsAppearance.value = graphicsAppearance.value === "dark" ? "light" : "dark";
	try {
		localStorage.setItem(preferenceKey, graphicsAppearance.value);
	} catch {
		// The workbench continues to use this session's choice.
	}
}
