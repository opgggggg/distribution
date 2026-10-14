import { common } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import deviceInfo from '@ohos.deviceInfo';
import { emitter } from '@kit.BasicServicesKit';
import { webview } from '@kit.ArkWeb';
import { HarmonyWeb, HarmonyWebParams } from './HarmonyWeb';

import { HarmonyDocumentBridge } from '../bridge/HarmonyDocumentBridge';
import { HarmonyClientServices } from '../bridge/HarmonyClientServices';

@Entry
@Component
struct Index {
  @State private webReady: boolean = false;
  private backPending: boolean = false;
  private closeOperation?: Promise<boolean>;
  @StorageLink('harmonyIntent') private harmonyIntent: string = '';
  private controller: webview.WebviewController = new webview.WebviewController();
  private clientServices: HarmonyClientServices = new HarmonyClientServices();
  private documentEventCallback = (): void => {
    if (!this.webReady) return;
    this.controller.runJavaScript(
      "window.dispatchEvent(new Event('aurora-native-document'))"
    ).catch((cause: Error) => {
      console.warn(`Could not notify ArkWeb about the incoming document: ${cause.message}`);
    });
  };
  private bridge: HarmonyDocumentBridge = new HarmonyDocumentBridge(() => {
    this.webReady = true;
  }, () => {
    try {
      const encoded = AppStorage.get<string>('harmonyDocumentIntents') || '[]';
      const documents = JSON.parse(encoded) as Array<Object>;
      const document = documents.shift();
      if (document) {
        AppStorage.setOrCreate<string>('harmonyDocumentIntents', JSON.stringify(documents));
        return JSON.stringify(document);
      }
    } catch (_) {
      AppStorage.setOrCreate<string>('harmonyDocumentIntents', '[]');
    }
    const pendingIntent = this.harmonyIntent;
    this.harmonyIntent = '';
    return pendingIntent;
  });

  aboutToAppear(): void {
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    this.bridge.initialize(context);
    if (deviceInfo.deviceType === '2in1') {
      window.getLastWindow(context).then((appWindow: window.Window) => {
        appWindow.on('windowWillClose', async () => !(await this.prepareWindowClose()));
      }).catch((cause: Error) => console.warn(`Could not bind local draft close guard: ${cause.message}`));
    }
    try {
      this.clientServices.initialize(context);
    } catch (_) {
      console.warn('Client services unavailable; document editing remains available');
    }
    emitter.on('aurora-native-document', this.documentEventCallback);
  }

  onPageHide(): void {
    if (this.webReady) this.controller.runJavaScript('window.auroraFlushDrafts?.();0').catch(() => {});
  }

  aboutToDisappear(): void {
    emitter.off('aurora-native-document', this.documentEventCallback);
  }

  // 文档打开时系统返回（侧滑）应当回到首页，而不是退出应用。onBackPress 必须同步
  // 返回，而问网页要花一次 runJavaScript，所以先一律吃掉这次返回，等网页回话；
  // 网页说它没处理（已经在首页），再按系统默认那样把应用切到后台。
  onBackPress(): boolean {
    if (!this.webReady) return false;
    if (this.backPending) return true;
    this.backPending = true;
    this.controller.runJavaScript('Boolean(window.auroraHandleBack && window.auroraHandleBack())')
      .then((handled: string) => {
        this.backPending = false;
        if (handled === 'true') return;
        this.moveToBackground();
      })
      .catch((cause: Error) => {
        this.backPending = false;
        console.warn(`Could not ask the web shell to handle back: ${cause.message}`);
        this.moveToBackground();
      });
    return true;
  }

  private prepareWindowClose(): Promise<boolean> {
    if (this.closeOperation) return this.closeOperation;
    this.closeOperation = this.flushWindowDrafts().finally(() => { this.closeOperation = undefined; });
    return this.closeOperation;
  }

  private async flushWindowDrafts(): Promise<boolean> {
    if (!this.webReady) return true;
    try {
      await this.controller.runJavaScript(
        "window.__cubeCloseReady=null;Promise.resolve(window.auroraPrepareForClose?.()??false).then(v=>window.__cubeCloseReady=v).catch(()=>window.__cubeCloseReady=false);0"
      );
      for (let attempt = 0; attempt < 100; attempt++) {
        const result = await this.controller.runJavaScript(
          "window.__cubeCloseReady===true?1:window.__cubeCloseReady===false?0:-1"
        );
        if (result === '1') return true;
        if (result === '0') return false;
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }
    } catch (cause) {
      console.warn(`Local drafts could not be checked before closing: ${String(cause)}`);
    }
    return false;
  }

  private moveToBackground(): void {
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    context.moveAbilityToBackground().catch((cause: Error) => {
      console.warn(`Could not move the app to the background: ${cause.message}`);
    });
  }

  build() {
    Stack() {
      HarmonyWeb(new HarmonyWebParams(this.controller, this.bridge, this.clientServices,
        this.getUIContext().getHostContext() as common.UIAbilityContext))

      if (!this.webReady) {
        Column({ space: 18 }) {
		  LoadingProgress()
			.width(40)
			.height(40)
			.color('#4F46E5')
		  Text($r('app.string.app_loading'))
            .fontSize(16)
            .fontWeight(FontWeight.Medium)
            .fontColor('#312E81')
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#F8FAFC')
      }
    }
    .width('100%')
    .height('100%')
  }
}
