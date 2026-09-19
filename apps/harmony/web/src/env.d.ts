interface AuroraHarmonyHost {
	appReady(): boolean;
	getPlatform?(): "harmonyos" | "android" | "ios";
	hasNetwork?(): boolean;
	hasWindowControls?(): boolean;
	beginSave(fileName: string): string;
	appendSaveChunk(sessionId: string, base64: string): boolean;
	finishSave(sessionId: string): Promise<string>;
	abortSave(sessionId: string): boolean;
	consumePendingIntent(): string;
	readOpenDocumentChunk?(id: string, offset: number, length: number): string;
	finishOpenDocument?(id: string): boolean;
	keepSoftKeyboard?(): boolean;
	exitApp?(): boolean;
	setPresentationLandscape?(enabled: boolean): boolean;
	startWindowMove(): boolean;
	toggleMaximizeWindow(): boolean;
}

interface Window {
	auroraHarmonyHost?: AuroraHarmonyHost;
	auroraHandleBack?: () => boolean;
}
