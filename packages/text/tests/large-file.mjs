import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Text } from '@codemirror/state';
import { RangeTextBlob, readTextPage, readTextPrefix, EDITABLE_TEXT_MAX_BYTES, TEXT_PAGE_BYTES } from '../dist/large-file.js';
import { createTextBuffer } from '../dist/buffer.js';

function virtualFile(size) {
  const requests = [];
  const pattern = new TextEncoder().encode('Hello large file\n');
  const source = new RangeTextBlob(async (start, end) => {
    requests.push([start, end]);
    assert.ok(end - start <= TEXT_PAGE_BYTES + 4);
    return Uint8Array.from({ length: end - start }, (_, i) => pattern[(start + i) % pattern.length]);
  }, size);
  return { source, requests };
}

test('5 GiB files read only bounded ranges, including random access and thumbnails', async () => {
  const { source, requests } = virtualFile(5 * 1024 ** 3);
  const first = await readTextPage(source);
  assert.equal(first.start, 0); assert.equal(first.end, TEXT_PAGE_BYTES);
  const middle = await readTextPage(source, 3 * 1024 ** 3);
  assert.equal(middle.start, 3 * 1024 ** 3);
  const last = await readTextPage(source, source.size - 50);
  assert.equal(last.end, source.size);
  const prefix = await readTextPrefix(source);
  assert.ok(prefix.startsWith('Hello large file'));
  assert.ok(requests.reduce((n, [a,b]) => n+b-a, 0) < 500_000);
  await assert.rejects(source.arrayBuffer(), /bounded slices/);
  const stream = source.stream().getReader();
  const chunk = await stream.read();
  assert.equal(chunk.value.length, TEXT_PAGE_BYTES);
  await stream.cancel();
});

test('UTF-8 and UTF-16 page boundaries neither split nor lose Unicode characters', async () => {
  const text = '中文🙂ABC\r\n'.repeat(15) + '最后🙂';
  const utf8 = new TextEncoder().encode('\ufeff' + text);
  const sources = [new Blob([utf8])];
  for (const little of [true, false]) {
    const bytes = new Uint8Array(2 + text.length*2), view = new DataView(bytes.buffer);
    view.setUint16(0, 0xfeff, little);
    for (let i=0; i<text.length; i++) view.setUint16(2+i*2, text.charCodeAt(i), little);
    sources.push(new Blob([bytes]));
  }
  for (const source of sources) {
    let offset=0, actual='';
    while(offset < source.size) {
      const page = await readTextPage(source, offset, { pageBytes: 8 });
      assert.ok(page.end > offset); actual+=page.text; offset=page.end;
    }
    assert.equal(actual, text);
    const random = await readTextPage(source, 7, { pageBytes: 8 });
    assert.ok(!random.text.includes('\ufffd'));
  }
});

test('range validation, malformed bytes, cancellation and premature EOF fail clearly', async () => {
  const { source } = virtualFile(100);
  await assert.rejects(readTextPage(source, -1), RangeError);
  await assert.rejects(readTextPage(source, 0, { signal: AbortSignal.abort() }), { name: 'AbortError' });
  await assert.rejects(readTextPage(new Blob([new Uint8Array([255])])), TypeError);
  await assert.rejects(new RangeTextBlob(async () => new Uint8Array(), 100).arrayBuffer(), /incomplete/);
});

test('an explicit 32 MiB budget supports 12 MiB incremental editing and saving', async () => {
  const original = '0123456789abcdef\n'.repeat(Math.ceil(12*1024**2/17));
  const buffer = await createTextBuffer(new Blob([original]), { maxBytes: 32 * 1024 ** 2 });
  const doc = buffer.getDocument();
  buffer.getText = () => { throw new Error('Full document string materialized during incremental editing'); };
  const changed = doc.replace(100, 100, Text.of(['inserted']));
  buffer.setDocument(changed);
  assert.equal(buffer.getDocument(), changed);
  assert.equal(buffer.isDirty(), true);
  assert.ok(buffer.getPrefix(150).includes('inserted'));
  const exported = await buffer.saveFile();
  assert.equal(exported.size, original.length + 8);
  assert.equal(await exported.slice(100, 108).text(), 'inserted');
  assert.equal(buffer.isDirty(), false);
  buffer.setDocument(doc); assert.equal(buffer.isDirty(), true);
  await assert.rejects(createTextBuffer(virtualFile(EDITABLE_TEXT_MAX_BYTES+1).source), /editing budget/);
});

test('desktop adapter carries lazy sources and file sizes without modifying upstream sources', async () => {
  const { cubeOfficeLargeTextPlugin } = await import('../../../profiles/cubeoffice/desktop/large-text-plugin.mjs');
  const plugin = cubeOfficeLargeTextPlugin();
  for (const name of ['desktop-host.ts', 'App.vue']) {
    const path = fileURLToPath(new URL(`../../../als-office/apps/desktop/src/${name}`, import.meta.url));
    const transformed = plugin.transform(await readFile(path,'utf8'), path);
    assert.ok(transformed.code.includes(name === 'desktop-host.ts' ? 'await readLargeTextArtifact(path)' : 'next.source ??'));
    assert.throws(() => plugin.transform('incompatible upstream', path), /integration changed/);
  }
  assert.equal(plugin.transform('other file', '/unrelated.ts'), undefined);
});
