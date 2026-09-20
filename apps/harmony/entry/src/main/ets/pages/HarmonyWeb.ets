import { common } from '@kit.AbilityKit';
import { picker } from '@kit.CoreFileKit';
import { webview } from '@kit.ArkWeb';
import { HarmonyDocumentBridge } from '../bridge/HarmonyDocumentBridge';
import { HarmonyClientServices } from '../bridge/HarmonyClientServices';

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

// Kept in step with TEXT_EXTENSIONS in @cubexp/text; ArkTS cannot import the
// web package, so the picker carries its own copy.
const TEXT_FILE_SUFFIXES: string = '.txt,.log,.java,.js,.mjs,.cjs,.jsx,.ts,.mts,.cts,.tsx,.json,.jsonl,.jsonc,.xml,.html,.htm,.css,.scss,.less,.vue,.py,.pyw,.rb,.sh,.bash,.zsh,.yml,.yaml,.toml,.ini,.conf,.cfg,.properties,.env,.c,.h,.cpp,.hpp,.cc,.cxx,.cs,.go,.rs,.sql,.php,.swift,.kt,.kts,.diff,.patch,.gradle,.groovy,.dockerfile,.makefile';


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
            'startWindowMove',
            'toggleMaximizeWindow',
            'setPresentationLandscape',
            'beginSave',
            'appendSaveChunk',
            'abortSave'
          ],
          asyncMethodList: ['finishSave', 'openNativeTab'],
          controller: params.controller
        })
        .onShowFileSelector((event) => {
          const options = new picker.DocumentSelectOptions();
          options.maxSelectNumber = 1;
          // Mirrors OPEN_ACCEPT in the web shell and OFFICE_MIME_TYPES on Android.
          // A suffix missing here cannot be picked even though the engine reads it.
          options.fileSuffixFilters = [
            'Office documents|.docx,.doc,.dot,.pptx,.ppt,.pps,.pot,.xlsx,.xls,.xlt,.csv,.vsdx,.drawio,.jmp',
            'Documents and images|.pdf,.ofd,.md,.markdown,.png,.jpg,.jpeg,.webp,.emf,.wmf',
            'Text and source code|' + TEXT_FILE_SUFFIXES
          ];
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
