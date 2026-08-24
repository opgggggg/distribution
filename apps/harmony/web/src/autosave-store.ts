import type { EditorArtifactFormat } from "@yaochn/als-office-editor-ui/vue";

const DATABASE_NAME = "auroraprime-office-mobile";
const DATABASE_VERSION = 1;
const AUTOSAVE_STORE = "document-autosaves";

export interface HarmonyAutosaveRecord {
	id: string;
	fileName: string;
	format: EditorArtifactFormat;
	blob: Blob;
	savedAt: number;
}

let databasePromise: Promise<IDBDatabase> | undefined;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		request.addEventListener("success", () => resolve(request.result), { once: true });
		request.addEventListener(
			"error",
			() => reject(request.error ?? new Error("HarmonyOS 自动保存数据库请求失败。")),
			{ once: true },
		);
	});
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		transaction.addEventListener("complete", () => resolve(), { once: true });
		transaction.addEventListener(
			"abort",
			() => reject(transaction.error ?? new Error("HarmonyOS 自动保存事务已中止。")),
			{ once: true },
		);
		transaction.addEventListener(
			"error",
			() => reject(transaction.error ?? new Error("HarmonyOS 自动保存事务失败。")),
			{ once: true },
		);
	});
}

function openDatabase(): Promise<IDBDatabase> {
	if (databasePromise) return databasePromise;
	if (typeof indexedDB === "undefined") {
		return Promise.reject(new Error("当前 WebView 不支持本地自动保存。"));
	}
	databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
		request.addEventListener(
			"upgradeneeded",
			() => {
				const database = request.result;
				if (!database.objectStoreNames.contains(AUTOSAVE_STORE)) {
					const store = database.createObjectStore(AUTOSAVE_STORE, { keyPath: "id" });
					store.createIndex("savedAt", "savedAt");
				}
			},
			{ once: true },
		);
		request.addEventListener("success", () => resolve(request.result), { once: true });
		request.addEventListener(
			"error",
			() => {
				databasePromise = undefined;
				reject(request.error ?? new Error("无法打开 HarmonyOS 自动保存数据库。"));
			},
			{ once: true },
		);
	});
	return databasePromise;
}

export async function writeHarmonyAutosave(record: HarmonyAutosaveRecord): Promise<void> {
	const database = await openDatabase();
	const transaction = database.transaction(AUTOSAVE_STORE, "readwrite");
	transaction.objectStore(AUTOSAVE_STORE).put(record);
	await transactionComplete(transaction);
}

export async function deleteHarmonyAutosave(id: string): Promise<void> {
	const database = await openDatabase();
	const transaction = database.transaction(AUTOSAVE_STORE, "readwrite");
	transaction.objectStore(AUTOSAVE_STORE).delete(id);
	await transactionComplete(transaction);
}

export async function listHarmonyAutosaves(): Promise<HarmonyAutosaveRecord[]> {
	const database = await openDatabase();
	const transaction = database.transaction(AUTOSAVE_STORE, "readonly");
	const completed = transactionComplete(transaction);
	const records = await requestResult(
		transaction.objectStore(AUTOSAVE_STORE).getAll() as IDBRequest<HarmonyAutosaveRecord[]>,
	);
	await completed;
	return records.sort((left, right) => left.savedAt - right.savedAt);
}
