/** Native persistence belongs to the host; a picker opening is never a save receipt. */
export interface FileSource {
	id: string;
	name: string;
	writable: boolean;
	version?: string;
	location?: string;
}
export interface FileReceipt {
	status: "saved" | "cancelled" | "shared" | "printed" | "share-opened" | "print-opened";
	destination?: string;
	source?: FileSource;
}
export type FileIntent = "export" | "save" | "share" | "print";
const sources = new WeakMap<Blob, FileSource>();
export function setFileSource(blob: Blob, source?: FileSource): void {
	if (source) sources.set(blob, source);
}
export function getFileSource(blob?: Blob): FileSource | undefined {
	return blob ? sources.get(blob) : undefined;
}

export class FileDeliveryCancelled extends Error {
	constructor() {
		super("操作已取消，修改仍保留在本机。");
		this.name = "AbortError";
	}
}

export function parseFileReceipt(encoded: string): FileReceipt {
	const result = JSON.parse(encoded) as FileReceipt & { error?: string };
	if (result.error) throw new Error(result.error);
	if (
		!["saved", "cancelled", "shared", "printed", "share-opened", "print-opened"].includes(
			result.status,
		)
	)
		throw new Error("原生容器返回了无效的文件操作结果。");
	return result;
}

export async function deliverFile(
	blob: Blob,
	fileName: string,
	intent: FileIntent = "export",
	source?: FileSource,
): Promise<FileReceipt> {
	const host = window.auroraHarmonyHost;
	if (!host) {
		if (intent === "save") throw new Error("当前文件无法直接写回，请另存副本。");
		if (intent === "share") {
			const files = [new File([blob], fileName, { type: blob.type })];
			if (!navigator.canShare?.({ files }))
				throw new Error("此浏览器不支持文件分享，请另存后分享。");
			try {
				await navigator.share({ files });
				return { status: "shared" };
			} catch (cause) {
				if ((cause as Error).name === "AbortError") return { status: "cancelled" };
				throw cause;
			}
		}
		if (intent === "print") {
			if (blob.type !== "application/pdf") throw new Error("请先转换为 PDF 再打印。");
			const url = URL.createObjectURL(blob),
				frame = document.createElement("iframe");
			frame.style.cssText =
				"position:fixed;width:1px;height:1px;opacity:0;pointer-events:none";
			const loaded = new Promise<void>((resolve, reject) => {
				frame.onload = () => {
					try {
						frame.contentWindow?.focus();
						frame.contentWindow?.print();
						resolve();
					} catch (cause) {
						reject(cause);
					}
				};
				frame.onerror = () => reject(new Error("打印预览加载失败。"));
			});
			frame.src = url;
			document.body.appendChild(frame);
			window.setTimeout(() => {
				frame.remove();
				URL.revokeObjectURL(url);
			}, 60_000);
			await loaded;
			return { status: "printed" };
		}
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = fileName;
		link.click();
		window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
		return { status: "saved", destination: fileName };
	}
	if (intent !== "export" && !host.finishFileOperation)
		throw new Error("请更新应用以使用保存原文件、分享和打印。");
	const id = host.beginSave(fileName);
	if (!id) throw new Error("无法准备文件操作。");
	try {
		for (let offset = 0; offset < blob.size; offset += 192 * 1024) {
			const bytes = new Uint8Array(
				await blob.slice(offset, offset + 192 * 1024).arrayBuffer(),
			);
			let binary = "";
			for (let i = 0; i < bytes.length; i += 0x8000)
				binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
			if (!host.appendSaveChunk(id, btoa(binary))) throw new Error("文件传输失败，请重试。");
		}
		const response = host.finishFileOperation
			? await host.finishFileOperation(id, intent, JSON.stringify(source ?? null))
			: await host.finishSave(id);
		if (host.takeFileResult) {
			for (;;) {
				const encoded = host.takeFileResult(id);
				if (encoded) return parseFileReceipt(encoded);
				await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
			}
		}
		return host.finishFileOperation
			? parseFileReceipt(response)
			: { status: "saved", destination: response };
	} catch (cause) {
		host.abortSave(id);
		throw cause;
	}
}

/** One system share sheet for a selection; no archive/new file format is introduced. */
export async function deliverFiles(
	files: { blob: Blob; fileName: string }[],
): Promise<FileReceipt> {
	if (!files.length) throw new Error("请先选择文件。");
	if (files.length === 1) return deliverFile(files[0].blob, files[0].fileName, "share");
	const host = window.auroraHarmonyHost;
	if (!host) {
		const payload = files.map(
			(file) => new File([file.blob], file.fileName, { type: file.blob.type }),
		);
		if (!navigator.canShare?.({ files: payload }))
			throw new Error("此浏览器不支持批量文件分享。");
		try {
			await navigator.share({ files: payload });
			return { status: "shared" };
		} catch (cause) {
			if ((cause as Error).name === "AbortError") return { status: "cancelled" };
			throw cause;
		}
	}
	if (!host.finishShareFiles) throw new Error("请更新应用以使用批量分享。");
	const ids: string[] = [];
	try {
		for (const file of files) {
			const id = host.beginSave(file.fileName);
			if (!id) throw new Error("无法准备分享文件。");
			ids.push(id);
			for (let offset = 0; offset < file.blob.size; offset += 192 * 1024) {
				const bytes = new Uint8Array(
					await file.blob.slice(offset, offset + 192 * 1024).arrayBuffer(),
				);
				let binary = "";
				for (let i = 0; i < bytes.length; i += 0x8000)
					binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
				if (!host.appendSaveChunk(id, btoa(binary))) throw new Error("分享文件传输失败。");
			}
		}
		const result = await host.finishShareFiles(JSON.stringify(ids));
		if (host.takeFileResult)
			for (;;) {
				const encoded = host.takeFileResult(ids[0]);
				if (encoded) return parseFileReceipt(encoded);
				await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
			}
		return parseFileReceipt(result);
	} catch (cause) {
		for (const id of ids) host.abortSave(id);
		throw cause;
	}
}
