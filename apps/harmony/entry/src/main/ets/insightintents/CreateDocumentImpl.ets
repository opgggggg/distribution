import { InsightIntentEntry, InsightIntentEntryExecutor, insightIntent } from '@kit.AbilityKit';
import { IntentOutcome, openWorkspace, outcome } from './WorkspaceLauncher';

const PAGE_IDS: Map<string, string> = new Map<string, string>([
  ['docx', 'new-docx'],
  ['pptx', 'new-pptx'],
  ['xlsx', 'new-xlsx'],
  ['vsdx', 'new-vsdx'],
  ['markdown', 'new-markdown']
]);

const LABELS: Map<string, string> = new Map<string, string>([
  ['docx', 'Word 文档'],
  ['pptx', '演示文稿'],
  ['xlsx', 'Excel 工作簿'],
  ['vsdx', 'Visio 绘图'],
  ['markdown', 'Markdown 文档']
]);

@InsightIntentEntry({
  intentName: 'CreateDocument',
  domain: 'ToolsDomain',
  intentVersion: '1.0.1',
  displayName: '新建文档',
  displayDescription: '在 CubeOffice 中新建一份可编辑的办公文档',
  icon: $r('app.media.app_icon'),
  llmDescription: '在 CubeOffice 中新建一份空白办公文档，并立即打开编辑器供用户编写。支持 Word 文档、演示文稿、Excel 工作簿、Visio 绘图、Markdown 文档五种类型，必须由 documentType 参数指定其中一种。当用户明确表达要新建、创建、写一份文档时使用，例如“新建一个 Word 文档”“帮我做个 PPT”“写个笔记”。以下情况不要调用：用户只是想打开已有文档或查看最近文件（应使用 OpenWorkspace 意图）；用户想把已有文档转换成其他格式；用户只是在询问 CubeOffice 支持哪些格式而并无创建意愿。',
  keywords: ['新建文档', '创建文档', '写文档', '做表格', '做演示', '新建笔记'],
  abilityName: 'EntryAbility',
  executeMode: [insightIntent.ExecuteMode.UI_ABILITY_FOREGROUND],
  parameters: {
    'type': 'object',
    'description': '描述要新建的办公文档类型',
    'properties': {
      'documentType': {
        'type': 'string',
        'enum': ['docx', 'pptx', 'xlsx', 'vsdx', 'markdown'],
        'description': '要新建的文档类型。docx 对应 Word 文字文档；pptx 对应 PowerPoint 演示文稿；xlsx 对应 Excel 表格工作簿；vsdx 对应 Visio 流程图与绘图；markdown 对应 Markdown 笔记。用户说“文档/Word”选 docx，说“PPT/演示/幻灯片”选 pptx，说“表格/Excel/工作簿”选 xlsx，说“流程图/绘图/Visio”选 vsdx，说“笔记/Markdown/md”选 markdown。'
      }
    },
    'required': ['documentType']
  }
})
export default class CreateDocumentImpl extends InsightIntentEntryExecutor<IntentOutcome> {
  public documentType: string = '';

  onExecute(): Promise<insightIntent.IntentResult<IntentOutcome>> {
    const requested: string = this.documentType.trim().toLowerCase();
    const pageId: string | undefined = PAGE_IDS.get(requested);
    if (pageId === undefined) {
      return Promise.resolve(outcome(-1,
        'CubeOffice 支持新建 Word 文档、演示文稿、Excel 工作簿、Visio 绘图和 Markdown 文档，请说明需要哪一种'));
    }
    const label: string = LABELS.get(requested) ?? '文档';
    return openWorkspace(this.windowStage, pageId, `已新建${label}并打开编辑器`);
  }
}
