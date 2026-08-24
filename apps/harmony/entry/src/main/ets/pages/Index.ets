import { common } from '@kit.AbilityKit';
import { emitter } from '@kit.BasicServicesKit';
import { picker } from '@kit.CoreFileKit';
import { webview } from '@kit.ArkWeb';

import { HarmonyDocumentBridge } from '../bridge/HarmonyDocumentBridge';

@Entry
@Component
struct Index {
  @State private webReady: boolean = false;
  @StorageLink('harmonyIntent') private harmonyIntent: string = '';
  private controller: webview.WebviewController = new webview.WebviewController();
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
    emitter.on('aurora-native-document', this.documentEventCallback);
    webview.WebviewController.setWebDebuggingAccess(true);
  }

  aboutToDisappear(): void {
    emitter.off('aurora-native-document', this.documentEventCallback);
  }

  build() {
    Stack() {
      Web({ src: $rawfile('web/index.html'), controller: this.controller })
        .width('100%')
        .height('100%')
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(true)
        .javaScriptProxy({
          object: this.bridge,
          name: 'auroraHarmonyHost',
          methodList: [
            'appReady',
            'getPlatform',
            'consumePendingIntent',
            'readOpenDocumentChunk',
            'finishOpenDocument',
            'startWindowMove',
            'toggleMaximizeWindow',
            'beginSave',
            'appendSaveChunk',
            'abortSave'
          ],
          asyncMethodList: ['finishSave'],
          controller: this.controller
        })
        .onShowFileSelector((event) => {
          const options = new picker.DocumentSelectOptions();
          options.maxSelectNumber = 1;
          options.fileSuffixFilters = [
            'Office documents|.docx,.pptx,.xlsx,.jmp,.vsdx,.md,.markdown,.pdf,.drawio'
          ];
          const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
          const documentPicker = new picker.DocumentViewPicker(context);
          documentPicker.select(options).then((uris: Array<string>) => {
            event.result.handleFileList(uris);
          }).catch((cause: Error) => {
            console.error(`Document selection failed: ${cause.message}`);
          });
          return true;
        })
        .onConsole((event) => {
          console.info(`[ArkWeb] ${event.message.getMessage()}`);
          return false;
        })

      if (!this.webReady) {
        Column({ space: 18 }) {
          LoadingProgress()
            .width(40)
            .height(40)
            .color('#0A987F')
          Text('正在载入 AuroraPrime Office…')
            .fontSize(16)
            .fontWeight(FontWeight.Medium)
            .fontColor('#174139')
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#F5F7F6')
      }
    }
    .width('100%')
    .height('100%')
  }
}
