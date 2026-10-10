import { common } from '@kit.AbilityKit';
import { connection } from '@kit.NetworkKit';
import { window } from '@kit.ArkUI';
import { fileIo, picker } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { image } from '@kit.ImageKit';
import deviceInfo from '@ohos.deviceInfo';
import { saveSuffixChoice } from '../common/OpenFormats';

interface SaveSession {
  id: string;
  fileName: string;
  path: string;
  file: fileIo.File;
}

interface PendingOpenDocument {
  type: string;
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  path: string;
}

interface ImageDecodeSession {
  sourcePath: string;
  decodedPath: string;
  file: fileIo.File;
  closed: boolean;
  decodedSize: number;
}

// Below the 16.7 MP canvas ceiling the Web shell re-encodes into.
const MAX_DECODED_PIXELS = 16000000;

export interface NativeTabsHost {
  sessionId(): string;
  open(request: string): Promise<string>;
  publish(state: string): boolean;
  takeCommand(): string;
  respond(request: string, accepted: boolean): boolean;
}

export class HarmonyDocumentBridge {
  private nativeTabs?: NativeTabsHost;
  private context?: common.UIAbilityContext;
  private appWindow?: window.Window;
  private onReady?: () => void;
  private pendingIntent?: () => string;
  private sequence: number = 0;
  private sessions: Map<string, SaveSession> = new Map();
  private pendingOpenDocuments: Map<string, PendingOpenDocument> = new Map();
  private imageDecodes: Map<string, ImageDecodeSession> = new Map();
  private base64: util.Base64Helper = new util.Base64Helper();

  constructor(onReady?: () => void, pendingIntent?: () => string) {
    this.onReady = onReady;
    this.pendingIntent = pendingIntent;
  }

  initialize(context: common.UIAbilityContext, appWindow?: window.Window): void {
    this.context = context;
    if (appWindow) {
      this.appWindow = appWindow;
      return;
    }
    window.getLastWindow(context).then((appWindow: window.Window) => {
      this.appWindow = appWindow;
    }).catch((cause: Error) => {
      console.warn(`Could not obtain the HarmonyOS app window: ${cause.message}`);
    });
  }

  setAppWindow(appWindow: window.Window): void {
    this.appWindow = appWindow;
  }

  setNativeTabs(host: NativeTabsHost): void {
    this.nativeTabs = host;
  }

  getNativeTabSession(): string {
    return this.nativeTabs?.sessionId() ?? '';
  }

  openNativeTab(request: string): Promise<string> {
    return this.nativeTabs ? this.nativeTabs.open(request) : Promise.reject(new Error('Native tabs unavailable'));
  }

  publishNativeTab(state: string): boolean {
    return this.nativeTabs?.publish(state) ?? false;
  }

  takeNativeTabCommand(): string {
    return this.nativeTabs?.takeCommand() ?? '';
  }

  respondNativeTab(request: string, accepted: boolean): boolean {
    return this.nativeTabs?.respond(request, accepted) ?? false;
  }

  appReady(): boolean {
    if (this.onReady) this.onReady();
    return true;
  }

  getPlatform(): string {
    return 'harmonyos';
  }

  // ArkWeb answers navigator.onLine from the network state the app is allowed to read,
  // so the page cannot ask the browser: without ohos.permission.GET_NETWORK_INFO it is
  // told it is offline whether or not there is a network. Unknown counts as online —
  // a wrong answer here must never take a feature away from the user.
  hasNetwork(): boolean {
    try {
      return connection.hasDefaultNetSync();
    } catch (cause) {
      console.warn(`Could not read the HarmonyOS network state: ${String(cause)}`);
      return true;
    }
  }

  // 2in1 上 EntryAbility 隐藏了原生标题栏，但系统仍然把最小化/最大化/关闭三个
  // 按钮画在窗口右上角，自绘标题栏必须给它们让出右侧的位置。平板和手机没有这
  // 三个按钮，让位只会在标题栏右边留下一块空白。
  hasWindowControls(): boolean {
    return deviceInfo.deviceType === '2in1';
  }

  // Declining the privacy policy has to close the app: nothing may run before
  // the policy is accepted.
  exitApp(): boolean {
    if (!this.context) return false;
    this.context.terminateSelf().catch((cause: Error) => {
      console.warn(`Could not close CubeOffice after the privacy policy was declined: ${cause.message}`);
    });
    return true;
  }

