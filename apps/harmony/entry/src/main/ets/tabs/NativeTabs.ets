import { common } from '@kit.AbilityKit';
import { window, BuilderNode, FrameNode, NodeController, UIContext } from '@kit.ArkUI';
import { webview } from '@kit.ArkWeb';
import { HarmonyDocumentBridge, NativeTabsHost } from '../bridge/HarmonyDocumentBridge';
import { HarmonyClientServices } from '../bridge/HarmonyClientServices';
import { HarmonyWeb, HarmonyWebParams } from '../pages/HarmonyWeb';
import { NativeTabGroup, NativeTabGroups } from './NativeTabGroups';

export class NativeTabContainer extends NodeController {
  root: FrameNode | null = null;
  makeNode(_context: UIContext): FrameNode | null { return this.root; }
}

export class NativeTabInfo {
  title: string = '正在打开…';
  dirty: boolean = false;
  ready: boolean = false;
  id: string;
  constructor(id: string) { this.id = id; }
}

interface OpenTabRequest { id: string; fileName: string; }
interface TabState { title: string; dirty: boolean; ready: boolean; }
interface TabCommand { action: string; argument: string; request: string; }

class PendingReply {
  timer: number = -1;
  session: string;
  resolve: (accepted: boolean) => void;
  constructor(session: string, resolve: (accepted: boolean) => void) {
    this.session = session;
    this.resolve = resolve;
  }
}

class TabSession implements NativeTabsHost {
  controller: webview.WebviewController = new webview.WebviewController();
  services: HarmonyClientServices = new HarmonyClientServices();
  bridge: HarmonyDocumentBridge;
  node: BuilderNode<[HarmonyWebParams]>;
  info: NativeTabInfo;
  commands: string[] = [];

  id: string;
  constructor(id: string, group: NativeWindow, context: common.UIAbilityContext) {
    this.id = id;
    this.info = new NativeTabInfo(id);
    this.bridge = new HarmonyDocumentBridge(undefined, () => nativeTabs.takeIntent(this.id));
    this.bridge.initialize(context, group.window);
    this.bridge.setNativeTabs(this);
    this.services.initialize(context);
    this.node = new BuilderNode<[HarmonyWebParams]>(group.window.getUIContext());
    this.node.build(wrapBuilder<[HarmonyWebParams]>(HarmonyWeb),
      new HarmonyWebParams(this.controller, this.bridge, this.services, context));
  }
  sessionId(): string { return this.id; }
  open(request: string): Promise<string> { return nativeTabs.open(this.id, request); }
  publish(encoded: string): boolean {
    try {
      const state = JSON.parse(encoded) as TabState;
      if (state.title) this.info.title = state.title;
      this.info.dirty = state.dirty;
      this.info.ready = state.ready;
      nativeTabs.notify();
      return true;
    } catch (_) { return false; }
  }
  takeCommand(): string { return this.commands.shift() ?? ''; }
  respond(request: string, accepted: boolean): boolean {
    return nativeTabs.respond(this.id, request, accepted);
  }
  command(action: string, argument: string = '', request: string = ''): void {
    const command: TabCommand = { action, argument, request };
    this.commands.push(JSON.stringify(command));
  }
}

export class NativeWindow {
  container: NativeTabContainer = new NativeTabContainer();
  attached: string = '';
  refresh?: () => void;
  model: NativeTabGroup;
  window: window.Window;
  constructor(model: NativeTabGroup, appWindow: window.Window) {
    this.model = model;
    this.window = appWindow;
  }
}

class NativeWindowStorage {
  groupId: string;
  constructor(id: string) { this.groupId = id; }
}

class NativeTabs {
  model: NativeTabGroups = new NativeTabGroups();
  windows: Map<string, NativeWindow> = new Map();
  sessions: Map<string, TabSession> = new Map();
  private stage?: window.WindowStage;
  private context?: common.UIAbilityContext;
  private focused: string = 'main';
  private sequence: number = 0;
  private busy: boolean = false;
  private dragging: string = '';
  private dropped: boolean = false;
  private dragOperation?: Promise<void>;
  private replies: Map<string, PendingReply> = new Map();

  initialize(stage: window.WindowStage, context: common.UIAbilityContext): void {
    this.stage = stage;
    this.context = context;
    this.register('main', stage.getMainWindowSync());
  }

  private register(id: string, appWindow: window.Window): NativeWindow {
    const model = new NativeTabGroup(id, `home-${id}`);
    const group = new NativeWindow(model, appWindow);
    this.model.groups.set(id, model);
    this.windows.set(id, group);
    appWindow.on('windowEvent', (event: window.WindowEventType) => {
      if (event === window.WindowEventType.WINDOW_ACTIVE) this.focused = id;
    });
    // Reject means close in this API; always resolve failures as a veto.
    appWindow.on('windowWillClose', async () => {
      try { return !(await this.closeWindow(id)); }
      catch (_) { return true; }
    });
    return group;
  }

