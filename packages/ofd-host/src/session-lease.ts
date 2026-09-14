import { closeDocument, openDocument, sourceBytes } from "./bridge";
import type { NativeSession } from "./types";
export interface SessionLease {
	info: NativeSession;
	source: Blob;
	release(): Promise<void>;
}
interface Entry {
	references: number;
	ready: Promise<{ info: NativeSession; source: Blob }>;
}
const entries = new Map<string, Entry>();
export async function acquireSession(
	source: Blob | ArrayBuffer | Uint8Array | string,
	name: string,
	artifactId: string,
	signal: AbortSignal,
): Promise<SessionLease> {
	const bytes = await sourceBytes(source, signal);
	signal.throwIfAborted();
	const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
	const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(
		"",
	);
	const key = `${artifactId}:${hash}`;
	let entry = entries.get(key);
	if (!entry) {
		entry = {
			references: 0,
			ready: openDocument(bytes, name).then(async (info) => {
				if (info.hash !== hash) {
					await closeDocument(info.id);
					throw new Error("Document snapshot mismatch");
				}
				return { info, source: new Blob([bytes.slice().buffer]) };
			}),
		};
		entries.set(key, entry);
	}
	entry.references++;
	let released = false;
	const release = async () => {
		if (released) return;
		released = true;
		entry!.references--;
		if (entry!.references === 0) {
			entries.delete(key);
			try {
				await closeDocument((await entry!.ready).info.id);
			} catch {
				/* A stopped service has already lost the session. */
			}
		}
	};
	try {
		const opened = await entry.ready;
		signal.throwIfAborted();
		return { ...opened, release };
	} catch (error) {
		await release();
		throw error;
	}
}
