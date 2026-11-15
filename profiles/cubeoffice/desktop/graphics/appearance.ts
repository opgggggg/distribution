import { computed, readonly, ref } from "vue";

type GraphicsAppearance = "light" | "dark";
type AppearancePreference = GraphicsAppearance | "system";
const preferenceKey = "cubeoffice.graphics.appearance";
const systemColorScheme = globalThis.matchMedia?.("(prefers-color-scheme: dark)");

function parsePreference(value: string | null): AppearancePreference {
	return value === "light" || value === "dark" ? value : "system";
}

function readPreference(): AppearancePreference {
	try {
		return parsePreference(localStorage.getItem(preferenceKey));
	} catch {
		return "system";
	}
}

const preference = ref(readPreference());
const systemDark = ref(systemColorScheme?.matches ?? false);
systemColorScheme?.addEventListener("change", (event) => {
	systemDark.value = event.matches;
});
globalThis.addEventListener?.("storage", (event) => {
	if (event.storageArea === localStorage && (event.key === preferenceKey || event.key === null)) {
		preference.value = readPreference();
	}
});

export const graphicsAppearancePreference = readonly(preference);
export const graphicsAppearance = computed<GraphicsAppearance>(() =>
	preference.value === "system" ? (systemDark.value ? "dark" : "light") : preference.value,
);

export function setGraphicsAppearancePreference(value: string): void {
	preference.value = parsePreference(value);
	try {
		localStorage.setItem(preferenceKey, preference.value);
	} catch {
		// Keep the current choice for this session if storage is unavailable.
	}
}
