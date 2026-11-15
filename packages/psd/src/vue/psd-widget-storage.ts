const STORAGE_KEY = "als-office:psd:widget-collapse:v1";

export type PsdWidgetId =
	| "right.color-history"
	| "right.properties"
	| "right.layers"
	| "properties.transform"
	| "properties.text"
	| "properties.document";

interface StoredWidgetState {
	version: 1;
	collapsed: Partial<Record<PsdWidgetId, boolean>>;
}

function readState(): StoredWidgetState {
	const fallback: StoredWidgetState = { version: 1, collapsed: {} };
	try {
		const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
		if (!raw) return fallback;
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object") return fallback;
		const candidate = parsed as Partial<StoredWidgetState>;
		if (
			candidate.version !== 1 ||
			!candidate.collapsed ||
			typeof candidate.collapsed !== "object"
		) {
			return fallback;
		}
		return { version: 1, collapsed: candidate.collapsed };
	} catch {
		return fallback;
	}
}

export function readPsdWidgetCollapsed(widget: PsdWidgetId, fallback = false): boolean {
	const value = readState().collapsed[widget];
	return typeof value === "boolean" ? value : fallback;
}

export function writePsdWidgetCollapsed(widget: PsdWidgetId, collapsed: boolean): void {
	try {
		const state = readState();
		if (state.collapsed[widget] === collapsed) return;
		state.collapsed[widget] = collapsed;
		globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Storage can be unavailable in SSR, private contexts, or embedded hosts.
	}
}
