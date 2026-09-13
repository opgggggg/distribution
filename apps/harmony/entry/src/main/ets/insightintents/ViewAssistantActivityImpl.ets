import { InsightIntentEntry, InsightIntentEntryExecutor, insightIntent } from '@kit.AbilityKit';
import { IntentOutcome, openWorkspace } from './WorkspaceLauncher';

@InsightIntentEntry({
  intentName: 'ViewAssistantActivity',
  domain: 'ToolsDomain',
  intentVersion: '1.0.1',
  displayName: '查看助手活动',
  displayDescription: '查看 CubeOffice 的 AI 助手调用记录与连接状态',
  icon: $r('app.media.app_icon'),
  llmDescription: '打开 CubeOffice 的 AI 活动页面，展示 AI 助手的调用记录和当前连接状态。当用户想确认助手是否连上、查看最近有哪些助手调用时使用，例如“看看助手连上没有”“CubeOffice 的 AI 调用记录”。以下情况不要调用：用户想新建或打开文档；用户询问的是设备本身的网络状态，而非 CubeOffice 的助手连接状态。',
  keywords: ['助手活动', 'AI 活动', '调用记录', '连接状态'],
  abilityName: 'EntryAbility',
  executeMode: [insightIntent.ExecuteMode.UI_ABILITY_FOREGROUND],
  parameters: {
    'type': 'object',
    'description': '打开 AI 活动页面，无需参数',
    'properties': {}
  }
})
export default class ViewAssistantActivityImpl extends InsightIntentEntryExecutor<IntentOutcome> {
  onExecute(): Promise<insightIntent.IntentResult<IntentOutcome>> {
    return openWorkspace(this.windowStage, 'activity', '已打开 AI 活动页面');
  }
}
