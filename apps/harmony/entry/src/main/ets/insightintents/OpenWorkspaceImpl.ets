import { InsightIntentEntry, InsightIntentEntryExecutor, insightIntent } from '@kit.AbilityKit';
import { IntentOutcome, openWorkspace } from './WorkspaceLauncher';

@InsightIntentEntry({
  intentName: 'OpenWorkspace',
  domain: 'ToolsDomain',
  intentVersion: '1.0.1',
  displayName: '打开文档工作区',
  displayDescription: '打开 CubeOffice 文档工作区首页',
  icon: $r('app.media.app_icon'),
  llmDescription: '打开 CubeOffice 的文档工作区首页，用户可以在这里浏览和继续编辑已有文档。当用户想打开 CubeOffice、查看自己的文档列表、继续编辑之前的文件时使用，例如“打开 CubeOffice”“看看我的文档”“继续写上次那个文件”。以下情况不要调用：用户明确要新建一份文档（应使用 CreateDocument 意图）；用户想查看 AI 助手的调用记录（应使用 ViewAssistantActivity 意图）。',
  keywords: ['打开文档', '文档工作区', '我的文档', 'CubeOffice'],
  abilityName: 'EntryAbility',
  executeMode: [insightIntent.ExecuteMode.UI_ABILITY_FOREGROUND],
  parameters: {
    'type': 'object',
    'description': '打开文档工作区首页，无需参数',
    'properties': {}
  }
})
export default class OpenWorkspaceImpl extends InsightIntentEntryExecutor<IntentOutcome> {
  onExecute(): Promise<insightIntent.IntentResult<IntentOutcome>> {
    return openWorkspace(this.windowStage, 'home', '已打开 CubeOffice 文档工作区');
  }
}
