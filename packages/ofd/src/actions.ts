import type { OfdAction, OfdXmlNode } from "./package.js";
import { abort } from "./types.js";
export interface OfdDestination {
	type: "XYZ" | "Fit" | "FitH" | "FitV" | "FitR";
	pageId: string;
	left: number;
	top: number;
	right?: number;
	bottom?: number;
	zoom?: number;
}
export interface OfdActionHost {
	goTo?: (destination: OfdDestination) => void | Promise<void>;
	resolveBookmark?: (name: string) => OfdDestination | undefined;
	openAttachment?: (id: string, newWindow: boolean) => void | Promise<void>;
	openUri?: (uri: string) => void | Promise<void>;
	/** Resolve only when synchronous playback has finished. Looping playback must resolve immediately. */
	playSound?: (
		id: string,
		options: { volume: number; repeat: boolean; synchronous: boolean },
	) => void | Promise<void>;
	playMovie?: (
		id: string,
		operator: "Play" | "Stop" | "Pause" | "Resume",
	) => void | Promise<void>;
}
const local = (node: OfdXmlNode) => node.name.split(":").at(-1);
const child = (node: OfdXmlNode, name: string) =>
	node.children.find((n): n is OfdXmlNode => typeof n !== "string" && local(n) === name);
const bool = (value: string | undefined) => value === "true" || value === "1";
export function readDestination(node: OfdXmlNode): OfdDestination {
	const a = node.attributes,
		type = a.Type as OfdDestination["type"];
	if (!["XYZ", "Fit", "FitH", "FitV", "FitR"].includes(type) || !a.PageID)
		throw new Error("Invalid OFD destination.");
	const numeric = (name: string, fallback?: number) => {
		const value = a[name] === undefined ? fallback : Number(a[name]);
		if (value !== undefined && !Number.isFinite(value))
			throw new Error(`Invalid destination ${name}.`);
		return value;
	};
	const zoom = numeric("Zoom");
	if (zoom !== undefined && zoom !== 0 && (zoom < 0.1 || zoom > 64))
		throw new Error("Destination zoom must be zero or in [0.1,64].");
	return {
		type,
		pageId: a.PageID,
		left: numeric("Left", 0)!,
		top: numeric("Top", 0)!,
		right: numeric("Right"),
		bottom: numeric("Bottom"),
		zoom,
	};
}
/** Actions are dispatched only by an explicit host call, never while parsing. */
export async function executeOfdActions(
	actions: readonly OfdAction[],
	host: OfdActionHost,
	signal?: AbortSignal,
): Promise<void> {
	for (const action of actions) {
		abort(signal);
		const node = action.parameters,
			a = node.attributes;
		switch (action.type) {
			case "Goto": {
				if (!host.goTo) throw new Error("Goto actions require a navigation host.");
				const dest = child(node, "Dest"),
					bookmark = child(node, "Bookmark"),
					target = dest
						? readDestination(dest)
						: bookmark
							? host.resolveBookmark?.(bookmark.attributes.Name)
							: undefined;
				if (!target) throw new Error("Unknown OFD bookmark or destination.");
				await host.goTo(target);
				break;
			}
			case "GotoA":
				if (!host.openAttachment) throw new Error("Attachment actions require a host.");
				await host.openAttachment(a.AttachID, bool(a.NewWindow ?? "true"));
				break;
			case "URI": {
				if (!host.openUri) throw new Error("URI actions require a host.");
				const uri = a.Base ? new URL(a.URI, a.Base).href : a.URI;
				await host.openUri(uri);
				break;
			}
			case "Sound": {
				if (!host.playSound) throw new Error("Sound actions require a playback host.");
				const volume = a.Volume === undefined ? 100 : Number(a.Volume);
				if (!Number.isFinite(volume) || volume < 0 || volume > 100)
					throw new Error("Sound volume must be in [0,100].");
				const repeat = bool(a.Repeat),
					synchronous = !repeat && bool(a.Synchronous);
				await host.playSound(a.ResourceID, { volume, repeat, synchronous });
				break;
			}
			case "Movie": {
				if (!host.playMovie) throw new Error("Movie actions require a playback host.");
				const operator = (a.Operator ?? "Play") as "Play" | "Stop" | "Pause" | "Resume";
				if (!["Play", "Stop", "Pause", "Resume"].includes(operator))
					throw new Error("Invalid movie operator.");
				await host.playMovie(a.ResourceID, operator);
				break;
			}
			default:
				throw new Error("Unknown OFD action type.");
		}
	}
	abort(signal);
}