  consumePendingIntent(): string {
    const pending = this.pendingIntent ? this.pendingIntent() : '';
    if (!pending) return '';
    try {
      const descriptor = JSON.parse(pending) as PendingOpenDocument;
      if (
        descriptor.type !== 'open-document' ||
        !descriptor.id ||
        !descriptor.fileName ||
        !descriptor.path ||
        descriptor.size < 0
      ) {
        return pending;
      }
      this.pendingOpenDocuments.set(descriptor.id, descriptor);
      return JSON.stringify({
        type: descriptor.type,
        id: descriptor.id,
        fileName: descriptor.fileName,
        mimeType: descriptor.mimeType,
        size: descriptor.size
      });
    } catch (_) {
      return pending;
    }
  }

  readOpenDocumentChunk(id: string, offset: number, length: number): string {
    const pending = this.pendingOpenDocuments.get(id);
    if (!pending) return '';
    return this.readFileChunk(pending.path, pending.size, offset, length);
  }

  // System image decoding for formats ArkWeb cannot read (HEIC); see decodeImageWithHost.

  beginImageDecode(): string {
    const context = this.requireContext();
    const id = `image-${Date.now()}-${this.sequence++}`;
    const sourcePath = `${context.cacheDir}/auroraprime-${id}.bin`;
    const file = fileIo.openSync(
      sourcePath,
      fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC
    );
    this.imageDecodes.set(id, {
      sourcePath,
      decodedPath: `${context.cacheDir}/auroraprime-${id}.jpg`,
      file,
      closed: false,
      decodedSize: 0
    });
    return id;
  }

  appendImageDecodeChunk(id: string, encodedChunk: string): boolean {
    const session = this.imageDecodes.get(id);
    if (!session || session.closed) return false;
    const bytes = this.base64.decodeSync(encodedChunk);
    const chunk = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    fileIo.writeSync(session.file.fd, chunk);
    return true;
  }

  /** Resolves the decoded JPEG's length, or '' when the system cannot read the image. */
  async finishImageDecode(id: string): Promise<string> {
    const session = this.imageDecodes.get(id);
    if (!session) return '';
    this.closeImageSource(session);
    try {
      const source = image.createImageSource(session.sourcePath);
      try {
        const info = await source.getImageInfo();
        const pixels = info.size.width * info.size.height;
        const options: image.DecodingOptions = {};
        if (pixels > MAX_DECODED_PIXELS) {
          const scale = Math.sqrt(MAX_DECODED_PIXELS / pixels);
          options.desiredSize = {
            width: Math.max(1, Math.floor(info.size.width * scale)),
            height: Math.max(1, Math.floor(info.size.height * scale))
          };
        }
        const pixelMap = await source.createPixelMap(options);
        const packer = image.createImagePacker();
        try {
          const data = await packer.packToData(pixelMap, { format: 'image/jpeg', quality: 92 });
          const output = fileIo.openSync(
            session.decodedPath,
            fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC
          );
          try {
            fileIo.writeSync(output.fd, data);
          } finally {
            fileIo.closeSync(output);
          }
          session.decodedSize = data.byteLength;
          return String(data.byteLength);
        } finally {
          await packer.release();
          await pixelMap.release();
        }
      } finally {
        await source.release();
      }
    } catch (cause) {
      console.warn(`System image decoding failed: ${(cause as Error).message}`);
      return '';
    }
  }

  readImageDecodeChunk(id: string, offset: number, length: number): string {
    const session = this.imageDecodes.get(id);
    if (!session) return '';
    return this.readFileChunk(session.decodedPath, session.decodedSize, offset, length);
  }

  disposeImageDecode(id: string): boolean {
    const session = this.imageDecodes.get(id);
    if (!session) return false;
    this.imageDecodes.delete(id);
    this.closeImageSource(session);
    this.removeTemporaryFile(session.sourcePath);
    this.removeTemporaryFile(session.decodedPath);
    return true;
  }

  private closeImageSource(session: ImageDecodeSession): void {
    if (session.closed) return;
    session.closed = true;
    fileIo.closeSync(session.file);
  }

  private readFileChunk(path: string, size: number, offset: number, length: number): string {
    if (offset < 0 || length <= 0 || offset >= size) return '';
    const safeLength = Math.min(length, 256 * 1024, size - offset);
    const buffer = new ArrayBuffer(safeLength);
    const source = fileIo.openSync(path, fileIo.OpenMode.READ_ONLY);
    try {
      const read = fileIo.readSync(source.fd, buffer, { offset, length: safeLength });
      if (read <= 0) return '';
      return this.base64.encodeToStringSync(new Uint8Array(buffer, 0, read));
    } finally {
      fileIo.closeSync(source);
    }
  }

