const STORAGE_KEY = "als-office:psd:pane-visibility:v1";

interface StoredPaneVisibility {
	version: 1;
	visible: Record<string, boolean>;
}

function readState(): StoredPaneVisibility {
	const fallback: StoredPaneVisibility = { version: 1, visible: {} };
	try {
		const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
		if (!raw) return fallback;
		const parsed = JSON.parse(raw) as Partial<StoredPaneVisibility>;
		if (parsed.version !== 1 || !parsed.visible || typeof parsed.visible !== "object") {
			return fallback;
		}
		return { version: 1, visible: parsed.visible };
	} catch {
		return fallback;
	}
}

export function readPsdPaneVisible(pane: string, fallback = true): boolean {
	const value = readState().visible[pane];
	return typeof value === "boolean" ? value : fallback;
}

export function writePsdPaneVisible(pane: string, visible: boolean): void {
	try {
		const state = readState();
		if (state.visible[pane] === visible) return;
		state.visible[pane] = visible;
		globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Storage can be unavailable in SSR, private contexts, or embedded hosts.
	}
}
