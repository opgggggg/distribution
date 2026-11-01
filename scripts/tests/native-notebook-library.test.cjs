const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { reactive, toRaw } = require('vue');
const vue = fs.readFileSync(path.join(__dirname, '../../apps/harmony/web/src/App.vue'), 'utf8');
const script = vue.slice(vue.indexOf('>') + 1, vue.indexOf('</script>'));
const ast = ts.createSourceFile('App.ts', script, ts.ScriptTarget.Latest, true);
const method = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'addDocument');
assert(method, 'exercise the actual document-opening entry point');
const compiled = ts.transpileModule(method.getText(ast) + '\nthis.openNote = addDocument;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText;
function harness(record, edit, notes) {
  const writes = [], acknowledgements = [];
  const context = {
    Blob, Date, toRaw, hasNativeNotebooks: () => true, restoreAutosaves: async () => {},
    autosaveHistory: { value: reactive(record ? [record] : []) }, getFileSource: () => undefined,
    require: name => { assert.equal(name, '@cubexp/notes'); return notes; },
    writeHarmonyAutosave: async value => {
      // IDB must be able to read every Blob while committing, including the original-file copy.
      if (value.originalBlob) await value.originalBlob.arrayBuffer();
      writes.push(structuredClone(value));
    },
    editNativeNotebook: edit, window: { auroraHarmonyHost: { ackNativeNotes: (...args) => acknowledgements.push(args) } },
    activeId: { value: 'home' }, HOME_TAB_ID: 'home',
  };
  vm.runInNewContext(compiled, context);
  return { context, writes, acknowledgements };
}
test('the actual iPad new-note entry writes an infinite board before opening native UI', async () => {
  const notes = await import('../../packages/notes/dist/index.js');
  const h = harness(undefined, async (blob, name, id, readonly) => {
    const notebook = await notes.readNotebook(new Uint8Array(await blob.arrayBuffer()));
    assert.equal(notebook.pages[0].infinite, true);
    assert.equal(readonly, false);
    assert.equal(h.writes.length, 1, 'new board must be persisted before native editing');
    return { blob, changed: false, digest: 'new' };
  }, notes);
  await h.context.openNote('notes', 'Board.cubenote', undefined, { autosaveId: 'new' });
  assert.equal(h.writes.length, 2);
  assert.equal((await notes.readNotebook(new Uint8Array(await h.writes[1].blob.arrayBuffer()))).pages[0].infinite, true);
});
test('existing native notebooks keep their library record until opening succeeds, including reactive provider references', async () => {
  const bytes = Uint8Array.from({length: 2 * 1024 * 1024 + 17}, (_, i) => i % 251);
  const record = { id: 'existing', format: 'notes', fileName: '旧画板.cubenote', blob: new Blob([bytes]), savedAt: 123,
    sourceRef: { id: 'provider', name: '旧画板.cubenote', writable: true }, favorite: true, isDraft: false, preview: 'old-preview' };
  const h = harness(record, async (blob, name, id, readonly) => {
    assert.equal(h.writes.length, 0, 'opening must not overwrite the record backing the input Blob');
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
    assert.equal(id, record.id); assert.equal(name, record.fileName); assert.equal(readonly, true);
    return { blob: new Blob(['edited archive with history']), changed: true, preview: 'new-preview', digest: 'saved-digest' };
  });
  const saved = h.context.autosaveHistory.value[0];
  await h.context.openNote('notes', saved.fileName, saved.blob, { autosaveId: saved.id, sourceRef: saved.sourceRef, favorite: true, isDraft: false });
  assert.equal(h.writes.length, 1);
  assert.equal(await h.writes[0].blob.text(), 'edited archive with history');
  assert.deepEqual(h.writes[0].sourceRef, record.sourceRef);
  assert.equal(h.writes[0].favorite, true);
  assert.deepEqual(h.acknowledgements, [['existing', 'saved-digest']]);
});
test('failed native opening never changes or acknowledges an existing archive', async () => {
  const record = { id: 'existing', format: 'notes', fileName: 'Drawing.cubenote', blob: new Blob(['original archive']), savedAt: 123 };
  const h = harness(record, async () => { throw new Error('open failed'); });
  await assert.rejects(h.context.openNote('notes', record.fileName, record.blob, { autosaveId: record.id }), /open failed/);
  assert.equal(h.writes.length, 0); assert.equal(h.acknowledgements.length, 0);
  assert.equal(await h.context.autosaveHistory.value[0].blob.text(), 'original archive');
});
test('provider-backed bytes are owned before native chunking and remain readable after the provider releases them', async () => {
  let released = false, reads = 0;
  class ProviderBlob extends Blob {
    async arrayBuffer() { reads++; if (released) throw new Error('provider released'); return super.arrayBuffer(); }
    slice() { if (released) throw new Error('provider released'); return super.slice(...arguments); }
  }
  const source = new ProviderBlob(['original archive and undo history']);
  const record = { id: 'existing', format: 'notes', fileName: 'Drawing.cubenote', blob: source, savedAt: 123 };
  const h = harness(record, async blob => {
    released = true;
    assert.equal(await blob.slice(0).text(), 'original archive and undo history');
    return { blob, changed: false, digest: 'same' };
  });
  await h.context.openNote('notes', record.fileName, source, { autosaveId: record.id });
  assert.equal(reads, 1); assert.equal(await h.writes[0].blob.text(), 'original archive and undo history');
  assert.equal(await h.writes[0].originalBlob.text(), 'original archive and undo history');
});
test('an older original-file baseline is also detached before the native editor releases storage handles', async () => {
  let released = false;
  class OriginalBlob extends Blob {
    async arrayBuffer() { if (released) throw new Error('old original handle released'); return super.arrayBuffer(); }
  }
  const record = { id: 'existing', format: 'notes', fileName: 'Drawing.cubenote', blob: new Blob(['current archive']), originalBlob: new OriginalBlob(['original baseline']), savedAt: 123 };
  const h = harness(record, async blob => {
    released = true;
    return { blob, changed: false, digest: 'same' };
  });
  await h.context.openNote('notes', record.fileName, record.blob, { autosaveId: record.id, originalBlob: record.originalBlob });
  assert.equal(await h.writes[0].blob.text(), 'current archive');
  assert.equal(await h.writes[0].originalBlob.text(), 'original baseline');
});
