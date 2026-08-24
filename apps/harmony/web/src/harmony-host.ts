const SAVE_CHUNK_BYTES = 192 * 1024;
const OPEN_CHUNK_BYTES = 192 * 1024;
const BINARY_STRING_CHUNK = 0x8000;

interface NativeOpenDocumentDescriptor {
	type: "open-document";
	id: string;
	fileName: string;
	mimeType: string;
	size: number;
}

export interface NativeAssistantCommandDescriptor {
	type: "assistant-command";
	command: "home" | "activity" | "recent" | "open-recent" | "new-document" | "set-mode";
	format?: "docx" | "pptx" | "xlsx" | "vsdx" | "markdown";
	mode?: "reading" | "editing";
	source: "android" | "harmonyos";
	requestId?: string;
}

export type AuroraNativePlatform = "harmonyos" | "android" | "browser";

export function nativeHostPlatform(): AuroraNativePlatform {
	const host = window.auroraHarmonyHost;
	if (!host) return "browser";
	return host.getPlatform?.() ?? "harmonyos";
}

export function isHarmonyHost(): boolean {
	return nativeHostPlatform() === "harmonyos";
}

export function isAndroidHost(): boolean {
	return nativeHostPlatform() === "android";
}

export function nativeHostLabel(): string {
	switch (nativeHostPlatform()) {
		case "harmonyos":
			return "HarmonyOS";
		case "android":
			return "Android";
		default:
			return "浏览器";
	}
}

export function consumeHarmonyIntent(): string {
	return window.auroraHarmonyHost?.consumePendingIntent() ?? "";
}

const LEGACY_ASSISTANT_COMMANDS: Readonly<Record<string, NativeAssistantCommandDescriptor>> = {
	home: { type: "assistant-command", command: "home", source: "harmonyos" },
	activity: { type: "assistant-command", command: "activity", source: "harmonyos" },
	"new-docx": {
		type: "assistant-command",
		command: "new-document",
		format: "docx",
		source: "harmonyos",
	},
	"new-pptx": {
		type: "assistant-command",
		command: "new-document",
		format: "pptx",
		source: "harmonyos",
	},
	"new-xlsx": {
		type: "assistant-command",
		command: "new-document",
		format: "xlsx",
		source: "harmonyos",
	},
	"new-vsdx": {
		type: "assistant-command",
		command: "new-document",
		format: "vsdx",
		source: "harmonyos",
	},
	"new-markdown": {
		type: "assistant-command",
		command: "new-document",
		format: "markdown",
		source: "harmonyos",
	},
};

const ASSISTANT_COMMANDS = new Set([
	"home",
	"activity",
	"recent",
	"open-recent",
	"new-document",
	"set-mode",
]);
const ASSISTANT_FORMATS = new Set(["docx", "pptx", "xlsx", "vsdx", "markdown"]);

export function parseNativeAssistantCommand(
	pendingIntent: string,
): NativeAssistantCommandDescriptor | null {
	const legacy = LEGACY_ASSISTANT_COMMANDS[pendingIntent];
	if (legacy) return { ...legacy };
	try {
		const candidate = JSON.parse(pendingIntent) as Record<string, unknown>;
		if (
			candidate.type !== "assistant-command" ||
			typeof candidate.command !== "string" ||
			!ASSISTANT_COMMANDS.has(candidate.command)
		) {
			return null;
		}
		if (
			candidate.command === "new-document" &&
			(typeof candidate.format !== "string" || !ASSISTANT_FORMATS.has(candidate.format))
		) {
			return null;
		}
		if (
			candidate.command === "set-mode" &&
			candidate.mode !== "reading" &&
			candidate.mode !== "editing"
		) {
			return null;
		}
		return {
			type: "assistant-command",
			command: candidate.command as NativeAssistantCommandDescriptor["command"],
			...(typeof candidate.format === "string"
				? { format: candidate.format as NativeAssistantCommandDescriptor["format"] }
				: {}),
			...(candidate.mode === "reading" || candidate.mode === "editing"
				? { mode: candidate.mode }
				: {}),
			source: candidate.source === "harmonyos" ? "harmonyos" : "android",
			...(typeof candidate.requestId === "string" ? { requestId: candidate.requestId } : {}),
		};
	} catch {
		return null;
	}
}

