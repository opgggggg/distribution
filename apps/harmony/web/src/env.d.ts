interface AuroraHarmonyHost {
	appReady(): boolean;
	getPlatform?(): "harmonyos" | "android";
	beginSave(fileName: string): string;
	appendSaveChunk(sessionId: string, base64: string): boolean;
	finishSave(sessionId: string): Promise<string>;
	abortSave(sessionId: string): boolean;
	consumePendingIntent(): string;
	readOpenDocumentChunk?(id: string, offset: number, length: number): string;
	finishOpenDocument?(id: string): boolean;
	keepSoftKeyboard?(): boolean;
	setPresentationLandscape?(enabled: boolean): boolean;
	startWindowMove(): boolean;
	toggleMaximizeWindow(): boolean;
}

interface Window {
	auroraHarmonyHost?: AuroraHarmonyHost;
	auroraHandleBack?: () => boolean;
}
