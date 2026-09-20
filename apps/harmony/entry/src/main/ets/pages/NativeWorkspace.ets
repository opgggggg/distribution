import { nativeTabs, NativeTabInfo, NativeWindow } from '../tabs/NativeTabs';
import { unifiedDataChannel } from '@kit.ArkData';

// PC/2in1 only. Each tab owns a persistent BuilderNode<Web>; the native strip
// owns drag-and-drop so crossing WebView/window boundaries never loses input.
@Entry({ useSharedStorage: true })
@Component
struct NativeWorkspace {
  @LocalStorageProp('groupId') groupId: string = 'main';
  @State private documents: NativeTabInfo[] = [];
  @State private active: string = '';
  @State private error: string = '';
  @State private dropBefore: string = '';
  private group?: NativeWindow;

  aboutToAppear(): void {
    this.group = nativeTabs.windows.get(this.groupId);
    if (!this.group) return;
    this.group.refresh = () => this.refresh();
    nativeTabs.start(this.groupId).then(() => this.refresh()).catch((cause: Error) => this.fail(cause));
  }

  aboutToDisappear(): void {
    if (this.group) this.group.refresh = undefined;
  }

  private refresh(): void {
    this.documents = nativeTabs.tabs(this.groupId).map((item: NativeTabInfo) => {
      const copy = new NativeTabInfo(item.id);
      copy.title = item.title;
      copy.dirty = item.dirty;
      copy.ready = item.ready;
      return copy;
    });
    this.active = this.group?.model.active ?? '';
  }

  private fail(cause: Error): void {
    this.error = cause.message;
    console.error(`Native document tabs: ${cause.message}`);
  }

  private drop(event: DragEvent, before: string): void {
    if (!nativeTabs.hasDrag()) return;
    event.setResult(DragResult.DRAG_SUCCESSFUL);
    this.dropBefore = '';
    nativeTabs.drop(this.groupId, before).catch((cause: Error) => this.fail(cause));
  }

  private endDrag(event: DragEvent): void {
    const cancelled = event.getResult() === DragResult.DRAG_CANCELED;
    nativeTabs.endDrag(cancelled, this.getUIContext().vp2px(event.getDisplayX()),
      this.getUIContext().vp2px(event.getDisplayY())).catch((cause: Error) => this.fail(cause));
    this.dropBefore = '';
  }

  @Builder
  private tabPreview(item: NativeTabInfo) {
    Row() {
      Text(item.title).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
        .fontSize(13).fontColor('#202124')
    }.padding(12).width(240).height(44).backgroundColor('#FFFFFF').borderRadius(8)
  }

  @Builder
  private appMenu() {
    Menu() {
      MenuItem({ content: 'AI 活动' }).onClick(() => nativeTabs.command(this.groupId, 'activity'))
      MenuItem({ content: '设置' }).onClick(() => nativeTabs.command(this.groupId, 'settings'))
      MenuItem({ content: '反馈与更新' }).onClick(() => nativeTabs.command(this.groupId, 'services'))
      MenuItem({ content: '关于 CubeOffice' }).onClick(() => nativeTabs.command(this.groupId, 'about'))
    }
  }

  @Builder
  private newMenu() {
    Menu() {
      MenuItem({ content: 'Word' }).onClick(() => nativeTabs.command(this.groupId, 'new', 'docx'))
      MenuItem({ content: 'PowerPoint' }).onClick(() => nativeTabs.command(this.groupId, 'new', 'pptx'))
      MenuItem({ content: 'Excel' }).onClick(() => nativeTabs.command(this.groupId, 'new', 'xlsx'))
      MenuItem({ content: 'Visio' }).onClick(() => nativeTabs.command(this.groupId, 'new', 'vsdx'))
      MenuItem({ content: 'Markdown' }).onClick(() => nativeTabs.command(this.groupId, 'new', 'markdown'))
    }
  }