  async start(id: string): Promise<void> {
    const group = this.windows.get(id);
    if (!group || !this.context) throw new Error('文档窗口尚未初始化');
    if (!this.sessions.has(group.model.home)) {
      const home = new TabSession(group.model.home, group, this.context);
      home.info.title = 'Home';
      this.sessions.set(home.id, home);
    }
    await this.mount(group, group.model.active);
  }

  notify(): void {
    for (const group of this.windows.values()) group.refresh?.();
  }

  tabs(id: string): NativeTabInfo[] {
    const group = this.windows.get(id);
    const result: NativeTabInfo[] = [];
    if (group) for (const document of group.model.documents) {
      const session = this.sessions.get(document);
      if (session) result.push(session.info);
    }
    return result;
  }

  private groupFor(session: string): NativeWindow | undefined {
    for (const group of this.windows.values()) {
      if (group.model.home === session || group.model.documents.includes(session)) return group;
    }
    return undefined;
  }

  private async unmount(group: NativeWindow): Promise<void> {
    const session = this.sessions.get(group.attached);
    group.container.root = null;
    group.container.rebuild();
    if (session) {
      // ArkUI applies the NodeContainer rebuild on its next frame. Never mount
      // the same live Web node under two parents, even for one frame.
      for (let frame = 0; frame < 60; frame++) {
        if (!session.node.getFrameNode()?.getParent()) break;
        await new Promise<void>((resolve) => setTimeout(resolve, 16));
      }
      if (session.node.getFrameNode()?.getParent()) {
        group.container.root = session.node.getFrameNode();
        group.container.rebuild();
        throw new Error('文档组件仍在原窗口中');
      }
    }
    group.attached = '';
  }

  private async mount(group: NativeWindow, id: string): Promise<void> {
    if (group.attached === id) return;
    const session = this.sessions.get(id);
    if (!session) throw new Error('找不到文档组件');
    const previous = group.attached;
    await this.unmount(group);
    const node = session.node.getFrameNode();
    if (!node || node.getParent()) {
      const old = this.sessions.get(previous);
      group.container.root = old?.node.getFrameNode() ?? null;
      group.container.rebuild();
      group.attached = previous;
      throw new Error('文档组件尚未从原窗口释放');
    }
    session.bridge.setAppWindow(group.window);
    group.container.root = node;
    group.container.rebuild();
    group.attached = id;
    group.model.active = id;
    this.focused = group.model.id;
    this.notify();
  }

  async select(groupId: string, sessionId: string): Promise<void> {
    if (this.busy || this.dragging) return;
    const group = this.windows.get(groupId);
    if (!group || this.groupFor(sessionId) !== group) return;
    this.busy = true;
    try { await this.mount(group, sessionId); }
    finally { this.busy = false; }
  }

  async open(sourceId: string, encoded: string): Promise<string> {
    if (this.busy || this.dragging) throw new Error('请完成标签拖动后再打开文档');
    const group = this.groupFor(sourceId);
    if (!group || !this.context) throw new Error('原文档窗口已关闭');
    const request = JSON.parse(encoded) as OpenTabRequest;
    if (!/^document-[a-zA-Z0-9-]+$/.test(request.id) || this.sessions.has(request.id)) {
      throw new Error('无效或重复的文档请求');
    }
    this.busy = true;
    let session: TabSession | undefined;
    try {
      session = new TabSession(request.id, group, this.context);
      session.info.title = request.fileName;
      this.sessions.set(session.id, session);
      group.model.documents.push(session.id);
      await this.mount(group, session.id);
      return session.id;
    } catch (cause) {
      if (session) {
        this.model.remove(session.id);
        this.sessions.delete(session.id);
        session.node.dispose();
      }
      throw new Error(String(cause));
    } finally { this.busy = false; }
  }

  command(groupId: string, action: string, argument: string = ''): void {
    const group = this.windows.get(groupId);
    if (group) this.sessions.get(group.model.active)?.command(action, argument);
  }

