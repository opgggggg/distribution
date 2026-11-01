interface AuroraHarmonyHost {
    nativeNotesAvailable?(): boolean;
    editNativeNotes?(sessionId: string, draftId: string, readonly: boolean): Promise<NativeNotebookResult>;
    listNativeNotes?(): Promise<Array<{id: string; fileName: string; savedAt: number}>>;
    readNativeNotes?(draftId: string): Promise<NativeNotebookResult>;
    ackNativeNotes?(draftId: string, digest: string): boolean;
	getNativeTabSession?(): string;
	openNativeTab?(request: string): Promise<string>;
	publishNativeTab?(state: string): boolean;
	takeNativeTabCommand?(): string;
	respondNativeTab?(request: string, accepted: boolean): boolean;
	appReady(): boolean;
	getPlatform?(): "harmonyos" | "android" | "ios";
	hasNetwork?(): boolean;
	hasWindowControls?(): boolean;
	beginSave(fileName: string): string;
	appendSaveChunk(sessionId: string, base64: string): boolean;
	finishSave(sessionId: string): Promise<string>;
	finishFileOperation?(
		sessionId: string,
		intent: string,
		source: string,
	): string | Promise<string>;
	finishShareFiles?(sessionIds: string): string | Promise<string>;
	takeFileResult?(sessionId: string): string;
	openDocumentPicker?(): boolean | Promise<boolean>;
	abortSave(sessionId: string): boolean;
	consumePendingIntent(): string;
	readOpenDocumentChunk?(id: string, offset: number, length: number): string;
	finishOpenDocument?(id: string): boolean;
	/** System image decoding for formats the WebView cannot read; see decodeImageWithHost. */
	beginImageDecode?(): string;
	appendImageDecodeChunk?(id: string, base64: string): boolean;
	/** Resolves the decoded JPEG's byte length as a decimal string; "" when decoding failed. */
	finishImageDecode?(id: string): string | Promise<string>;
	readImageDecodeChunk?(id: string, offset: number, length: number): string;
	disposeImageDecode?(id: string): boolean;
	keepSoftKeyboard?(): boolean;
	exitApp?(): boolean;
	setPresentationLandscape?(enabled: boolean): boolean;
	startWindowMove(): boolean;
	toggleMaximizeWindow(): boolean;
}
interface NativeNotebookResult {
    id: string;
    fileName: string;
    blob: Blob;
    changed?: boolean;
    preview?: string;
    digest: string;
    savedAt?: number;
}

interface Window {
	auroraHarmonyHost?: AuroraHarmonyHost;
	auroraHandleBack?: () => boolean;
	auroraFlushDrafts?: () => Promise<void>;
	auroraPrepareForClose?: () => Promise<boolean>;
}
