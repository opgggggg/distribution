import { common } from '@kit.AbilityKit';
import { updateManager } from '@kit.AppGalleryKit';
import { bundleManager } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { util } from '@kit.ArkTS';
import { http } from '@kit.NetworkKit';
import { pasteboard } from '@kit.BasicServicesKit';

interface FeedbackInput {
  category: string;
  message: string;
  contact: string;
  includeSystem: boolean;
}
interface StoreUpdate { channel: string; available: boolean; }
interface StoreUpdateResponse { ok: boolean; data: StoreUpdate; }

// Native transport: only fixed CubeOffice endpoints and AppGallery operations.
// Never accept a download URL or a destination URL from the renderer.
export class HarmonyClientServices {
  private context?: common.UIAbilityContext;
  private store?: preferences.Preferences;
  private clientId: string = '';
  private version: string = '';
  private versionCode: number = 0;
  private results: Map<string, string> = new Map();
  private pending: Set<string> = new Set();

  initialize(context: common.UIAbilityContext): void {
    this.context = context;
    this.store = preferences.getPreferencesSync(context, { name: 'cubeoffice-services' });
    this.clientId = this.store.getSync('clientId', '') as string;
    if (!this.clientId) {
      this.clientId = util.generateRandomUUID();
      this.store.putSync('clientId', this.clientId);
      this.store.flush().catch(() => {});
    }
    const info = bundleManager.getBundleInfoForSelfSync(bundleManager.BundleFlag.GET_BUNDLE_INFO_DEFAULT);
    this.version = info.versionName;
    this.versionCode = info.versionCode;
  }

  getInfo(): string {
    return JSON.stringify({ client_id: this.clientId, version: this.version,
      versionCode: this.versionCode, sdk: 0, platform: 'harmonyos',
      updateChannel: 'appgallery', automatic: this.store?.getSync('automatic', false),
      lastCheck: this.store?.getSync('lastCheck', 0) });
  }

  setAutomatic(enabled: boolean): void {
    this.store?.putSync('automatic', enabled);
    this.store?.flush().catch(() => {});
  }

  copyClientId(): void {
    pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, this.clientId)).catch(() => {});
  }

  request(operation: string, input: string): string {
    if (!this.context || !this.store || input.length > 12000 ||
      !['updates', 'install-update', 'feedback'].includes(operation) ||
      this.pending.has(operation) || this.results.size >= 16) return '';
    const id = util.generateRandomUUID();
    this.pending.add(operation);
    this.run(operation, input).then((result: string) => {
      this.results.set(id, result);
    }).catch(() => {
      this.results.set(id, JSON.stringify({ ok: false,
        error: operation === 'feedback' ? '反馈提交未确认，请保留内容并检查网络后重试' :
          '无法访问华为应用市场，请确认应用已上架、已同意市场隐私协议并检查网络后重试' }));
    }).finally(() => {
      this.pending.delete(operation);
      setTimeout(() => { this.results.delete(id); }, 70000);
    });
    return id;
  }

  takeResult(id: string): string {
    const result = this.results.get(id) || '';
    this.results.delete(id);
    return result;
  }

  private async post(path: string, body: string): Promise<string> {
    const request = http.createHttp();
    try {
      const response = await request.request('https://cubexp.com/api/v1/' + path, {
        method: http.RequestMethod.POST, header: { 'Content-Type': 'application/json' },
        extraData: body, connectTimeout: 15000, readTimeout: 20000,
        expectDataType: http.HttpDataType.STRING
      });
      if (response.responseCode < 200 || response.responseCode >= 300) throw new Error('Request failed');
      return response.result as string;
    } finally { request.destroy(); }
  }

  private async run(operation: string, input: string): Promise<string> {
    const context = this.context!;
    if (operation === 'updates') {
      const result = await updateManager.checkAppUpdate(context);
      this.store?.putSync('lastCheck', Date.now());
      this.store?.flush().catch(() => {});
      // Statistics failure must never prevent an AppGallery update.
      this.post('update-checks', JSON.stringify({ client_id: this.clientId,
        version: this.version, platform: 'harmonyos', arch: 'unknown', locale: ''
      })).catch(() => {});
      const response: StoreUpdateResponse = { ok: true, data: { channel: 'appgallery',
        available: result.updateAvailable === updateManager.UpdateAvailableCode.LATER_VERSION_EXIST } };
      return JSON.stringify(response);
    }
    if (operation === 'install-update') {
      const result = await updateManager.checkAppUpdate(context);
      if (result.updateAvailable !== updateManager.UpdateAvailableCode.LATER_VERSION_EXIST)
        return '{"ok":true,"data":{"shown":false}}';
      const shown = await updateManager.showUpdateDialog(context);
      if (shown !== updateManager.ShowUpdateResultCode.SHOW_DIALOG_SUCCESS) throw new Error('Cannot show update');
      return '{"ok":true,"data":{"shown":true}}';
    }
    const feedback = JSON.parse(input) as FeedbackInput;
    if (typeof feedback.message !== 'string' || feedback.message.trim().length < 10 ||
      feedback.message.length > 8000) throw new Error('Invalid feedback');
    const response = await this.post('feedback', JSON.stringify({
      client_id: this.clientId, version: this.version, platform: 'harmonyos',
      arch: 'unknown', locale: '', category: feedback.category,
      message: feedback.message, contact: feedback.contact
    }));
    return '{"ok":true,"data":' + response + '}';
  }
}
