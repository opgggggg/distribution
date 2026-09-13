import { insightIntent } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';

/**
 * 意图执行结果。小艺会把这里的内容转成对用户的自然语言回复。
 */
export class IntentOutcome {
  public message?: string = '';
}

export function outcome(code: number, message: string): insightIntent.IntentResult<IntentOutcome> {
  const payload: IntentOutcome = new IntentOutcome();
  payload.message = message;
  const result: insightIntent.IntentResult<IntentOutcome> = { code: code, result: payload };
  return result;
}

/**
 * 所有意图最终都落到同一个 ArkWeb 宿主页，靠 AppStorage 中的 pageId 区分场景。
 * 该契约与 Index.ets 的 @StorageLink('harmonyIntent') 一致，Web 层无需改动。
 */
export async function openWorkspace(
  stage: window.WindowStage | undefined,
  pageId: string,
  successMessage: string
): Promise<insightIntent.IntentResult<IntentOutcome>> {
  if (stage === undefined) {
    return outcome(-1, '该意图需要在前台模式下执行');
  }
  AppStorage.setOrCreate<string>('harmonyIntent', pageId);
  try {
    await stage.loadContent('pages/Index');
    return outcome(0, successMessage);
  } catch (cause) {
    const error = cause as Error;
    console.error(`Intent failed to load the workspace: ${error.message}`);
    return outcome(-2, '打开 CubeOffice 失败，请稍后重试');
  }
}