  finishOpenDocument(id: string): boolean {
    const pending = this.pendingOpenDocuments.get(id);
    if (!pending) return false;
    this.pendingOpenDocuments.delete(id);
    this.removeTemporaryFile(pending.path);
    return true;
  }

  startWindowMove(): boolean {
    if (!this.appWindow) return false;
    this.appWindow.startMoving().catch((cause: Error) => {
      console.warn(`Could not move the app window: ${cause.message}`);
    });
    return true;
  }

  toggleMaximizeWindow(): boolean {
    if (!this.appWindow) return false;
    const operation = this.appWindow.getWindowStatus() === window.WindowStatusType.MAXIMIZE
      ? this.appWindow.recover()
      : this.appWindow.maximize(window.MaximizePresentation.FOLLOW_APP_IMMERSIVE_SETTING);
    operation.catch((cause: Error) => {
      console.warn(`Could not change the app window size: ${cause.message}`);
    });
    return true;
  }

  // 手机播放 PPTX 时旋转到横屏并进入沉浸式全屏，退出播放时恢复。ArkWeb 不实现
  // screen.orientation.lock()，网页端只能请宿主代劳（Android 侧对应
  // MainActivity.setPresentationLandscape）。
  setPresentationLandscape(enabled: boolean): boolean {
    const appWindow = this.appWindow;
    if (!appWindow) return false;
    const bars: Array<'status' | 'navigation'> = enabled ? [] : ['status', 'navigation'];
    appWindow.setPreferredOrientation(
      enabled ? window.Orientation.AUTO_ROTATION_LANDSCAPE : window.Orientation.UNSPECIFIED
    ).catch((cause: Error) => {
      console.warn(`Could not rotate the app window: ${cause.message}`);
    });
    appWindow.setWindowLayoutFullScreen(enabled).catch((cause: Error) => {
      console.warn(`Could not lay the app window out full screen: ${cause.message}`);
    });
    appWindow.setWindowSystemBarEnable(bars).catch((cause: Error) => {
      console.warn(`Could not change the system bars: ${cause.message}`);
    });
    return true;
  }

  beginSave(fileName: string): string {
    const context = this.requireContext();
    const id = `${Date.now()}-${this.sequence++}`;
    const path = `${context.cacheDir}/auroraprime-export-${id}.bin`;
    const file = fileIo.openSync(
      path,
      fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC
    );
    this.sessions.set(id, {
      id,
      fileName: this.safeFileName(fileName),
      path,
      file
    });
    return id;
  }

  appendSaveChunk(sessionId: string, encodedChunk: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    const bytes = this.base64.decodeSync(encodedChunk);
    fileIo.writeSync(session.file.fd, bytes.buffer);
    return true;
  }

  async finishSave(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Unknown HarmonyOS save session.');
    fileIo.closeSync(session.file);

    try {
      const options = new picker.DocumentSaveOptions();
      options.newFileNames = [session.fileName];
      options.fileSuffixChoices = [saveSuffixChoice(session.fileName)];
      const documentPicker = new picker.DocumentViewPicker(this.requireContext());
      const destinations = await documentPicker.save(options);
      if (destinations.length === 0) throw new Error('No save destination was selected.');
      const destination = fileIo.openSync(
        destinations[0],
        fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC
      );
      try {
        await fileIo.copyFile(session.path, destination.fd);
      } finally {
        fileIo.closeSync(destination);
      }
      return destinations[0];
    } finally {
      this.sessions.delete(sessionId);
      this.removeTemporaryFile(session.path);
    }
  }

  abortSave(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    try {
      fileIo.closeSync(session.file);
    } catch (_) {
      // The save picker may have closed the descriptor before a web-side cancellation arrives.
    }
    this.sessions.delete(sessionId);
    this.removeTemporaryFile(session.path);
    return true;
  }

  private requireContext(): common.UIAbilityContext {
    if (!this.context) throw new Error('HarmonyOS document bridge is not initialized.');
    return this.context;
  }

  private safeFileName(fileName: string): string {
    const trimmed = fileName.trim().replace(/[\\/:*?"<>|]/g, '_');
    if (!trimmed) return 'Document.docx';
    return trimmed;
  }

  private removeTemporaryFile(path: string): void {
    try {
      fileIo.unlinkSync(path);
    } catch (_) {
      // Cleanup is best effort; the system also clears the application cache directory.
    }
  }
}
