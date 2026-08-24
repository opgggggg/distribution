import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { emitter } from '@kit.BasicServicesKit';
import { fileIo } from '@kit.CoreFileKit';
import deviceInfo from '@ohos.deviceInfo';

interface PendingOpenDocument {
  type: string;
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  path: string;
}

export default class EntryAbility extends UIAbility {
  private static readonly DOCUMENT_QUEUE_KEY: string = 'harmonyDocumentIntents';
  private static readonly DOCUMENT_EVENT: string = 'aurora-native-document';
  private sequence: number = 0;

  onCreate(want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    this.captureDocuments(want, false);
  }

  onNewWant(want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    this.captureDocuments(want, true);
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (error) => {
      if (error.code) {
        console.error(`Could not load the main page: ${error.message}`);
        return;
      }

      if (deviceInfo.deviceType === '2in1') {
        try {
          const mainWindow = windowStage.getMainWindowSync();
          mainWindow.setWindowDecorVisible(false);
          mainWindow.setWindowDecorHeight(38);
        } catch (cause) {
          console.warn(`Could not enable the immersive window title bar: ${String(cause)}`);
        }
      }
    });
  }

  private captureDocuments(want: Want, notify: boolean): void {
    const uris = this.documentUris(want);
    if (uris.length === 0) return;
    const pending: Array<PendingOpenDocument> = this.readQueue();
    let captured: boolean = false;
    for (const uri of uris) {
      try {
        pending.push(this.stageDocument(uri, want.type));
        captured = true;
      } catch (cause) {
        console.error(`Could not receive the system document: ${String(cause)}`);
      }
    }
    if (!captured) return;
    AppStorage.setOrCreate<string>(EntryAbility.DOCUMENT_QUEUE_KEY, JSON.stringify(pending));
    if (notify) emitter.emit(EntryAbility.DOCUMENT_EVENT);
  }

  private documentUris(want: Want): Array<string> {
    const uris: Array<string> = [];
    if (want.uri) uris.push(want.uri);
    const stream: Object | undefined = want.parameters?.['ability.params.stream'];
    if (typeof stream === 'string') {
      uris.push(stream);
    } else if (stream instanceof Array) {
      for (const value of stream as Array<Object>) {
        if (typeof value === 'string') uris.push(value);
      }
    }
    return Array.from(new Set(uris));
  }

  private stageDocument(uri: string, mimeType?: string): PendingOpenDocument {
    const id = `${Date.now()}-${this.sequence++}`;
    const fileName = this.fileNameFromUri(uri, mimeType);
    const path = `${this.context.cacheDir}/auroraprime-open-${id}-${fileName}`;
    const source = fileIo.openSync(uri, fileIo.OpenMode.READ_ONLY);
    try {
      fileIo.copyFileSync(source.fd, path);
    } finally {
      fileIo.closeSync(source);
    }
    return {
      type: 'open-document',
      id,
      fileName,
      mimeType: mimeType || 'application/octet-stream',
      size: fileIo.statSync(path).size,
      path
    };
  }

  private readQueue(): Array<PendingOpenDocument> {
    const encoded = AppStorage.get<string>(EntryAbility.DOCUMENT_QUEUE_KEY) || '';
    if (!encoded) return [];
    try {
      return JSON.parse(encoded) as Array<PendingOpenDocument>;
    } catch (_) {
      return [];
    }
  }

  private fileNameFromUri(uri: string, mimeType?: string): string {
    const lastSegment = uri.split('/').pop()?.split('?')[0] || '';
    let decoded = '';
    try {
      decoded = decodeURIComponent(lastSegment);
    } catch (_) {
      decoded = lastSegment;
    }
    const safe = decoded.trim().replace(/[\\/:*?"<>|]/g, '_');
    return safe || `Document${this.extensionForMimeType(mimeType)}`;
  }

  private extensionForMimeType(mimeType?: string): string {
    if (!mimeType) return '.docx';
    if (mimeType.includes('presentationml')) return '.pptx';
    if (mimeType.includes('spreadsheetml')) return '.xlsx';
    if (mimeType.includes('visio')) return '.vsdx';
    if (mimeType.includes('jmp')) return '.jmp';
    if (mimeType.includes('jgraph') || mimeType.includes('drawio')) return '.drawio';
    if (mimeType === 'application/pdf') return '.pdf';
    if (mimeType.includes('markdown') || mimeType === 'text/plain') return '.md';
    return '.docx';
  }
}
