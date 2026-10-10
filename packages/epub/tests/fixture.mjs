import { strToU8, zipSync } from 'fflate';
import { JSDOM } from 'jsdom';

/** Give Node the DOM APIs the parser expects in a browser. */
export function installDom() {
	const { window } = new JSDOM('<!DOCTYPE html><html><body></body></html>');
	globalThis.DOMParser ??= window.DOMParser;
	return window;
}

// 1×1 transparent PNG.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), c => c.charCodeAt(0));

const chapter = (title, body) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN">
<head><title>${title}</title><link rel="stylesheet" type="text/css" href="../styles/book.css"/></head>
<body>${body}</body>
</html>`;

/** A small EPUB 3 book with nav, NCX, CSS, an image, a script and a footnote. */
export function buildEpub({ nav = true, ncx = true, layout } = {}) {
	const files = {
		mimetype: [strToU8('application/epub+zip'), { level: 0 }],
		'META-INF/container.xml': strToU8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
		'OEBPS/content.opf': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">urn:uuid:12345678-1234-1234-1234-123456789abc</dc:identifier>
<dc:title>测试之书</dc:title>
<dc:creator>张三</dc:creator>
<dc:creator>Jane Doe</dc:creator>
<dc:language>zh-CN</dc:language>
<dc:publisher>CubeOffice Press</dc:publisher>
${layout ? `<meta property="rendition:layout">${layout}</meta>` : ''}
<meta name="cover" content="cover-image"/>
</metadata>
<manifest>
${nav ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' : ''}
${ncx ? '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' : ''}
<item id="css" href="styles/book.css" media-type="text/css"/>
<item id="cover-image" href="images/cover.png" media-type="image/png"/>
<item id="c1" href="text/chapter%201.xhtml" media-type="application/xhtml+xml"/>
<item id="c2" href="text/chapter2.xhtml" media-type="application/xhtml+xml"/>
<item id="notes" href="text/notes.xhtml" media-type="application/xhtml+xml"/>
</manifest>
<spine${ncx ? ' toc="ncx"' : ''}>
<itemref idref="c1"/>
<itemref idref="c2"/>
<itemref idref="notes" linear="no"/>
</spine>
</package>`),
		'OEBPS/nav.xhtml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body>
<nav epub:type="landmarks"><ol><li><a href="text/chapter%201.xhtml">Start</a></li></ol></nav>
<nav epub:type="toc"><h1>目录</h1><ol>
<li><a href="text/chapter%201.xhtml">第一章 开始</a>
<ol><li><a href="text/chapter%201.xhtml#s2">第一节</a></li></ol></li>
<li><a href="text/chapter2.xhtml">第二章 继续</a></li>
</ol></nav>
</body></html>`),
		'OEBPS/toc.ncx': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<navMap>
<navPoint id="n1"><navLabel><text>NCX One</text></navLabel><content src="text/chapter%201.xhtml"/>
<navPoint id="n1a"><navLabel><text>NCX One A</text></navLabel><content src="text/chapter%201.xhtml#s2"/></navPoint>
</navPoint>
<navPoint id="n2"><navLabel><text>NCX Two</text></navLabel><content src="text/chapter2.xhtml"/></navPoint>
</navMap>
</ncx>`),
		'OEBPS/styles/book.css': strToU8(`@import url("extra.css");\nbody { color: #333; }\n.cover { background: url('../images/cover.png'); }`),
		'OEBPS/styles/extra.css': strToU8(`h1 { color: red; }`),
		'OEBPS/images/cover.png': PNG,
		'OEBPS/text/chapter 1.xhtml': strToU8(chapter('一', `
<h1>第一章 开始</h1>
<p onclick="alert(1)">春眠不觉晓，处处闻啼鸟。<a epub:type="noteref" href="notes.xhtml#n1">1</a></p>
<script>window.hacked = true;</script>
<p><img src="../images/cover.png" alt="cover"/></p>
<h2 id="s2">第一节</h2>
<p>夜来风雨声，花落知多少。鸟鸣山更幽。</p>
<p><a href="javascript:alert(1)">bad link</a> <a href="chapter2.xhtml#end">next</a></p>`)),
		'OEBPS/text/chapter2.xhtml': strToU8(chapter('二', `
<h1>第二章 继续</h1>
<p>Lorem ipsum dolor sit amet. 鸟 again, and BIRD in caps: Bird.</p>
<p id="end">The end &amp; more.</p>`)),
		'OEBPS/text/notes.xhtml': strToU8(chapter('注释', `
<aside epub:type="footnote" id="n1"><p><a href="chapter%201.xhtml">1</a> 孟浩然《春晓》。</p></aside>`)),
	};
	return zipSync(files);
}
