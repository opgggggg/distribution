import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRenderer, h, nextTick, reactive } from 'vue';
import { TextViewer } from '../dist/vue/index.js';

// Minimal host renderer exercises real Vue lifecycle/props without a browser.
function mount(props) {
  const node = (type, text = '') => ({ type, text, children: [], props: {}, parent: null });
  const renderer = createRenderer({
    createElement: node, createText: text => node('text', text), createComment: text => node('comment', text),
    setText: (el, text) => { el.text = text; },
    setElementText: (el, text) => { el.text = text; el.children = []; },
    patchProp: (el, key, _old, value) => { el.props[key] = value; },
    insert(el, parent, anchor) { el.parent = parent; const at = parent.children.indexOf(anchor); parent.children.splice(at < 0 ? parent.children.length : at, 0, el); },
    remove(el) { const siblings = el.parent.children; siblings.splice(siblings.indexOf(el), 1); },
    parentNode: el => el.parent,
    nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1] ?? null,
  });
  const root = node('root');
  const app = renderer.createApp({ render: () => h(TextViewer, props) });
  app.mount(root);
  return { root, app };
}
const flush = async () => { await nextTick(); await nextTick(); await nextTick(); };
const find = (el, type) => el.type === type ? el : el.children.map(child => find(child, type)).find(Boolean);

test('viewer updates language and wrap, and reports errors', async () => {
  const loaded = [], errors = [];
  const props = reactive({ source: 'const answer = 42;', fileName: 'a.js', wrap: false, onLoaded: doc => loaded.push(doc), onError: error => errors.push(error) });
  const { root, app } = mount(props);
  await flush();
  assert.match(find(root, 'code').props.innerHTML, /hljs-keyword/);
  props.fileName = 'a.txt';
  props.wrap = true;
  await flush();
  assert.equal(find(root, 'code').props.innerHTML, 'const answer = 42;');
  assert.equal(find(root, 'pre').props.style.whiteSpace, 'pre-wrap');
  props.source = new Uint8Array([0xff]);
  await flush();
  assert.equal(errors.length, 1);
  assert.equal(find(root, 'code'), undefined);
  assert.equal(find(root, 'p').props.role, 'alert');
  assert.equal(loaded.length, 2);
  app.unmount();
});

test('late file reads cannot replace the new file or emit after unmount', async () => {
  let resolve;
  class SlowBlob extends Blob { arrayBuffer() { return new Promise(done => { resolve = done; }); } }
  const loaded = [];
  const props = reactive({ source: new SlowBlob(['old']), onLoaded: doc => loaded.push(doc.text) });
  const { root, app } = mount(props);
  props.source = 'new';
  await flush();
  resolve(new TextEncoder().encode('old').buffer);
  await flush();
  assert.equal(find(root, 'code').props.innerHTML, 'new');
  assert.deepEqual(loaded, ['new']);
  props.source = new SlowBlob(['unmounted']);
  await nextTick();
  app.unmount();
  resolve(new TextEncoder().encode('unmounted').buffer);
  await flush();
  assert.deepEqual(loaded, ['new']);
});
