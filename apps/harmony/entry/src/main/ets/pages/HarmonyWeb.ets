import { common } from '@kit.AbilityKit';
import { picker } from '@kit.CoreFileKit';
import { webview } from '@kit.ArkWeb';
import { HarmonyDocumentBridge } from '../bridge/HarmonyDocumentBridge';
import { HarmonyClientServices } from '../bridge/HarmonyClientServices';
import { OPEN_FILE_SUFFIX_FILTERS } from '../common/OpenFormats';

export class HarmonyWebParams {
  controller: webview.WebviewController;
  bridge: HarmonyDocumentBridge;
  services: HarmonyClientServices;
  context: common.UIAbilityContext;
  constructor(controller: webview.WebviewController, bridge: HarmonyDocumentBridge,
    services: HarmonyClientServices, context: common.UIAbilityContext) {
    this.controller = controller;
    this.bridge = bridge;
    this.services = services;
    this.context = context;
  }
}

@Builder
export function HarmonyWeb(params: HarmonyWebParams) {
      Web({ src: 'https://cubeoffice.invalid/index.html', controller: params.controller })
        .width('100%')
        .height('100%')
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(true)
        .onControllerAttached(() => {
          params.controller.registerJavaScriptProxy(params.services, 'cubeofficeServices',
            ['getInfo', 'setAutomatic', 'copyClientId', 'request', 'takeResult']);
        })
        .onInterceptRequest((event) => {
          if (!event) return null;
          const prefix = 'https://cubeoffice.invalid/';
          const url = event.request.getRequestUrl();
          if (!url.startsWith(prefix)) return null;
          const path = url.substring(prefix.length).split('?')[0].split('#')[0];
          const response = new WebResourceResponse();
          // Only packaged assets are served. Never fall back to the network for
          // our reserved origin, and never allow access outside web/.
          if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.split('/').includes('..')) {
            response.setResponseData('');
            response.setResponseCode(404);
            response.setReasonMessage('Not Found');
          } else {
            response.setResponseData($rawfile('web/' + path));
            response.setResponseCode(200);
            response.setReasonMessage('OK');
          }
          const extension = path.split('.').pop() || '';
          const types = new Map<string, string>([
            ['html', 'text/html'], ['js', 'text/javascript'], ['css', 'text/css'],
            ['json', 'application/json'], ['svg', 'image/svg+xml'],
            ['png', 'image/png'], ['jpg', 'image/jpeg'], ['webp', 'image/webp'],
            ['woff', 'font/woff'], ['woff2', 'font/woff2'], ['ttf', 'font/ttf'],
            ['wasm', 'application/wasm']
          ]);
          response.setResponseMimeType(types.get(extension) || 'application/octet-stream');
          response.setResponseEncoding('utf-8');
          response.setResponseIsReady(true);
          return response;
        })
        .javaScriptProxy({
          object: params.bridge,
          name: 'auroraHarmonyHost',
          methodList: [
            'appReady',
            'getNativeTabSession',
            'publishNativeTab',
            'takeNativeTabCommand',
            'respondNativeTab',
            'getPlatform',
            'hasWindowControls',
            'exitApp',
            'consumePendingIntent',
            'readOpenDocumentChunk',
            'finishOpenDocument',
            'beginImageDecode',
            'appendImageDecodeChunk',
            'readImageDecodeChunk',
            'disposeImageDecode',
            'startWindowMove',
            'toggleMaximizeWindow',
            'setPresentationLandscape',
            'beginSave',
            'appendSaveChunk',
            'abortSave'
          ],
          asyncMethodList: ['finishSave', 'openNativeTab', 'finishImageDecode'],
          controller: params.controller
        })
        .onShowFileSelector((event) => {
          const options = new picker.DocumentSelectOptions();
          options.maxSelectNumber = 1;
          // Generated from scripts/open-formats.mjs, like OPEN_ACCEPT in the web shell.
          options.fileSuffixFilters = OPEN_FILE_SUFFIX_FILTERS;
          const context = params.context;
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
}
