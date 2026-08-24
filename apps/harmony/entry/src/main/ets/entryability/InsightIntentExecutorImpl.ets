import { InsightIntentExecutor, insightIntent } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';

export default class InsightIntentExecutorImpl extends InsightIntentExecutor {
  private static readonly JUMP_FUNCTION_PAGE: string = 'JumpFunctionPage';
  private static readonly SUPPORTED_PAGES: Set<string> = new Set([
    'home',
    'activity',
    'new-docx',
    'new-pptx',
    'new-xlsx',
    'new-vsdx',
    'new-markdown'
  ]);

  onExecuteInUIAbilityForegroundMode(
    name: string,
    param: Record<string, Object>,
    pageLoader: window.WindowStage
  ): Promise<insightIntent.ExecuteResult> {
    if (name !== InsightIntentExecutorImpl.JUMP_FUNCTION_PAGE) {
      return Promise.resolve(this.result(-1, 'unknown intent'));
    }

    const pageIdValue: Object | undefined = param.pageId;
    if (typeof pageIdValue !== 'string') {
      return Promise.resolve(this.result(-1, 'pageId type error'));
    }
    if (!InsightIntentExecutorImpl.SUPPORTED_PAGES.has(pageIdValue)) {
      return Promise.resolve(this.result(-1, 'unsupported pageId'));
    }

    AppStorage.setOrCreate<string>('harmonyIntent', pageIdValue);
    return pageLoader.loadContent('pages/Index')
      .then(() => this.result(0, 'Intent execute success'))
      .catch(() => this.result(-2, 'Intent execute failed'));
  }

  private result(code: number, message: string): insightIntent.ExecuteResult {
    return {
      code,
      result: { message }
    };
  }
}
