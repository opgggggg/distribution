import { invoke, isTauri, convertFileSrc } from "@tauri-apps/api/core";
import type {
	NativeSession,
	NativePolicy,
	NativeCapabilities,
	VerificationReport,
	TrustConfig,
	PreparedMedia,
	PrintStatus,
	PrintJob,
} from "./types";
export const nativeAvailable = () => isTauri();
export const TRUST_CHANGED = "cubeoffice-ofd-trust-changed";
export function signalTrustChanged(): void {
	window.dispatchEvent(new Event(TRUST_CHANGED));
}
async function call<T>(
	method: string,
	params: Record<string, unknown> = {},
	signal?: AbortSignal,
): Promise<T> {
	signal?.throwIfAborted();
	const jobId = ["signature.verify", "media.prepare", "print.submit"].includes(method)
		? crypto.randomUUID()
		: undefined;
	const cancel = () => {
		if (jobId)
			void invoke("profile_service_call", { method: "job.cancel", params: { jobId } }).catch(
				() => {},
			);
	};
	signal?.addEventListener("abort", cancel, { once: true });
	try {
		const result = await invoke<T>("profile_service_call", {
			method,
			params: { ...params, ...(jobId ? { jobId } : {}) },
		});
		signal?.throwIfAborted();
		return result;
	} finally {
		signal?.removeEventListener("abort", cancel);
	}
}
export async function upload<T>(bytes: Uint8Array, meta: Record<string, unknown>): Promise<T> {
	if (bytes.byteLength > 64 * 1024 * 1024) throw new Error("File exceeds 64 MiB");
	return invoke<T>("profile_service_upload", bytes, {
		headers: { "x-profile-upload": encodeURIComponent(JSON.stringify(meta)) },
	});
}
export const openDocument = (bytes: Uint8Array, name: string) =>
	upload<NativeSession>(bytes, { kind: "document", name });
export const closeDocument = (documentId: string) => call("session.close", { documentId });
export const capabilities = () => call<NativeCapabilities>("capabilities");
export const authorize = (session: NativeSession, documentIndex: number, operation: string) =>
	call<NativePolicy>("session.authorize", {
		documentId: session.id,
		documentHash: session.hash,
		documentIndex,
		operation,
	});
export const verifyDocument = (session: NativeSession, signal?: AbortSignal) =>
	call<VerificationReport>(
		"signature.verify",
		{ documentId: session.id, documentHash: session.hash },
		signal,
	);
export const listTrust = () => call<TrustConfig>("trust.list");
export const importTrust = (certificate: string) =>
	call<TrustConfig>("trust.import", { certificate });
export const removeTrust = (fingerprint: string) =>
	call<TrustConfig>("trust.remove", { fingerprint });
export const configureTrust = (
	config: Pick<TrustConfig, "systemRoots" | "onlineRevocation" | "requireRevocation">,
) => call<TrustConfig>("trust.configure", config);
export const mediaUrl = (path: string) => convertFileSrc(path);
export const prepareMedia = (
	session: NativeSession,
	documentIndex: number,
	pageId: string | undefined,
	resourceId: string,
	signal?: AbortSignal,
	transcode = false,
) =>
	call<PreparedMedia>(
		"media.prepare",
		{
			documentId: session.id,
			documentHash: session.hash,
			documentIndex,
			pageId,
			resourceId,
			transcode,
		},
		signal,
	);
export const printStatus = (session: NativeSession, documentIndex: number) =>
	call<PrintStatus>("print.status", {
		documentId: session.id,
		documentHash: session.hash,
		documentIndex,
	});
export const submitPrint = (
	session: NativeSession,
	documentIndex: number,
	uploadIds: string[],
	copies: number,
	signal?: AbortSignal,
) =>
	call<PrintJob>(
		"print.submit",
		{ documentId: session.id, documentHash: session.hash, documentIndex, uploadIds, copies },
		signal,
	);
export const windowPolicy = (
	documentId: string,
	documentIndex: number,
	fullscreen?: boolean,
	release = false,
) =>
	invoke<{ captureProtection: string; protectedRequested: boolean; fullscreen: boolean }>(
		"profile_service_window_policy",
		{ documentId, documentIndex, fullscreen: fullscreen ?? null, release },
	);
export async function sourceBytes(
	source: Blob | ArrayBuffer | Uint8Array | string,
	signal: AbortSignal,
): Promise<Uint8Array> {
	signal.throwIfAborted();
	if (source instanceof Uint8Array) return source.slice();
	if (source instanceof ArrayBuffer) return new Uint8Array(source.slice(0));
	if (source instanceof Blob) {
		if (source.size > 64 * 1024 * 1024) throw new Error("File exceeds 64 MiB");
		return new Uint8Array(await source.arrayBuffer());
	}
	const response = await fetch(source, { signal });
	if (!response.ok) throw new Error(`Unable to open document: ${response.status}`);
	if (Number(response.headers.get("content-length")) > 64 * 1024 * 1024) {
		await response.body?.cancel();
		throw new Error("File exceeds 64 MiB");
	}
	const reader = response.body?.getReader();
	if (!reader) throw new Error("Document response is empty");
	const parts: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const result = await reader.read();
			signal.throwIfAborted();
			if (result.done) break;
			size += result.value.byteLength;
			if (size > 64 * 1024 * 1024) throw new Error("File exceeds 64 MiB");
			parts.push(result.value);
		}
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const part of parts) {
		bytes.set(part, offset);
		offset += part.length;
	}
	return bytes;
}
export const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const openUri = (uri: string) => invoke<void>("profile_service_open_uri", { uri });
