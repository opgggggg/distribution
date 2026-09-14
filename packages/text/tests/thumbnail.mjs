import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { generateTextThumbnail, renderTextThumbnail, registerTextPreview, captureTextPreview } from '../dist/thumbnail.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
const createElement = document.createElement.bind(document);
document.createElement = (name, ...args) => name === 'canvas' ? createCanvas(1, 1) : createElement(name, ...args);

test('Java thumbnail is a decodable JPEG with syntax colors and requested dimensions', async () => {
  const source = await readFile(new URL('./HelloCubeOffice.java', import.meta.url));
  const url = await generateTextThumbnail(new File([source], 'HelloCubeOffice.java'));
  assert.match(url, /^data:image\/jpeg;base64,/);
  const image = await loadImage(url);
  assert.equal(image.width, 480); assert.equal(image.height, 360);
  const canvas = createCanvas(480, 360), ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(43, 40, 420, 290).data;
  let dark = 0, red = 0, blue = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = pixels.slice(i, i + 3);
    if (r < 170 && g < 170 && b < 170) dark++;
    if (r > g * 1.4 && r > b * 1.2) red++;
    if (b > r * 1.4 && b > g * 1.1) blue++;
  }
  assert.ok(dark > 100, 'code is visible');
  assert.ok(red > 10, 'Java keywords are colored');
  assert.ok(blue > 10, 'Java strings are colored');
  const resized = await loadImage(renderTextThumbnail('hello', { width: 640, height: 480 }));
  assert.equal(resized.width, 640); assert.equal(resized.height, 480);
});

test('empty, unknown, huge lines and hostile HTML render safely; bad options and cancellation reject', async () => {
  for (const text of ['', 'plain text', '<img src=x onerror="globalThis.thumbnailInjected=true">', 'x'.repeat(1_000_000)]) {
    assert.match(renderTextThumbnail(text, { fileName: 'file.unknown' }), /^data:image\/jpeg;base64,/);
  }
  assert.equal(globalThis.thumbnailInjected, undefined);
  assert.throws(() => renderTextThumbnail('x', { width: 0 }), RangeError);
  assert.throws(() => renderTextThumbnail('x', { quality: NaN }), RangeError);
  await assert.rejects(generateTextThumbnail('x', { signal: AbortSignal.abort() }), { name: 'AbortError' });
});

test('host capture reads the registered model, including edits and renames', async () => {
  const surface = createElement('section');
  const host = createElement('div'); host.className = 'cubexp-text-editor__host'; surface.append(host); document.body.append(surface);
  let model = { text: 'public class Original {}', fileName: 'Original.java' };
  const remove = registerTextPreview(host, () => model);
  const original = await captureTextPreview(surface);
  host.textContent = 'scrolled or folded viewport';
  assert.equal(await captureTextPreview(surface), original);
  model = { text: 'public class Changed {}', fileName: 'Changed.java' };
  assert.notEqual(await captureTextPreview(surface), original);
  remove(); surface.remove();
  assert.equal(await captureTextPreview(surface), undefined);
});