  build() {
    Column() {
      Row({ space: 2 }) {
        Button('☰', { type: ButtonType.Normal }).width(36).height(32)
          .fontColor('#44474E').backgroundColor(Color.Transparent)
          .accessibilityText('CubeOffice 菜单').bindMenu(this.appMenu)
        Button('Home', { type: ButtonType.Normal }).height(32).width(70)
          .fontSize(12).fontColor('#202124')
          .backgroundColor(this.active === this.group?.model.home ? Color.White : Color.Transparent)
          .onClick(() => {
            if (this.group) nativeTabs.select(this.groupId, this.group.model.home)
              .catch((cause: Error) => this.fail(cause));
          })
        List({ space: 2 }) {
          ForEach(this.documents, (item: NativeTabInfo) => {
            ListItem() {
              Row() {
                Text((item.dirty ? '• ' : '') + item.title)
                  .fontSize(12).fontColor('#202124').maxLines(1)
                  .textOverflow({ overflow: TextOverflow.Ellipsis }).layoutWeight(1)
                  .onClick(() => nativeTabs.select(this.groupId, item.id)
                    .catch((cause: Error) => this.fail(cause)))
                Button('×', { type: ButtonType.Normal }).width(28).height(28)
                  .fontSize(16).fontColor('#666666').backgroundColor(Color.Transparent)
                  .accessibilityText(`关闭 ${item.title}`)
                  .onClick(() => nativeTabs.closeTab(item.id).catch((cause: Error) => this.fail(cause)))
              }
              .padding({ left: 10 }).width(190).height(32)
              .backgroundColor(this.active === item.id ? Color.White : '#E5E8ED')
              .borderRadius({ topLeft: 7, topRight: 7 })
              .border({ width: { left: this.dropBefore === item.id ? 2 : 0 }, color: '#078873' })
              .draggable(true)
              .onDragStart((event: DragEvent) => {
                if (!nativeTabs.beginDrag(item.id)) return undefined;
                try {
                  const record = new unifiedDataChannel.ApplicationDefinedRecord();
                  record.applicationDefinedType = 'ApplicationDefined.com.cubexp.office.live-tab';
                  record.rawData = new Uint8Array([1]);
                  event.setData(new unifiedDataChannel.UnifiedData(record));
                } catch (cause) {
                  void nativeTabs.endDrag(true, 0, 0);
                  this.fail(new Error(String(cause)));
                  return undefined;
                }
                return { builder: () => this.tabPreview(item), extraInfo: 'cubeoffice-live-tab' };
              })
              .onDragMove((event: DragEvent) => {
                if (nativeTabs.hasDrag()) {
                  this.dropBefore = item.id;
                  event.setResult(DragResult.DRAG_SUCCESSFUL);
                }
              })
              .onDragLeave(() => { this.dropBefore = ''; })
              .onDrop((event: DragEvent) => this.drop(event, item.id))
              .onDragEnd((event: DragEvent) => this.endDrag(event))
            }
          }, (item: NativeTabInfo) => item.id)
          ListItem() {
            Row().width(44).height(32)
              .onDrop((event: DragEvent) => this.drop(event, ''))
              .onTouch((event: TouchEvent) => {
                if (event.type === TouchType.Down && !nativeTabs.hasDrag()) {
                  this.group?.window.startMoving().catch((cause: Error) => this.fail(cause));
                }
              })
          }
        }.listDirection(Axis.Horizontal).layoutWeight(1).height(32)
        Button('+', { type: ButtonType.Normal }).width(32).height(32)
          .fontSize(20).fontColor('#44474E').backgroundColor(Color.Transparent)
          .accessibilityText('新建文档').bindMenu(this.newMenu)
        Button('打开', { type: ButtonType.Normal }).height(32).fontSize(12)
          .fontColor('#44474E').backgroundColor(Color.Transparent)
          .onClick(() => nativeTabs.command(this.groupId, 'open'))
      }
      .height(38).width('100%').padding({ left: 6, right: 132, top: 6 })
      .backgroundColor('#DEE2E9')
      if (this.error) {
        Row() {
          Text(this.error).layoutWeight(1).fontSize(12).fontColor('#B42318')
          Button('关闭').onClick(() => { this.error = ''; })
        }.padding(8).width('100%').backgroundColor('#FEF3F2')
      }
      if (this.group) {
        NodeContainer(this.group.container).width('100%').layoutWeight(1)
      }
    }.width('100%').height('100%').backgroundColor('#F5F7F6')
  }
}
