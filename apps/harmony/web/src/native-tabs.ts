import type { EditorArtifactFormat } from "@yaochn/als-office-editor-ui/vue";

export interface NativeDocumentRequest {
	id: string;
	format: EditorArtifactFormat;
	fileName: string;
	source?: Blob;
	autosaveId?: string;
	autosavedAt?: number;
	mobileMode?: "reading" | "editing";
}

export interface NativeTabCommand {
	action: "new" | "open" | "activity" | "settings" | "services" | "about" | "can-close";
	argument: string;
	request: string;
}

// Only the initial file crosses WebViews. Reorder, detach and merge never
// serialize a live editor; ArkUI moves its existing Web component instead.
let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
	return (database ??= new Promise((resolve, reject) => {
		const request = indexedDB.open("cubeoffice-native-tab-requests", 1);
		request.onupgradeneeded = () =>
			request.result.createObjectStore("requests", { keyPath: "id" });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => {
			database = undefined;
			reject(request.error);
		};
	}));
}

async function transaction<T>(
	mode: IDBTransactionMode,
	operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
	const db = await openDatabase();
	return new Promise((resolve, reject) => {
		const tx = db.transaction("requests", mode);
		const request = operation(tx.objectStore("requests"));
		tx.oncomplete = () => resolve(request.result);
		tx.onabort = () => reject(tx.error ?? new Error("文档窗口请求未能保存"));
		tx.onerror = () => reject(tx.error ?? request.error);
	});
}

export async function openNativeDocument(input: Omit<NativeDocumentRequest, "id">): Promise<void> {
	const host = window.auroraHarmonyHost;
	if (!host?.openNativeTab) throw new Error("原生文档窗口不可用");
	const request: NativeDocumentRequest = { ...input, id: `document-${crypto.randomUUID()}` };
	// Materialize native picker-backed Files before handing them to IndexedDB.
	if (input.source)
		request.source = new Blob([await input.source.arrayBuffer()], { type: input.source.type });
	await transaction("readwrite", (store) => store.put(request));
	try {
		await host.openNativeTab(JSON.stringify({ id: request.id, fileName: request.fileName }));
	} catch (cause) {
		await deleteNativeDocumentRequest(request.id);
		throw cause;
	}
}

export function readNativeDocumentRequest(id: string): Promise<NativeDocumentRequest | undefined> {
	return transaction("readonly", (store) => store.get(id));
}

export async function deleteNativeDocumentRequest(id: string): Promise<void> {
	await transaction("readwrite", (store) => store.delete(id));
}
