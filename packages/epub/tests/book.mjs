import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEpub, installDom } from './fixture.mjs';
import {
	openEpub, prepareChapter, searchBook, findOccurrence, serializeRange, resolveRange, resolvePath, EPUB_FORMAT_MANIFEST,
} from '../dist/index.js';
import { EpubResources } from '../dist/content.js';

installDom();

test('package metadata, spine and cover are read from the OPF', async () => {
	const book = await openEpub(buildEpub());
	assert.equal(book.metadata.title, '测试之书');
	assert.deepEqual(book.metadata.creators, ['张三', 'Jane Doe']);
	assert.equal(book.metadata.language, 'zh-CN');
	assert.equal(book.metadata.publisher, 'CubeOffice Press');
	assert.equal(book.metadata.identifier, 'urn:uuid:12345678-1234-1234-1234-123456789abc');
	assert.equal(book.layout, 'reflowable');
	assert.equal(book.direction, 'ltr');
	assert.equal(book.coverHref, 'OEBPS/images/cover.png');
	assert.deepEqual(book.spine.map(item => [item.href, item.linear]), [
		['OEBPS/text/chapter 1.xhtml', true],
		['OEBPS/text/chapter2.xhtml', true],
		['OEBPS/text/notes.xhtml', false],
	]);
	assert.ok(book.spine.every(item => item.size > 0));
	assert.equal(book.spineIndex('OEBPS/text/chapter2.xhtml'), 1);
	assert.equal(book.spineIndex('oebps/TEXT/chapter2.xhtml'), 1, 'archive lookups tolerate wrong case');
});

test('the EPUB 3 nav document wins over NCX and keeps nesting and fragments', async () => {
	const book = await openEpub(buildEpub());
	assert.deepEqual(book.toc.map(item => item.label), ['第一章 开始', '第二章 继续']);
	const [first] = book.toc;
	assert.equal(first.index, 0);
	assert.equal(first.children[0].label, '第一节');
	assert.equal(first.children[0].fragment, 's2');
	assert.equal(first.children[0].depth, 1);
});

test('NCX is the fallback table of contents, then the spine itself', async () => {
	const ncx = await openEpub(buildEpub({ nav: false }));
	assert.deepEqual(ncx.toc.map(item => item.label), ['NCX One', 'NCX Two']);
	assert.equal(ncx.toc[0].children[0].fragment, 's2');
	const bare = await openEpub(buildEpub({ nav: false, ncx: false }));
	assert.deepEqual(bare.toc.map(item => item.index), [0, 1]);
});

test('fixed-layout books are detected', async () => {
	const book = await openEpub(buildEpub({ layout: 'pre-paginated' }));
	assert.equal(book.layout, 'pre-paginated');
});

test('invalid input fails with a readable error', async () => {
	await assert.rejects(openEpub(new Uint8Array([1, 2, 3])), /not a valid EPUB/);
});

test('paths resolve relative to their document', () => {
	assert.equal(resolvePath('OEBPS/text/a.xhtml', '../images/b%20c.png#x'), 'OEBPS/images/b c.png');
	assert.equal(resolvePath('OEBPS/text/a.xhtml', 'd.xhtml'), 'OEBPS/text/d.xhtml');
	assert.equal(resolvePath('OEBPS/a.xhtml', ''), 'OEBPS/a.xhtml');
});

test('chapters lose active content and point resources at object URLs', async () => {
	const book = await openEpub(buildEpub());
	const resources = new EpubResources(book);
	const document = prepareChapter(book, book.spine[0], resources);
	assert.equal(document.querySelectorAll('script').length, 0);
	assert.equal(document.querySelector('[onclick]'), null);
	assert.equal(document.querySelector('a[href^="javascript"]'), null);
	assert.equal(document.querySelectorAll('link').length, 0, 'stylesheet links are inlined');
	const css = Array.from(document.querySelectorAll('style'), style => style.textContent).join('\n');
	assert.match(css, /h1 \{ color: red; \}/, '@import is inlined');
	assert.match(css, /url\("blob:/, 'CSS url() points at the archive');
	assert.match(document.querySelector('img').getAttribute('src'), /^blob:/);
	resources.dispose();
});

test('search finds matches case-insensitively and locates them again', async () => {
	const book = await openEpub(buildEpub());
	const results = [];
	for await (const result of searchBook(book, 'bird')) results.push(result);
	assert.deepEqual(results.map(result => [result.index, result.occurrence, result.match]), [[1, 0, 'BIRD'], [1, 1, 'Bird']]);
	const cjk = [];
	for await (const result of searchBook(book, '鸟')) cjk.push(result);
	assert.deepEqual(cjk.map(result => result.index), [0, 0, 1]);
	assert.match(cjk[0].before + cjk[0].match + cjk[0].after, /处处闻啼鸟/);
	const body = prepareChapter(book, book.spine[1]).body;
	const range = findOccurrence(body, 'bird', 1);
	assert.equal(range.toString(), 'Bird');
	assert.equal(findOccurrence(body, 'bird', 2), undefined);
});

test('search stops at the limit and honours abort', async () => {
	const book = await openEpub(buildEpub());
	const limited = [];
	for await (const result of searchBook(book, '鸟', { limit: 1 })) limited.push(result);
	assert.equal(limited.length, 1);
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(async () => { for await (const _ of searchBook(book, '鸟', { signal: controller.signal })) { /* empty */ } }, /abort/i);
});

test('ranges round-trip through serialized anchors', async () => {
	const book = await openEpub(buildEpub());
	const body = prepareChapter(book, book.spine[0]).body;
	const range = findOccurrence(body, '夜来风雨声', 0);
	const anchor = serializeRange(body, range);
	assert.match(anchor.start, /^[\d/]+:\d+$/);
	const again = prepareChapter(book, book.spine[0]).body;
	assert.equal(resolveRange(again, anchor.start, anchor.end).toString(), '夜来风雨声');
	assert.equal(resolveRange(again, '99/1:0', '99/1:2'), undefined);
});

test('format manifest describes a read-only viewer', () => {
	assert.deepEqual(EPUB_FORMAT_MANIFEST.extensions, ['epub']);
	assert.deepEqual(EPUB_FORMAT_MANIFEST.mimeTypes, ['application/epub+zip']);
	assert.equal(EPUB_FORMAT_MANIFEST.capabilities.edit, false);
});