  private ask(session: TabSession): Promise<boolean> {
    if (!session.info.ready) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const request = `close-${++this.sequence}`;
      const pending = new PendingReply(session.id, resolve);
      pending.timer = setTimeout(() => {
        this.replies.delete(request);
        resolve(false);
      }, 120000);
      this.replies.set(request, pending);
      session.command('can-close', '', request);
    });
  }

  respond(session: string, request: string, accepted: boolean): boolean {
    const pending = this.replies.get(request);
    if (!pending || pending.session !== session) return false;
    clearTimeout(pending.timer);
    this.replies.delete(request);
    pending.resolve(accepted);
    return true;
  }

  async closeTab(id: string): Promise<void> {
    if (this.busy || this.dragging) return;
    const group = this.groupFor(id);
    const session = this.sessions.get(id);
    if (!group || !session || id === group.model.home) return;
    this.busy = true;
    try {
      await this.mount(group, id);
      if (!(await this.ask(session))) return;
      await this.unmount(group);
      this.model.remove(id);
      this.sessions.delete(id);
      session.node.dispose();
      await this.mount(group, group.model.active);
    } finally { this.busy = false; this.notify(); }
  }

  private async closeWindow(id: string): Promise<boolean> {
    if (this.busy || this.dragging) return false;
    this.busy = true;
    try {
      // Closing the main window also closes its native subwindows.
      const groups = id === 'main' ? Array.from(this.windows.values()) : [this.windows.get(id)!];
      for (const group of groups) {
        for (const document of group.model.documents) {
          const session = this.sessions.get(document);
          if (!session) continue;
          await group.window.showWindow();
          await this.mount(group, document);
          if (!(await this.ask(session))) return false;
        }
      }
      for (const group of groups) await this.disposeGroup(group);
      return true;
    } finally { this.busy = false; }
  }

  private async disposeGroup(group: NativeWindow): Promise<void> {
    await this.unmount(group);
    for (const id of [group.model.home, ...group.model.documents]) {
      this.sessions.get(id)?.node.dispose();
      this.sessions.delete(id);
    }
    this.windows.delete(group.model.id);
    this.model.groups.delete(group.model.id);
  }

  beginDrag(id: string): boolean {
    if (this.busy || this.dragging || !this.model.owner(id)) return false;
    this.dragging = id;
    this.dropped = false;
    return true;
  }

  hasDrag(): boolean { return this.dragging !== ''; }

  async drop(destination: string, before: string = ''): Promise<void> {
    const id = this.dragging;
    if (!id || this.dropped) return;
    this.dropped = true;
    this.dragOperation = this.transfer(id, destination, before);
    await this.dragOperation;
  }

  async endDrag(cancelled: boolean, x: number, y: number): Promise<void> {
    const id = this.dragging;
    if (!id) return;
    try {
      if (this.dragOperation) await this.dragOperation;
      if (!cancelled && !this.dropped) await this.detach(id, x, y);
    } finally {
      this.dragging = '';
      this.dropped = false;
      this.dragOperation = undefined;
      this.notify();
    }
  }

  private async transfer(id: string, destination: string, before: string = ''): Promise<void> {
    const source = this.groupFor(id);
    const target = this.windows.get(destination);
    if (!source || !target || id === before) return;
    if (before && !target.model.documents.includes(before)) return;
    const oldActive = source.model.active;
    const oldTarget = target.model.active;
    const oldDocuments = source.model.documents.slice();
    const targetDocuments = target.model.documents.slice();
    try {
      if (source.attached === id) await this.unmount(source);
      this.model.move(id, destination, before);
      if (source !== target) await this.mount(source, source.model.active);
      await this.mount(target, id);
      await target.window.showWindow();
    } catch (cause) {
      if (target.attached === id) await this.unmount(target);
      source.model.documents = oldDocuments;
      source.model.active = oldActive;
      if (target !== source) {
        target.model.documents = targetDocuments;
        target.model.active = oldTarget;
        await this.mount(target, oldTarget);
      }
      await this.mount(source, oldActive);
      throw new Error(String(cause));
    } finally { this.notify(); }
  }

  private async detach(id: string, x: number, y: number): Promise<void> {
    const source = this.groupFor(id);
    if (!source || !this.stage) return;
    const rect = source.window.getWindowProperties().windowRect;
    const name = `tabs-${++this.sequence}`;
    const appWindow = await this.stage.createSubWindowWithOptions(name, {
      title: 'CubeOffice', decorEnabled: true, isModal: false,
      windowRect: { left: Math.round(x - 100), top: Math.max(0, Math.round(y - 20)),
        width: rect.width, height: rect.height }, maximizeSupported: true
    });
    const group = this.register(name, appWindow);
    try {
      await appWindow.loadContent('pages/NativeWorkspace', new LocalStorage(new NativeWindowStorage(name)));
      appWindow.setWindowDecorVisible(false);
      appWindow.setWindowDecorHeight(38);
      await appWindow.showWindow();
      await this.transfer(id, name);
    } catch (cause) {
      // Source ownership is restored by transfer before a failed window dies.
      await this.disposeGroup(group);
      await appWindow.destroyWindow();
      throw new Error(String(cause));
    }
  }

  takeIntent(session: string): string {
    const group = this.windows.get(this.focused);
    if (group?.model.active !== session) return '';
    try {
      const documents = JSON.parse(AppStorage.get<string>('harmonyDocumentIntents') ?? '[]') as Object[];
      const pending = documents.shift();
      if (pending) {
        AppStorage.setOrCreate('harmonyDocumentIntents', JSON.stringify(documents));
        return JSON.stringify(pending);
      }
    } catch (_) { return ''; }
    const intent = AppStorage.get<string>('harmonyIntent') ?? '';
    AppStorage.setOrCreate('harmonyIntent', '');
    return intent;
  }
}

export const nativeTabs: NativeTabs = new NativeTabs();
