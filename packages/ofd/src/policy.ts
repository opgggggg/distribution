import { attr, children, type XmlElement } from "./archive.js";
export interface OfdPermissions {
	edit: boolean;
	annotate: boolean;
	export: boolean;
	sign: boolean;
	watermark: boolean;
	printScreen: boolean;
	print: { allowed: boolean; copies: number | null };
	validPeriod: { start?: string; end?: string };
}
export interface OfdViewPreferences {
	pageMode: string;
	pageLayout: string;
	tabDisplay: string;
	hideToolbar: boolean;
	hideMenubar: boolean;
	hideWindowUI: boolean;
	zoomMode: string;
	zoom?: number;
}
const bool = (value: string | undefined, fallback = true) =>
	value === undefined ? fallback : value === "true" || value === "1";
export function permissions(node?: XmlElement): OfdPermissions {
	const value = (name: string) =>
		node ? children(node, name)[0]?.textContent?.trim() : undefined;
	const print = node && children(node, "Print")[0],
		valid = node && children(node, "ValidPeriod")[0],
		copies = print?.hasAttribute("Copies") ? Number(attr(print, "Copies")) : null;
	return {
		edit: bool(value("Edit")),
		annotate: bool(value("Annot")),
		export: bool(value("Export")),
		sign: bool(value("Signature")),
		watermark: bool(value("Watermark")),
		printScreen: bool(value("PrintScreen")),
		print: {
			allowed: (!print || bool(attr(print, "Printable", "true"))) && copies !== 0,
			copies: copies !== null && copies >= 0 ? copies : null,
		},
		validPeriod: {
			start: valid ? attr(valid, "StartDate") || undefined : undefined,
			end: valid ? attr(valid, "EndDate") || undefined : undefined,
		},
	};
}
export function viewPreferences(node?: XmlElement): OfdViewPreferences {
	const value = (name: string, fallback: string) =>
		node ? (children(node, name)[0]?.textContent?.trim() ?? fallback) : fallback;
	const zoom = value("Zoom", "");
	return {
		pageMode: value("PageMode", "None"),
		pageLayout: value("PageLayout", "OneColumn"),
		tabDisplay: value("TabDisplay", "FileName"),
		hideToolbar: bool(value("HideToolbar", "false")),
		hideMenubar: bool(value("HideMenubar", "false")),
		hideWindowUI: bool(value("HideWindowUI", "false")),
		zoomMode: value("ZoomMode", "Default"),
		...(zoom ? { zoom: Number(zoom) } : {}),
	};
}
/** Permission declarations are advisory; OS screenshot control and print quotas belong to the host. */
export function assertOfdPermission(
	policy: OfdPermissions,
	operation:
		"read" | "edit" | "annotate" | "export" | "sign" | "watermark" | "print" | "printScreen",
	now = Date.now(),
): void {
	const start = policy.validPeriod.start ? Date.parse(policy.validPeriod.start) : -Infinity,
		end = policy.validPeriod.end ? Date.parse(policy.validPeriod.end) : Infinity;
	if (Number.isNaN(start) || Number.isNaN(end) || start > end)
		throw new Error("Invalid OFD validity period.");
	if (now < start || now > end)
		throw new Error("The OFD document is outside its permitted validity period.");
	if (operation !== "read" && !(operation === "print" ? policy.print.allowed : policy[operation]))
		throw new Error(`The OFD document does not permit ${operation}.`);
}