export async function readNativeOpenDocument(pendingIntent: string): Promise<File | null> {
	let descriptor: NativeOpenDocumentDescriptor;
	try {
		const candidate = JSON.parse(pendingIntent) as Partial<NativeOpenDocumentDescriptor>;
		if (
			candidate.type !== "open-document" ||
			typeof candidate.id !== "string" ||
			typeof candidate.fileName !== "string" ||
			typeof candidate.size !== "number"
		) {
			return null;
		}
		descriptor = {
			type: "open-document",
			id: candidate.id,
			fileName: candidate.fileName,
			mimeType:
				typeof candidate.mimeType === "string"
					? candidate.mimeType
					: "application/octet-stream",
			size: Math.max(0, candidate.size),
		};
	} catch {
		return null;
	}

	const host = window.auroraHarmonyHost;
	if (!host?.readOpenDocumentChunk || !host.finishOpenDocument) {
		throw new Error("当前原生容器不能读取系统传入的文档。");
	}
	const chunks: ArrayBuffer[] = [];
	try {
		for (let offset = 0; offset < descriptor.size; offset += OPEN_CHUNK_BYTES) {
			const encoded = host.readOpenDocumentChunk(
				descriptor.id,
				offset,
				Math.min(OPEN_CHUNK_BYTES, descriptor.size - offset),
			);
			if (!encoded) throw new Error("系统传入的文档读取不完整。");
			chunks.push(base64ToBytes(encoded));
		}
		return new File(chunks, descriptor.fileName, {
			type: descriptor.mimeType || "application/octet-stream",
		});
	} finally {
		host.finishOpenDocument(descriptor.id);
	}
}

export function startHarmonyWindowMove(): boolean {
	return window.auroraHarmonyHost?.startWindowMove() ?? false;
}

export function toggleHarmonyWindowMaximize(): boolean {
	return window.auroraHarmonyHost?.toggleMaximizeWindow() ?? false;
}

export async function setMobilePresentationLandscape(enabled: boolean): Promise<void> {
	if (window.auroraHarmonyHost?.setPresentationLandscape?.(enabled)) return;
	const orientation = screen.orientation as ScreenOrientation & {
		lock?: (mode: string) => Promise<void>;
		unlock?: () => void;
	};
	try {
		if (enabled) await orientation.lock?.("landscape");
		else orientation.unlock?.();
	} catch {
		// Browser previews and some embedded WebViews do not permit orientation
		// locking. The immersive viewer remains usable in the current orientation.
	}
}

export async function saveBlobWithHost(blob: Blob, fileName: string): Promise<void> {
	const host = window.auroraHarmonyHost;
	if (!host) {
		downloadBlob(blob, fileName);
		return;
	}

	const sessionId = host.beginSave(fileName);
	try {
		for (let offset = 0; offset < blob.size; offset += SAVE_CHUNK_BYTES) {
			const bytes = new Uint8Array(
				await blob.slice(offset, offset + SAVE_CHUNK_BYTES).arrayBuffer(),
			);
			if (!host.appendSaveChunk(sessionId, bytesToBase64(bytes))) {
				throw new Error("The native app rejected a document save chunk.");
			}
		}
		await host.finishSave(sessionId);
	} catch (cause) {
		host.abortSave(sessionId);
		throw cause;
	}
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += BINARY_STRING_CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + BINARY_STRING_CHUNK));
	}
	return btoa(binary);
}

function base64ToBytes(encoded: string): ArrayBuffer {
	const binary = atob(encoded);
	const buffer = new ArrayBuffer(binary.length);
	const bytes = new Uint8Array(buffer);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return buffer;
}

function downloadBlob(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = fileName;
	anchor.style.display = "none";
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
