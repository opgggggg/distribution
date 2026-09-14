import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createTextBuffer } from '../dist/buffer.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'MutationObserver', 'DOMRect', 'getComputedStyle']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[name] });
}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
dom.window.Range.prototype.getClientRects = () => [];
dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect();
const { createApp, h, reactive, nextTick } = await import('vue');
const { EditorView } = await import('@codemirror/view');
const { foldedRanges } = await import('@codemirror/language');
const { TextEditor } = await import('../dist/vue/editor.js');

async function mount(source, fileName = 'Hello.java') {
  const root = document.createElement('div'); document.body.append(root);
  let api;
  const errors = [], events = [];
  const props = reactive({ source, fileName, onError: e => errors.push(e), onSave: () => events.push('save'), onSaveAs: () => events.push('save-as') });
  const app = createApp({ render: () => h(TextEditor, { ...props, ref: value => { api = value; } }) });
  app.mount(root);
  for (let i = 0; i < 30 && !root.querySelector('.cm-content'); i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(errors, []);
  const view = EditorView.findFromDOM(root.querySelector('.cm-editor'));
  return { root, props, api, view, events, errors, close() { app.unmount(); root.remove(); } };
}

test('edits, highlights, undo/redo, line numbers and search use the real editor', async () => {
  const source = 'public class Hello {\r\n    String message = "你好";\r\n}\r\n';
  const editor = await mount(new Blob([source]));
  try {
    assert.ok(editor.root.querySelector('.cm-lineNumbers'));
    assert.ok(editor.root.querySelector('.hljs-keyword'));
    editor.view.dispatch({ changes: { from: 0, insert: '// edited\n' } });
    assert.equal(editor.api.isDirty(), true);
    assert.ok(editor.api.getText().startsWith('// edited\r\n'));
    assert.ok(editor.api.undo()); assert.equal(editor.api.isDirty(), false);
    assert.ok(editor.api.redo()); assert.equal(editor.api.isDirty(), true);
    assert.ok(editor.api.find()); assert.ok(editor.root.querySelector('.cm-search'));
    editor.props.lineNumbers = false;
    await nextTick();
    assert.equal(editor.root.querySelector('.cm-lineNumbers'), null);
    const before = editor.api.getText();
    editor.props.fileName = 'Renamed.java'; await nextTick();
    assert.equal(editor.api.getText(), before, 'Save As must not reload the source');
    const content = editor.root.querySelector('.cm-content');
    content.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    assert.deepEqual(editor.events, ['save']);
    editor.props.readonly = true; await nextTick();
    assert.equal(content.getAttribute('contenteditable'), 'false');
    assert.deepEqual(editor.errors, []);
  } finally { editor.close(); }
});

test('Java parser supplies real fold ranges', async () => {
  const editor = await mount('public class Hello {\n    void greet() {\n        System.out.println("hello");\n    }\n}\n');
  try {
    for (let i = 0; i < 50; i++) {
      editor.api.foldAll();
      if (foldedRanges(editor.view.state).size) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(foldedRanges(editor.view.state).size > 0);
    editor.api.unfoldAll(); assert.equal(foldedRanges(editor.view.state).size, 0);
    assert.equal(editor.api.isDirty(), false);
  } finally { editor.close(); }
});

test('failed/cancelled saves stay dirty; edits during save are not acknowledged', async () => {
  const buffer = await createTextBuffer('original');
  buffer.setText('changed');
  await assert.rejects(buffer.saveFile({ deliver: async () => { throw new DOMException('cancelled', 'AbortError'); } }));
  assert.equal(buffer.isDirty(), true);
  let release;
  const pending = buffer.saveFile({ deliver: () => new Promise(resolve => { release = resolve; }) });
  await Promise.resolve();
  buffer.setText('new edit'); release(); await pending;
  assert.equal(buffer.isDirty(), true);
  assert.equal(buffer.getText(), 'new edit');
  let saved;
  await buffer.saveFile({ deliver: async blob => { saved = await blob.text(); } });
  assert.equal(saved, 'new edit'); assert.equal(buffer.isDirty(), false);
});

test('UTF-8/UTF-16 BOM and original unedited bytes survive saves', async () => {
  for (const bytes of [new Uint8Array([239,187,191,65]), new Uint8Array([255,254,65,0]), new Uint8Array([254,255,0,65])]) {
    const buffer = await createTextBuffer(bytes);
    assert.deepEqual(new Uint8Array(await (await buffer.exportFile()).arrayBuffer()), bytes);
    buffer.setText('中');
    const saved = new Uint8Array(await (await buffer.saveFile()).arrayBuffer());
    assert.deepEqual([...saved.slice(0, bytes[0] === 239 ? 3 : 2)], [...bytes.slice(0, bytes[0] === 239 ? 3 : 2)]);
    assert.equal((await createTextBuffer(saved)).getText(), '中');
  }
});

test('the editor routes a 5 GiB source to bounded read-only paging and can switch back', async () => {
  const { RangeTextBlob, TEXT_PAGE_BYTES } = await import('../dist/large-file.js');
  const reads = [];
  const source = new RangeTextBlob(async (start, end) => {
    reads.push(end-start);
    return new Uint8Array(end-start).fill(65);
  }, 5*1024**3);
  const editor = await mount(source, 'huge.log');
  try {
    assert.match(editor.root.querySelector('strong').textContent, /Read only/);
    assert.equal(editor.root.querySelector('.cm-content').getAttribute('contenteditable'), 'false');
    assert.ok(reads.every(size => size <= TEXT_PAGE_BYTES+4));
    assert.throws(() => editor.api.getText(), /range reads/);
    editor.props.source = 'small again';
    await nextTick();
    for(let i=0; i<30 && editor.api.getText() !== 'small again'; i++) await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(editor.api.getText(), 'small again');
    assert.equal(editor.root.querySelector('.cm-content').getAttribute('contenteditable'), 'true');
    assert.deepEqual(editor.errors, []);
  } finally { editor.close(); }
});
